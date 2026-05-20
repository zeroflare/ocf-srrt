import React, { useEffect, useRef, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Feature, Point } from 'geojson';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { useDnsStore } from '../stores/useDnsStore';
import { calculateDistance, createCurve, pickPathEndpoints, spreadOverlappingHops } from '../utils/geo';
import { countryFlag } from '../utils/countryFlag';
import { useTranslation } from 'react-i18next';
import { Radio, Search } from 'lucide-react';

// Spokes 原點：使用者的本地國家（預設台灣中心）
const TAIWAN_CENTER: [number, number] = [121.5, 24.5];
// 預設地圖視野：以台灣為中心，台灣 zoom 等級
const DEFAULT_CENTER: [number, number] = [121.0, 23.7];
const DEFAULT_ZOOM = 6.2;
// 縮到最小 = 全世界視野（同 wireframe）
const MIN_ZOOM = 0.8158546915390924;

/**
 * 與 wireframe 相同：line-gradient + line-progress 表達式，
 * 以 highlight 區段沿線移動形成「流動」動畫。
 *
 * 回傳 maplibre `line-gradient` 可接受的 expression（unknown[]）。
 * MapLibre 對 setPaintProperty 的 value 型別為 any，故不需特別 cast。
 */
function buildSpokesFlowGradient(dark: boolean, center: number): unknown[] {
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

export const CyberMap: React.FC = () => {
  const { t } = useTranslation();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popup = useRef<maplibregl.Popup | null>(null);
  const flowRafRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { activeResult } = useTracerouteStore();
  const { records, monitoringIp, theme } = useDnsStore();

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          map: {
            type: "vector",
            url: "https://lb.exptech.dev/api/v1/map/tiles/tiles.json",
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": theme === 'dark' ? "#020617" : "#f8fafc" },
          },
          {
            id: "county",
            type: "fill",
            source: "map",
            "source-layer": "city",
            paint: { "fill-color": theme === 'dark' ? "#0f172a" : "#e2e8f0" },
          },
          {
            id: "county-outline",
            type: "line",
            source: "map",
            "source-layer": "city",
            paint: { "line-color": theme === 'dark' ? "#1e293b" : "#cbd5e1", "line-width": 1 },
          },
          {
            id: "town",
            type: "fill",
            source: "map",
            "source-layer": "town",
            paint: { "fill-color": "transparent" },
          },
          {
            id: "global",
            type: "fill",
            source: "map",
            "source-layer": "global",
            paint: {
              "fill-color": theme === 'dark' ? "#0f172a" : "#e2e8f0",
              "fill-opacity": 1,
            },
          },
        ],
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: MIN_ZOOM,
      dragRotate: false,
      touchZoomRotate: false,
      pitchWithRotate: false,
      maxPitch: 0
    });
    map.current.dragRotate.disable();
    map.current.touchZoomRotate.disable();

    popup.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'custom-popup',
    });

    const thisMap = map.current;
    thisMap.on('load', () => {
      if (map.current !== thisMap) return;

      setMapReady(true);

      if (!thisMap.getSource('traceroute')) {
        thisMap.addSource('traceroute', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      thisMap.on('mouseenter', 'trace-nodes', (e) => {
        if (!map.current || !popup.current) return;
        map.current.getCanvas().style.cursor = 'pointer';
        const feat = e.features?.[0];
        if (!feat || !feat.properties) return;
        const coords = (feat.geometry as Point).coordinates.slice() as [number, number];
        const p = feat.properties;
        const isDk = useDnsStore.getState().theme === 'dark';
        const bg = isDk ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)';
        const text = isDk ? '#e2e8f0' : '#1e293b';
        const sub = isDk ? '#94a3b8' : '#64748b';
        const location = [p.country, p.city].filter(Boolean).join(' · ') || '—';
        popup.current
          .setLngLat(coords)
          .setHTML(`<div style="background:${bg};color:${text};padding:8px 12px;border-radius:10px;border:1px solid ${isDk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};font-size:11px;font-family:ui-monospace,monospace;line-height:1.6;min-width:140px;box-shadow:0 4px 20px rgba(0,0,0,0.3)">
            <div style="font-weight:700;margin-bottom:2px">Hop ${p.index}</div>
            <div style="color:${sub}">${p.ip || '—'}</div>
            <div>${location}</div>
            ${p.isp ? `<div style="color:${sub};font-size:10px">${p.isp}</div>` : ''}
            <div style="margin-top:4px;color:#22d3ee">${Number(p.latency).toFixed(1)} ms</div>
          </div>`)
          .addTo(map.current);
      });
      thisMap.on('mouseleave', 'trace-nodes', () => {
        if (!map.current || !popup.current) return;
        map.current.getCanvas().style.cursor = '';
        popup.current.remove();
      });

      // 從監測點到目的地的弧線（DNS connection spokes）
      // 與 wireframe 相同：底層 dim emerald + 上層 emerald 流動 gradient
      if (!thisMap.getSource('dns-spokes')) {
        thisMap.addSource('dns-spokes', {
          type: 'geojson',
          lineMetrics: true,
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      const dark = useDnsStore.getState().theme === 'dark';
      const dimStroke = dark ? 'rgba(52,211,153,0.22)' : 'rgba(15,118,110,0.28)';
      thisMap.addLayer({
        id: 'dns-spokes-bg',
        type: 'line',
        source: 'dns-spokes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': dimStroke,
          'line-width': 2.8,
          'line-opacity': 1,
        },
      });
      thisMap.addLayer({
        id: 'dns-spokes',
        type: 'line',
        source: 'dns-spokes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'line-gradient': buildSpokesFlowGradient(dark, 0.5) as any,
          'line-width': 1.35,
          'line-opacity': 0.92,
        },
      });
    });

    return () => {
      setMapReady(false);
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !map.current) return;

    const isDark = theme === 'dark';
    const bgColor = isDark ? '#020617' : '#f8fafc';
    const landColor = isDark ? '#0f172a' : '#e2e8f0';
    const borderColor = isDark ? '#1e293b' : '#cbd5e1';

    map.current.setPaintProperty('background', 'background-color', bgColor);
    map.current.setPaintProperty('county', 'fill-color', landColor);
    map.current.setPaintProperty('county-outline', 'line-color', borderColor);
    map.current.setPaintProperty('global', 'fill-color', landColor);

    if (map.current.getLayer('trace-nodes')) {
      map.current.setPaintProperty('trace-nodes', 'circle-stroke-color', isDark ? '#0f172a' : '#ffffff');
    }
  }, [theme, mapReady]);

  useEffect(() => {
    if (!mapReady || !map.current) return;

    const source = map.current.getSource('traceroute') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!activeResult || activeResult.hops.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
      if (map.current.getLayer('trace-labels')) map.current.removeLayer('trace-labels');
      if (map.current.getLayer('trace-nodes')) map.current.removeLayer('trace-nodes');
      if (map.current.getLayer('trace-lines')) map.current.removeLayer('trace-lines');
      return;
    }

    const features: Feature[] = [];
    const rawHops = activeResult.hops.filter(h => h.coords && h.coords.length === 2);

    // 設計決策（doc/09）：地圖只渲染「起點→終點」兩個節點，
    // 中間 hop 因 CDN/anycast 常有地理失真，不在地圖上呈現以避免誤導。
    // HopTable 仍保留所有 hop 細節供分析。
    const endpointHops = pickPathEndpoints(rawHops);
    const hops = spreadOverlappingHops(endpointHops);

    hops.forEach(hop => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: hop.displayCoords },
        properties: { ...hop, type: 'hop' }
      });
    });

    for (let i = 0; i < hops.length - 1; i++) {
      const start = hops[i];
      const end = hops[i+1];

      const dist = calculateDistance(start.coords, end.coords);
      const isSubmarine = dist > 1000;

      if (isSubmarine) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: createCurve(start.displayCoords, end.displayCoords)
          },
          properties: { type: 'submarine', distance: dist }
        });
      } else {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [start.displayCoords, end.displayCoords]
          },
          properties: { type: 'normal', distance: dist }
        });
      }
    }

    source.setData({ type: 'FeatureCollection', features });

    if (!map.current.getLayer('trace-lines')) {
      map.current.addLayer({
        id: 'trace-lines',
        type: 'line',
        source: 'traceroute',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'type'], 'submarine'], '#8b5cf6',
            '#22d3ee'
          ],
          'line-width': [
            'case',
            ['==', ['get', 'type'], 'submarine'], 3,
            2
          ],
          'line-dasharray': [2, 4],
          'line-blur': [
            'case',
            ['==', ['get', 'type'], 'submarine'], 2,
            0
          ]
        },
        filter: ['==', ['geometry-type'], 'LineString']
      });
    }

    if (!map.current.getLayer('trace-nodes')) {
      map.current.addLayer({
        id: 'trace-nodes',
        type: 'circle',
        source: 'traceroute',
        paint: {
          'circle-radius': 5,
          'circle-color': '#22d3ee',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f172a'
        },
        filter: ['==', ['geometry-type'], 'Point']
      });
    }

    if (!map.current.getLayer('trace-labels')) {
      map.current.addLayer({
        id: 'trace-labels',
        type: 'symbol',
        source: 'traceroute',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['to-string', ['get', 'index']],
          'text-size': 12,
          'text-font': ['Open Sans Bold'],
          'text-offset': [0, -1.4],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#22d3ee',
          'text-halo-color': '#0f172a',
          'text-halo-width': 2,
        },
      });
    }

    if (hops.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      hops.forEach(h => bounds.extend(h.displayCoords));
      map.current.fitBounds(bounds, { padding: 100, maxZoom: 8 });
    }
  }, [activeResult, mapReady]);

  // 依 country 去重的目的地清單（一個國家一個 marker）
  const destinations = useMemo(() => {
    const byCountry = new Map<string, { coords: [number, number]; country: string; foreign: boolean }>();
    for (const r of records) {
      if (!r.longitude || !r.latitude || !r.country) continue;
      if (byCountry.has(r.country)) continue;
      byCountry.set(r.country, {
        coords: [r.longitude, r.latitude],
        country: r.country,
        foreign: !!r.isForeign,
      });
    }
    return byCountry;
  }, [records]);

  // 連線：監測起點 → 各目的地（與 wireframe 相同採直線，跨換日線 unwrap 經度避免繞地球反方向）
  const dnsSpokeFeatures = useMemo(() => {
    const features: Feature[] = [];
    const [oLon, oLat] = TAIWAN_CENTER;
    for (const dest of destinations.values()) {
      if (dest.country === 'TW') continue; // 不畫從原點到自己的線
      const [dLon, dLat] = dest.coords;
      const endLon = oLon > 50 && dLon < -30 ? dLon + 360 : dLon;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [oLon, oLat],
            [endLon, dLat],
          ],
        },
        properties: { country: dest.country },
      });
    }
    return features;
  }, [destinations]);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    const source = map.current.getSource('dns-spokes') as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: dnsSpokeFeatures });
  }, [dnsSpokeFeatures, mapReady]);

  // 與 wireframe 相同：以 line-gradient 中央位置隨時間移動的方式做流動動畫
  useEffect(() => {
    if (!mapReady || !map.current) return;
    const stop = () => {
      if (flowRafRef.current != null) {
        cancelAnimationFrame(flowRafRef.current);
        flowRafRef.current = null;
      }
    };
    const dark = theme === 'dark';
    const dimStroke = dark ? 'rgba(52,211,153,0.22)' : 'rgba(15,118,110,0.28)';
    if (map.current.getLayer('dns-spokes-bg')) {
      map.current.setPaintProperty('dns-spokes-bg', 'line-color', dimStroke);
    }
    const loop = () => {
      const m = map.current;
      if (!m || !m.getLayer('dns-spokes')) {
        flowRafRef.current = null;
        return;
      }
      const c = (Date.now() / 2200) % 1;
      try {
        m.setPaintProperty('dns-spokes', 'line-gradient', buildSpokesFlowGradient(dark, c));
      } catch {
        flowRafRef.current = null;
        return;
      }
      flowRafRef.current = requestAnimationFrame(loop);
    };
    stop();
    flowRafRef.current = requestAnimationFrame(loop);
    return stop;
  }, [mapReady, theme]);

  // 圓形國旗 marker：每個國家一個（含原點台灣較大）
  useEffect(() => {
    if (!mapReady || !map.current) return;
    // 移除舊 markers
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    // 整合：所有目的地 + 強制加入原點台灣（即使沒紀錄）
    type MarkerInfo = { coords: [number, number]; country: string; isOrigin: boolean };
    const items: MarkerInfo[] = [];
    let hasTW = false;
    for (const dest of destinations.values()) {
      const isOrigin = dest.country === 'TW';
      if (isOrigin) hasTW = true;
      items.push({ coords: dest.coords, country: dest.country, isOrigin });
    }
    if (!hasTW && destinations.size > 0) {
      items.unshift({ coords: TAIWAN_CENTER, country: 'TW', isOrigin: true });
    }

    const dark = theme === 'dark';
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
        dark
          ? 'background:#1e293b;border:1.5px solid #334155;box-shadow:0 0 0 1px rgba(15,23,42,0.35)'
          : 'background:#ffffff;border:1.5px solid #cbd5e1;box-shadow:0 1px 3px rgba(15,23,42,0.08)',
      ].join(';');
      el.textContent = countryFlag(it.country) || it.country;
      el.title = it.country;

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(it.coords)
        .addTo(map.current);
      markersRef.current.push(marker);
    }
  }, [destinations, mapReady, theme]);

  return (
      <div className="w-full h-full relative overflow-hidden tour-map">
        <style>
          {`
            .custom-popup .maplibregl-popup-content {
              background: transparent;
              padding: 0;
              box-shadow: none;
              border: none;
            }
            .custom-popup .maplibregl-popup-tip {
              display: none;
            }
            .custom-popup {
              pointer-events: none;
              z-index: 50;
            }
          `}
        </style>
        <div ref={mapContainer} className="w-full h-full" />

        {!monitoringIp && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 dark:bg-slate-950/50 backdrop-blur-[3px] pointer-events-none">
            <div className="flex flex-col items-center gap-4 text-center px-8 py-6 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 shadow-2xl backdrop-blur-md">
              <div className="p-3 bg-cyan-100 dark:bg-cyan-500/20 rounded-xl">
                <Search className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-700 dark:text-slate-100 tracking-wide">{t('map_empty_hint_no_ip')}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">{t('map_empty_setup_hint')}</p>
              </div>
            </div>
          </div>
        )}

        {monitoringIp && records.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/40 dark:bg-slate-950/30 backdrop-blur-[1px] pointer-events-none">
            <div className="flex flex-col items-center gap-4 text-center">
              <Radio className="h-12 w-12 text-cyan-600 dark:text-cyan-400 animate-pulse" />
              <div>
                <p className="text-lg font-bold text-slate-700 dark:text-slate-100 tracking-wide">{t('map_empty_title')}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('map_empty_hint_waiting')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
