package dns

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"net"
	"ocf-srrt/backend/internal/api"
	"ocf-srrt/backend/internal/auth"
	"ocf-srrt/backend/internal/buffer"
	"ocf-srrt/backend/internal/geoip"
	"ocf-srrt/backend/internal/recognition"
	"ocf-srrt/backend/internal/types"
	"os"
	"sync"
	"time"

	probing "github.com/go-ping/ping"
	"github.com/miekg/dns"
	"github.com/patrickmn/go-cache"
	"golang.org/x/time/rate"
)

// Server 定義了 DNS 伺服器結構
type Server struct {
	*dns.Server
	broadcast  chan api.BroadcastMessage
	tokenStore *auth.TokenStore
	limiters   *cache.Cache
	dnsClient  *dns.Client
	upstreams  []string
	wg         sync.WaitGroup
}

// NewServer 建立一個新的 DNS 伺服器實例
func NewServer(broadcast chan api.BroadcastMessage, tokenStore *auth.TokenStore) *Server {
	upstreams := []string{
		"1.1.1.1:53",
		"8.8.8.8:53",
		"1.0.0.1:53",
		"8.8.4.4:53",
	}

	s := &Server{
		Server:     &dns.Server{Addr: ":53", Net: "udp"},
		broadcast:  broadcast,
		tokenStore: tokenStore,
		// 參數 1 (DefaultExpiration): 10 分鐘。如果 IP 10 分鐘沒活動，Rate Limiter 就會被刪除。
		// 參數 2 (CleanupInterval): 15 分鐘。每 15 分鐘背景掃描一次過期資料。
		limiters: cache.New(10*time.Minute, 15*time.Minute),
		dnsClient: &dns.Client{
			Timeout: 2 * time.Second,
		},
		upstreams: upstreams,
	}
	s.Handler = s
	return s
}

// ServeDNS 是 DNS 請求的處理函式
func (s *Server) ServeDNS(w dns.ResponseWriter, r *dns.Msg) {
	// 1. 異常防護
	if len(r.Question) == 0 {
		return
	}

	sourceIp, _, _ := net.SplitHostPort(w.RemoteAddr().String())
	slog.Debug("DNS request received", "component", "dns", "sourceIp", sourceIp, "domain", r.Question[0].Name)

	// 自動為新 IP 建立 token
	s.tokenStore.GetOrCreateToken(sourceIp)

	// 2. Rate Limiting
	limiter := s.getLimiter(sourceIp)

	if !limiter.Allow() {
		// 被限流時，建議不回覆或回覆 Refused，這裡選擇直接 Drop (Silent Drop)
		return
	}

	// 3. 隨機挑選上游 (簡單負載平衡)
	target := s.upstreams[rand.Intn(len(s.upstreams))]

	resp, _, err := s.dnsClient.Exchange(r, target)
	if err != nil {
		// 簡單的 Failover 機制
		backupTarget := s.upstreams[(rand.Intn(len(s.upstreams))+1)%len(s.upstreams)]
		resp, _, err = s.dnsClient.Exchange(r, backupTarget)
		if err != nil {
			slog.Error("Upstream forward failed", "component", "dns", "error", err)
			m := new(dns.Msg)
			m.SetRcode(r, dns.RcodeServerFailure)
			w.WriteMsg(m)
			return
		}
	}

	// 4. 強制覆寫 ID
	// 確保回應的 Transaction ID 與請求一致，否則 Client 會丟棄封包
	resp.Id = r.Id

	// 5. 先回應 Client (降低延遲)
	// 將「寫入回應」移到「分析數據」之前
	if err := w.WriteMsg(resp); err != nil {
		slog.Error("Write response failed", "component", "dns", "error", err)
		return // 若寫入失敗，後續分析也無意義
	}

	// 6. 異步處理記錄
	// 既然已經回應使用者了，這裡可以慢慢做分析
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.processAndRecord(sourceIp, r.Copy(), resp.Copy())
	}()
}

func (s *Server) getLimiter(ip string) *rate.Limiter {
	// 嘗試從 Cache 拿
	if v, found := s.limiters.Get(ip); found {
		// 如果找到了，是否要延長過期時間？
		// 策略 A: 不延長。時間到就重置 Bucket (比較省效能，不需要 Write Lock)。
		// 策略 B: 延長。 s.limiters.Set(ip, v, cache.DefaultExpiration)
		// 這裡選擇策略 A，因為對於 Rate Limiter 來說，過期重置是可以接受的。
		return v.(*rate.Limiter)
	}

	// 沒找到，建立一個新的
	// 規則：每秒 50 個請求，突發 (Burst) 可達 100
	newLimiter := rate.NewLimiter(rate.Every(time.Second/50), 100)

	// 存入 Cache，使用預設過期時間 (10分鐘)
	s.limiters.Set(ip, newLimiter, cache.DefaultExpiration)

	return newLimiter
}

func (s *Server) processAndRecord(sourceIp string, req, resp *dns.Msg) {
	if len(req.Question) == 0 {
		return
	}

	question := req.Question[0]
	// sourceIp 已經從參數傳入
	localCountry := os.Getenv("LOCAL_COUNTRY")

	for _, answer := range resp.Answer {
		var resultIP string

		switch rr := answer.(type) {
		case *dns.A:
			resultIP = rr.A.String()
		case *dns.AAAA:
			resultIP = rr.AAAA.String()
		default:
			continue
		}

		recordType := dns.TypeToString[answer.Header().Rrtype]

		// 這些查詢可能涉及 File IO 或大量運算
		resultCountry, _ := geoip.GetCountry(resultIP)
		isForeign := localCountry != "" && resultCountry != localCountry
		foreignConfidence := ""

		// 境外判斷機制：GeoIP 判定外國後，用延遲進一步驗證
		latency := -1.0
		if isForeign {
			latency = pingIP(resultIP)
			if latency >= 0 {
				// ICMP 成功
				if latency < 10 {
					isForeign = false // 國內 CDN
				} else {
					foreignConfidence = "high"
				}
			} else {
				// ICMP 失敗，fallback TCP 探測
				latency = tcpProbe(resultIP)
				if latency >= 0 {
					if latency < 10 {
						isForeign = false
					} else {
						foreignConfidence = "high"
					}
				} else {
					// 兩者都失敗，保持 isForeign=true 但標記低確信度
					foreignConfidence = "low"
				}
			}
		}

		asn, isp, _ := geoip.GetASN(resultIP)
		coords, _ := geoip.GetCoords(resultIP)
		appName, appCat := recognition.IdentifyApp(question.Name)

		record := types.DNSQueryRecord{
			Timestamp:         time.Now(),
			Domain:            question.Name,
			Type:              recordType,
			ResultIP:          resultIP,
			IsForeign:         isForeign,
			ForeignConfidence: foreignConfidence,
			Latency:           latency,
			SourceIP:          sourceIp,
			Country:           resultCountry,
			ASN:               asn,
			ISP:               isp,
			AppName:           appName,
			AppCategory:       appCat,
		}
		if coords != nil && len(coords) == 2 {
			record.Longitude = coords[0]
			record.Latitude = coords[1]
		}

		slog.Info("DNS record processed", "component", "dns", "domain", question.Name, "resultIp", resultIP, "country", resultCountry, "app", appName, "sourceIp", sourceIp)

		// 存入 Ring Buffer
		buffer.Add(sourceIp, record)

		// WebSocket 推送
		data, err := json.Marshal(record)
		if err == nil {
			select {
			case s.broadcast <- api.BroadcastMessage{SourceIP: sourceIp, Data: data}:
			default:
				slog.Warn("Broadcast channel full, dropping message", "component", "dns")
			}
		}
	}
}

// pingIP 使用 go-ping 執行 ICMP ping 並傳回延遲 (ms)，失敗回 -1
func pingIP(ip string) float64 {
	pinger, err := probing.NewPinger(ip)
	if err != nil {
		return -1
	}
	pinger.Count = 1
	pinger.Timeout = 1 * time.Second
	pinger.SetPrivileged(false) // unprivileged mode (UDP)，不需 root

	if err := pinger.Run(); err != nil {
		return -1
	}

	stats := pinger.Statistics()
	if stats.PacketsRecv == 0 {
		return -1
	}

	return float64(stats.AvgRtt.Microseconds()) / 1000.0
}

// tcpProbe 嘗試 TCP 連線探測延遲 (ms)，失敗回 -1
func tcpProbe(ip string) float64 {
	ports := []string{"443", "80"}
	for _, port := range ports {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%s", ip, port), 1*time.Second)
		if err != nil {
			continue
		}
		conn.Close()
		return float64(time.Since(start).Microseconds()) / 1000.0
	}
	return -1
}

// Wait 等待所有 enrichment goroutine 完成
func (s *Server) Wait() {
	s.wg.Wait()
}
