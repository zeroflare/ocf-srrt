import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCableStore } from '../stores/useCableStore';

const TAIWAN_CENTER: [number, number] = [121.5, 24.5];
const ZOOM_LEVEL = 6.5;

export const CyberMap: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);

  const { geoJSON, selectedCableId, initialize, setSelectedCableId, toggleCableSelection } = useCableStore();

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
            paint: { "background-color": "#020617" },
          },
          {
            id: "county",
            type: "fill",
            source: "map",
            "source-layer": "city",
            paint: { "fill-color": "#0f172a" },
          },
          {
            id: "county-outline",
            type: "line",
            source: "map",
            "source-layer": "city",
            paint: { "line-color": "#1e293b", "line-width": 1 },
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
              "fill-color": "#0f172a",
              "fill-opacity": 1,
            },
          },
        ],
      },
      center: TAIWAN_CENTER,
      zoom: ZOOM_LEVEL,
    });

    popup.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'custom-popup',
    });

    map.current.on('load', () => {
      if (!map.current) return;

      map.current.addSource('cables', {
        type: 'geojson',
        data: geoJSON!,
        generateId: true,
      });

      // 1) 全部海纜（更淡）
      map.current.addLayer({
        id: 'cables-line',
        type: 'line',
        source: 'cables',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            3,
            1.5,
          ],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.8,
            0.15,
          ],
        },
        filter: ['==', ['get', 'hidden'], false],
      });

      // 2) 強調「可用路徑」（更亮更粗）
      map.current.addLayer({
        id: 'cables-line-available',
        type: 'line',
        source: 'cables',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            5,
            3,
          ],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            1.0,
            0.85,
          ],
        },
        filter: ['all',
          ['==', ['get', 'hidden'], false],
          ['==', ['get', 'isAvailablePath'], true],
        ],
      });

      // 3) 被選取的整條海纜（覆蓋在最上面）
      map.current.addLayer({
        id: 'cables-line-selected',
        type: 'line',
        source: 'cables',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5,
          'line-opacity': 0.95,
        },
        filter: ['all',
          ['==', ['get', 'hidden'], false],
          ['==', ['get', 'cableId'], '___none___'],
        ],
      });

      // 4) 動畫流動層 (僅在選取時顯示)
      map.current.addLayer({
        id: 'cables-line-animation',
        type: 'line',
        source: 'cables',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
          'line-opacity': 0.8,
          'line-dasharray': [2, 4],
        },
        filter: ['all',
          ['==', ['get', 'hidden'], false],
          ['==', ['get', 'cableId'], '___none___'],
        ],
      });

      let dashOffset = 0;
      const animate = () => {
        if (!map.current || !map.current.getLayer('cables-line-animation')) return;
        dashOffset -= 0.1;
        map.current.setPaintProperty('cables-line-animation', 'line-dash-offset', dashOffset);
        requestAnimationFrame(animate);
      };
      animate();

      let hoveredFeatureId: string | number | null = null;

      map.current.on('mousemove', 'cables-line', (e) => handleMouseMove(e));
      map.current.on('mousemove', 'cables-line-available', (e) => handleMouseMove(e));

      const handleMouseMove = (e: any) => {
        if (!map.current || !e.features?.length) return;

        map.current.getCanvas().style.cursor = 'pointer';

        const f = e.features[0];
        const props = (f.properties ?? {}) as Record<string, unknown>;
        const cableName = String(props.cableName ?? props.name ?? 'Unknown');
        const segmentId = String(props.segmentId ?? '');
        const isAvailable = props.isAvailablePath === true;

        if (hoveredFeatureId !== null) {
          map.current.setFeatureState({ source: 'cables', id: hoveredFeatureId }, { hover: false });
        }

        hoveredFeatureId = f.id as string | number;
        map.current.setFeatureState({ source: 'cables', id: hoveredFeatureId }, { hover: true });

        const content = `
          <div class="p-2 bg-gray-900/90 text-white rounded shadow-lg border border-gray-700">
            <div class="font-bold text-blue-300 font-sans">${cableName}</div>
            <div class="text-xs mt-1 font-sans text-gray-300">Segment: ${segmentId}</div>
            ${isAvailable ? '<div class="text-xs mt-1 font-sans text-green-400 font-semibold">✓ 台灣可用路徑</div>' : ''}
            <div class="text-xs mt-1 font-sans text-gray-400">點擊可鎖定整條海纜</div>
          </div>
        `;

        popup.current?.setLngLat(e.lngLat).setHTML(content).addTo(map.current);
      };

      map.current.on('mouseleave', 'cables-line', () => handleMouseLeave());
      map.current.on('mouseleave', 'cables-line-available', () => handleMouseLeave());

      const handleMouseLeave = () => {
        if (!map.current) return;

        map.current.getCanvas().style.cursor = '';
        if (hoveredFeatureId !== null) {
          map.current.setFeatureState({ source: 'cables', id: hoveredFeatureId }, { hover: false });
        }
        hoveredFeatureId = null;
        popup.current?.remove();
      };

      // 點擊選取海纜（同 cableId 全部高亮）
      const handleClick = (e: any) => {
        if (!map.current || !e.features?.length) return;
        const f = e.features[0];
        const props = (f.properties ?? {}) as Record<string, unknown>;
        const cableId = String(props.cableId ?? '');

        toggleCableSelection(cableId);
      };

      map.current.on('click', 'cables-line', handleClick);
      map.current.on('click', 'cables-line-available', handleClick);

      // 點空白取消選取
      map.current.on('click', (e) => {
        if (!map.current) return;
        const features = map.current.queryRenderedFeatures(e.point, { layers: ['cables-line'] });
        if (features.length === 0) setSelectedCableId(null);
      });
    });

    return () => {
      map.current?.remove();
    };
  }, [geoJSON]);

  // 依 selectedCableId 更新 selected layer filter
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const filter: any =
        selectedCableId
            ? ['all', ['==', ['get', 'hidden'], false], ['==', ['get', 'cableId'], selectedCableId]]
            : ['all', ['==', ['get', 'hidden'], false], ['==', ['get', 'cableId'], '___none___']];

    map.current.setFilter('cables-line-selected', filter);
    map.current.setFilter('cables-line-animation', filter);
  }, [selectedCableId]);

  return (
      <div className="w-full h-full relative overflow-hidden">
        <div ref={mapContainer} className="w-full h-full" />

        {/* 小型狀態條 */}
        <div className="absolute left-6 top-6 bg-slate-950/80 backdrop-blur-md text-slate-100 text-[10px] px-4 py-3 rounded-xl border border-white/10 shadow-2xl z-10 pointer-events-none">
          <div className="font-bold uppercase tracking-widest text-cyan-400 mb-2">海底電纜監控網</div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="w-3 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
            <div className="text-slate-400 uppercase tracking-tighter">台灣可用路徑</div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="w-3 h-0.5 bg-slate-700"></div>
            <div className="text-slate-500 uppercase tracking-tighter">其他國際海纜</div>
          </div>
          <div className="text-[9px] text-slate-600 mt-3 pt-3 border-t border-white/5 font-mono">
            {selectedCableId ? `SELECTED: ${selectedCableId}` : 'HINT: HOVER TO INSPECT'}
          </div>
        </div>
      </div>
  );
};
