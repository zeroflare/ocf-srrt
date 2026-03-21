import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTracerouteStore, createMockTraceResult } from './useTracerouteStore';
import { TraceResult } from '../types';

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock });

function makeResult(target: string): TraceResult {
  return {
    target,
    status: 'completed',
    time: new Date().toISOString(),
    hops: [
      { index: 0, ip: '1.1.1.1', host: 'local', latency: 0, rtts: [], loss: 0, best: 0, worst: 0, stdev: 0, country: 'TW', coords: [121.5, 25.0] },
    ],
  };
}

describe('useTracerouteStore', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    // 重設 store 狀態
    useTracerouteStore.setState({
      activeResult: null,
      history: [],
      isLoading: false,
      isOpen: false,
      hasResult: false,
      error: null,
    });
  });

  describe('createMockTraceResult', () => {
    it('creates a result with given target', () => {
      const result = createMockTraceResult('test.com');
      expect(result.target).toBe('test.com');
      expect(result.status).toBe('completed');
      expect(result.hops.length).toBeGreaterThan(0);
    });
  });

  describe('loadSharedResult', () => {
    it('sets activeResult and opens drawer', () => {
      const result = makeResult('shared.com');
      useTracerouteStore.getState().loadSharedResult(result);

      const state = useTracerouteStore.getState();
      expect(state.activeResult).toBe(result);
      expect(state.isOpen).toBe(true);
      expect(state.hasResult).toBe(true);
      expect(state.error).toBeNull();
    });
  });

  describe('history', () => {
    it('selectHistory sets activeResult', () => {
      const r1 = makeResult('a.com');
      const r2 = makeResult('b.com');
      useTracerouteStore.setState({ history: [r1, r2] });

      useTracerouteStore.getState().selectHistory(1);
      expect(useTracerouteStore.getState().activeResult).toBe(r2);
      expect(useTracerouteStore.getState().isOpen).toBe(true);
    });

    it('selectHistory ignores out-of-range index', () => {
      useTracerouteStore.setState({ history: [makeResult('a.com')], activeResult: null });

      useTracerouteStore.getState().selectHistory(5);
      expect(useTracerouteStore.getState().activeResult).toBeNull();
    });

    it('clearHistory removes all history', () => {
      useTracerouteStore.setState({ history: [makeResult('a.com'), makeResult('b.com')] });

      useTracerouteStore.getState().clearHistory();
      expect(useTracerouteStore.getState().history).toHaveLength(0);
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('traceroute_history');
    });
  });

  describe('closeDrawer', () => {
    it('sets isOpen to false', () => {
      useTracerouteStore.setState({ isOpen: true });
      useTracerouteStore.getState().closeDrawer();
      expect(useTracerouteStore.getState().isOpen).toBe(false);
    });
  });

  describe('setResult', () => {
    it('updates activeResult', () => {
      const result = makeResult('set.com');
      useTracerouteStore.getState().setResult(result);
      expect(useTracerouteStore.getState().activeResult).toBe(result);
    });

    it('sets null', () => {
      useTracerouteStore.getState().setResult(null);
      expect(useTracerouteStore.getState().activeResult).toBeNull();
    });
  });
});
