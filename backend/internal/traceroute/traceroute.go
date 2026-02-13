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
	Latency float64   `json:"latency"` // 單位：ms
	Country string    `json:"country"`
	Coords  []float64 `json:"coords"` // [lon, lat]
}

// TraceResult 包含完整的 Traceroute 結果
type TraceResult struct {
	Target string    `json:"target"`
	Hops   []Hop     `json:"hops"`
	Status string    `json:"status"` // "completed", "timeout", "error"
	Time   time.Time `json:"time"`
}

var (
	// 解析範例: " 1  192.168.1.1 (192.168.1.1)  1.234 ms"
	hopRegex = regexp.MustCompile(`^\s*(\d+)\s+([^\s\(]+)\s+\(([^\)]+)\)\s+([\d\.]+)\s+ms`)
	// 簡化解析範例 (某些系統): " 1  192.168.1.1  1.234 ms"
	simpleHopRegex = regexp.MustCompile(`^\s*(\d+)\s+([\d\.]+)\s+ms`)
)

// Run 執行系統 traceroute 指令並解析結果
func Run(ctx context.Context, target string) (*TraceResult, error) {
	// 驗證輸入，防止指令注入
	if matched, _ := regexp.MatchString(`^[a-zA-Z0-9\.-]+$`, target); !matched {
		return nil, fmt.Errorf("invalid target")
	}

	// 使用系統 traceroute 指令
	// -n: 不解析網域名稱 (加速)
	// -w 1: 等待回應時間 1 秒
	// -q 1: 每一跳只送一個封包 (加速)
	cmd := exec.CommandContext(ctx, "traceroute", "-n", "-w", "1", "-q", "1", target)
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
		// 試著解析每一行
		hop := parseLine(line)
		if hop != nil {
			if hop.IP != "*" {
				country, _ := geoip.GetCountry(hop.IP)
				coords, _ := geoip.GetCoords(hop.IP)
				hop.Country = country
				hop.Coords = coords
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
	// macOS/Linux 範例: " 1  192.168.1.1  0.582 ms"
	fields := strings.Fields(line)
	if len(fields) < 4 {
		return nil
	}

	index, err := strconv.Atoi(fields[0])
	if err != nil {
		return nil
	}

	ip := fields[1]
	if ip == "*" {
		return &Hop{Index: index, IP: "*", Latency: 0}
	}

	// 找到 ms 關鍵字，取其前一個欄位為延遲
	latency := 0.0
	for i := 2; i < len(fields); i++ {
		if fields[i] == "ms" && i > 0 {
			latency, _ = strconv.ParseFloat(fields[i-1], 64)
			break
		}
	}

	return &Hop{
		Index:   index,
		IP:      ip,
		Latency: latency,
	}
}
