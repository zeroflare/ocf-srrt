package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"ocf-srrt/backend/internal/auth"
	"ocf-srrt/backend/internal/buffer"
	"os"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

var allowedOrigins []string

func init() {
	if env := os.Getenv("ALLOWED_ORIGINS"); env != "" {
		for _, o := range strings.Split(env, ",") {
			allowedOrigins = append(allowedOrigins, strings.TrimSpace(o))
		}
	}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		if len(allowedOrigins) == 0 {
			return true
		}
		origin := r.Header.Get("Origin")
		for _, allowed := range allowedOrigins {
			if origin == allowed {
				return true
			}
		}
		slog.Warn("WebSocket origin rejected", "component", "ws", "origin", origin)
		return false
	},
}

// BroadcastMessage 攜帶來源 IP 以供 Hub 過濾
type BroadcastMessage struct {
	SourceIP string
	Data     []byte
}

// Client 是 WebSocket 連線的抽象
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	clientIP string // token 對應的 IP
}

// Hub 管理所有 WebSocket 連線
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan BroadcastMessage
	register   chan *Client
	unregister chan *Client
	done       chan struct{}
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan BroadcastMessage),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		done:       make(chan struct{}),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case <-h.done:
			h.mu.Lock()
			for client := range h.clients {
				client.conn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutting down"))
				close(client.send)
				delete(h.clients, client)
			}
			h.mu.Unlock()
			return
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		case msg := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				if client.clientIP != msg.SourceIP {
					continue
				}
				select {
				case client.send <- msg.Data:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Shutdown 優雅地關閉 Hub
func (h *Hub) Shutdown() {
	close(h.done)
}

func (h *Hub) GetBroadcastChan() chan BroadcastMessage {
	return h.broadcast
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (c *Client) writePump() {
	defer func() {
		err := c.conn.Close()
		if err != nil {
			return
		}
	}()
	for {
		message, ok := <-c.send
		if !ok {
			err := c.conn.WriteMessage(websocket.CloseMessage, []byte{})
			if err != nil {
				return
			}
			return
		}
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

// ServeWs 處理 WebSocket 請求，需驗證 token
func ServeWs(hub *Hub, tokenStore *auth.TokenStore, w http.ResponseWriter, r *http.Request) {
	// 驗證 token
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	clientIP, ok := tokenStore.ValidateToken(token)
	if !ok {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WebSocket upgrade failed", "component", "ws", "error", err)
		return
	}

	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 512), clientIP: clientIP}
	client.hub.register <- client

	slog.Info("New WebSocket connection", "component", "ws", "clientIp", clientIP)

	// 從 Ring Buffer 撈取該 IP 的歷史紀錄
	history := buffer.Get(clientIP)

	if len(history) > 0 {
		snapshotMsg := map[string]interface{}{
			"type": "snapshot",
			"data": history,
		}

		data, err := json.Marshal(snapshotMsg)
		if err == nil {
			client.send <- data
		} else {
			slog.Error("Failed to marshal snapshot", "component", "ws", "error", err)
		}
	}

	go client.writePump()
}
