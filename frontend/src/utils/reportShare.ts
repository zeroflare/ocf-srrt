import pako from 'pako';
import { DnsRecord } from '../types';
import { AppInfo, ReportData } from '../types/report';
import { PhoneBrand } from './phoneBrand';

/** 報告快照最多收錄筆數 */
export const REPORT_SNAPSHOT_MAX_RECORDS = 50;

/** 正規化網域作為去重鍵（小寫、去掉尾端點） */
export function normalizeDomainKey(domain: string): string {
  const d = (domain || '').trim().toLowerCase();
  return d.endsWith('.') ? d.slice(0, -1) : d;
}

/** 是否為 IPv4（不含 IPv6 與空值） */
export function isIPv4(ip: string): boolean {
  if (!ip || ip.includes(':')) return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/**
 * 同一網域兩筆紀錄擇一：IPv4 優先，其次 Type A，同級則較新 timestamp。
 */
export function preferDomainRecord(current: DnsRecord, candidate: DnsRecord): DnsRecord {
  const curV4 = isIPv4(current.resultIp);
  const candV4 = isIPv4(candidate.resultIp);
  if (curV4 !== candV4) return candV4 ? candidate : current;

  const curA = current.type === 'A';
  const candA = candidate.type === 'A';
  if (curA !== candA) return candA ? candidate : current;

  const curTs = new Date(current.timestamp).getTime();
  const candTs = new Date(candidate.timestamp).getTime();
  return candTs >= curTs ? candidate : current;
}

/**
 * 依列表順序（最新在前）每個網域保留一筆，最多 limit 個網域。
 * 同一網域多筆時優先 A + IPv4，而非單純取最新一筆。
 */
export function pickUniqueDomainRecords(
  records: DnsRecord[],
  limit = REPORT_SNAPSHOT_MAX_RECORDS,
): DnsRecord[] {
  const domainOrder: string[] = [];
  const bestByDomain = new Map<string, DnsRecord>();

  for (const r of records) {
    const key = normalizeDomainKey(r.domain);
    if (!key) continue;

    const existing = bestByDomain.get(key);
    if (!existing) {
      if (domainOrder.length >= limit) continue;
      domainOrder.push(key);
      bestByDomain.set(key, r);
      continue;
    }

    bestByDomain.set(key, preferDomainRecord(existing, r));
  }

  return domainOrder.map((key) => bestByDomain.get(key)!);
}

/**
 * 將 ReportData 壓縮編碼成 URL-safe base64 字串
 */
export function encodeReportData(data: ReportData): string {
  const compact = {
    app: {
      n: data.appInfo.appName,
      l: data.appInfo.appLogoUrl,
      a: data.appInfo.appleStoreUrl,
      g: data.appInfo.googlePlayUrl,
      w: data.appInfo.websiteUrl,
    },
    at: data.generatedAt,
    pb: data.phoneBrand,
    r: data.records.map(r => ({
      t: r.timestamp,
      d: r.domain,
      ip: r.resultIp,
      f: r.isForeign ? 1 : 0,
      fc: r.foreignConfidence || '',
      l: r.latency,
      s: r.sourceIp,
      c: r.country,
      a: r.appName,
      cat: r.appCategory,
      isp: r.isp,
      asn: r.asn,
      os: r.os || '',
      ty: r.type,
      // ay: isAnycast 旗標。新版後端會帶；舊報告快照沒有此欄位，decode 時為 undefined
      ay: r.isAnycast ? 1 : undefined,
    })),
  };

  const json = JSON.stringify(compact);
  const compressed = pako.deflate(json);
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < compressed.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...compressed.subarray(i, i + chunkSize)));
  }
  const b64 = btoa(chunks.join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return b64;
}

/**
 * 建立報告頁面的分享 URL（/report?zdata=...）
 */
export function buildReportUrl(data: ReportData): string {
  const zdata = encodeReportData(data);
  return `${window.location.origin}/report?zdata=${zdata}`;
}

/**
 * 從 URL 的 ?zdata= 參數解碼 ReportData
 */
export function decodeReportData(zdata: string): ReportData | null {
  try {
    const base64 = zdata.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.inflate(bytes, { to: 'string' });
    const data = JSON.parse(decompressed);

    const appInfo: AppInfo = {
      appName: data.app.n || '',
      appLogoUrl: data.app.l || '',
      appleStoreUrl: data.app.a || '',
      googlePlayUrl: data.app.g || '',
      websiteUrl: data.app.w || '',
    };

    let idCounter = 0;
    const records: DnsRecord[] = data.r.map((r: any) => ({
      _id: `report-${++idCounter}`,
      timestamp: r.t,
      domain: r.d,
      resultIp: r.ip,
      isForeign: r.f === 1,
      foreignConfidence: r.fc || '',
      latency: r.l,
      sourceIp: r.s,
      country: r.c,
      appName: r.a,
      appCategory: r.cat,
      isp: r.isp,
      asn: r.asn || 0,
      os: r.os || '',
      type: r.ty || 'A',
      isAnycast: r.ay === 1,
    }));

    return {
      records,
      appInfo,
      generatedAt: data.at || new Date().toISOString(),
      phoneBrand: data.pb as PhoneBrand | undefined,
    };
  } catch {
    return null;
  }
}
