package types

import "time"

// DNSQueryRecord 包含一次 DNS 查詢的完整資訊
type DNSQueryRecord struct {
	Timestamp         time.Time `json:"timestamp"`
	Domain            string    `json:"domain"`
	Type              string    `json:"type"`
	ResultIP          string    `json:"resultIp"`
	IsForeign         bool      `json:"isForeign"`
	ForeignConfidence string    `json:"foreignConfidence"` // "high" / "low" / ""
	Latency           float64   `json:"latency"`           // ms
	SourceIP          string    `json:"sourceIp"`
	Country           string    `json:"country"`
	City              string    `json:"city,omitempty"`
	Subdivision       string    `json:"subdivision,omitempty"`
	ASN               uint      `json:"asn"`
	ISP               string    `json:"isp"`
	AppName           string    `json:"appName"`
	AppCategory       string    `json:"appCategory"`
	OS                string    `json:"os,omitempty"`
	Longitude         float64   `json:"longitude,omitempty"`
	Latitude          float64   `json:"latitude,omitempty"`

	// 推測標記欄位 — 標示各欄位的推測程度
	AppMatchMethod string `json:"appMatchMethod,omitempty"` // "exact" / "regex" / "heuristic" / ""
	OsInferred     bool   `json:"osInferred,omitempty"`     // OS 一律為推測
	GeoInferred    bool   `json:"geoInferred,omitempty"`    // GeoIP 資料庫推估
}
