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

const COUNTRIES = ['TW', 'US', 'JP', 'KR', 'SG', 'HK', 'DE', 'GB', 'FR', 'AU'];
const COUNTRY_COORDS: Record<string, [number, number]> = {
  TW: [121.5, 25.0], US: [-122.4, 37.8], JP: [139.7, 35.7], KR: [127.0, 37.6],
  SG: [103.8, 1.35], HK: [114.2, 22.3], DE: [13.4, 52.5], GB: [-0.12, 51.5],
  FR: [2.35, 48.9], AU: [151.2, -33.9],
};
const ISPS = ['Chunghwa Telecom', 'Google Cloud', 'Amazon Data Services', 'Cloudflare', 'Microsoft Azure'];

let _mockIdCounter = 0;

export const generateRandomDnsRecord = (sourceIp?: string): DnsRecord => {
  const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  const localCountry = useDnsStore.getState().localCountry || 'TW';
  const isForeign = country !== localCountry;
  const coords = COUNTRY_COORDS[country] || [121.5, 25.0];
  // Add small random offset to avoid exact overlaps
  const lon = coords[0] + (Math.random() - 0.5) * 4;
  const lat = coords[1] + (Math.random() - 0.5) * 4;
  const app = MOCK_APPS[Math.floor(Math.random() * MOCK_APPS.length)];
  return {
    _id: `mock-${++_mockIdCounter}`,
    timestamp: new Date().toISOString(),
    domain: app.domain,
    type: Math.random() > 0.8 ? 'AAAA' : 'A',
    resultIp: `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    isForeign,
    foreignConfidence: isForeign ? (Math.random() > 0.3 ? 'high' : 'low') : '',
    latency: Math.floor(Math.random() * 200) + 10,
    sourceIp: sourceIp || IPS[Math.floor(Math.random() * IPS.length)],
    country,
    asn: Math.floor(Math.random() * 60000) + 1000,
    isp: ISPS[Math.floor(Math.random() * ISPS.length)],
    appName: app.appName,
    appCategory: app.appCategory,
    os: Math.random() > 0.5 ? 'Windows' : (Math.random() > 0.5 ? 'macOS' : 'iOS'),
    longitude: lon,
    latitude: lat,
  };
};

export const generateSnapshot = (count: number, sourceIp: string): DnsRecord[] => {
  return Array.from({ length: count }, () => generateRandomDnsRecord(sourceIp));
};
