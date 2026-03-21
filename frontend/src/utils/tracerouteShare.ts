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
    time: result.time,
    hops: result.hops.map(h => ({
      i: h.index,
      ip: h.ip,
      h: h.host,
      l: h.latency,
      r: h.rtts,
      ls: h.loss,
      bs: h.best,
      ws: h.worst,
      sd: h.stdev,
      c: h.country,
      co: h.coords,
      a: h.asn,
      isp: h.isp,
      gc: h.geoConfidence,
    })),
  };

  const json = JSON.stringify(compact);
  const compressed = pako.deflate(json);
  // chunk-based 編碼避免 spread 造成 call stack overflow
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
      time: data.time || new Date().toISOString(),
      hops: data.hops.map((h: { i: number; ip: string; h?: string; l: number; r?: number[]; ls?: number; bs?: number; ws?: number; sd?: number; c: string; co: [number, number]; a?: number; isp?: string; gc?: string }) => ({
        index: h.i,
        ip: h.ip,
        host: h.h || '',
        latency: h.l,
        rtts: h.r,
        loss: h.ls ?? 0,
        best: h.bs ?? 0,
        worst: h.ws ?? 0,
        stdev: h.sd ?? 0,
        country: h.c,
        coords: h.co as [number, number],
        asn: h.a,
        isp: h.isp,
        geoConfidence: h.gc,
      })),
    };
  } catch {
    return null;
  }
}
