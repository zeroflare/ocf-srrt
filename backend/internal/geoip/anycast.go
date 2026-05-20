package geoip

// 已知以 anycast 對外服務的 CDN / 邊緣服務商 ASN。
//
// 設計理由：
//   - MaxMind GeoLite2 對這類 ASN 的 IP 經常拿不到具體國家（同一 IP 由全球多個資料中心對外宣告），
//     resolver 會在 applyDefaults 把 Country 補成 "XX"。
//   - 純靠 ISP 字串比對（"Cloudflare"、"Akamai"…）容易誤判（例如多個 ISP 名稱包含 cloudflare）；
//     用 ASN 數字比對更穩定，也避免後端依賴可能變動的 ISP 名稱字串。
//
// 維護策略：
//   - 只收「核心業務即 anycast 邊緣」的 ASN（避免把 AWS/Azure/GCP 這類「也提供一般 VM」的雲商納入，
//     否則所有非 CDN 流量都會被標成 Anycast）。
//   - 若未來需擴充，請以「該 ASN 主要負責對外 anycast 邊緣節點」為加入標準。
var anycastASNs = map[uint]string{
	// Cloudflare
	13335: "Cloudflare",
	// Akamai 系列
	20940: "Akamai",
	16625: "Akamai",
	35994: "Akamai",
	32787: "Akamai",
	// Fastly
	54113: "Fastly",
	// Limelight / Edgio
	22822: "Edgio",
	38622: "Edgio",
	// Imperva (Incapsula)
	19551: "Imperva",
	// G-Core Labs
	199524: "G-Core",
	// CDN77
	60068: "CDN77",
	// StackPath / Highwinds
	33438: "StackPath",
	// BunnyCDN
	200325: "BunnyCDN",
}

// IsAnycastASN 判斷給定 ASN 是否屬於已知 anycast 服務商。
func IsAnycastASN(asn uint) bool {
	if asn == 0 {
		return false
	}
	_, ok := anycastASNs[asn]
	return ok
}

// AnycastProvider 回傳 ASN 對應的服務商名稱（用於 logging / debug）；未知時回傳空字串。
func AnycastProvider(asn uint) string {
	return anycastASNs[asn]
}
