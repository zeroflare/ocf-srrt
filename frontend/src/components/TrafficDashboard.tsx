import React from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { useTranslation } from 'react-i18next';

export const TrafficDashboard: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const { totalQueries, foreignQueries } = useDnsStore();

  const percentageVal = totalQueries > 0 ? (foreignQueries / totalQueries) * 100 : 0;
  const foreignPercentage = percentageVal.toFixed(1);

  return (
      <div className={`${className}`}>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 backdrop-blur-sm relative overflow-hidden group">
            <div className="flex items-center text-slate-400 text-[10px] mb-2 uppercase tracking-widest font-bold">
              {t('total_queries')}
            </div>
            <p className="text-3xl font-bold font-mono tracking-tight relative z-10 text-slate-100">
              {totalQueries.toLocaleString()}
            </p>
          </div>

          <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 backdrop-blur-sm relative overflow-hidden group">
            <div className="flex items-center text-slate-400 text-[10px] mb-2 uppercase tracking-widest font-bold">
              跨境流量 %
            </div>
            <p className={`text-3xl font-bold font-mono tracking-tight text-emerald-400 relative z-10`}>
              {foreignPercentage}%
            </p>
          </div>
        </div>
      </div>
  );
};
