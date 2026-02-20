import React, { useMemo } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell } from 'recharts';
import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';

export const LiveTrafficChart: React.FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation();
  const { records, theme } = useDnsStore();

  const chartData = useMemo(() => {
    const now = Date.now();
    const last15Points = Array.from({ length: 15 }, (_, i) => {
      const time = now - (14 - i) * 2000;
      return {
        time,
        qps: 0,
      };
    });

    records.forEach(record => {
      const recordTime = new Date(record.timestamp).getTime();
      const diffSeconds = Math.floor((now - recordTime) / 2000);
      if (diffSeconds >= 0 && diffSeconds < 15) {
        last15Points[14 - diffSeconds].qps += 1;
      }
    });

    return last15Points;
  }, [records]);

  const currentQps = chartData[chartData.length - 1].qps;
  const peakQps = Math.max(...chartData.map(d => d.qps), 10);

  return (
    <div className={`bg-slate-50 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col p-4 transition-colors ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-sans font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
            {t('realtime_traffic')}
          </span>
          <Tooltip text={t('tip_realtime_traffic')} />
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-24 w-full relative mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis hide dataKey="time" />
            <YAxis hide domain={[0, peakQps * 1.2]} />
            <Bar dataKey="qps" radius={[2, 2, 0, 0]}>
              {chartData.map((_, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={index === chartData.length - 1 ? '#0891b2' : (theme === 'dark' ? '#1e293b' : '#cbd5e1')}
                  className={index === chartData.length - 1 ? 'drop-shadow-[0_0_4px_rgba(8,145,178,0.5)] dark:drop-shadow-[0_0_8px_#22d3ee]' : ''}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Footer Stats */}
      <div className="flex justify-between items-center font-mono text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter transition-colors">
        <div className="flex items-baseline gap-1">
          <span className="text-slate-700 dark:text-slate-200">{currentQps}</span>
          <span>REQ/S</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span>Peak:</span>
          <span className="text-slate-700 dark:text-slate-200">{peakQps}</span>
        </div>
      </div>
    </div>
  );
};
