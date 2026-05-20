/**
 * 將 timestamp 格式化為 24 小時制 HH:MM:SS，與 wireframe formatTime 行為一致。
 *
 * - 英文介面採用 `en-GB`（HH:MM:SS）
 * - 中文介面採用 `zh-TW` 但強制 hour12: false，避免 toLocaleTimeString 預設
 *   在繁體中文輸出「下午 3:20:25」的 12 小時格式（即使瀏覽器 locale 不同）。
 */
export function formatTime(ts: string | number | Date, lang: string = 'zh'): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const loc = lang.startsWith('en') ? 'en-GB' : 'zh-TW';
  return d.toLocaleTimeString(loc, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 含日期的時間字串，用於分享報告的「generated at」展示。
 */
export function formatDateTime(ts: string | number | Date, lang: string = 'zh'): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const loc = lang.startsWith('en') ? 'en-GB' : 'zh-TW';
  return d.toLocaleString(loc, {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
