import React, { useEffect, useState, useMemo } from 'react';
import { Activity, Zap, Share2, Check, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TraceResult, Hop } from '../types';
import { decodeTraceResult, buildTracerouteShareUrl } from '../utils/tracerouteShare';
import { isLikelySubmarine } from '../utils/geo';
import { useDnsStore } from '../stores/useDnsStore';

const LatencyBar: React.FC<{ hop: Hop; maxLatency: number }> = ({ hop, maxLatency }) => {
  const avg = hop.latency;
  if (hop.ip === '*' || avg === 0) return <span className="text-slate-500 dark:text-slate-600">—</span>;

  const pct = maxLatency > 0 ? Math.min((avg / maxLatency) * 100, 100) : 0;
  const color = avg < 50 ? 'bg-emerald-500' : avg < 150 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <span className={`font-mono text-xs font-bold min-w-[50px] text-right ${
        avg < 50 ? 'text-emerald-600 dark:text-emerald-400' : avg < 150 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-500'
      }`}>{avg.toFixed(1)} ms</span>
    </div>
  );
};

const RttCell: React.FC<{ value?: number }> = ({ value }) => {
  if (value === undefined) return <span className="text-slate-400 dark:text-slate-600">*</span>;
  const color = value < 50 ? 'text-emerald-600 dark:text-emerald-400' : value < 150 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-500';
  return <span className={`font-mono ${color}`}>{value.toFixed(1)}</span>;
};

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

  const maxLatency = useMemo(() => {
    if (!result) return 0;
    return Math.max(...result.hops.filter(h => h.ip !== '*').map(h => h.latency), 1);
  }, [result]);

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
      const decoded = decodeTraceResult(zdata);
      if (decoded) {
        setResult(decoded);
        setIsShared(true);
      } else {
        setError(t('traceroute_share_decode_error'));
      }
    } else if (target) {
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
          <a
            href="/"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isDark ? 'bg-slate-800 border-white/10 text-slate-300 hover:text-white' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('traceroute_page_back_main')}
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
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

            {/* Hop 表格 */}
            <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
              <table className="w-full text-[11px]">
                <thead className={isDark ? 'bg-slate-900' : 'bg-slate-50'}>
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 w-10">#</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">IP</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">ASN/ISP</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 w-14"></th>
                    <th className="px-4 py-3 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">{t('traceroute_latency')}</th>
                    <th className="px-4 py-3 text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">RTT 1</th>
                    <th className="px-4 py-3 text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">RTT 2</th>
                    <th className="px-4 py-3 text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">RTT 3</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-100'}`}>
                  {result.hops.map((hop, index) => {
                    const nextHop = result.hops[index + 1];
                    const hasSubmarineJump = nextHop && isLikelySubmarine(hop, nextHop);
                    const isStar = hop.ip === '*';
                    const rtts = hop.rtts || [];

                    return (
                      <React.Fragment key={index}>
                        <tr className={`group transition-colors ${isStar ? 'opacity-40' : 'hover:bg-cyan-500/5'}`}>
                          <td className="px-4 py-2.5 font-mono font-bold text-slate-400 dark:text-slate-500">{hop.index}</td>
                          <td className="px-4 py-2.5">
                            {isStar ? (
                              <span className="text-slate-500 dark:text-slate-600 font-mono">*</span>
                            ) : (
                              <div>
                                <span className="text-cyan-600 dark:text-cyan-400 font-mono font-bold">{hop.ip}</span>
                                {hop.host && hop.host !== hop.ip && (
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[220px]">{hop.host}</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {!isStar && hop.asn ? (
                              <div className="max-w-[160px]">
                                <span className="text-[10px] text-slate-400 dark:text-slate-600 block">AS{hop.asn}</span>
                                <span className="text-slate-500 dark:text-slate-400 truncate block text-[10px]">{hop.isp}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {!isStar && hop.country && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                {hop.country}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <LatencyBar hop={hop} maxLatency={maxLatency} />
                          </td>
                          <td className="px-4 py-2.5 text-right text-[10px]"><RttCell value={rtts[0]} /></td>
                          <td className="px-4 py-2.5 text-right text-[10px]"><RttCell value={rtts[1]} /></td>
                          <td className="px-4 py-2.5 text-right text-[10px]"><RttCell value={rtts[2]} /></td>
                        </tr>
                        {hasSubmarineJump && (
                          <tr>
                            <td colSpan={8} className="px-4 py-1.5">
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
            </div>
          </>
        )}
      </div>

      <footer className={`px-4 py-3 text-center text-[9px] uppercase tracking-widest border-t mt-8 ${isDark ? 'text-slate-600 bg-slate-950 border-white/5' : 'text-slate-400 bg-white border-slate-100'}`}>
        &copy; {new Date().getFullYear()} ZEROFLARE TECH. ALL RIGHTS RESERVED.
      </footer>
    </div>
  );
};

export default TraceroutePage;
