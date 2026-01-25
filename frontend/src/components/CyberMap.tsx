import React, { useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Line,
  Marker,
  ZoomableGroup
} from 'react-simple-maps';
import { useDnsStore } from '../stores/useDnsStore';
import { scaleLinear } from 'd3-scale';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

// 使用較為詳細的 TopoJSON
const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// 台灣中心點
const TAIWAN_COORDS: [number, number] = [121, 23.5];

// [SRE] 擴充後的國家座標庫 (ISO 3166-1 alpha-2)
// 包含常見的亞洲、歐美、澳洲等區域，避免 Unknown 導致不畫線
const countryCoords: Record<string, [number, number]> = {
  // Asia
  'TW': [121, 23.5], 'CN': [104.1, 35.8], 'JP': [138.2, 36.2], 'KR': [127.7, 35.9],
  'HK': [114.1, 22.3], 'SG': [103.8, 1.35], 'IN': [78.9, 20.5], 'ID': [113.9, -0.7],
  'TH': [100.9, 15.8], 'VN': [108.2, 14.0], 'MY': [101.9, 4.2], 'PH': [121.7, 12.8],

  // Americas
  'US': [-95.7, 37.0], 'CA': [-106.3, 56.1], 'BR': [-51.9, -14.2], 'MX': [-102.5, 23.6],
  'AR': [-63.6, -38.4], 'CL': [-71.5, -35.6],

  // Europe
  'GB': [-3.4, 55.3], 'DE': [10.4, 51.1], 'FR': [2.2, 46.2], 'NL': [5.2, 52.1],
  'IT': [12.5, 41.8], 'ES': [-3.7, 40.4], 'RU': [105.3, 61.5], 'UA': [31.1, 48.3],
  'PL': [19.1, 51.9], 'SE': [18.6, 60.1], 'NO': [8.4, 60.4], 'FI': [25.7, 61.9],
  'IE': [-8.2, 53.4], 'CH': [8.2, 46.8], 'AT': [14.5, 47.5], 'BE': [4.4, 50.5],

  // Oceania
  'AU': [133.7, -25.2], 'NZ': [174.8, -40.9],

  // Others
  'ZA': [22.9, -30.5], 'EG': [30.8, 26.8], 'TR': [35.2, 38.9], 'IL': [34.8, 31.0],
  'SA': [45.0, 23.8], 'AE': [53.8, 23.4]
};

export const CyberMap: React.FC = () => {
  const { t } = useTranslation();
  const { records } = useDnsStore();

  const foreignConnections = useMemo(() => {
    // 排除本地 (TW) 和未知的 (XX)
    const foreignRecords = records.filter(r => r.isForeign && r.country !== 'XX' && r.country !== 'TW');
    const counts: Record<string, { count: number, country: string }> = {};

    foreignRecords.forEach(r => {
      // 容錯：如果該國家不在座標庫，暫時對應到 US 或忽略
      // 這裡選擇忽略，避免畫錯
      if (countryCoords[r.country]) {
        if (!counts[r.country]) {
          counts[r.country] = { count: 0, country: r.country };
        }
        counts[r.country].count++;
      }
    });

    return Object.values(counts);
  }, [records]);

  // 調整線條粗細比例，讓它細緻一點
  const lineScale = scaleLinear().domain([0, 50]).range([0.5, 2]).clamp(true);

  return (
      <div className="bg-gray-800 rounded-lg shadow-lg p-4 h-[400px] flex flex-col border border-gray-700">
        <h2 className="text-xl font-bold mb-2 text-gray-200 flex items-center">
          <Globe className="mr-2 h-5 w-5 text-blue-400" />
          {t('cyber_map')}
        </h2>

        <div className="flex-1 w-full h-full overflow-hidden bg-gray-900/50 rounded-lg border border-gray-700/50 relative">
          <ComposableMap
              // [SRE] 改用 Mercator 投影，看起來比較像一般的地圖
              projection="geoMercator"
              projectionConfig={{
                scale: 100, // 縮放比例
                center: [0, 20] // 中心點設在赤道北方一點，讓亞洲和美洲比較平衡
              }}
              style={{ width: "100%", height: "100%", background: "#0f172a" }}
          >
            <ZoomableGroup zoom={1}>
              {/* 1. 地圖底層 */}
              <Geographies geography={geoUrl}>
                {({ geographies }) =>
                    geographies.map((geo) => (
                        <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill="#1e293b" // slate-800
                            stroke="#334155" // slate-700
                            strokeWidth={0.5}
                            style={{
                              default: { outline: "none" },
                              hover: { fill: "#334155", outline: "none" },
                              pressed: { outline: "none" },
                            }}
                        />
                    ))
                }
              </Geographies>

              {/* 2. 連線層 */}
              {foreignConnections.map((conn, i) => {
                const dest = countryCoords[conn.country];

                return (
                    <React.Fragment key={`line-${i}`}>
                      <Line
                          from={TAIWAN_COORDS}
                          to={dest}
                          stroke="#ef4444" // red-500
                          strokeWidth={lineScale(conn.count)}
                          strokeOpacity={0.6}
                          // 這裡不設 curve，讓 Mercator 投影自己決定最短路徑，通常會是自然的弧線
                      />
                      {/* 目標點的光暈效果 */}
                      <Marker coordinates={dest}>
                        <circle r={2} fill="#f87171" />
                        <circle r={6} fill="none" stroke="#f87171" strokeOpacity={0.5}>
                          <animate attributeName="r" from="2" to="8" dur="1.5s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="1" to="0" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                      </Marker>
                    </React.Fragment>
                );
              })}

              {/* 3. 台灣中心點 (雷達波紋效果) */}
              <Marker coordinates={TAIWAN_COORDS}>
                <circle r={3} fill="#60a5fa" /> {/* blue-400 */}
                <circle r={8} fill="none" stroke="#60a5fa" strokeWidth={1} opacity={0.5}>
                  <animate attributeName="r" from="3" to="12" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              </Marker>
            </ZoomableGroup>
          </ComposableMap>
        </div>
      </div>
  );
};