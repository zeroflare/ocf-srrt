package dns

import (
	"encoding/json"
	"log"
	"math/rand"
	_ "math/rand"
	"net"
	"ocf-srrt/backend/internal/buffer"
	"ocf-srrt/backend/internal/geoip"
	"ocf-srrt/backend/internal/recognition"
	"ocf-srrt/backend/internal/types"
	"os"
	"sync"
	"time"

	"github.com/miekg/dns"
	"golang.org/x/time/rate"
)

// Server 定義了 DNS 伺服器結構
type Server struct {
	*dns.Server
	broadcast chan []byte
	limiters  sync.Map
	dnsClient *dns.Client
	upstreams []string
}

// NewServer 建立一個新的 DNS 伺服器實例
func NewServer(broadcast chan []byte) *Server {
	upstreams := []string{
		"1.1.1.1:53",
		"8.8.8.8:53",
		"1.0.0.1:53", // Cloudflare Backup
		"8.8.4.4:53", // Google Backup
	}

	s := &Server{
		Server:    &dns.Server{Addr: ":53", Net: "udp"},
		broadcast: broadcast,
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
	// 1. 異常防護：處理空請求
	if len(r.Question) == 0 {
		return
	}

	sourceIp, _, _ := net.SplitHostPort(w.RemoteAddr().String())

	// 2. Rate Limiting (Token Bucket)
	limiter, _ := s.limiters.LoadOrStore(sourceIp, rate.NewLimiter(rate.Every(time.Second/50), 100))
	if !limiter.(*rate.Limiter).Allow() {
		return
	}

	// --- 隨機挑選上游 ---
	target := s.upstreams[rand.Intn(len(s.upstreams))]

	log.Printf("[DNS] Query: %s (Client: %s)  target: %s", r.Question[0].Name, sourceIp, target)

	resp, _, err := s.dnsClient.Exchange(r, target)
	if err != nil {
		backupTarget := s.upstreams[(rand.Intn(len(s.upstreams))+1)%len(s.upstreams)]
		resp, _, err = s.dnsClient.Exchange(r, backupTarget)
		if err != nil {
			log.Printf("[Error] Upstream forward failed: %v", err)
			m := new(dns.Msg)
			m.SetRcode(r, dns.RcodeServerFailure)
			err := w.WriteMsg(m)
			if err != nil {
				return
			}
			return
		}
	}

	// 4. 異步處理記錄
	// 為了讓 User 盡快收到 DNS 回應，解析與推送邏輯可以丟到背景跑
	// 但考慮到 Go Routine 開銷，這裡先保持同步，若效能有瓶頸可加 `go`
	s.processAndRecord(w, r, resp)

	// 5. 將回應回傳給 Client
	if err := w.WriteMsg(resp); err != nil {
		log.Printf("[Error] Write response failed: %v", err)
	}
}

func (s *Server) processAndRecord(w dns.ResponseWriter, req, resp *dns.Msg) {
	if len(req.Question) == 0 {
		return
	}

	question := req.Question[0]
	sourceIp, _, _ := net.SplitHostPort(w.RemoteAddr().String())
	localCountry := os.Getenv("LOCAL_COUNTRY")

	for _, answer := range resp.Answer {
		var resultIP string

		// 解析 IP
		switch rr := answer.(type) {
		case *dns.A:
			resultIP = rr.A.String()
		case *dns.AAAA:
			resultIP = rr.AAAA.String()
		default:
			continue // 跳過 CNAME, TXT 等非 IP 紀錄
		}

		recordType := dns.TypeToString[answer.Header().Rrtype]

		// GeoIP Lookup
		resultCountry, _ := geoip.GetCountry(resultIP)
		isForeign := localCountry != "" && resultCountry != localCountry

		// ASN Lookup
		asn, isp, _ := geoip.GetASN(resultIP)

		// App Recognition
		appName, appCat := recognition.IdentifyApp(question.Name)

		record := types.DNSQueryRecord{
			Timestamp:   time.Now(),
			Domain:      question.Name,
			Type:        recordType,
			ResultIP:    resultIP,
			IsForeign:   isForeign,
			SourceIP:    sourceIp,
			Country:     resultCountry,
			ASN:         asn,
			ISP:         isp,
			AppName:     appName,
			AppCategory: appCat,
		}

		// 寫入 In-Memory Buffer
		buffer.Add(sourceIp, record)

		// WebSocket Push (非阻塞模式)
		data, err := json.Marshal(record)
		if err == nil {
			select {
			case s.broadcast <- data:
				// 成功送入通道
			default:
				// 通道已滿或無人接收，直接丟棄，避免卡死 DNS 解析
				log.Println("Broadcast channel full, dropping message")
			}
		}
	}
}
