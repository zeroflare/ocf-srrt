import { useState, useEffect, useRef } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord } from '../types';

// 定義 WebSocket 傳來的訊息格式 (Discriminated Union)
type WebSocketPayload =
    | { type: 'snapshot'; data: DnsRecord[] } // 歷史快照
    | DnsRecord;                              // 單筆更新 (假設後端沒包 type，或與 DnsRecord 結構一致)

const getWebSocketUrl = () => {
  // 1. 優先讀取環境變數 (適合 K8s/Docker 部署時注入)
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  // 2. 自動判斷 (適合直接跑在 Host Network 或前後端整合部署)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  return `${protocol}//${host}/ws`;
};

export const useDnsStream = (enabled: boolean = true) => {
  const { addRecord, loadSnapshot } = useDnsStore();

  const [isConnected, setIsConnected] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }

    const connect = () => {
      const url = getWebSocketUrl();
      console.log(`Connecting to WebSocket: ${url}`);

      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('SRRT WebSocket connected');
        setIsConnected(true);

        // 連線成功，清除重連計時器
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = undefined;
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data) as WebSocketPayload;
          // [Type Guard] 判斷是否為 Snapshot
          // 檢查邏輯：有 'data' 欄位且是陣列 -> Snapshot
          if ('data' in rawData && Array.isArray(rawData.data)) {
            console.log(`[WS] Loaded snapshot: ${rawData.data.length} records`);
            loadSnapshot(rawData.data as DnsRecord[]);
          } else {
            // 否則視為單筆 DnsRecord
            addRecord(rawData as DnsRecord);
          }
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      ws.current.onclose = () => {
        console.warn('[WS] Disconnected. Reconnecting in 3s...');
        setIsConnected(false);

        // 重連機制：確保不會重複設定 Timer
        if (!reconnectTimeout.current) {
          reconnectTimeout.current = window.setTimeout(() => {
            // 這裡遞迴呼叫 connect，但因為是在 useEffect 內部定義的，
            // 若 dependencies 沒變，這個 closure 是安全的。
            connect();
          }, 3000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('[WS] Error:', error);
        ws.current?.close(); // 觸發 onclose 進行重連
      };
    };

    connect();

    // Cleanup Function (元件卸載時執行)
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

  return isConnected;
};
