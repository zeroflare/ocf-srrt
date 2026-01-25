package api

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"ocf-srrt/backend/internal/buffer" // 引入 buffer 套件以讀取歷史紀錄
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Client 是 WebSocket 連線的抽象
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

// Hub 管理所有 WebSocket 連線
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) Run() {
	for {
		select {
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
		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Broadcast(message []byte) {
	h.broadcast <- message
}

func (h *Hub) GetBroadcastChan() chan []byte {
	return h.broadcast
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

// ServeWs 處理 WebSocket 請求
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade failed:", err)
		return
	}

	// 建立 Client 物件
	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 512)}
	client.hub.register <- client

	// 1. 取得 Client IP (注意：若有經過 Nginx/Docker Proxy，這裡拿到的可能是內網 IP)
	// 若要精準，需讀取 X-Forwarded-For Header，但在 host mode 下 RemoteAddr 通常是準的
	clientIP, _, _ := net.SplitHostPort(r.RemoteAddr)

	// 2. 從 Ring Buffer 撈取該 IP 的歷史紀錄
	history := buffer.Get(clientIP)

	// 3. 如果有歷史資料，打包傳送
	if len(history) > 0 {
		// 定義一個簡單的結構來包裝 snapshot，方便前端區分這是「歷史」還是「即時」
		// 前端收到 type: "snapshot" 時，應直接取代目前的列表
		snapshotMsg := map[string]interface{}{
			"type": "snapshot",
			"data": history,
		}

		data, err := json.Marshal(snapshotMsg)
		if err == nil {
			// 直接塞入 send channel，讓 writePump 依序送出
			// 這樣做比直接 conn.WriteJSON 安全，避免併發寫入衝突
			client.send <- data
		} else {
			log.Println("Failed to marshal snapshot:", err)
		}
	}

	// 啟動寫入迴圈 (這會一直跑，直到連線斷開)
	go client.writePump()
}
