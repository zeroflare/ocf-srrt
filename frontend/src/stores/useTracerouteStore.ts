import { create } from 'zustand';
import { TraceResult } from '../types';

interface TracerouteState {
  activeResult: TraceResult | null;
  isLoading: boolean;
  isOpen: boolean;
  hasResult: boolean;
  error: string | null;

  // Actions
  runTraceroute: (ip: string) => Promise<void>;
  closeDrawer: () => void;
  setResult: (result: TraceResult | null) => void;
}

export const useTracerouteStore = create<TracerouteState>((set) => ({
  activeResult: null,
  isLoading: false,
  isOpen: false,
  hasResult: false,
  error: null,

  runTraceroute: async (ip: string) => {
    set({ isLoading: true, isOpen: true, error: null, activeResult: null, hasResult: false });

    const useMock = import.meta.env.VITE_USE_MOCK === 'true';

    if (useMock) {
      // 模擬 API 延遲
      await new Promise(resolve => setTimeout(resolve, 1500));

      const mockResult: TraceResult = {
        target: ip,
        time: new Date().toISOString(),
        status: 'completed',
        hops: [
          { index: 1, ip: '192.168.1.1', host: 'gateway', latency: 2.5, country: 'TW', coords: [121.5, 25.0] },
          { index: 2, ip: '168.95.1.1', host: 'hinet.net', latency: 8.2, country: 'TW', coords: [121.3, 24.8] },
          { index: 3, ip: '203.75.1.1', host: 'tp-core.hinet.net', latency: 12.5, country: 'TW', coords: [121.0, 24.5] },
          { index: 4, ip: '72.14.232.1', host: 'google-gw.net', latency: 45.1, country: 'US', coords: [-122.08, 37.38] }, // 跨太平洋跳躍
          { index: 5, ip: '142.250.1.1', host: 'google.com', latency: 155.8, country: 'US', coords: [-74.00, 40.71] },   // 美國東岸跳躍
        ]
      };

      set({ activeResult: mockResult, isLoading: false, hasResult: true });
      return;
    }

    try {
      const response = await fetch(`/api/traceroute?target=${ip}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch traceroute: ${response.statusText}`);
      }
      const data: TraceResult = await response.json();
      set({ activeResult: data, isLoading: false, hasResult: true });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  closeDrawer: () => set({ isOpen: false }),
  setResult: (result) => set({ activeResult: result }),
}));
