import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Hop } from '../types';
import { calculateDistance, createCurve } from '../utils/geo';
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

    m.on('load', () => {
      const validHops = hops.filter(h => h.ip !== '*' && h.coords && h.coords.length === 2);

      // 建立 traceroute source
      const features: GeoJSON.Feature[] = [];

      // 跳點標記
      validHops.forEach(hop => {
        const latencyColor = hop.latency < 50 ? '#10b981' : hop.latency < 150 ? '#f59e0b' : '#ef4444';
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: hop.coords },
          properties: {
            index: hop.index,
            ip: hop.ip,
            asn: hop.asn || 0,
            latency: hop.latency,
            color: latencyColor,
          },
        });
      });

      // 連線
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
            coordinates: isSubmarine ? createCurve(start.coords, end.coords) : [start.coords, end.coords],
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
          'text-size': 10,
          'text-font': ['Open Sans Bold'],
          'text-offset': [0, -1.4],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': isDark ? '#e2e8f0' : '#334155',
          'text-halo-color': isDark ? '#0f172a' : '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      // Popup
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'trace-popup' });
      m.on('mouseenter', 'trace-nodes', (e) => {
        m.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (!f || f.geometry.type !== 'Point') return;
        const props = f.properties;
        popup
          .setLngLat(f.geometry.coordinates as [number, number])
          .setHTML(`
            <div class="${isDark ? 'bg-slate-900 text-slate-200 border-white/10' : 'bg-white text-slate-700 border-slate-200'} border rounded-lg px-3 py-2 text-[11px] shadow-lg font-mono">
              <div class="font-bold">${props.ip}</div>
              ${props.asn ? `<div class="text-[10px] opacity-60">AS${props.asn}</div>` : ''}
              <div class="mt-1">${props.latency.toFixed(1)} ms</div>
            </div>
          `)
          .addTo(m);
      });
      m.on('mouseleave', 'trace-nodes', () => {
        m.getCanvas().style.cursor = '';
        popup.remove();
      });

      // fitBounds
      if (validHops.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        validHops.forEach(h => bounds.extend(h.coords as [number, number]));
        m.fitBounds(bounds, { padding: 60, maxZoom: 10 });
      }
    });

    return () => {
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
