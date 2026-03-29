package traceroute

import (
	"testing"
)

func TestExtractPoPFromRDNS(t *testing.T) {
	tests := []struct {
		hostname    string
		wantCountry string
		wantOk      bool
	}{
		// Cloudflare PoP
		{"tpe01.cloudflare.net", "TW", true},
		{"nrt04.cloudflare.net", "JP", true},
		{"lax17a.cloudflare.net", "US", true},
		// Google 1e100.net
		{"tpe01s10-in-f14.1e100.net", "TW", true},
		{"nrt12s37-in-f4.1e100.net", "JP", true},
		// Fastly
		{"cache-tpe2230045.prod.fastly.net", "TW", true},
		{"cache-lax8621.prod.fastly.net", "US", true},
		// NTT backbone pattern
		{"ae-1.r01.tpe01.tw.bb.gin.ntt.net", "TW", true},
		// 通用 ISP backbone
		{"xe-0-0-0.lax01.example.net", "US", true},
		// 無法解析
		{"some-random-host.example.com", "", false},
		{"", "", false},
		{"local", "", false},
		// 不在 IATA 表中的代碼
		{"zzz99.cloudflare.net", "", false},
	}

	for _, tc := range tests {
		entry, ok := extractPoPFromRDNS(tc.hostname)
		if ok != tc.wantOk {
			t.Errorf("extractPoPFromRDNS(%q) ok = %v, want %v", tc.hostname, ok, tc.wantOk)
			continue
		}
		if ok && entry.Country != tc.wantCountry {
			t.Errorf("extractPoPFromRDNS(%q) country = %q, want %q", tc.hostname, entry.Country, tc.wantCountry)
		}
	}
}

func TestEnrichWithRDNS(t *testing.T) {
	hops := []Hop{
		{Index: 1, IP: "1.1.1.1", Host: "gateway.local", ASN: 3462, Country: "TW", GeoConfidence: "high"},
		// Cloudflare 節點，GeoIP 說 US，但 rDNS 說 TPE
		{Index: 2, IP: "172.68.1.1", Host: "tpe01.cloudflare.net", ASN: 13335, Country: "US", Coords: []float64{-122.0, 37.0}, GeoConfidence: "low"},
	}

	enrichWithRDNS(hops)

	if hops[1].Country != "TW" {
		t.Errorf("hops[1].Country = %q, want %q", hops[1].Country, "TW")
	}
	if hops[1].GeoConfidence != "high" {
		t.Errorf("hops[1].GeoConfidence = %q, want %q", hops[1].GeoConfidence, "high")
	}
}
