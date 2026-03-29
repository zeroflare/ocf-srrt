package traceroute

import (
	"testing"
)

func TestExtractCountryFromTLD(t *testing.T) {
	tests := []struct {
		domain string
		want   string
	}{
		{"moda.gov.tw", "TW"},
		{"example.co.jp", "JP"},
		{"example.tw", "TW"},
		{"example.de", "DE"},
		{"example.com.au", "AU"},
		// gTLD → 無法判斷
		{"google.com", ""},
		{"example.net", ""},
		{"example.org", ""},
		// 邊界
		{"", ""},
		{"localhost", ""},
		{"example.tw.", "TW"}, // trailing dot
	}

	for _, tc := range tests {
		got := extractCountryFromTLD(tc.domain)
		if got != tc.want {
			t.Errorf("extractCountryFromTLD(%q) = %q, want %q", tc.domain, got, tc.want)
		}
	}
}

func TestEnrichLastHopWithTLD(t *testing.T) {
	hops := []Hop{
		{Index: 0, IP: "10.0.0.1", Country: "TW", GeoConfidence: "high"},
		{Index: 1, IP: "172.68.1.1", Country: "US", GeoConfidence: "low"}, // 最後一跳
	}

	enrichLastHopWithTLD(hops, "moda.gov.tw")

	// 最後一跳 GeoConfidence 為 "low" 且 TLD=TW → 應修正
	if hops[1].Country != "TW" {
		t.Errorf("hops[1].Country = %q, want %q", hops[1].Country, "TW")
	}
}

func TestEnrichLastHopWithTLD_NoOverrideHigh(t *testing.T) {
	hops := []Hop{
		{Index: 0, IP: "10.0.0.1", Country: "TW", GeoConfidence: "high"},
		{Index: 1, IP: "8.8.8.8", Country: "US", GeoConfidence: "high"},
	}

	enrichLastHopWithTLD(hops, "example.tw")

	// GeoConfidence 為 "high" → 不修正
	if hops[1].Country != "US" {
		t.Errorf("hops[1].Country = %q, want %q (should not override high confidence)", hops[1].Country, "US")
	}
}

func TestEnrichLastHopWithTLD_GTLD(t *testing.T) {
	hops := []Hop{
		{Index: 0, IP: "10.0.0.1", Country: "TW", GeoConfidence: "high"},
		{Index: 1, IP: "8.8.8.8", Country: "US", GeoConfidence: "low"},
	}

	enrichLastHopWithTLD(hops, "google.com")

	// .com 無法判斷 → 不修正
	if hops[1].Country != "US" {
		t.Errorf("hops[1].Country = %q, want %q (gTLD should not modify)", hops[1].Country, "US")
	}
}
