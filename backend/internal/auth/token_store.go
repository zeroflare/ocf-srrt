package auth

import (
	"net"
	"sync"

	"github.com/google/uuid"
)

// CanonicalizeIP 正規化 IP 字串：
//   - IPv4-mapped IPv6（::ffff:10.0.0.1）→ 轉為 IPv4（10.0.0.1）
//   - IPv6 壓縮/展開不一致 → 統一為 net.IP.String() 標準格式
//   - 無效字串原樣回傳
func CanonicalizeIP(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ip
	}
	// To4() 會把 IPv4-mapped IPv6 轉為 IPv4
	if v4 := parsed.To4(); v4 != nil {
		return v4.String()
	}
	return parsed.String()
}

// TokenStore 管理 Token ↔ IP 的雙向映射，純記憶體儲存
type TokenStore struct {
	mu             sync.RWMutex
	byToken        map[string]string // token → IP
	byIP           map[string]string // IP → token
	localCountryBy map[string]string // IP → localCountry
}

func NewTokenStore() *TokenStore {
	return &TokenStore{
		byToken:        make(map[string]string),
		byIP:           make(map[string]string),
		localCountryBy: make(map[string]string),
	}
}

// GetOrCreateToken 冪等地為 IP 取得或建立 token（自動正規化 IP）
func (ts *TokenStore) GetOrCreateToken(ip string) string {
	ip = CanonicalizeIP(ip)
	ts.mu.RLock()
	if token, ok := ts.byIP[ip]; ok {
		ts.mu.RUnlock()
		return token
	}
	ts.mu.RUnlock()

	ts.mu.Lock()
	defer ts.mu.Unlock()

	// Double check
	if token, ok := ts.byIP[ip]; ok {
		return token
	}

	token := uuid.New().String()
	ts.byToken[token] = ip
	ts.byIP[ip] = token
	return token
}

// ValidateToken 驗證 token 並回傳對應的 IP
func (ts *TokenStore) ValidateToken(token string) (ip string, ok bool) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	ip, ok = ts.byToken[token]
	return
}

// SetLocalCountry 設定指定 IP 的本地國家代碼
func (ts *TokenStore) SetLocalCountry(ip, country string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.localCountryBy[ip] = country
}

// GetLocalCountry 取得指定 IP 的本地國家代碼
func (ts *TokenStore) GetLocalCountry(ip string) (string, bool) {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	country, ok := ts.localCountryBy[ip]
	return country, ok
}

// RemoveByIP 當 session 過期時同步清除 token
func (ts *TokenStore) RemoveByIP(ip string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()

	if token, ok := ts.byIP[ip]; ok {
		delete(ts.byToken, token)
		delete(ts.byIP, ip)
	}
	delete(ts.localCountryBy, ip)
}
