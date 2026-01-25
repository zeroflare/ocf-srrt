import { create } from 'zustand';
import { throttle } from 'lodash-es';
import { DnsRecord } from '../types'; // 引入剛剛定義好的 Type

interface DnsState {
  records: DnsRecord[];
  totalQueries: number;
  foreignQueries: number;
  isPaused: boolean;

  // Actions
  addRecord: (record: DnsRecord) => void;
  loadSnapshot: (records: DnsRecord[]) => void; // [新增] 用於載入歷史資料
  setPaused: (paused: boolean) => void;
  clearRecords: () => void;
}

// 實際執行 State 更新的邏輯 (Pure Function)
const updateStateWithBatch = (newRecords: DnsRecord[], set: any, isPaused: boolean) => {
  if (isPaused || newRecords.length === 0) return;

  set((state: DnsState) => {
    // 1. 計算新進資料的統計數據 (注意欄位是 snake_case: is_foreign)
    const newForeignCount = newRecords.reduce(
        (count, r) => count + (r.isForeign ? 1 : 0),
        0
    );

    // 2. 合併列表 (最新的放在最上面)
    // SRE 優化：限制只留 1000 筆，避免長時間掛著導致瀏覽器記憶體洩漏
    const combinedRecords = [...newRecords, ...state.records].slice(0, 1000);

    return {
      records: combinedRecords,
      totalQueries: state.totalQueries + newRecords.length,
      foreignQueries: state.foreignQueries + newForeignCount,
    };
  });
};

export const useDnsStore = create<DnsState>((set, get) => {
  // 內部緩衝區 (閉包變數)
  let batchBuffer: DnsRecord[] = [];

  // 節流更新：每 500ms 至少執行一次，將緩衝區的資料寫入 State
  const flushBuffer = throttle(() => {
    const currentBatch = [...batchBuffer];
    batchBuffer = []; // 立刻清空，避免重複處理

    // 呼叫更新邏輯
    updateStateWithBatch(currentBatch, set, get().isPaused);
  }, 500, { leading: false, trailing: true });

  return {
    records: [],
    totalQueries: 0,
    foreignQueries: 0,
    isPaused: false,

    addRecord: (record: DnsRecord) => {
      // 只要不暫停，就推入緩衝區
      if (!get().isPaused) {
        batchBuffer.push(record);
        flushBuffer(); // 嘗試觸發更新 (會被 throttle 擋住直到時間到)
      }
    },

    // 這是給 WebSocket 一連線時用的，直接替換當前列表
    loadSnapshot: (historyRecords: DnsRecord[]) => {
      set(() => {
        // 歷史資料通常是 舊->新，但 UI 顯示習慣 新->舊，所以反轉
        // 或者看後端傳過來的順序決定是否要 .reverse()
        const sortedRecords = [...historyRecords].reverse();

        // 重新計算歷史數據的統計
        const historyForeignCount = sortedRecords.reduce(
            (acc, r) => acc + (r.isForeign ? 1 : 0), 0
        );

        return {
          records: sortedRecords,
          totalQueries: sortedRecords.length,
          foreignQueries: historyForeignCount,
        };
      });
    },

    setPaused: (paused: boolean) => set({ isPaused: paused }),

    clearRecords: () => set({ records: [], totalQueries: 0, foreignQueries: 0 }),
  };
});