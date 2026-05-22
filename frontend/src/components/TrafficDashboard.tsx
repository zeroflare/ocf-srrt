import React, { useMemo, useRef, useEffect } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

export const TrafficDashboard: React.FC<{ className?: string; expanded?: boolean }> = ({ className, expanded }) => {
  const { t } = useTranslation();
  const { totalQueries, records } = useDnsStore();

  // 分母只計算有 GeoIP country 資料的記錄，排除私有 IP 或查不到地理位置的項目
  const knownCountryTotal = useMemo(() => records.filter(r => !!r.country).length, [records]);
  const knownCountryForeign = useMemo(() => records.filter(r => !!r.country && r.isForeign).length, [records]);
  const percentageVal = knownCountryTotal > 0 ? (knownCountryForeign / knownCountryTotal) * 100 : 0;
  const foreignPercentage = percentageVal.toFixed(1);

  // Track previous foreign percentage for trend calculation
  const prevPercentageRef = useRef(percentageVal);

  // Calculate recent 30s foreign percentage (same denominator: known country only)
  const recentForeignPct = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 30_000;
    const recent = records.filter(r => !!r.country && new Date(r.timestamp).getTime() > cutoff);
    if (recent.length === 0) return 0;
    const recentForeign = recent.filter(r => r.isForeign).length;
    return (recentForeign / recent.length) * 100;
  }, [records]);

  // Trend: compare current overall % with recent 30s %
  const trend = useMemo(() => {
    const diff = percentageVal - recentForeignPct;
    if (Math.abs(diff) < 1) return 'stable';
    return diff > 0 ? 'up' : 'down';
  }, [percentageVal, recentForeignPct]);

  // Burst detection: >20 queries in 10 seconds
  const burstAlert = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 10_000;
    const recentCount = records.filter(r => new Date(r.timestamp).getTime() > cutoff).length;
    return recentCount > 20 ? recentCount : 0;
  }, [records]);

  useEffect(() => {
    prevPercentageRef.current = percentageVal;
  }, [percentageVal]);

  return (
      <div className={`${className}`}>
        {/* Burst Alert */}
        {burstAlert > 0 && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg animate-pulse">
            <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
            <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
              {t('burst_alert', { count: burstAlert })}
            </span>
          </div>
        )}
        <div className={`grid grid-cols-2 ${expanded ? 'gap-6' : 'gap-4'}`}>
          <div className={`bg-slate-100 dark:bg-slate-950/50 ${expanded ? 'p-6' : 'p-4'} rounded-lg border border-slate-200 dark:border-slate-800 backdrop-blur-sm relative overflow-hidden group transition-colors`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                {t('total_queries')}
              </div>
              <Tooltip text={t('tip_total_queries')} />
            </div>
            <p className={`${expanded ? 'text-5xl' : 'text-3xl'} font-bold font-mono tracking-tight relative z-10 text-slate-800 dark:text-slate-100`}>
              {totalQueries.toLocaleString()}
            </p>
          </div>
          <div className={`bg-slate-100 dark:bg-slate-950/50 ${expanded ? 'p-6' : 'p-4'} rounded-lg border border-slate-200 dark:border-slate-800 backdrop-blur-sm relative overflow-hidden group transition-colors`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                {t('foreign_traffic')}
              </div>
              <Tooltip text={t('tip_foreign_traffic')} />
            </div>
            <div className="flex items-baseline gap-2">
              <p className={`${expanded ? 'text-5xl' : 'text-3xl'} font-bold font-mono tracking-tight relative z-10 ${
                percentageVal > 50 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {foreignPercentage}%
              </p>
              {totalQueries > 0 && (
                <span className={`flex items-center gap-0.5 text-xs font-bold ${
                  trend === 'up' ? 'text-red-500 dark:text-red-400' :
                  trend === 'down' ? 'text-emerald-500 dark:text-emerald-400' :
                  'text-slate-400 dark:text-slate-500'
                }`}>
                  {trend === 'up' && <TrendingUp className="h-3.5 w-3.5" />}
                  {trend === 'down' && <TrendingDown className="h-3.5 w-3.5" />}
                  {trend === 'stable' && <Minus className="h-3.5 w-3.5" />}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
  );
};
