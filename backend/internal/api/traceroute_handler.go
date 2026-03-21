package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"ocf-srrt/backend/internal/auth"
	"ocf-srrt/backend/internal/ratelimit"
	"ocf-srrt/backend/internal/traceroute"
	"strings"
	"time"
)

// TracerouteHandler 封裝 traceroute API 的依賴
type TracerouteHandler struct {
	TokenStore *auth.TokenStore
	Limiter    *ratelimit.TokenLimiter
	Semaphore  *ratelimit.Semaphore
	Cache      *traceroute.Cache
	LocalIP    string // DNS 公網 IP，用於 Hop 0
}

func (h *TracerouteHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 限制只允許 GET 方法
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 驗證 token：優先讀取 Authorization header，向後相容 query string
	token := ""
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		token = strings.TrimPrefix(auth, "Bearer ")
	}
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}
	if _, ok := h.TokenStore.ValidateToken(token); !ok {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	target := r.URL.Query().Get("target")
	if target == "" {
		http.Error(w, "target is required", http.StatusBadRequest)
		return
	}

	// 查詢快取（快取命中時跳過速率限制，避免誤觸 429）
	if cached, ok := h.Cache.Get(target); ok {
		cachedCopy := *cached
		cachedCopy.Cached = true
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cachedCopy)
		return
	}

	// Per-token 速率限制（僅對實際執行 mtr 的請求計數）
	// TODO: POC demo 暫時停用 rate limit，上線前請恢復
	// if !h.Limiter.Allow(token) {
	// 	http.Error(w, "rate limit exceeded, please wait before retrying", http.StatusTooManyRequests)
	// 	return
	// }

	// 全域並發控制：限制同時執行的 mtr 數量
	if !h.Semaphore.TryAcquire() {
		http.Error(w, "server busy, please try again later", http.StatusServiceUnavailable)
		return
	}
	defer h.Semaphore.Release()

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	result, err := traceroute.Run(ctx, target, h.LocalIP)
	if err != nil {
		slog.Error("traceroute failed", "component", "traceroute", "target", target, "error", err)
		http.Error(w, "traceroute execution failed", http.StatusInternalServerError)
		return
	}

	// 寫入快取與日誌
	h.Cache.Set(target, result)
	traceroute.LogResult(result)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
