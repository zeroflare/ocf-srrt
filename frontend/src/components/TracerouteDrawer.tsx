import React, { useState } from 'react';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { useDnsStore } from '../stores/useDnsStore';
import { Activity, MapPin, Globe, Zap, ExternalLink, Share2, Check } from 'lucide-react';
import { isLikelySubmarine } from '../utils/geo';
import { useTranslation } from 'react-i18next';
import { buildTracerouteShareUrl, buildTracerouteRunUrl } from '../utils/tracerouteShare';

export const TracerouteDrawer: React.FC = () => {
  const { t } = useTranslation();
  const { activeResult, isLoading, error } = useTracerouteStore();
  const { theme, token } = useDnsStore();
  const [copied, setCopied] = useState(false);

  const handleOpenNewPage = () => {
    if (!activeResult) return;
    const url = activeResult
      ? buildTracerouteRunUrl(activeResult.target, token || '')
      : '';
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-3 border-b ${theme === 'dark' ? 'border-white/5' : 'border-slate-100'} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-1.5 flex-shrink-0 ${theme === 'dark' ? 'bg-cyan-500/20' : 'bg-cyan-100'} rounded-lg`}>
            <Activity className={`h-4 w-4 ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`} />
          </div>
          <div className="min-w-0">
            <h2 className={`text-sm font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'} uppercase tracking-tight`}>{t('traceroute_title')}</h2>
            <p className={`text-[10px] font-mono ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'} uppercase tracking-widest truncate`}>
              {activeResult ? t('traceroute_target', { ip: activeResult.target }) : (isLoading ? t('traceroute_probing') : t('traceroute_na'))}
            </p>
          </div>
        </div>

        {/* 操作按鈕（有結果時才顯示） */}
        {activeResult && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleCopyShare}
              title={t('traceroute_copy_share')}
              className={`p-1.5 rounded-lg border text-xs transition-all ${
                copied
                  ? theme === 'dark' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-600'
                  : theme === 'dark' ? 'bg-slate-800 border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40' : 'bg-white border-slate-200 text-slate-500 hover:text-cyan-600 hover:border-cyan-300'
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={handleOpenNewPage}
              title={t('traceroute_open_new_tab')}
              className={`p-1.5 rounded-lg border text-xs transition-all ${theme === 'dark' ? 'bg-slate-800 border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40' : 'bg-white border-slate-200 text-slate-500 hover:text-cyan-600 hover:border-cyan-300'}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <div className={`w-16 h-16 border-4 ${theme === 'dark' ? 'border-cyan-500/20' : 'border-cyan-100'} rounded-full`}></div>
                <div className={`w-16 h-16 border-4 border-t-cyan-500 dark:border-t-cyan-400 rounded-full animate-spin absolute top-0 left-0`}></div>
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
            <div className="relative">
              {/* Vertical Line */}
              <div className={`absolute left-[15px] top-2 bottom-2 w-0.5 ${theme === 'dark' ? 'bg-gradient-to-b from-cyan-500/50 via-purple-500/50 to-emerald-500/50' : 'bg-slate-200'}`}></div>

              <div className="space-y-8">
                {activeResult?.hops.map((hop, index) => {
                  const nextHop = activeResult.hops[index + 1];
                  const hasSubmarineJump = nextHop && isLikelySubmarine(hop, nextHop);
                  
                  return (
                    <React.Fragment key={index}>
                      <div className="relative pl-10 group">
                        {/* Node Dot */}
                        <div className={`absolute left-0 top-1.5 w-8 h-8 -ml-[1px] rounded-full border-2 ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'} flex items-center justify-center z-10 transition-all duration-300 group-hover:scale-110 ${
                          hop.latency < 50 ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                          hop.latency < 150 ? 'border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' :
                          'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)] animate-pulse'
                        }`}>
                          <span className={`text-[10px] font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>{hop.index}</span>
                        </div>

                        {/* Hop Card */}
                        <div className={`${theme === 'dark' ? 'bg-slate-800/40 border-white/5 hover:bg-slate-800/60 hover:border-cyan-500/30' : 'bg-white border-slate-200 hover:border-cyan-300 shadow-sm hover:shadow-md'} border rounded-xl p-4 transition-all group`}>
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'} font-mono font-bold text-sm`}>{hop.ip}</span>
                                {hop.country && (
                                  <span className={`${theme === 'dark' ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'} text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1`}>
                                    <Globe className="h-3 w-3" />
                                    {hop.country}
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'} truncate max-w-[300px]`}>{hop.host || t('traceroute_unknown_host')}</p>
                            </div>
                            <div className="text-right">
                              <div className={`text-sm font-mono font-bold ${
                                hop.latency < 50 ? (theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600') :
                                hop.latency < 150 ? (theme === 'dark' ? 'text-amber-400' : 'text-amber-600') :
                                (theme === 'dark' ? 'text-rose-500' : 'text-rose-600')
                              }`}>
                                {hop.latency.toFixed(2)} ms
                              </div>
                              <div className="text-[9px] text-slate-500 uppercase tracking-tighter">{t('traceroute_latency')}</div>
                            </div>
                          </div>
                          
                          {hop.coords && (
                            <div className={`mt-2 pt-2 border-t ${theme === 'dark' ? 'border-white/5' : 'border-slate-100'} flex items-center gap-2 text-[10px] text-slate-500 font-mono`}>
                              <MapPin className="h-3 w-3" />
                              <span>{hop.coords[1].toFixed(4)}, {hop.coords[0].toFixed(4)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submarine Cable Badge */}
                      {hasSubmarineJump && (
                        <div className="relative py-2 pl-10">
                          <div className={`inline-flex items-center gap-2 px-3 py-1 ${theme === 'dark' ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-purple-50 border-purple-200 text-purple-600'} border rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse transition-colors`}>
                            <Activity className="h-3 w-3" />
                            {t('traceroute_submarine')}
                          </div>
                          <div className={`absolute left-[15px] top-0 bottom-0 w-0.5 ${theme === 'dark' ? 'bg-purple-500/30 border-l border-dashed border-purple-400/50' : 'bg-purple-200 border-l border-dashed border-purple-300'}`}></div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 ${theme === 'dark' ? 'bg-slate-950/50' : 'bg-slate-50'} border-t ${theme === 'dark' ? 'border-white/5' : 'border-slate-100'} flex items-center justify-between transition-colors`}>
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
