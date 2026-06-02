/**
 * 地圖原點（origin）與相機視野（map view）共用工具。
 *
 * 動機：DNS 主機可能部署於不同國家（TW、JP…）。原本 CyberMap / TraceMap
 * 把原點寫死成 TW，導致非 TW 節點地圖中心與 spokes 起點錯誤。本工具集中：
 *   - origin code：本地監控國家代碼（來自後端 localCountry，fallback TW）
 *   - origin 座標：spokes 線端 / 原點旗幟 marker 的座標（取國家 hub 中心，與其他國家 marker 對齊）
 *   - map view：地圖相機中心與 zoom（優先用後端 host-location.json 提供的值）
 *
 * 與 CyberMap / TraceMap 共用同一份 countries-hubs.json，確保線端與 icon 永遠對齊。
 */
import countryHubsData from '../data/countries-hubs.json';

export interface CountryHub {
  code: string;
  nameZh: string;
  nameEn?: string;
  flag: string;
  coordinates: [number, number];
}

const HUB_BY_CODE: Map<string, CountryHub> = new Map(
  (countryHubsData.countries as CountryHub[]).map((c) => [c.code, c]),
);

/** 預設原點國碼（後端未提供 localCountry 時的 fallback）。 */
export const DEFAULT_ORIGIN_CODE = 'TW';
/** 預設地圖 zoom（後端未提供 mapZoom 時的 fallback，沿用原本台灣視野）。 */
export const DEFAULT_MAP_ZOOM = 6.2;
/** 地圖最小 zoom（縮到最小 = 全世界視野，與 wireframe 一致）。 */
export const MIN_MAP_ZOOM = 0.8158546915390924;

/** 取 hub 設定；查無回 undefined。 */
export function getHub(code: string): CountryHub | undefined {
  return HUB_BY_CODE.get(code);
}

/** 原點國碼：本地監控國家（大寫），fallback 預設 TW。 */
export function getOriginCode(localCountry?: string | null): string {
  return (localCountry || DEFAULT_ORIGIN_CODE).toUpperCase();
}

/**
 * 原點座標：spokes 線端 / 原點 marker 使用。
 * 取該國家 hub 中心；查無時退回 TW hub，確保線端與 marker 永遠對齊。
 */
export function getOriginCoords(code: string): [number, number] {
  const hub = getHub(code) ?? getHub(DEFAULT_ORIGIN_CODE);
  return hub ? hub.coordinates : [121.5654, 25.033];
}

/**
 * 地圖相機中心與 zoom。
 * 中心優先用後端提供的 hostCoordinates（host-location.json），否則退回原點 hub 座標；
 * zoom 優先用後端 mapZoom，否則退回 DEFAULT_MAP_ZOOM。
 */
export function getMapView(
  code: string,
  hostCoordinates?: [number, number] | null,
  mapZoom?: number | null,
): { center: [number, number]; zoom: number } {
  return {
    center: hostCoordinates ?? getOriginCoords(code),
    zoom: mapZoom && mapZoom > 0 ? mapZoom : DEFAULT_MAP_ZOOM,
  };
}
