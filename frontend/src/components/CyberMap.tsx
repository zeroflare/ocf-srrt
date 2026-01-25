import React, { useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Line,
  Marker
} from 'react-simple-maps';
import { useDnsStore } from '../stores/useDnsStore';
import { scaleLinear } from 'd3-scale';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// 本地資料中心位置 (TW)
const TAIWAN_COORDS: [number, number] = [121, 23.5];

// 常見的 Cloud Region 座標
const countryCoords: Record<string, [number, number]> = {
  'US': [-100, 40], // 美國
  'JP': [138, 36],  // 日本 (GCP Asia-Northeast1)
  'CN': [104, 35],  // 中國
  'HK': [114, 22],  // 香港 (GCP Asia-East2)
  'SG': [103, 1],   // 新加坡 (GCP Asia-Southeast1)
  'KR': [127, 37],  // 韓國
  'IN': [78, 20],   // 印度
  'DE': [10, 51],   // 德國 (GCP Europe-West3)
  'GB': [-2, 54],   // 英國
  'FR': [2, 46],    // 法國
  'NL': [5, 52],    // 荷蘭
  'AU': [133, -25], // 澳洲
  'CA': [-106, 56], // 加拿大
  'BR': [-51, -14], // 巴西
  'ZA': [22, -30],  // 南非
  'RU': [105, 61],  // 俄羅斯
};

export const CyberMap: React.FC = () => {
  const { t } = useTranslation();
  const { records } = useDnsStore();

  // 取得國外連線的彙整數據
  const foreignConnections = useMemo(() => {
    const foreignRecords = records.filter(r => r.is_foreign && r.country !== 'XX');
    const counts: Record<string, { count: number, country: string }> = {};

    foreignRecords.forEach(r => {
      // 簡單彙整：同一國家算一條線，線的粗細代表流量大小
      if (!counts[r.country]) {
        counts[r.country] = { count: 0, country: r.country };
      }
      counts[r.country].count++;
    });

    return Object.values(counts);
  }, [records]);

  const lineScale = scaleLinear().domain([0, 50]).range([1, 4]).clamp(true);

  return (
      <div className="bg-gray-800 rounded-lg shadow-lg p-4 h-[400px] flex flex-col border border-gray-700">
        <h2 className="text-xl font-bold mb-2 text-gray-200 flex items-center">
          <Globe className="mr-2 h-5 w-5 text-blue-400" />
          {t('cyber_map')}
        </h2>

        <div className="flex-1 w-full h-full overflow-hidden bg-gray-900/50 rounded-lg border border-gray-700/50">
          <ComposableMap
              projectionConfig={{
                scale: 160,
                center: [20, 10]
              }}
              style={{ width: "100%", height: "100%" }}
          >
            {/* 1. 底圖層 */}
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                  geographies.map((geo) => (
                      <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill="#1A202C"
                          stroke="#2D3748"
                          strokeWidth={0.5}
                          style={{
                            default: { outline: "none" },
                            hover: { fill: "#2D3748", outline: "none" },
                            pressed: { outline: "none" },
                          }}
                      />
                  ))
              }
            </Geographies>

            {/* 2. 連線層 (Lines) */}
            {foreignConnections.map((conn, i) => {
              const dest = countryCoords[conn.country];
              if (!dest) return null; // 找不到座標就跳過

              return (
                  <React.Fragment key={`line-${i}`}>
                    <Line
                        from={TAIWAN_COORDS}
                        to={dest}
                        stroke="#F56565"
                        strokeWidth={lineScale(conn.count)}
                        strokeOpacity={0.5}
                        strokeLinecap="round"
                    />
                    <Marker coordinates={dest}>
                      <circle r={2 + lineScale(conn.count) / 2} fill="#F56565" fillOpacity={0.8} />
                    </Marker>
                  </React.Fragment>
              );
            })}

            <Marker coordinates={TAIWAN_COORDS}>
              <circle r={4} fill="#4299E1" />
              <circle r={8} fill="none" stroke="#4299E1" strokeWidth={1} opacity={0.5} />
            </Marker>

          </ComposableMap>
        </div>
      </div>
  );
};