import { useState, useCallback, useEffect } from 'react';
import { useDnsStore } from './stores/useDnsStore';
import { useDnsStream } from './hooks/useDnsStream';
import { useMockDnsStream } from './hooks/useMockDnsStream';
import { useSharedReport } from './hooks/useSharedReport';
import { useTour } from './hooks/useTour';
import { useTracerouteStore } from './stores/useTracerouteStore';
import { useCableStore } from './stores/useCableStore';
import { LiveTable } from './components/LiveTable';
import { TrafficDashboard } from './components/TrafficDashboard';
import { LiveTrafficChart } from './components/LiveTrafficChart';
import { CyberMap } from './components/CyberMap';
import { TracerouteDrawer } from './components/TracerouteDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DnsSetupBanner } from './components/DnsSetupBanner';
import { useTranslation } from 'react-i18next';
import { Shield, Search, Activity, LayoutPanelLeft, Sun, Moon, TableProperties, BarChart3, PieChart, Route } from 'lucide-react';
import { logger } from './utils/logger';
import { Tooltip } from './components/Tooltip';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';

type TabKey = 'table' | 'chart' | 'stats' | 'route';

function App() {
  const useMock = import.meta.env.VITE_USE_MOCK === 'true';
  const { monitoringIp, setMonitoringIp, isSharedReport, theme, toggleTheme, maxRecords } = useDnsStore();
  const { isLoading: traceLoading, hasResult: traceHasResult, activeResult: traceActiveResult } = useTracerouteStore();
  const { isConnected, reconnectDelay } = useMock ? useMockDnsStream(!isSharedReport) : useDnsStream(!isSharedReport);
  const [ipInput, setIpInput] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('table');

  useSharedReport();

  // Sync .dark class to <html> so that:
  // 1. body dark: styles in index.css work
  // 2. Portal components (Tooltip) inherit dark mode
  // 3. .dark .foo CSS selectors work globally
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const [runTour, setRunTour] = useState(() => !localStorage.getItem('srrt_tour_done'));
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

  // Fetch Public IP
  useEffect(() => {
    if (!monitoringIp && !isSharedReport) {
      fetch('https://api.ipify.org?format=json')
        .then(res => res.json())
        .then(data => {
          if (data.ip) setIpInput(data.ip);
        })
        .catch(err => logger.error('Failed to fetch public IP', err));
    }
  }, [monitoringIp, isSharedReport]);

  const handleTourCallback = useCallback((data: CallBackProps) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      localStorage.setItem('srrt_tour_done', '1');
      setRunTour(false);
    }
  }, []);

  // Auto-switch to route tab when traceroute starts
  useEffect(() => {
    if (traceLoading) {
      setActiveTab('route');
    }
  }, [traceLoading]);

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

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; indicator?: boolean }[] = [
    { key: 'table', label: t('tab_table'), icon: <TableProperties className="h-3.5 w-3.5" /> },
    { key: 'chart', label: t('tab_chart'), icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { key: 'stats', label: t('tab_stats'), icon: <PieChart className="h-3.5 w-3.5" /> },
    { key: 'route', label: t('tab_route'), icon: <Route className="h-3.5 w-3.5" />, indicator: traceLoading || traceHasResult },
  ];

  return (
      <div className={`relative w-screen h-screen ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-slate-50 text-slate-900'} overflow-hidden font-sans transition-colors duration-300`}>
        <Joyride
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
                  <div className="flex items-center gap-2 relative" style={{ zIndex: 10001 }}>
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

              {/* DNS Setup Banner */}
              <DnsSetupBanner />

              {/* IP Monitoring Controller */}
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5">
                <div className="bg-slate-50 dark:bg-slate-900/50 backdrop-blur-md p-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-xl tour-monitoring transition-colors">
                  <h3 className="text-xs font-bold mb-3 text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase tracking-wider font-sans">
                    <Search className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                    {t('monitoring_control')}
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
                    <div className={`flex items-center justify-between ${isSharedReport ? 'bg-amber-100/50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-500/30' : 'bg-cyan-50 dark:bg-cyan-900/30 border-cyan-200 dark:border-cyan-500/30'} border p-3 rounded-lg`}>
                      <div>
                        <span className={`text-[9px] ${isSharedReport ? 'text-amber-600 dark:text-amber-300' : 'text-cyan-600 dark:text-cyan-300'} block uppercase font-bold tracking-widest mb-1`}>
                          {isSharedReport ? t('shared_report_tag') : t('monitoring_active')}
                        </span>
                        <span className={`text-lg font-mono ${isSharedReport ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'} font-bold`}>{monitoringIp}</span>
                      </div>
                      <button
                        onClick={handleStopMonitoring}
                        className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white border border-slate-200 dark:border-transparent transition-colors shadow-sm"
                      >
                        {t('stop')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex border-b border-slate-200 dark:border-white/10 px-5">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
                      activeTab === tab.key
                        ? 'text-cyan-600 dark:text-cyan-400 border-cyan-500'
                        : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.indicator && activeTab !== tab.key && (
                      <span className={`w-1.5 h-1.5 rounded-full ${traceLoading ? 'bg-amber-400 animate-pulse' : 'bg-cyan-400'}`} />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content — fills remaining height */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {activeTab === 'table' && (
                  <ErrorBoundary>
                    <LiveTable />
                  </ErrorBoundary>
                )}

                {activeTab === 'chart' && (
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5 flex flex-col">
                    <LiveTrafficChart className="flex-1 min-h-0 bg-slate-50 dark:bg-slate-900/50 transition-colors" />

                    {/* System Status Panel */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 backdrop-blur-md p-5 rounded-xl border border-slate-200 dark:border-white/10 shadow-xl transition-colors">
                      <h3 className="text-xs font-bold mb-4 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">
                        {t('system_status')}
                      </h3>
                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-white/5 font-mono">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 dark:text-slate-500 uppercase">{t('local_country')}:</span>
                            <Tooltip text={t('tip_local_country')} />
                          </div>
                          <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-100 dark:bg-blue-400/10 px-2 py-0.5 rounded">TW</span>
                        </div>

                        <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-white/5 font-mono">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 dark:text-slate-500 uppercase">{t('websocket_status')}:</span>
                            <Tooltip text={t('tip_websocket_status')} />
                          </div>
                          <span className={`font-bold flex items-center gap-2 ${
                              isSharedReport ? 'text-amber-600 dark:text-amber-400' : (isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-500')
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                                isSharedReport ? 'bg-amber-600 dark:bg-amber-400' : (isConnected ? 'bg-green-600 dark:bg-green-400 animate-pulse' : 'bg-red-600 dark:bg-red-500 animate-pulse')
                            }`}></span>
                            {isSharedReport ? t('static_report') : (isConnected ? t('connected') : (
                              <>
                                {t('disconnected')}
                                {reconnectDelay !== null && (
                                  <span className="ml-1 text-[10px] opacity-70">
                                    ({t('reconnecting_in', { seconds: Math.ceil(reconnectDelay / 1000) })})
                                  </span>
                                )}
                              </>
                            ))}
                          </span>
                        </div>

                        <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-white/5 font-mono">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 dark:text-slate-500 uppercase">{t('max_logs')}:</span>
                            <Tooltip text={t('tip_max_logs')} />
                          </div>
                          <span className="text-slate-600 dark:text-slate-300">{maxRecords}</span>
                        </div>

                        <div className="flex justify-between items-center py-2 font-mono">
                          <span className="text-slate-400 dark:text-slate-500 uppercase">{t('guided_tour')}:</span>
                          <button
                            onClick={() => {
                              localStorage.removeItem('srrt_tour_done');
                              setRunTour(true);
                            }}
                            className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors uppercase tracking-wider"
                          >
                            {t('replay_tour')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'stats' && (
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                    <div className="bg-slate-50 dark:bg-slate-900/50 backdrop-blur-md rounded-xl border border-slate-200 dark:border-white/10 shadow-xl p-5 transition-colors tour-dashboard">
                      <h3 className="text-xs font-bold mb-4 text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase tracking-wider font-sans">
                        <Activity className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                        {t('dashboard')}
                      </h3>
                      <TrafficDashboard expanded className="p-0 bg-transparent border-none shadow-none" />
                    </div>
                  </div>
                )}

                {activeTab === 'route' && (
                  <ErrorBoundary>
                    <TracerouteDrawer />
                  </ErrorBoundary>
                )}
              </div>

              <footer className="px-4 py-3 text-center text-slate-400 dark:text-slate-600 text-[9px] uppercase tracking-widest bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-white/5">
                &copy; {new Date().getFullYear()} ZEROFLARE TECH. ALL RIGHTS RESERVED.
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

      </div>
  );
}

export default App;
