package traceroute

import (
	"context"
	"ocf-srtt/backend/internal/latencyprobe"
	"testing"
)

func TestValidTargetRe(t *testing.T) {
	tests := []struct {
		target string
		valid  bool
	}{
		{"google.com", true},
		{"8.8.8.8", true},
		{"sub.domain.example.com", true},
		{"a", true},
		{"host-name.example.com", true},
		// 最大長度 253 字元
		{"a." + string(make([]byte, 250)), false}, // 超長
		// 無效
		{"-flag", false},
		{"", false},
		{"hello world", false},
		{"test;rm -rf", false},
		{"$(whoami)", false},
		{"`id`", false},
		{"foo|bar", false},
		{"test\nhost", false},
	}

	for _, tc := range tests {
		got := validTargetRe.MatchString(tc.target)
		if got != tc.valid {
			t.Errorf("validTargetRe.MatchString(%q) = %v, want %v", tc.target, got, tc.valid)
		}
	}
}

func TestIsLikelyCDN(t *testing.T) {
	tests := []struct {
		asn    uint
		expect bool
	}{
		{13335, true},  // Cloudflare
		{20940, true},  // Akamai
		{15169, true},  // Google
		{3462, false},  // Chunghwa Telecom
		{0, false},     // unknown
		{12345, false}, // random
	}

	for _, tc := range tests {
		got := isLikelyCDN(tc.asn)
		if got != tc.expect {
			t.Errorf("isLikelyCDN(%d) = %v, want %v", tc.asn, got, tc.expect)
		}
	}
}

func TestEnrichWithLatencyHeuristic(t *testing.T) {
	hops := []Hop{
		{Index: 1, IP: "1.1.1.1", Latency: 5.0, Country: "TW", Coords: []float64{121.5, 25.0}, ASN: 3462, GeoConfidence: "high"},
		{Index: 2, IP: "2.2.2.2", Latency: 7.0, Country: "US", Coords: []float64{-122.0, 37.0}, ASN: 13335, GeoConfidence: "high"}, // Cloudflare, delta=2ms
		{Index: 3, IP: "3.3.3.3", Latency: 80.0, Country: "US", Coords: []float64{-74.0, 40.0}, ASN: 15169, GeoConfidence: "high"}, // Google, delta=73ms → 不修正
	}

	enrichWithLatencyHeuristic(hops)

	// Hop 2: 延遲差 2ms < 10ms + CDN → 應修正為 TW
	if hops[1].Country != "TW" {
		t.Errorf("hops[1].Country = %q, want %q", hops[1].Country, "TW")
	}
	if hops[1].GeoConfidence != "low" {
		t.Errorf("hops[1].GeoConfidence = %q, want %q", hops[1].GeoConfidence, "low")
	}

	// Hop 3: 延遲差 73ms > 10ms → 不修正
	if hops[2].Country != "US" {
		t.Errorf("hops[2].Country = %q, want %q", hops[2].Country, "US")
	}
	if hops[2].GeoConfidence != "high" {
		t.Errorf("hops[2].GeoConfidence = %q, want %q", hops[2].GeoConfidence, "high")
	}
}

func TestEnrichWithLatencyHeuristic_SkipsStar(t *testing.T) {
	hops := []Hop{
		{Index: 1, IP: "1.1.1.1", Latency: 5.0, Country: "TW", ASN: 3462, GeoConfidence: "high"},
		{Index: 2, IP: "*", Latency: 0, Country: "", GeoConfidence: "none"},
		{Index: 3, IP: "3.3.3.3", Latency: 6.0, Country: "US", ASN: 13335, GeoConfidence: "high"},
	}

	enrichWithLatencyHeuristic(hops)

	// Hop 3 前一跳是 *，不應修正
	if hops[2].Country != "US" {
		t.Errorf("hops[2].Country = %q, want %q (should not be corrected when prev is *)", hops[2].Country, "US")
	}
}

type mockLatencyProber struct {
	results map[string]latencyprobe.Result
}

func (m mockLatencyProber) Probe(_ context.Context, ip string) latencyprobe.Result {
	if r, ok := m.results[ip]; ok {
		return r
	}
	return latencyprobe.Result{OK: false}
}

func TestEnrichWithDomesticProbe(t *testing.T) {
	hops := []Hop{
		{Index: 1, IP: "104.18.10.20", Country: "US", GeoConfidence: "high"},
		{Index: 2, IP: "8.8.8.8", Country: "US", GeoConfidence: "high"},
	}
	targetCountry := "US"
	prober := mockLatencyProber{
		results: map[string]latencyprobe.Result{
			"104.18.10.20": {OK: true, LatencyMs: 4.0, Method: "icmp"},
			"8.8.8.8":      {OK: true, LatencyMs: 80.0, Method: "icmp"},
		},
	}

	enrichWithDomesticProbe(context.Background(), hops, &targetCountry, "104.18.10.20", "TW", prober)

	if hops[0].Country != "TW" {
		t.Errorf("hops[0].Country = %q, want TW (low RTT)", hops[0].Country)
	}
	if hops[1].Country != "US" {
		t.Errorf("hops[1].Country = %q, want US (high RTT)", hops[1].Country)
	}
	if targetCountry != "TW" {
		t.Errorf("targetCountry = %q, want TW", targetCountry)
	}
}

func TestCorrectCountryWithProbe(t *testing.T) {
	prober := mockLatencyProber{
		results: map[string]latencyprobe.Result{
			"1.2.3.4": {OK: true, LatencyMs: 9.9, Method: "tcp443"},
		},
	}
	got := correctCountryWithProbe(context.Background(), prober, "TW", "US", "1.2.3.4")
	if got != "TW" {
		t.Errorf("correctCountryWithProbe() = %q, want TW", got)
	}
	got = correctCountryWithProbe(context.Background(), prober, "TW", "US", "9.9.9.9")
	if got != "US" {
		t.Errorf("correctCountryWithProbe() = %q, want US (no probe result)", got)
	}
}
