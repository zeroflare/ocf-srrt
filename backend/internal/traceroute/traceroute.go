package traceroute

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"ocf-srrt/backend/internal/geoip"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// validTargetRe 預編譯的合法 target 正規表達式（FQDN 或 IP）
var validTargetRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,252}$`)

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
	Coords        []float64 `json:"coords"` // [lon, lat]
	ASN           uint      `json:"asn"`
	ISP           string    `json:"isp"`
	GeoConfidence string    `json:"geoConfidence"` // "high" / "low" / "none"
}

// TraceResult 包含完整的 Traceroute 結果
type TraceResult struct {
	Target string    `json:"target"`
	Hops   []Hop     `json:"hops"`
	Status string    `json:"status"` // "completed", "timeout", "error"
	Time   time.Time `json:"time"`
	Cached bool      `json:"cached"` // 是否為快取結果
}

// Run 執行 mtr 指令並解析 JSON 結果。
// localIP 為本機公網 IP（用於 Hop 0），空字串則跳過。
func Run(ctx context.Context, target string, localIP string) (*TraceResult, error) {
	// 驗證輸入，防止指令注入
	if strings.HasPrefix(target, "-") {
		return nil, fmt.Errorf("invalid target")
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

	// 使用 mtr --report --report-cycles 10 --json
	cmd := exec.CommandContext(ctx, "mtr", "--report", "--report-cycles", "10", "--json", target)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("mtr execution failed: %w", err)
	}

	var report mtrReport
	if err := json.Unmarshal(output, &report); err != nil {
		return nil, fmt.Errorf("failed to parse mtr JSON output: %w", err)
	}

	result := &TraceResult{
		Target: target,
		Hops:   []Hop{},
		Status: "completed",
		Time:   time.Now(),
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

		// 對有效 IP 執行 GeoIP 補全
		if hop.IP != "*" {
			country, _ := geoip.GetCountry(hop.IP)
			coords, _ := geoip.GetCoords(hop.IP)
			hop.Country = country
			hop.Coords = coords
			asn, isp, _ := geoip.GetASN(hop.IP)
			hop.ASN = asn
			hop.ISP = isp
			hop.GeoConfidence = "high"
			if hop.Country == "" || hop.Country == "XX" {
				hop.GeoConfidence = "none"
			}
		} else {
			hop.GeoConfidence = "none"
		}

		result.Hops = append(result.Hops, hop)
	}

	// 插入 Hop 0（本機位置）
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
		country, _ := geoip.GetCountry(localIP)
		coords, _ := geoip.GetCoords(localIP)
		hop0.Country = country
		hop0.Coords = coords
		asn, isp, _ := geoip.GetASN(localIP)
		hop0.ASN = asn
		hop0.ISP = isp
		if hop0.Country == "" || hop0.Country == "XX" {
			hop0.GeoConfidence = "none"
		}
		result.Hops = append([]Hop{hop0}, result.Hops...)
	}

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
