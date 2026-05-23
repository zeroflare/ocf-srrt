package latencyprobe

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os/exec"
	"sync"
	"time"

	ping "github.com/go-ping/ping"
	"github.com/patrickmn/go-cache"
)

// DomesticThresholdMs 小於此 RTT（ms）視為在 localCountry 境內。
const DomesticThresholdMs = 10.0

const (
	ProbeTimeout  = 2 * time.Second
	MtrTimeout    = 3 * time.Second
	tcpHTTPSPort  = "443"
	cacheTTLHit   = 10 * time.Minute
	cacheTTLMiss  = 2 * time.Minute
	maxConcurrent = 20
)

// Result 為對目標 IP 的 RTT 探測結果。
type Result struct {
	LatencyMs float64
	Method    string // "icmp" | "mtr-tcp443" | "tcp443"
	OK        bool
}

// Prober 對外 probe 做快取與並發限制。
type Prober struct {
	cache *cache.Cache
	sem   chan struct{}
}

// NewProber 建立探測器。
func NewProber() *Prober {
	return &Prober{
		cache: cache.New(cacheTTLHit, cacheTTLHit+cacheTTLMiss),
		sem:   make(chan struct{}, maxConcurrent),
	}
}

// Probe 量測至 targetIP 的 RTT：先 ICMP ping，失敗則 mtr TCP 443，再 fallback TCP 443 連線。
func (p *Prober) Probe(parentCtx context.Context, targetIP string) Result {
	if cached, found := p.cache.Get(targetIP); found {
		return cached.(Result)
	}

	select {
	case p.sem <- struct{}{}:
		defer func() { <-p.sem }()
	case <-parentCtx.Done():
		return Result{OK: false}
	}

	result := p.probe(parentCtx, targetIP)
	ttl := cacheTTLHit
	if !result.OK {
		ttl = cacheTTLMiss
	}
	p.cache.Set(targetIP, result, ttl)
	return result
}

func (p *Prober) probe(parentCtx context.Context, targetIP string) Result {
	parsed := net.ParseIP(targetIP)
	if parsed == nil || isPrivateOrLoopback(parsed) {
		return Result{OK: false}
	}

	ctx, cancel := context.WithTimeout(parentCtx, ProbeTimeout)
	defer cancel()
	if r := probeICMP(ctx, targetIP); r.OK {
		return r
	}

	mtrCtx, mtrCancel := context.WithTimeout(parentCtx, MtrTimeout)
	defer mtrCancel()
	if r := probeMTRTCP443(mtrCtx, targetIP); r.OK {
		return r
	}

	tcpCtx, tcpCancel := context.WithTimeout(parentCtx, ProbeTimeout)
	defer tcpCancel()
	return probeTCP443(tcpCtx, targetIP)
}

func probeICMP(ctx context.Context, ip string) Result {
	pinger, err := ping.NewPinger(ip)
	if err != nil {
		return Result{OK: false}
	}
	pinger.Count = 1
	pinger.Timeout = ProbeTimeout
	pinger.SetPrivileged(true)

	done := make(chan struct{})
	go func() {
		_ = pinger.Run()
		close(done)
	}()

	select {
	case <-ctx.Done():
		pinger.Stop()
		return Result{OK: false}
	case <-done:
		stats := pinger.Statistics()
		if stats.PacketsRecv == 0 {
			return Result{OK: false}
		}
		ms := float64(stats.AvgRtt.Microseconds()) / 1000.0
		return Result{LatencyMs: ms, Method: "icmp", OK: true}
	}
}

type mtrJSON struct {
	Report struct {
		Hubs []struct {
			Avg float64 `json:"Avg"`
		} `json:"hubs"`
	} `json:"report"`
}

func probeMTRTCP443(ctx context.Context, ip string) Result {
	if _, err := exec.LookPath("mtr"); err != nil {
		return Result{OK: false}
	}

	args := []string{
		"--report", "--report-cycles", "1",
		"--max-ttl", "30", "--json",
		"--tcp", "--port", tcpHTTPSPort,
		ip,
	}
	cmd := exec.CommandContext(ctx, "mtr", args...)
	output, err := cmd.Output()
	if err != nil {
		slog.Debug("mtr tcp443 probe failed", "component", "latencyprobe", "ip", ip, "error", err)
		return Result{OK: false}
	}

	var report mtrJSON
	if err := json.Unmarshal(output, &report); err != nil {
		return Result{OK: false}
	}
	hubs := report.Report.Hubs
	if len(hubs) == 0 {
		return Result{OK: false}
	}
	last := hubs[len(hubs)-1]
	if last.Avg <= 0 {
		return Result{OK: false}
	}
	return Result{LatencyMs: last.Avg, Method: "mtr-tcp443", OK: true}
}

func probeTCP443(ctx context.Context, ip string) Result {
	addr := net.JoinHostPort(ip, tcpHTTPSPort)
	dialer := net.Dialer{Timeout: ProbeTimeout}
	start := time.Now()
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return Result{OK: false}
	}
	_ = conn.Close()
	ms := float64(time.Since(start).Microseconds()) / 1000.0
	return Result{LatencyMs: ms, Method: "tcp443", OK: true}
}

func isPrivateOrLoopback(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return true
	}
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"fc00::/7",
	}
	for _, cidr := range privateRanges {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// ShouldCorrectToLocal 若探測成功且 RTT < DomesticThresholdMs，應將 GeoIP 國家改為 localCountry。
func ShouldCorrectToLocal(localCountry, geoCountry string, probe Result) bool {
	if localCountry == "" || geoCountry == "" || geoCountry == localCountry {
		return false
	}
	return probe.OK && probe.LatencyMs < DomesticThresholdMs
}

// ResolveCountry 依 GeoIP 國家與 RTT 探測決定最終國家（與 DNS processAndRecord 邏輯一致）。
func (p *Prober) ResolveCountry(ctx context.Context, localCountry, geoCountry, ip string) string {
	if localCountry == "" || geoCountry == "" || geoCountry == localCountry || ip == "" {
		return geoCountry
	}
	probeCtx, cancel := context.WithTimeout(ctx, ProbeTimeout+MtrTimeout)
	defer cancel()
	probe := p.Probe(probeCtx, ip)
	if ShouldCorrectToLocal(localCountry, geoCountry, probe) {
		slog.Debug("GeoIP country corrected by latency probe",
			"component", "latencyprobe",
			"ip", ip,
			"geoCountry", geoCountry,
			"localCountry", localCountry,
			"probe", FormatMethod(probe),
		)
		return localCountry
	}
	return geoCountry
}

var defaultProber *Prober
var defaultProberOnce sync.Once

// Default 回傳 process-wide 探測器（供 DNS server 使用）。
func Default() *Prober {
	defaultProberOnce.Do(func() {
		defaultProber = NewProber()
	})
	return defaultProber
}

// FormatMethod 供 log 使用。
func FormatMethod(r Result) string {
	if !r.OK {
		return "none"
	}
	return fmt.Sprintf("%s(%.1fms)", r.Method, r.LatencyMs)
}
