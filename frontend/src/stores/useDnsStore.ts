import { create } from 'zustand';
import { throttle } from 'lodash-es';
import pako from 'pako';
import { DnsRecord } from '../types';
import { useTracerouteStore } from './useTracerouteStore';
import { logger } from '../utils/logger';

interface DnsState {
  records: DnsRecord[];
  totalQueries: number;
  foreignQueries: number;
  isPaused: boolean;
  monitoringIp: string | null;
  maxRecords: number;
  isSharedReport: boolean;
  theme: 'dark' | 'light';
  token: string | null;
  dnsIp: string | null;
  localCountry: string | null;
  selectedRowIds: Set<string>;

  // Actions
  addRecord: (record: DnsRecord) => void;
  loadSnapshot: (records: DnsRecord[]) => void;
  setPaused: (paused: boolean) => void;
  setMonitoringIp: (ip: string | null) => void;
  setSharedReport: (isShared: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  clearRecords: () => void;
  exportToUrl: () => string;
  setToken: (token: string | null) => void;
  setDnsIp: (ip: string | null) => void;
  setLocalCountry: (country: string | null) => void;
  toggleRowSelection: (id: string) => void;
  toggleAllSelection: (ids: string[]) => void;
  clearSelection: () => void;
  getSelectedRecords: () => DnsRecord[];
}

const MAX_RECORDS = 200;
const MAX_RECORDS_FOR_SHARE = 50;

// 實際執行 State 更新的邏輯 (Pure Function)
const updateStateWithBatch = (newRecords: DnsRecord[], set: any, isPaused: boolean, monitoringIp: string | null, maxRecords: number) => {
  if (isPaused || newRecords.length === 0) return;

  // 過濾 IP
  const filteredRecords = monitoringIp
    ? newRecords.filter(r => r.sourceIp === monitoringIp)
    : [];

  if (filteredRecords.length === 0 && monitoringIp !== null) return;

  // 如果 monitoringIp 為 null，則表示不監控任何封包 (預設關閉)
  if (monitoringIp === null) return;

  set((state: DnsState) => {
    // 1. 計算新進資料的統計數據
    const newForeignCount = filteredRecords.reduce(
        (count, r) => count + (r.isForeign ? 1 : 0),
        0
    );

    // 2. 合併列表 (最新的放在最上面)
    // SRE 優化：限制只留指定筆數，避免長時間掛著導致瀏覽器記憶體洩漏
    const combinedRecords = [...filteredRecords, ...state.records].slice(0, maxRecords);

    return {
      records: combinedRecords,
      totalQueries: state.totalQueries + filteredRecords.length,
      foreignQueries: state.foreignQueries + newForeignCount,
    };
  });
};

export const useDnsStore = create<DnsState>((set, get) => {
  // 內部緩衝區 (閉包變數)
  let batchBuffer: DnsRecord[] = [];
  // 儲存最近一次原始快照，供 setMonitoringIp 時重播
  let pendingSnapshot: DnsRecord[] | null = null;

  // 節流更新：每 500ms 至少執行一次，將緩衝區的資料寫入 State
  const flushBuffer = throttle(() => {
    const currentBatch = [...batchBuffer];
    batchBuffer = []; // 立刻清空，避免重複處理

    // 呼叫更新邏輯
    updateStateWithBatch(currentBatch, set, get().isPaused, get().monitoringIp, get().maxRecords);
  }, 500, { leading: true, trailing: true });

  return {
    records: [],
    totalQueries: 0,
    foreignQueries: 0,
    isPaused: false,
    monitoringIp: null,
    maxRecords: MAX_RECORDS,
    isSharedReport: false,
    theme: 'dark',
    token: null,
    dnsIp: null,
    localCountry: null,
    selectedRowIds: new Set<string>(),

    addRecord: (record: DnsRecord) => {
      // 只要不暫停且不是分享報告模式，就推入緩衝區
      if (!get().isPaused && !get().isSharedReport) {
        batchBuffer.push(record);
        flushBuffer(); // 嘗試觸發更新 (會被 throttle 擋住直到時間到)
      }
    },

    // 這是給 WebSocket 一連線時用的，直接替換當前列表
    // 如果 monitoringIp 尚未設定，先暫存快照，等 setMonitoringIp 後自動重播
    loadSnapshot: (historyRecords: DnsRecord[]) => {
      // 無論如何都儲存原始快照
      pendingSnapshot = historyRecords;

      const { monitoringIp, maxRecords } = get();
      if (!monitoringIp) return;

      const filtered = historyRecords.filter(r => r.sourceIp === monitoringIp);
      const sortedRecords = [...filtered].reverse().slice(0, maxRecords);
      const historyForeignCount = sortedRecords.reduce(
          (acc, r) => acc + (r.isForeign ? 1 : 0), 0
      );

      set({
        records: sortedRecords,
        totalQueries: sortedRecords.length,
        foreignQueries: historyForeignCount,
      });
    },

    setPaused: (paused: boolean) => set({ isPaused: paused }),

    setMonitoringIp: (ip: string | null) => {
      const { maxRecords } = get();
      // 如果有暫存快照且設定了新 IP，立即重播快照
      if (ip && pendingSnapshot && pendingSnapshot.length > 0) {
        const filtered = pendingSnapshot.filter(r => r.sourceIp === ip);
        const sortedRecords = [...filtered].reverse().slice(0, maxRecords);
        const historyForeignCount = sortedRecords.reduce(
            (acc, r) => acc + (r.isForeign ? 1 : 0), 0
        );
        set((state) => ({
          monitoringIp: ip,
          records: sortedRecords,
          totalQueries: sortedRecords.length,
          foreignQueries: historyForeignCount,
          isSharedReport: state.isSharedReport && ip === state.monitoringIp,
        }));
      } else {
        set((state) => ({
          monitoringIp: ip,
          records: [],
          totalQueries: 0,
          foreignQueries: 0,
          isSharedReport: state.isSharedReport && ip === state.monitoringIp,
        }));
      }
    },

    setSharedReport: (isShared: boolean) => set({ isSharedReport: isShared }),

    setTheme: (theme: 'dark' | 'light') => set({ theme }),

    toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

    clearRecords: () => set({ records: [], totalQueries: 0, foreignQueries: 0, isSharedReport: false }),

    setToken: (token: string | null) => set({ token }),

    setDnsIp: (ip: string | null) => set({ dnsIp: ip }),

    setLocalCountry: (country: string | null) => set({ localCountry: country }),

    toggleRowSelection: (id: string) => set((state) => {
      const next = new Set(state.selectedRowIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { selectedRowIds: next };
    }),

    toggleAllSelection: (ids: string[]) => set((state) => {
      const allSelected = ids.every(id => state.selectedRowIds.has(id));
      return { selectedRowIds: allSelected ? new Set<string>() : new Set(ids) };
    }),

    clearSelection: () => set({ selectedRowIds: new Set<string>() }),

    getSelectedRecords: () => {
      const { records, selectedRowIds } = get();
      return records.filter(r => selectedRowIds.has(r.timestamp));
    },

    exportToUrl: () => {
      const { records } = get();
      if (records.length === 0) return window.location.origin + window.location.pathname;

      try {
        // 分享時只取最新的 MAX_RECORDS_FOR_SHARE 筆
        const shareRecords = records.slice(0, MAX_RECORDS_FOR_SHARE);
        const minimalRecords = shareRecords.map(r => ({
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
          os: r.os || ''
        }));

        // 一併序列化 Traceroute 資料
        const traceResult = useTracerouteStore.getState().activeResult;
        const payload: Record<string, unknown> = { r: minimalRecords };
        if (traceResult) {
          payload.trace = {
            target: traceResult.target,
            status: traceResult.status,
            hops: traceResult.hops.map(h => ({
              i: h.index,
              ip: h.ip,
              l: h.latency,
              r: h.rtts,
              c: h.country,
              co: h.coords,
              a: h.asn,
              isp: h.isp,
            })),
          };
        }

        const json = JSON.stringify(payload);
        // 使用 pako 進行壓縮
        const compressed = pako.deflate(json);
        // 將 Uint8Array 轉為 base64 (使用可選的 URL 安全字元處理更好，這裡先用基礎 btoa)
        const binaryStr = Array.from(compressed).map(b => String.fromCharCode(b)).join('');
        const base64 = btoa(binaryStr)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const MAX_ZDATA_LENGTH = 100 * 1024;
        if (base64.length > MAX_ZDATA_LENGTH) {
          logger.error('[Share] Compressed data exceeds size limit');
          return window.location.origin + window.location.pathname;
        }

        const url = new URL(window.location.href);
        url.searchParams.set('zdata', base64);
        return url.toString();
      } catch (e) {
        logger.error('Failed to export data');
        return window.location.origin + window.location.pathname;
      }
    }
  };
});
