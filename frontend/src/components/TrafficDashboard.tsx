import React from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { useTranslation } from 'react-i18next';
import { Activity, Globe2, BarChart3 } from 'lucide-react';

export const TrafficDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { totalQueries, foreignQueries } = useDnsStore();

  const percentageVal = totalQueries > 0 ? (foreignQueries / totalQueries) * 100 : 0;
  const foreignPercentage = percentageVal.toFixed(1);

  // 設定警戒閾值
  // < 30% 綠色 (健康)
  // 30% - 50% 橘色 (注意)
  // > 50% 紅色 (高度依賴跨境，風險高)
  let statusColor = 'text-green-400';
  let borderColor = 'border-green-500';

  if (percentageVal > 50) {
    statusColor = 'text-red-400';
    borderColor = 'border-red-500';
  } else if (percentageVal > 30) {
    statusColor = 'text-orange-400';
    borderColor = 'border-orange-500';
  }

  return (
      <div className="bg-gray-800 text-white p-4 rounded-lg shadow-lg border border-gray-700">
        <h2 className="text-xl font-bold mb-4 flex items-center text-gray-200">
          <BarChart3 className="mr-2 h-5 w-5 text-blue-400" />
          {t('dashboard')}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-700/50 p-4 rounded-lg border-l-4 border-blue-500 backdrop-blur-sm">
            <div className="flex items-center text-gray-400 text-xs mb-1 uppercase tracking-wider font-semibold">
              <Activity className="h-3 w-3 mr-1" />
              {t('total_queries')}
            </div>
            <p className="text-3xl font-bold font-mono tracking-tight">
              {totalQueries.toLocaleString()}
            </p>
          </div>

          <div className={`bg-gray-700/50 p-4 rounded-lg border-l-4 ${borderColor} backdrop-blur-sm transition-colors duration-500`}>
            <div className="flex items-center text-gray-400 text-xs mb-1 uppercase tracking-wider font-semibold">
              <Globe2 className="h-3 w-3 mr-1" />
              {t('foreign_traffic')}
            </div>
            <p className={`text-3xl font-bold font-mono tracking-tight ${statusColor}`}>
              {foreignPercentage}%
            </p>
          </div>
        </div>
      </div>
  );
};