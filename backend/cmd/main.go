package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"ocf-srrt/backend/internal/api"
	"ocf-srrt/backend/internal/dns"
	"ocf-srrt/backend/internal/recognition"
	"ocf-srrt/backend/internal/traceroute"
	"os"
	"time"
)

func main() {
	rulesPath := os.Getenv("RULES_PATH")
	if rulesPath == "" {
		rulesPath = "data/app.json"
	}
	recognition.LoadRules(rulesPath)

	// 初始化 WebSocket Hub
	hub := api.NewHub()
	go hub.Run()

	// 設定 DNS 伺服器
	// 監聽 UDP :53
	// 將 hub 的 broadcast channel 傳入
	dnsServer := dns.NewServer(hub.GetBroadcastChan())
	go func() {
		log.Println("Starting DNS server on :53")
		if err := dnsServer.ListenAndServe(); err != nil {
			log.Fatalf("Failed to start DNS server: %v", err)
		}
	}()

	// 設定 WebSocket API 端點
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		api.ServeWs(hub, w, r)
	})

	// 設定 Traceroute API 端點
	http.HandleFunc("/api/traceroute", func(w http.ResponseWriter, r *http.Request) {
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

	// 啟動 HTTP 伺服器
	log.Println("Starting WebSocket server on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Failed to start WebSocket server: %v", err)
	}
}
