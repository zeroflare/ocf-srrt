import { useState, useCallback, useEffect, useMemo, Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router';
import { useDnsStore } from './stores/useDnsStore';

// 獨立 Traceroute 頁面（懶載入）
const TraceroutePage = lazy(() => import('./pages/TraceroutePage'));
// 獨立報告頁面（懶載入）
const ReportPage = lazy(() => import('./pages/ReportPage'));
import { useDnsStream } from './hooks/useDnsStream';
import { useMockDnsStream } from './hooks/useMockDnsStream';
import { useSharedReport } from './hooks/useSharedReport';
import { useTour } from './hooks/useTour';
import { useTracerouteStore } from './stores/useTracerouteStore';
import { useCableStore } from './stores/useCableStore';
import { LiveTable } from './components/LiveTable';
// TrafficDashboard 已內聯至監控控制區塊
import { CyberMap } from './components/CyberMap';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DnsSetupBanner, DnsServerBadge } from './components/DnsSetupBanner';
import { useTranslation } from 'react-i18next';
import { Shield, Search, Activity, LayoutPanelLeft, Sun, Moon, BookOpen, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AboutModal } from './components/AboutModal';
import { ReportModal, ReportData, AppInfo } from './components/ReportModal';
import { ReportView } from './components/ReportView';
import { buildReportUrl } from './utils/reportShare';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';

// tabs removed — table is the only view

function App() {
  const useMock = import.meta.env.VITE_USE_MOCK === 'true';
  const { monitoringIp, setMonitoringIp, isSharedReport, theme, toggleTheme, isPaused, setPaused, totalQueries, foreignQueries, records } = useDnsStore();
  const { activeResult: traceActiveResult } = useTracerouteStore();
  const { myIp } = useMock ? useMockDnsStream(!isSharedReport) : useDnsStream(!isSharedReport);
  const [ipInput, setIpInput] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [lastAppInfo, setLastAppInfo] = useState<AppInfo | undefined>(undefined);

  useSharedReport();

  // Sync .dark class to <html> so that Tailwind dark mode works globally
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const [runTour, setRunTour] = useState(() => !localStorage.getItem('srrt_tour_done'));
  const [tourKey, setTourKey] = useState(0);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(50); // 預設 50%
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) {
        setRightPanelWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // 使用後端 /api/token 回傳的 IP 預填，取代外部 api.ipify.org 呼叫
  useEffect(() => {
    if (myIp && !monitoringIp && !isSharedReport && !ipInput) {
      setIpInput(myIp);
    }
  }, [myIp, monitoringIp, isSharedReport]);

  const handleTourCallback = useCallback((data: CallBackProps) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      localStorage.setItem('srrt_tour_done', '1');
      setRunTour(false);
    }
  }, []);

  // Traceroute → Cable store 連動
  useEffect(() => {
    useCableStore.getState().selectCableByTraceResult(traceActiveResult);
  }, [traceActiveResult]);

  const { t, i18n } = useTranslation();
  const { tourSteps, joyrideStyles, joyrideLocale } = useTour(theme);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en');
  };

  const handleStartMonitoring = () => {
    if (ipInput) {
      setMonitoringIp(ipInput);
    }
  };

  const handleStopMonitoring = () => {
    setMonitoringIp(null);
    setIpInput('');
  };

  // 內聯流量統計
  const percentageVal = totalQueries > 0 ? (foreignQueries / totalQueries) * 100 : 0;
  const foreignPercentage = percentageVal.toFixed(1);

  const recentForeignPct = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 30_000;
    const recent = records.filter(r => new Date(r.timestamp).getTime() > cutoff);
    if (recent.length === 0) return 0;
    const recentForeign = recent.filter(r => r.isForeign).length;
    return (recentForeign / recent.length) * 100;
  }, [records]);

  const trend = useMemo(() => {
    const diff = percentageVal - recentForeignPct;
    if (Math.abs(diff) < 1) return 'stable';
    return diff > 0 ? 'up' : 'down';
  }, [percentageVal, recentForeignPct]);

  const burstCount = useMemo(() => {
    const now = Date.now();
    const cutoff = now - 10_000;
    const recentCount = records.filter(r => new Date(r.timestamp).getTime() > cutoff).length;
    return recentCount > 20 ? recentCount : 0;
  }, [records]);

  return (
      <div className={`relative w-screen h-screen ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-slate-50 text-slate-900'} overflow-hidden font-sans transition-colors duration-300`}>
        <Joyride
          key={tourKey}
          steps={tourSteps}
          run={runTour}
          continuous
          showSkipButton
          callback={handleTourCallback}
          styles={joyrideStyles}
          locale={joyrideLocale}
        />

        {/* 版面配置：動態分割 */}
        <div className="flex w-full h-full relative">
          {/* 左側地圖區域 */}
          <div 
            className="relative min-w-0 flex-1"
            style={{ width: showRightPanel ? `${100 - rightPanelWidth}%` : '100%' }}
          >
            <ErrorBoundary>
              <CyberMap />
            </ErrorBoundary>

          </div>

          {/* Resize Handle */}
          {showRightPanel && (
            <div
              className={`w-1 h-full cursor-col-resize z-20 hover:bg-cyan-500/50 transition-colors ${isResizing ? 'bg-cyan-500' : 'bg-transparent'}`}
              onMouseDown={startResizing}
            />
          )}

          {/* 右側資訊面板 */}
          {showRightPanel && (
            <aside 
              className="bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-white/10 flex flex-col z-10 pointer-events-auto transition-colors"
              style={{ width: `${rightPanelWidth}%` }}
            >
              {/* 頂部標題 */}
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    <div>
                      <h1 className="text-base font-bold tracking-wider text-slate-800 dark:text-slate-100 uppercase font-sans">
                        {t('title')}
                      </h1>
                      <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 tracking-[0.2em] uppercase">
                        {t('subtitle')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 relative" style={{ zIndex: 10001 }}>
                    <DnsServerBadge />
                    <button
                      onClick={() => {
                        localStorage.removeItem('srrt_tour_done');
                        setTourKey(k => k + 1);
                        setRunTour(true);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded-lg text-slate-600 dark:text-slate-300 transition-all border border-slate-200 dark:border-white/10 text-[11px] font-bold"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      {t('guided_tour')}
                    </button>
                    <DnsSetupBanner />
                    <AboutModal />
                    <button
                      onClick={toggleTheme}
                      className="p-2 bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded-lg text-slate-600 dark:text-slate-300 transition-all border border-slate-200 dark:border-white/10"
                    >
                      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={toggleLanguage}
                      className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded-lg text-xs transition-all font-mono border border-slate-200 dark:border-white/10 shadow-lg text-slate-800 dark:text-slate-100"
                    >
                      {i18n.language === 'en' ? '中文' : 'EN'}
                    </button>
                  </div>
                </div>
              </div>

              {/* IP Monitoring Controller */}
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5">
                <div className="bg-slate-50 dark:bg-slate-900/50 backdrop-blur-md p-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-xl tour-monitoring transition-colors">
                  <h3 className="text-xs font-bold mb-3 text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase tracking-wider font-sans">
                    <Search className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                    {t('monitoring_control')}
                    {burstCount > 0 && (
                      <span className="flex items-center gap-1 ml-auto px-2 py-0.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded text-[9px] font-bold text-red-600 dark:text-red-400 animate-pulse normal-case tracking-normal">
                        <AlertTriangle className="h-3 w-3" />
                        {t('burst_alert', { count: burstCount })}
                      </span>
                    )}
                  </h3>
                  {!monitoringIp ? (
                    <div className="space-y-3">
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        {t('monitoring_disabled_desc')}
                      </p>
                      {!isSharedReport && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={ipInput}
                            onChange={(e) => setIpInput(e.target.value)}
                            placeholder="e.g. 192.168.1.5"
                            className="flex-1 bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-cyan-500/50 outline-none transition-colors text-slate-800 dark:text-slate-200"
                            onKeyDown={(e) => e.key === 'Enter' && handleStartMonitoring()}
                          />
                          <button
                            onClick={handleStartMonitoring}
                            className="bg-cyan-600/10 dark:bg-cyan-600/20 hover:bg-cyan-600/20 dark:hover:bg-cyan-600/40 border border-cyan-500/30 dark:border-cyan-500/50 text-cyan-600 dark:text-cyan-400 px-4 rounded-lg text-sm font-bold transition-all flex items-center gap-2 shadow-lg dark:shadow-cyan-900/20"
                          >
                            <Activity className="h-4 w-4" />
                            {t('start_monitor')}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className={`${isSharedReport ? 'bg-amber-100/50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-500/30' : 'bg-cyan-50 dark:bg-cyan-900/30 border-cyan-200 dark:border-cyan-500/30'} border p-3 rounded-lg`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={`text-[9px] ${isSharedReport ? 'text-amber-600 dark:text-amber-300' : 'text-cyan-600 dark:text-cyan-300'} block uppercase font-bold tracking-widest mb-1`}>
                              {isSharedReport ? t('shared_report_tag') : t('monitoring_active')}
                            </span>
                            <span className={`text-lg font-mono ${isSharedReport ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'} font-bold`}>{monitoringIp}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setPaused(!isPaused)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                                isPaused
                                  ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/50'
                                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-transparent hover:bg-slate-50 dark:hover:bg-slate-700'
                              }`}
                            >
                              {isPaused ? t('resume') : t('pause')}
                            </button>
                            <button
                              onClick={handleStopMonitoring}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-transparent transition-colors"
                            >
                              {t('stop')}
                            </button>
                          </div>
                        </div>
                        {/* 內聯流量統計 */}
                        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-cyan-200/50 dark:border-cyan-500/20">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">{t('total_queries')}</span>
                            <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-100">{totalQueries.toLocaleString()}</span>
                          </div>
                          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">{t('foreign_traffic')}</span>
                            <span className={`text-sm font-bold font-mono ${percentageVal > 50 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {foreignPercentage}%
                            </span>
                            {totalQueries > 0 && (
                              <span className={`flex items-center ${
                                trend === 'up' ? 'text-red-500 dark:text-red-400' :
                                trend === 'down' ? 'text-emerald-500 dark:text-emerald-400' :
                                'text-slate-400 dark:text-slate-500'
                              }`}>
                                {trend === 'up' && <TrendingUp className="h-3 w-3" />}
                                {trend === 'down' && <TrendingDown className="h-3 w-3" />}
                                {trend === 'stable' && <Minus className="h-3 w-3" />}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Table — fills remaining height */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <ErrorBoundary>
                  <LiveTable onOpenReport={() => setShowReportModal(true)} />
                </ErrorBoundary>
              </div>

              <footer className="px-4 py-3 text-center text-slate-400 dark:text-slate-600 text-[9px] uppercase tracking-widest bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-white/5">
                &copy; {new Date().getFullYear()} OCF (Open Culture Foundation)
              </footer>
            </aside>
          )}
        </div>

        {/* 懸浮控制按鈕 (左下角) */}
        <div className="absolute bottom-6 left-6 flex gap-2 z-20">
          <button
            onClick={() => setShowRightPanel(!showRightPanel)}
            className={`p-3 rounded-xl border transition-all shadow-2xl backdrop-blur-xl ${
              showRightPanel
                ? 'bg-cyan-100 dark:bg-cyan-500/20 border-cyan-300 dark:border-cyan-500/40 text-cyan-600 dark:text-cyan-400'
                : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
            title={showRightPanel ? t('hide_panel') : t('show_panel')}
          >
            {showRightPanel ? <LayoutPanelLeft className="h-5 w-5 rotate-180" /> : <Activity className="h-5 w-5" />}
          </button>
        </div>

        {/* Report Modal */}
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          selectedRecords={useDnsStore.getState().getSelectedRecords()}
          initialAppInfo={lastAppInfo}
          onGenerate={(data) => {
            setShowReportModal(false);
            setLastAppInfo(data.appInfo);
            // 在新分頁開啟報告頁面
            window.open(buildReportUrl(data), '_blank', 'noopener,noreferrer');
          }}
        />

        {/* Report View Overlay */}
        {reportData && (
          <ReportView
            data={reportData}
            onClose={() => setReportData(null)}
            onEdit={() => {
              setReportData(null);
              setShowReportModal(true);
            }}
          />
        )}
      </div>
  );
}

/**
 * AppRouter — 頂層路由器，使用 React Router 實現 client-side routing
 * 頁面切換不會觸發完整重載，Zustand 狀態得以保留
 */
function AppRouter() {
  const fallback = (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-mono text-xs uppercase tracking-widest animate-pulse">
      Loading...
    </div>
  );
  return (
    <Routes>
      <Route path="/traceroute" element={
        <Suspense fallback={fallback}>
          <TraceroutePage />
        </Suspense>
      } />
      <Route path="/report" element={
        <Suspense fallback={fallback}>
          <ReportPage />
        </Suspense>
      } />
      <Route path="*" element={<App />} />
    </Routes>
  );
}

export default AppRouter;
