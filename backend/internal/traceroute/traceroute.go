package traceroute

import (
	"bufio"
	"context"
	"fmt"
	"ocf-srrt/backend/internal/geoip"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Hop 代表 Traceroute 中的一跳
type Hop struct {
	Index   int       `json:"index"`
	IP      string    `json:"ip"`
	Host    string    `json:"host"`
	Latency float64   `json:"latency"` // 單位：ms（取 RTTs 平均值，向後相容）
	RTTs    []float64 `json:"rtts"`    // 多次探測的 RTT 值 (ms)
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

// Run 執行系統 traceroute 指令並解析結果
func Run(ctx context.Context, target string) (*TraceResult, error) {
	// 驗證輸入，防止指令注入
	if matched, _ := regexp.MatchString(`^[a-zA-Z0-9\.-]+$`, target); !matched {
		return nil, fmt.Errorf("invalid target")
	}

	// 使用系統 traceroute 指令
	// -n: 不解析網域名稱 (加速)
	// -w 1: 等待回應時間 1 秒
	// -q 3: 每一跳送 3 個封包 (取得多次 RTT)
	cmd := exec.CommandContext(ctx, "traceroute", "-n", "-w", "1", "-q", "3", target)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	result := &TraceResult{
		Target: target,
		Hops:   []Hop{},
		Time:   time.Now(),
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		// 試著解析每一行（-q 3 模式）
		hop := parseLine(line)
		if hop != nil {
			if hop.IP != "*" {
				country, _ := geoip.GetCountry(hop.IP)
				coords, _ := geoip.GetCoords(hop.IP)
				hop.Country = country
				hop.Coords = coords
				asn, isp, _ := geoip.GetASN(hop.IP)
				hop.ASN = asn
				hop.ISP = isp
			}
			result.Hops = append(result.Hops, *hop)
		}
	}

	if err := cmd.Wait(); err != nil {
		// 如果部分成功但最後報錯，我們還是回傳已抓到的資料
		result.Status = "error"
	} else {
		result.Status = "completed"
	}

	return result, nil
}

func parseLine(line string) *Hop {
	// -q 3 模式範例:
	// " 1  192.168.1.1  0.582 ms  0.491 ms  0.523 ms"
	// " 2  * * *"
	// " 3  10.0.0.1  1.234 ms  * 1.567 ms"
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return nil
	}

	index, err := strconv.Atoi(fields[0])
	if err != nil {
		return nil
	}

	ip := fields[1]

	// 全部是 * 的情況
	allStar := true
	for _, f := range fields[1:] {
		if f != "*" && f != "ms" {
			if _, parseErr := strconv.ParseFloat(f, 64); parseErr != nil {
				// 可能是 IP 位址
				if f != ip {
					continue
				}
			}
			allStar = false
		}
	}
	if ip == "*" && allStar {
		return &Hop{Index: index, IP: "*", Latency: 0, RTTs: []float64{}}
	}

	// 收集所有 RTT 值
	var rtts []float64
	for i := 2; i < len(fields); i++ {
		if fields[i] == "ms" && i > 0 {
			if v, parseErr := strconv.ParseFloat(fields[i-1], 64); parseErr == nil {
				rtts = append(rtts, v)
			}
		}
	}

	// 計算平均延遲
	latency := 0.0
	if len(rtts) > 0 {
		sum := 0.0
		for _, r := range rtts {
			sum += r
		}
		latency = sum / float64(len(rtts))
	}

	return &Hop{
		Index:   index,
		IP:      ip,
		Latency: latency,
		RTTs:    rtts,
	}
}
