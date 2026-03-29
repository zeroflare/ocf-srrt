import { create } from 'zustand';
import { TraceResult, Hop } from '../types';
import { useDnsStore } from './useDnsStore';

const MAX_HISTORY = 20;

const MOCK_HOPS: Hop[] = [
  { index: 1, ip: '192.168.1.1', host: 'gateway', latency: 2.5, rtts: [], loss: 0, best: 2.3, worst: 2.7, stdev: 0.2, country: 'TW', coords: [121.5, 25.0], asn: 0, isp: 'Private' },
  { index: 2, ip: '168.95.1.1', host: 'hinet.net', latency: 8.2, rtts: [], loss: 0, best: 7.8, worst: 8.6, stdev: 0.4, country: 'TW', coords: [121.3, 24.8], asn: 3462, isp: 'Chunghwa Telecom' },
  { index: 3, ip: '203.75.1.1', host: 'tp-core.hinet.net', latency: 12.5, rtts: [], loss: 0, best: 11.9, worst: 13.1, stdev: 0.6, country: 'TW', coords: [121.0, 24.5], asn: 3462, isp: 'Chunghwa Telecom' },
  { index: 4, ip: '72.14.232.1', host: 'google-gw.net', latency: 45.1, rtts: [], loss: 10, best: 43.2, worst: 47.0, stdev: 1.9, country: 'US', coords: [-122.08, 37.38], asn: 15169, isp: 'Google LLC' },
  { index: 5, ip: '142.250.1.1', host: 'google.com', latency: 155.8, rtts: [], loss: 0, best: 152.1, worst: 159.5, stdev: 3.7, country: 'US', coords: [-74.00, 40.71], asn: 15169, isp: 'Google LLC' },
];

/** 產生 mock TraceResult，供 mock 模式使用 */
export function createMockTraceResult(target: string): TraceResult {
  return {
    target,
    time: new Date().toISOString(),
    status: 'completed',
    hops: MOCK_HOPS,
  };
}

interface TracerouteState {
  activeResult: TraceResult | null;
  history: TraceResult[];
  isLoading: boolean;
  isOpen: boolean;
  hasResult: boolean;
  error: string | null;

  // Actions
  runTraceroute: (ip: string, token?: string) => Promise<void>;
  closeDrawer: () => void;
  setResult: (result: TraceResult | null) => void;
  loadSharedResult: (result: TraceResult) => void;
  selectHistory: (index: number) => void;
  clearHistory: () => void;
}

// 從 sessionStorage 還原歷史
function loadHistory(): TraceResult[] {
  try {
    const raw = sessionStorage.getItem('traceroute_history');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveHistory(history: TraceResult[]) {
  try {
    sessionStorage.setItem('traceroute_history', JSON.stringify(history));
  } catch { /* ignore */ }
}

function pushHistory(history: TraceResult[], result: TraceResult): TraceResult[] {
  const next = [result, ...history].slice(0, MAX_HISTORY);
  saveHistory(next);
  return next;
}

export const useTracerouteStore = create<TracerouteState>((set, get) => ({
  activeResult: null,
  history: loadHistory(),
  isLoading: false,
  isOpen: false,
  hasResult: false,
  error: null,

  runTraceroute: async (ip: string, token?: string) => {
    set({ isLoading: true, isOpen: true, error: null, activeResult: null, hasResult: false });

    const useMock = import.meta.env.VITE_USE_MOCK === 'true';

    if (useMock) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const result = createMockTraceResult(ip);
      set(state => ({
        activeResult: result,
        isLoading: false,
        hasResult: true,
        history: pushHistory(state.history, result),
      }));
      return;
    }

    try {
      const effectiveToken = token || useDnsStore.getState().token;
      if (!effectiveToken) {
        throw new Error('No authentication token available');
      }
      const response = await fetch(`/api/traceroute?target=${encodeURIComponent(ip)}`, {
        headers: { 'Authorization': `Bearer ${effectiveToken}` },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch traceroute: ${response.statusText}`);
      }
      const data: TraceResult = await response.json();
      set(state => ({
        activeResult: data,
        isLoading: false,
        hasResult: true,
        history: pushHistory(state.history, data),
      }));
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  closeDrawer: () => set({ isOpen: false }),
  setResult: (result) => set({ activeResult: result }),
  loadSharedResult: (result: TraceResult) => set({
    activeResult: result,
    isLoading: false,
    isOpen: true,
    hasResult: true,
    error: null,
  }),

  selectHistory: (index: number) => {
    const { history } = get();
    if (index >= 0 && index < history.length) {
      set({
        activeResult: history[index],
        isOpen: true,
        hasResult: true,
        error: null,
      });
    }
  },

  clearHistory: () => {
    sessionStorage.removeItem('traceroute_history');
    set({ history: [] });
  },
}));
