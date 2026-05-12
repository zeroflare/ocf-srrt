package geoip

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// 真實 RIPE IPmap /best 回應的最小化 fixture（取自 https://ipmap.ripe.net/docs 範例）。
const ripeBestFixture = `{
  "location": {
    "id": "AMSTERDAM-NL-07-U173ZQ2SF4C47GPE4JPJ",
    "type": "city",
    "cityName": "Amsterdam",
    "iataCode": "AMS",
    "latitude": 52.37403,
    "longitude": 4.88969,
    "stateName": "Noord-Holland",
    "countryName": "Netherlands",
    "countryCodeAlpha2": "NL",
    "score": 14
  },
  "alternatives": [
    {"id": "UTRECHT-NL-09-U178KDCGH6S09CKUYC6H", "score": 12}
  ]
}`

func newTestServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv
}

func TestRipeClient_LocateBest_Success(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/locate/193.0.20.1/best" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("User-Agent"); got != "test-ua" {
			t.Errorf("UA = %q, want test-ua", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(ripeBestFixture))
	})

	c := newRipeClient(srv.URL, time.Second, "test-ua")
	resp, err := c.LocateBest(context.Background(), "193.0.20.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Location == nil {
		t.Fatal("expected non-nil Location")
	}
	if resp.Location.CountryCodeAlpha2 != "NL" {
		t.Errorf("country = %q, want NL", resp.Location.CountryCodeAlpha2)
	}
	if resp.Location.CityName != "Amsterdam" {
		t.Errorf("city = %q, want Amsterdam", resp.Location.CityName)
	}
	if resp.Location.IataCode != "AMS" {
		t.Errorf("iata = %q, want AMS", resp.Location.IataCode)
	}
	if resp.Location.Score != 14 {
		t.Errorf("score = %d, want 14", resp.Location.Score)
	}
	if len(resp.Alternatives) != 1 || resp.Alternatives[0].Score != 12 {
		t.Errorf("alternatives = %+v, want one entry with score=12", resp.Alternatives)
	}
}

func TestRipeClient_LocateBest_NullLocation(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"location": null, "alternatives": []}`))
	})
	c := newRipeClient(srv.URL, time.Second, "ua")
	_, err := c.LocateBest(context.Background(), "1.1.1.1")
	if !errors.Is(err, errRipeNoLocation) {
		t.Errorf("err = %v, want errRipeNoLocation", err)
	}
}

func TestRipeClient_LocateBest_404TreatedAsNoLocation(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	})
	c := newRipeClient(srv.URL, time.Second, "ua")
	_, err := c.LocateBest(context.Background(), "1.1.1.1")
	if !errors.Is(err, errRipeNoLocation) {
		t.Errorf("err = %v, want errRipeNoLocation", err)
	}
}

func TestRipeClient_LocateBest_5xxIsError(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	})
	c := newRipeClient(srv.URL, time.Second, "ua")
	_, err := c.LocateBest(context.Background(), "1.1.1.1")
	if err == nil {
		t.Fatal("expected error")
	}
	if errors.Is(err, errRipeNoLocation) {
		t.Errorf("5xx must not be classified as no-location: %v", err)
	}
}

func TestRipeClient_LocateBest_BadJSON(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{not valid json`))
	})
	c := newRipeClient(srv.URL, time.Second, "ua")
	_, err := c.LocateBest(context.Background(), "1.1.1.1")
	if err == nil {
		t.Fatal("expected json parse error")
	}
	if !strings.Contains(err.Error(), "parse json") {
		t.Errorf("err = %v, want parse json error", err)
	}
}

func TestRipeClient_LocateBest_Timeout(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(150 * time.Millisecond)
		w.Write([]byte(ripeBestFixture))
	})
	c := newRipeClient(srv.URL, 30*time.Millisecond, "ua")
	_, err := c.LocateBest(context.Background(), "1.1.1.1")
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if errors.Is(err, errRipeNoLocation) {
		t.Errorf("timeout must not be classified as no-location: %v", err)
	}
}

func TestRipeClient_LocateBest_ContextCancelled(t *testing.T) {
	srv := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.Write([]byte(ripeBestFixture))
	})
	c := newRipeClient(srv.URL, time.Second, "ua")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := c.LocateBest(ctx, "1.1.1.1")
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
}
