package geoip

import (
	"log/slog"
	"net"
	"os"

	"github.com/oschwald/geoip2-golang"
)

var (
	countryDB *geoip2.Reader
	asnDB     *geoip2.Reader
)

func init() {
	var err error
	countryDBPath := os.Getenv("GEOIP_DB_PATH")
	if countryDBPath == "" {
		countryDBPath = "data/GeoLite2-City.mmdb"
	}
	countryDB, err = geoip2.Open(countryDBPath)
	if err != nil {
		// Fallback for default Country DB if City DB not found
		if countryDBPath == "data/GeoLite2-City.mmdb" {
			countryDB, _ = geoip2.Open("data/GeoLite2-Country.mmdb")
		}
		if countryDB == nil {
			slog.Warn("Could not open Country/City GeoIP database, country features disabled", "component", "geoip", "path", countryDBPath)
		}
	}

	asnDBPath := os.Getenv("ASN_DB_PATH")
	if asnDBPath == "" {
		asnDBPath = "data/GeoLite2-ASN.mmdb"
	}
	asnDB, err = geoip2.Open(asnDBPath)
	if err != nil {
		slog.Warn("Could not open ASN GeoIP database, ASN features disabled", "component", "geoip", "path", asnDBPath)
	}
}

// GetCountry 根據 IP 位址查找國家代碼
func GetCountry(ipStr string) (string, error) {
	if countryDB == nil {
		return "XX", nil
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return "", &net.ParseError{Type: "IP address", Text: ipStr}
	}

	record, err := countryDB.Country(ip)
	if err != nil {
		return "", err
	}

	return record.Country.IsoCode, nil
}

// GetCoords 根據 IP 位址查找經緯度 [lon, lat]
func GetCoords(ipStr string) ([]float64, error) {
	if countryDB == nil {
		return nil, nil
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return nil, &net.ParseError{Type: "IP address", Text: ipStr}
	}

	record, err := countryDB.City(ip)
	if err != nil {
		return nil, err
	}

	lat := record.Location.Latitude
	lon := record.Location.Longitude
	// [0, 0] 座標（大西洋幾內亞灣）視為無有效地理資料
	if lat == 0 && lon == 0 {
		return nil, nil
	}
	return []float64{lon, lat}, nil
}

// GeoResult 合併 Country + Coords + ASN 的查詢結果
type GeoResult struct {
	Country     string
	City        string    // 城市名（英文），如 "Taipei"
	Subdivision string    // 行政區/州，如 "Taipei City"
	Coords      []float64 // [lon, lat]，nil 表示無有效座標
	ASN         uint
	ISP         string
}

// GetAll 一次 IP 解析，合併查詢 Country/Coords/ASN，減少重複 MMDB 查詢
func GetAll(ipStr string) (GeoResult, error) {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return GeoResult{}, &net.ParseError{Type: "IP address", Text: ipStr}
	}

	var result GeoResult

	if countryDB != nil {
		record, err := countryDB.City(ip)
		if err == nil {
			result.Country = record.Country.IsoCode
			result.City = record.City.Names["en"]
			if len(record.Subdivisions) > 0 {
				result.Subdivision = record.Subdivisions[0].Names["en"]
			}
			lat := record.Location.Latitude
			lon := record.Location.Longitude
			if !(lat == 0 && lon == 0) {
				result.Coords = []float64{lon, lat}
			}
		}
	}

	if asnDB != nil {
		record, err := asnDB.ASN(ip)
		if err == nil {
			result.ASN = record.AutonomousSystemNumber
			result.ISP = record.AutonomousSystemOrganization
		}
	}

	if result.Country == "" {
		result.Country = "XX"
	}
	if result.ISP == "" {
		result.ISP = "Unknown"
	}

	return result, nil
}

// countryCentroids 常用國家的中心座標 [lon, lat]，作為 City DB 查不到座標時的 fallback
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

// GetCountryCentroid 根據國家代碼回傳中心座標，查無時回傳 nil
func GetCountryCentroid(country string) []float64 {
	if c, ok := countryCentroids[country]; ok {
		return c
	}
	return nil
}

// GetASN 根據 IP 位址查找 ASN 和 ISP 名稱 (B-05)
func GetASN(ipStr string) (uint, string, error) {
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
