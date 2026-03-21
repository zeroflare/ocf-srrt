package traceroute

import "strings"

// ccTLD → 國家代碼對照表（常見 country-code TLD）
var ccTLDMap = map[string]string{
	"tw": "TW", "jp": "JP", "kr": "KR", "cn": "CN",
	"hk": "HK", "sg": "SG", "th": "TH", "my": "MY",
	"id": "ID", "ph": "PH", "vn": "VN", "in": "IN",
	"au": "AU", "nz": "NZ",
	"us": "US", "ca": "CA", "mx": "MX", "br": "BR",
	"ar": "AR", "cl": "CL", "co": "CO", "pe": "PE",
	"uk": "GB", "de": "DE", "fr": "FR", "it": "IT",
	"es": "ES", "nl": "NL", "be": "BE", "ch": "CH",
	"at": "AT", "se": "SE", "no": "NO", "dk": "DK",
	"fi": "FI", "pl": "PL", "cz": "CZ", "ie": "IE",
	"pt": "PT", "ru": "RU", "ua": "UA", "tr": "TR",
	"il": "IL", "ae": "AE", "sa": "SA", "za": "ZA",
	"ke": "KE", "ng": "NG", "eg": "EG",
}

// extractCountryFromTLD 從域名的 TLD 推測國家代碼。
// 支援 .tw、.gov.tw、.co.jp 等複合 ccTLD。
// 回傳空字串表示無法判斷（如 .com, .net 等 gTLD）。
func extractCountryFromTLD(domain string) string {
	if domain == "" {
		return ""
	}
	domain = strings.ToLower(strings.TrimSuffix(domain, "."))

	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return ""
	}

	// 取最後一段（TLD）
	tld := parts[len(parts)-1]
	if country, ok := ccTLDMap[tld]; ok {
		return country
	}

	return ""
}
