package dns

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"net"
	"ocf-srrt/backend/internal/api"
	"ocf-srrt/backend/internal/auth"
	"ocf-srrt/backend/internal/buffer"
	"ocf-srrt/backend/internal/geoip"
	"ocf-srrt/backend/internal/osfingerprint"
	"ocf-srrt/backend/internal/recognition"
	"ocf-srrt/backend/internal/types"
	"os"
	"strings"
	"sync"
	"time"

	probing "github.com/go-ping/ping"
	"github.com/miekg/dns"
	"github.com/patrickmn/go-cache"
	"golang.org/x/time/rate"
)

// Server 定義了 DNS 伺服器結構
type Server struct {
	udpServer    *dns.Server
	tcpServer    *dns.Server
	broadcast    chan api.BroadcastMessage
	tokenStore   *auth.TokenStore
	limiters     *cache.Cache
	dnsClient    *dns.Client
	upstreams    []string
	dnsCache     *cache.Cache // DNS 回應快取
	osCache      *cache.Cache // Per-IP OS fingerprint 快取
	probeCache   *cache.Cache // 境外 IP 探測結果快取 (避免重複探測)
	probeWorkers chan struct{}
	wg           sync.WaitGroup
	ctx          context.Context
	cancel       context.CancelFunc
}

// buildUpstreams 從環境變數或預設值建立 upstream 列表
func buildUpstreams() []string {
	if env := os.Getenv("DNS_UPSTREAMS"); env != "" {
		parts := strings.Split(env, ",")
		var result []string
		for _, p := range parts {
			if addr := strings.TrimSpace(p); addr != "" {
				result = append(result, addr)
			}
		}
		if len(result) > 0 {
			slog.Info("Using custom DNS upstreams from env", "upstreams", result)
			return result
		}
	}
	return []string{
		"1.1.1.1:53",
		"8.8.8.8:53",
		"1.0.0.1:53",
		"8.8.4.4:53",
	}
}

// NewServer 建立一個新的 DNS 伺服器實例
func NewServer(broadcast chan api.BroadcastMessage, tokenStore *auth.TokenStore) *Server {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{
		udpServer:  &dns.Server{Addr: "0.0.0.0:53", Net: "udp"},
		tcpServer:  &dns.Server{Addr: "0.0.0.0:53", Net: "tcp"},
		broadcast:  broadcast,
		tokenStore: tokenStore,
		// 參數 1 (DefaultExpiration): 10 分鐘。如果 IP 10 分鐘沒活動，Rate Limiter 就會被刪除。
		// 參數 2 (CleanupInterval): 15 分鐘。每 15 分鐘背景掃描一次過期資料。
		limiters: cache.New(10*time.Minute, 15*time.Minute),
		dnsClient: &dns.Client{
			Timeout: 3 * time.Second, // 給 Go runtime 排程額外緩衝
		},
		upstreams:    buildUpstreams(),
		dnsCache:     cache.New(30*time.Second, 60*time.Second),
		osCache:      cache.New(30*time.Minute, 60*time.Minute),
		probeCache:   cache.New(10*time.Minute, 20*time.Minute),
		probeWorkers: make(chan struct{}, 100), // 限制最多 100 個並發探測任務
		ctx:          ctx,
		cancel:       cancel,
	}
	s.udpServer.Handler = s
	s.tcpServer.Handler = s
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

	// 3. 查詢 DNS 快取
	cacheKey := fmt.Sprintf("%s:%d", r.Question[0].Name, r.Question[0].Qtype)
	if cached, found := s.dnsCache.Get(cacheKey); found {
		resp := cached.(*dns.Msg).Copy()
		resp.Id = r.Id
		w.WriteMsg(resp)
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			s.processAndRecord(sourceIp, r.Copy(), resp.Copy())
		}()
		return
	}

	// 4. 快取未命中，依序嘗試所有 upstream
	resp, err := s.forwardWithFallback(r)
	if err != nil {
		slog.Error("All upstreams failed", "component", "dns", "error", err)
		m := new(dns.Msg)
		m.SetRcode(r, dns.RcodeServerFailure)
		w.WriteMsg(m)
		return
	}

	// 寫入快取
	s.dnsCache.Set(cacheKey, resp, cache.DefaultExpiration)

	// 5. 強制覆寫 ID
	resp.Id = r.Id

	// 6. 先回應 Client (降低延遲)
	if err := w.WriteMsg(resp); err != nil {
		slog.Error("Write response failed", "component", "dns", "error", err)
		return
	}

	// 7. 異步處理記錄
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.processAndRecord(sourceIp, r.Copy(), resp.Copy())
	}()
}

// forwardWithFallback 從隨機起始位置，依序嘗試所有 upstream，任一成功即回傳
func (s *Server) forwardWithFallback(r *dns.Msg) (*dns.Msg, error) {
	startIdx := rand.Intn(len(s.upstreams))
	var lastErr error

	for i := 0; i < len(s.upstreams); i++ {
		idx := (startIdx + i) % len(s.upstreams)
		upstream := s.upstreams[idx]

		resp, _, err := s.dnsClient.Exchange(r, upstream)
		if err == nil {
			return resp, nil
		}
		slog.Warn("Upstream attempt failed, trying next",
			"component", "dns",
			"upstream", upstream,
			"error", err,
			"attempt", i+1,
			"total", len(s.upstreams),
		)
		lastErr = err
	}
	return nil, fmt.Errorf("all %d upstreams failed, last error: %w", len(s.upstreams), lastErr)
}

// ListenAndServe 同時啟動 UDP 與 TCP 伺服器
func (s *Server) ListenAndServe() error {
	errChan := make(chan error, 2)

	go func() {
		slog.Info("Starting DNS UDP server", "addr", s.udpServer.Addr)
		errChan <- s.udpServer.ListenAndServe()
	}()

	go func() {
		slog.Info("Starting DNS TCP server", "addr", s.tcpServer.Addr)
		errChan <- s.tcpServer.ListenAndServe()
	}()

	// 回傳第一個發生的錯誤
	return <-errChan
}

// Shutdown 同時停止兩個伺服器
func (s *Server) Shutdown() error {
	slog.Info("Stopping DNS servers...")
	s.cancel() // 通知所有探測任務取消
	errU := s.udpServer.Shutdown()
	errT := s.tcpServer.Shutdown()
	if errU != nil {
		return errU
	}
	return errT
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

// probeResult 儲存探測後的暫存資料
type probeResult struct {
	isForeign         bool
	foreignConfidence string
	latency           float64
}

func (s *Server) processAndRecord(sourceIp string, req, resp *dns.Msg) {
	if len(req.Question) == 0 {
		return
	}

	question := req.Question[0]
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
		latency := -1.0

		// 境外判斷機制：GeoIP 判定外國後，用延遲進一步驗證
		if isForeign {
			// 檢查快取
			if cached, found := s.probeCache.Get(resultIP); found {
				res := cached.(probeResult)
				isForeign = res.isForeign
				foreignConfidence = res.foreignConfidence
				latency = res.latency
			} else {
				// 嘗試獲取 Worker 令牌，若滿了則跳過探測 (降低壓力，確保 shutdown 不超時)
				select {
				case s.probeWorkers <- struct{}{}:
					// 使用獨立 goroutine 執行探測，以免阻塞當前 processAndRecord
					// 雖然 processAndRecord 本身已在 goroutine，但在處理多個 Answer 時仍會同步阻塞
					func() {
						defer func() { <-s.probeWorkers }()

						// 建立帶超時的 Context
						ctx, cancel := context.WithTimeout(s.ctx, 3*time.Second)
						defer cancel()

						resLatency := pingIP(ctx, resultIP)
						resForeign := true
						resConfidence := ""

						if resLatency >= 0 {
							if resLatency < 10 {
								resForeign = false
							} else {
								resConfidence = "high"
							}
						} else {
							resLatency = tcpProbe(ctx, resultIP)
							if resLatency >= 0 {
								if resLatency < 10 {
									resForeign = false
								} else {
									resConfidence = "high"
								}
							} else {
								resConfidence = "low"
							}
						}

						// 更新區域變數與快取
						isForeign = resForeign
						foreignConfidence = resConfidence
						latency = resLatency
						s.probeCache.Set(resultIP, probeResult{resForeign, resConfidence, resLatency}, cache.DefaultExpiration)
					}()
				default:
					// Worker 滿，跳過探測，標記為低確信度
					slog.Warn("Probe workers full, skipping detailed probe", "ip", resultIP)
					foreignConfidence = "low (busy)"
				}
			}
		}

		asn, isp, _ := geoip.GetASN(resultIP)
		coords, _ := geoip.GetCoords(resultIP)
		appName, appCat := recognition.IdentifyApp(question.Name)

		// OS Fingerprinting: 嘗試從域名推斷 OS，結果快取在 Per-IP osCache 中
		detectedOS := ""
		if cached, found := s.osCache.Get(sourceIp); found {
			detectedOS = cached.(string)
		}
		if os := osfingerprint.Detect(question.Name); os != "" {
			detectedOS = os
			s.osCache.Set(sourceIp, os, cache.DefaultExpiration)
		}

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
			OS:                detectedOS,
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
func pingIP(ctx context.Context, ip string) float64 {
	pinger, err := probing.NewPinger(ip)
	if err != nil {
		return -1
	}
	pinger.Count = 1
	pinger.Timeout = 1 * time.Second
	pinger.SetPrivileged(false) // unprivileged mode (UDP)，不需 root

	// 建立一個 channel 接收 Run 結果
	done := make(chan error, 1)
	go func() {
		done <- pinger.Run()
	}()

	select {
	case <-ctx.Done():
		pinger.Stop()
		return -1
	case err := <-done:
		if err != nil {
			return -1
		}
	}

	stats := pinger.Statistics()
	if stats.PacketsRecv == 0 {
		return -1
	}

	return float64(stats.AvgRtt.Microseconds()) / 1000.0
}

// tcpProbe 嘗試 TCP 連線探測延遲 (ms)，失敗回 -1
func tcpProbe(ctx context.Context, ip string) float64 {
	ports := []string{"443", "80"}
	for _, port := range ports {
		select {
		case <-ctx.Done():
			return -1
		default:
		}
		start := time.Now()
		d := net.Dialer{Timeout: 1 * time.Second}
		conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(ip, port))
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
