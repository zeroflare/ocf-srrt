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
	ASN               uint      `json:"asn"`
	ISP               string    `json:"isp"`
	AppName           string    `json:"appName"`
	AppCategory       string    `json:"appCategory"`
	Longitude         float64   `json:"longitude,omitempty"`
	Latitude          float64   `json:"latitude,omitempty"`
}
