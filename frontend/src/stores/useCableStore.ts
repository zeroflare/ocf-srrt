import { create } from 'zustand';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { DnsRecord, TraceResult } from '../types';
import { useDnsStore } from './useDnsStore';
import { inferCableForRecord, inferCablesForRecords, getBrokenCableIds, getCableStatusMap, parseCableIdFromEvent, CableEvent } from '../utils/cableInference';

export type CableSegment = {
  id: string;
  hidden?: boolean;
  coordinates: [number, number][];
  color?: string;
};

export type CableData = {
  id: string;
  name: string;
  color?: string;
  available_path?: Array<Array<string>>;
  equipments?: unknown[];
  segments?: CableSegment[] | string;
};

export type CableFeatureProps = {
  cableId: string;
  cableName: string;
  segmentId: string;
  color: string;
  hidden: boolean;
  isAvailablePath: boolean;
  /** 海纜斷線狀態：'broken' = 斷線, 'partial' = 部分斷線, 'normal' = 正常 */
  brokenStatus: 'broken' | 'partial' | 'normal';
};

/** 帶有解析後 cableId 的海纜事件（供 UI 使用） */
export interface CableEventWithId extends CableEvent {
  /** 從 title 解析出的海纜 ID */
  parsedCableId: string | undefined;
  /** 事件描述 */
  description: string;
  /** 事件原因 */
  cause: string;
  /** 預估修復時間 */
  estimatedRepairTime: string | null;
  /** 已解決時間（歷史事件才有） */
  resolvedTime: string | null;
}

/** 某條海纜上的 app 流量摘要 */
export interface CableAppFlow {
  cableId: string;
  cableName: string;
  confidence: 'high' | 'medium' | 'low';
  apps: Array<{ name: string; count: number }>;
  totalRecords: number;
}

const APP_TO_CABLE: Record<string, string> = {
  'Google': 'apricot',
  'YouTube': 'apricot',
  'Facebook': 'apcn2',
  'Instagram': 'apcn2',
  'Netflix': 'tpe',
  'Cloudflare': 'faster',
};

/** 海纜連線統計快照 */
export interface CableStats {
  normal: number;
  affected: number;
  total: number;
  timestamp: string;
}

interface CableState {
  cables: CableData[];
  geoJSON: FeatureCollection<LineString, CableFeatureProps> | null;
  selectedCableId: string | null;
  activeAppId: string | null;

  /** 被勾選 DNS 紀錄推測出的海纜 ID 集合 */
  highlightedCableIds: Set<string>;
  /** 每條高亮海纜的 app 流量摘要 */
  cableAppFlows: CableAppFlow[];
  /** 目前斷線/受損的海纜 ID */
  brokenCableIds: Set<string>;

  /** 發生中事件 */
  activeEvents: CableEventWithId[];
  /** 歷史事件 */
  historyEvents: CableEventWithId[];
  /** 連線統計快照 */
  cableStats: CableStats | null;
  /** 由事件面板選取的海纜 ID（與 DNS 選取獨立） */
  selectedEventCableId: string | null;

  // Actions
  initialize: () => void;
  setSelectedCableId: (id: string | null) => void;
  toggleCableSelection: (id: string) => void;
  setActiveApp: (appName: string | null) => void;
  selectCableByRecord: (record: DnsRecord | null) => void;
  selectCableByTraceResult: (traceResult: TraceResult | null) => void;
  /** 根據已勾選的 DNS 紀錄，批量推測並高亮海纜 */
  updateHighlightedCables: (selectedRecords: DnsRecord[]) => void;
  /** 事件面板：切換選取的海纜（點擊切換，再點取消） */
  toggleEventCable: (cableId: string | null) => void;
}

/**
 * 建立海纜的 GeoJSON 資料
 * @param cableStatusMap 海纜斷線狀態對照表（可選），用於標記斷線/部分斷線
 */
export function buildCablesGeoJSON(
  cables: CableData[],
  cableStatusMap?: Map<string, 'broken' | 'partial'>,
): FeatureCollection<LineString, CableFeatureProps> {
  const features: Array<Feature<LineString, CableFeatureProps>> = [];

  for (const cable of cables) {
    const cableColor = cable.color ?? '#3b82f6';
    const availablePaths = cable.available_path ?? [];
    const availableSegmentIds = new Set<string>();

    for (const path of availablePaths) {
      for (const item of path) {
        if (item.length > 3) {
          availableSegmentIds.add(item);
        }
      }
    }

    if (typeof cable.segments === 'string') {
      continue;
    }

    const brokenStatus = cableStatusMap?.get(cable.id) ?? 'normal';

    const segments = cable.segments ?? [];
    for (const seg of segments) {
      const coords = seg.coordinates ?? [];
      if (!Array.isArray(coords) || coords.length < 2) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
        properties: {
          cableId: cable.id,
          cableName: cable.name,
          segmentId: seg.id,
          color: seg.color ?? cableColor,
          hidden: Boolean(seg.hidden),
          isAvailablePath: availableSegmentIds.has(seg.id),
          brokenStatus,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * 從內部 JSON 檔案載入所有海纜資料
 */
function loadAllCables(): CableData[] {
  const modules = import.meta.glob('../data/cables/*.json', { eager: true }) as Record<string, { default: unknown }>;

  return Object.entries(modules)
    .filter(([path]) => !path.toLowerCase().includes('client_secret'))
    .map(([, mod]) => mod.default)
    .filter((v): v is CableData => typeof v === 'object' && v !== null)
    .map((cable) => {
      const anyCable = cable as Partial<CableData>;
      return {
        id: String(anyCable.id ?? ''),
        name: String(anyCable.name ?? anyCable.id ?? 'Unknown Cable'),
        color: typeof anyCable.color === 'string' ? anyCable.color : undefined,
        available_path: Array.isArray(anyCable.available_path) ? anyCable.available_path : [],
        equipments: Array.isArray(anyCable.equipments) ? anyCable.equipments : [],
        segments: (anyCable.segments as CableData['segments']) ?? [],
      };
    })
    .filter((c) => c.id.length > 0);
}

export const useCableStore = create<CableState>((set, get) => ({
  cables: [],
  geoJSON: null,
  selectedCableId: null,
  activeAppId: null,
  highlightedCableIds: new Set<string>(),
  cableAppFlows: [],
  brokenCableIds: new Set<string>(),
  activeEvents: [],
  historyEvents: [],
  cableStats: null,
  selectedEventCableId: null,

  initialize: () => {
    const cables = loadAllCables();

    // 先載入事件資料，提取斷線狀態（需要在建立 GeoJSON 前完成，以便標記斷線顏色）
    let brokenCableIds = new Set<string>();
    let cableStatusMap = new Map<string, 'broken' | 'partial'>();
    let activeEvents: CableEventWithId[] = [];
    let historyEvents: CableEventWithId[] = [];
    let cableStats: CableStats | null = null;

    const enrichEvents = (events: CableEvent[]): CableEventWithId[] =>
      events.map(ev => ({
        ...ev,
        parsedCableId: parseCableIdFromEvent(ev.title),
        description: (ev as any).description ?? '',
        cause: (ev as any).cause ?? '未知',
        estimatedRepairTime: (ev as any).estimatedRepairTime ?? null,
        resolvedTime: (ev as any).resolvedTime ?? null,
      }));

    try {
      const activeModules = import.meta.glob('../data/events/active.json', { eager: true }) as Record<string, { default: { events?: CableEvent[]; stats?: CableStats } }>;
      for (const mod of Object.values(activeModules)) {
        const events = mod.default?.events ?? [];
        brokenCableIds = getBrokenCableIds(events);
        cableStatusMap = getCableStatusMap(events);
        activeEvents = enrichEvents(events);
        if (mod.default?.stats) {
          cableStats = mod.default.stats;
        }
      }
    } catch {
      // 事件資料不存在時靜默忽略
    }

    try {
      const historyModules = import.meta.glob('../data/events/history.json', { eager: true }) as Record<string, { default: { events?: CableEvent[] } }>;
      for (const mod of Object.values(historyModules)) {
        historyEvents = enrichEvents(mod.default?.events ?? []);
      }
    } catch {
      // 歷史事件不存在時靜默忽略
    }

    // 嘗試載入獨立的 stats.json
    if (!cableStats) {
      try {
        const statsModules = import.meta.glob('../data/events/stats.json', { eager: true }) as Record<string, { default: CableStats }>;
        for (const mod of Object.values(statsModules)) {
          cableStats = mod.default;
        }
      } catch {
        // 統計資料不存在時靜默忽略
      }
    }

    // 建立 GeoJSON（帶斷線狀態標記）
    const geoJSON = buildCablesGeoJSON(cables, cableStatusMap);

    set({ cables, geoJSON, brokenCableIds, activeEvents, historyEvents, cableStats });
  },

  setSelectedCableId: (id: string | null) => set({ selectedCableId: id }),
  toggleCableSelection: (id: string) =>
    set((state) => ({
      selectedCableId: state.selectedCableId === id ? null : id,
    })),
  setActiveApp: (appName: string | null) => {
    if (!appName) {
      set({ activeAppId: null, selectedCableId: null });
      return;
    }

    const cableId = APP_TO_CABLE[appName];
    if (cableId) {
      set({ activeAppId: appName, selectedCableId: cableId });
    } else {
      set({ activeAppId: appName });
    }
  },

  selectCableByRecord: (record: DnsRecord | null) => {
    if (!record) {
      set({ selectedCableId: null, activeAppId: null });
      return;
    }

    const { cables, brokenCableIds } = get();
    const { appName } = record;
    const localCountry = useDnsStore.getState().localCountry || 'TW';

    // 優先用 APP_TO_CABLE 靜態映射（但如果該海纜斷了，走推測）
    let cableId = APP_TO_CABLE[appName];
    if (cableId && brokenCableIds.has(cableId)) cableId = '';

    // 沒有靜態映射 → 使用推測演算法
    if (!cableId) {
      const inference = inferCableForRecord(record, cables, brokenCableIds, localCountry);
      cableId = inference?.cableId ?? '';
    }

    set({ activeAppId: appName, selectedCableId: cableId || null });
  },

  selectCableByTraceResult: (traceResult: TraceResult | null) => {
    if (!traceResult) {
      set({ selectedCableId: null });
      return;
    }

    const { cables, brokenCableIds } = get();
    const localCountry = useDnsStore.getState().localCountry || 'TW';

    // 找第一個境外 hop，用其座標與國家推測海纜
    const foreignHop = traceResult.hops.find(
      h => h.ip !== '*' && h.country && h.country !== localCountry && h.coords,
    );

    if (foreignHop && foreignHop.coords) {
      // 建立一個虛擬 DnsRecord 來複用推測演算法
      const pseudoRecord: DnsRecord = {
        _id: '',
        timestamp: '',
        domain: traceResult.target,
        type: '',
        resultIp: foreignHop.ip,
        isForeign: true,
        latency: foreignHop.latency ?? 0,
        sourceIp: '',
        country: foreignHop.country || '',
        asn: 0,
        isp: '',
        appName: '',
        appCategory: '',
        longitude: foreignHop.coords[0],
        latitude: foreignHop.coords[1],
      };

      const inference = inferCableForRecord(pseudoRecord, cables, brokenCableIds, localCountry);
      set({ selectedCableId: inference?.cableId ?? null });
    } else {
      set({ selectedCableId: null });
    }
  },

  updateHighlightedCables: (selectedRecords: DnsRecord[]) => {
    if (selectedRecords.length === 0) {
      set({ highlightedCableIds: new Set(), cableAppFlows: [] });
      return;
    }

    const { cables, brokenCableIds } = get();
    const localCountry = useDnsStore.getState().localCountry || 'TW';
    const flowMap = inferCablesForRecords(selectedRecords, cables, brokenCableIds, localCountry);

    // APP_TO_CABLE fallback：本地 CDN 紀錄（如 Google→TW）的推測會被
    // shouldInferCable 略過，但這些 app 的流量實際上仍經由海纜到達台灣。
    // 參照 selectCableByRecord / traceroute 的做法，用靜態映射補回。
    const assignedRecordIds = new Set<string>();
    for (const [, { records }] of flowMap) {
      for (const r of records) assignedRecordIds.add(r._id);
    }
    for (const record of selectedRecords) {
      if (assignedRecordIds.has(record._id)) continue;
      let cableId = APP_TO_CABLE[record.appName];
      if (!cableId || brokenCableIds.has(cableId)) continue;
      const cable = cables.find(c => c.id === cableId);
      if (!cable) continue;
      const existing = flowMap.get(cableId);
      if (existing) {
        existing.records.push(record);
      } else {
        flowMap.set(cableId, {
          cable: {
            cableId,
            cableName: cable.name,
            confidence: 'medium' as const,
            reason: `app:${record.appName}`,
          },
          records: [record],
        });
      }
    }

    const highlightedCableIds = new Set(flowMap.keys());
    const cableAppFlows: CableAppFlow[] = [];

    for (const [cableId, { cable, records }] of flowMap) {
      // 統計 app 名稱
      const appCounts = new Map<string, number>();
      for (const r of records) {
        const name = r.appName || r.domain;
        appCounts.set(name, (appCounts.get(name) ?? 0) + 1);
      }

      const apps = Array.from(appCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      cableAppFlows.push({
        cableId,
        cableName: cable.cableName,
        confidence: cable.confidence,
        apps,
        totalRecords: records.length,
      });
    }

    // 按紀錄數排序
    cableAppFlows.sort((a, b) => b.totalRecords - a.totalRecords);

    set({ highlightedCableIds, cableAppFlows });
  },

  toggleEventCable: (cableId: string | null) => {
    set((state) => ({
      selectedEventCableId: state.selectedEventCableId === cableId ? null : cableId,
    }));
  },
}));
