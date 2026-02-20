import { useEffect } from 'react';
import pako from 'pako';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord } from '../types';

const MAX_ZDATA_LENGTH = 100 * 1024;

export const useSharedReport = () => {
  const { setMonitoringIp, loadSnapshot, setSharedReport } = useDnsStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zdata = params.get('zdata');

    if (zdata) {
      try {
        if (zdata.length > MAX_ZDATA_LENGTH) {
          console.error(`[Share] zdata exceeds size limit: ${zdata.length} bytes`);
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

        loadRecords(decoded);
      } catch (e) {
        console.error('Failed to decode compressed share data:', e);
      }
    }

    function loadRecords(decoded: any[]) {
      const records: DnsRecord[] = decoded.map((r: any) => ({
        timestamp: r.t,
        domain: r.d,
        resultIp: r.ip,
        isForeign: r.f === 1,
        latency: r.l,
        sourceIp: r.s,
        country: r.c,
        appName: r.a,
        appCategory: r.cat,
        isp: r.isp,
        asn: r.asn || 0,
        type: 'A'
      }));

      if (records.length > 0) {
        setSharedReport(true);
        setMonitoringIp(records[0].sourceIp);
        loadSnapshot(records.reverse());
      }
    }
  }, [setMonitoringIp, loadSnapshot, setSharedReport]);
};
