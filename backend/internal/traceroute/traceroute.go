package traceroute

import (
	"context"
	"encoding/json"
	"fmt"
	"ocf-srrt/backend/internal/geoip"
	"os/exec"
	"regexp"
	"time"
)

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
	Index   int       `json:"index"`
	IP      string    `json:"ip"`
	Host    string    `json:"host"`
	Latency float64   `json:"latency"` // 對應 mtr 的 Avg (ms)
	RTTs    []float64 `json:"rtts"`    // 保留為空陣列（向後相容）
	Loss    float64   `json:"loss"`    // 丟包率 (0.0 ~ 100.0)
	Best    float64   `json:"best"`    // 最低延遲 ms
	Worst   float64   `json:"worst"`   // 最高延遲 ms
	StDev   float64   `json:"stdev"`   // 標準差 ms
	Country string    `json:"country"`
	Coords  []float64 `json:"coords"` // [lon, lat]
	ASN     uint      `json:"asn"`
	ISP     string    `json:"isp"`
}

// TraceResult 包含完整的 Traceroute 結果
type TraceResult struct {
	Target string    `json:"target"`
	Hops   []Hop     `json:"hops"`
	Status string    `json:"status"` // "completed", "timeout", "error"
	Time   time.Time `json:"time"`
}

// Run 執行 mtr 指令並解析 JSON 結果
func Run(ctx context.Context, target string) (*TraceResult, error) {
	// 驗證輸入，防止指令注入
	if matched, _ := regexp.MatchString(`^[a-zA-Z0-9\.-]+$`, target); !matched {
		return nil, fmt.Errorf("invalid target")
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
		}

		result.Hops = append(result.Hops, hop)
	}

	return result, nil
}
