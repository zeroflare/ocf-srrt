import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowLeft, Map as MapIcon, Play, Share2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TraceResult } from '../types';
import { resolveDisplayCountry } from '../utils/countryFlag';
import { decodeTraceResult, buildTracerouteShareUrl } from '../utils/tracerouteShare';
import { useDnsStore } from '../stores/useDnsStore';
import { createMockTraceResult } from '../stores/useTracerouteStore';
import { HopTable } from '../components/HopTable';
import { TraceMap } from '../components/TraceMap';
import { SiteHeader, Hero, SectionHeading, SiteFooter } from '../components/SiteHeader';

/**
 * StatCard 三種尺寸與 wireframe traceroute.html 對齊：
 *   - 'long': 長文字（target 網域、ASN+ISP 行）→ text-xs sm:text-sm，可換行
 *   - 'short': 短文字（IP、國家碼）→ text-base sm:text-lg，不換行
 *   - 'mono': 兼具上述兩者特徵的 monospace 顯示（IP）
 */
type StatCardSize = 'long' | 'short';

const STAT_VALUE_CLASS: Record<StatCardSize, string> = {
  long:
    'max-w-full text-center text-xs font-semibold leading-snug text-slate-900 dark:text-white sm:text-sm font-mono break-all',
  short:
    'max-w-full text-center text-base font-semibold tabular-nums leading-none text-slate-900 dark:text-white sm:text-lg',
};

const StatCard: React.FC<{ label: string; value: React.ReactNode; size?: StatCardSize; mono?: boolean }> = ({
  label,
  value,
  size = 'long',
  mono = false,
}) => (
  <div className="flex min-h-[6.5rem] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/50 lg:h-full lg:min-h-0">
    <div className="shrink-0 border-b border-slate-300 bg-slate-50/90 px-3 py-2 text-center dark:border-slate-600 dark:bg-slate-800/40">
      <span className="wf-card-title font-semibold text-slate-800 dark:text-slate-100">{label}</span>
    </div>
    <div className="flex min-h-[3.25rem] flex-1 items-center justify-center px-3 py-3 overflow-y-auto">
      <span className={`${STAT_VALUE_CLASS[size]}${mono && size === 'short' ? ' font-mono' : ''}`}>{value}</span>
    </div>
  </div>
);

const TraceroutePage: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useDnsStore();
  const navigate = useNavigate();
  const [result, setResult] = useState<TraceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [targetInput, setTargetInput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // URL params 變更時重跑 trace（包含「開始追蹤」按鈕 navigate 到新 ?target=）
  useEffect(() => {
    const zdata = searchParams.get('zdata');
    const target = searchParams.get('target');
    const token = searchParams.get('token');

    // 每次 URL 變更都重置狀態
    setError(null);

    if (zdata) {
      const decoded = decodeTraceResult(zdata);
      if (decoded) {
        setResult(decoded);
        setTargetInput(decoded.target);
      } else {
        setResult(null);
        setError(t('traceroute_share_decode_error'));
      }
      return;
    }

    if (!target) {
      setResult(null);
      setIsLoading(false);
      return;
    }
    setTargetInput(target);

    const useMock = import.meta.env.VITE_USE_MOCK === 'true';
    if (useMock) {
      setResult(null);
      setIsLoading(true);
      const timer = setTimeout(() => {
        setResult(createMockTraceResult(target));
        setIsLoading(false);
      }, 1200);
      return () => clearTimeout(timer);
    }

    const abortController = new AbortController();
    const runTraceAsync = async () => {
      setResult(null);
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
          headers: { Authorization: `Bearer ${effectiveToken}` },
          signal: abortController.signal,
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data: TraceResult = await res.json();
        setResult(data);
      } catch (err: any) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false);
      }
    };
    runTraceAsync();

    return () => abortController.abort();
  }, [searchParams, t]);

  const runTrace = () => {
    const trimmed = targetInput.trim();
    if (!trimmed) return;
    // 在本頁跑 trace（不另開分頁）；同 target 再按要強制觸發 effect
    const current = searchParams.get('target');
    if (current === trimmed) {
      navigate(`/traceroute?target=${encodeURIComponent(trimmed)}&_t=${Date.now()}`, { replace: true });
    } else {
      navigate(`/traceroute?target=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleCopyShare = () => {
    if (!result) return;
    const url = buildTracerouteShareUrl(result);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const hasGeoHops = result ? result.hops.some((h) => h.ip !== '*' && h.coords && h.coords.length === 2) : false;
  const targetCountryHop = result?.hops.filter((h) => h.country).slice(-1)[0];
  const targetCountry = result
    ? resolveDisplayCountry(result.targetCountry || targetCountryHop?.country)
    : '—';
  const targetAsn = targetCountryHop?.asn ? `AS${targetCountryHop.asn}${targetCountryHop.isp ? ' · ' + targetCountryHop.isp : ''}` : '—';

  return (
    <div className="min-h-screen w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased flex flex-col">
      <SiteHeader />
      <Hero variant="subtitle" title={t('trace_title')} subtitle={t('trace_hero_subtitle')} />

      <div className="flex flex-col flex-1 w-full max-w-7xl mx-auto gap-10 px-5 py-6 sm:gap-12 sm:py-8">
        {/* 設定追蹤目標卡 */}
        <div>
          <SectionHeading>{t('trace_section_setup')}</SectionHeading>
          <div className="flex min-w-0 w-full max-w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/50">
            <div className="border-b border-slate-200 bg-slate-50 px-[24px] py-[16px] dark:border-slate-600 dark:bg-slate-800/60">
              <h3 className="text-[18px] font-bold leading-tight text-slate-900 dark:text-slate-100">{t('trace_input_card_title')}</h3>
            </div>
            <div className="flex flex-col gap-2 bg-white p-6 dark:bg-slate-900/50">
              <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-4 sm:items-end sm:gap-[16px]">
                <div className="relative flex min-w-0 flex-col gap-2 sm:col-span-3">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-none">{t('trace_target_domain_label')}</label>
                  <input
                    type="text"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') runTrace(); }}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('trace_target_placeholder')}
                    className="h-10 w-full bg-white dark:bg-slate-950/60 border-[1.5px] border-slate-200 dark:border-slate-800 rounded-lg px-4 text-sm font-mono focus:outline-none focus:ring-4 focus:ring-[#17d4a7]/40 text-slate-800 dark:text-slate-200 placeholder:text-slate-400/60"
                  />
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 sm:col-span-1">
                  <button
                    type="button"
                    onClick={runTrace}
                    disabled={!targetInput.trim()}
                    className="h-10 w-full flex items-center justify-center gap-1.5 bg-[#17d4a7] hover:bg-[#0fc196] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    <Play className="h-3.5 w-3.5" style={{ fill: 'currentColor' }} />
                    {t('trace_run')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 結果區 */}
        {isLoading ? (
          <div className="flex flex-col flex-1 items-center justify-center gap-3 text-slate-500 dark:text-slate-400 py-16">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-xs uppercase tracking-widest">{t('trace_running')}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col flex-1 items-center justify-center p-8 text-center max-w-md mx-auto">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-line">{error}</p>
            <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:underline text-sm">
              <ArrowLeft className="h-4 w-4" />
              {t('trace_back_monitor')}
            </Link>
          </div>
        ) : !result ? (
          <div className="flex flex-col flex-1 items-center justify-center py-8">
            <p className="text-sm text-center text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">{t('trace_await_hint')}</p>
          </div>
        ) : (
          <main className="flex flex-col flex-1 w-full gap-[16px]">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <SectionHeading>{t('trace_section_path')}</SectionHeading>
              <button
                type="button"
                onClick={handleCopyShare}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {copied ? <Check className="h-5 w-5 shrink-0 text-emerald-500" /> : <Share2 className="h-5 w-5 shrink-0" />}
                {copied ? t('traceroute_copied') : t('traceroute_copy_share')}
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:items-stretch lg:gap-4 lg:min-h-0">
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/50 lg:col-span-3">
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-300/80 px-4 py-2.5 dark:border-slate-600/50">
                    <div className="flex items-center gap-2">
                      <MapIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="wf-card-title font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">{t('trace_map_heading')}</span>
                    </div>
                  </div>
                  <div className="relative h-[55vh] min-h-[280px] max-h-[680px] w-full">
                    {hasGeoHops ? <TraceMap hops={result.hops} /> : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-600">No geographic data</div>
                    )}
                  </div>
                </div>

                <aside className="grid min-h-0 grid-cols-1 gap-3 lg:col-span-1 lg:h-full lg:grid-rows-4 lg:gap-3">
                  <StatCard label={t('trace_target')} value={result.target} size="long" />
                  <StatCard label={t('trace_resolved_ip')} value={result.resolvedIP || '—'} size="short" mono />
                  <StatCard label={t('trace_target_country')} value={targetCountry} size="short" />
                  <StatCard label={t('trace_card_asn')} value={targetAsn} size="long" />
                </aside>
              </div>

              <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1 px-1">
                <span>
                  {t('trace_mode')}: <span className="text-emerald-600 dark:text-emerald-400">{result.mode || 'icmp'}{result.port ? `:${result.port}` : ''}</span>
                </span>
                {result.dnsResolveMs != null && result.dnsResolveMs > 0 && (
                  <span>
                    {t('trace_dns_resolve')}: <span className="text-slate-700 dark:text-slate-300">{result.dnsResolveMs.toFixed(1)}ms</span>
                  </span>
                )}
                {result.mtrExecutionMs != null && result.mtrExecutionMs > 0 && (
                  <span>
                    {t('trace_mtr_exec')}: <span className="text-slate-700 dark:text-slate-300">{(result.mtrExecutionMs / 1000).toFixed(2)}s</span>
                  </span>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-xl overflow-hidden shadow-sm">
                <HopTable hops={result.hops} isDark={theme === 'dark'} />
              </div>

              <p className="text-xs text-slate-400 dark:text-slate-600 text-center pb-6">{t('trace_sim_footer')}</p>
            </div>
          </main>
        )}
      </div>

      <SiteFooter />
    </div>
  );
};

export default TraceroutePage;
