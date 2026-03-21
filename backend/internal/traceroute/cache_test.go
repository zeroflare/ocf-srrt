package traceroute

import (
	"sync"
	"testing"
	"time"
)

func TestCacheGetSet(t *testing.T) {
	c := NewCache(1 * time.Second)
	defer c.Stop()

	result := &TraceResult{Target: "example.com", Status: "completed"}
	c.Set("example.com", result)

	got, ok := c.Get("example.com")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if got.Target != "example.com" {
		t.Errorf("got Target = %q, want %q", got.Target, "example.com")
	}
}

func TestCacheNormalizesKey(t *testing.T) {
	c := NewCache(1 * time.Second)
	defer c.Stop()

	result := &TraceResult{Target: "Example.COM", Status: "completed"}
	c.Set("Example.COM", result)

	// 應能用不同大小寫取得
	got, ok := c.Get("example.com")
	if !ok {
		t.Fatal("expected cache hit with normalized key")
	}
	if got.Target != "Example.COM" {
		t.Errorf("got Target = %q, want %q", got.Target, "Example.COM")
	}
}

func TestCacheExpiry(t *testing.T) {
	c := NewCache(50 * time.Millisecond)
	defer c.Stop()

	c.Set("test", &TraceResult{Target: "test"})

	// 應立即命中
	if _, ok := c.Get("test"); !ok {
		t.Fatal("expected cache hit before expiry")
	}

	// 等待過期
	time.Sleep(100 * time.Millisecond)
	if _, ok := c.Get("test"); ok {
		t.Fatal("expected cache miss after expiry")
	}
}

func TestCacheMiss(t *testing.T) {
	c := NewCache(1 * time.Second)
	defer c.Stop()

	if _, ok := c.Get("nonexistent"); ok {
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
			target := "target"
			c.Set(target, &TraceResult{Target: target})
			c.Get(target)
		}(i)
	}
	wg.Wait()
}
