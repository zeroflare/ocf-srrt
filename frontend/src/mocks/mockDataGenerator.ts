import { DnsRecord } from '../types';

const DOMAINS = [
  'google.com', 'facebook.com', 'youtube.com', 'amazon.com', 'wikipedia.org',
  'twitter.com', 'instagram.com', 'netflix.com', 'apple.com', 'microsoft.com',
  'github.com', 'openai.com', 'cloudflare.com', 'twitch.tv', 'reddit.com'
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
const APP_NAMES = ['Chrome', 'Firefox', 'Safari', 'Curl', 'Slack', 'Discord', 'Docker'];
const APP_CATEGORIES = ['Browser', 'Network Tool', 'Chat', 'DevOps'];

export const generateRandomDnsRecord = (sourceIp?: string): DnsRecord => {
  const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  const isForeign = country !== 'TW';
  const coords = COUNTRY_COORDS[country] || [121.5, 25.0];
  // Add small random offset to avoid exact overlaps
  const lon = coords[0] + (Math.random() - 0.5) * 4;
  const lat = coords[1] + (Math.random() - 0.5) * 4;
  return {
    timestamp: new Date().toISOString(),
    domain: DOMAINS[Math.floor(Math.random() * DOMAINS.length)],
    type: Math.random() > 0.8 ? 'AAAA' : 'A',
    resultIp: `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
    isForeign,
    foreignConfidence: isForeign ? (Math.random() > 0.3 ? 'high' : 'low') : '',
    latency: Math.floor(Math.random() * 200) + 10,
    sourceIp: sourceIp || IPS[Math.floor(Math.random() * IPS.length)],
    country,
    asn: Math.floor(Math.random() * 60000) + 1000,
    isp: ISPS[Math.floor(Math.random() * ISPS.length)],
    appName: APP_NAMES[Math.floor(Math.random() * APP_NAMES.length)],
    appCategory: APP_CATEGORIES[Math.floor(Math.random() * APP_CATEGORIES.length)],
    longitude: lon,
    latitude: lat,
  };
};

export const generateSnapshot = (count: number, sourceIp: string): DnsRecord[] => {
  return Array.from({ length: count }, () => generateRandomDnsRecord(sourceIp));
};
