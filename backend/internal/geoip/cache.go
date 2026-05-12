package geoip

import (
	"time"

	gocache "github.com/patrickmn/go-cache"
)

// resolverCache 為 IP→GeoResult 提供 thread-safe 的 TTL 快取。
//
// 採 TTL-only 策略，不做 LRU：
//   - 24h 成功 TTL × ~10K 不重複 IP × 每筆 ~200B ≈ 2~3MB，記憶體上限可接受
//   - 失敗 TTL 設短（1m），讓 RIPE active engines lazy 觸發後能很快被重新查詢
//   - 底層 patrickmn/go-cache 已是專案既有依賴，不引入新套件
type resolverCache struct {
	inner *gocache.Cache
}

// newResolverCache 建立 cache。defaultTTL 影響 cleanup 排程，與每筆 Set 的 TTL 互不影響。
func newResolverCache(defaultTTL time.Duration) *resolverCache {
	cleanup := defaultTTL / 4
	if cleanup < time.Minute {
		cleanup = time.Minute
	}
	return &resolverCache{inner: gocache.New(defaultTTL, cleanup)}
}

// Get 取出 IP 對應的 GeoResult；不存在或型別不符視為 miss。
func (c *resolverCache) Get(ip string) (GeoResult, bool) {
	if c == nil {
		return GeoResult{}, false
	}
	if v, ok := c.inner.Get(ip); ok {
		if r, ok := v.(GeoResult); ok {
			return r, true
		}
	}
	return GeoResult{}, false
}

// Set 寫入 cache 並指定該筆的 TTL（成功用長 TTL、失敗用短 TTL）。
func (c *resolverCache) Set(ip string, result GeoResult, ttl time.Duration) {
	if c == nil {
		return
	}
	c.inner.Set(ip, result, ttl)
}
