import { useState, useEffect, useRef } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { generateRandomDnsRecord, generateSnapshot } from '../mocks/mockDataGenerator';
import { logger } from '../utils/logger';

export const useMockDnsStream = (enabled: boolean = true) => {
  const { addRecord, monitoringIp } = useDnsStore();
  const [isConnected, setIsConnected] = useState(false);
  const intervalRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }
    // 模擬連線延遲
    const connectTimer = window.setTimeout(() => {
      logger.info('[MockWS] Connected to mock DNS stream');
      setIsConnected(true);

      // 如果有設定監控 IP，則載入快照
      // 模擬快照也是「一筆一筆」快速進入的感覺
      if (monitoringIp) {
        const count = 20;
        const snapshot = generateSnapshot(count, monitoringIp);

        let i = 0;
        const snapshotInterval = window.setInterval(() => {
          if (i < snapshot.length) {
            addRecord(snapshot[i]);
            i++;
          } else {
            clearInterval(snapshotInterval);
          }
        }, 50); // 每 50ms 噴一筆
      }
    }, 1000);

    return () => {
      clearTimeout(connectTimer);
    };
  }, [monitoringIp, addRecord, enabled]);

  useEffect(() => {
    if (enabled && isConnected && monitoringIp) {
      // 模擬定時推送資料
      intervalRef.current = window.setInterval(() => {
        const record = generateRandomDnsRecord(monitoringIp);
        addRecord(record);
      }, 1000); // 每秒推送一筆
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isConnected, monitoringIp, addRecord, enabled]);

  return { isConnected, reconnectDelay: null as number | null, myIp: monitoringIp || '192.168.1.100' };
};
