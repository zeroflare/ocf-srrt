import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Hop } from '../types';
import { calculateDistance, createCurve, spreadOverlappingHops } from '../utils/geo';
import { useDnsStore } from '../stores/useDnsStore';

interface TraceMapProps {
  hops: Hop[];
}

export const TraceMap: React.FC<TraceMapProps> = ({ hops }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const { theme } = useDnsStore();

  const isDark = theme === 'dark';

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
      center: [121.5, 24.5],
      zoom: 3,
      dragRotate: false,
      touchZoomRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });

    m.dragRotate.disable();
    m.touchZoomRotate.disable();

    map.current = m;
    let cleanupAnimation: (() => void) | null = null;

    m.on('load', () => {
      const rawValidHops = hops.filter(h =>
        h.ip !== '*' &&
        h.coords &&
        h.coords.length === 2 &&
        !(h.coords[0] === 0 && h.coords[1] === 0)
      );

      // 同座標 hop 散開（fan-out），避免地圖上疊成一團
      const validHops = spreadOverlappingHops(rawValidHops);

      // 建立 traceroute source
      const features: GeoJSON.Feature[] = [];

      // 跳點標記（使用散開後的 displayCoords）
      validHops.forEach(hop => {
        const latencyColor = hop.latency < 50 ? '#10b981' : hop.latency < 150 ? '#f59e0b' : '#ef4444';
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: hop.displayCoords },
          properties: {
            index: hop.index,
            ip: hop.ip,
            asn: hop.asn || 0,
            isp: hop.isp || '',
            city: hop.city || '',
            country: hop.country || '',
            latency: hop.latency,
            color: latencyColor,
          },
        });
      });

      // 連線（使用散開後的 displayCoords，距離判斷仍用原始 coords）
      for (let i = 0; i < validHops.length - 1; i++) {
        const start = validHops[i];
        const end = validHops[i + 1];
        const dist = calculateDistance(start.coords, end.coords);
        const isSubmarine = dist > 1000;
        const segLatency = end.latency;
        const segColor = segLatency < 50 ? '#22d3ee' : segLatency < 150 ? '#f59e0b' : '#ef4444';

        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: isSubmarine ? createCurve(start.displayCoords, end.displayCoords) : [start.displayCoords, end.displayCoords],
          },
          properties: { type: isSubmarine ? 'submarine' : 'normal', color: segColor },
        });
      }

      m.addSource('trace', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      // 連線 layer
      m.addLayer({
        id: 'trace-lines',
        type: 'line',
        source: 'trace',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['==', ['get', 'type'], 'submarine'], 2.5, 2],
          'line-dasharray': [2, 3],
          'line-blur': ['case', ['==', ['get', 'type'], 'submarine'], 1.5, 0],
        },
      });

      // 跳點 layer
      m.addLayer({
        id: 'trace-nodes',
        type: 'circle',
        source: 'trace',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': isDark ? '#0f172a' : '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      // 序號 label
      m.addLayer({
        id: 'trace-labels',
        type: 'symbol',
        source: 'trace',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['to-string', ['get', 'index']],
          'text-size': 12,
          'text-font': ['Open Sans Bold'],
          'text-offset': [0, -1.4],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': isDark ? '#e2e8f0' : '#334155',
          'text-halo-color': isDark ? '#0f172a' : '#ffffff',
          'text-halo-width': 2,
        },
      });

      // Popup（使用 DOM API 避免 XSS）
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'trace-popup' });
      m.on('mouseenter', 'trace-nodes', (e) => {
        m.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (!f || f.geometry.type !== 'Point') return;
        const props = f.properties;

        const container = document.createElement('div');
        container.className = `${isDark ? 'bg-slate-900 text-slate-200 border-white/10' : 'bg-white text-slate-700 border-slate-200'} border rounded-lg px-3 py-2 text-[11px] shadow-lg font-mono`;

        const ipDiv = document.createElement('div');
        ipDiv.className = 'font-bold';
        ipDiv.textContent = String(props.ip);
        container.appendChild(ipDiv);

        // 地理位置：country · city
        const location = [props.country, props.city].filter(Boolean).join(' · ');
        if (location) {
          const locDiv = document.createElement('div');
          locDiv.className = 'text-[10px] opacity-70';
          locDiv.textContent = location;
          container.appendChild(locDiv);
        }

        if (props.isp) {
          const ispDiv = document.createElement('div');
          ispDiv.className = 'text-[10px] opacity-60';
          ispDiv.textContent = props.asn ? `AS${props.asn} · ${props.isp}` : String(props.isp);
          container.appendChild(ispDiv);
        } else if (props.asn) {
          const asnDiv = document.createElement('div');
          asnDiv.className = 'text-[10px] opacity-60';
          asnDiv.textContent = `AS${props.asn}`;
          container.appendChild(asnDiv);
        }

        const latencyDiv = document.createElement('div');
        latencyDiv.className = 'mt-1';
        latencyDiv.textContent = `${Number(props.latency).toFixed(1)} ms`;
        container.appendChild(latencyDiv);

        popup
          .setLngLat(f.geometry.coordinates as [number, number])
          .setDOMContent(container)
          .addTo(m);
      });
      m.on('mouseleave', 'trace-nodes', () => {
        m.getCanvas().style.cursor = '';
        popup.remove();
      });

      // fitBounds
      if (validHops.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        validHops.forEach(h => bounds.extend(h.displayCoords));
        m.fitBounds(bounds, { padding: 60, maxZoom: 10 });
      }

      // 流向動畫：移動光點沿路徑行進（含延遲感知速度）
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReducedMotion && validHops.length >= 2) {
        // ── 逐跳展開動畫：連線和節點由 Hop 0 逐步「生長」──
        // 初始隱藏所有元素
        m.setPaintProperty('trace-lines', 'line-opacity', 0);
        m.setPaintProperty('trace-nodes', 'circle-opacity', 0);
        m.setPaintProperty('trace-nodes', 'circle-stroke-opacity', 0);
        m.setPaintProperty('trace-labels', 'text-opacity', 0);

        // 逐跳顯示（每跳 200ms 間隔）
        const revealDelay = 200;
        const revealTimers: ReturnType<typeof setTimeout>[] = [];
        validHops.forEach((_, idx) => {
          const timer = setTimeout(() => {
            // 用 filter 讓第 0~idx 跳的節點和前 idx 段連線可見
            // 由於 MapLibre 不支援動態逐筆 filter，改用漸入 opacity
            if (idx === validHops.length - 1) {
              // 最後一跳：全部顯示
              m.setPaintProperty('trace-lines', 'line-opacity', 1);
              m.setPaintProperty('trace-nodes', 'circle-opacity', 0.9);
              m.setPaintProperty('trace-nodes', 'circle-stroke-opacity', 1);
              m.setPaintProperty('trace-labels', 'text-opacity', 1);
            }
          }, revealDelay * (idx + 1));
          revealTimers.push(timer);
        });
        // 若只有 1 跳，立即顯示
        if (validHops.length === 1) {
          m.setPaintProperty('trace-lines', 'line-opacity', 1);
          m.setPaintProperty('trace-nodes', 'circle-opacity', 0.9);
          m.setPaintProperty('trace-nodes', 'circle-stroke-opacity', 1);
          m.setPaintProperty('trace-labels', 'text-opacity', 1);
        }

        // ── 建立路徑座標序列 ──
        const pathCoords: [number, number][] = [];
        // 每個 hop 間段的延遲（用於速度調整）
        const segLatencies: number[] = [];
        for (let i = 0; i < validHops.length - 1; i++) {
          const start = validHops[i].displayCoords;
          const end = validHops[i + 1].displayCoords;
          const dist = calculateDistance(start, end);
          const segCoords = dist > 1000 ? createCurve(start, end) : [start, end];
          const latency = Math.max(validHops[i + 1].latency - validHops[i].latency, 1);
          if (i === 0) pathCoords.push(segCoords[0] as [number, number]);
          for (let j = 1; j < segCoords.length; j++) {
            pathCoords.push(segCoords[j] as [number, number]);
            segLatencies.push(latency);
          }
        }

        // 計算每段累積「加權距離」（延遲高的路段時間長 → 光點慢）
        const segDists: number[] = [0];
        for (let i = 1; i < pathCoords.length; i++) {
          const dx = pathCoords[i][0] - pathCoords[i - 1][0];
          const dy = pathCoords[i][1] - pathCoords[i - 1][1];
          const geoDist = Math.sqrt(dx * dx + dy * dy);
          // 延遲越高權重越大 → 光點經過時間越長（移動越慢）
          const latencyWeight = Math.sqrt(segLatencies[i - 1] || 1);
          segDists.push(segDists[i - 1] + geoDist * latencyWeight);
        }
        const totalDist = segDists[segDists.length - 1];

        // 沿路徑插值取座標
        const interpolate = (t: number): [number, number] => {
          const d = t * totalDist;
          for (let i = 1; i < segDists.length; i++) {
            if (d <= segDists[i]) {
              const segLen = segDists[i] - segDists[i - 1];
              const frac = segLen > 0 ? (d - segDists[i - 1]) / segLen : 0;
              return [
                pathCoords[i - 1][0] + (pathCoords[i][0] - pathCoords[i - 1][0]) * frac,
                pathCoords[i - 1][1] + (pathCoords[i][1] - pathCoords[i - 1][1]) * frac,
              ];
            }
          }
          return pathCoords[pathCoords.length - 1] as [number, number];
        };

        // 建立光點 source + layer
        const dotData: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: pathCoords[0] },
            properties: {},
          }],
        };

        m.addSource('trace-dot', { type: 'geojson', data: dotData });

        // 外圈光暈
        m.addLayer({
          id: 'trace-dot-glow',
          type: 'circle',
          source: 'trace-dot',
          paint: {
            'circle-radius': 14,
            'circle-color': '#22d3ee',
            'circle-opacity': 0.15,
            'circle-blur': 1,
          },
        });

        // 內圈實心光點
        m.addLayer({
          id: 'trace-dot-core',
          type: 'circle',
          source: 'trace-dot',
          paint: {
            'circle-radius': 5,
            'circle-color': '#22d3ee',
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': isDark ? '#0f172a' : '#ffffff',
          },
        });

        // 動畫迴圈（約 4 秒走完一趟，延遲感知速度）
        const duration = 4000;
        // 逐跳展開完成後才啟動光點
        const dotStartDelay = revealDelay * validHops.length;
        let startTime: number | null = null;
        let animationFrameId: number;

        const animateFlow = (timestamp: number) => {
          if (!startTime) startTime = timestamp;
          const elapsed = (timestamp - startTime) % duration;
          const t = elapsed / duration;
          const pos = interpolate(t);

          (m.getSource('trace-dot') as maplibregl.GeoJSONSource)?.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: pos },
              properties: {},
            }],
          });

          animationFrameId = requestAnimationFrame(animateFlow);
        };

        const dotTimer = setTimeout(() => {
          animationFrameId = requestAnimationFrame(animateFlow);
        }, dotStartDelay);

        // 儲存 cleanup 函式
        cleanupAnimation = () => {
          revealTimers.forEach(clearTimeout);
          clearTimeout(dotTimer);
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
      }
    });

    return () => {
      cleanupAnimation?.();
      m.remove();
    };
  }, [hops, isDark]);

  return (
    <div className="w-full h-full relative">
      <style>{`
        .trace-popup .maplibregl-popup-content {
          background: transparent;
          padding: 0;
          box-shadow: none;
          border: none;
        }
        .trace-popup .maplibregl-popup-tip {
          display: none;
        }
      `}</style>
      <div ref={mapContainer} className="w-full h-full rounded-xl overflow-hidden" />
    </div>
  );
};
