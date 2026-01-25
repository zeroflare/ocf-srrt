package types

import "time"

// DNSQueryRecord 包含一次 DNS 查詢的完整資訊
type DNSQueryRecord struct {
	Timestamp   time.Time `json:"timestamp"`
	Domain      string    `json:"domain"`
	Type        string    `json:"type"`
	ResultIP    string    `json:"resultIp"`
	IsForeign   bool      `json:"isForeign"`
	SourceIP    string    `json:"sourceIp"`
	Country     string    `json:"country"`
	ASN         uint      `json:"asn"`
	ISP         string    `json:"isp"`
	AppName     string    `json:"appName"`
	AppCategory string    `json:"appCategory"`
}
