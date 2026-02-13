import React from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { useTranslation } from 'react-i18next';
import { Activity, Globe2, BarChart3, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';

export const TrafficDashboard: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const { totalQueries, foreignQueries, records } = useDnsStore();

  const percentageVal = totalQueries > 0 ? (foreignQueries / totalQueries) * 100 : 0;
  const foreignPercentage = percentageVal.toFixed(1);

  // 準備圖表數據：取最近 20 筆記錄的簡單趨勢
  const chartData = records.slice(0, 20).reverse().map((r, i) => ({
    val: r.isForeign ? 10 : 2,
    index: i
  }));

  let statusColor = 'text-green-400';
  let borderColor = 'border-green-500';
  let bgColor = 'from-green-500/10';

  if (percentageVal > 50) {
    statusColor = 'text-red-400';
    borderColor = 'border-red-500';
    bgColor = 'from-red-500/10';
  } else if (percentageVal > 30) {
    statusColor = 'text-orange-400';
    borderColor = 'border-orange-500';
    bgColor = 'from-orange-500/10';
  }

  return (
      <div className={`bg-gray-800 text-white p-4 rounded-lg shadow-lg border border-gray-700 ${className}`}>
        <h2 className="text-xl font-bold mb-4 flex items-center text-gray-200">
          <BarChart3 className="mr-2 h-5 w-5 text-blue-400" />
          {t('dashboard')}
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-700/50 p-4 rounded-lg border-l-4 border-blue-500 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center text-gray-400 text-xs mb-1 uppercase tracking-wider font-semibold">
              <Activity className="h-3 w-3 mr-1" />
              {t('total_queries')}
            </div>
            <p className="text-3xl font-bold font-mono tracking-tight relative z-10">
              {totalQueries.toLocaleString()}
            </p>
          </div>

          <div className={`bg-gray-700/50 p-4 rounded-lg border-l-4 ${borderColor} backdrop-blur-sm transition-all duration-500 relative overflow-hidden group`}>
            <div className={`absolute inset-0 bg-gradient-to-r ${bgColor} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
            <div className="flex items-center text-gray-400 text-xs mb-1 uppercase tracking-wider font-semibold">
              <Globe2 className="h-3 w-3 mr-1" />
              {t('foreign_traffic')}
            </div>
            <p className={`text-3xl font-bold font-mono tracking-tight ${statusColor} relative z-10`}>
              {foreignPercentage}%
            </p>
          </div>
        </div>

        {/* 趨勢小圖表 */}
        <div className="h-16 w-full bg-gray-900/50 rounded p-1 border border-gray-700/50">
          <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-1 px-1">
            <TrendingUp className="h-3 w-3" />
            LIVE TREND (FOREIGN DENSITY)
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 12]} />
              <Area
                type="monotone"
                dataKey="val"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorVal)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
  );
};
