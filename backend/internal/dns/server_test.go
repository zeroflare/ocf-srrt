package dns

import (
	"encoding/json"
	"net"
	"ocf-srtt/backend/internal/api"
	"ocf-srtt/backend/internal/auth"
	"ocf-srtt/backend/internal/types"
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

func TestCollectAnswerIPs_CNAMEWithA(t *testing.T) {
	hasCNAME, entries := collectAnswerIPs(&dns.Msg{
		Answer: []dns.RR{
			&dns.CNAME{
				Hdr:    dns.RR_Header{Name: "www.example.com.", Rrtype: dns.TypeCNAME, Class: dns.ClassINET, Ttl: 300},
				Target: "cdn.example.net.",
			},
			&dns.A{
				Hdr: dns.RR_Header{Name: "cdn.example.net.", Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: 300},
				A:   net.ParseIP("104.18.10.20"),
			},
		},
	})
	if !hasCNAME {
		t.Fatal("expected hasCNAME")
	}
	if len(entries) != 1 || entries[0].ip != "104.18.10.20" {
		t.Fatalf("entries = %+v, want single A 104.18.10.20", entries)
	}
}

func TestServer_ProcessAndRecord_CNAME(t *testing.T) {
	broadcast := make(chan api.BroadcastMessage, 10)
	ts := auth.NewTokenStore()
	s := NewServer(broadcast, ts)

	req := new(dns.Msg)
	req.SetQuestion("www.example.com.", dns.TypeA)

	resp := new(dns.Msg)
	resp.SetReply(req)
	resp.Answer = append(resp.Answer,
		&dns.CNAME{
			Hdr:    dns.RR_Header{Name: "www.example.com.", Rrtype: dns.TypeCNAME, Class: dns.ClassINET, Ttl: 300},
			Target: "edge.example.net.",
		},
		&dns.A{
			Hdr: dns.RR_Header{Name: "edge.example.net.", Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: 300},
			A:   net.ParseIP("93.184.216.34"),
		},
	)

	s.processAndRecord("127.0.0.1", req, resp)

	select {
	case msg := <-broadcast:
		var record types.DNSQueryRecord
		if err := json.Unmarshal(msg.Data, &record); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if record.Domain != "www.example.com." {
			t.Errorf("domain = %q, want www.example.com.", record.Domain)
		}
		if record.Type != "CNAME" {
			t.Errorf("type = %q, want CNAME", record.Type)
		}
		if record.ResultIP != "93.184.216.34" {
			t.Errorf("resultIp = %q, want 93.184.216.34", record.ResultIP)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for broadcast")
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
