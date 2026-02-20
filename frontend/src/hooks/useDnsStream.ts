import { useState, useEffect, useRef } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord } from '../types';

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

export const useDnsStream = (enabled: boolean = true) => {
  const { addRecord, loadSnapshot } = useDnsStore();

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectDelay, setReconnectDelay] = useState<number | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | undefined>(undefined);
  const attemptRef = useRef(0);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      setReconnectDelay(null);
      return;
    }

    const connectWithToken = (token: string) => {
      const url = getWebSocketUrl(token);
      console.log(`Connecting to WebSocket: ${url}`);

      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('SRRT WebSocket connected');
        setIsConnected(true);
        setReconnectDelay(null);
        attemptRef.current = 0;

        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = undefined;
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data) as WebSocketPayload;
          if ('data' in rawData && Array.isArray(rawData.data)) {
            console.log(`[WS] Loaded snapshot: ${rawData.data.length} records`);
            loadSnapshot(rawData.data as DnsRecord[]);
          } else {
            addRecord(rawData as DnsRecord);
          }
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
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

        console.warn(`[WS] Disconnected. Reconnecting in ${(delay / 1000).toFixed(1)}s... (attempt ${attemptRef.current})`);
        setReconnectDelay(delay);

        if (!reconnectTimeout.current) {
          reconnectTimeout.current = window.setTimeout(() => {
            reconnectTimeout.current = undefined;
            fetchTokenAndConnect();
          }, delay);
        }
      };

      ws.current.onerror = (error) => {
        console.error('[WS] Error:', error);
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
        const resp = await fetch(getTokenUrl());
        if (!resp.ok) {
          throw new Error(`Token fetch failed: ${resp.status}`);
        }
        const data = await resp.json();
        tokenRef.current = data.token;
        console.log('[WS] Token acquired');
        connectWithToken(data.token);
      } catch (error) {
        console.error('[WS] Failed to fetch token:', error);

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

  return { isConnected, reconnectDelay };
};
