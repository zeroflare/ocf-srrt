import React, { useMemo } from 'react';
import { Activity, Anchor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Hop } from '../types';
import { isLikelySubmarine, calculateDistance } from '../utils/geo';
import { useCableStore } from '../stores/useCableStore';
import { inferCableForRecord, CableInferenceResult } from '../utils/cableInference';
import { useDnsStore } from '../stores/useDnsStore';

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

  // 為每個海底電纜跳躍推測可能的海纜
  const { cables, brokenCableIds, initialize } = useCableStore();
  // TraceroutePage 可能未經過主頁，需確保海纜資料已載入
  useMemo(() => { if (cables.length === 0) initialize(); }, [cables.length, initialize]);
  const localCountry = useDnsStore(s => s.localCountry) || 'TW';
  const submarineInferences = useMemo(() => {
    const result = new Map<number, CableInferenceResult | null>();
    for (let i = 0; i < hops.length - 1; i++) {
      const hop = hops[i];
      const nextHop = hops[i + 1];
      if (!isLikelySubmarine(hop, nextHop)) continue;

      // 選擇境外 hop 做推測（優先用離台灣較遠的那端）
      const foreignHop = (nextHop.country && nextHop.country !== localCountry) ? nextHop
        : (hop.country && hop.country !== localCountry) ? hop : nextHop;

      if (foreignHop.coords) {
        const pseudoRecord = {
          _id: '', timestamp: '', domain: '', type: '', resultIp: foreignHop.ip,
          isForeign: true, latency: foreignHop.latency ?? 0, sourceIp: '',
          country: foreignHop.country || '', asn: foreignHop.asn ?? 0, isp: foreignHop.isp || '',
          appName: '', appCategory: '',
          longitude: foreignHop.coords[0], latitude: foreignHop.coords[1],
        };
        result.set(i, inferCableForRecord(pseudoRecord, cables, brokenCableIds, localCountry));
      } else {
        result.set(i, null);
      }
    }
    return result;
  }, [hops, cables, brokenCableIds, localCountry]);

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
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'} ${hop.geoConfidence === 'low' ? 'opacity-50' : ''}`}
                      title={hop.geoConfidence === 'low' ? 'GeoIP confidence: low (CDN/Anycast)' : undefined}
                    >
                      {hop.country}{hop.city ? ` · ${hop.city}` : ''}{hop.geoConfidence === 'low' ? '?' : ''}
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
              {hasSubmarineJump && (() => {
                const inference = submarineInferences.get(index);
                const dist = hop.coords && nextHop.coords ? Math.round(calculateDistance(hop.coords, nextHop.coords)) : null;
                const confidenceColor = inference?.confidence === 'high'
                  ? (isDark ? 'text-emerald-400' : 'text-emerald-600')
                  : inference?.confidence === 'medium'
                  ? (isDark ? 'text-amber-400' : 'text-amber-600')
                  : (isDark ? 'text-slate-400' : 'text-slate-500');
                return (
                  <tr>
                    <td colSpan={9} className={`${px} py-1${compact ? '' : '.5'}`}>
                      <div className={`inline-flex items-center gap-2 flex-wrap`}>
                        {inference ? (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 ${isDark ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'bg-purple-50 border-purple-200 text-purple-700'} border rounded-full text-[10px] font-bold tracking-wider`}>
                            <Anchor className="h-3 w-3" />
                            {inference.cableName}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 ${isDark ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-purple-50 border-purple-200 text-purple-600'} border rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse`}>
                            <Activity className="h-3 w-3" />
                            {t('traceroute_submarine')}
                          </span>
                        )}
                        {dist && (
                          <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            ~{dist.toLocaleString()} km
                          </span>
                        )}
                        {inference && (
                          <span className={`text-[9px] font-bold ${confidenceColor}`}>
                            {t(`confidence_${inference.confidence}`)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })()}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};
