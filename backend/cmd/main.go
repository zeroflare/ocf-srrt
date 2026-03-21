package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"ocf-srrt/backend/internal/api"
	"ocf-srrt/backend/internal/auth"
	"ocf-srrt/backend/internal/buffer"
	"ocf-srrt/backend/internal/dns"
	"ocf-srrt/backend/internal/geoip"
	"ocf-srrt/backend/internal/ratelimit"
	"ocf-srrt/backend/internal/recognition"
	"ocf-srrt/backend/internal/traceroute"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// extractClientIP 從請求中取得真實 client IP。
// 只有當請求來自信任代理（TRUSTED_PROXIES 環境變數）時，才採用 X-Forwarded-For，
// 避免惡意客戶端偽造 header 取得他人的 token。
func extractClientIP(r *http.Request, trustedProxies map[string]bool) (string, error) {
	remoteIP, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return "", err
	}

	if len(trustedProxies) > 0 && trustedProxies[remoteIP] {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			// X-Forwarded-For 可能包含多個 IP，取第一個（最原始的 client）
			if i := strings.Index(xff, ","); i != -1 {
				xff = strings.TrimSpace(xff[:i])
			}
			return strings.TrimSpace(xff), nil
		}
	}
	return remoteIP, nil
}

// parseTrustedProxies 解析 TRUSTED_PROXIES 環境變數（逗號分隔的 IP 清單）
func parseTrustedProxies() map[string]bool {
	proxies := make(map[string]bool)
	env := os.Getenv("TRUSTED_PROXIES")
	if env == "" {
		return proxies
	}
	for _, p := range strings.Split(env, ",") {
		if ip := strings.TrimSpace(p); ip != "" {
			proxies[ip] = true
		}
	}
	return proxies
}

// detectPublicIP 嘗試自動偵測本機公網 IP。
// 依序嘗試多個 IP 查詢服務，任一成功即回傳。
func detectPublicIP() string {
	services := []string{
		"https://api.ipify.org",
		"https://icanhazip.com",
		"https://ifconfig.me/ip",
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client := &http.Client{}
	for _, url := range services {
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			continue
		}
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 64))
		resp.Body.Close()
		if err != nil {
			continue
		}
		ip := strings.TrimSpace(string(body))
		if net.ParseIP(ip) != nil {
			return ip
		}
	}
	return ""
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	rulesPath := os.Getenv("RULES_PATH")
	if rulesPath == "" {
		rulesPath = "data/app.json"
	}
	recognition.LoadRules(rulesPath)

	// 初始化 Traceroute 日誌記錄器
	// TRACEROUTE_LOG_ENABLED: "true"（預設）或 "false" 關閉
	// TRACEROUTE_LOG_PATH: 日誌檔路徑（預設 "traceroute.log"）
	traceLogEnabled := os.Getenv("TRACEROUTE_LOG_ENABLED") != "false"
	traceLogPath := os.Getenv("TRACEROUTE_LOG_PATH")
	if traceLogPath == "" {
		traceLogPath = "traceroute.log"
	}
	if err := traceroute.InitLogger(traceLogEnabled, traceLogPath); err != nil {
		slog.Warn("Failed to init traceroute logger", "component", "main", "error", err)
	}
	defer traceroute.CloseLogger()

	startTime := time.Now()

	trustedProxies := parseTrustedProxies()
	slog.Info("Trusted proxies loaded", "component", "main", "count", len(trustedProxies))

	// 初始化 Token Store
	tokenStore := auth.NewTokenStore()

	// 註冊 session 移除回呼，同步清除 token
	buffer.SetOnSessionRemoved(tokenStore.RemoveByIP)

	// 初始化 traceroute 速率限制（每 token 每 30 秒 1 次）與並發控制（最多 5 個同時執行）
	traceLimiter := ratelimit.NewTokenLimiter(30*time.Second, 1)
	traceSemaphore := ratelimit.NewSemaphore(5)

	// 初始化 traceroute 結果快取（TTL 5 分鐘）
	traceCache := traceroute.NewCache(5 * time.Minute)
	defer traceCache.Stop()

	// 初始化 WebSocket Hub
	hub := api.NewHub()
	go hub.Run()

	// 設定 DNS 伺服器
	dnsServer := dns.NewServer(hub.GetBroadcastChan(), tokenStore)
	go func() {
		slog.Info("Starting DNS server", "component", "main", "addr", ":53")
		if err := dnsServer.ListenAndServe(); err != nil {
			slog.Error("DNS server stopped", "component", "main", "error", err)
		}
	}()

	// 設定 HTTP handler
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		api.ServeWs(hub, tokenStore, w, r)
	})
	dnsPublicIP := os.Getenv("DNS_PUBLIC_IP")
	if dnsPublicIP == "" {
		slog.Info("DNS_PUBLIC_IP not set, attempting auto-detection", "component", "main")
		dnsPublicIP = detectPublicIP()
		if dnsPublicIP != "" {
			slog.Info("Auto-detected public IP", "component", "main", "ip", dnsPublicIP)
		} else {
			slog.Warn("Could not auto-detect public IP; hop 0 and DNS banner will be unavailable", "component", "main")
		}
	}
	localCountryOverride := os.Getenv("LOCAL_COUNTRY")

	mux.HandleFunc("/api/token", func(w http.ResponseWriter, r *http.Request) {
		clientIP, err := extractClientIP(r, trustedProxies)
		if err != nil {
			http.Error(w, "cannot determine client IP", http.StatusInternalServerError)
			return
		}

		token := tokenStore.GetOrCreateToken(clientIP)

		// 決定此用戶的 localCountry：env var 優先，否則 GeoIP 查 clientIP
		localCountry, ok := tokenStore.GetLocalCountry(clientIP)
		if !ok {
			if localCountryOverride != "" {
				localCountry = localCountryOverride
			} else {
				localCountry, _ = geoip.GetCountry(clientIP)
			}
			tokenStore.SetLocalCountry(clientIP, localCountry)
		}

		w.Header().Set("Content-Type", "application/json")
		resp := map[string]string{
			"token":        token,
			"ip":           clientIP,
			"localCountry": localCountry,
		}
		if dnsPublicIP != "" {
			resp["dnsIp"] = dnsPublicIP
		}
		json.NewEncoder(w).Encode(resp)
	})
	mux.Handle("/api/traceroute", &api.TracerouteHandler{
		TokenStore: tokenStore,
		Limiter:    traceLimiter,
		Semaphore:  traceSemaphore,
		Cache:      traceCache,
		LocalIP:    dnsPublicIP,
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "ok",
			"uptime":   time.Since(startTime).String(),
			"sessions": buffer.SessionCount(),
			"clients":  hub.ClientCount(),
		})
	})

	httpServer := &http.Server{
		Addr:    ":8080",
		Handler: api.CORSMiddleware(mux),
	}

	go func() {
		slog.Info("Starting HTTP server", "component", "main", "addr", ":8080")
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server stopped", "component", "main", "error", err)
		}
	}()

	// Graceful Shutdown: 等待中斷信號
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	slog.Info("Received shutdown signal", "component", "main", "signal", sig.String())

	// 1. 停止 DNS server (不再接受新請求)
	slog.Info("Shutting down DNS server", "component", "main")
	if err := dnsServer.Shutdown(); err != nil {
		slog.Error("DNS server shutdown error", "component", "main", "error", err)
	}

	// 2. 等待 enrichment goroutine 完成 (最多 5 秒)
	slog.Info("Waiting for enrichment goroutines", "component", "main")
	enrichDone := make(chan struct{})
	go func() {
		dnsServer.Wait()
		close(enrichDone)
	}()
	select {
	case <-enrichDone:
		slog.Info("All enrichment goroutines completed", "component", "main")
	case <-time.After(5 * time.Second):
		slog.Warn("Enrichment goroutines timed out", "component", "main", "timeout", "5s")
	}

	// 3. 關閉 WebSocket Hub
	slog.Info("Shutting down WebSocket hub", "component", "main")
	hub.Shutdown()

	// 4. 關閉 HTTP server (最多 5 秒)
	slog.Info("Shutting down HTTP server", "component", "main")
	httpCtx, httpCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer httpCancel()
	if err := httpServer.Shutdown(httpCtx); err != nil {
		slog.Error("HTTP server shutdown error", "component", "main", "error", err)
	}

	slog.Info("Server exited gracefully", "component", "main")
}
