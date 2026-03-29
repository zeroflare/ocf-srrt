package ratelimit

import (
	"sync"
	"testing"
	"time"
)

func TestTokenLimiter_Allow(t *testing.T) {
	// 每秒最多 1 次，burst 1
	tl := &TokenLimiter{
		limiters: make(map[string]*entry),
		rate:     1,
		burst:    1,
	}

	// 第一次請求應通過
	if !tl.Allow("token-a") {
		t.Error("first request should be allowed")
	}
	// 立即第二次應被拒絕（burst 已耗盡）
	if tl.Allow("token-a") {
		t.Error("second immediate request should be denied")
	}
}

func TestTokenLimiter_DifferentTokens(t *testing.T) {
	tl := &TokenLimiter{
		limiters: make(map[string]*entry),
		rate:     1,
		burst:    1,
	}

	// 不同 token 各自獨立限制
	if !tl.Allow("token-a") {
		t.Error("token-a first request should be allowed")
	}
	if !tl.Allow("token-b") {
		t.Error("token-b first request should be allowed (independent)")
	}
}

func TestTokenLimiter_BurstAllowed(t *testing.T) {
	tl := &TokenLimiter{
		limiters: make(map[string]*entry),
		rate:     1,
		burst:    3,
	}

	// burst=3 允許前 3 次連續請求
	for i := 0; i < 3; i++ {
		if !tl.Allow("token-burst") {
			t.Errorf("request %d should be allowed (within burst)", i+1)
		}
	}
	// 第 4 次應被拒絕
	if tl.Allow("token-burst") {
		t.Error("request beyond burst should be denied")
	}
}

func TestTokenLimiter_Refill(t *testing.T) {
	// rate=10/s，burst=1 → 每 100ms 補充 1 個 token
	tl := &TokenLimiter{
		limiters: make(map[string]*entry),
		rate:     10,
		burst:    1,
	}

	if !tl.Allow("token-refill") {
		t.Error("first request should be allowed")
	}
	if tl.Allow("token-refill") {
		t.Error("immediate second should be denied")
	}
	// 等待補充
	time.Sleep(150 * time.Millisecond)
	if !tl.Allow("token-refill") {
		t.Error("request after refill should be allowed")
	}
}

func TestSemaphore_TryAcquireRelease(t *testing.T) {
	s := NewSemaphore(2)

	// 可以取得 2 個
	if !s.TryAcquire() {
		t.Error("first acquire should succeed")
	}
	if !s.TryAcquire() {
		t.Error("second acquire should succeed")
	}
	// 第 3 個應失敗
	if s.TryAcquire() {
		t.Error("third acquire should fail (capacity=2)")
	}

	// Release 後應可再取得
	s.Release()
	if !s.TryAcquire() {
		t.Error("acquire after release should succeed")
	}
}

func TestSemaphore_Concurrent(t *testing.T) {
	s := NewSemaphore(3)
	var mu sync.Mutex
	acquired := 0
	denied := 0
	var wg sync.WaitGroup

	// 同時 10 個 goroutine 嘗試取得
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if s.TryAcquire() {
				mu.Lock()
				acquired++
				mu.Unlock()
				// 模擬工作
				time.Sleep(50 * time.Millisecond)
				s.Release()
			} else {
				mu.Lock()
				denied++
				mu.Unlock()
			}
		}()
	}

	wg.Wait()

	if acquired == 0 {
		t.Error("at least some goroutines should acquire")
	}
	if denied == 0 {
		t.Error("some goroutines should be denied (only 3 slots)")
	}
	t.Logf("acquired=%d, denied=%d", acquired, denied)
}
