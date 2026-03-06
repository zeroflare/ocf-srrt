export interface CloudProvider {
  name: string;
  colorClass: string; // Tailwind bg + text classes
}

const PROVIDERS: Array<{ pattern: RegExp; provider: CloudProvider }> = [
  { pattern: /amazon|aws/i,           provider: { name: 'AWS',        colorClass: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' } },
  { pattern: /google/i,               provider: { name: 'GCP',        colorClass: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' } },
  { pattern: /microsoft|azure/i,      provider: { name: 'Azure',      colorClass: 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' } },
  { pattern: /cloudflare/i,           provider: { name: 'Cloudflare', colorClass: 'bg-orange-500/20 text-orange-600 dark:text-orange-400' } },
  { pattern: /akamai/i,               provider: { name: 'Akamai',     colorClass: 'bg-sky-500/20 text-sky-600 dark:text-sky-400' } },
  { pattern: /fastly/i,               provider: { name: 'Fastly',     colorClass: 'bg-red-500/20 text-red-600 dark:text-red-400' } },
  { pattern: /alibaba/i,              provider: { name: 'Alibaba',    colorClass: 'bg-orange-500/20 text-orange-600 dark:text-orange-400' } },
  { pattern: /tencent/i,              provider: { name: 'Tencent',    colorClass: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400' } },
  { pattern: /digitalocean/i,         provider: { name: 'DO',         colorClass: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' } },
  { pattern: /linode/i,               provider: { name: 'Linode',     colorClass: 'bg-green-500/20 text-green-600 dark:text-green-400' } },
];

/**
 * 根據 ISP 名稱判斷是否為已知雲端/CDN 服務商。
 * 使用 ISP 欄位（來自 GeoIP ASN 資料庫），前端純運算，無需後端改動。
 */
export function detectCloudProvider(isp: string): CloudProvider | null {
  if (!isp) return null;
  for (const entry of PROVIDERS) {
    if (entry.pattern.test(isp)) {
      return entry.provider;
    }
  }
  return null;
}
