package api

import (
	"context"
	"encoding/json"
	"errors"
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
	TokenStore   *auth.TokenStore
	Limiter      *ratelimit.TokenLimiter
	Semaphore    *ratelimit.Semaphore
	Cache        *traceroute.Cache
	LocalIP      string // DNS 公網 IP，用於 Hop 0
	LocalCountry string // 預設境內國家（LOCAL_COUNTRY），可被 token 綁定值覆寫
}

func (h *TracerouteHandler) resolveLocalCountry(clientIP string) string {
	if clientIP != "" {
		if lc, ok := h.TokenStore.GetLocalCountry(clientIP); ok && lc != "" {
			return lc
		}
	}
	return h.LocalCountry
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
	clientIP, ok := h.TokenStore.ValidateToken(token)
	if !ok {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	localCountry := h.resolveLocalCountry(clientIP)

	target := r.URL.Query().Get("target")
	if target == "" {
		http.Error(w, "target is required", http.StatusBadRequest)
		return
	}

	// 解析 mode/port 參數（預設 TCP 443）
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "tcp"
	}
	port := r.URL.Query().Get("port")
	if port == "" {
		port = "443"
	}

	cacheKey := traceroute.CacheKey(target, mode, port)

	// 查詢快取（快取命中時跳過速率限制，避免誤觸 429）
	if cached, ok := h.Cache.Get(cacheKey); ok {
		cachedCopy := *cached
		cachedCopy.Cached = true
		w.Header().Set("Content-Type", "application/json")
		err := json.NewEncoder(w).Encode(cachedCopy)
		if err != nil {
			return
		}
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

	opts := traceroute.RunOptions{Mode: mode, Port: port, LocalCountry: localCountry}
	result, err := traceroute.Run(ctx, target, h.LocalIP, opts)
	if err != nil {
		if errors.Is(err, traceroute.ErrIPv6NotSupported) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		slog.Error("traceroute failed", "component", "traceroute", "target", target, "mode", mode, "port", port, "error", err)
		http.Error(w, "traceroute execution failed", http.StatusInternalServerError)
		return
	}

	// 僅對完整結果寫入快取（timeout/error 不快取，允許重試）
	if result.Status == "completed" {
		h.Cache.Set(cacheKey, result)
	}
	traceroute.LogResult(result)

	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(result)
	if err != nil {
		return
	}
}
