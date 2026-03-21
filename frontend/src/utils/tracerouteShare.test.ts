import { describe, it, expect } from 'vitest';
import { encodeTraceResult, decodeTraceResult } from './tracerouteShare';
import { TraceResult } from '../types';

const sampleResult: TraceResult = {
  target: 'example.com',
  status: 'completed',
  time: '2026-03-16T12:00:00.000Z',
  hops: [
    {
      index: 0, ip: '1.2.3.4', host: 'local', latency: 0, rtts: [], loss: 0,
      best: 0, worst: 0, stdev: 0, country: 'TW', coords: [121.5, 25.0],
      asn: 3462, isp: 'Chunghwa Telecom', geoConfidence: 'high',
    },
    {
      index: 1, ip: '8.8.8.8', host: 'dns.google', latency: 12.5, rtts: [], loss: 0,
      best: 11.0, worst: 14.0, stdev: 1.5, country: 'US', coords: [-122.08, 37.38],
      asn: 15169, isp: 'Google LLC', geoConfidence: 'high',
    },
  ],
};

describe('tracerouteShare', () => {
  describe('encode/decode round-trip', () => {
    it('preserves all fields', () => {
      const encoded = encodeTraceResult(sampleResult);
      const decoded = decodeTraceResult(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded!.target).toBe(sampleResult.target);
      expect(decoded!.status).toBe(sampleResult.status);
      expect(decoded!.time).toBe(sampleResult.time);
      expect(decoded!.hops).toHaveLength(2);

      const hop0 = decoded!.hops[0];
      expect(hop0.index).toBe(0);
      expect(hop0.ip).toBe('1.2.3.4');
      expect(hop0.host).toBe('local');
      expect(hop0.country).toBe('TW');
      expect(hop0.coords).toEqual([121.5, 25.0]);
      expect(hop0.asn).toBe(3462);
      expect(hop0.isp).toBe('Chunghwa Telecom');
      expect(hop0.geoConfidence).toBe('high');

      const hop1 = decoded!.hops[1];
      expect(hop1.latency).toBe(12.5);
      expect(hop1.loss).toBe(0);
      expect(hop1.best).toBe(11.0);
      expect(hop1.worst).toBe(14.0);
      expect(hop1.stdev).toBe(1.5);
    });

    it('produces URL-safe base64 (no +, /, =)', () => {
      const encoded = encodeTraceResult(sampleResult);
      expect(encoded).not.toMatch(/[+/=]/);
    });
  });

  describe('edge cases', () => {
    it('handles empty hops', () => {
      const empty: TraceResult = {
        target: 'empty.test',
        status: 'completed',
        time: '2026-01-01T00:00:00Z',
        hops: [],
      };
      const decoded = decodeTraceResult(encodeTraceResult(empty));
      expect(decoded).not.toBeNull();
      expect(decoded!.hops).toHaveLength(0);
    });

    it('handles large data (50 hops)', () => {
      const large: TraceResult = {
        target: 'large.test',
        status: 'completed',
        time: '2026-01-01T00:00:00Z',
        hops: Array.from({ length: 50 }, (_, i) => ({
          index: i,
          ip: `10.0.${Math.floor(i / 256)}.${i % 256}`,
          host: `hop-${i}.example.net`,
          latency: i * 3.5,
          rtts: [],
          loss: 0,
          best: i * 3.0,
          worst: i * 4.0,
          stdev: 0.5,
          country: 'US',
          coords: [-122 + i * 0.5, 37 + i * 0.1] as [number, number],
          asn: 15169,
          isp: 'Test ISP',
          geoConfidence: 'high' as const,
        })),
      };
      const decoded = decodeTraceResult(encodeTraceResult(large));
      expect(decoded).not.toBeNull();
      expect(decoded!.hops).toHaveLength(50);
    });
  });

  describe('invalid input', () => {
    it('returns null for invalid base64', () => {
      expect(decodeTraceResult('not-valid-zdata!!!')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(decodeTraceResult('')).toBeNull();
    });

    it('XSS payload in target does not break decode', () => {
      const xss: TraceResult = {
        target: '<script>alert("xss")</script>',
        status: 'completed',
        time: '2026-01-01T00:00:00Z',
        hops: [{
          index: 0, ip: '"><img src=x onerror=alert(1)>', host: '', latency: 0,
          rtts: [], loss: 0, best: 0, worst: 0, stdev: 0,
          country: '<script>', coords: [0, 0], asn: 0, isp: '',
        }],
      };
      const decoded = decodeTraceResult(encodeTraceResult(xss));
      expect(decoded).not.toBeNull();
      // 確認資料完整保留（encode/decode 不做 sanitize，由 UI 端 DOM API 處理）
      expect(decoded!.target).toBe('<script>alert("xss")</script>');
      expect(decoded!.hops[0].ip).toBe('"><img src=x onerror=alert(1)>');
    });
  });
});
