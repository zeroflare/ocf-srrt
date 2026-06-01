package latencyprobe

import (
	"net"
	"testing"
)

func TestShouldCorrectToLocal(t *testing.T) {
	tests := []struct {
		name         string
		local        string
		geo          string
		probe        Result
		wantCorrect  bool
	}{
		{
			name:        "low latency foreign geo",
			local:       "TW",
			geo:         "US",
			probe:       Result{OK: true, LatencyMs: 5.0, Method: "icmp"},
			wantCorrect: true,
		},
		{
			name:        "high latency no correction",
			local:       "TW",
			geo:         "US",
			probe:       Result{OK: true, LatencyMs: 50.0, Method: "mtr-tcp443"},
			wantCorrect: false,
		},
		{
			name:        "probe failed",
			local:       "TW",
			geo:         "US",
			probe:       Result{OK: false},
			wantCorrect: false,
		},
		{
			name:        "already local",
			local:       "TW",
			geo:         "TW",
			probe:       Result{OK: true, LatencyMs: 3.0},
			wantCorrect: false,
		},
		{
			name:        "threshold boundary",
			local:       "TW",
			geo:         "US",
			probe:       Result{OK: true, LatencyMs: 10.0, Method: "tcp443"},
			wantCorrect: false,
		},
		{
			name:        "just under threshold",
			local:       "TW",
			geo:         "US",
			probe:       Result{OK: true, LatencyMs: 9.9, Method: "tcp443"},
			wantCorrect: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ShouldCorrectToLocal(tc.local, tc.geo, tc.probe)
			if got != tc.wantCorrect {
				t.Errorf("ShouldCorrectToLocal() = %v, want %v", got, tc.wantCorrect)
			}
		})
	}
}

func TestIsPrivateOrLoopback(t *testing.T) {
	if !isPrivateOrLoopback(netParse("127.0.0.1")) {
		t.Error("127.0.0.1 should be private/loopback")
	}
	if !isPrivateOrLoopback(netParse("10.0.0.1")) {
		t.Error("10.0.0.1 should be private")
	}
	if isPrivateOrLoopback(netParse("8.8.8.8")) {
		t.Error("8.8.8.8 should not be private")
	}
}

func netParse(s string) net.IP {
	return net.ParseIP(s)
}
