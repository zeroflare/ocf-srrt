import React, { useState, useMemo } from 'react';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { useDnsStore } from '../stores/useDnsStore';
import { Activity, Zap, ExternalLink, Share2, Check } from 'lucide-react';
import { isLikelySubmarine } from '../utils/geo';
import { useTranslation } from 'react-i18next';
import { buildTracerouteShareUrl, buildTracerouteRunUrl } from '../utils/tracerouteShare';
import { Hop } from '../types';

const LatencyBar: React.FC<{ hop: Hop; maxLatency: number }> = ({ hop, maxLatency }) => {
  const avg = hop.latency;
  if (hop.ip === '*' || avg === 0) return <span className="text-slate-500 dark:text-slate-600">—</span>;

  const pct = maxLatency > 0 ? Math.min((avg / maxLatency) * 100, 100) : 0;
  const color = avg < 50 ? 'bg-emerald-500' : avg < 150 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
    </div>
  );
};

const RttCell: React.FC<{ value?: number }> = ({ value }) => {
  if (value === undefined) return <span className="text-slate-400 dark:text-slate-600">*</span>;
  const color = value < 50 ? 'text-emerald-600 dark:text-emerald-400' : value < 150 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-500';
  return <span className={`font-mono ${color}`}>{value.toFixed(1)}</span>;
};

export const TracerouteDrawer: React.FC = () => {
  const { t } = useTranslation();
  const { activeResult, isLoading, error } = useTracerouteStore();
  const { theme, token } = useDnsStore();
  const [copied, setCopied] = useState(false);

  const maxLatency = useMemo(() => {
    if (!activeResult) return 0;
    return Math.max(...activeResult.hops.filter(h => h.ip !== '*').map(h => h.latency), 1);
  }, [activeResult]);

  const handleOpenNewPage = () => {
    if (!activeResult) return;
    const url = buildTracerouteRunUrl(activeResult.target, token || '');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyShare = () => {
    if (!activeResult) return;
    const url = buildTracerouteShareUrl(activeResult);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isDark = theme === 'dark';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-3 border-b ${isDark ? 'border-white/5' : 'border-slate-100'} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-1.5 flex-shrink-0 ${isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'} rounded-lg`}>
            <Activity className={`h-4 w-4 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          </div>
          <div className="min-w-0">
            <h2 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'} uppercase tracking-tight`}>{t('traceroute_title')}</h2>
            <p className={`text-[10px] font-mono ${isDark ? 'text-cyan-400' : 'text-cyan-600'} uppercase tracking-widest truncate`}>
              {activeResult ? t('traceroute_target', { ip: activeResult.target }) : (isLoading ? t('traceroute_probing') : t('traceroute_na'))}
            </p>
          </div>
        </div>

        {activeResult && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleCopyShare}
              title={t('traceroute_copy_share')}
              className={`p-1.5 rounded-lg border text-xs transition-all ${
                copied
                  ? isDark ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-600'
                  : isDark ? 'bg-slate-800 border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40' : 'bg-white border-slate-200 text-slate-500 hover:text-cyan-600 hover:border-cyan-300'
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={handleOpenNewPage}
              title={t('traceroute_open_new_tab')}
              className={`p-1.5 rounded-lg border text-xs transition-all ${isDark ? 'bg-slate-800 border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40' : 'bg-white border-slate-200 text-slate-500 hover:text-cyan-600 hover:border-cyan-300'}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <div className={`w-16 h-16 border-4 ${isDark ? 'border-cyan-500/20' : 'border-cyan-100'} rounded-full`}></div>
              <div className="w-16 h-16 border-4 border-t-cyan-500 dark:border-t-cyan-400 rounded-full animate-spin absolute top-0 left-0"></div>
            </div>
            <p className="text-cyan-600 dark:text-cyan-400 font-mono text-xs animate-pulse uppercase tracking-[0.2em]">{t('traceroute_intercepting')}</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center text-rose-500 space-y-4">
            <Zap className="h-12 w-12 animate-bounce" />
            <p className="font-mono text-sm uppercase">{error}</p>
          </div>
        ) : !activeResult ? (
          <div className="h-full flex flex-col items-center justify-center space-y-3 text-slate-400 dark:text-slate-600">
            <Activity className="h-10 w-10 opacity-30" />
            <p className="text-xs font-bold uppercase tracking-wider">{t('traceroute_no_data')}</p>
            <p className="text-[10px] opacity-60">{t('traceroute_no_data_hint')}</p>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
              <tr>
                <th className="px-3 py-2.5 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 w-8">#</th>
                <th className="px-3 py-2.5 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">IP</th>
                <th className="px-3 py-2.5 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">ASN/ISP</th>
                <th className="px-3 py-2.5 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 w-12"></th>
                <th className="px-3 py-2.5 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">{t('traceroute_latency')}</th>
                <th className="px-3 py-2.5 text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 whitespace-nowrap">RTT 1</th>
                <th className="px-3 py-2.5 text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 whitespace-nowrap">RTT 2</th>
                <th className="px-3 py-2.5 text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 whitespace-nowrap">RTT 3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {activeResult.hops.map((hop, index) => {
                const nextHop = activeResult.hops[index + 1];
                const hasSubmarineJump = nextHop && isLikelySubmarine(hop, nextHop);
                const isStar = hop.ip === '*';
                const rtts = hop.rtts || [];

                return (
                  <React.Fragment key={index}>
                    <tr className={`group transition-colors ${isStar ? 'opacity-40' : 'hover:bg-cyan-500/5'}`}>
                      <td className="px-3 py-2 font-mono font-bold text-slate-400 dark:text-slate-500">{hop.index}</td>
                      <td className="px-3 py-2">
                        {isStar ? (
                          <span className="text-slate-500 dark:text-slate-600 font-mono">*</span>
                        ) : (
                          <div>
                            <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold">{hop.ip}</span>
                            {hop.host && hop.host !== hop.ip && (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[180px]">{hop.host}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {!isStar && hop.asn ? (
                          <div className="max-w-[120px]">
                            <span className="text-[10px] text-slate-400 dark:text-slate-600 block">AS{hop.asn}</span>
                            <span className="text-slate-500 dark:text-slate-400 truncate block text-[10px]">{hop.isp}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {!isStar && hop.country && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                            {hop.country}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <LatencyBar hop={hop} maxLatency={maxLatency} />
                      </td>
                      <td className="px-3 py-2 text-right text-[10px]"><RttCell value={rtts[0]} /></td>
                      <td className="px-3 py-2 text-right text-[10px]"><RttCell value={rtts[1]} /></td>
                      <td className="px-3 py-2 text-right text-[10px]"><RttCell value={rtts[2]} /></td>
                    </tr>
                    {hasSubmarineJump && (
                      <tr>
                        <td colSpan={8} className="px-3 py-1">
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
        )}
      </div>

      {/* Footer */}
      <div className={`px-5 py-3 ${isDark ? 'bg-slate-950/50' : 'bg-slate-50'} border-t ${isDark ? 'border-white/5' : 'border-slate-100'} flex items-center justify-between transition-colors`}>
        <div className="text-[9px] text-slate-500 font-mono uppercase tracking-[0.2em]">
          {t('traceroute_status', { status: activeResult?.status || (isLoading ? t('traceroute_status_loading') : t('traceroute_status_ready')) })}
        </div>
        <div className="text-[9px] text-slate-600">
          {activeResult?.time ? new Date(activeResult.time).toLocaleString() : ''}
        </div>
      </div>
    </div>
  );
};
