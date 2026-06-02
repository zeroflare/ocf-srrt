import { useState, useEffect, useRef } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord } from '../types';
import { logger } from '../utils/logger';

// 定義 WebSocket 傳來的訊息格式 (Discriminated Union)
type WebSocketPayload =
    | { type: 'snapshot'; data: DnsRecord[] } // 歷史快照
    | DnsRecord;                              // 單筆更新

const getWebSocketUrl = (token: string) => {
  if (import.meta.env.VITE_WS_URL) {
    return `${import.meta.env.VITE_WS_URL}?token=${token}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  return `${protocol}//${host}/ws?token=${token}`;
};

const getTokenUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/api/token`;
  }
  return `/api/token`;
};

const calculateBackoff = (attempt: number): number => {
  const base = Math.min(1000 * Math.pow(2, attempt), 60000);
  const jitter = base * (0.7 + Math.random() * 0.6); // ±30% jitter
  return Math.round(jitter);
};

// 判斷是否為 IPv6 位址（包含冒號即為 IPv6）
const isIPv6 = (ip: string): boolean => ip.includes(':');

// 當後端回傳 IPv6 時，嘗試從 IPv4-only API 取得使用者的 IPv4 位址
const fetchIPv4Fallback = async (): Promise<string | null> => {
  try {
    const resp = await fetch('https://api4.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.ip || null;
  } catch {
    return null;
  }
};

const LOCAL_COUNTRY_KEY = 'localCountry';
const LOCAL_COUNTRY_UPDATED_KEY = 'localCountryUpdatedAt';
const LOCAL_COUNTRY_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

const getCachedLocalCountry = (): string | null => {
  const country = localStorage.getItem(LOCAL_COUNTRY_KEY);
  const updatedAt = localStorage.getItem(LOCAL_COUNTRY_UPDATED_KEY);
  if (country && updatedAt) {
    const elapsed = Date.now() - new Date(updatedAt).getTime();
    if (elapsed < LOCAL_COUNTRY_TTL) return country;
  }
  return null;
};

const setCachedLocalCountry = (country: string) => {
  localStorage.setItem(LOCAL_COUNTRY_KEY, country);
  localStorage.setItem(LOCAL_COUNTRY_UPDATED_KEY, new Date().toISOString());
};

export const useDnsStream = (enabled: boolean = true) => {
  const { addRecord, loadSnapshot, setToken, setDnsIp, setLocalCountry, setHostLocation, monitoringIp } = useDnsStore();

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectDelay, setReconnectDelay] = useState<number | null>(null);
  const [myIp, setMyIp] = useState<string | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | undefined>(undefined);
  const attemptRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  // 追蹤目前訂閱的 IP，供重連時自動重新 subscribe
  const subscribedIpRef = useRef<string | null>(null);

  // 發送 subscribe 訊息，切換後端監聽的目標 IP；fresh=true 時不請求歷史 snapshot
  const sendSubscribe = useRef((ip: string, fresh = false) => {
    subscribedIpRef.current = ip; // 記住最新的訂閱 IP
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ type: 'subscribe', ip, fresh });
      ws.current.send(msg);
    }
  });

  // 同步 monitoringIp 到 subscribedIpRef，確保重連時使用最新的監控 IP
  useEffect(() => {
    if (monitoringIp) {
      subscribedIpRef.current = monitoringIp;
    }
  }, [monitoringIp]);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      setReconnectDelay(null);
      return;
    }

    const connectWithToken = (token: string) => {
      const url = getWebSocketUrl(token);

      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        setIsConnected(true);
        setReconnectDelay(null);
        attemptRef.current = 0;

        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = undefined;
        }

        // 重連後自動重新 subscribe，確保後端 clientIP 與前端 monitoringIp 一致
        // 否則後端用 token 原始 IP（可能是 IPv6），snapshot 和推播都會對不上
        const ipToSubscribe = subscribedIpRef.current;
        if (ipToSubscribe && ws.current && ws.current.readyState === WebSocket.OPEN) {
          const fresh = useDnsStore.getState().freshSession;
          const msg = JSON.stringify({ type: 'subscribe', ip: ipToSubscribe, fresh });
          ws.current.send(msg);
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data) as WebSocketPayload;
          if ('data' in rawData && Array.isArray(rawData.data)) {
            loadSnapshot(rawData.data as DnsRecord[]);
          } else {
            const rec = rawData as DnsRecord;
            addRecord(rec);
          }
        } catch (error) {
          logger.error('[WS] Failed to parse message');
        }
      };

      ws.current.onclose = (event) => {
        setIsConnected(false);

        // 4001 = token 無效，需要重新取得
        if (event.code === 4001 || event.code === 1006) {
          tokenRef.current = null;
        }

        const delay = calculateBackoff(attemptRef.current);
        attemptRef.current++;

        setReconnectDelay(delay);

        if (!reconnectTimeout.current) {
          reconnectTimeout.current = window.setTimeout(() => {
            reconnectTimeout.current = undefined;
            fetchTokenAndConnect();
          }, delay);
        }
      };

      ws.current.onerror = () => {
        logger.error('[WS] Connection error');
        ws.current?.close();
      };
    };

    const fetchTokenAndConnect = async () => {
      // 如果已有 token，直接連線
      if (tokenRef.current) {
        connectWithToken(tokenRef.current);
        return;
      }

      try {
        // 先從快取讀取 localCountry
        const cachedCountry = getCachedLocalCountry();
        if (cachedCountry) {
          setLocalCountry(cachedCountry);
        }

        const resp = await fetch(getTokenUrl());
        if (!resp.ok) {
          throw new Error(`Token fetch failed: ${resp.status}`);
        }
        const data = await resp.json();
        tokenRef.current = data.token;
        setToken(data.token);
        // 後端同時回傳 ip，供前端 IP 欄位預填；若為 IPv6 則嘗試取得 IPv4
        if (data.ip) {
          if (isIPv6(data.ip)) {
            fetchIPv4Fallback().then(ipv4 => setMyIp(ipv4 || data.ip));
          } else {
            setMyIp(data.ip);
          }
        }
        // 後端回傳 DNS 伺服器公網 IP，供 DnsSetupBanner 顯示
        if (data.dnsIp) { setDnsIp(data.dnsIp); }
        // 更新 localCountry 並快取
        if (data.localCountry) {
          setLocalCountry(data.localCountry);
          setCachedLocalCountry(data.localCountry);
        }
        // 主機節點地圖資訊（座標 / zoom / 顯示名稱），供地圖中心隨主機位置而變
        if (data.hostCoordinates || data.mapZoom || data.hostLabel) {
          setHostLocation({
            coordinates: Array.isArray(data.hostCoordinates) ? data.hostCoordinates : null,
            mapZoom: typeof data.mapZoom === 'number' ? data.mapZoom : null,
            label: typeof data.hostLabel === 'string' ? data.hostLabel : null,
          });
        }
        connectWithToken(data.token);
      } catch (error) {
        logger.error('[WS] Failed to fetch token');

        const delay = calculateBackoff(attemptRef.current);
        attemptRef.current++;
        setReconnectDelay(delay);

        reconnectTimeout.current = window.setTimeout(() => {
          reconnectTimeout.current = undefined;
          fetchTokenAndConnect();
        }, delay);
      }
    };

    fetchTokenAndConnect();

    return () => {
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [addRecord, loadSnapshot, enabled]);

  return { isConnected, reconnectDelay, myIp, sendSubscribe: sendSubscribe.current };
};
