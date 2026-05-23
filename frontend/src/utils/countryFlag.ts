/**
 * ISO 3166-1 alpha-2 國碼轉 emoji 國旗。
 * 用 U+1F1E6 (REGIONAL INDICATOR SYMBOL LETTER A) 起算 + 國碼 letter offset。
 *
 * 後端 GeoIP 無法解析時回傳 "XX"（applyDefaults，見 backend/geoip/resolver.go），
 * 同時 ISO 3166-1 將 XX / ZZ / 以 X/Q 開頭的部分代碼劃為「使用者自定義」或保留，
 * 無對應 Unicode 國旗 emoji，會以 [X][X] 破圖呈現。這裡統一回傳空字串。
 */
const RESERVED_OR_UNKNOWN = new Set(['XX', 'ZZ']);

/** GeoIP 無法解析時的預設顯示國家（與後端 geoip.DefaultDisplayCountry 一致） */
export const DEFAULT_DISPLAY_COUNTRY = 'US';

export function countryFlag(cc: string | null | undefined): string {
  if (!cc || cc.length !== 2) return '';
  const up = cc.toUpperCase();
  if (RESERVED_OR_UNKNOWN.has(up)) return '';
  const A = 0x1f1e6;
  const a = up.charCodeAt(0);
  const b = up.charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return '';
  return String.fromCodePoint(A + a - 65, A + b - 65);
}

/**
 * 顯示用的國家代碼。XX/ZZ 等保留碼以「—」替代，避免畫面出現無意義的英文字母。
 */
export function countryLabel(cc: string | null | undefined): string {
  if (!cc) return '—';
  if (RESERVED_OR_UNKNOWN.has(cc.toUpperCase())) return '—';
  return cc;
}

/**
 * 判斷國碼是否為「無法定位」狀態（空值、XX、ZZ 等）。
 * 主要用途：CDN anycast IP 在 GeoIP DB 常常拿不到具體國家，
 * 前端需要這個判斷來切換成「Anycast / Unknown」呈現方式。
 */
export function isUnknownCountry(cc: string | null | undefined): boolean {
  if (!cc) return true;
  return RESERVED_OR_UNKNOWN.has(cc.toUpperCase());
}

/**
 * 表格／地圖顯示用國碼：XX／空值 → US；延遲校正後的境內國家（如 TW）保留。
 */
export function resolveDisplayCountry(cc: string | null | undefined): string {
  if (isUnknownCountry(cc)) return DEFAULT_DISPLAY_COUNTRY;
  return cc;
}
