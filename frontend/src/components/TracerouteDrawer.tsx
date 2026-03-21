import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { useDnsStore } from '../stores/useDnsStore';
import { Activity, Zap, ExternalLink, Share2, Check, Clock, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buildTracerouteShareUrl } from '../utils/tracerouteShare';
import { HopTable } from './HopTable';

export const TracerouteDrawer: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeResult, isLoading, error, history, selectHistory, clearHistory } = useTracerouteStore();
  const { theme, token } = useDnsStore();
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleOpenNewPage = () => {
    if (!activeResult) return;
    navigate(`/traceroute?target=${encodeURIComponent(activeResult.target)}&token=${encodeURIComponent(token || '')}`);
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
              {activeResult ? (
                <>
                  {t('traceroute_target', { ip: activeResult.target })}
                  {activeResult.cached && (
                    <span className={`ml-1.5 px-1 py-0.5 rounded text-[9px] ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-600'}`}>
                      {t('traceroute_cached')}
                    </span>
                  )}
                </>
              ) : (isLoading ? t('traceroute_probing') : t('traceroute_na'))}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              title={t('traceroute_history')}
              className={`p-1.5 rounded-lg border text-xs transition-all ${
                showHistory
                  ? isDark ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' : 'bg-cyan-50 border-cyan-300 text-cyan-600'
                  : isDark ? 'bg-slate-800 border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40' : 'bg-white border-slate-200 text-slate-500 hover:text-cyan-600 hover:border-cyan-300'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          )}
          {activeResult && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {showHistory ? (
          /* 歷史紀錄列表 */
          <div className="p-3 space-y-1.5">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('traceroute_history')} ({history.length})
              </span>
              <button
                onClick={clearHistory}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${isDark ? 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}
              >
                <Trash2 className="h-3 w-3" />
                {t('traceroute_clear_history')}
              </button>
            </div>
            {history.map((item, idx) => (
              <button
                key={`${item.target}-${item.time}-${idx}`}
                onClick={() => { selectHistory(idx); setShowHistory(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                  activeResult?.target === item.target && activeResult?.time === item.time
                    ? isDark ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-cyan-50 border-cyan-200'
                    : isDark ? 'bg-slate-900/50 border-white/5 hover:border-white/10' : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className={`font-mono text-xs font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  {item.target}
                </div>
                <div className={`flex items-center gap-2 mt-1 text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  <span>{item.hops.length} hops</span>
                  <span>{item.status}</span>
                  <span className="ml-auto">{new Date(item.time).toLocaleTimeString()}</span>
                </div>
              </button>
            ))}
          </div>
        ) : isLoading ? (
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
          <HopTable hops={activeResult.hops} compact isDark={isDark} />
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
