package dns

import (
	"context"
	"encoding/json"
	"log"
	"math/rand"
	"net"
	"ocf-srrt/backend/internal/buffer"
	"ocf-srrt/backend/internal/geoip"
	"ocf-srrt/backend/internal/recognition"
	"ocf-srrt/backend/internal/types"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/miekg/dns"
	"github.com/patrickmn/go-cache"
	"golang.org/x/time/rate"
)

// Server 定義了 DNS 伺服器結構
type Server struct {
	*dns.Server
	broadcast chan []byte
	limiters  *cache.Cache
	dnsClient *dns.Client
	upstreams []string
}

// NewServer 建立一個新的 DNS 伺服器實例
func NewServer(broadcast chan []byte) *Server {
	upstreams := []string{
		"1.1.1.1:53",
		"8.8.8.8:53",
		"1.0.0.1:53",
		"8.8.4.4:53",
	}

	s := &Server{
		Server:    &dns.Server{Addr: ":53", Net: "udp"},
		broadcast: broadcast,
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
	log.Printf("[DNS] Request from %s: %s", sourceIp, r.Question[0].Name)

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
			log.Printf("[Error] Upstream forward failed: %v", err)
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
		log.Printf("[Error] Write response failed: %v", err)
		return // 若寫入失敗，後續分析也無意義
	}

	// 6. 異步/同步 處理記錄
	// 既然已經回應使用者了，這裡可以慢慢做分析
	go s.processAndRecord(sourceIp, r.Copy(), resp.Copy())
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

		// 國內外判斷機制：如果國家在國外，再用 ping 判斷 (Ping < 10ms 視為國內)
		latency := -1.0
		if isForeign {
			latency = pingIP(resultIP)
			if latency > 0 && latency < 10 {
				isForeign = false
			}
		}

		asn, isp, _ := geoip.GetASN(resultIP)
		appName, appCat := recognition.IdentifyApp(question.Name)

		record := types.DNSQueryRecord{
			Timestamp:   time.Now(),
			Domain:      question.Name,
			Type:        recordType,
			ResultIP:    resultIP,
			IsForeign:   isForeign,
			Latency:     latency,
			SourceIP:    sourceIp,
			Country:     resultCountry,
			ASN:         asn,
			ISP:         isp,
			AppName:     appName,
			AppCategory: appCat,
		}

		log.Printf("[DNS] Processed: %s -> %s (%s) [%s] from %s", question.Name, resultIP, resultCountry, appName, sourceIp)

		// 存入 Ring Buffer
		buffer.Add(sourceIp, record)

		// WebSocket 推送
		data, err := json.Marshal(record)
		if err == nil {
			select {
			case s.broadcast <- data:
			default:
				// 這裡丟棄是正確的，保護主程式
				log.Println("Broadcast full")
			}
		}
	}
}

// pingIP 執行簡單的 ping 並傳回延遲 (ms)
func pingIP(ip string) float64 {
	// 建立 context 避免 ping 太久 (1秒)
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	// 使用系統 ping 指令
	// -c 1: 只 ping 一次
	// -t 1 (或 -W 1): 等待時間
	// 注意: macOS 是 -t, Linux 是 -W，這裡為了通用性可能需要判斷或使用封裝庫
	// 簡單起見先假設是 macOS (符合專案環境說明)
	cmd := exec.CommandContext(ctx, "ping", "-c", "1", "-t", "1", ip)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return -1
	}

	// 解析輸出，尋找 "time=X.XXX ms"
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "time=") {
			parts := strings.Split(line, "time=")
			if len(parts) > 1 {
				msStr := strings.Split(parts[1], " ")[0]
				ms, _ := strconv.ParseFloat(msStr, 64)
				return ms
			}
		}
	}

	return -1
}
