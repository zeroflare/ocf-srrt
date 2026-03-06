package traceroute

import (
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"
)

// logEnabled 控制是否啟用 traceroute 日誌
var logEnabled bool

// logFile 是日誌輸出的檔案
var logFile *os.File

// logMu 保護並發寫入
var logMu sync.Mutex

// InitLogger 初始化 traceroute 日誌記錄器
// enabled: 是否啟用；path: 日誌檔路徑（空字串代表停用）
func InitLogger(enabled bool, path string) error {
	logEnabled = enabled
	if !enabled || path == "" {
		slog.Info("Traceroute logger disabled", "component", "traceroute")
		return nil
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("cannot open traceroute log file %q: %w", path, err)
	}
	logFile = f
	slog.Info("Traceroute logger initialized", "component", "traceroute", "path", path)
	return nil
}

// CloseLogger 關閉日誌檔（在程式結束時呼叫）
func CloseLogger() {
	logMu.Lock()
	defer logMu.Unlock()
	if logFile != nil {
		logFile.Close()
		logFile = nil
	}
}

// LogResult 將一筆 traceroute 結果寫入日誌檔
func LogResult(result *TraceResult) {
	if !logEnabled || logFile == nil {
		return
	}

	logMu.Lock()
	defer logMu.Unlock()

	ts := time.Now().Format("2006-01-02 15:04:05")
	fmt.Fprintf(logFile, "\n[%s] TARGET: %s | STATUS: %s | HOPS: %d\n",
		ts, result.Target, result.Status, len(result.Hops))

	for _, hop := range result.Hops {
		if hop.IP == "*" {
			fmt.Fprintf(logFile, "  HOP %3d: *\n", hop.Index)
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
			fmt.Fprintf(logFile, "  HOP %3d: %-20s (%s)%s  %.2fms\n",
				hop.Index, hop.IP, countryStr, coordStr, hop.Latency)
		}
	}
}
