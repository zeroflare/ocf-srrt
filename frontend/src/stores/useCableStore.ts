import { create } from 'zustand';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { DnsRecord } from '../types';

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

    // 簡單的映射邏輯：根據 App 映射到可能的海纜
    const appToCable: Record<string, string> = {
      'Google': 'apricot',
      'YouTube': 'apricot',
      'Facebook': 'apcn2',
      'Instagram': 'apcn2',
      'Netflix': 'tpe',
      'Cloudflare': 'faister',
    };

    const cableId = appToCable[appName];
    if (cableId) {
      set({ activeAppId: appName, selectedCableId: cableId });
    } else {
      set({ activeAppId: appName });
    }
  },

  /**
   * 根據 DNS 紀錄（例如延遲）來決定顯示哪條海纜
   * 這裡實作一個簡單的 placeholder 計算
   */
  selectCableByRecord: (record: DnsRecord | null) => {
    if (!record) {
      set({ selectedCableId: null, activeAppId: null });
      return;
    }

    const { latency, appName } = record;
    
    // 優先使用 App 映射
    const appToCable: Record<string, string> = {
      'Google': 'apricot',
      'YouTube': 'apricot',
      'Facebook': 'apcn2',
      'Instagram': 'apcn2',
      'Netflix': 'tpe',
      'Cloudflare': 'faister',
    };

    let cableId = appToCable[appName];

    // 如果沒有特定 App 映射，則根據延遲模擬
    if (!cableId && record.isForeign) {
      // 模擬邏輯：延遲低的走一條，延遲高的走另一條
      // 這裡僅供展示，實際會需要查詢 GeoIP 或 Traceroute 資料
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
}));
