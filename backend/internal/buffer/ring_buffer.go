package buffer

import (
	"log"
	"sync"
	"sync/atomic"
	"time"
)

const (
	MaxLogs         = 5000             // 每個 Session 最多保留 5000 筆
	MaxSessions     = 2000             // Server 全域最大併發 Session 數
	IdleTimeout     = 10 * time.Minute // 閒置自動清理時間
	CleanupInterval = 1 * time.Minute  // 背景 GC 間隔
)

// SessionBuffer 優化：使用 Slice 替代 Linked List
type SessionBuffer struct {
	mu         sync.RWMutex  // 改用 RWMutex 優化讀取
	data       []interface{} // 預先分配的固定大小陣列
	writeIdx   int           // 目前寫入的位置
	isFull     bool          // 是否已經寫滿一圈
	lastActive int64         // 使用 UnixNano (Atomic)
}

// GlobalStore 儲存所有 Session
var GlobalStore = struct {
	mu       sync.RWMutex
	sessions map[string]*SessionBuffer
}{
	sessions: make(map[string]*SessionBuffer),
}

func init() {
	go func() {
		ticker := time.NewTicker(CleanupInterval)
		for range ticker.C {
			cleanupIdleSessions()
		}
	}()
}

func cleanupIdleSessions() {
	GlobalStore.mu.Lock()
	defer GlobalStore.mu.Unlock()

	now := time.Now().UnixNano()
	for ip, session := range GlobalStore.sessions {
		lastActive := atomic.LoadInt64(&session.lastActive)

		if time.Duration(now-lastActive) > IdleTimeout {
			log.Printf("[GC] Removing idle session: %s", ip)
			delete(GlobalStore.sessions, ip)
		}
	}
}

// Add 加入紀錄 (O(1) 效能，GC 友善)
func Add(sourceIp string, record interface{}) {
	// 1. 取得或建立 Session (讀寫分離優化)
	GlobalStore.mu.RLock()
	session, exists := GlobalStore.sessions[sourceIp]
	GlobalStore.mu.RUnlock()

	if !exists {
		GlobalStore.mu.Lock()
		// Double check locking
		session, exists = GlobalStore.sessions[sourceIp]
		if !exists {
			if len(GlobalStore.sessions) >= MaxSessions {
				log.Printf("[Warn] Max sessions reached (%d). Dropping data for %s", MaxSessions, sourceIp)
				GlobalStore.mu.Unlock()
				return
			}
			// 初始化 Slice Ring Buffer
			session = &SessionBuffer{
				data: make([]interface{}, MaxLogs),
			}
			// 初始化時間
			atomic.StoreInt64(&session.lastActive, time.Now().UnixNano())
			GlobalStore.sessions[sourceIp] = session
		}
		GlobalStore.mu.Unlock()
	}

	// 2. 寫入資料
	session.mu.Lock()
	defer session.mu.Unlock()

	// Atomic 更新時間
	atomic.StoreInt64(&session.lastActive, time.Now().UnixNano())

	session.data[session.writeIdx] = record
	session.writeIdx++

	// 環狀邏輯：如果到底了，回到開頭
	if session.writeIdx >= MaxLogs {
		session.writeIdx = 0
		session.isFull = true
	}
}

// Get 取出資料 (會自動排序：舊 -> 新)
func Get(sourceIp string) []interface{} {
	GlobalStore.mu.RLock()
	session, exists := GlobalStore.sessions[sourceIp]
	GlobalStore.mu.RUnlock()

	if !exists {
		return nil
	}

	session.mu.RLock()
	defer session.mu.RUnlock()

	// 組合資料：因為是 Ring，所以要分兩段複製
	// 情境 A: 還沒滿 [A, B, C, nil, nil], writeIdx = 3 -> 回傳 [A, B, C]
	// 情境 B: 滿了 [F, G, C, D, E], writeIdx = 2 (指向 C) -> 回傳 [C, D, E, F, G]

	size := session.writeIdx
	if session.isFull {
		size = MaxLogs
	}

	result := make([]interface{}, 0, size)

	if !session.isFull {
		// 還沒滿，直接取 0 到 writeIdx
		result = append(result, session.data[:session.writeIdx]...)
	} else {
		// 滿了，先取後半段 (舊資料)，再取前半段 (新資料)
		// Part 1: writeIdx 到 結尾
		result = append(result, session.data[session.writeIdx:]...)
		// Part 2: 開頭 到 writeIdx
		result = append(result, session.data[:session.writeIdx]...)
	}

	return result
}
