import { create } from 'zustand';
import { throttle } from 'lodash-es';
import pako from 'pako';
import { DnsRecord } from '../types';
import { useTracerouteStore } from './useTracerouteStore';
import { logger } from '../utils/logger';

let _idCounter = 0;
const assignId = (record: DnsRecord): DnsRecord => {
  if (record._id) return record;
  return { ...record, _id: `dns-${++_idCounter}-${Date.now()}` };
};

interface DnsState {
  records: DnsRecord[];
  totalQueries: number;
  foreignQueries: number;
  isPaused: boolean;
  monitoringIp: string | null;
  /** 為 true 時忽略 WebSocket snapshot（按下「開始」後的新 session） */
  freshSession: boolean;
  maxRecords: number;
  isSharedReport: boolean;
  theme: 'dark' | 'light';
  token: string | null;
  dnsIp: string | null;
  localCountry: string | null;
  selectedRowIds: Set<string>;

  // LiveTable 合併重複列開關
  // 開啟後 (domain, resultIp) 相同的列在表上摺成一列
  mergeRecords: boolean;

  // Actions
  addRecord: (record: DnsRecord) => void;
  loadSnapshot: (records: DnsRecord[]) => void;
  setPaused: (paused: boolean) => void;
  setMonitoringIp: (ip: string | null) => void;
  /** 按下「開始監控」：清空列表與統計，不載入歷史 snapshot */
  startMonitoring: (ip: string) => void;
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
  /**
   * 全選目前已載入的紀錄（受 MAX_PINNED_RECORDS 上限保護）。
   * 主要用於 ReportView：分享出去的快照通常代表「使用者勾選後產生的報告」，
   * 開啟時預設整桌勾選，符合 wireframe 共享報告的視覺預期。
   */
  selectAllLoaded: () => void;
  getSelectedRecords: () => DnsRecord[];
  toggleMergeRecords: () => void;
}

const MAX_RECORDS = 200;
const MAX_RECORDS_FOR_SHARE = 50;
// 釘選上限：原本 50；放寬至 maxRecords 同步，因為合併群組常常 100+ 筆，
// 太低的上限會讓合併群組勾選變成「半勾」（部分被丟掉），UX 困惑。
const MAX_PINNED_RECORDS = 200;

// Theme 持久化：確保子頁面（TraceroutePage, ReportPage）和新分頁能保持一致的主題
const THEME_KEY = 'srrt_theme';
const getPersistedTheme = (): 'dark' | 'light' => {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage 不存在（SSR / vitest node env）時退回預設
  }
  return 'light';
};
const persistTheme = (theme: 'dark' | 'light') => {
  try {
    globalThis.localStorage?.setItem(THEME_KEY, theme);
  } catch {
    // localStorage 不存在時不寫入
  }
};

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
    // 釘選保護：已勾選的紀錄不受 maxRecords 上限淘汰
    const merged = [...filteredRecords, ...state.records];
    const pinnedIds = state.selectedRowIds;
    const pinned: DnsRecord[] = [];
    const unpinned: DnsRecord[] = [];
    for (const r of merged) {
      if (pinnedIds.has(r._id)) {
        pinned.push(r);
      } else {
        unpinned.push(r);
      }
    }
    // 未釘選的部分受 maxRecords 上限限制
    const unpinnedSliced = unpinned.slice(0, maxRecords);
    // 合併後維持原始順序（merged 順序 = 新的在前）
    const keepIds = new Set([
      ...pinned.map(r => r._id),
      ...unpinnedSliced.map(r => r._id),
    ]);
    const combinedRecords = merged.filter(r => keepIds.has(r._id));

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
    freshSession: false,
    maxRecords: MAX_RECORDS,
    isSharedReport: false,
    theme: getPersistedTheme(),
    token: null,
    dnsIp: null,
    localCountry: null,
    selectedRowIds: new Set<string>(),
    mergeRecords: false,

    addRecord: (record: DnsRecord) => {
      // 只要不暫停且不是分享報告模式，就推入緩衝區
      if (!get().isPaused && !get().isSharedReport) {
        batchBuffer.push(assignId(record));
        flushBuffer(); // 嘗試觸發更新 (會被 throttle 擋住直到時間到)
      }
    },

    // 這是給 WebSocket 一連線時用的，直接替換當前列表
    // 如果 monitoringIp 尚未設定，先暫存快照，等 setMonitoringIp 後自動重播
    loadSnapshot: (historyRecords: DnsRecord[]) => {
      const { monitoringIp, maxRecords, freshSession } = get();
      // 按下「開始」後的新 session 不載入歷史
      if (freshSession) return;

      pendingSnapshot = historyRecords;
      if (!monitoringIp) return;

      const filtered = historyRecords.filter(r => r.sourceIp === monitoringIp);
      const sortedRecords = [...filtered].reverse().slice(0, maxRecords).map(assignId);
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

    startMonitoring: (ip: string) => {
      pendingSnapshot = null;
      batchBuffer = [];
      set({
        monitoringIp: ip,
        freshSession: true,
        records: [],
        totalQueries: 0,
        foreignQueries: 0,
        selectedRowIds: new Set<string>(),
        isPaused: false,
        isSharedReport: false,
      });
    },

    setMonitoringIp: (ip: string | null) => {
      if (!ip) {
        pendingSnapshot = null;
        batchBuffer = [];
        set({
          monitoringIp: null,
          freshSession: false,
          records: [],
          totalQueries: 0,
          foreignQueries: 0,
          selectedRowIds: new Set<string>(),
        });
        return;
      }

      const { maxRecords } = get();
      // 分享報告等情境：有暫存快照則載入歷史
      if (pendingSnapshot && pendingSnapshot.length > 0) {
        const filtered = pendingSnapshot.filter(r => r.sourceIp === ip);
        const sortedRecords = [...filtered].reverse().slice(0, maxRecords).map(assignId);
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
        return;
      }

      set((state) => ({
        monitoringIp: ip,
        records: [],
        totalQueries: 0,
        foreignQueries: 0,
        selectedRowIds: new Set<string>(),
        isSharedReport: state.isSharedReport && ip === state.monitoringIp,
      }));
    },

    setSharedReport: (isShared: boolean) => set({ isSharedReport: isShared }),

    setTheme: (theme: 'dark' | 'light') => {
      persistTheme(theme);
      set({ theme });
    },

    toggleTheme: () => set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      return { theme: next };
    }),

    clearRecords: () => set({ records: [], totalQueries: 0, foreignQueries: 0, isSharedReport: false }),

    setToken: (token: string | null) => set({ token }),

    setDnsIp: (ip: string | null) => set({ dnsIp: ip }),

    setLocalCountry: (country: string | null) => set({ localCountry: country }),

    toggleRowSelection: (id: string) => set((state) => {
      const next = new Set(state.selectedRowIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        // 釘選上限保護
        if (next.size >= MAX_PINNED_RECORDS) return {};
        next.add(id);
      }
      return { selectedRowIds: next };
    }),

    // 對一組 ids 做「全選 or 全消」。新版做兩件事：
    //   1. 用法升級：合併模式下，傳入合併群組所有 children 的 raw IDs，
    //      讓「勾合併群組」 = 「同時釘選底下所有 raw 紀錄」。
    //   2. Bug 修：原版「全部已選 → 整個 selectedRowIds 清空」會誤刪
    //      不在當前 view 中的釘選；改為「只刪 ids 內的 IDs」。
    toggleAllSelection: (ids: string[]) => set((state) => {
      if (ids.length === 0) return {};
      const next = new Set(state.selectedRowIds);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        for (const id of ids) {
          if (next.size >= MAX_PINNED_RECORDS) break;
          next.add(id);
        }
      }
      return { selectedRowIds: next };
    }),

    clearSelection: () => set({ selectedRowIds: new Set<string>() }),

    selectAllLoaded: () => set((state) => {
      const next = new Set<string>();
      for (const r of state.records) {
        if (next.size >= MAX_PINNED_RECORDS) break;
        next.add(r._id);
      }
      return { selectedRowIds: next };
    }),

    // selectedRowIds 永遠存 raw record IDs（合併模式下合併 row 的 checkbox
    // 會展開成 children 的 raw IDs），所以這裡單純 raw ID 比對即可。
    getSelectedRecords: () => {
      const { records, selectedRowIds } = get();
      if (selectedRowIds.size === 0) return [];
      return records.filter(r => selectedRowIds.has(r._id));
    },

    // 切換「合併重複列」顯示模式。selectedRowIds 跨 mode 都是 raw IDs，
    // 切換時保留釘選不清空。
    toggleMergeRecords: () => set((state) => ({
      mergeRecords: !state.mergeRecords,
    })),

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
              ls: h.loss,
              bs: h.best,
              ws: h.worst,
              sd: h.stdev,
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
