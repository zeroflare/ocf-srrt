package geoip

import (
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultRipeBaseURL      = "https://ipmap-api.ripe.net"
	defaultRipeTimeoutMS    = 800
	defaultRipeCacheTTLOK   = 24 * time.Hour
	defaultRipeCacheTTLMiss = 1 * time.Minute
	defaultRipeUserAgent    = "srtt-dns-analyzer/1.0"
)

// Provider 決定位置查詢的主要來源；失敗時若另一邊 enabled 仍會 fallback。
type Provider string

const (
	ProviderMaxMind Provider = "maxmind"
	ProviderRipe    Provider = "ripe"
)

// Config 集中管理 geoip 套件行為的設定，全部從環境變數載入。
//
// 設計決策：MaxMind 為預設位置來源，RIPE IPmap 保留為可切換的替代來源。
// 詳見 doc/ripe-ipmap-integration.md 與 doc/09_design_decisions.md。
type Config struct {
	Provider               Provider      // GEOIP_PROVIDER：maxmind（預設）或 ripe
	RipeEnabled            bool          // RIPE 是否可用（即使非 primary，也可作 fallback）
	RipeBaseURL            string
	RipeTimeout            time.Duration
	RipeCacheTTLOK         time.Duration
	RipeCacheTTLMiss       time.Duration
	RipeUserAgent          string
	MaxMindLocationEnabled bool // MaxMind City/Country 是否可用（即使非 primary，也可作 fallback）
	MaxMindASNEnabled      bool // 與位置查詢正交；RIPE 不提供 ASN
}

// LoadConfig 從環境變數讀取設定；缺值或格式錯誤一律退回預設值。
func LoadConfig() Config {
	return Config{
		Provider:               parseProvider(os.Getenv("GEOIP_PROVIDER"), ProviderMaxMind),
		RipeEnabled:            envBool("RIPE_IPMAP_ENABLED", true),
		RipeBaseURL:            envString("RIPE_IPMAP_BASE_URL", defaultRipeBaseURL),
		RipeTimeout:            time.Duration(envInt("RIPE_IPMAP_TIMEOUT_MS", defaultRipeTimeoutMS)) * time.Millisecond,
		RipeCacheTTLOK:         envDuration("RIPE_IPMAP_CACHE_TTL_OK", defaultRipeCacheTTLOK),
		RipeCacheTTLMiss:       envDuration("RIPE_IPMAP_CACHE_TTL_MISS", defaultRipeCacheTTLMiss),
		RipeUserAgent:          envString("RIPE_IPMAP_USER_AGENT", defaultRipeUserAgent),
		MaxMindLocationEnabled: envBool("MAXMIND_LOCATION_ENABLED", true),
		MaxMindASNEnabled:      envBool("MAXMIND_ASN_ENABLED", true),
	}
}

// parseProvider 接受不分大小寫的 "maxmind" / "ripe"；其他值退回 fallback。
func parseProvider(v string, fallback Provider) Provider {
	switch Provider(strings.ToLower(strings.TrimSpace(v))) {
	case ProviderMaxMind:
		return ProviderMaxMind
	case ProviderRipe:
		return ProviderRipe
	default:
		return fallback
	}
}

func envString(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return parsed
}

func envDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
