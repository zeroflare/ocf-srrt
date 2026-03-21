import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Activity, Zap, Share2, Check, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TraceResult } from '../types';
import { decodeTraceResult, buildTracerouteShareUrl } from '../utils/tracerouteShare';
import { useDnsStore } from '../stores/useDnsStore';
import { createMockTraceResult } from '../stores/useTracerouteStore';
import { HopTable } from '../components/HopTable';
import { TraceMap } from '../components/TraceMap';

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
  const [searchParams] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [isShared, setIsShared] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // 使用 ref 持有 searchParams 以穩定 useEffect 依賴
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  useEffect(() => {
    const params = searchParamsRef.current;
    const zdata = params.get('zdata');
    const target = params.get('target');
    const token = params.get('token');

    if (zdata) {
      const decoded = decodeTraceResult(zdata);
      if (decoded) {
        setResult(decoded);
        setIsShared(true);
      } else {
        setError(t('traceroute_share_decode_error'));
      }
      return;
    }

    if (!target) {
      setError(t('traceroute_page_no_params'));
      return;
    }

    const useMock = import.meta.env.VITE_USE_MOCK === 'true';
    if (useMock) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setResult(createMockTraceResult(target));
        setIsLoading(false);
      }, 1500);
      return () => clearTimeout(timer);
    }

    const abortController = new AbortController();
    const runTrace = async () => {
      setIsLoading(true);
      try {
        let effectiveToken = token;
        if (!effectiveToken) {
          const tokenResp = await fetch('/api/token', { signal: abortController.signal });
          if (!tokenResp.ok) throw new Error(`Token fetch failed: ${tokenResp.status}`);
          const tokenData = await tokenResp.json();
          effectiveToken = tokenData.token;
        }
        const res = await fetch(`/api/traceroute?target=${encodeURIComponent(target)}`, {
          headers: { 'Authorization': `Bearer ${effectiveToken}` },
          signal: abortController.signal,
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data: TraceResult = await res.json();
        setResult(data);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };
    runTrace();

    return () => abortController.abort();
    // 僅在 mount 時根據 URL 參數執行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 是否有有效座標的跳點（決定是否顯示地圖）
  const hasGeoHops = result ? result.hops.some(h => h.ip !== '*' && h.coords && h.coords.length === 2) : false;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'} transition-colors`}>
      {/* Header */}
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
          <Link
            to="/"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isDark ? 'bg-slate-800 border-white/10 text-slate-300 hover:text-white' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('traceroute_page_back_main')}
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-8">
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

            {/* 地圖 + 表格 Grid */}
            <div className={`grid grid-cols-1 ${hasGeoHops ? 'lg:grid-cols-[2fr_3fr]' : ''} gap-6`}>
              {/* TraceMap（僅有有效座標時顯示） */}
              {hasGeoHops && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/5' : 'border-slate-200'} h-[400px] lg:h-auto lg:min-h-[500px]`}>
                  <TraceMap hops={result.hops} />
                </div>
              )}

              {/* HopTable */}
              <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                <HopTable hops={result.hops} isDark={isDark} />
              </div>
            </div>
          </>
        )}
      </div>

      <footer className={`px-4 py-3 text-center text-[9px] uppercase tracking-widest border-t mt-8 ${isDark ? 'text-slate-600 bg-slate-950 border-white/5' : 'text-slate-400 bg-white border-slate-100'}`}>
        &copy; {new Date().getFullYear()} OCF (Open Culture Foundation)
      </footer>
    </div>
  );
};

export default TraceroutePage;
