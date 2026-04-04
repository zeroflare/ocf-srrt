import maplibregl from 'maplibre-gl';

/**
 * Add cable and traceroute GeoJSON sources to the map.
 */
export const addCableSources = (map: maplibregl.Map, geoJSON: GeoJSON.GeoJSON) => {
  map.addSource('cables', {
    type: 'geojson',
    data: geoJSON,
    generateId: true,
  });

  map.addSource('traceroute', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });
};

/**
 * Add all cable-related layers (base, available, selected, animation).
 */
export const addCableLayers = (map: maplibregl.Map, theme: string = 'dark') => {
  const isDark = theme === 'dark';

  // 0) 透明寬線 — 僅用於擴大 hover / click 判定範圍
  map.addLayer({
    id: 'cables-line-hit',
    type: 'line',
    source: 'cables',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#000000',
      'line-width': 16,
      'line-opacity': 0,
    },
    filter: ['==', ['get', 'hidden'], false],
  });

  // 依 brokenStatus 決定海纜顏色：斷線紅色、部分斷線琥珀色、正常用原色
  const cableColorExpr: maplibregl.ExpressionSpecification = [
    'case',
    ['==', ['get', 'brokenStatus'], 'broken'], '#ef4444',
    ['==', ['get', 'brokenStatus'], 'partial'], '#f59e0b',
    ['get', 'color'],
  ];

  // 1) 全部海纜（更淡）
  map.addLayer({
    id: 'cables-line',
    type: 'line',
    source: 'cables',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': cableColorExpr,
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        3,
        isDark ? 1.5 : 2,
      ],
      'line-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        0.9,
        isDark ? 0.15 : 0.35,
      ],
    },
    filter: ['==', ['get', 'hidden'], false],
  });

  // 2) 強調「可用路徑」（更亮更粗）
  map.addLayer({
    id: 'cables-line-available',
    type: 'line',
    source: 'cables',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': cableColorExpr,
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        5,
        isDark ? 3 : 3.5,
      ],
      'line-opacity': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        1.0,
        isDark ? 0.85 : 1.0,
      ],
    },
    filter: ['all',
      ['==', ['get', 'hidden'], false],
      ['==', ['get', 'isAvailablePath'], true],
    ],
  });

  // 3) 被選取的整條海纜（覆蓋在最上面）
  map.addLayer({
    id: 'cables-line-selected',
    type: 'line',
    source: 'cables',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': cableColorExpr,
      'line-width': 5,
      'line-opacity': 0.95,
    },
    filter: ['all',
      ['==', ['get', 'hidden'], false],
      ['==', ['get', 'cableId'], '___none___'],
    ],
  });

  // (流向動畫改由 CyberMap 的 flowing dot 處理，不再使用 line-animation 圖層)
};

/**
 * Set up cable interaction handlers (hover, click). Returns a cleanup function.
 */
export const setupCableInteractions = (
  map: maplibregl.Map,
  popup: maplibregl.Popup,
  theme: string,
  _toggleCableSelection?: (cableId: string) => void,
  _setSelectedCableId?: (id: string | null) => void,
  labels?: { availablePath?: string },
): (() => void) => {
  const availablePathLabel = labels?.availablePath ?? 'Taiwan Available Route';
  let hoveredFeatureId: string | number | null = null;
  const activeLayers = ['cables-line', 'cables-line-available', 'cables-line-hit'];

  const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
    if (!map) return;
    const features = map.queryRenderedFeatures(e.point, {
      layers: activeLayers
    });
    if (features.length > 0) {
      map.getCanvas().style.cursor = 'pointer';
      const f = features[0];
      if (hoveredFeatureId !== null) {
        map.setFeatureState(
          { source: 'cables', id: hoveredFeatureId },
          { hover: false }
        );
      }
      hoveredFeatureId = f.id as string | number;
      map.setFeatureState(
        { source: 'cables', id: hoveredFeatureId },
        { hover: true }
      );
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const cableName = String(props.cableName ?? props.name ?? 'Unknown');
      const segmentId = String(props.segmentId ?? '');
      const isAvailable = props.isAvailablePath === true;
      const brokenStatus = String(props.brokenStatus ?? 'normal');
      const statusBadge = brokenStatus === 'broken'
        ? `<div class="text-xs mt-1 font-sans text-red-500 font-semibold">⚠ 斷線</div>`
        : brokenStatus === 'partial'
        ? `<div class="text-xs mt-1 font-sans text-amber-500 font-semibold">⚠ 部分斷線</div>`
        : '';
      const content = `
        <div class="p-2 ${theme === 'dark' ? 'bg-gray-900/90 text-white border-gray-700' : 'bg-white/95 text-slate-800 border-slate-200'} rounded shadow-lg border">
          <div class="font-bold ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'} font-sans">${cableName}</div>
          <div class="text-xs mt-1 font-sans ${theme === 'dark' ? 'text-gray-300' : 'text-slate-500'}">Segment: ${segmentId}</div>
          ${isAvailable ? `<div class="text-xs mt-1 font-sans ${theme === 'dark' ? 'text-green-400' : 'text-green-600'} font-semibold">✓ ${availablePathLabel}</div>` : ''}
          ${statusBadge}
        </div>
      `;
      popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    } else {
      handleMouseLeave();
    }
  };

  const handleMouseLeave = () => {
    map.getCanvas().style.cursor = '';
    if (hoveredFeatureId !== null) {
      map.setFeatureState({ source: 'cables', id: hoveredFeatureId }, { hover: false });
    }
    hoveredFeatureId = null;
    popup.remove();
  };

  // 海纜點擊不再鎖定選取，高亮與動畫完全由 DNS 勾選驅動

  map.on('mousemove', handleMouseMove);
  map.on('mouseleave', 'cables-line', handleMouseLeave);
  map.on('mouseleave', 'cables-line-available', handleMouseLeave);
  map.on('mouseleave', 'cables-line-hit', handleMouseLeave);

  return () => {
    map.off('mousemove', handleMouseMove);
    map.off('mouseleave', 'cables-line', handleMouseLeave);
    map.off('mouseleave', 'cables-line-available', handleMouseLeave);
    map.off('mouseleave', 'cables-line-hit', handleMouseLeave);
  };
};
