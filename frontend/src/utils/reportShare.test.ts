import { describe, expect, it } from 'vitest';
import {
  isIPv4,
  normalizeDomainKey,
  pickUniqueDomainRecords,
  preferDomainRecord,
} from './reportShare';
import { DnsRecord } from '../types';

const rec = (domain: string, ip: string, type = 'A', timestamp?: string): DnsRecord => ({
  _id: `${domain}-${ip}-${type}`,
  timestamp: timestamp ?? new Date().toISOString(),
  domain,
  resultIp: ip,
  isForeign: false,
  sourceIp: '1.2.3.4',
  country: 'US',
  type,
});

describe('normalizeDomainKey', () => {
  it('lowercases and strips trailing dot', () => {
    expect(normalizeDomainKey('Example.COM.')).toBe('example.com');
  });
});

describe('isIPv4', () => {
  it('detects IPv4 and rejects IPv6', () => {
    expect(isIPv4('1.2.3.4')).toBe(true);
    expect(isIPv4('2001:db8::1')).toBe(false);
  });
});

describe('preferDomainRecord', () => {
  it('prefers IPv4 over IPv6', () => {
    const v4 = rec('x.com', '1.2.3.4', 'A');
    const v6 = rec('x.com', '2001:db8::1', 'AAAA');
    expect(preferDomainRecord(v6, v4)).toBe(v4);
    expect(preferDomainRecord(v4, v6)).toBe(v4);
  });

  it('prefers type A when both are same IP family', () => {
    const a = rec('x.com', '1.2.3.4', 'A');
    const cname = rec('x.com', '1.2.3.4', 'CNAME');
    expect(preferDomainRecord(cname, a)).toBe(a);
  });
});

describe('pickUniqueDomainRecords', () => {
  it('keeps up to limit unique domains in first-seen order', () => {
    const records = [
      rec('a.com', '1.1.1.1'),
      rec('b.com', '2.2.2.2'),
      rec('a.com', '9.9.9.9'),
      rec('c.com', '3.3.3.3'),
    ];
    const picked = pickUniqueDomainRecords(records, 50);
    expect(picked.map((r) => r.domain)).toEqual(['a.com', 'b.com', 'c.com']);
    expect(picked[0].resultIp).toBe('1.1.1.1');
  });

  it('prefers A/IPv4 over newer AAAA for same domain', () => {
    const picked = pickUniqueDomainRecords([
      rec('a.com', '2001:db8::1', 'AAAA', '2026-01-02T00:00:00Z'),
      rec('b.com', '2.2.2.2', 'A', '2026-01-02T00:00:01Z'),
      rec('a.com', '1.2.3.4', 'A', '2026-01-01T00:00:00Z'),
    ]);
    expect(picked.find((r) => r.domain === 'a.com')?.resultIp).toBe('1.2.3.4');
    expect(picked.find((r) => r.domain === 'a.com')?.type).toBe('A');
  });

  it('keeps A when it is newer than AAAA', () => {
    const picked = pickUniqueDomainRecords([
      rec('a.com', '1.2.3.4', 'A', '2026-01-02T00:00:00Z'),
      rec('a.com', '2001:db8::1', 'AAAA', '2026-01-01T00:00:00Z'),
    ]);
    expect(picked[0].resultIp).toBe('1.2.3.4');
  });

  it('respects limit', () => {
    const records = Array.from({ length: 60 }, (_, i) => rec(`d${i}.com`, `10.0.0.${i}`));
    expect(pickUniqueDomainRecords(records, 50)).toHaveLength(50);
  });

  it('treats domains differing only by trailing dot as duplicate', () => {
    const picked = pickUniqueDomainRecords([rec('foo.com.', '1.1.1.1'), rec('FOO.com', '2.2.2.2')]);
    expect(picked).toHaveLength(1);
    expect(picked[0].resultIp).toBe('1.1.1.1');
  });
});
