import React, { useEffect, useRef, useMemo, useState } from 'react';
import maplibregl, { ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Feature, Point } from 'geojson';
import { useCableStore } from '../stores/useCableStore';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { useDnsStore } from '../stores/useDnsStore';
import { calculateDistance, createCurve, spreadOverlappingHops } from '../utils/geo';
import { addCableSources, addCableLayers, setupCableInteractions } from '../utils/cableLayer';
// cableInference 的 directed path 函式保留供其他模組使用，動畫路徑直接從 GeoJSON 建構
import { useTranslation } from 'react-i18next';
import { Radio, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { CableEventPanel } from './CableEventPanel';

const TAIWAN_CENTER: [number, number] = [121.5, 24.5];
const ZOOM_LEVEL = 6.5;

export const CyberMap: React.FC = () => {
  const { t } = useTranslation();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { geoJSON, initialize, highlightedCableIds, cableAppFlows, updateHighlightedCables, selectedEventCableId } = useCableStore();
  const { activeResult } = useTracerouteStore();
  const { records, monitoringIp, theme, selectedRowIds } = useDnsStore();

  useEffect(() => {
    if (!geoJSON) {
      initialize();
    }
  }, [geoJSON, initialize]);

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
      center: TAIWAN_CENTER,
      zoom: ZOOM_LEVEL,
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
      // 確保 load 事件對應的是目前的 map instance（StrictMode / geoJSON 變更可能導致 map 被重建）
      if (map.current !== thisMap) return;

      addCableSources(thisMap, geoJSON!);
      addCableLayers(thisMap, theme);
      setupCableInteractions(thisMap, popup.current!, theme, undefined, undefined, {
        availablePath: t('cable_available_path'),
      });

      setMapReady(true);

      // Traceroute source（資料由 activeResult useEffect 更新）
      if (!thisMap.getSource('traceroute')) {
        thisMap.addSource('traceroute', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // Traceroute hop 節點 hover popup
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

      // DNS query points source
      if (!thisMap.getSource('dns-points')) {
        thisMap.addSource('dns-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // Invisible hit-test layer (large radius for easy hover)
      thisMap.addLayer({
        id: 'dns-points-hit',
        type: 'circle',
        source: 'dns-points',
        paint: {
          'circle-radius': 18,
          'circle-color': '#000000',
          'circle-opacity': 0,
        },
      });

      // Pulse ring (outer glow) — selected points get larger, brighter pulse
      thisMap.addLayer({
        id: 'dns-points-pulse',
        type: 'circle',
        source: 'dns-points',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'selected'], 1], 18, 12],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['==', ['get', 'selected'], 1], 0.35, 0.15],
          'circle-blur': 1,
        },
      });

      // Core dot — selected points are larger with thicker stroke
      thisMap.addLayer({
        id: 'dns-points-core',
        type: 'circle',
        source: 'dns-points',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'selected'], 1], 7, 4],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['==', ['get', 'selected'], 1], 1.0, 0.9],
          'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 2, 1],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': ['case', ['==', ['get', 'selected'], 1], 0.8, 0.4],
        },
      });

      // DNS node hover popup — use mousemove + queryRenderedFeatures to avoid
      // flicker caused by mouseenter/mouseleave fighting between overlapping layers
      const dnsHitLayers = ['dns-points-hit', 'dns-points-pulse', 'dns-points-core'];
      let dnsPopupVisible = false;

      const handleDnsMouseMove = (e: maplibregl.MapMouseEvent) => {
        if (!map.current || !popup.current) return;
        const features = map.current.queryRenderedFeatures(e.point, {
          layers: dnsHitLayers,
        });
        if (features.length > 0) {
          const feat = features[0];
          if (!feat.properties) return;
          map.current.getCanvas().style.cursor = 'pointer';
          const coords = (feat.geometry as Point).coordinates.slice() as [number, number];
          const { ip, domain, country, city } = feat.properties;
          const isForeign = feat.properties.color === '#ef4444';
          const isDk = useDnsStore.getState().theme === 'dark';
          const bg = isDk ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)';
          const text = isDk ? '#e2e8f0' : '#1e293b';
          const sub = isDk ? '#94a3b8' : '#64748b';
          const tag = isForeign
            ? `<span style="color:#ef4444;font-weight:700;font-size:9px;letter-spacing:0.05em">${t('dns_foreign')}</span>`
            : `<span style="color:#10b981;font-weight:700;font-size:9px;letter-spacing:0.05em">${t('dns_local')}</span>`;
          const location = [country, city].filter(Boolean).join(' · ');
          popup.current
            .setLngLat(coords)
            .setHTML(`<div style="background:${bg};color:${text};padding:8px 12px;border-radius:10px;border:1px solid ${isDk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};font-size:11px;font-family:ui-monospace,monospace;line-height:1.6;min-width:140px;box-shadow:0 4px 20px rgba(0,0,0,0.3)">
              <div style="font-weight:700;margin-bottom:2px">${domain || '—'}</div>
              <div style="color:${sub}">${ip}</div>
              ${location ? `<div style="color:${sub};font-size:10px">${location}</div>` : ''}
              <div style="margin-top:4px">${tag}</div>
            </div>`)
            .addTo(map.current);
          dnsPopupVisible = true;
        } else if (dnsPopupVisible) {
          map.current.getCanvas().style.cursor = '';
          popup.current.remove();
          dnsPopupVisible = false;
        }
      };
      thisMap.on('mousemove', handleDnsMouseMove);

      // DNS point click → toggle table row selection
      const handleDnsClick = (e: maplibregl.MapMouseEvent) => {
        if (!map.current) return;
        const features = map.current.queryRenderedFeatures(e.point, {
          layers: dnsHitLayers,
        });
        if (features.length > 0) {
          const feat = features[0];
          const recordId = feat.properties?.recordId;
          if (recordId) {
            useDnsStore.getState().toggleRowSelection(recordId);
          }
        }
      };
      thisMap.on('click', 'dns-points-hit', handleDnsClick);
      thisMap.on('click', 'dns-points-pulse', handleDnsClick);
      thisMap.on('click', 'dns-points-core', handleDnsClick);
    });

    return () => {
      setMapReady(false);
      map.current?.remove();
    };
  }, [geoJSON]);

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

    // Update cable layers for theme — light mode needs higher opacity/width
    if (map.current.getLayer('cables-line')) {
      map.current.setPaintProperty('cables-line', 'line-opacity', [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        0.9,
        isDark ? 0.15 : 0.35,
      ]);
      map.current.setPaintProperty('cables-line', 'line-width', [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        3,
        isDark ? 1.5 : 2,
      ]);
    }
    if (map.current.getLayer('cables-line-available')) {
      map.current.setPaintProperty('cables-line-available', 'line-opacity', [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        1.0,
        isDark ? 0.85 : 1.0,
      ]);
      map.current.setPaintProperty('cables-line-available', 'line-width', [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        5,
        isDark ? 3 : 3.5,
      ]);
    }
    // 更新流向光點顏色
    if (map.current.getLayer('cable-flow-dot-glow')) {
      map.current.setPaintProperty('cable-flow-dot-glow', 'circle-color', isDark ? '#22d3ee' : '#0e7490');
    }
    if (map.current.getLayer('cable-flow-dot-core')) {
      map.current.setPaintProperty('cable-flow-dot-core', 'circle-color', isDark ? '#22d3ee' : '#0e7490');
      map.current.setPaintProperty('cable-flow-dot-core', 'circle-stroke-color', isDark ? '#0f172a' : '#ffffff');
    }

    // Update DNS point visuals
    if (map.current.getLayer('dns-points-pulse')) {
      map.current.setPaintProperty('dns-points-pulse', 'circle-opacity', isDark ? 0.15 : 0.25);
    }
    if (map.current.getLayer('dns-points-core')) {
      map.current.setPaintProperty('dns-points-core', 'circle-opacity', isDark ? 0.9 : 1.0);
      map.current.setPaintProperty('dns-points-core', 'circle-stroke-opacity', isDark ? 0.4 : 0.6);
    }

    // Update traceroute node stroke for visibility
    if (map.current.getLayer('trace-nodes')) {
      map.current.setPaintProperty('trace-nodes', 'circle-stroke-color', isDark ? '#0f172a' : '#ffffff');
    }
  }, [theme, mapReady]);

  // 當勾選的 DNS 紀錄變化時，推測並高亮對應海纜
  useEffect(() => {
    const { records: allRecords, selectedRowIds: ids } = useDnsStore.getState();
    const selected = allRecords.filter(r => ids.has(r._id));
    updateHighlightedCables(selected);
  }, [selectedRowIds, updateHighlightedCables]);

  // 依 highlightedCableIds（DNS 勾選推測）+ selectedEventCableId（事件面板）更新 selected layer filter + 流向光點動畫
  useEffect(() => {
    if (!mapReady || !map.current) return;
    const m = map.current;

    // 合併 DNS 推測的海纜 + 事件面板選取的海纜
    const allIds = new Set(highlightedCableIds);
    if (selectedEventCableId) allIds.add(selectedEventCableId);

    let filter: ExpressionSpecification;
    if (allIds.size === 0) {
      filter = ['all', ['==', ['get', 'hidden'], false], ['==', ['get', 'cableId'], '___none___']];
    } else {
      const idConditions = [...allIds].map(
        id => ['==', ['get', 'cableId'], id] as ExpressionSpecification,
      );
      filter = [
        'all',
        ['==', ['get', 'hidden'], false],
        ['any', ...idConditions],
      ] as ExpressionSpecification;
    }

    m.setFilter('cables-line-selected', filter);

    // === 流向光點動畫（仿 TraceMap flowing dot） ===
    // 清除舊的光點圖層和 source
    if (m.getLayer('cable-flow-dot-glow')) m.removeLayer('cable-flow-dot-glow');
    if (m.getLayer('cable-flow-dot-core')) m.removeLayer('cable-flow-dot-core');
    if (m.getSource('cable-flow-dots')) m.removeSource('cable-flow-dots');

    if (allIds.size === 0) return;

    // 從 GeoJSON 提取每條高亮海纜最長的 segment 作為動畫路徑
    const { geoJSON: cableGeoJSON } = useCableStore.getState();
    if (!cableGeoJSON) return;

    const cablePaths = new Map<string, [number, number][]>();
    for (const feature of cableGeoJSON.features) {
      const cableId = feature.properties.cableId;
      if (!allIds.has(cableId) || feature.properties.hidden) continue;
      const coords = feature.geometry.coordinates as [number, number][];
      if (coords.length < 2) continue;
      const existing = cablePaths.get(cableId);
      if (!existing || coords.length > existing.length) {
        cablePaths.set(cableId, coords);
      }
    }

    if (cablePaths.size === 0) return;

    // 建立每條海纜的累積距離表（用於等速插值）
    const cableInterpolators: Array<{
      cableId: string;
      coords: [number, number][];
      segDists: number[];
      totalDist: number;
    }> = [];

    for (const [cableId, coords] of cablePaths) {
      const segDists: number[] = [0];
      for (let i = 1; i < coords.length; i++) {
        const dx = coords[i][0] - coords[i - 1][0];
        const dy = coords[i][1] - coords[i - 1][1];
        segDists.push(segDists[i - 1] + Math.sqrt(dx * dx + dy * dy));
      }
      cableInterpolators.push({
        cableId,
        coords,
        segDists,
        totalDist: segDists[segDists.length - 1],
      });
    }

    // 建立光點 GeoJSON source（每條海纜 2 個光點：出站 + 回程，雙向流動）
    const initialFeatures: GeoJSON.Feature[] = [];
    cableInterpolators.forEach((ci, idx) => {
      initialFeatures.push(
        { type: 'Feature', geometry: { type: 'Point', coordinates: ci.coords[0] }, properties: { idx: idx * 2, dir: 'out', cableId: ci.cableId } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: ci.coords[ci.coords.length - 1] }, properties: { idx: idx * 2 + 1, dir: 'in', cableId: ci.cableId } },
      );
    });

    m.addSource('cable-flow-dots', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: initialFeatures },
    });

    const isDark = useDnsStore.getState().theme === 'dark';
    const outColor = isDark ? '#22d3ee' : '#0e7490';  // 出站：cyan
    const inColor = isDark ? '#f59e0b' : '#d97706';   // 回程：amber

    // 外圈光暈
    m.addLayer({
      id: 'cable-flow-dot-glow',
      type: 'circle',
      source: 'cable-flow-dots',
      paint: {
        'circle-radius': 24,
        'circle-color': ['case', ['==', ['get', 'dir'], 'out'], outColor, inColor],
        'circle-opacity': 0.2,
        'circle-blur': 1,
      },
    });

    // 內圈實心光點
    m.addLayer({
      id: 'cable-flow-dot-core',
      type: 'circle',
      source: 'cable-flow-dots',
      paint: {
        'circle-radius': ['case', ['==', ['get', 'dir'], 'out'], 8, 6],
        'circle-color': ['case', ['==', ['get', 'dir'], 'out'], outColor, inColor],
        'circle-opacity': 0.95,
        'circle-stroke-width': 2,
        'circle-stroke-color': isDark ? '#0f172a' : '#ffffff',
      },
    });

    // === Hover 高亮海纜時顯示 app 流量 popup ===
    const flowLookup = new Map<string, typeof cableAppFlows[0]>();
    for (const flow of cableAppFlows) flowLookup.set(flow.cableId, flow);

    let flowPopupVisible = false;
    const handleFlowHover = (e: maplibregl.MapMouseEvent) => {
      const features = m.queryRenderedFeatures(e.point, { layers: ['cables-line-selected'] });
      if (features.length > 0) {
        const cableId = String(features[0].properties?.cableId ?? '');
        const flow = flowLookup.get(cableId);
        if (flow && popup.current) {
          m.getCanvas().style.cursor = 'pointer';
          const bg = isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.97)';
          const txt = isDark ? '#e2e8f0' : '#1e293b';
          const sub = isDark ? '#94a3b8' : '#64748b';
          const appLines = flow.apps.slice(0, 6).map(a =>
            `<div style="display:flex;justify-content:space-between;gap:12px"><span>${a.name}</span><span style="color:${sub}">${a.count}</span></div>`
          ).join('');
          const more = flow.apps.length > 6 ? `<div style="color:${sub};font-size:9px;margin-top:2px">+${flow.apps.length - 6} more</div>` : '';
          popup.current
            .setLngLat(e.lngLat)
            .setHTML(`<div style="background:${bg};color:${txt};padding:10px 14px;border-radius:12px;border:1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'};font-size:11px;font-family:ui-monospace,monospace;line-height:1.6;min-width:180px;max-width:260px;box-shadow:0 4px 24px rgba(0,0,0,0.3)">
              <div style="font-weight:700;font-size:12px;margin-bottom:4px;color:${isDark ? '#22d3ee' : '#0e7490'}">${flow.cableName}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:10px;color:${sub}">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${outColor}"></span> ${t('cable_flow_outbound')}
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${inColor};margin-left:4px"></span> ${t('cable_flow_inbound')}
                <span style="margin-left:auto">${flow.totalRecords} ${t('cable_flow_queries')}</span>
              </div>
              <div style="border-top:1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};padding-top:4px">${appLines}${more}</div>
            </div>`)
            .addTo(m);
          flowPopupVisible = true;
        }
      } else if (flowPopupVisible) {
        popup.current?.remove();
        flowPopupVisible = false;
      }
    };
    m.on('mousemove', 'cables-line-selected', handleFlowHover);
    m.on('mouseleave', 'cables-line-selected', () => {
      if (flowPopupVisible) { popup.current?.remove(); flowPopupVisible = false; }
    });

    // 動畫迴圈（雙向：出站 t=0→1，回程 t=1→0，各自以 ~10 秒走完一趟）
    const duration = 10000;
    let startTime: number | null = null;
    let frameId: number;

    const normLng = (lng: number): number => {
      while (lng > 180) lng -= 360;
      while (lng < -180) lng += 360;
      return lng;
    };

    const interpolate = (ci: typeof cableInterpolators[0], t: number): [number, number] => {
      const d = t * ci.totalDist;
      for (let i = 1; i < ci.segDists.length; i++) {
        if (d <= ci.segDists[i]) {
          const segLen = ci.segDists[i] - ci.segDists[i - 1];
          const frac = segLen > 0 ? (d - ci.segDists[i - 1]) / segLen : 0;
          return [
            normLng(ci.coords[i - 1][0] + (ci.coords[i][0] - ci.coords[i - 1][0]) * frac),
            ci.coords[i - 1][1] + (ci.coords[i][1] - ci.coords[i - 1][1]) * frac,
          ];
        }
      }
      const last = ci.coords[ci.coords.length - 1];
      return [normLng(last[0]), last[1]];
    };

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      const features: GeoJSON.Feature[] = [];
      cableInterpolators.forEach((ci, idx) => {
        const offset = (idx / cableInterpolators.length) * 0.3;
        const tOut = ((elapsed / duration + offset) % 1);
        const tIn = ((elapsed / duration + offset + 0.5) % 1); // 回程錯開半圈
        const posOut = interpolate(ci, tOut);
        const posIn = interpolate(ci, 1 - tIn); // 反向
        features.push(
          { type: 'Feature', geometry: { type: 'Point', coordinates: posOut }, properties: { idx: idx * 2, dir: 'out', cableId: ci.cableId } },
          { type: 'Feature', geometry: { type: 'Point', coordinates: posIn }, properties: { idx: idx * 2 + 1, dir: 'in', cableId: ci.cableId } },
        );
      });

      const source = m.getSource('cable-flow-dots') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features });
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      m.off('mousemove', 'cables-line-selected', handleFlowHover);
      if (m.getLayer('cable-flow-dot-glow')) m.removeLayer('cable-flow-dot-glow');
      if (m.getLayer('cable-flow-dot-core')) m.removeLayer('cable-flow-dot-core');
      if (m.getSource('cable-flow-dots')) m.removeSource('cable-flow-dots');
    };
  }, [highlightedCableIds, cableAppFlows, selectedEventCableId, mapReady]);

  // 更新 Traceroute 視覺化
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
    const hops = spreadOverlappingHops(rawHops);

    // 1. Add Hop Nodes（使用散開後的 displayCoords）
    hops.forEach(hop => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: hop.displayCoords },
        properties: { ...hop, type: 'hop' }
      });
    });

    // 2. Add Segments (Lines)（使用散開後的 displayCoords）
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

    // Ensure layers exist
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

    // Zoom to fit the trace
    if (hops.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      hops.forEach(h => bounds.extend(h.displayCoords));
      map.current.fitBounds(bounds, { padding: 100, maxZoom: 8 });
    }
  }, [activeResult, mapReady]);

  // Deduplicate DNS points by resultIp (keep most recent per IP)
  const dnsPointFeatures = useMemo(() => {
    const seen = new Map<string, typeof records[0]>();
    for (const r of records) {
      if (r.longitude && r.latitude && !seen.has(r.resultIp)) {
        seen.set(r.resultIp, r);
      }
    }
    return Array.from(seen.values()).map(r => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.longitude!, r.latitude!] },
      properties: {
        color: r.isForeign ? '#ef4444' : '#10b981',
        ip: r.resultIp,
        recordId: r._id,
        domain: r.domain,
        country: r.country || '',
        city: r.city || '',
        selected: selectedRowIds.has(r._id) ? 1 : 0,
      },
    }));
  }, [records, selectedRowIds]);

  // Update dns-points source reactively
  useEffect(() => {
    if (!mapReady || !map.current) return;
    const source = map.current.getSource('dns-points') as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: dnsPointFeatures });
  }, [dnsPointFeatures, mapReady]);

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

        {/* 小型狀態條 + 事件面板 */}
        <div className="absolute left-6 top-6 max-h-[calc(100vh-80px)] overflow-y-auto bg-white/90 dark:bg-slate-950/80 backdrop-blur-md text-slate-700 dark:text-slate-100 text-xs px-5 py-4 rounded-xl border border-slate-300 dark:border-white/10 shadow-xl dark:shadow-2xl z-10 pointer-events-auto transition-colors w-[260px]">
          <div className="font-bold uppercase tracking-widest text-cyan-700 dark:text-cyan-400 mb-2.5 text-[13px]">{t('cable_monitor')}</div>
          <div className="flex items-center gap-3 mt-2">
            <div className="w-4 h-0.5 bg-blue-600 dark:bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
            <div className="text-slate-700 dark:text-slate-400 tracking-tight font-medium">{t('cable_tw_routes')}</div>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="w-4 h-0.5 bg-slate-400 dark:bg-slate-700"></div>
            <div className="text-slate-500 dark:text-slate-500 tracking-tight font-medium">{t('cable_international')}</div>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="w-4 h-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"></div>
            <div className="text-slate-700 dark:text-slate-400 tracking-tight font-medium">{t('event_status_broken')}</div>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="w-4 h-0.5 bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]"></div>
            <div className="text-slate-700 dark:text-slate-400 tracking-tight font-medium">{t('event_status_partial')}</div>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
            <div className="text-slate-700 dark:text-slate-400 tracking-tight font-medium">{t('dns_local')}</div>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
            <div className="text-slate-700 dark:text-slate-400 tracking-tight font-medium">{t('dns_foreign')}</div>
          </div>
          <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-3 pt-3 border-t border-slate-300 dark:border-white/5 font-mono">
            {highlightedCableIds.size > 0
              ? t('cable_selected', { id: [...highlightedCableIds].join(', ') })
              : t('cable_hint').toUpperCase()}
          </div>
          {/* 勾選紀錄的海纜流量推測 */}
          {cableAppFlows.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-300 dark:border-white/5 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">{t('cable_flow_title')}</div>
              {cableAppFlows.map((flow) => (
                <CableFlowItem key={flow.cableId} flow={flow} t={t} />
              ))}
            </div>
          )}
          {/* 海纜事件（內嵌可收合） */}
          <CableEventPanel />
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5">
            {t('cable_source')}{' '}
            <a href="https://smc.peering.tw/" target="_blank" rel="noopener noreferrer" className="underline hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
              smc.peering.tw
            </a>
          </div>
        </div>

        {/* Empty state overlay — no monitoring IP */}
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

        {/* Empty state overlay — monitoring active but no records yet */}
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

/** 海纜流量推測項目 — 可展開查看詳細 app 列表 */
const CableFlowItem: React.FC<{
  flow: import('../stores/useCableStore').CableAppFlow;
  t: (key: string, opts?: Record<string, unknown>) => string;
}> = ({ flow, t }) => {
  const [expanded, setExpanded] = useState(false);
  const confidenceColor = flow.confidence === 'high'
    ? 'text-emerald-500' : flow.confidence === 'medium'
    ? 'text-amber-500' : 'text-slate-400';
  const confidenceDot = flow.confidence === 'high'
    ? 'bg-emerald-500' : flow.confidence === 'medium'
    ? 'bg-amber-500' : 'bg-slate-400';

  return (
    <div className="text-[10px] rounded-lg bg-slate-100/50 dark:bg-white/[0.03] px-2.5 py-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-1 text-left"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${confidenceDot}`} />
          <span className="font-bold text-slate-700 dark:text-slate-300 truncate">{flow.cableName}</span>
          <span className="font-normal text-slate-400 dark:text-slate-600 flex-shrink-0">
            ({flow.totalRecords})
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-3 h-3 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
        }
      </button>
      {!expanded && (
        <div className="text-slate-500 dark:text-slate-500 mt-0.5 truncate pl-3">
          {flow.apps.slice(0, 3).map(a => a.name).join(', ')}
          {flow.apps.length > 3 && ` +${flow.apps.length - 3}`}
        </div>
      )}
      {expanded && (
        <div className="mt-1.5 pl-3 space-y-0.5">
          {flow.apps.map((app) => (
            <div key={app.name} className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400 truncate">{app.name}</span>
              <span className="text-slate-400 dark:text-slate-600 flex-shrink-0 ml-2 tabular-nums">{app.count}</span>
            </div>
          ))}
          <div className={`mt-1 pt-1 border-t border-slate-200 dark:border-white/5 ${confidenceColor}`}>
            {t('cable_flow_confidence')}: {flow.confidence}
          </div>
        </div>
      )}
    </div>
  );
};
