package geoip

import (
	"log"
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
			log.Printf("Warning: Could not open Country/City GeoIP database at %s. Country features will be disabled.", countryDBPath)
		}
	}

	asnDBPath := os.Getenv("ASN_DB_PATH")
	if asnDBPath == "" {
		asnDBPath = "data/GeoLite2-ASN.mmdb"
	}
	asnDB, err = geoip2.Open(asnDBPath)
	if err != nil {
		log.Printf("Warning: Could not open ASN GeoIP database at %s. ASN features will be disabled.", asnDBPath)
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

	return []float64{record.Location.Longitude, record.Location.Latitude}, nil
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
