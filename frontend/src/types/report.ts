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
}

export const EMPTY_APP_INFO: AppInfo = {
  appName: '',
  appLogoUrl: '',
  appleStoreUrl: '',
  googlePlayUrl: '',
  websiteUrl: '',
};
