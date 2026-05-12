/**
 * 海纜推測演算法
 *
 * 根據 DNS 紀錄的目標座標與國家，推測流量最可能經過的海底電纜。
 * 支援多海纜路由：流量可能依地理路徑經過多條海纜（如 TW→JP→US 需要區域纜 + 跨太平洋纜）
 *
 * 起點統一使用監控 IP 所在地（localCountry），若起迄點皆不在台灣內則不推測。
 *
 * 策略（依優先順序）：
 *   1. available_path 國家匹配 — 海纜的 available_path 包含目標國家
 *   2. 座標最近距離 — 目標點與海纜段 (segment) 的最短距離
 *   3. 延遲啟發 — 當無座標時的 fallback
 *   4. 多海纜串聯 — 目標國家不可直達時，推測中繼路由
 * 額外考量：
 *   - 排除斷線 (斷線/部分斷線) 的海纜，優先選擇正常運作的
 *   - 使用 available_path 的 segment 順序建構有方向性的路徑座標
 */
import { DnsRecord } from '../types';
import { calculateDistance } from './geo';

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

/** 海纜事件狀態 */
export interface CableEvent {
  title: string;
  status: string;   // '斷線' | '部分斷線' | '預定維護' | '未知'
  date: string;
  cableId?: string;  // 解析後的海纜 ID
}

/** 推測結果 */
export interface CableInferenceResult {
  cableId: string;
  cableName: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string; // 用於 debug / UI 提示
}

/**
 * 有方向性的海纜路徑（從起點到終點的有序座標）
 */
export interface DirectedCablePath {
  cableId: string;
  cableName: string;
  /** 從 TW 端出發，按 available_path segment 順序串接的座標 */
  coordinates: [number, number][];
  /** 路徑起點國家 (通常是 TW) */
  fromCountry: string;
  /** 路徑終點國家 */
  toCountry: string;
}

/** 海纜名稱 → cable ID 的模糊匹配表（事件標題用） */
const CABLE_NAME_ALIASES: Record<string, string> = {
  'apcn2': 'apcn2', 'apcn-2': 'apcn2', '亞太海纜網路二號': 'apcn2',
  'apg': 'apg',
  'apricot': 'apricot',
  'c2c': 'c2c',
  'eac1': 'eac1', 'eac-1': 'eac1',
  'eac2': 'eac2', 'eac-2': 'eac2',
  'faster': 'faster',
  'ncp': 'ncp',
  'plcn': 'plcn',
  'sjc2': 'sjc2', 'sjc-2': 'sjc2',
  'tpe': 'tpe',
  'tse1': 'tse1', 'tse-1': 'tse1',
  '台馬二號': 'twtm2', '台馬2號': 'twtm2', 'twtm2': 'twtm2',
  '台馬三號': 'twtm3', '台馬3號': 'twtm3', 'twtm3': 'twtm3',
  'frnal-nacs': 'frnal-nacs', 'nacs': 'frnal-nacs',
  'topaz': 'topaz',
  'candle': 'candle',
  'orca': 'orca',
};

/**
 * 從事件標題中解析海纜 ID
 */
export function parseCableIdFromEvent(title: string): string | undefined {
  const lower = title.toLowerCase();
  for (const [alias, id] of Object.entries(CABLE_NAME_ALIASES)) {
    if (lower.includes(alias.toLowerCase())) return id;
  }
  return undefined;
}

/**
 * 從事件列表中提取斷線/受損的海纜 ID 集合
 */
export function getBrokenCableIds(events: CableEvent[]): Set<string> {
  const broken = new Set<string>();
  for (const ev of events) {
    if (ev.status === '斷線' || ev.status === '部分斷線') {
      const id = ev.cableId ?? parseCableIdFromEvent(ev.title);
      if (id) broken.add(id);
    }
  }
  return broken;
}

/**
 * 從事件列表中建立海纜狀態對照表（區分斷線 vs 部分斷線）
 * 同一條海纜若同時有斷線和部分斷線事件，以最嚴重的為準
 */
export function getCableStatusMap(events: CableEvent[]): Map<string, 'broken' | 'partial'> {
  const statusMap = new Map<string, 'broken' | 'partial'>();
  for (const ev of events) {
    if (ev.status !== '斷線' && ev.status !== '部分斷線') continue;
    const id = ev.cableId ?? parseCableIdFromEvent(ev.title);
    if (!id) continue;
    const newStatus = ev.status === '斷線' ? 'broken' : 'partial';
    const existing = statusMap.get(id);
    // 斷線 > 部分斷線
    if (!existing || (newStatus === 'broken' && existing === 'partial')) {
      statusMap.set(id, newStatus);
    }
  }
  return statusMap;
}

/**
 * 從 available_path 提取該海纜連通的國家碼（包含 TW）
 */
function extractCountries(cable: CableData): Set<string> {
  const countries = new Set<string>();
  for (const path of cable.available_path ?? []) {
    for (const item of path) {
      if (/^[A-Z]{2,3}$/.test(item)) {
        countries.add(item);
      }
    }
  }
  return countries;
}

/**
 * 從 available_path 提取每條海纜可直達的國際終端國家
 * （排除 TW 本身和 TW-XX 子區域）
 */
function extractEndpointCountries(cable: CableData): Set<string> {
  const countries = new Set<string>();
  for (const path of cable.available_path ?? []) {
    for (const item of path) {
      if (/^[A-Z]{2,3}$/.test(item) && item !== 'TW' && !item.startsWith('TW-')) {
        countries.add(item);
      }
    }
  }
  return countries;
}

/**
 * 點到線段 (polyline) 的最短距離 (km)
 */
function pointToPolylineDistance(
  point: [number, number],
  coords: [number, number][],
): number {
  let minDist = Infinity;
  const step = coords.length > 200 ? Math.floor(coords.length / 100) : 1;
  for (let i = 0; i < coords.length - step; i += step) {
    const dist = calculateDistance(point, coords[i]);
    if (dist < minDist) minDist = dist;
  }
  const lastDist = calculateDistance(point, coords[coords.length - 1]);
  if (lastDist < minDist) minDist = lastDist;
  return minDist;
}

/**
 * 計算目標點到整條海纜所有 segment 的最短距離
 */
function pointToCableDistance(
  point: [number, number],
  cable: CableData,
): number {
  const segments = (typeof cable.segments === 'string' ? [] : cable.segments ?? []) as CableSegment[];
  let minDist = Infinity;
  for (const seg of segments) {
    if (seg.hidden || !seg.coordinates?.length) continue;
    const dist = pointToPolylineDistance(point, seg.coordinates);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/** 台灣國內海纜（僅島內互連），不參與國際流量推測 */
const DOMESTIC_CABLE_IDS = new Set([
  'twtm2', 'twtm3', 'twtk2', 'twtp2', 'twtp3', 'twpk1', 'twpk3', 'tpkm3',
]);

/** 台灣相關國家碼 (監控 IP 或目標必須屬於這些才進行推測) */
const TW_COUNTRY_CODES = new Set(['TW', 'TW-HX', 'TW-MG', 'TW-XY', 'TW-PH', 'TW-MK', 'TW-MT', 'TW-DY', 'TW-BG', 'TW-NG', 'TW-JG', 'TW-KM']);

function isTaiwanCountry(code: string): boolean {
  return code === 'TW' || code.startsWith('TW-') || TW_COUNTRY_CODES.has(code);
}

/**
 * 判斷是否需要海纜推測
 * 條件：起點（監控 IP）或終點（目標 IP）至少有一端在台灣
 */
export function shouldInferCable(
  record: DnsRecord,
  localCountry: string,
): boolean {
  const originInTW = isTaiwanCountry(localCountry.toUpperCase());
  const destInTW = isTaiwanCountry((record.country || '').toUpperCase());

  // 至少一端在台灣才推測
  if (!originInTW && !destInTW) return false;

  // 兩端都在台灣 → 國內流量，不走國際海纜
  if (originInTW && destInTW) return false;

  // 一端台灣、一端國外 → 需要推測
  return true;
}

// ─── 有方向性的路徑建構 ───

/**
 * 從 available_path 和 segments 建構有方向性的路徑座標
 * available_path 格式：["TW", "seg-id-1", "seg-id-2", "JP"]
 * 按此順序串聯 segment 座標，確保方向從起點國到終點國
 */
export function buildDirectedPath(
  cable: CableData,
  targetCountry: string,
): DirectedCablePath | null {
  const paths = cable.available_path ?? [];
  const segments = (typeof cable.segments === 'string' ? [] : cable.segments ?? []) as CableSegment[];

  // 建立 segment ID → segment 的快速查找
  const segMap = new Map<string, CableSegment>();
  for (const seg of segments) {
    segMap.set(seg.id, seg);
  }

  // 找到通往目標國家的 available_path
  let matchedPath: string[] | null = null;
  for (const path of paths) {
    const endCountry = path[path.length - 1];
    if (endCountry === targetCountry) {
      matchedPath = path;
      break;
    }
  }

  // 沒找到完全匹配 → 找包含目標國家的 path
  if (!matchedPath) {
    for (const path of paths) {
      if (path.includes(targetCountry)) {
        matchedPath = path;
        break;
      }
    }
  }

  if (!matchedPath) return null;

  // 提取路徑中的 segment ID（非國家碼的項目）
  const segIds = matchedPath.filter(item => !/^[A-Z]{2,3}(-[A-Z]{2,3})?$/.test(item));
  if (segIds.length === 0) return null;

  // 經度環繞感知距離（處理換日線 180°/-180° 附近的點）
  const lngAwareDist = (a: [number, number], b: [number, number]): number => {
    let dLng = Math.abs(a[0] - b[0]);
    if (dLng > 180) dLng = 360 - dLng; // 跨換日線：取短邊
    const dLat = a[1] - b[1];
    return Math.sqrt(dLng * dLng + dLat * dLat);
  };

  // 按順序串聯座標，處理方向性
  const allCoords: [number, number][] = [];
  const fromCountry = matchedPath[0];
  const toCountry = matchedPath[matchedPath.length - 1];

  for (let i = 0; i < segIds.length; i++) {
    const seg = segMap.get(segIds[i]);
    if (!seg || !seg.coordinates || seg.coordinates.length < 2) continue;

    let coords = [...seg.coordinates] as [number, number][];

    // 判斷是否需要反轉座標方向（使用環繞感知距離避免換日線誤判）
    if (allCoords.length > 0) {
      const prevEnd = allCoords[allCoords.length - 1];
      const segStart = coords[0];
      const segEnd = coords[coords.length - 1];
      if (lngAwareDist(prevEnd, segEnd) < lngAwareDist(prevEnd, segStart)) {
        coords = coords.reverse();
      }
    } else if (isTaiwanCountry(fromCountry)) {
      const twRef: [number, number] = [121.5, 25.0];
      if (lngAwareDist(twRef, coords[coords.length - 1]) < lngAwareDist(twRef, coords[0])) {
        coords = coords.reverse();
      }
    }

    // 串聯座標
    if (allCoords.length > 0) {
      // 處理國際換日線跨越：使前後段經度連續
      const prevEnd = allCoords[allCoords.length - 1];
      const newStart = coords[0];
      const rawDiff = newStart[0] - prevEnd[0];
      // 如果相鄰兩點經度差超過 180°，代表跨越換日線
      if (rawDiff > 180) {
        coords = coords.map(([lng, lat]) => [lng - 360, lat] as [number, number]);
      } else if (rawDiff < -180) {
        coords = coords.map(([lng, lat]) => [lng + 360, lat] as [number, number]);
      }
      allCoords.push(...coords.slice(1));
    } else {
      allCoords.push(...coords);
    }
  }

  if (allCoords.length < 2) return null;

  return {
    cableId: cable.id,
    cableName: cable.name,
    coordinates: allCoords,
    fromCountry,
    toCountry,
  };
}

/**
 * 為一條海纜建構所有可用方向路徑
 * 如果沒有 available_path，fallback 取最長的 segment
 */
export function buildAllDirectedPaths(cable: CableData): DirectedCablePath[] {
  const paths = cable.available_path ?? [];
  const results: DirectedCablePath[] = [];
  const seenToCountries = new Set<string>();

  for (const path of paths) {
    const toCountry = path[path.length - 1];
    if (seenToCountries.has(toCountry)) continue;
    seenToCountries.add(toCountry);

    const directed = buildDirectedPath(cable, toCountry);
    if (directed) results.push(directed);
  }

  // Fallback：無 available_path 時，取最長 segment 作為路徑
  if (results.length === 0) {
    const segments = (typeof cable.segments === 'string' ? [] : cable.segments ?? []) as CableSegment[];
    let longest: CableSegment | null = null;
    for (const seg of segments) {
      if (seg.hidden || !seg.coordinates || seg.coordinates.length < 2) continue;
      if (!longest || seg.coordinates.length > longest.coordinates.length) {
        longest = seg;
      }
    }
    if (longest) {
      let coords = [...longest.coordinates] as [number, number][];
      // 確保方向從 TW 出發
      const twRef: [number, number] = [121.5, 25.0];
      const distStart = Math.sqrt(
        (twRef[0] - coords[0][0]) ** 2 + (twRef[1] - coords[0][1]) ** 2,
      );
      const distEnd = Math.sqrt(
        (twRef[0] - coords[coords.length - 1][0]) ** 2 + (twRef[1] - coords[coords.length - 1][1]) ** 2,
      );
      if (distEnd < distStart) coords = coords.reverse();

      results.push({
        cableId: cable.id,
        cableName: cable.name,
        coordinates: coords,
        fromCountry: 'TW',
        toCountry: '??',
      });
    }
  }

  return results;
}

// ─── 主推測演算法 ───

/**
 * 主演算法：為一筆 DNS 紀錄推測最可能的海纜
 * @param localCountry 監控 IP 的所在國家（起點）
 * @param brokenCableIds 斷線/受損的海纜 ID 集合
 */
export function inferCableForRecord(
  record: DnsRecord,
  cables: CableData[],
  brokenCableIds?: Set<string>,
  localCountry?: string,
): CableInferenceResult | null {
  const origin = (localCountry || 'TW').toUpperCase();

  // 起迄點判斷：至少一端在台灣
  if (!shouldInferCable(record, origin)) return null;

  const targetCountry = record.country?.toUpperCase() || '';
  const hasCoords = record.longitude != null && record.latitude != null;
  const targetPoint: [number, number] | null = hasCoords
    ? [record.longitude!, record.latitude!]
    : null;

  const broken = brokenCableIds ?? new Set<string>();

  // 只考慮有 segment 資料的國際海纜
  const internationalCables = cables.filter(c => {
    if (DOMESTIC_CABLE_IDS.has(c.id)) return false;
    const segs = typeof c.segments === 'string' ? [] : c.segments ?? [];
    return segs.some(s => !s.hidden && s.coordinates?.length >= 2);
  });

  if (internationalCables.length === 0) return null;

  // === 策略 1: available_path 國家匹配 ===
  const countryMatched: Array<{ cable: CableData; dist: number }> = [];
  if (targetCountry) {
    for (const cable of internationalCables) {
      const countries = extractCountries(cable);
      if (countries.has(targetCountry)) {
        const dist = targetPoint ? pointToCableDistance(targetPoint, cable) : Infinity;
        countryMatched.push({ cable, dist });
      }
    }
  }

  if (countryMatched.length > 0) {
    countryMatched.sort((a, b) => {
      const aB = broken.has(a.cable.id) ? 1 : 0;
      const bB = broken.has(b.cable.id) ? 1 : 0;
      if (aB !== bB) return aB - bB;
      return a.dist - b.dist;
    });
    const best = countryMatched[0];
    return {
      cableId: best.cable.id,
      cableName: best.cable.name,
      confidence: broken.has(best.cable.id) ? 'low'
        : (targetPoint && best.dist < 2000 ? 'high' : 'medium'),
      reason: `country:${targetCountry}${broken.has(best.cable.id) ? ',degraded' : ''}`,
    };
  }

  // === 策略 2: 座標最近距離 ===
  if (targetPoint) {
    const scored = internationalCables
      .map(cable => ({
        cable,
        dist: pointToCableDistance(targetPoint, cable),
      }))
      .filter(x => x.dist < Infinity)
      .sort((a, b) => {
        const aB = broken.has(a.cable.id) ? 1 : 0;
        const bB = broken.has(b.cable.id) ? 1 : 0;
        if (aB !== bB) return aB - bB;
        return a.dist - b.dist;
      });

    if (scored.length > 0) {
      const best = scored[0];
      return {
        cableId: best.cable.id,
        cableName: best.cable.name,
        confidence: broken.has(best.cable.id) ? 'low'
          : (best.dist < 500 ? 'medium' : 'low'),
        reason: `proximity:${Math.round(best.dist)}km${broken.has(best.cable.id) ? ',degraded' : ''}`,
      };
    }
  }

  // === 策略 3: 延遲啟發 (fallback) ===
  const { latency } = record;
  if (latency > 0) {
    let fallbackId: string;
    if (latency < 50) {
      fallbackId = 'apricot';
    } else if (latency < 100) {
      fallbackId = 'apcn2';
    } else if (latency < 200) {
      fallbackId = 'sjc2';
    } else {
      fallbackId = 'plcn';
    }

    const matched = cables.find(c => c.id === fallbackId);
    if (matched) {
      return {
        cableId: matched.id,
        cableName: matched.name,
        confidence: 'low',
        reason: `latency:${Math.round(latency)}ms`,
      };
    }
  }

  return null;
}

// ─── 多海纜路由 ───

/**
 * 中繼路由表：目標國家 → 最可能的中繼國家
 */
const TRANSIT_ROUTES: Record<string, string[]> = {
  'US': ['JP'],
  'CA': ['JP'],
  'KR': ['JP'],
  'AU': ['SG', 'GU'],
  'NZ': ['SG', 'GU'],
  'IN': ['SG', 'HK'],
  'TH': ['SG', 'HK'],
  'VN': ['SG', 'HK'],
  'ID': ['SG'],
  'MY': ['SG'],
  'DE': ['JP', 'HK'],
  'GB': ['JP', 'HK'],
  'FR': ['JP', 'HK'],
  'NL': ['JP', 'HK'],
};

/**
 * 多海纜路由推測：根據 DNS 紀錄推測流量可能經過的所有海纜（按順序）
 * 當目標國家無法由單條海纜直達時，嘗試找出中繼路由。
 * 使用 segment 端點座標做地理接續判斷。
 */
export function inferMultiCableRoute(
  record: DnsRecord,
  cables: CableData[],
  brokenCableIds?: Set<string>,
  localCountry?: string,
): CableInferenceResult[] {
  const origin = (localCountry || 'TW').toUpperCase();
  if (!shouldInferCable(record, origin)) return [];

  const broken = brokenCableIds ?? new Set<string>();
  const targetCountry = record.country?.toUpperCase() || '';

  const direct = inferCableForRecord(record, cables, brokenCableIds, localCountry);
  if (!direct) return [];

  // 檢查直達海纜是否 available_path 包含目標國家
  const directCable = cables.find(c => c.id === direct.cableId);
  if (directCable) {
    const endpoints = extractEndpointCountries(directCable);
    if (endpoints.has(targetCountry)) return [direct];
  }

  // 多海纜中繼推測
  const transitCountries = TRANSIT_ROUTES[targetCountry];
  if (!transitCountries || transitCountries.length === 0) {
    return [direct];
  }

  const internationalCables = cables.filter(c => {
    if (DOMESTIC_CABLE_IDS.has(c.id)) return false;
    const segs = typeof c.segments === 'string' ? [] : c.segments ?? [];
    return segs.some(s => !s.hidden && s.coordinates?.length >= 2);
  });

  for (const transitCountry of transitCountries) {
    const transitCables = internationalCables.filter(c => {
      const endpoints = extractEndpointCountries(c);
      return endpoints.has(transitCountry) && !broken.has(c.id);
    });

    if (transitCables.length > 0) {
      const targetPoint: [number, number] | null =
        record.longitude != null && record.latitude != null
          ? [record.longitude!, record.latitude!]
          : null;

      // 選最佳中繼海纜 — 優先用有 directed path 到中繼國的，再按距離排序
      let bestTransit = transitCables[0];
      if (targetPoint) {
        const scored = transitCables
          .map(c => ({ cable: c, dist: pointToCableDistance(targetPoint, c) }))
          .sort((a, b) => a.dist - b.dist);
        bestTransit = scored[0]?.cable ?? transitCables[0];
      }

      const firstLeg: CableInferenceResult = {
        cableId: bestTransit.id,
        cableName: bestTransit.name,
        confidence: 'medium',
        reason: `transit:TW→${transitCountry}`,
      };

      // 第一段和直達推測不同 → 返回兩段
      if (direct.cableId !== bestTransit.id) {
        return [firstLeg, { ...direct, reason: `${direct.reason},leg2:${transitCountry}→${targetCountry}` }];
      }
      return [firstLeg];
    }
  }

  return [direct];
}

// ─── 批量推測 ───

/**
 * 批量推測：為多筆 DNS 紀錄推測海纜（支援多海纜路由）
 */
export function inferCablesForRecords(
  records: DnsRecord[],
  cables: CableData[],
  brokenCableIds?: Set<string>,
  localCountry?: string,
): Map<string, { cable: CableInferenceResult; records: DnsRecord[] }> {
  const result = new Map<string, { cable: CableInferenceResult; records: DnsRecord[] }>();

  for (const record of records) {
    const routes = inferMultiCableRoute(record, cables, brokenCableIds, localCountry);
    for (const inference of routes) {
      const existing = result.get(inference.cableId);
      if (existing) {
        existing.records.push(record);
        if (inference.confidence === 'high' && existing.cable.confidence !== 'high') {
          existing.cable.confidence = 'high';
        }
      } else {
        result.set(inference.cableId, { cable: inference, records: [record] });
      }
    }
  }

  return result;
}
