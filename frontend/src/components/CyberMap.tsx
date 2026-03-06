import React, { useEffect, useRef, useMemo } from 'react';
import maplibregl, { ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Feature } from 'geojson';
import { useCableStore } from '../stores/useCableStore';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { useDnsStore } from '../stores/useDnsStore';
import { calculateDistance, createCurve } from '../utils/geo';
import { addCableSources, addCableLayers, setupCableInteractions } from '../utils/cableLayer';
import { useTranslation } from 'react-i18next';
import { Radio, Search } from 'lucide-react';

const TAIWAN_CENTER: [number, number] = [121.5, 24.5];
const ZOOM_LEVEL = 6.5;

export const CyberMap: React.FC = () => {
  const { t } = useTranslation();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);

  const { geoJSON, selectedCableId, initialize, setSelectedCableId, toggleCableSelection } = useCableStore();
  const { activeResult } = useTracerouteStore();
  const { records, monitoringIp, theme } = useDnsStore();

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

    map.current.on('load', () => {
      if (!map.current) return;

      addCableSources(map.current, geoJSON!);
      addCableLayers(map.current, theme);
      setupCableInteractions(map.current, popup.current!, theme, toggleCableSelection, setSelectedCableId, {
        availablePath: t('cable_available_path'),
        clickToSelect: t('cable_click_to_select'),
      });

      // DNS query points source
      map.current.addSource('dns-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Pulse ring (outer glow)
      map.current.addLayer({
        id: 'dns-points-pulse',
        type: 'circle',
        source: 'dns-points',
        paint: {
          'circle-radius': 12,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.15,
          'circle-blur': 1,
        },
      });

      // Core dot
      map.current.addLayer({
        id: 'dns-points-core',
        type: 'circle',
        source: 'dns-points',
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.9,
          'circle-stroke-width': 1,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': 0.4,
        },
      });
    });

    return () => {
      map.current?.remove();
    };
  }, [geoJSON]);

  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

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
    if (map.current.getLayer('cables-line-animation')) {
      map.current.setPaintProperty('cables-line-animation', 'line-color', isDark ? '#ffffff' : '#0e7490');
      map.current.setPaintProperty('cables-line-animation', 'line-opacity', isDark ? 0.8 : 0.6);
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
  }, [theme]);

  // 依 selectedCableId 更新 selected layer filter
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const filter: ExpressionSpecification =
        selectedCableId
            ? ['all', ['==', ['get', 'hidden'], false], ['==', ['get', 'cableId'], selectedCableId]]
            : ['all', ['==', ['get', 'hidden'], false], ['==', ['get', 'cableId'], '___none___']];

    map.current.setFilter('cables-line-selected', filter);
    map.current.setFilter('cables-line-animation', filter);
  }, [selectedCableId]);

  // 更新 Traceroute 視覺化
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const source = map.current.getSource('traceroute') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!activeResult || activeResult.hops.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
      if (map.current.getLayer('trace-nodes')) map.current.removeLayer('trace-nodes');
      if (map.current.getLayer('trace-lines')) map.current.removeLayer('trace-lines');
      return;
    }

    const features: Feature[] = [];
    const hops = activeResult.hops.filter(h => h.coords && h.coords.length === 2);

    // 1. Add Hop Nodes
    hops.forEach(hop => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: hop.coords },
        properties: { ...hop, type: 'hop' }
      });
    });

    // 2. Add Segments (Lines)
    for (let i = 0; i < hops.length - 1; i++) {
      const start = hops[i];
      const end = hops[i+1];

      // Calculate distance for visual logic
      const dist = calculateDistance(start.coords, end.coords);
      const isSubmarine = dist > 1000;

      if (isSubmarine) {
        // Curved line for submarine cables
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: createCurve(start.coords, end.coords)
          },
          properties: { type: 'submarine', distance: dist }
        });
      } else {
        // Straight line for normal segments
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [start.coords, end.coords]
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

    // Zoom to fit the trace
    if (hops.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      hops.forEach(h => bounds.extend(h.coords));
      map.current.fitBounds(bounds, { padding: 100, maxZoom: 8 });
    }
  }, [activeResult]);

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
        domain: r.domain,
      },
    }));
  }, [records]);

  // Update dns-points source reactively
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;
    const source = map.current.getSource('dns-points') as maplibregl.GeoJSONSource;
    if (!source) return;
    source.setData({ type: 'FeatureCollection', features: dnsPointFeatures });
  }, [dnsPointFeatures]);

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

        {/* 小型狀態條 */}
        <div className="absolute left-6 top-6 bg-white/90 dark:bg-slate-950/80 backdrop-blur-md text-slate-700 dark:text-slate-100 text-xs px-5 py-4 rounded-xl border border-slate-300 dark:border-white/10 shadow-xl dark:shadow-2xl z-10 pointer-events-none transition-colors">
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
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
            <div className="text-slate-700 dark:text-slate-400 tracking-tight font-medium">{t('dns_local')}</div>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
            <div className="text-slate-700 dark:text-slate-400 tracking-tight font-medium">{t('dns_foreign')}</div>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-600 mt-3 pt-3 border-t border-slate-300 dark:border-white/5 font-mono">
            {selectedCableId ? t('cable_selected', { id: selectedCableId }) : t('cable_hint').toUpperCase()}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-600/60 mt-1.5 pointer-events-auto">
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
