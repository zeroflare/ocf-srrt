import pako from 'pako';
import { DnsRecord } from '../types';
import { AppInfo, ReportData } from '../types/report';
import { PhoneBrand } from './phoneBrand';

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
