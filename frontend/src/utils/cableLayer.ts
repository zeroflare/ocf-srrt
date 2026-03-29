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

  // 1) 全部海纜（更淡）
  map.addLayer({
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
      'line-color': ['get', 'color'],
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
  map.addLayer({
    id: 'cables-line-animation',
    type: 'line',
    source: 'cables',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': isDark ? '#ffffff' : '#0e7490',
      'line-width': 2,
      'line-opacity': isDark ? 0.8 : 0.6,
      'line-dasharray': [2, 4],
    },
    filter: ['all',
      ['==', ['get', 'hidden'], false],
      ['==', ['get', 'cableId'], '___none___'],
    ],
  });

  // Traceroute dash animation
  let tracerouteDashOffset = 0;
  const animateTraceroute = () => {
    if (!map.getLayer('trace-lines')) return;
    tracerouteDashOffset = (tracerouteDashOffset + 0.1) % 6;
    map.setPaintProperty('trace-lines', 'line-dasharray', [2, 4, tracerouteDashOffset, 0]);
    requestAnimationFrame(animateTraceroute);
  };
  animateTraceroute();
};

/**
 * Set up cable interaction handlers (hover, click). Returns a cleanup function.
 */
export const setupCableInteractions = (
  map: maplibregl.Map,
  popup: maplibregl.Popup,
  theme: string,
  toggleCableSelection: (cableId: string) => void,
  setSelectedCableId: (id: string | null) => void,
  labels?: { availablePath?: string; clickToSelect?: string },
): (() => void) => {
  const availablePathLabel = labels?.availablePath ?? 'Taiwan Available Route';
  const clickToSelectLabel = labels?.clickToSelect ?? 'Click to select cable';
  let hoveredFeatureId: string | number | null = null;
  const activeLayers = ['cables-line', 'cables-line-available'];

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
      const content = `
        <div class="p-2 ${theme === 'dark' ? 'bg-gray-900/90 text-white border-gray-700' : 'bg-white/95 text-slate-800 border-slate-200'} rounded shadow-lg border">
          <div class="font-bold ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'} font-sans">${cableName}</div>
          <div class="text-xs mt-1 font-sans ${theme === 'dark' ? 'text-gray-300' : 'text-slate-500'}">Segment: ${segmentId}</div>
          ${isAvailable ? `<div class="text-xs mt-1 font-sans ${theme === 'dark' ? 'text-green-400' : 'text-green-600'} font-semibold">✓ ${availablePathLabel}</div>` : ''}
          <div class="text-xs mt-1 font-sans ${theme === 'dark' ? 'text-gray-400' : 'text-slate-400'}">${clickToSelectLabel}</div>
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

  const handleClick = (e: any) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const cableId = String(props.cableId ?? '');
    toggleCableSelection(cableId);
  };

  const handleEmptyClick = (e: maplibregl.MapMouseEvent) => {
    const features = map.queryRenderedFeatures(e.point, { layers: activeLayers });
    if (features.length === 0) setSelectedCableId(null);
  };

  map.on('mousemove', handleMouseMove);
  map.on('mouseleave', 'cables-line', handleMouseLeave);
  map.on('mouseleave', 'cables-line-available', handleMouseLeave);
  map.on('click', 'cables-line', handleClick);
  map.on('click', 'cables-line-available', handleClick);
  map.on('click', handleEmptyClick);

  return () => {
    map.off('mousemove', handleMouseMove);
    map.off('mouseleave', 'cables-line', handleMouseLeave);
    map.off('mouseleave', 'cables-line-available', handleMouseLeave);
    map.off('click', 'cables-line', handleClick);
    map.off('click', 'cables-line-available', handleClick);
    map.off('click', handleEmptyClick);
  };
};
