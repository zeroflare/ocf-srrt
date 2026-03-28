package traceroute

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"ocf-srrt/backend/internal/geoip"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// validTargetRe 預編譯的合法 target 正規表達式（FQDN 或 IP）
var validTargetRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,252}$`)

// mtrVersion 快取偵測到的 mtr 版本字串（啟動時偵測一次）
var (
	mtrVersion     string
	mtrVersionOnce sync.Once
)

// DetectMtrVersion 偵測並記錄 mtr 版本，供啟動時呼叫
func DetectMtrVersion() string {
	mtrVersionOnce.Do(func() {
		out, err := exec.Command("mtr", "--version").Output()
		if err != nil {
			mtrVersion = "unknown"
		} else {
			mtrVersion = strings.TrimSpace(string(out))
		}
		slog.Info("mtr version detected", "component", "traceroute", "version", mtrVersion)
	})
	return mtrVersion
}

// mtrReport 對應 mtr --json 的完整輸出
type mtrReport struct {
	Report struct {
		Hubs []mtrHub `json:"hubs"`
	} `json:"report"`
}

// mtrHub 對應 report.hubs 中的每一跳
type mtrHub struct {
	Count int     `json:"count"`
	Host  string  `json:"host"`
	Loss  float64 `json:"Loss%"`
	Snt   int     `json:"Snt"`
	Last  float64 `json:"Last"`
	Avg   float64 `json:"Avg"`
	Best  float64 `json:"Best"`
	Wrst  float64 `json:"Wrst"`
	StDev float64 `json:"StDev"`
}

// Hop 代表 Traceroute 中的一跳
type Hop struct {
	Index         int       `json:"index"`
	IP            string    `json:"ip"`
	Host          string    `json:"host"`
	Latency       float64   `json:"latency"` // 對應 mtr 的 Avg (ms)
	RTTs          []float64 `json:"rtts"`    // 保留為空陣列（向後相容）
	Loss          float64   `json:"loss"`    // 丟包率 (0.0 ~ 100.0)
	Best          float64   `json:"best"`    // 最低延遲 ms
	Worst         float64   `json:"worst"`   // 最高延遲 ms
	StDev         float64   `json:"stdev"`   // 標準差 ms
	Country       string    `json:"country"`
	City          string    `json:"city,omitempty"`
	Subdivision   string    `json:"subdivision,omitempty"`
	Coords        []float64 `json:"coords"` // [lon, lat]
	ASN           uint      `json:"asn"`
	ISP           string    `json:"isp"`
	GeoConfidence string    `json:"geoConfidence"` // "high" / "low" / "none"
}

// TraceResult 包含完整的 Traceroute 結果
type TraceResult struct {
	Target     string    `json:"target"`
	ResolvedIP string    `json:"resolvedIP,omitempty"` // DNS 預解析的 IP（當 target 為域名時）
	Hops       []Hop     `json:"hops"`
	Status     string    `json:"status"` // "completed", "timeout", "error"
	Time       time.Time `json:"time"`
	Cached     bool      `json:"cached"` // 是否為快取結果

	// 可觀測性欄位
	Mode           string  `json:"mode"`                     // "tcp" / "icmp"
	Port           int     `json:"port,omitempty"`           // TCP port（ICMP 模式時省略）
	DNSResolveMs   float64 `json:"dnsResolveMs,omitempty"`   // DNS 解析耗時 (ms)
	MtrExecutionMs float64 `json:"mtrExecutionMs,omitempty"` // mtr 執行耗時 (ms)
	MtrVersion     string  `json:"mtrVersion,omitempty"`     // mtr 版本
}

// RunOptions 控制 mtr 執行模式
type RunOptions struct {
	Mode string // "tcp" 或 "icmp"，預設 "tcp"
	Port string // TCP 模式的目標 port，預設 "443"
}

// ErrIPv6NotSupported 表示 target 為 IPv6 且無法轉換為 IPv4
var ErrIPv6NotSupported = fmt.Errorf("IPv6 traceroute is not supported, please use an IPv4 address or domain name")

// Run 執行 mtr 指令並解析 JSON 結果。
// localIP 為本機公網 IP（用於 Hop 0），空字串則跳過。
func Run(ctx context.Context, target string, localIP string, opts RunOptions) (*TraceResult, error) {
	// 驗證輸入，防止指令注入
	if strings.HasPrefix(target, "-") {
		return nil, fmt.Errorf("invalid target")
	}

	// 偵測 IPv6 地址：嘗試 rDNS → 再解析為 IPv4，無法轉換則拒絕
	if ip := net.ParseIP(target); ip != nil && ip.To4() == nil {
		// 是 IPv6，嘗試 rDNS 取得域名
		names, err := net.LookupAddr(target)
		if err == nil && len(names) > 0 {
			hostname := strings.TrimSuffix(names[0], ".")
			// 用域名重新解析為 IPv4
			ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", hostname)
			if err == nil && len(ips) > 0 {
				slog.Info("IPv6 target converted to IPv4 via rDNS",
					"component", "traceroute",
					"originalIPv6", target,
					"hostname", hostname,
					"resolvedIPv4", ips[0].String(),
				)
				target = hostname // 改用域名，後續流程會解析為 IPv4
			} else {
				return nil, ErrIPv6NotSupported
			}
		} else {
			return nil, ErrIPv6NotSupported
		}
	}

	if !validTargetRe.MatchString(target) {
		return nil, fmt.Errorf("invalid target")
	}
	// 二次驗證：確認為合法 IP 或可解析的 hostname
	if ip := net.ParseIP(target); ip == nil {
		if _, err := net.LookupHost(target); err != nil {
			return nil, fmt.Errorf("invalid target")
		}
	}

	// 檢查 mtr 是否已安裝
	if _, err := exec.LookPath("mtr"); err != nil {
		return nil, fmt.Errorf("mtr is not installed or not found in PATH")
	}

	// DNS 預解析：在 Go 層級完成，確保 mtr 探測的 IP 與 GeoIP 查詢一致
	resolvedIP := target
	originalTarget := target
	var dnsResolveMs float64
	if net.ParseIP(target) == nil {
		// target 是域名，先解析為 IPv4
		dnsStart := time.Now()
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", target)
		dnsResolveMs = float64(time.Since(dnsStart).Microseconds()) / 1000.0
		if err != nil || len(ips) == 0 {
			return nil, fmt.Errorf("DNS resolution failed for %s: %w", target, err)
		}
		resolvedIP = ips[0].String()
	}

	// 預設 TCP 模式
	mode := opts.Mode
	if mode == "" {
		mode = "tcp"
	}
	port := opts.Port
	if port == "" {
		port = "443"
	}

	// 組裝 mtr 指令參數：模擬 mtr -T -P 443 <target> -r -c 1
	args := []string{"--report", "--report-cycles", "1", "--max-ttl", "30", "--json"}
	if mode == "tcp" {
		args = append(args, "--tcp", "--port", port)
	}
	args = append(args, resolvedIP)

	cmd := exec.CommandContext(ctx, "mtr", args...)
	mtrStart := time.Now()
	output, err := cmd.Output()
	mtrExecutionMs := float64(time.Since(mtrStart).Microseconds()) / 1000.0

	// 錯誤分類：區分 timeout、非零退出碼、完全失敗
	status := "completed"
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			status = "timeout"
			slog.Warn("mtr timed out, returning partial result", "component", "traceroute", "target", originalTarget)
		} else if exitErr, ok := err.(*exec.ExitError); ok {
			status = "error"
			slog.Warn("mtr exited with non-zero", "component", "traceroute", "target", originalTarget, "code", exitErr.ExitCode())
		} else {
			// 完全無法執行（例如 binary 不存在）
			return nil, fmt.Errorf("mtr execution failed: %w", err)
		}
		// timeout 或非零退出碼：嘗試解析已收集的 partial output
		if len(output) == 0 {
			portNum, _ := strconv.Atoi(port)
			return &TraceResult{
				Target:         originalTarget,
				Status:         status,
				Time:           time.Now(),
				Hops:           []Hop{},
				Mode:           mode,
				Port:           portNum,
				DNSResolveMs:   dnsResolveMs,
				MtrExecutionMs: mtrExecutionMs,
				MtrVersion:     mtrVersion,
			}, nil
		}
	}

	var report mtrReport
	if err := json.Unmarshal(output, &report); err != nil {
		if status != "completed" {
			portNum, _ := strconv.Atoi(port)
			return &TraceResult{
				Target:         originalTarget,
				Status:         status,
				Time:           time.Now(),
				Hops:           []Hop{},
				Mode:           mode,
				Port:           portNum,
				DNSResolveMs:   dnsResolveMs,
				MtrExecutionMs: mtrExecutionMs,
				MtrVersion:     mtrVersion,
			}, nil
		}
		return nil, fmt.Errorf("failed to parse mtr JSON output: %w", err)
	}

	portNum, _ := strconv.Atoi(port)
	result := &TraceResult{
		Target:         originalTarget,
		Status:         status,
		Time:           time.Now(),
		Mode:           mode,
		Port:           portNum,
		DNSResolveMs:   dnsResolveMs,
		MtrExecutionMs: mtrExecutionMs,
		MtrVersion:     mtrVersion,
	}
	// 當 target 為域名時，記錄解析後的 IP
	if resolvedIP != originalTarget {
		result.ResolvedIP = resolvedIP
	}

	// Slice 預分配：避免多次記憶體重新分配
	hopsLen := len(report.Report.Hubs)
	if localIP != "" {
		hopsLen++
	}
	hops := make([]Hop, 0, hopsLen)

	// 先插入 Hop 0（本機位置），避免後續 O(n) 的 slice 複製
	if localIP != "" {
		hop0 := Hop{
			Index:         0,
			IP:            localIP,
			Host:          "local",
			Latency:       0,
			RTTs:          []float64{},
			Loss:          0,
			GeoConfidence: "high",
		}
		geo, err := geoip.GetAll(localIP)
		if err == nil {
			hop0.Country = geo.Country
			hop0.City = geo.City
			hop0.Subdivision = geo.Subdivision
			hop0.Coords = geo.Coords
			hop0.ASN = geo.ASN
			hop0.ISP = geo.ISP
		}
		// 座標 fallback
		if hop0.Coords == nil && hop0.Country != "" && hop0.Country != "XX" {
			hop0.Coords = geoip.GetCountryCentroid(hop0.Country)
		}
		if hop0.Country == "" || hop0.Country == "XX" {
			hop0.GeoConfidence = "none"
		}
		hops = append(hops, hop0)
	}

	for i, hub := range report.Report.Hubs {
		hop := Hop{
			Index:   i + 1,
			IP:      hub.Host,
			Host:    hub.Host,
			Latency: hub.Avg,
			RTTs:    []float64{},
			Loss:    hub.Loss,
			Best:    hub.Best,
			Worst:   hub.Wrst,
			StDev:   hub.StDev,
		}

		// 無回應跳點（host 為 "???" 代表無法解析）
		if hub.Host == "???" {
			hop.IP = "*"
			hop.Host = ""
			hop.Latency = 0
			hop.Loss = 100
			hop.Best = 0
			hop.Worst = 0
			hop.StDev = 0
		}

		// mtr 有時回傳 hostname 而非 IP（例如 ec2-x-x-x-x.compute-1.amazonaws.com）
		// 此時需先 DNS 解析取得 IP，才能正確查詢 GeoIP
		if hop.IP != "*" && net.ParseIP(hop.IP) == nil {
			// hub.Host 是 hostname，保留為 Host，解析 IP
			resolved, err := net.LookupHost(hop.IP)
			if err == nil && len(resolved) > 0 {
				hop.IP = resolved[0]
				slog.Debug("Resolved hostname to IP in traceroute hop",
					"component", "traceroute",
					"hostname", hop.Host,
					"resolvedIP", hop.IP,
					"hopIndex", i+1,
				)
			} else {
				slog.Warn("Failed to resolve hostname in traceroute hop",
					"component", "traceroute",
					"hostname", hop.Host,
					"hopIndex", i+1,
					"error", err,
				)
			}
		}

		// 對有效 IP 執行 GeoIP 補全（合併查詢，一次 IP 解析）
		if hop.IP != "*" && net.ParseIP(hop.IP) != nil {
			geo, err := geoip.GetAll(hop.IP)
			if err == nil {
				hop.Country = geo.Country
				hop.City = geo.City
				hop.Subdivision = geo.Subdivision
				hop.Coords = geo.Coords
				hop.ASN = geo.ASN
				hop.ISP = geo.ISP
			}
			// 座標 fallback：City DB 查不到精確座標時，使用國家中心座標
			if hop.Coords == nil && hop.Country != "" && hop.Country != "XX" {
				hop.Coords = geoip.GetCountryCentroid(hop.Country)
			}
			hop.GeoConfidence = "high"
			if hop.Country == "" || hop.Country == "XX" {
				hop.GeoConfidence = "none"
			}

			// rDNS 主動反查：若 mtr 未解析到 hostname（Host == IP），主動查詢
			if hop.Host == hop.IP {
				names, err := net.LookupAddr(hop.IP)
				if err == nil && len(names) > 0 {
					hop.Host = strings.TrimSuffix(names[0], ".")
				}
			}
		} else if hop.IP != "*" {
			// IP 解析失敗但有 hostname，GeoConfidence 標記為 none
			hop.GeoConfidence = "none"
		} else {
			hop.GeoConfidence = "none"
		}

		hops = append(hops, hop)
	}

	result.Hops = hops

	// 後處理階段 1：用延遲差異修正 CDN/Anycast 的可疑 GeoIP 結果
	enrichWithLatencyHeuristic(result.Hops)

	// 後處理階段 2：rDNS PoP 解析（從 hostname 提取 IATA 機場代碼修正地理位置）
	enrichWithRDNS(result.Hops)

	// 後處理階段 3：最終目標 TLD 輔助（對最後一跳用 domain TLD 提升信心度）
	enrichLastHopWithTLD(result.Hops, target)

	return result, nil
}

// enrichWithLatencyHeuristic 用延遲差異修正可疑的 GeoIP 結果。
// 若前後跳延遲差 < 10ms 但 GeoIP 顯示不同國家，且當前跳為已知 CDN ASN，
// 則沿用前一跳的國家與座標，並將信心度標記為 "low"。
func enrichWithLatencyHeuristic(hops []Hop) {
	for i := 1; i < len(hops); i++ {
		prev := hops[i-1]
		curr := &hops[i]

		if prev.IP == "*" || curr.IP == "*" {
			continue
		}

		latencyDelta := curr.Latency - prev.Latency
		if latencyDelta < 0 {
			latencyDelta = -latencyDelta
		}

		// 延遲差 < 10ms 但 GeoIP 顯示不同國家 → 可疑
		if latencyDelta < 10 && prev.Country != "" && curr.Country != "" && prev.Country != curr.Country {
			if isLikelyCDN(curr.ASN) {
				curr.Country = prev.Country
				curr.Coords = prev.Coords
				curr.GeoConfidence = "low"
			}
		}
	}
}

// enrichWithRDNS 嘗試從 hostname 中的 IATA 機場代碼修正 CDN 節點的地理位置。
// 僅對已知 CDN ASN 且 GeoConfidence 非 "high" 或被 latency heuristic 標記的跳點生效。
func enrichWithRDNS(hops []Hop) {
	for i := range hops {
		hop := &hops[i]
		if hop.IP == "*" || hop.Host == "" {
			continue
		}
		// 對所有 CDN ASN 的跳點嘗試 rDNS 解析
		if !isLikelyCDN(hop.ASN) {
			continue
		}

		entry, ok := extractPoPFromRDNS(hop.Host)
		if !ok {
			continue
		}

		// rDNS 提供的位置與 GeoIP 不同時，優先採用 rDNS（更精確）
		if entry.Country != hop.Country {
			hop.Country = entry.Country
			hop.Coords = entry.Coords
			hop.GeoConfidence = "high" // rDNS 精確度比 latency heuristic 高
		} else if hop.GeoConfidence == "low" {
			// 與 latency heuristic 結論一致，提升信心度
			hop.Coords = entry.Coords
			hop.GeoConfidence = "high"
		}
	}
}

// enrichLastHopWithTLD 對最後一跳（目標 IP），用原始域名的 ccTLD 做加權修正。
// 僅作為輔助信號：若 TLD 國家與 GeoIP 結果不同且 GeoConfidence 為 "low"，則修正。
func enrichLastHopWithTLD(hops []Hop, target string) {
	if len(hops) == 0 {
		return
	}

	tldCountry := extractCountryFromTLD(target)
	if tldCountry == "" {
		return
	}

	// 找最後一個非 * 的跳點
	var last *Hop
	for i := len(hops) - 1; i >= 0; i-- {
		if hops[i].IP != "*" {
			last = &hops[i]
			break
		}
	}
	if last == nil {
		return
	}

	// 僅在 GeoConfidence 不是 "high" 且 TLD 國家與目前不同時修正
	if last.GeoConfidence != "high" && last.Country != tldCountry {
		last.Country = tldCountry
		last.GeoConfidence = "low" // TLD 仍是推測性質
		// 座標不修正（TLD 無法精確到城市）
	}
}

// isLikelyCDN 根據 ASN 判斷是否為已知 CDN/雲端業者
func isLikelyCDN(asn uint) bool {
	switch asn {
	case 13335, // Cloudflare
		20940, // Akamai
		16509, // Amazon CloudFront
		15169, // Google
		8075,  // Microsoft Azure
		54113, // Fastly
		14618, // Amazon AWS
		46489, // Twitch (Amazon)
		16625, // Akamai (alt)
		20446: // Stackpath / Highwinds
		return true
	}
	return false
}
