package geoip

import (
	"context"
	"net/http"
	"sync/atomic"
	"testing"
	"time"
)

// newTestConfig 用 RIPE 為主、MaxMind 全關，避免測試依賴打包外的 mmdb。
// 需要驗證 MaxMind primary 行為的測試，請在覆寫 Provider / Enabled 後使用。
func newTestConfig() Config {
	return Config{
		Provider:               ProviderRipe,
		RipeEnabled:            true,
		RipeBaseURL:            "http://placeholder",
		RipeTimeout:            time.Second,
		RipeCacheTTLOK:         time.Hour,
		RipeCacheTTLMiss:       time.Minute,
		RipeUserAgent:          "test",
		MaxMindLocationEnabled: false,
		MaxMindASNEnabled:      false,
	}
}

func TestResolver_PrivateIPSkipsRipe(t *testing.T) {
	var hits int32
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Write([]byte(ripeBestFixture))
	})

	cfg := newTestConfig()
	cfg.RipeBaseURL = srv.URL
	r := newResolver(cfg, newRipeClient(srv.URL, time.Second, "test"))

	got, err := r.resolve(context.Background(), "192.168.1.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Country != "XX" {
		t.Errorf("country = %q, want XX (private IP should not resolve)", got.Country)
	}
	if atomic.LoadInt32(&hits) != 0 {
		t.Errorf("RIPE hit count = %d, want 0 for private IP", hits)
	}
}

func TestResolver_LoopbackAndUnspecifiedSkipRipe(t *testing.T) {
	var hits int32
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
	})

	cfg := newTestConfig()
	r := newResolver(cfg, newRipeClient(srv.URL, time.Second, "test"))

	for _, ip := range []string{"127.0.0.1", "::1", "0.0.0.0", "169.254.1.1", "224.0.0.1"} {
		got, err := r.resolve(context.Background(), ip)
		if err != nil {
			t.Errorf("ip=%s: unexpected error: %v", ip, err)
			continue
		}
		if got.Country != "XX" {
			t.Errorf("ip=%s: country = %q, want XX", ip, got.Country)
		}
	}
	if atomic.LoadInt32(&hits) != 0 {
		t.Errorf("RIPE hit count = %d, want 0 for non-routable IPs", hits)
	}
}

func TestResolver_RipeSuccessMappedCorrectly(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(ripeBestFixture))
	})

	cfg := newTestConfig()
	r := newResolver(cfg, newRipeClient(srv.URL, time.Second, "test"))

	got, err := r.resolve(context.Background(), "193.0.20.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Country != "NL" {
		t.Errorf("country = %q, want NL", got.Country)
	}
	if got.City != "Amsterdam" {
		t.Errorf("city = %q, want Amsterdam", got.City)
	}
	if got.Subdivision != "Noord-Holland" {
		t.Errorf("subdivision = %q, want Noord-Holland", got.Subdivision)
	}
	if len(got.Coords) != 2 {
		t.Fatalf("coords = %v, want [lon,lat]", got.Coords)
	}
	if got.Coords[0] != 4.88969 || got.Coords[1] != 52.37403 {
		t.Errorf("coords = %v, want [4.88969, 52.37403]", got.Coords)
	}
}

func TestResolver_CachesSuccessfulResult(t *testing.T) {
	var hits int32
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.Write([]byte(ripeBestFixture))
	})

	cfg := newTestConfig()
	r := newResolver(cfg, newRipeClient(srv.URL, time.Second, "test"))

	for i := 0; i < 5; i++ {
		if _, err := r.resolve(context.Background(), "193.0.20.1"); err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
	}
	if got := atomic.LoadInt32(&hits); got != 1 {
		t.Errorf("RIPE was called %d times, want 1 (rest should be cache hits)", got)
	}
}

func TestResolver_RipeMissReturnsXX(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"location": null}`))
	})

	cfg := newTestConfig() // MaxMindLocationEnabled=false → 純 RIPE
	r := newResolver(cfg, newRipeClient(srv.URL, time.Second, "test"))

	got, err := r.resolve(context.Background(), "203.0.113.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Country != "XX" {
		t.Errorf("country = %q, want XX (RIPE miss + MaxMind disabled)", got.Country)
	}
	if got.Coords != nil {
		t.Errorf("coords = %v, want nil", got.Coords)
	}
}

func TestResolver_RipeErrorReturnsXX(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	})

	cfg := newTestConfig()
	r := newResolver(cfg, newRipeClient(srv.URL, time.Second, "test"))

	got, err := r.resolve(context.Background(), "203.0.113.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Country != "XX" {
		t.Errorf("country = %q, want XX after RIPE 5xx", got.Country)
	}
}

func TestResolver_NilRipeClientWhenDisabled(t *testing.T) {
	cfg := newTestConfig()
	cfg.RipeEnabled = false
	r := newResolver(cfg, nil)

	got, err := r.resolve(context.Background(), "8.8.8.8")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Country != "XX" {
		t.Errorf("country = %q, want XX when RIPE disabled and MaxMind disabled", got.Country)
	}
}

func TestResolver_InvalidIPReturnsError(t *testing.T) {
	cfg := newTestConfig()
	r := newResolver(cfg, nil)

	_, err := r.resolve(context.Background(), "not-an-ip")
	if err == nil {
		t.Fatal("expected error for invalid IP")
	}
}

func TestResolver_ZeroCoordsTreatedAsNil(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"location":{"countryCodeAlpha2":"XY","cityName":"Nowhere","latitude":0,"longitude":0,"score":1}}`))
	})

	cfg := newTestConfig()
	r := newResolver(cfg, newRipeClient(srv.URL, time.Second, "test"))

	got, err := r.resolve(context.Background(), "203.0.113.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Coords != nil {
		t.Errorf("coords = %v, want nil for (0,0)", got.Coords)
	}
}

// MaxMind primary 但 DB 未啟用時應 fallback 到 RIPE。
// 這也覆蓋了「Provider=maxmind 但 mmdb 缺失」的部署場景。
func TestResolver_MaxMindPrimaryFallsBackToRipe(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(ripeBestFixture))
	})

	cfg := newTestConfig()
	cfg.Provider = ProviderMaxMind         // 主來源 MaxMind
	cfg.MaxMindLocationEnabled = false     // 但實際關閉 → primary 失敗
	r := newResolver(cfg, newRipeClient(srv.URL, time.Second, "test"))

	got, err := r.resolve(context.Background(), "193.0.20.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Country != "NL" {
		t.Errorf("country = %q, want NL (should fall back to RIPE)", got.Country)
	}
}

// Provider=maxmind 且 RIPE 也關閉時：兩邊都沒位置 → XX。
func TestResolver_BothProvidersDisabled(t *testing.T) {
	cfg := newTestConfig()
	cfg.Provider = ProviderMaxMind
	cfg.RipeEnabled = false
	cfg.MaxMindLocationEnabled = false
	r := newResolver(cfg, nil)

	got, err := r.resolve(context.Background(), "8.8.8.8")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Country != "XX" {
		t.Errorf("country = %q, want XX when both providers disabled", got.Country)
	}
}

// providerOrder 應依 Provider 決定 (primary, secondary)。
func TestResolver_ProviderOrder(t *testing.T) {
	cases := []struct {
		name           string
		provider       Provider
		wantPrimary    Provider
		wantSecondary  Provider
	}{
		{"maxmind primary", ProviderMaxMind, ProviderMaxMind, ProviderRipe},
		{"ripe primary", ProviderRipe, ProviderRipe, ProviderMaxMind},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := newTestConfig()
			cfg.Provider = tc.provider
			r := newResolver(cfg, nil)
			got1, got2 := r.providerOrder()
			if got1 != tc.wantPrimary || got2 != tc.wantSecondary {
				t.Errorf("providerOrder() = (%v, %v), want (%v, %v)",
					got1, got2, tc.wantPrimary, tc.wantSecondary)
			}
		})
	}
}

func TestApplyDefaults(t *testing.T) {
	r := GeoResult{}
	applyDefaults(&r)
	if r.Country != "XX" {
		t.Errorf("country = %q, want XX", r.Country)
	}
	if r.ISP != "Unknown" {
		t.Errorf("isp = %q, want Unknown", r.ISP)
	}
}

func TestEnvConfigParsing(t *testing.T) {
	t.Setenv("GEOIP_PROVIDER", "ripe")
	t.Setenv("RIPE_IPMAP_ENABLED", "false")
	t.Setenv("RIPE_IPMAP_TIMEOUT_MS", "1234")
	t.Setenv("RIPE_IPMAP_CACHE_TTL_OK", "2h")
	t.Setenv("MAXMIND_LOCATION_ENABLED", "false")

	cfg := LoadConfig()
	if cfg.Provider != ProviderRipe {
		t.Errorf("Provider = %q, want ripe", cfg.Provider)
	}
	if cfg.RipeEnabled {
		t.Errorf("RipeEnabled = true, want false")
	}
	if cfg.RipeTimeout != 1234*time.Millisecond {
		t.Errorf("RipeTimeout = %v, want 1.234s", cfg.RipeTimeout)
	}
	if cfg.RipeCacheTTLOK != 2*time.Hour {
		t.Errorf("RipeCacheTTLOK = %v, want 2h", cfg.RipeCacheTTLOK)
	}
	if cfg.MaxMindLocationEnabled {
		t.Errorf("MaxMindLocationEnabled = true, want false")
	}
}

func TestEnvConfigDefaults(t *testing.T) {
	// 無任何環境變數時，預設 MaxMind 為主、RIPE 仍可用、MaxMind 位置/ASN 皆啟用。
	t.Setenv("GEOIP_PROVIDER", "")
	t.Setenv("RIPE_IPMAP_ENABLED", "")
	t.Setenv("MAXMIND_LOCATION_ENABLED", "")
	t.Setenv("MAXMIND_ASN_ENABLED", "")

	cfg := LoadConfig()
	if cfg.Provider != ProviderMaxMind {
		t.Errorf("default Provider = %q, want maxmind", cfg.Provider)
	}
	if !cfg.RipeEnabled {
		t.Errorf("default RipeEnabled = false, want true")
	}
	if !cfg.MaxMindLocationEnabled {
		t.Errorf("default MaxMindLocationEnabled = false, want true")
	}
	if !cfg.MaxMindASNEnabled {
		t.Errorf("default MaxMindASNEnabled = false, want true")
	}
}

func TestParseProvider(t *testing.T) {
	cases := []struct {
		input string
		want  Provider
	}{
		{"maxmind", ProviderMaxMind},
		{"MAXMIND", ProviderMaxMind},
		{" maxmind ", ProviderMaxMind},
		{"ripe", ProviderRipe},
		{"RIPE", ProviderRipe},
		{"", ProviderMaxMind},        // 空值用 fallback
		{"unknown", ProviderMaxMind}, // 未知值用 fallback
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			if got := parseProvider(tc.input, ProviderMaxMind); got != tc.want {
				t.Errorf("parseProvider(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}
