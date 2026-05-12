// Package geoip 提供 IP → 國家 / 城市 / 座標 / ASN 的對應查詢。
//
// 位置查詢支援兩個來源，由 GEOIP_PROVIDER 切換：
//   - maxmind（預設）：以 MaxMind GeoLite2 City/Country DB 為主
//   - ripe          ：以 RIPE IPmap 為主
//
// 主來源失敗時，若另一邊在 RIPE_IPMAP_ENABLED / MAXMIND_LOCATION_ENABLED
// 仍處於啟用狀態，會自動 fallback。ASN 一律由 MaxMind ASN DB 補（RIPE 不提供）。
//
// 對外 API（GetAll / GetCountry / GetCoords / GetASN / GetCountryCentroid）
// 與舊版相容，不影響 caller。詳見 doc/ripe-ipmap-integration.md。
package geoip

import (
	"context"
	"log/slog"
	"net"
	"os"

	"github.com/oschwald/geoip2-golang"
)

// MaxMind reader：套件層 singleton，由 init() 載入；查詢時皆做 nil 檢查。
var (
	countryDB *geoip2.Reader
	asnDB     *geoip2.Reader
)

func init() {
	loadCountryDB()
	loadASNDB()
}

func loadCountryDB() {
	path := os.Getenv("GEOIP_DB_PATH")
	if path == "" {
		path = "data/GeoLite2-City.mmdb"
	}
	db, err := geoip2.Open(path)
	if err != nil {
		// City DB 沒有時退回 Country DB（與舊版行為一致）
		if path == "data/GeoLite2-City.mmdb" {
			db, _ = geoip2.Open("data/GeoLite2-Country.mmdb")
		}
		if db == nil {
			slog.Warn("MaxMind City/Country DB unavailable; location fallback disabled",
				"component", "geoip", "path", path)
			return
		}
	}
	countryDB = db
}

func loadASNDB() {
	path := os.Getenv("ASN_DB_PATH")
	if path == "" {
		path = "data/GeoLite2-ASN.mmdb"
	}
	db, err := geoip2.Open(path)
	if err != nil {
		slog.Warn("MaxMind ASN DB unavailable; ASN/ISP enrichment disabled",
			"component", "geoip", "path", path, "error", err)
		return
	}
	asnDB = db
}

// GeoResult 合併 Country / City / Coords / ASN 的查詢結果，是套件對外的標準回傳型別。
type GeoResult struct {
	Country     string
	City        string    // 城市名（英文），如 "Taipei"
	Subdivision string    // 行政區 / 州，如 "Taipei City"
	Coords      []float64 // [lon, lat]，nil 表示無有效座標
	ASN         uint
	ISP         string
}

// GetAll 解析 IP 的位置 + ASN。位置優先走 RIPE IPmap（若啟用），ASN 由 MaxMind 補。
func GetAll(ipStr string) (GeoResult, error) {
	return ensureResolver().resolve(context.Background(), ipStr)
}

// GetCountry 為向後相容的便利函式：僅回傳國家代碼。
func GetCountry(ipStr string) (string, error) {
	r, err := GetAll(ipStr)
	if err != nil {
		return "", err
	}
	return r.Country, nil
}

// GetCoords 為向後相容的便利函式：僅回傳 [lon, lat]，無座標時回 nil。
func GetCoords(ipStr string) ([]float64, error) {
	r, err := GetAll(ipStr)
	if err != nil {
		return nil, err
	}
	return r.Coords, nil
}

// GetASN 為向後相容的便利函式：僅回傳 ASN 與 ISP 名稱。
func GetASN(ipStr string) (uint, string, error) {
	r, err := GetAll(ipStr)
	if err != nil {
		return 0, "", err
	}
	return r.ASN, r.ISP, nil
}

// applyMaxMindLocation 由 resolver 在 fallback 路徑呼叫。
// DB 未載入或國家代碼為空時回 false，呼叫端據此判斷是否「有解到位置」。
func applyMaxMindLocation(result *GeoResult, ip net.IP) bool {
	if countryDB == nil {
		return false
	}
	record, err := countryDB.City(ip)
	if err != nil {
		return false
	}
	code := record.Country.IsoCode
	if code == "" {
		return false
	}
	result.Country = code
	result.City = record.City.Names["en"]
	if len(record.Subdivisions) > 0 {
		result.Subdivision = record.Subdivisions[0].Names["en"]
	}
	lat, lon := record.Location.Latitude, record.Location.Longitude
	if !(lat == 0 && lon == 0) {
		result.Coords = []float64{lon, lat}
	}
	return true
}

// getMaxMindASN 由 resolver 呼叫，補 ASN/ISP；DB 未載入時回 (0, "Unknown", nil)。
func getMaxMindASN(ipStr string) (uint, string, error) {
	if asnDB == nil {
		return 0, "Unknown", nil
	}
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return 0, "", &net.ParseError{Type: "IP address", Text: ipStr}
	}
	record, err := asnDB.ASN(ip)
	if err != nil {
		return 0, "", err
	}
	return record.AutonomousSystemNumber, record.AutonomousSystemOrganization, nil
}

// countryCentroids 常用國家的中心座標 [lon, lat]，作為位置查詢失敗時的最後 fallback。
var countryCentroids = map[string][]float64{
	"TW": {121.0, 23.5},
	"JP": {138.0, 36.0},
	"KR": {127.5, 37.0},
	"CN": {104.0, 35.0},
	"HK": {114.17, 22.32},
	"SG": {103.85, 1.29},
	"US": {-98.0, 39.5},
	"GB": {-1.0, 53.0},
	"DE": {10.0, 51.0},
	"FR": {2.0, 46.0},
	"AU": {134.0, -25.0},
	"IN": {78.0, 21.0},
	"BR": {-51.0, -10.0},
	"CA": {-106.0, 56.0},
	"NL": {5.3, 52.1},
	"SE": {15.0, 62.0},
	"IE": {-8.0, 53.0},
	"FI": {26.0, 64.0},
}

// GetCountryCentroid 根據國家代碼回傳中心座標；查無時回 nil。
func GetCountryCentroid(country string) []float64 {
	if c, ok := countryCentroids[country]; ok {
		return c
	}
	return nil
}
