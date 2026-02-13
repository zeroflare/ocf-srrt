import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCableStore } from '../stores/useCableStore';

const TAIWAN_CENTER: [number, number] = [121.5, 23.5];
const ZOOM_LEVEL = 5;

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
            paint: { "background-color": "#1f2025" },
          },
          {
            id: "county",
            type: "fill",
            source: "map",
            "source-layer": "city",
            paint: { "fill-color": "#3F4045" },
          },
          {
            id: "county-outline",
            type: "line",
            source: "map",
            "source-layer": "city",
            paint: { "line-color": "#a9b4bc" },
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
              "fill-color": "#3F4045",
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
      <div className="fixed inset-0 w-full h-full z-0">
        <div ref={mapContainer} className="w-full h-full" />

        {/* 小型狀態條（可再擴充成 cable list / search / legend） */}
        <div className="absolute left-3 top-3 bg-gray-900/80 text-gray-100 text-sm px-3 py-2 rounded border border-gray-700">
          <div className="font-semibold">海纜地圖</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-4 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
            <div className="text-[10px] text-gray-300">台灣可用路徑</div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="w-4 h-0.5 bg-gray-500 opacity-30"></div>
            <div className="text-[10px] text-gray-300">其他海纜路徑</div>
          </div>
          <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-700">
            {selectedCableId ? `已選取：${selectedCableId}` : '提示：滑過看資訊、點擊鎖定海纜'}
          </div>
        </div>
      </div>
  );
};
