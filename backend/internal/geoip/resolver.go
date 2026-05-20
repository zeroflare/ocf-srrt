package geoip

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"sync"
)

// resolver 負責將「位置查詢」與「ASN 查詢」串接成一致的 GeoResult。
//
// 流程：
//  1. 私有 / loopback / multicast → 跳過外部查詢，僅補 ASN
//  2. cache 命中 → 直接回
//  3. 主來源（cfg.Provider）查 → 成功則採用
//  4. 主來源失敗且另一邊 enabled → fallback
//  5. ASN 永遠由 MaxMind ASN DB 補（與位置查詢正交）
//  6. cache 結果（成功用長 TTL，失敗用短 TTL）
//
// 設計考量：
//   - resolver 不直接持有 MaxMind reader；透過 geoip.go 暴露的
//     applyMaxMindLocation / getMaxMindASN 函式呼叫，避免循環依賴
//   - ripeClient 為可注入欄位，方便單元測試
type resolver struct {
	cfg   Config
	ripe  *ripeClient
	cache *resolverCache
}

var (
	resolverOnce   sync.Once
	activeResolver *resolver
)

// newResolver 純建構，不接觸 ENV，方便測試注入。
func newResolver(cfg Config, ripe *ripeClient) *resolver {
	return &resolver{
		cfg:   cfg,
		ripe:  ripe,
		cache: newResolverCache(cfg.RipeCacheTTLOK),
	}
}

// ensureResolver 取得 / 初始化全域 resolver。後續所有 GetAll 共用。
func ensureResolver() *resolver {
	resolverOnce.Do(func() {
		cfg := LoadConfig()
		var ripe *ripeClient
		if cfg.RipeEnabled {
			ripe = newRipeClient(cfg.RipeBaseURL, cfg.RipeTimeout, cfg.RipeUserAgent)
		}
		activeResolver = newResolver(cfg, ripe)
		slog.Info("geoip resolver initialised",
			"component", "geoip",
			"provider", string(cfg.Provider),
			"ripeEnabled", cfg.RipeEnabled,
			"ripeBaseURL", cfg.RipeBaseURL,
			"ripeTimeout", cfg.RipeTimeout.String(),
			"maxmindLocationEnabled", cfg.MaxMindLocationEnabled,
			"maxmindAsnEnabled", cfg.MaxMindASNEnabled,
		)
	})
	return activeResolver
}

// resolve 是核心查詢路徑。所有公開 API 最終都會走到這裡。
func (r *resolver) resolve(ctx context.Context, ipStr string) (GeoResult, error) {
	parsed := net.ParseIP(ipStr)
	if parsed == nil {
		return GeoResult{}, &net.ParseError{Type: "IP address", Text: ipStr}
	}

	if isPrivateOrLoopback(parsed) {
		result := GeoResult{}
		r.applyASN(&result, ipStr)
		applyDefaults(&result)
		return result, nil
	}

	if cached, ok := r.cache.Get(ipStr); ok {
		return cached, nil
	}

	var (
		result  GeoResult
		located bool
	)

	primary, secondary := r.providerOrder()
	located = r.tryProvider(ctx, primary, &result, parsed, ipStr)
	if !located {
		located = r.tryProvider(ctx, secondary, &result, parsed, ipStr)
	}

	r.applyASN(&result, ipStr)
	applyDefaults(&result)

	ttl := r.cfg.RipeCacheTTLMiss
	if located {
		ttl = r.cfg.RipeCacheTTLOK
	}
	r.cache.Set(ipStr, result, ttl)
	return result, nil
}

// providerOrder 依設定回傳 (primary, secondary)。secondary 為空字串時不做 fallback。
func (r *resolver) providerOrder() (Provider, Provider) {
	switch r.cfg.Provider {
	case ProviderRipe:
		return ProviderRipe, ProviderMaxMind
	default:
		return ProviderMaxMind, ProviderRipe
	}
}

// tryProvider 嘗試指定來源；該來源未啟用時靜默回 false 讓上層走 fallback。
func (r *resolver) tryProvider(ctx context.Context, p Provider, result *GeoResult, parsed net.IP, ipStr string) bool {
	switch p {
	case ProviderMaxMind:
		if !r.cfg.MaxMindLocationEnabled {
			return false
		}
		return applyMaxMindLocation(result, parsed)
	case ProviderRipe:
		if r.ripe == nil {
			return false
		}
		loc, err := r.ripe.LocateBest(ctx, ipStr)
		switch {
		case err == nil:
			*result = ripeToGeoResult(loc)
			slog.Debug("geoip ripe hit",
				"component", "geoip-ripe",
				"ip", ipStr,
				"country", result.Country,
				"city", result.City,
				"score", loc.Location.Score,
			)
			return true
		case errors.Is(err, errRipeNoLocation):
			slog.Debug("geoip ripe miss",
				"component", "geoip-ripe", "ip", ipStr)
		default:
			slog.Warn("geoip ripe error",
				"component", "geoip-ripe", "ip", ipStr, "error", err)
		}
		return false
	default:
		return false
	}
}

// applyASN 在 GeoResult 上補 ASN 與 ISP；設定關閉或查詢失敗皆視為靜默 no-op。
//
// 順帶判定 IsAnycast：ASN 命中 anycastASNs 表示此 IP 屬於已知 anycast CDN，
// 用於下游 UI 區分「GeoIP 沒資料」與「天生就是 anycast，沒有具體國家」。
func (r *resolver) applyASN(result *GeoResult, ipStr string) {
	if !r.cfg.MaxMindASNEnabled {
		return
	}
	asn, isp, err := getMaxMindASN(ipStr)
	if err != nil || asn == 0 {
		return
	}
	result.ASN = asn
	result.ISP = isp
	if IsAnycastASN(asn) {
		result.IsAnycast = true
	}
}

// ripeToGeoResult 將 RIPE 回應映射成 GeoResult。
// 經緯度為 (0, 0) 視為無有效座標（與既有 MaxMind 行為一致）。
func ripeToGeoResult(r *ripeBestResponse) GeoResult {
	loc := r.Location
	result := GeoResult{
		Country:     loc.CountryCodeAlpha2,
		City:        loc.CityName,
		Subdivision: loc.StateName,
	}
	if !(loc.Latitude == 0 && loc.Longitude == 0) {
		result.Coords = []float64{loc.Longitude, loc.Latitude}
	}
	return result
}

func applyDefaults(result *GeoResult) {
	if result.Country == "" {
		result.Country = "XX"
	}
	if result.ISP == "" {
		result.ISP = "Unknown"
	}
}

// isPrivateOrLoopback 排除「外部 GeoIP 服務一定查不到」的位址。
func isPrivateOrLoopback(ip net.IP) bool {
	if ip == nil {
		return false
	}
	return ip.IsPrivate() ||
		ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() ||
		ip.IsMulticast()
}
