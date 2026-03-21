package traceroute

import (
	"strings"
	"sync"
	"time"
)

// CacheEntry 快取中的單筆記錄
type CacheEntry struct {
	Result    *TraceResult
	ExpiresAt time.Time
}

// Cache 提供 thread-safe 的 traceroute 結果快取
type Cache struct {
	mu      sync.RWMutex
	entries map[string]*CacheEntry
	ttl     time.Duration
	stopCh  chan struct{}
}

// NewCache 建立快取，ttl 為存活時間
func NewCache(ttl time.Duration) *Cache {
	c := &Cache{
		entries: make(map[string]*CacheEntry),
		ttl:     ttl,
		stopCh:  make(chan struct{}),
	}
	go c.cleanup()
	return c
}

// Get 取得快取結果，若不存在或已過期回傳 nil, false
func (c *Cache) Get(target string) (*TraceResult, bool) {
	key := strings.ToLower(target)
	c.mu.RLock()
	defer c.mu.RUnlock()

	e, ok := c.entries[key]
	if !ok || time.Now().After(e.ExpiresAt) {
		return nil, false
	}
	return e.Result, true
}

// Set 寫入快取
func (c *Cache) Set(target string, result *TraceResult) {
	key := strings.ToLower(target)
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = &CacheEntry{
		Result:    result,
		ExpiresAt: time.Now().Add(c.ttl),
	}
}

// cleanup 定期清除過期項目
func (c *Cache) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			c.mu.Lock()
			now := time.Now()
			for k, e := range c.entries {
				if now.After(e.ExpiresAt) {
					delete(c.entries, k)
				}
			}
			c.mu.Unlock()
		case <-c.stopCh:
			return
		}
	}
}

// Stop 停止背景清理 goroutine
func (c *Cache) Stop() {
	close(c.stopCh)
}
