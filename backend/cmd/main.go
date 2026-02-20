package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"ocf-srrt/backend/internal/api"
	"ocf-srrt/backend/internal/auth"
	"ocf-srrt/backend/internal/buffer"
	"ocf-srrt/backend/internal/dns"
	"ocf-srrt/backend/internal/recognition"
	"ocf-srrt/backend/internal/traceroute"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	rulesPath := os.Getenv("RULES_PATH")
	if rulesPath == "" {
		rulesPath = "data/app.json"
	}
	recognition.LoadRules(rulesPath)

	startTime := time.Now()

	// 初始化 Token Store
	tokenStore := auth.NewTokenStore()

	// 註冊 session 移除回呼，同步清除 token
	buffer.SetOnSessionRemoved(tokenStore.RemoveByIP)

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
	mux.HandleFunc("/api/token", func(w http.ResponseWriter, r *http.Request) {
		clientIP := r.Header.Get("X-Forwarded-For")
		if clientIP == "" {
			var err error
			clientIP, _, err = net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				http.Error(w, "cannot determine client IP", http.StatusInternalServerError)
				return
			}
		} else {
			// X-Forwarded-For 可能包含多個 IP，取第一個（最原始的 client）
			if i := strings.Index(clientIP, ","); i != -1 {
				clientIP = strings.TrimSpace(clientIP[:i])
			}
		}

		token := tokenStore.GetOrCreateToken(clientIP)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"token": token,
		})
	})
	mux.HandleFunc("/api/traceroute", func(w http.ResponseWriter, r *http.Request) {
		target := r.URL.Query().Get("target")
		if target == "" {
			http.Error(w, "target is required", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()

		result, err := traceroute.Run(ctx, target)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
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
		Handler: mux,
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
