package traceroute

import (
	"sync"
	"testing"
	"time"
)

func TestCacheGetSet(t *testing.T) {
	c := NewCache(1 * time.Second)
	defer c.Stop()

	key := CacheKey("example.com", "tcp", "443")
	result := &TraceResult{Target: "example.com", Status: "completed"}
	c.Set(key, result)

	got, ok := c.Get(key)
	if !ok {
		t.Fatal("expected cache hit")
	}
	if got.Target != "example.com" {
		t.Errorf("got Target = %q, want %q", got.Target, "example.com")
	}
}

func TestCacheKeyNormalization(t *testing.T) {
	// CacheKey 應將 target 轉為小寫
	k1 := CacheKey("Example.COM", "tcp", "443")
	k2 := CacheKey("example.com", "tcp", "443")
	if k1 != k2 {
		t.Errorf("CacheKey not normalized: %q != %q", k1, k2)
	}

	// 不同 mode 應產生不同 key
	k3 := CacheKey("example.com", "icmp", "")
	if k2 == k3 {
		t.Errorf("CacheKey should differ for different modes: %q == %q", k2, k3)
	}
}

func TestCacheKeyWithModePort(t *testing.T) {
	c := NewCache(1 * time.Second)
	defer c.Stop()

	result := &TraceResult{Target: "Example.COM", Status: "completed"}
	c.Set(CacheKey("Example.COM", "tcp", "443"), result)

	// 應能用正規化後的 key 取得
	got, ok := c.Get(CacheKey("example.com", "tcp", "443"))
	if !ok {
		t.Fatal("expected cache hit with normalized key")
	}
	if got.Target != "Example.COM" {
		t.Errorf("got Target = %q, want %q", got.Target, "Example.COM")
	}

	// ICMP 模式不應命中 TCP 快取
	_, ok = c.Get(CacheKey("example.com", "icmp", ""))
	if ok {
		t.Fatal("expected cache miss for different mode")
	}
}

func TestCacheExpiry(t *testing.T) {
	c := NewCache(50 * time.Millisecond)
	defer c.Stop()

	key := CacheKey("test", "tcp", "443")
	c.Set(key, &TraceResult{Target: "test"})

	// 應立即命中
	if _, ok := c.Get(key); !ok {
		t.Fatal("expected cache hit before expiry")
	}

	// 等待過期
	time.Sleep(100 * time.Millisecond)
	if _, ok := c.Get(key); ok {
		t.Fatal("expected cache miss after expiry")
	}
}

func TestCacheMiss(t *testing.T) {
	c := NewCache(1 * time.Second)
	defer c.Stop()

	if _, ok := c.Get("nonexistent:tcp:443"); ok {
		t.Fatal("expected cache miss for nonexistent key")
	}
}

func TestCacheConcurrentAccess(t *testing.T) {
	c := NewCache(1 * time.Second)
	defer c.Stop()

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := CacheKey("target", "tcp", "443")
			c.Set(key, &TraceResult{Target: "target"})
			c.Get(key)
		}(i)
	}
	wg.Wait()
}
