import appInfoData from '../data/appInfo.json';

export interface AppInfo {
  name: string;
  description: string;
  domains: string[];
  appStoreUrl?: string;
  googlePlayUrl?: string;
  websiteUrl?: string;
  appIconUrl?: string;
}

// 以 App 名稱查詢（供 LiveTable appName 欄位使用）
const byName = new Map<string, AppInfo>();

// 以域名後綴查詢
const domainSuffixes: { suffix: string; app: AppInfo }[] = [];

// 建立索引
for (const app of appInfoData.apps as AppInfo[]) {
  byName.set(app.name, app);
  for (const domain of app.domains) {
    domainSuffixes.push({ suffix: domain, app });
  }
}

// 按後綴長度降序排列，確保最精確的匹配優先
domainSuffixes.sort((a, b) => b.suffix.length - a.suffix.length);

export function getAppInfoByName(appName: string): AppInfo | null {
  return byName.get(appName) ?? null;
}

export function getAppInfoByDomain(domain: string): AppInfo | null {
  const normalized = domain.toLowerCase().replace(/\.$/, '');
  for (const { suffix, app } of domainSuffixes) {
    if (suffix.startsWith('.')) {
      // 後綴匹配：domain 以該後綴結尾
      if (normalized.endsWith(suffix)) return app;
    } else {
      // 精確匹配
      if (normalized === suffix || normalized.endsWith('.' + suffix)) return app;
    }
  }
  return null;
}
