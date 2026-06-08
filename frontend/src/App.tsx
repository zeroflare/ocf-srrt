import { useState, useCallback, useEffect, useMemo, Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router';
import { useDnsStore } from './stores/useDnsStore';
import { useDnsStream } from './hooks/useDnsStream';
import { useMockDnsStream } from './hooks/useMockDnsStream';
import { useSharedReport } from './hooks/useSharedReport';
import { useTour } from './hooks/useTour';
import { LiveTable } from './components/LiveTable';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTranslation } from 'react-i18next';
import { Download, Share2 } from 'lucide-react';
import { EMPTY_APP_INFO, ReportData } from './types/report';
import {
  buildReportUrl,
  pickUniqueDomainRecords,
  REPORT_SNAPSHOT_MAX_RECORDS,
} from './utils/reportShare';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { SiteHeader, Hero, SectionHeading, SiteFooter } from './components/SiteHeader';
import { SetupCards } from './components/SetupCards';
import { MapSection } from './components/MapSection';
import { TopCards } from './components/TopCards';
import { detectPhoneBrand, PhoneBrand } from './utils/phoneBrand';

const TraceroutePage = lazy(() => import('./pages/TraceroutePage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));

function App() {
  const useMock = import.meta.env.VITE_USE_MOCK === 'true';
  const { monitoringIp, setMonitoringIp, startMonitoring, isSharedReport, theme, records, selectedRowIds, localCountry, hostCoordinates, mapZoom } = useDnsStore();
  const { myIp, sendSubscribe } = useMock ? useMockDnsStream(!isSharedReport) : useDnsStream(!isSharedReport);
  const [ipInput, setIpInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  // phoneBrand: null = 自動偵測；非 null = 手動覆寫
  const [manualBrand, setManualBrand] = useState<PhoneBrand | null>(null);
  const detection = useMemo(() => detectPhoneBrand(records), [records]);
  const effectiveBrand: PhoneBrand = manualBrand ?? (detection.confidence !== 'none' ? detection.brand : 'other');

  useSharedReport();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const [runTour, setRunTour] = useState(() => !localStorage.getItem('srtt_tour_done'));
  const [tourKey, setTourKey] = useState(0);

  useEffect(() => {
    if (myIp && !monitoringIp && !isSharedReport && !ipInput) {
      setIpInput(myIp);
    }
  }, [myIp, monitoringIp, isSharedReport, ipInput]);

  const handleTourCallback = useCallback((data: CallBackProps) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      localStorage.setItem('srtt_tour_done', '1');
      setRunTour(false);
    }
  }, []);

  const { t } = useTranslation();
  const { tourSteps, joyrideStyles, joyrideLocale } = useTour(theme);

  const handleStartMonitoring = () => {
    if (ipInput) {
      startMonitoring(ipInput);
      sendSubscribe(ipInput, true);
    }
  };

  const handleStopMonitoring = () => {
    setMonitoringIp(null);
    setIpInput('');
  };

  const replayTour = useCallback(() => {
    localStorage.removeItem('srtt_tour_done');
    setTourKey((k) => k + 1);
    setRunTour(true);
  }, []);

  const openReportSnapshot = useCallback(
    (snapshotRecords: typeof records) => {
      if (snapshotRecords.length === 0) return;
      const data: ReportData = {
        records: snapshotRecords,
        appInfo: EMPTY_APP_INFO,
        generatedAt: new Date().toISOString(),
        phoneBrand: effectiveBrand,
        localCountry: localCountry || undefined,
        hostCoordinates: hostCoordinates || undefined,
        mapZoom: mapZoom || undefined,
      };
      const url = buildReportUrl(data);
      navigator.clipboard.writeText(url).then(() => {
        setToast(t('share_report_copied'));
        setTimeout(() => setToast(null), 2400);
      });
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [effectiveBrand, localCountry, hostCoordinates, mapZoom, t],
  );

  const handleShareSnapshot = () => {
    if (records.length === 0) return;
    openReportSnapshot(records.slice(0, REPORT_SNAPSHOT_MAX_RECORDS));
  };

  const handleShareUniqueDomainSnapshot = () => {
    const unique = pickUniqueDomainRecords(records, REPORT_SNAPSHOT_MAX_RECORDS);
    if (unique.length === 0) return;
    openReportSnapshot(unique);
  };

  /**
   * 「產生報告」：以使用者勾選的紀錄產生 snapshot URL，直接開新分頁。
   * 與 wireframe `generateReport()` 行為一致，不再彈 modal 收 App 資訊。
   */
  const handleGenerateReport = useCallback(() => {
    const pinned = records.filter((r) => selectedRowIds.has(r._id));
    if (pinned.length === 0) {
      setToast(t('report_pinned_empty'));
      setTimeout(() => setToast(null), 2400);
      return;
    }
    const data: ReportData = {
      records: pinned,
      appInfo: EMPTY_APP_INFO,
      generatedAt: new Date().toISOString(),
      phoneBrand: effectiveBrand,
      localCountry: localCountry || undefined,
      hostCoordinates: hostCoordinates || undefined,
      mapZoom: mapZoom || undefined,
    };
    window.open(buildReportUrl(data), '_blank', 'noopener,noreferrer');
  }, [records, selectedRowIds, effectiveBrand, localCountry, hostCoordinates, mapZoom, t]);

  const handleExportData = () => {
    const payload = JSON.stringify(records, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `srtt_export_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasRecords = records.length > 0;

  return (
    <div className="min-h-screen w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased flex flex-col">
      <Joyride
        key={tourKey}
        steps={tourSteps}
        run={runTour}
        continuous
        showSkipButton
        callback={handleTourCallback}
        styles={joyrideStyles}
        locale={joyrideLocale}
        scrollToFirstStep
        // sticky header（SiteHeader：sticky top-0，約 64px 高）會蓋住被導覽的元件。
        // 加大 scrollOffset，讓 react-joyride 捲動目標時在頂端預留 header 高度 + 緩衝，
        // 使 spotlight 標的落在 header 下方而非被遮住。
        scrollOffset={96}
      />

      <SiteHeader onTour={replayTour} />
      <Hero />

      <main className="flex-1 w-full">
        <div className="max-w-7xl mx-auto flex flex-col gap-5 px-5 py-6 sm:py-8">
          <div className="flex flex-col gap-[60px]">
            {/* 設定區（第 1 + 第 2 步） */}
            <div>
              <SectionHeading>{t('section_setup_phone_ip')}</SectionHeading>
              <SetupCards
                ipInput={ipInput}
                setIpInput={setIpInput}
                onStart={handleStartMonitoring}
                onStop={handleStopMonitoring}
                detection={detection}
                manualBrand={manualBrand}
                setManualBrand={setManualBrand}
              />
            </div>

            {/* 檢視區（地圖 + 統計 + Top 4 卡） */}
            <div className="flex flex-col gap-[16px]">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <SectionHeading variant="inline">{t('section_view_dns_distribution')}</SectionHeading>
                <div className="flex flex-wrap justify-end gap-3 items-start">
                  <button
                    type="button"
                    onClick={handleShareSnapshot}
                    disabled={!hasRecords}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                  >
                    <Share2 className="h-5 w-5 shrink-0" />
                    {t('share_report_snapshot')}
                  </button>
                  <button
                    type="button"
                    onClick={handleShareUniqueDomainSnapshot}
                    disabled={!hasRecords}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-2.5 text-sm font-bold text-violet-900 shadow-sm transition-colors hover:bg-violet-100/90 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-100 dark:hover:bg-violet-950/70 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                  >
                    <Share2 className="h-5 w-5 shrink-0" />
                    {t('share_report_snapshot_unique')}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={!hasRecords}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-900 shadow-sm transition-colors hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70 dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                  >
                    <Download className="h-5 w-5 shrink-0" />
                    {t('export_data')}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <MapSection />
                <TopCards />
              </div>
            </div>
          </div>

          {/* 即時 DNS 查詢表格 */}
          <ErrorBoundary>
            <LiveTable onOpenReport={handleGenerateReport} />
          </ErrorBoundary>
        </div>
      </main>

      <SiteFooter />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

function AppRouter() {
  const fallback = (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-mono text-xs uppercase tracking-widest animate-pulse">
      Loading...
    </div>
  );
  return (
    <Routes>
      <Route
        path="/traceroute"
        element={
          <Suspense fallback={fallback}>
            <TraceroutePage />
          </Suspense>
        }
      />
      <Route
        path="/report"
        element={
          <Suspense fallback={fallback}>
            <ReportPage />
          </Suspense>
        }
      />
      <Route path="*" element={<App />} />
    </Routes>
  );
}

export default AppRouter;
