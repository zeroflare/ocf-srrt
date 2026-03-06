package dns

import (
	"encoding/json"
	"net"
	"ocf-srrt/backend/internal/api"
	"ocf-srrt/backend/internal/auth"
	"ocf-srrt/backend/internal/types"
	"testing"
	"time"

	"github.com/miekg/dns"
)

func TestServer_ProcessAndRecord(t *testing.T) {
	broadcast := make(chan api.BroadcastMessage, 10)
	ts := auth.NewTokenStore()
	s := NewServer(broadcast, ts)

	req := new(dns.Msg)
	req.SetQuestion("google.com.", dns.TypeA)

	resp := new(dns.Msg)
	resp.SetReply(req)
	resp.Answer = append(resp.Answer, &dns.A{
		Hdr: dns.RR_Header{Name: "google.com.", Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: 300},
		A:   net.ParseIP("8.8.8.8"),
	})

	s.processAndRecord("127.0.0.1", req, resp)

	select {
	case msg := <-broadcast:
		var record types.DNSQueryRecord
		if err := json.Unmarshal(msg.Data, &record); err != nil {
			t.Fatalf("Failed to unmarshal record: %v", err)
		}
		if record.Domain != "google.com." {
			t.Errorf("Expected domain google.com., got %s", record.Domain)
		}
		if record.ResultIP != "8.8.8.8" {
			t.Errorf("Expected IP 8.8.8.8, got %s", record.ResultIP)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Timed out waiting for broadcast")
	}
}

type mockResponseWriter struct {
	dns.ResponseWriter
	remoteAddr net.Addr
}

func (m *mockResponseWriter) RemoteAddr() net.Addr {
	return m.remoteAddr
}

func (m *mockResponseWriter) WriteMsg(msg *dns.Msg) error {
	return nil
}
