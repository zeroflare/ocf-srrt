import React, { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Feature } from 'geojson';
import { Hop } from '../types';
import { pickPathEndpoints } from '../utils/geo';
import { useDnsStore } from '../stores/useDnsStore';
import { countryFlag } from '../utils/countryFlag';
import countryHubsData from '../data/countries-hubs.json';

interface TraceMapProps {
  hops: Hop[];
}

// 與 CyberMap 共用同一份 countries-hubs.json，確保線端 / 旗幟 marker 永遠對齊
interface CountryHub {
  code: string;
  nameZh: string;
  nameEn?: string;
  flag: string;
  coordinates: [number, number];
}
const HUB_BY_CODE: Map<string, CountryHub> = new Map(
  (countryHubsData.countries as CountryHub[]).map((c) => [c.code, c]),
);

// 原點：本地國家（與 CyberMap、wireframe 一致使用 TW hub 座標 [121.5654, 25.033]）
const ORIGIN_CODE = 'TW';
const ORIGIN_HUB = HUB_BY_CODE.get(ORIGIN_CODE);
const TAIWAN_CENTER: [number, number] = ORIGIN_HUB
  ? (ORIGIN_HUB.coordinates as [number, number])
  : [121.5654, 25.033];
const DEFAULT_CENTER: [number, number] = [121.0, 23.7];
const DEFAULT_ZOOM = 6.2;
const MIN_ZOOM = 0.8158546915390924;

/**
 * 與 CyberMap 完全相同的 line-gradient 流動動畫 expression。
 * 以 highlight 區段沿線移動形成綠色流動效果。
 */
function buildFlowGradient(dark: boolean, center: number): unknown[] {
  const dim = dark ? '#065f46' : '#047857';
  const hi = dark ? '#a7f3d0' : '#6ee7b7';
  const hw = 0.11;
  const c = Math.min(0.998, Math.max(0.002, center));
  const p0 = 0;
  let p1 = Math.max(p0 + 1e-5, c - hw);
  const p2 = c;
  let p3 = Math.min(1 - 1e-5, c + hw);
  const p4 = 1;
  if (p1 >= p2) p1 = p2 - 2e-5;
  if (p3 <= p2) p3 = p2 + 2e-5;
  if (p1 <= p0) p1 = p0 + 1e-5;
  if (p3 >= p4) p3 = p4 - 1e-5;
  const pairs: Array<[number, string]> = [
    [p0, dim],
    [p1, dim],
    [p2, hi],
    [p3, dim],
    [p4, dim],
  ];
  const merged: Array<[number, string]> = [];
  for (const [p, col] of pairs) {
    if (merged.length && p <= merged[merged.length - 1][0]) {
      merged[merged.length - 1][1] = col;
    } else {
      merged.push([p, col]);
    }
  }
  const expr: unknown[] = ['interpolate', ['linear'], ['line-progress']];
  for (const [p, col] of merged) {
    expr.push(p, col);
  }
  return expr;
}

/**
 * 跨換日線 unwrap：東半球起點（lon > 50）連到西經 < -30 的目的地時，
 * 把終點 lon 加 360 讓直線走太平洋，而非繞歐亞 + 大西洋的長路。
 * 與 wireframe `_traceLineCoords` 同邏輯。
 */
function spokeLine(origin: [number, number], dest: [number, number]): [number, number][] {
  const [oLon, oLat] = origin;
  const [dLon, dLat] = dest;
  const endLon = oLon > 50 && dLon < -30 ? dLon + 360 : dLon;
  return [
    [oLon, oLat],
    [endLon, dLat],
  ];
}

/**
 * TraceMap — traceroute 地圖
 *
 * 與首頁 CyberMap 一致的視覺呈現：
 *   1. 雙層 emerald 線（dim 底層 + 流動 gradient 上層）
 *   2. 圓形國旗 emoji marker（原點台灣較大）
 *   3. 不顯示中間 hop 節點 / 序號 / popup
 *   4. 不做「逐跳展開」「光點沿路徑移動」等舊有動畫；只保留與首頁相同的 line-gradient 流動動畫
 *
 * Hop 細節（IP、ASN、城市、loss、stdev）仍由 HopTable 展示；地圖只負責「起點 → 終點」的地理概念。
 */
export const TraceMap: React.FC<TraceMapProps> = ({ hops }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const flowRafRef = useRef<number | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const { theme } = useDnsStore();
  const isDark = theme === 'dark';

  // 起點 + 終點（過濾掉沒有座標的 hop）
  const endpoints = useMemo(() => {
    const valid = hops.filter(
      (h) => h.ip !== '*' && h.coords && h.coords.length === 2 && !(h.coords[0] === 0 && h.coords[1] === 0),
    );
    return pickPathEndpoints(valid);
  }, [hops]);

  // 初始化地圖（只跑一次）
  useEffect(() => {
    if (!mapContainer.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          map: {
            type: 'vector',
            url: 'https://lb.exptech.dev/api/v1/map/tiles/tiles.json',
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': isDark ? '#020617' : '#f8fafc' },
          },
          {
            id: 'global',
            type: 'fill',
            source: 'map',
            'source-layer': 'global',
            paint: { 'fill-color': isDark ? '#0f172a' : '#e2e8f0' },
          },
          {
            id: 'county',
            type: 'fill',
            source: 'map',
            'source-layer': 'city',
            paint: { 'fill-color': isDark ? '#0f172a' : '#e2e8f0' },
          },
          {
            id: 'county-outline',
            type: 'line',
            source: 'map',
            'source-layer': 'city',
            paint: { 'line-color': isDark ? '#1e293b' : '#cbd5e1', 'line-width': 0.5 },
          },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: MIN_ZOOM,
      dragRotate: false,
      touchZoomRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });

    m.dragRotate.disable();
    m.touchZoomRotate.disable();
    map.current = m;

    m.on('load', () => {
      if (m.getSource('trace-path')) return;
      m.addSource('trace-path', {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'FeatureCollection', features: [] },
      });
      const dark = useDnsStore.getState().theme === 'dark';
      const dimStroke = dark ? 'rgba(52,211,153,0.22)' : 'rgba(15,118,110,0.28)';
      m.addLayer({
        id: 'trace-path-bg',
        type: 'line',
        source: 'trace-path',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': dimStroke,
          'line-width': 2.8,
          'line-opacity': 1,
        },
      });
      m.addLayer({
        id: 'trace-path',
        type: 'line',
        source: 'trace-path',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'line-gradient': buildFlowGradient(dark, 0.5) as any,
          'line-width': 1.35,
          'line-opacity': 0.92,
        },
      });
    });

    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主題變色（背景 / 陸地 / 邊界 / 線段底色）
  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    m.setPaintProperty('background', 'background-color', isDark ? '#020617' : '#f8fafc');
    m.setPaintProperty('global', 'fill-color', isDark ? '#0f172a' : '#e2e8f0');
    m.setPaintProperty('county', 'fill-color', isDark ? '#0f172a' : '#e2e8f0');
    m.setPaintProperty('county-outline', 'line-color', isDark ? '#1e293b' : '#cbd5e1');
    const dimStroke = isDark ? 'rgba(52,211,153,0.22)' : 'rgba(15,118,110,0.28)';
    if (m.getLayer('trace-path-bg')) {
      m.setPaintProperty('trace-path-bg', 'line-color', dimStroke);
    }
  }, [isDark]);

  // 寫入 endpoints 線段 + 國旗 marker
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const source = m.getSource('trace-path') as maplibregl.GeoJSONSource | undefined;
      if (!source) return;

      // 清掉舊 markers
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];

      if (endpoints.length === 0) {
        source.setData({ type: 'FeatureCollection', features: [] });
        return;
      }

      // 取最後一個 hop 當目的地：
      //  - 線段端點 / marker 位置一律以「國家 hub 中心點」為準（與 wireframe `_traceHubLineGeoJson` 一致）
      //  - 同國家或 hub 表查不到時，不畫線只放原點 marker，避免線端落在不確定位置
      //  - lastHop.coords（GeoIP 經緯度）不再用於繪圖，只保留在 HopTable 顯示細節
      const lastHop = endpoints[endpoints.length - 1];
      const destHub = lastHop.country ? HUB_BY_CODE.get(lastHop.country) : undefined;
      const destCoords: [number, number] | null =
        destHub && destHub.code !== ORIGIN_CODE ? (destHub.coordinates as [number, number]) : null;

      const features: Feature[] = [];
      if (destCoords) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: spokeLine(TAIWAN_CENTER, destCoords) },
          properties: { country: lastHop.country || '' },
        });
      }
      source.setData({ type: 'FeatureCollection', features });

      // marker：origin TW + 終點國家（座標都來自 hub 表，與線端永遠對齊）
      type MarkerInfo = { coords: [number, number]; country: string; isOrigin: boolean };
      const items: MarkerInfo[] = [{ coords: TAIWAN_CENTER, country: 'TW', isOrigin: true }];
      if (destCoords && destHub) {
        items.push({ coords: destCoords, country: destHub.code, isOrigin: false });
      }

      for (const it of items) {
        const w = it.isOrigin ? 36 : 30;
        const fs = it.isOrigin ? 22 : 18;
        const el = document.createElement('div');
        el.style.cssText = [
          `width:${w}px`,
          `height:${w}px`,
          'border-radius:9999px',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          `font-size:${fs}px`,
          'line-height:1',
          'box-sizing:border-box',
          'cursor:default',
          'user-select:none',
          'font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif',
          isDark
            ? 'background:#1e293b;border:1.5px solid #334155;box-shadow:0 0 0 1px rgba(15,23,42,0.35)'
            : 'background:#ffffff;border:1.5px solid #cbd5e1;box-shadow:0 1px 3px rgba(15,23,42,0.08)',
        ].join(';');
        el.textContent = countryFlag(it.country) || it.country || '';
        if (it.country) el.title = it.country;
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(it.coords).addTo(m);
        markersRef.current.push(marker);
      }

      // fitBounds：包住起點與終點，跨換日線時走太平洋；同國 / 查不到 hub 時拉回台灣中心
      if (destCoords) {
        const [oLon, oLat] = TAIWAN_CENTER;
        const [dLon, dLat] = destCoords;
        const endLon = oLon > 50 && dLon < -30 ? dLon + 360 : dLon;
        const lons = [oLon, endLon];
        const lats = [oLat, dLat];
        const bounds = new maplibregl.LngLatBounds(
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        );
        m.fitBounds(bounds, { padding: 80, maxZoom: 5, duration: 600 });
      } else {
        m.flyTo({ center: TAIWAN_CENTER, zoom: 6, duration: 600 });
      }
    };

    if (m.isStyleLoaded()) {
      apply();
    } else {
      m.once('load', apply);
    }
  }, [endpoints, isDark]);

  // 流動動畫（與 CyberMap 同款）
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const stop = () => {
      if (flowRafRef.current != null) {
        cancelAnimationFrame(flowRafRef.current);
        flowRafRef.current = null;
      }
    };
    const loop = () => {
      if (!map.current || !map.current.getLayer('trace-path')) {
        flowRafRef.current = null;
        return;
      }
      const c = (Date.now() / 2200) % 1;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.current.setPaintProperty('trace-path', 'line-gradient', buildFlowGradient(isDark, c) as any);
      } catch {
        flowRafRef.current = null;
        return;
      }
      flowRafRef.current = requestAnimationFrame(loop);
    };
    stop();
    flowRafRef.current = requestAnimationFrame(loop);
    return stop;
  }, [isDark]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full rounded-xl overflow-hidden" />
    </div>
  );
};
