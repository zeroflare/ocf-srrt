package ratelimit

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// TokenLimiter 為每個 token 維護獨立的速率限制器
type TokenLimiter struct {
	mu       sync.Mutex
	limiters map[string]*entry
	rate     rate.Limit
	burst    int
}

type entry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewTokenLimiter 建立 per-token rate limiter
// interval: 每次請求的最小間隔時間；burst: 允許的突發請求數
func NewTokenLimiter(interval time.Duration, burst int) *TokenLimiter {
	tl := &TokenLimiter{
		limiters: make(map[string]*entry),
		rate:     rate.Every(interval),
		burst:    burst,
	}
	// 背景清理已過期的 limiter（5 分鐘未活動即移除）
	go tl.cleanup()
	return tl
}

// Allow 檢查指定 token 是否允許本次請求
func (tl *TokenLimiter) Allow(token string) bool {
	tl.mu.Lock()
	defer tl.mu.Unlock()

	e, ok := tl.limiters[token]
	if !ok {
		e = &entry{
			limiter: rate.NewLimiter(tl.rate, tl.burst),
		}
		tl.limiters[token] = e
	}
	e.lastSeen = time.Now()
	return e.limiter.Allow()
}

func (tl *TokenLimiter) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		tl.mu.Lock()
		cutoff := time.Now().Add(-5 * time.Minute)
		for k, e := range tl.limiters {
			if e.lastSeen.Before(cutoff) {
				delete(tl.limiters, k)
			}
		}
		tl.mu.Unlock()
	}
}

// Semaphore 限制同時執行的 mtr 數量
type Semaphore struct {
	ch chan struct{}
}

// NewSemaphore 建立指定容量的 semaphore
func NewSemaphore(max int) *Semaphore {
	return &Semaphore{ch: make(chan struct{}, max)}
}

// Acquire 嘗試取得 semaphore，回傳 false 表示已滿
func (s *Semaphore) TryAcquire() bool {
	select {
	case s.ch <- struct{}{}:
		return true
	default:
		return false
	}
}

// Release 釋放 semaphore
func (s *Semaphore) Release() {
	<-s.ch
}
