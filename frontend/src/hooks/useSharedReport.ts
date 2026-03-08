import { useEffect } from 'react';
import pako from 'pako';
import { useDnsStore } from '../stores/useDnsStore';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { DnsRecord, TraceResult } from '../types';
import { logger } from '../utils/logger';

const MAX_ZDATA_LENGTH = 100 * 1024;

export const useSharedReport = () => {
  const { setMonitoringIp, loadSnapshot, setSharedReport } = useDnsStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zdata = params.get('zdata');

    if (zdata) {
      try {
        if (zdata.length > MAX_ZDATA_LENGTH) {
          logger.error('[Share] zdata exceeds size limit');
          return;
        }

        const base64 = zdata.replace(/-/g, '+').replace(/_/g, '/');
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const decompressed = pako.inflate(bytes, { to: 'string' });
        const decoded = JSON.parse(decompressed);

        // 新格式: { r: [...], trace?: {...} } / 舊格式: [...]
        const rawRecords = Array.isArray(decoded) ? decoded : decoded.r;
        const traceData = Array.isArray(decoded) ? null : decoded.trace;

        loadRecords(rawRecords, traceData);
      } catch (e) {
        logger.error('Failed to decode compressed share data');
      }
    }

    function loadRecords(decoded: any[], traceData: any | null) {
      const records: DnsRecord[] = decoded.map((r: any) => ({
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
        type: 'A'
      }));

      if (records.length > 0) {
        setSharedReport(true);
        setMonitoringIp(records[0].sourceIp);
        loadSnapshot(records.reverse());
      }

      // 還原 Traceroute 狀態
      if (traceData) {
        const traceResult: TraceResult = {
          target: traceData.target,
          status: traceData.status,
          time: records[0]?.timestamp ?? new Date().toISOString(),
          hops: traceData.hops.map((h: any) => ({
            index: h.i,
            ip: h.ip,
            host: '',
            latency: h.l,
            rtts: h.r,
            country: h.c,
            coords: h.co,
            asn: h.a,
            isp: h.isp,
          })),
        };
        useTracerouteStore.getState().loadSharedResult(traceResult);
      }
    }
  }, [setMonitoringIp, loadSnapshot, setSharedReport]);
};
