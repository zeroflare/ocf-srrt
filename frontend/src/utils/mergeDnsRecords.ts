import { DnsRecord, DisplayDnsRecord } from '../types';

/**
 * 計算合併鍵：優先用 appName（決策放寬到應用層級，doc/09），識別失敗時 fallback 到 domain。
 * 僅內部 mergeDnsRecords 使用；釘選改用 raw IDs 後，外部不再需要由 raw record
 * 反推合併鍵。
 */
const mergeKeyOf = (record: DnsRecord): string =>
  (record.appName && record.appName.trim()) ? `app::${record.appName}` : `dom::${record.domain}`;

/**
 * 將 DNS 記錄折成一列，產生 DisplayDnsRecord 陣列。
 *
 * 設計決策（doc/09）：LiveTable 提供「合併重複列」開關。開啟時：
 *   - 合併鍵：appName（識別失敗則 fallback 到 domain）— 同一應用的所有流量摺成一列
 *   - 其他欄位（domain / resultIp / country / city / asn / isp / os / latency …）取「最後一次」的值
 *   - timestamp 取最後一次（_lastSeenAt），同時保留 _firstSeenAt 與 _count
 *   - 排序維持 input 中最後一次出現的順序（最近活動優先）
 *
 * 設計考量：
 *   - 不取平均 latency，避免被早期高峰拖偏；最近一次更能反映當前狀態
 *   - 純 function：相同輸入永遠相同輸出，方便 useMemo 與測試
 */
export function mergeDnsRecords(records: DnsRecord[]): DisplayDnsRecord[] {
  if (records.length === 0) return [];

  const groups = new Map<string, DisplayDnsRecord>();

  for (const record of records) {
    const key = mergeKeyOf(record);
    const existing = groups.get(key);

    // 合併群組的 _id 用合併鍵當穩定 ID，避免新紀錄進來時 _id 漂移、
    // 造成釘選 (pin) 在 useEffect 之後失聯。
    const mergedId = `merged::${key}`;

    if (!existing) {
      groups.set(key, {
        ...record,
        _id: mergedId,
        _count: 1,
        _firstSeenAt: record.timestamp,
        _lastSeenAt: record.timestamp,
        _children: [record],
      });
      continue;
    }

    // 已存在：依 timestamp 比較，更新「最後一次」狀態
    const isNewer = record.timestamp > (existing._lastSeenAt ?? existing.timestamp);
    const isOlder = record.timestamp < (existing._firstSeenAt ?? existing.timestamp);
    const children = existing._children ?? [];

    if (isNewer) {
      // 用新紀錄覆蓋顯示用欄位（保留 _firstSeenAt、累加 _count、附加到 _children 開頭）
      groups.set(key, {
        ...record,
        _id: mergedId,
        _count: (existing._count ?? 1) + 1,
        _firstSeenAt: existing._firstSeenAt ?? existing.timestamp,
        _lastSeenAt: record.timestamp,
        _children: [record, ...children],
      });
    } else {
      // 較舊或同時：只更新計數、_firstSeenAt 與 _children
      groups.set(key, {
        ...existing,
        _count: (existing._count ?? 1) + 1,
        _firstSeenAt: isOlder ? record.timestamp : existing._firstSeenAt,
        _children: [...children, record],
      });
    }
  }

  // 依「最後一次」timestamp 由新到舊排序，與 raw mode 的時間軸一致
  return Array.from(groups.values()).sort((a, b) => {
    const tsA = a._lastSeenAt ?? a.timestamp;
    const tsB = b._lastSeenAt ?? b.timestamp;
    return tsB.localeCompare(tsA);
  });
}
