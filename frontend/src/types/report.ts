import { DnsRecord } from '../types';
import { PhoneBrand } from '../utils/phoneBrand';

/**
 * 與 wireframe 的 `report.html?d=...` payload 對齊：
 * 報告本身只攜帶記錄 + 產生時間 + 監測時的手機品牌。
 *
 * AppInfo 欄位過去由 ReportModal 收集（App name、icon、商店連結），
 * wireframe 並無此流程；此處保留 optional 是為了向後相容已產生的舊報告連結，
 * 新建立的報告一律不再填寫。
 */
export interface AppInfo {
  appName: string;
  appLogoUrl: string;
  appleStoreUrl: string;
  googlePlayUrl: string;
  websiteUrl: string;
}

export interface ReportData {
  records: DnsRecord[];
  appInfo: AppInfo;
  generatedAt: string;
  /** 監控當下選擇的手機品牌（自動偵測或手動覆寫） */
  phoneBrand?: PhoneBrand;
  /**
   * 產生報告的主機節點境內國碼（如 TW / JP），驅動地圖原點與境內/境外視覺基準。
   * 報告頁不會打 /api/token，故原點資訊必須隨報告序列化；舊報告無此欄位時 fallback TW。
   */
  localCountry?: string;
  /** 產生端主機地圖中心座標 [lon, lat]，讓報告地圖視野與主頁一致；無則前端用 hub 座標 fallback。 */
  hostCoordinates?: [number, number];
  /** 產生端主機地圖預設 zoom，讓報告地圖縮放與主頁一致；無則前端用預設值。 */
  mapZoom?: number;
}

export const EMPTY_APP_INFO: AppInfo = {
  appName: '',
  appLogoUrl: '',
  appleStoreUrl: '',
  googlePlayUrl: '',
  websiteUrl: '',
};
