import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Hop } from '../types';
import { isLikelySubmarine } from '../utils/geo';

const LatencyBar: React.FC<{ hop: Hop; maxLatency: number }> = ({ hop, maxLatency }) => {
  const avg = hop.latency;
  if (hop.ip === '*' || avg === 0) return <span className="text-slate-500 dark:text-slate-600">—</span>;

  const pct = maxLatency > 0 ? Math.min((avg / maxLatency) * 100, 100) : 0;
  const color = avg < 50 ? 'bg-emerald-500' : avg < 150 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <span className={`font-mono text-[10px] font-bold min-w-[42px] text-right ${
        avg < 50 ? 'text-emerald-600 dark:text-emerald-400' : avg < 150 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-500'
      }`}>{avg.toFixed(1)}</span>
    </div>
  );
};

const MsCell: React.FC<{ value: number; isStar?: boolean }> = ({ value, isStar }) => {
  if (isStar || value === 0) return <span className="text-slate-400 dark:text-slate-600">—</span>;
  const color = value < 50 ? 'text-emerald-600 dark:text-emerald-400' : value < 150 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-500';
  return <span className={`font-mono ${color}`}>{value.toFixed(1)}</span>;
};

interface HopTableProps {
  hops: Hop[];
  compact?: boolean; // Drawer 用的緊湊模式
  isDark?: boolean;
}

export const HopTable: React.FC<HopTableProps> = ({ hops, compact = false, isDark = false }) => {
  const { t } = useTranslation();

  const maxLatency = useMemo(() => {
    return Math.max(...hops.filter(h => h.ip !== '*').map(h => h.latency), 1);
  }, [hops]);

  const px = compact ? 'px-3' : 'px-4';
  const py = compact ? 'py-2' : 'py-2.5';
  const hPy = compact ? 'py-2.5' : 'py-3';

  return (
    <table className="w-full text-[11px]">
      <thead className={compact ? `sticky top-0 z-10 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}` : (isDark ? 'bg-slate-900' : 'bg-slate-50')}>
        <tr>
          <th className={`${px} ${hPy} text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 w-8`}>#</th>
          <th className={`${px} ${hPy} text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5`}>IP</th>
          <th className={`${px} ${hPy} text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5`}>ASN/ISP</th>
          <th className={`${px} ${hPy} text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 w-12`}></th>
          <th className={`${px} ${hPy} text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 whitespace-nowrap`}>Loss%</th>
          <th className={`${px} ${hPy} text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5`}>{t('traceroute_latency')}</th>
          <th className={`${px} ${hPy} text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 whitespace-nowrap`}>Best</th>
          <th className={`${px} ${hPy} text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 whitespace-nowrap`}>Worst</th>
          <th className={`${px} ${hPy} text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 whitespace-nowrap`}>StDev</th>
        </tr>
      </thead>
      <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-100'}`}>
        {hops.map((hop, index) => {
          const nextHop = hops[index + 1];
          const hasSubmarineJump = nextHop && isLikelySubmarine(hop, nextHop);
          const isStar = hop.ip === '*';

          return (
            <React.Fragment key={index}>
              <tr className={`group transition-colors ${isStar ? 'opacity-40' : 'hover:bg-cyan-500/5'}`}>
                <td className={`${px} ${py} font-mono font-bold text-slate-400 dark:text-slate-500`}>{hop.index}</td>
                <td className={`${px} ${py}`}>
                  {isStar ? (
                    <span className="text-slate-500 dark:text-slate-600 font-mono">*</span>
                  ) : (
                    <div>
                      <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold">{hop.ip}</span>
                      {hop.host && hop.host !== hop.ip && (
                        <div className={`text-[10px] text-slate-400 dark:text-slate-500 truncate ${compact ? 'max-w-[180px]' : 'max-w-[220px]'}`}>{hop.host}</div>
                      )}
                    </div>
                  )}
                </td>
                <td className={`${px} ${py}`}>
                  {!isStar && hop.asn ? (
                    <div className={compact ? 'max-w-[120px]' : 'max-w-[160px]'}>
                      <span className="text-[10px] text-slate-400 dark:text-slate-600 block">AS{hop.asn}</span>
                      <span className="text-slate-500 dark:text-slate-400 truncate block text-[10px]">{hop.isp}</span>
                    </div>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-600">—</span>
                  )}
                </td>
                <td className={`${px} ${py}`}>
                  {!isStar && hop.country && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                      {hop.country}
                    </span>
                  )}
                </td>
                <td className={`${px} ${py}`}>
                  {isStar ? (
                    <span className="text-slate-400 dark:text-slate-600">—</span>
                  ) : hop.loss > 0 ? (
                    <span className="font-mono font-bold text-rose-500">{hop.loss.toFixed(1)}%</span>
                  ) : (
                    <span className="font-mono text-slate-400 dark:text-slate-600">0%</span>
                  )}
                </td>
                <td className={`${px} ${py}`}>
                  <LatencyBar hop={hop} maxLatency={maxLatency} />
                </td>
                <td className={`${px} ${py} text-right text-[10px]`}><MsCell value={hop.best} isStar={isStar} /></td>
                <td className={`${px} ${py} text-right text-[10px]`}><MsCell value={hop.worst} isStar={isStar} /></td>
                <td className={`${px} ${py} text-right text-[10px]`}><MsCell value={hop.stdev} isStar={isStar} /></td>
              </tr>
              {hasSubmarineJump && (
                <tr>
                  <td colSpan={9} className={`${px} py-1${compact ? '' : '.5'}`}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 ${isDark ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-purple-50 border-purple-200 text-purple-600'} border rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse`}>
                      <Activity className="h-3 w-3" />
                      {t('traceroute_submarine')}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};
