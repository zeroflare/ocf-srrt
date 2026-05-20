import React, { useMemo } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDnsStore } from '../stores/useDnsStore';
import { CyberMap } from './CyberMap';
import { ErrorBoundary } from './ErrorBoundary';

const StatCard: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex min-h-[8rem] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/50 lg:h-full lg:min-h-0">
    <div className="shrink-0 border-b border-slate-300 bg-slate-50/90 px-3 py-2 text-center dark:border-slate-600 dark:bg-slate-800/40">
      <span className="wf-card-title font-semibold text-slate-800 dark:text-slate-100">{label}</span>
    </div>
    <div className="flex min-h-[4.5rem] flex-1 items-center justify-center px-3 py-4">
      <span className="text-2xl font-bold tabular-nums leading-none text-slate-900 dark:text-white sm:text-3xl">{value}</span>
    </div>
  </div>
);

export const MapSection: React.FC = () => {
  const { t } = useTranslation();
  const { records, totalQueries, foreignQueries } = useDnsStore();

  const foreignPct = totalQueries > 0 ? ((foreignQueries / totalQueries) * 100).toFixed(1) : '0.0';
  const uniqueDomains = useMemo(() => new Set(records.map(r => r.domain).filter(Boolean)).size, [records]);

  return (
    <div id="wf-tour-step3" className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:items-stretch lg:gap-4 lg:min-h-0">
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/50 lg:col-span-3 tour-map">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-300/80 px-4 py-2.5 dark:border-slate-600/50">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="wf-card-title font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">{t('cyber_map')}</span>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {records.length} {t('live_queries')}
          </span>
        </div>
        <div className="relative h-[55vh] min-h-[420px] max-h-[680px] w-full">
          <ErrorBoundary>
            <CyberMap />
          </ErrorBoundary>
        </div>
      </div>

      <aside className="grid min-h-0 grid-cols-1 gap-3 lg:col-span-1 lg:h-full lg:grid-rows-3 lg:gap-3">
        <StatCard label={t('stat_queries')} value={totalQueries.toLocaleString()} />
        <StatCard label={t('stat_foreign')} value={`${foreignPct}%`} />
        <StatCard label={t('stat_unique_domains')} value={uniqueDomains.toLocaleString()} />
      </aside>
    </div>
  );
};
