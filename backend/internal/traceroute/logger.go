package traceroute

import (
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"
)

// traceLogger 封裝 traceroute 日誌狀態，透過 mutex 保護所有讀寫
type traceLogger struct {
	mu      sync.Mutex
	enabled bool
	file    *os.File
}

var logger traceLogger

// InitLogger 初始化 traceroute 日誌記錄器
// enabled: 是否啟用；path: 日誌檔路徑（空字串代表停用）
func InitLogger(enabled bool, path string) error {
	logger.mu.Lock()
	defer logger.mu.Unlock()

	logger.enabled = enabled
	if !enabled || path == "" {
		slog.Info("Traceroute logger disabled", "component", "traceroute")
		return nil
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("cannot open traceroute log file %q: %w", path, err)
	}
	logger.file = f
	slog.Info("Traceroute logger initialized", "component", "traceroute", "path", path)
	return nil
}

// CloseLogger 關閉日誌檔（在程式結束時呼叫）
func CloseLogger() {
	logger.mu.Lock()
	defer logger.mu.Unlock()
	if logger.file != nil {
		logger.file.Close()
		logger.file = nil
	}
}

// LogResult 將一筆 traceroute 結果寫入日誌檔
func LogResult(result *TraceResult) {
	logger.mu.Lock()
	defer logger.mu.Unlock()

	if !logger.enabled || logger.file == nil {
		return
	}

	ts := time.Now().Format("2006-01-02 15:04:05")
	fmt.Fprintf(logger.file, "\n[%s] TARGET: %s | STATUS: %s | HOPS: %d\n",
		ts, result.Target, result.Status, len(result.Hops))

	for _, hop := range result.Hops {
		if hop.IP == "*" {
			fmt.Fprintf(logger.file, "  HOP %3d: *\n", hop.Index)
		} else {
			coordStr := ""
			if len(hop.Coords) >= 2 {
				// Coords 格式：[lon, lat]
				coordStr = fmt.Sprintf("  [lat=%.4f, lon=%.4f]", hop.Coords[1], hop.Coords[0])
			}
			countryStr := hop.Country
			if countryStr == "" {
				countryStr = "??"
			}
			fmt.Fprintf(logger.file, "  HOP %3d: %-20s (%s)%s  avg=%.2fms best=%.2fms worst=%.2fms stdev=%.2fms loss=%.1f%%\n",
				hop.Index, hop.IP, countryStr, coordStr, hop.Latency, hop.Best, hop.Worst, hop.StDev, hop.Loss)
		}
	}
}
