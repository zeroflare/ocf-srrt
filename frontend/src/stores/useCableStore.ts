import { create } from 'zustand';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { DnsRecord, TraceResult } from '../types';

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
};

const APP_TO_CABLE: Record<string, string> = {
  'Google': 'apricot',
  'YouTube': 'apricot',
  'Facebook': 'apcn2',
  'Instagram': 'apcn2',
  'Netflix': 'tpe',
  'Cloudflare': 'faister',
};

interface CableState {
  cables: CableData[];
  geoJSON: FeatureCollection<LineString, CableFeatureProps> | null;
  selectedCableId: string | null;
  activeAppId: string | null;

  // Actions
  initialize: () => void;
  setSelectedCableId: (id: string | null) => void;
  toggleCableSelection: (id: string) => void;
  setActiveApp: (appName: string | null) => void;
  selectCableByRecord: (record: DnsRecord | null) => void;
  selectCableByTraceResult: (traceResult: TraceResult | null) => void;
}

/**
 * 建立海纜的 GeoJSON 資料
 */
export function buildCablesGeoJSON(cables: CableData[]): FeatureCollection<LineString, CableFeatureProps> {
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
  // 注意：這裡的路徑因為移動到了 stores/，所以 import.meta.glob 的路徑要從 ../data/cables/ 開始
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

export const useCableStore = create<CableState>((set) => ({
  cables: [],
  geoJSON: null,
  selectedCableId: null,
  activeAppId: null,

  initialize: () => {
    const cables = loadAllCables();
    const geoJSON = buildCablesGeoJSON(cables);
    set({ cables, geoJSON });
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

    const { latency, appName } = record;
    let cableId = APP_TO_CABLE[appName];

    if (!cableId && record.isForeign) {
      if (latency < 50) {
        cableId = 'apricot';
      } else if (latency < 150) {
        cableId = 'apcn2';
      } else {
        cableId = 'tpe';
      }
    }

    set({ activeAppId: appName, selectedCableId: cableId || null });
  },

  selectCableByTraceResult: (traceResult: TraceResult | null) => {
    if (!traceResult) {
      set({ selectedCableId: null });
      return;
    }
    // TODO: 根據 hop 座標序列分析可能經過的海纜
    // Placeholder：取第一個非 TW 跳點的國家作為線索
    const firstForeignHop = traceResult.hops.find(
      h => h.ip !== '*' && h.country && h.country !== 'TW'
    );
    if (firstForeignHop) {
      // 預留接口：後續實作 coords → cable 空間查詢
      set({ selectedCableId: null });
    }
  },
}));
