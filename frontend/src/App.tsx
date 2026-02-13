import { useState, useEffect } from 'react';
import pako from 'pako';
import { useDnsStore } from './stores/useDnsStore';
import { DnsRecord } from './types';
import { useDnsStream } from './hooks/useDnsStream';
import { useMockDnsStream } from './hooks/useMockDnsStream';
import { LiveTable } from './components/LiveTable';
import { TrafficDashboard } from './components/TrafficDashboard';
import { CyberMap } from './components/CyberMap';
import { useTranslation } from 'react-i18next';
import { Shield, Search, Activity, LayoutPanelLeft, Table as TableIcon } from 'lucide-react';
import Joyride, { Step } from 'react-joyride';

function App() {
  const useMock = import.meta.env.VITE_USE_MOCK === 'true';
  // [SRE] 獲取真實連線狀態，用於監控儀表板
  const { monitoringIp, setMonitoringIp, loadSnapshot, isSharedReport, setSharedReport } = useDnsStore();
  const isConnected = useMock ? useMockDnsStream(!isSharedReport) : useDnsStream(!isSharedReport);
  const [ipInput, setIpInput] = useState('');

  // 檢查 URL 是否含有分享資料
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zdata = params.get('zdata');
    const oldData = params.get('data'); // 相容舊版非壓縮資料

    if (zdata) {
      try {
        // Base64 URL-safe 還原
        const base64 = zdata.replace(/-/g, '+').replace(/_/g, '/');
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // pako 解壓縮
        const decompressed = pako.inflate(bytes, { to: 'string' });
        const decoded = JSON.parse(decompressed);

        loadRecords(decoded);
      } catch (e) {
        console.error('Failed to decode compressed share data:', e);
      }
    } else if (oldData) {
      try {
        const json = decodeURIComponent(escape(atob(oldData)));
        const decoded = JSON.parse(json);
        loadRecords(decoded);
      } catch (e) {
        console.error('Failed to decode legacy share data:', e);
      }
    }

    function loadRecords(decoded: any[]) {
      // 將縮寫轉回 DnsRecord 格式
      const records: DnsRecord[] = decoded.map((r: any) => ({
        timestamp: r.t,
        domain: r.d,
        resultIp: r.ip,
        isForeign: r.f === 1,
        latency: r.l,
        sourceIp: r.s,
        country: r.c,
        appName: r.a,
        appCategory: r.cat,
        isp: r.isp,
        asn: r.asn || 0,
        type: 'A' // 預設值
      }));

      // 設定一個虛擬的監控 IP 以便顯示資料
      if (records.length > 0) {
        setSharedReport(true);
        setMonitoringIp(records[0].sourceIp);
        loadSnapshot(records.reverse()); // loadSnapshot 會再 reverse 一次，所以這裡先 reverse
      }
    }
  }, [setMonitoringIp, loadSnapshot, setSharedReport]);
  const [runTour] = useState(true);

  // 版面顯示狀態
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  const { t, i18n } = useTranslation();

  const tourSteps: Step[] = [
    {
      target: 'body',
      placement: 'center',
      title: t('tour_welcome_title'),
      content: t('tour_welcome_content'),
    },
    {
      target: '.tour-monitoring',
      title: t('tour_monitoring_title'),
      content: t('tour_monitoring_content'),
    },
    {
      target: '.tour-dashboard',
      title: t('tour_dashboard_title'),
      content: t('tour_dashboard_content'),
    },
    {
      target: '.tour-map',
      title: t('tour_map_title'),
      content: t('tour_map_content'),
    },
    {
      target: '.tour-table',
      title: t('tour_table_title'),
      content: t('tour_table_content'),
    },
    {
      target: '.tour-traceroute',
      title: t('tour_traceroute_title'),
      content: t('tour_traceroute_content'),
    }
  ];

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

  return (
      <div className="relative w-screen h-screen bg-gray-900 text-white overflow-hidden font-sans">
        <Joyride
          steps={tourSteps}
          run={runTour}
          continuous
          showSkipButton
          styles={{
            options: {
              primaryColor: '#3b82f6',
              backgroundColor: '#1f2937',
              textColor: '#fff',
              arrowColor: '#1f2937',
            }
          }}
          locale={{
            next: t('next'),
            back: t('back'),
            last: t('last'),
            skip: t('skip')
          }}
        />

        {/* 全螢幕地圖層 */}
        <CyberMap />

        {/* 懸浮 UI 層 */}
        <div className="absolute inset-0 pointer-events-none flex flex-col p-6">
          <header className="flex justify-between items-center mb-6 pointer-events-auto">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 bg-gray-900/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl">
                <Shield className="h-8 w-8 text-blue-500" />
                <h1 className="text-2xl font-bold tracking-tight text-blue-400">
                  {t('title')}
                </h1>
              </div>

              {/* 控制按鈕 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLeftPanel(!showLeftPanel)}
                  className={`p-2 rounded-lg border transition-all ${
                    showLeftPanel 
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                      : 'bg-gray-900/60 border-white/10 text-gray-400 hover:text-white'
                  } backdrop-blur-md shadow-xl`}
                  title={showLeftPanel ? "隱藏側欄" : "顯示側欄"}
                >
                  <LayoutPanelLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setShowRightPanel(!showRightPanel)}
                  className={`p-2 rounded-lg border transition-all ${
                    showRightPanel 
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                      : 'bg-gray-900/60 border-white/10 text-gray-400 hover:text-white'
                  } backdrop-blur-md shadow-xl`}
                  title={showRightPanel ? "隱藏數據表" : "顯示數據表"}
                >
                  <TableIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                  onClick={toggleLanguage}
                  className="px-4 py-2 bg-gray-900/60 backdrop-blur-md hover:bg-gray-800/80 rounded-xl text-sm transition-all font-mono border border-white/10 shadow-2xl pointer-events-auto"
              >
                {i18n.language === 'en' ? '中文' : 'EN'}
              </button>
            </div>
          </header>

          <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
            {/* 左側面板 */}
            {showLeftPanel && (
              <div className="lg:col-span-4 xl:col-span-3 space-y-6 overflow-y-auto pointer-events-auto pr-2 custom-scrollbar transition-all duration-300 ease-in-out">
                {/* IP Monitoring Controller */}
                <div className="bg-gray-900/80 backdrop-blur-md p-6 rounded-xl border border-white/10 shadow-2xl tour-monitoring">
                  <h3 className="text-lg font-bold mb-4 text-gray-200 flex items-center gap-2">
                    <Search className="h-5 w-5 text-blue-400" />
                    {t('monitoring_control')}
                  </h3>
                  {!monitoringIp ? (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-400">
                        {isSharedReport ? t('shared_report_desc') : t('monitoring_disabled_desc')}
                      </p>
                      {!isSharedReport && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={ipInput}
                            onChange={(e) => setIpInput(e.target.value)}
                            placeholder="e.g. 192.168.1.5"
                            className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-500 outline-none"
                          />
                          <button
                            onClick={handleStartMonitoring}
                            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20"
                          >
                            <Activity className="h-4 w-4" />
                            {t('start_monitor')}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className={`flex items-center justify-between ${isSharedReport ? 'bg-amber-900/30 border-amber-500/30' : 'bg-blue-900/30 border-blue-500/30'} border p-4 rounded-lg`}>
                        <div>
                          <span className={`text-xs ${isSharedReport ? 'text-amber-300' : 'text-blue-300'} block uppercase font-bold tracking-wider`}>
                            {isSharedReport ? t('shared_report_tag') : t('monitoring_active')}
                          </span>
                          <span className={`text-xl font-mono ${isSharedReport ? 'text-amber-400' : 'text-blue-400'} font-bold`}>{monitoringIp}</span>
                        </div>
                        <button
                          onClick={handleStopMonitoring}
                          className="bg-gray-800 hover:bg-gray-700 p-2 rounded-lg text-gray-400 hover:text-white transition-colors"
                        >
                          {t('stop')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <TrafficDashboard className="tour-dashboard bg-gray-900/80 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl p-4" />

                {/* System Status Panel */}
                <div className="bg-gray-900/80 backdrop-blur-md p-6 rounded-xl border border-white/10 shadow-2xl">
                  <h3 className="text-lg font-bold mb-4 text-gray-200">
                    {t('system_status')}
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-gray-400">{t('local_country')}:</span>
                      <span className="text-blue-400 font-mono font-bold bg-blue-400/10 px-2 py-0.5 rounded">TW</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-gray-400">{t('websocket_status')}:</span>
                      <span className={`font-mono font-bold flex items-center gap-2 ${
                          isSharedReport ? 'text-amber-400' : (isConnected ? 'text-green-400' : 'text-red-500')
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${
                            isSharedReport ? 'bg-amber-400' : (isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500')
                        }`}></span>
                        {isSharedReport ? t('static_report') : (isConnected ? t('connected') : t('disconnected'))}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-400">{t('max_logs')}:</span>
                      <span className="text-gray-300 font-mono">1000</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 中間/右側面板 */}
            <div className={`
              ${showLeftPanel ? (showRightPanel ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-8 xl:col-span-9') : (showRightPanel ? 'lg:col-span-12' : 'hidden')}
              transition-all duration-300 ease-in-out flex flex-col pointer-events-auto
            `}>
              {showRightPanel && (
                <div className="flex-1 overflow-hidden flex flex-col bg-gray-900/40 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl tour-table">
                  <LiveTable />
                </div>
              )}
            </div>
          </main>

          <footer className="mt-4 text-center text-gray-500 text-[10px] uppercase tracking-widest pointer-events-none">
            &copy; {new Date().getFullYear()} 零曜科技有限公司 Zeroflare Technology Co., Ltd. All rights reserved.
          </footer>
        </div>
      </div>
  );
}

export default App;
