import { DnsRecord } from '../types';
import { useDnsStore } from '../stores/useDnsStore';

// Domain、AppName、AppCategory 必須與 appInfo.json 中的 name 對應，
// 這樣 LiveTable 的 AppInfoTooltip 才能正確顯示。
const MOCK_APPS: { domain: string; appName: string; appCategory: string }[] = [
  { domain: 'www.google.com', appName: 'Google', appCategory: 'Search Engine' },
  { domain: 'mail.google.com', appName: 'Google', appCategory: 'Search Engine' },
  { domain: 'apis.google.com', appName: 'Google', appCategory: 'Search Engine' },
  { domain: 'www.youtube.com', appName: 'YouTube', appCategory: 'Streaming' },
  { domain: 'i.ytimg.com', appName: 'YouTube', appCategory: 'Streaming' },
  { domain: 'rr3---sn-a5mlrnek.googlevideo.com', appName: 'YouTube', appCategory: 'Streaming' },
  { domain: 'www.facebook.com', appName: 'Facebook', appCategory: 'Social' },
  { domain: 'static.xx.fbcdn.net', appName: 'Facebook', appCategory: 'Social' },
  { domain: 'www.instagram.com', appName: 'Instagram', appCategory: 'Social' },
  { domain: 'scontent.cdninstagram.com', appName: 'Instagram', appCategory: 'Social' },
  { domain: 'www.apple.com', appName: 'Apple', appCategory: 'System Service' },
  { domain: 'icloud.com', appName: 'Apple', appCategory: 'System Service' },
  { domain: 'updates.cdn-apple.com', appName: 'Apple', appCategory: 'System Service' },
  { domain: 'outlook.office.com', appName: 'Microsoft', appCategory: 'Productivity' },
  { domain: 'login.microsoftonline.com', appName: 'Microsoft', appCategory: 'Productivity' },
  { domain: 'www.bing.com', appName: 'Microsoft', appCategory: 'Productivity' },
  { domain: 'www.netflix.com', appName: 'Netflix', appCategory: 'Streaming' },
  { domain: 'api.netflix.com', appName: 'Netflix', appCategory: 'Streaming' },
  { domain: 'cdn.cloudflare.com', appName: 'Cloudflare', appCategory: 'CDN' },
  { domain: 'cloudflare-dns.com', appName: 'Cloudflare', appCategory: 'CDN' },
  { domain: 'github.com', appName: 'GitHub', appCategory: 'Developer' },
  { domain: 'api.github.com', appName: 'GitHub', appCategory: 'Developer' },
  { domain: 'raw.githubusercontent.com', appName: 'GitHub', appCategory: 'Developer' },
  { domain: 'plugins.jetbrains.com', appName: 'JetBrains', appCategory: 'Developer' },
  { domain: 'download.jetbrains.com', appName: 'JetBrains', appCategory: 'Developer' },
];

const IPS = [
  '192.168.1.100', '192.168.1.101', '192.168.1.102', '10.0.0.5', '172.16.0.20'
];

const ISPS = ['Chunghwa Telecom', 'Google Cloud', 'Amazon Data Services', 'Cloudflare', 'Microsoft Azure'];

/**
 * 測試情境定義 — 每個情境對應不同的海纜推測路徑
 * 座標精確對應真實伺服器位置，方便驗證動畫方向和多海纜路由
 */
interface TestScenario {
  country: string;
  coords: [number, number];   // [lon, lat]
  latency: number;             // 模擬延遲 ms
  expectedCable: string;       // 預期匹配的主海纜
  description: string;         // 給開發者看的說明
  weight: number;              // 出現權重（越大越常出現）
}

const TEST_SCENARIOS: TestScenario[] = [
  // ─── 日本方向（多條海纜可匹配） ───
  {
    country: 'JP', coords: [139.69, 35.68], latency: 30,
    expectedCable: 'apcn2', description: '日本東京 — APCN2/APG/FASTER 可達', weight: 5,
  },
  {
    country: 'JP', coords: [135.50, 34.69], latency: 35,
    expectedCable: 'apricot', description: '日本大阪 — Apricot/SJC2', weight: 3,
  },

  // ─── 香港/中國方向 ───
  {
    country: 'HK', coords: [114.17, 22.28], latency: 40,
    expectedCable: 'c2c', description: '香港 — C2C/EAC1/APG/SJC2 可達', weight: 3,
  },
  {
    country: 'CN', coords: [121.47, 31.23], latency: 25,
    expectedCable: 'apcn2', description: '中國上海 — APCN2/TSE1', weight: 2,
  },
  {
    country: 'CN', coords: [116.40, 39.90], latency: 45,
    expectedCable: 'tse1', description: '中國北京 — TSE1/C2C', weight: 2,
  },

  // ─── 新加坡方向 ───
  {
    country: 'SG', coords: [103.85, 1.29], latency: 60,
    expectedCable: 'sjc2', description: '新加坡 — SJC2 可直達', weight: 3,
  },

  // ─── 菲律賓方向 ───
  {
    country: 'PH', coords: [121.00, 14.60], latency: 55,
    expectedCable: 'eac2', description: '菲律賓馬尼拉 — EAC2 可達', weight: 2,
  },

  // ─── 關島方向 ───
  {
    country: 'GU', coords: [144.75, 13.44], latency: 50,
    expectedCable: 'apricot', description: '關島 — Apricot 可達', weight: 1,
  },

  // ─── 美國方向（多海纜路由：TW→JP→US 或 PLCN 直達） ───
  {
    country: 'US', coords: [-122.42, 37.77], latency: 150,
    expectedCable: 'plcn', description: '美國舊金山 — PLCN 直達', weight: 4,
  },
  {
    country: 'US', coords: [-118.24, 34.05], latency: 160,
    expectedCable: 'plcn', description: '美國洛杉磯 — PLCN 直達', weight: 3,
  },
  {
    country: 'US', coords: [-73.94, 40.67], latency: 200,
    expectedCable: 'plcn', description: '美國紐約 — 跨太平洋', weight: 2,
  },

  // ─── 韓國方向（多海纜中繼：TW→JP→KR） ───
  {
    country: 'KR', coords: [126.98, 37.57], latency: 45,
    expectedCable: 'apcn2', description: '韓國首爾 — 經日本中轉', weight: 3,
  },

  // ─── 澳洲方向（多海纜中繼） ───
  {
    country: 'AU', coords: [151.21, -33.87], latency: 120,
    expectedCable: 'sjc2', description: '澳洲雪梨 — 經新加坡/關島中轉', weight: 2,
  },

  // ─── 歐洲方向（多海纜中繼） ───
  {
    country: 'DE', coords: [13.41, 52.52], latency: 250,
    expectedCable: 'plcn', description: '德國柏林 — 經日本/跨太平洋', weight: 1,
  },
  {
    country: 'GB', coords: [-0.12, 51.51], latency: 260,
    expectedCable: 'plcn', description: '英國倫敦 — 經日本/跨太平洋', weight: 1,
  },

  // ─── 台灣境內（不應匹配任何國際海纜） ───
  {
    country: 'TW', coords: [121.56, 25.03], latency: 5,
    expectedCable: 'none', description: '台灣台北 — 境內，不走海纜', weight: 4,
  },
  {
    country: 'TW', coords: [120.31, 22.62], latency: 8,
    expectedCable: 'none', description: '台灣高雄 — 境內，不走海纜', weight: 2,
  },
];

// 建立加權隨機選取的展開陣列
const WEIGHTED_SCENARIOS: TestScenario[] = [];
for (const s of TEST_SCENARIOS) {
  for (let i = 0; i < s.weight; i++) {
    WEIGHTED_SCENARIOS.push(s);
  }
}

let _mockIdCounter = 0;

export const generateRandomDnsRecord = (sourceIp?: string): DnsRecord => {
  // 從加權情境中隨機選取
  const scenario = WEIGHTED_SCENARIOS[Math.floor(Math.random() * WEIGHTED_SCENARIOS.length)];

  const localCountry = useDnsStore.getState().localCountry || 'TW';
  const isForeign = scenario.country !== localCountry;

  // 加小量隨機偏移，避免完全重疊
  const lon = scenario.coords[0] + (Math.random() - 0.5) * 2;
  const lat = scenario.coords[1] + (Math.random() - 0.5) * 2;

  // 延遲加一點隨機變化
  const latency = scenario.latency + Math.floor((Math.random() - 0.5) * scenario.latency * 0.3);

  const app = MOCK_APPS[Math.floor(Math.random() * MOCK_APPS.length)];

  return {
    _id: `mock-${++_mockIdCounter}`,
    timestamp: new Date().toISOString(),
    domain: app.domain,
    type: Math.random() > 0.8 ? 'AAAA' : 'A',
    resultIp: `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    isForeign,
    foreignConfidence: isForeign ? (Math.random() > 0.3 ? 'high' : 'low') : '',
    latency,
    sourceIp: sourceIp || IPS[Math.floor(Math.random() * IPS.length)],
    country: scenario.country,
    asn: Math.floor(Math.random() * 60000) + 1000,
    isp: ISPS[Math.floor(Math.random() * ISPS.length)],
    appName: app.appName,
    appCategory: app.appCategory,
    os: Math.random() > 0.5 ? 'Windows' : (Math.random() > 0.5 ? 'macOS' : 'iOS'),
    longitude: lon,
    latitude: lat,
    appMatchMethod: Math.random() > 0.6 ? 'exact' : (Math.random() > 0.5 ? 'regex' : 'heuristic'),
    osInferred: true,
    geoInferred: true,
  };
};

export const generateSnapshot = (count: number, sourceIp: string): DnsRecord[] => {
  return Array.from({ length: count }, () => generateRandomDnsRecord(sourceIp));
};
