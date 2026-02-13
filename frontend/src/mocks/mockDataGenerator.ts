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
const ISPS = ['Chunghwa Telecom', 'Google Cloud', 'Amazon Data Services', 'Cloudflare', 'Microsoft Azure'];
const APP_NAMES = ['Chrome', 'Firefox', 'Safari', 'Curl', 'Slack', 'Discord', 'Docker'];
const APP_CATEGORIES = ['Browser', 'Network Tool', 'Chat', 'DevOps'];

export const generateRandomDnsRecord = (sourceIp?: string): DnsRecord => {
  const isForeign = Math.random() > 0.3;
  return {
    timestamp: new Date().toISOString(),
    domain: DOMAINS[Math.floor(Math.random() * DOMAINS.length)],
    type: Math.random() > 0.8 ? 'AAAA' : 'A',
    resultIp: `1.2.3.${Math.floor(Math.random() * 255)}`,
    isForeign,
    latency: Math.floor(Math.random() * 200) + 10,
    sourceIp: sourceIp || IPS[Math.floor(Math.random() * IPS.length)],
    country: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)],
    asn: Math.floor(Math.random() * 60000) + 1000,
    isp: ISPS[Math.floor(Math.random() * ISPS.length)],
    appName: APP_NAMES[Math.floor(Math.random() * APP_NAMES.length)],
    appCategory: APP_CATEGORIES[Math.floor(Math.random() * APP_CATEGORIES.length)],
  };
};

export const generateSnapshot = (count: number, sourceIp: string): DnsRecord[] => {
  return Array.from({ length: count }, () => generateRandomDnsRecord(sourceIp));
};
