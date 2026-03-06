import React, { useEffect, useState } from 'react';
import { Activity, MapPin, Globe, Zap, Share2, Check, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TraceResult } from '../types';
import { decodeTraceResult, buildTracerouteShareUrl } from '../utils/tracerouteShare';
import { isLikelySubmarine } from '../utils/geo';
import { useDnsStore } from '../stores/useDnsStore';

/**
 * TraceroutePage — 獨立全頁 Traceroute 檢視器
 *
 * 支援兩種啟動方式：
 * 1. /traceroute?target=<IP>&token=<TOKEN>  → 自動執行 traceroute
 * 2. /traceroute?zdata=<compressed>         → 顯示分享結果（唯讀）
 */
const TraceroutePage: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useDnsStore();
  const [result, setResult] = useState<TraceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isShared, setIsShared] = useState(false);

  // 同步 dark class 到 <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zdata = params.get('zdata');
    const target = params.get('target');
    const token = params.get('token');

    if (zdata) {
      // 分享模式：直接解碼顯示
      const decoded = decodeTraceResult(zdata);
      if (decoded) {
        setResult(decoded);
        setIsShared(true);
      } else {
        setError(t('traceroute_share_decode_error'));
      }
    } else if (target) {
      // 執行模式：若缺少 token，先向後端取得
      const runTrace = async () => {
        setIsLoading(true);
        try {
          let effectiveToken = token;
          if (!effectiveToken) {
            const tokenResp = await fetch('/api/token');
            if (!tokenResp.ok) throw new Error(`Token fetch failed: ${tokenResp.status}`);
            const tokenData = await tokenResp.json();
            effectiveToken = tokenData.token;
          }
          const res = await fetch(`/api/traceroute?target=${encodeURIComponent(target)}&token=${encodeURIComponent(effectiveToken!)}`);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data: TraceResult = await res.json();
          setResult(data);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      };
      runTrace();
    } else {
      setError(t('traceroute_page_no_params'));
    }
  }, [t]);

  const handleCopyShare = () => {
    if (!result) return;
    const url = buildTracerouteShareUrl(result);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'} transition-colors`}>
      {/* 頂部 Header */}
      <div className={`sticky top-0 z-10 ${isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white/95 border-slate-200'} border-b backdrop-blur-sm px-6 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 ${isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'} rounded-xl`}>
            <Activity className={`h-5 w-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          </div>
          <div>
            <h1 className={`text-base font-bold uppercase tracking-wider ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
              {t('traceroute_title')}
            </h1>
            <p className={`text-[10px] font-mono uppercase tracking-widest ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>
              {result
                ? t('traceroute_target', { ip: result.target })
                : isLoading
                ? t('traceroute_probing')
                : t('traceroute_na')}
              {isShared && (
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-600'}`}>
                  {t('shared_report_tag')}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={handleCopyShare}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                copied
                  ? isDark ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-600'
                  : isDark ? 'bg-slate-800 border-white/10 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-400' : 'bg-white border-slate-200 text-slate-600 hover:border-cyan-300 hover:text-cyan-600'
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? t('traceroute_copied') : t('traceroute_copy_share')}
            </button>
          )}
          <a
            href="/"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isDark ? 'bg-slate-800 border-white/10 text-slate-300 hover:text-white' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('traceroute_page_back_main')}
          </a>
        </div>
      </div>

      {/* 內容區域 */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="relative">
              <div className={`w-16 h-16 border-4 ${isDark ? 'border-cyan-500/20' : 'border-cyan-100'} rounded-full`}></div>
              <div className="w-16 h-16 border-4 border-t-cyan-500 rounded-full animate-spin absolute top-0 left-0"></div>
            </div>
            <p className="text-cyan-600 dark:text-cyan-400 font-mono text-xs animate-pulse uppercase tracking-[0.2em]">
              {t('traceroute_intercepting')}
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-rose-500 space-y-4">
            <Zap className="h-12 w-12 animate-bounce" />
            <p className="font-mono text-sm uppercase">{error}</p>
          </div>
        ) : !result ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3 text-slate-400 dark:text-slate-600">
            <Activity className="h-10 w-10 opacity-30" />
            <p className="text-xs font-bold uppercase tracking-wider">{t('traceroute_no_data')}</p>
          </div>
        ) : (
          <>
            {/* 摘要資訊 */}
            <div className={`mb-6 px-4 py-3 rounded-xl border text-xs font-mono flex items-center justify-between ${isDark ? 'bg-slate-900/50 border-white/5 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
              <span>{t('traceroute_status', { status: result.status })}</span>
              <span>{new Date(result.time).toLocaleString()}</span>
            </div>

            {/* Hop 列表 */}
            <div className="relative">
              {/* 垂直連線 */}
              <div className={`absolute left-[15px] top-2 bottom-2 w-0.5 ${isDark ? 'bg-gradient-to-b from-cyan-500/50 via-purple-500/50 to-emerald-500/50' : 'bg-slate-200'}`}></div>

              <div className="space-y-8">
                {result.hops.map((hop, index) => {
                  const nextHop = result.hops[index + 1];
                  const hasSubmarineJump = nextHop && isLikelySubmarine(hop, nextHop);

                  return (
                    <React.Fragment key={index}>
                      <div className="relative pl-10 group">
                        {/* 節點圓圈 */}
                        <div className={`absolute left-0 top-1.5 w-8 h-8 -ml-[1px] rounded-full border-2 ${isDark ? 'bg-slate-900' : 'bg-white'} flex items-center justify-center z-10 transition-all duration-300 group-hover:scale-110 ${
                          hop.ip === '*'
                            ? (isDark ? 'border-slate-600' : 'border-slate-300')
                            : hop.latency < 50
                            ? 'border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                            : hop.latency < 150
                            ? 'border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                            : 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)] animate-pulse'
                        }`}>
                          <span className={`text-[10px] font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{hop.index}</span>
                        </div>

                        {/* Hop 卡片 */}
                        <div className={`${isDark ? 'bg-slate-800/40 border-white/5 hover:bg-slate-800/60 hover:border-cyan-500/30' : 'bg-white border-slate-200 hover:border-cyan-300 shadow-sm hover:shadow-md'} border rounded-xl p-4 transition-all`}>
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`${isDark ? 'text-cyan-400' : 'text-cyan-600'} font-mono font-bold text-sm`}>
                                  {hop.ip}
                                </span>
                                {hop.country && (
                                  <span className={`${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'} text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1`}>
                                    <Globe className="h-3 w-3" />
                                    {hop.country}
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {hop.host || t('traceroute_unknown_host')}
                              </p>
                            </div>
                            {hop.ip !== '*' && (
                              <div className="text-right">
                                <div className={`text-sm font-mono font-bold ${
                                  hop.latency < 50
                                    ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                                    : hop.latency < 150
                                    ? isDark ? 'text-amber-400' : 'text-amber-600'
                                    : isDark ? 'text-rose-500' : 'text-rose-600'
                                }`}>
                                  {hop.latency.toFixed(2)} ms
                                </div>
                                <div className="text-[9px] text-slate-500 uppercase tracking-tighter">{t('traceroute_latency')}</div>
                              </div>
                            )}
                          </div>

                          {hop.coords && hop.coords.length >= 2 && (
                            <div className={`mt-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-slate-100'} flex items-center gap-2 text-[10px] text-slate-500 font-mono`}>
                              <MapPin className="h-3 w-3" />
                              <span>{hop.coords[1].toFixed(4)}, {hop.coords[0].toFixed(4)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 海底電纜提示 */}
                      {hasSubmarineJump && (
                        <div className="relative py-2 pl-10">
                          <div className={`inline-flex items-center gap-2 px-3 py-1 ${isDark ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-purple-50 border-purple-200 text-purple-600'} border rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse`}>
                            <Activity className="h-3 w-3" />
                            {t('traceroute_submarine')}
                          </div>
                          <div className={`absolute left-[15px] top-0 bottom-0 w-0.5 ${isDark ? 'bg-purple-500/30 border-l border-dashed border-purple-400/50' : 'bg-purple-200 border-l border-dashed border-purple-300'}`}></div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className={`px-4 py-3 text-center text-[9px] uppercase tracking-widest border-t mt-8 ${isDark ? 'text-slate-600 bg-slate-950 border-white/5' : 'text-slate-400 bg-white border-slate-100'}`}>
        &copy; {new Date().getFullYear()} ZEROFLARE TECH. ALL RIGHTS RESERVED.
      </footer>
    </div>
  );
};

export default TraceroutePage;
