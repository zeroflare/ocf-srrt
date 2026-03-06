import pako from 'pako';
import { TraceResult } from '../types';

/**
 * 將 TraceResult 壓縮編碼成 URL-safe base64 字串
 * 格式與 useSharedReport 中的 trace 壓縮格式相同
 */
export function encodeTraceResult(result: TraceResult): string {
  const compact = {
    target: result.target,
    status: result.status,
    hops: result.hops.map(h => ({
      i: h.index,
      ip: h.ip,
      l: h.latency,
      c: h.country,
      co: h.coords,
    })),
  };

  const json = JSON.stringify(compact);
  const compressed = pako.deflate(json);
  const b64 = btoa(String.fromCharCode(...Array.from(compressed)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return b64;
}

/**
 * 建立 Traceroute 獨立頁面的分享 URL（/traceroute?zdata=...）
 */
export function buildTracerouteShareUrl(result: TraceResult): string {
  const zdata = encodeTraceResult(result);
  return `${window.location.origin}/traceroute?zdata=${zdata}`;
}

/**
 * 建立 Traceroute 獨立頁面的執行 URL（/traceroute?target=...&token=...）
 */
export function buildTracerouteRunUrl(target: string, token: string): string {
  return `${window.location.origin}/traceroute?target=${encodeURIComponent(target)}&token=${encodeURIComponent(token)}`;
}

/**
 * 從 URL 的 ?zdata= 參數解碼 TraceResult
 */
export function decodeTraceResult(zdata: string): TraceResult | null {
  try {
    const base64 = zdata.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.inflate(bytes, { to: 'string' });
    const data = JSON.parse(decompressed);

    return {
      target: data.target,
      status: data.status,
      time: new Date().toISOString(),
      hops: data.hops.map((h: { i: number; ip: string; l: number; c: string; co: [number, number] }) => ({
        index: h.i,
        ip: h.ip,
        host: '',
        latency: h.l,
        country: h.c,
        coords: h.co as [number, number],
      })),
    };
  } catch {
    return null;
  }
}
