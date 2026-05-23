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
	"time"

	"github.com/gorilla/websocket"
)

const (
	// 心跳間隔：每 30 秒發一次 ping
	pingInterval = 30 * time.Second
	// 讀取超時：若超過 60 秒沒收到任何訊息（含 pong），視為斷線
	pongWait = 60 * time.Second
	// 寫入超時：單次 write 的最大等待時間
	writeWait = 10 * time.Second
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

// subscribeMsg 前端發送的訂閱訊息，用於切換監控目標 IP
type subscribeMsg struct {
	Type  string `json:"type"`
	IP    string `json:"ip"`
	Fresh bool   `json:"fresh"` // true：不送歷史 snapshot，從按下「開始」起算
}

// Client 是 WebSocket 連線的抽象
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	clientIP string // 目前訂閱的 IP（初始為 token 對應的 IP，可透過 subscribe 切換）
	mu       sync.Mutex
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
			// 第一階段：RLock 只做 send，收集需要踢除的 client
			var toRemove []*Client
			h.mu.RLock()
			for client := range h.clients {
				client.mu.Lock()
				subscribedIP := client.clientIP
				client.mu.Unlock()
				if subscribedIP != msg.SourceIP {
					continue
				}
				select {
				case client.send <- msg.Data:
				default:
					// channel 滿，標記為待移除，不在 RLock 下做 map 寫入
					toRemove = append(toRemove, client)
				}
			}
			h.mu.RUnlock()

			// 第二階段：Lock 批次清理滿 channel 的 client
			if len(toRemove) > 0 {
				h.mu.Lock()
				for _, client := range toRemove {
					if _, ok := h.clients[client]; ok {
						close(client.send)
						delete(h.clients, client)
					}
				}
				h.mu.Unlock()
			}
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

// sendSnapshot 從 Ring Buffer 撈取指定 IP 的歷史紀錄並發送 snapshot
func (c *Client) sendSnapshot(ip string) {
	history := buffer.Get(ip)
	if len(history) == 0 {
		// 即使沒有歷史紀錄，也發送空 snapshot 讓前端知道訂閱已生效
		history = []interface{}{}
	}

	snapshotMsg := map[string]interface{}{
		"type": "snapshot",
		"data": history,
	}

	data, err := json.Marshal(snapshotMsg)
	if err != nil {
		slog.Error("Failed to marshal snapshot", "component", "ws", "error", err, "ip", ip)
		return
	}

	select {
	case c.send <- data:
		slog.Info("Snapshot sent", "component", "ws", "ip", ip, "records", len(history))
	default:
		slog.Warn("Snapshot dropped, send channel full", "component", "ws", "ip", ip)
	}
}

// readPump 監聽前端訊息（subscribe 切換監控 IP）
// 同時負責 pong 超時偵測：若超過 pongWait 沒收到任何訊息，視為斷線
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	// 設定讀取超時：每次收到 pong 時重設
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Warn("WebSocket read error", "component", "ws", "error", err)
			}
			return
		}

		var msg subscribeMsg
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		if msg.Type == "subscribe" && msg.IP != "" {
			newIP := auth.CanonicalizeIP(msg.IP)
			c.mu.Lock()
			oldIP := c.clientIP
			c.clientIP = newIP
			c.mu.Unlock()

			slog.Info("Client subscribed to new IP", "component", "ws", "oldIp", oldIP, "newIp", newIP, "fresh", msg.Fresh)

			// 切換後發送歷史 snapshot（使用者按下「開始」且 fresh=true 時略過）
			if !msg.Fresh {
				c.sendSnapshot(newIP)
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingInterval)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			// 定時發送 ping，保持連線活躍並偵測斷線
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
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
	client.sendSnapshot(clientIP)

	go client.writePump()
	go client.readPump() // 監聽前端 subscribe 訊息
}
