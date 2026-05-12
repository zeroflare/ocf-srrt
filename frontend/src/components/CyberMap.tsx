import React, { useEffect, useRef, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Feature, Point } from 'geojson';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { useDnsStore } from '../stores/useDnsStore';
import { calculateDistance, createCurve, pickPathEndpoints, spreadOverlappingHops } from '../utils/geo';
import { useTranslation } from 'react-i18next';
import { Radio, Search } from 'lucide-react';

const TAIWAN_CENTER: [number, number] = [121.5, 24.5];
const ZOOM_LEVEL = 6.5;

export const CyberMap: React.FC = () => {
  const { t } = useTranslation();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { activeResult } = useTracerouteStore();
  const { records, monitoringIp, theme, selectedRowIds } = useDnsStore();

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

      if (!thisMap.getSource('dns-points')) {
        thisMap.addSource('dns-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

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

    if (map.current.getLayer('dns-points-pulse')) {
      map.current.setPaintProperty('dns-points-pulse', 'circle-opacity', isDark ? 0.15 : 0.25);
    }
    if (map.current.getLayer('dns-points-core')) {
      map.current.setPaintProperty('dns-points-core', 'circle-opacity', isDark ? 0.9 : 1.0);
      map.current.setPaintProperty('dns-points-core', 'circle-stroke-opacity', isDark ? 0.4 : 0.6);
    }

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
