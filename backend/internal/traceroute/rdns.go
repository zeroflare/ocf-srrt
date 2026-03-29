package traceroute

import (
	"regexp"
	"strings"
)

// iataEntry 描述 IATA 機場代碼對應的地理資訊
type iataEntry struct {
	Country string
	City    string
	Coords  []float64 // [lon, lat]
}

// iataDB 常見 IATA 機場代碼 → 國家/城市/座標對照表
// 涵蓋亞太、北美、歐洲主要樞紐（約 80+ 筆）
var iataDB = map[string]iataEntry{
	// 台灣
	"tpe": {Country: "TW", City: "Taipei", Coords: []float64{121.5654, 25.0330}},
	"khh": {Country: "TW", City: "Kaohsiung", Coords: []float64{120.3133, 22.6273}},
	"txg": {Country: "TW", City: "Taichung", Coords: []float64{120.6736, 24.1477}},

	// 日本
	"nrt": {Country: "JP", City: "Tokyo-Narita", Coords: []float64{139.6917, 35.6895}},
	"hnd": {Country: "JP", City: "Tokyo-Haneda", Coords: []float64{139.7798, 35.5494}},
	"kix": {Country: "JP", City: "Osaka-Kansai", Coords: []float64{135.5023, 34.6937}},
	"itm": {Country: "JP", City: "Osaka-Itami", Coords: []float64{135.4382, 34.7855}},
	"fuk": {Country: "JP", City: "Fukuoka", Coords: []float64{130.4017, 33.5904}},
	"cts": {Country: "JP", City: "Sapporo", Coords: []float64{141.3469, 43.0642}},

	// 韓國
	"icn": {Country: "KR", City: "Seoul-Incheon", Coords: []float64{126.9780, 37.5665}},
	"gmp": {Country: "KR", City: "Seoul-Gimpo", Coords: []float64{126.7908, 37.5585}},

	// 中國
	"pek": {Country: "CN", City: "Beijing", Coords: []float64{116.4074, 39.9042}},
	"pvg": {Country: "CN", City: "Shanghai", Coords: []float64{121.4737, 31.2304}},
	"sha": {Country: "CN", City: "Shanghai-Hongqiao", Coords: []float64{121.3365, 31.1979}},
	"can": {Country: "CN", City: "Guangzhou", Coords: []float64{113.2644, 23.1291}},
	"szx": {Country: "CN", City: "Shenzhen", Coords: []float64{114.0579, 22.5431}},
	"hkg": {Country: "HK", City: "Hong Kong", Coords: []float64{114.1694, 22.3193}},

	// 東南亞
	"sin": {Country: "SG", City: "Singapore", Coords: []float64{103.8198, 1.3521}},
	"bkk": {Country: "TH", City: "Bangkok", Coords: []float64{100.5018, 13.7563}},
	"kul": {Country: "MY", City: "Kuala Lumpur", Coords: []float64{101.6869, 3.1390}},
	"cgk": {Country: "ID", City: "Jakarta", Coords: []float64{106.8456, -6.2088}},
	"mnl": {Country: "PH", City: "Manila", Coords: []float64{120.9842, 14.5995}},
	"sgn": {Country: "VN", City: "Ho Chi Minh", Coords: []float64{106.6297, 10.8231}},
	"han": {Country: "VN", City: "Hanoi", Coords: []float64{105.8342, 21.0278}},

	// 南亞 / 大洋洲
	"bom": {Country: "IN", City: "Mumbai", Coords: []float64{72.8777, 19.0760}},
	"del": {Country: "IN", City: "Delhi", Coords: []float64{77.1025, 28.7041}},
	"maa": {Country: "IN", City: "Chennai", Coords: []float64{80.2707, 13.0827}},
	"syd": {Country: "AU", City: "Sydney", Coords: []float64{151.2093, -33.8688}},
	"mel": {Country: "AU", City: "Melbourne", Coords: []float64{144.9631, -37.8136}},
	"akl": {Country: "NZ", City: "Auckland", Coords: []float64{174.7633, -36.8485}},

	// 北美
	"lax": {Country: "US", City: "Los Angeles", Coords: []float64{-118.2437, 34.0522}},
	"sfo": {Country: "US", City: "San Francisco", Coords: []float64{-122.4194, 37.7749}},
	"sjc": {Country: "US", City: "San Jose", Coords: []float64{-121.8863, 37.3382}},
	"sea": {Country: "US", City: "Seattle", Coords: []float64{-122.3321, 47.6062}},
	"ord": {Country: "US", City: "Chicago", Coords: []float64{-87.6298, 41.8781}},
	"dfw": {Country: "US", City: "Dallas", Coords: []float64{-96.7970, 32.7767}},
	"iad": {Country: "US", City: "Washington-Dulles", Coords: []float64{-77.0369, 38.9072}},
	"dca": {Country: "US", City: "Washington-Reagan", Coords: []float64{-77.0402, 38.8521}},
	"ewr": {Country: "US", City: "Newark", Coords: []float64{-74.1745, 40.6895}},
	"jfk": {Country: "US", City: "New York-JFK", Coords: []float64{-73.7781, 40.6413}},
	"atl": {Country: "US", City: "Atlanta", Coords: []float64{-84.3880, 33.7490}},
	"mia": {Country: "US", City: "Miami", Coords: []float64{-80.1918, 25.7617}},
	"den": {Country: "US", City: "Denver", Coords: []float64{-104.9903, 39.7392}},
	"phx": {Country: "US", City: "Phoenix", Coords: []float64{-112.0740, 33.4484}},
	"pdx": {Country: "US", City: "Portland", Coords: []float64{-122.6765, 45.5155}},
	"iah": {Country: "US", City: "Houston", Coords: []float64{-95.3698, 29.7604}},
	"bos": {Country: "US", City: "Boston", Coords: []float64{-71.0589, 42.3601}},
	"msp": {Country: "US", City: "Minneapolis", Coords: []float64{-93.2650, 44.9778}},
	"dtw": {Country: "US", City: "Detroit", Coords: []float64{-83.0458, 42.3314}},
	"slc": {Country: "US", City: "Salt Lake City", Coords: []float64{-111.8910, 40.7608}},
	"las": {Country: "US", City: "Las Vegas", Coords: []float64{-115.1398, 36.1699}},
	"yyz": {Country: "CA", City: "Toronto", Coords: []float64{-79.3832, 43.6532}},
	"yvr": {Country: "CA", City: "Vancouver", Coords: []float64{-123.1216, 49.2827}},
	"yul": {Country: "CA", City: "Montreal", Coords: []float64{-73.5673, 45.5017}},

	// 歐洲
	"lhr": {Country: "GB", City: "London-Heathrow", Coords: []float64{-0.1278, 51.5074}},
	"lgw": {Country: "GB", City: "London-Gatwick", Coords: []float64{-0.1901, 51.1537}},
	"ams": {Country: "NL", City: "Amsterdam", Coords: []float64{4.8952, 52.3676}},
	"fra": {Country: "DE", City: "Frankfurt", Coords: []float64{8.6821, 50.1109}},
	"cdg": {Country: "FR", City: "Paris-CDG", Coords: []float64{2.3522, 48.8566}},
	"mad": {Country: "ES", City: "Madrid", Coords: []float64{-3.7038, 40.4168}},
	"bcn": {Country: "ES", City: "Barcelona", Coords: []float64{2.1734, 41.3851}},
	"fco": {Country: "IT", City: "Rome", Coords: []float64{12.4964, 41.9028}},
	"mxp": {Country: "IT", City: "Milan", Coords: []float64{9.1900, 45.4642}},
	"zrh": {Country: "CH", City: "Zurich", Coords: []float64{8.5417, 47.3769}},
	"vie": {Country: "AT", City: "Vienna", Coords: []float64{16.3738, 48.2082}},
	"arn": {Country: "SE", City: "Stockholm", Coords: []float64{18.0686, 59.3293}},
	"cph": {Country: "DK", City: "Copenhagen", Coords: []float64{12.5683, 55.6761}},
	"hel": {Country: "FI", City: "Helsinki", Coords: []float64{24.9384, 60.1699}},
	"waw": {Country: "PL", City: "Warsaw", Coords: []float64{21.0122, 52.2297}},
	"prg": {Country: "CZ", City: "Prague", Coords: []float64{14.4378, 50.0755}},
	"ist": {Country: "TR", City: "Istanbul", Coords: []float64{28.9784, 41.0082}},
	"dub": {Country: "IE", City: "Dublin", Coords: []float64{-6.2603, 53.3498}},
	"osl": {Country: "NO", City: "Oslo", Coords: []float64{10.7522, 59.9139}},
	"bru": {Country: "BE", City: "Brussels", Coords: []float64{4.3517, 50.8503}},
	"lis": {Country: "PT", City: "Lisbon", Coords: []float64{-9.1393, 38.7223}},
	"muc": {Country: "DE", City: "Munich", Coords: []float64{11.5820, 48.1351}},
	"ham": {Country: "DE", City: "Hamburg", Coords: []float64{9.9937, 53.5511}},
	"dus": {Country: "DE", City: "Dusseldorf", Coords: []float64{6.7735, 51.2277}},

	// 中東 / 非洲
	"dxb": {Country: "AE", City: "Dubai", Coords: []float64{55.2708, 25.2048}},
	"auh": {Country: "AE", City: "Abu Dhabi", Coords: []float64{54.3773, 24.4539}},
	"doh": {Country: "QA", City: "Doha", Coords: []float64{51.5310, 25.2854}},
	"jnb": {Country: "ZA", City: "Johannesburg", Coords: []float64{28.0473, -26.2041}},
	"cpt": {Country: "ZA", City: "Cape Town", Coords: []float64{18.4241, -33.9249}},

	// 南美
	"gru": {Country: "BR", City: "Sao Paulo", Coords: []float64{-46.6333, -23.5505}},
	"gig": {Country: "BR", City: "Rio de Janeiro", Coords: []float64{-43.1729, -22.9068}},
	"eze": {Country: "AR", City: "Buenos Aires", Coords: []float64{-58.3816, -34.6037}},
	"scl": {Country: "CL", City: "Santiago", Coords: []float64{-70.6693, -33.4489}},
	"bog": {Country: "CO", City: "Bogota", Coords: []float64{-74.0721, 4.7110}},
	"lim": {Country: "PE", City: "Lima", Coords: []float64{-77.0428, -12.0464}},
}

// 已知 CDN 業者的 rDNS hostname pattern
// 格式：regexp → 從 hostname 中提取 IATA 代碼的 submatch group index
var cdnRDNSPatterns = []*regexp.Regexp{
	// Cloudflare: e.g. "172.68.101.73" rDNS 不含 PoP，但有些如 "tpe01.cloudflare.net"
	regexp.MustCompile(`(?i)([a-z]{3})\d{2,3}[a-z]*\.cloudflare\.net`),
	// Google: e.g. "tpe01s10-in-f14.1e100.net", "tsa03s01-in-f4.1e100.net"
	regexp.MustCompile(`(?i)([a-z]{3})\d{2,3}s\d+-in-.*\.1e100\.net`),
	// Akamai: 格式多變，嘗試取 hostname 中的三字母 PoP
	regexp.MustCompile(`(?i)a\d+-\d+-\d+-\d+\.deploy\.static\.akamaitechnologies\.com`),
	// Fastly: e.g. "cache-tpe2230045.prod.fastly.net"
	regexp.MustCompile(`(?i)cache-([a-z]{3})\d+\.prod\.fastly\.net`),
	// EdgeCast / Verizon: e.g. "ae-1.r01.tpe01.tw.bb.gin.ntt.net"
	regexp.MustCompile(`(?i)\.([a-z]{3})\d{2,3}\.[a-z]{2}\.`),
	// 通用：hostname 中出現三字母機場代碼 + 數字（常見 ISP backbone 命名）
	regexp.MustCompile(`(?i)(?:^|[-\.])([a-z]{3})\d{2,3}(?:[-\.]|$)`),
}

// extractPoPFromRDNS 嘗試從 rDNS hostname 解析 IATA PoP 城市代碼
// 回傳 iataEntry 及是否成功
func extractPoPFromRDNS(hostname string) (iataEntry, bool) {
	if hostname == "" || hostname == "local" {
		return iataEntry{}, false
	}

	lower := strings.ToLower(hostname)

	for _, re := range cdnRDNSPatterns {
		matches := re.FindStringSubmatch(lower)
		if len(matches) >= 2 {
			code := matches[1]
			if entry, ok := iataDB[code]; ok {
				return entry, true
			}
		}
	}

	return iataEntry{}, false
}
