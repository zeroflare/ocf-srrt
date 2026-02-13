import { useState, useEffect } from 'react';
import pako from 'pako';
import { useDnsStore } from './stores/useDnsStore';
import { DnsRecord } from './types';
import { useDnsStream } from './hooks/useDnsStream';
import { useMockDnsStream } from './hooks/useMockDnsStream';
import { LiveTable } from './components/LiveTable';
import { TrafficDashboard } from './components/TrafficDashboard';
import { LiveTrafficChart } from './components/LiveTrafficChart';
import { CyberMap } from './components/CyberMap';
import { useTranslation } from 'react-i18next';
import { Shield, Search, Activity, LayoutPanelLeft } from 'lucide-react';
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
  const [showRightPanel, setShowRightPanel] = useState(true);

  const { t, i18n } = useTranslation();

  const formatTourContent = (text: string) => {
    return (
        <div style={{ whiteSpace: 'pre-line', textAlign: 'left' }}>
          {text.split('\n').map((line, i) => {
            const trimmedLine = line.trim();

            // 1. 處理分隔線 (---)
            if (trimmedLine === '---') {
              return <hr key={i} style={{ border: '0', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 0' }} />;
            }

            // 2. 處理作業系統步驟 (支援 Windows, macOS, iOS, Android)
            // 使用 Regex 確保中英文都能偵測到
            if (/Windows|macOS|iOS|Android/.test(line) && line.includes(':')) {
              const [platform, ...rest] = line.split(':');
              return (
                  <p key={i} style={{ margin: '6px 0', fontSize: '13px' }}>
                    <strong style={{ color: '#f1f5f9' }}>{platform}:</strong>
                    <span style={{ color: '#94a3b8' }}>{rest.join(':')}</span>
                  </p>
              );
            }

            // 3. 處理主要的 DNS IP 設定區塊 (偵測 Primary/Secondary 或 主要/備援)
            if (/Primary|Secondary|主要|備援/.test(line) && line.includes('`')) {
              return (
                  <div key={i} style={{
                    margin: '8px 0',
                    padding: '10px 14px',
                    backgroundColor: 'rgba(34, 211, 238, 0.08)',
                    borderLeft: '4px solid #22d3ee',
                    borderRadius: '4px'
                  }}>
                    {line.split('`').map((part, index) =>
                        index % 2 === 1
                            ? <code key={index} style={{ color: '#22d3ee', fontWeight: 'bold', fontSize: '15px', fontFamily: 'monospace' }}>{part}</code>
                            : <span key={index} style={{ color: '#cbd5e1' }}>{part}</span>
                    )}
                  </div>
              );
            }

            // 4. 警告語處理 (⚠️)
            if (line.includes('⚠️')) {
              return (
                  <div key={i} style={{
                    marginTop: '16px',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    color: '#fbbf24',
                    fontSize: '12.5px',
                    lineHeight: '1.5',
                    border: '1px solid rgba(251, 191, 36, 0.2)'
                  }}>
                    {line}
                  </div>
              );
            }

            // 5. 一般文字
            return <p key={i} style={{ margin: '4px 0', color: '#94a3b8' }}>{line}</p>;
          })}
        </div>
    );
  };

  const tourSteps: Step[] = [
    {
      target: 'body',
      placement: 'center',
      title: t('tour_welcome_title'),
      content: formatTourContent(t('tour_welcome_content')),
    },
    {
      target: 'body',
      placement: 'center',
      title: t('tour_setup_title'),
      content: formatTourContent(t('tour_setup_content')),
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
              primaryColor: '#22d3ee',
              backgroundColor: '#0f172a',
              textColor: '#f1f5f9',
              arrowColor: '#0f172a',
              width: 500,
            },
            tooltip: {
              borderRadius: '16px',
              padding: '24px',
            },
            tooltipContainer: {
              textAlign: 'left',
            },
            tooltipTitle: {
              fontSize: '20px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#22d3ee',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            },
            tooltipContent: {
              fontSize: '14px',
              lineHeight: '1.6',
              color: '#94a3b8',
            },
            buttonNext: {
              backgroundColor: 'rgba(6, 182, 212, 0.2)',
              border: '1px solid rgba(34, 211, 238, 0.5)',
              color: '#22d3ee',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 'bold',
            },
            buttonBack: {
              color: '#64748b',
              marginRight: '12px',
              fontSize: '12px',
            },
            buttonSkip: {
              color: '#64748b',
              fontSize: '12px',
            }
          }}
          locale={{
            next: t('next'),
            back: t('back'),
            last: t('last'),
            skip: t('skip')
          }}
        />

        {/* 版面配置：左側地圖，右側儀表板 */}
        <div className="flex w-full h-full">
          {/* 左側地圖區域 */}
          <div className="flex-1 relative min-w-0">
            <CyberMap />
          </div>

          {/* 右側資訊面板 (固定寬度) */}
          {showRightPanel && (
            <aside className="w-[550px] bg-slate-950 border-l border-white/10 flex flex-col z-10 pointer-events-auto">
              {/* 頂部標題 */}
              <div className="p-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <Shield className="h-6 w-6 text-cyan-400" />
                      <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase font-sans">
                        {t('title')}
                      </h1>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 mt-1 tracking-[0.2em] uppercase">
                      Live Monitoring System
                    </div>
                  </div>
                  <button
                    onClick={toggleLanguage}
                    className="px-3 py-1.5 bg-slate-900/60 hover:bg-slate-800/80 rounded-lg text-xs transition-all font-mono border border-white/10 shadow-lg"
                  >
                    {i18n.language === 'en' ? '中文' : 'EN'}
                  </button>
                </div>
              </div>

              {/* 中間滾動區域：控制面板與統計圖 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {/* IP Monitoring Controller */}
                <div className="bg-slate-900/50 backdrop-blur-md p-5 rounded-xl border border-white/10 shadow-xl tour-monitoring">
                  <h3 className="text-xs font-bold mb-4 text-slate-400 flex items-center gap-2 uppercase tracking-wider font-sans">
                    <Search className="h-3.5 w-3.5 text-slate-500" />
                    {t('monitoring_control')}
                  </h3>
                  {!monitoringIp ? (
                    <div className="space-y-4">
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        前端監控目前已關閉。請輸入 Source IP 以開始監控特定裝置的封包。
                      </p>
                      {!isSharedReport && (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={ipInput}
                            onChange={(e) => setIpInput(e.target.value)}
                            placeholder="e.g. 192.168.1.5"
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-cyan-500/50 outline-none transition-colors text-slate-200"
                          />
                          <button
                            onClick={handleStartMonitoring}
                            className="w-full bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/50 text-cyan-400 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20 group"
                          >
                            <Activity className="h-4 w-4 group-hover:animate-pulse" />
                            啟動監控
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className={`flex items-center justify-between ${isSharedReport ? 'bg-amber-900/30 border-amber-500/30' : 'bg-cyan-900/30 border-cyan-500/30'} border p-3 rounded-lg`}>
                        <div>
                          <span className={`text-[9px] ${isSharedReport ? 'text-amber-300' : 'text-cyan-300'} block uppercase font-bold tracking-widest mb-1`}>
                            {isSharedReport ? t('shared_report_tag') : t('monitoring_active')}
                          </span>
                          <span className={`text-lg font-mono ${isSharedReport ? 'text-amber-400' : 'text-cyan-400'} font-bold`}>{monitoringIp}</span>
                        </div>
                        <button
                          onClick={handleStopMonitoring}
                          className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                          {t('stop')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Real-time Traffic Chart */}
                <LiveTrafficChart className="bg-slate-900/50" />

                {/* Traffic Stats Dashboard */}
                <div className="bg-slate-900/50 backdrop-blur-md rounded-xl border border-white/10 shadow-xl p-5">
                  <h3 className="text-xs font-bold mb-4 text-slate-400 flex items-center gap-2 uppercase tracking-wider font-sans">
                    <Activity className="h-3.5 w-3.5 text-slate-500" />
                    流量分析數據
                  </h3>
                  <TrafficDashboard className="p-0 bg-transparent border-none shadow-none" />
                </div>

                {/* System Status Panel */}
                <div className="bg-slate-900/50 backdrop-blur-md p-5 rounded-xl border border-white/10 shadow-xl">
                  <h3 className="text-xs font-bold mb-4 text-slate-400 uppercase tracking-wider font-sans">
                    {t('system_status')}
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center py-2 border-b border-white/5 font-mono">
                      <span className="text-slate-500 uppercase">{t('local_country')}:</span>
                      <span className="text-blue-400 font-bold bg-blue-400/10 px-2 py-0.5 rounded">TW</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-white/5 font-mono">
                      <span className="text-slate-500 uppercase">{t('websocket_status')}:</span>
                      <span className={`font-bold flex items-center gap-2 ${
                          isSharedReport ? 'text-amber-400' : (isConnected ? 'text-green-400' : 'text-red-500')
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                            isSharedReport ? 'bg-amber-400' : (isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-500')
                        }`}></span>
                        {isSharedReport ? t('static_report') : (isConnected ? t('connected') : t('disconnected'))}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 font-mono">
                      <span className="text-slate-500 uppercase">{t('max_logs')}:</span>
                      <span className="text-slate-300">1000</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部日誌表格區域 (佔據固定高度) */}
              <div className="h-[400px] flex flex-col border-t border-white/10 overflow-hidden tour-table">
                <LiveTable />
              </div>

              <footer className="p-4 text-center text-slate-600 text-[9px] uppercase tracking-widest bg-slate-950 border-t border-white/5">
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
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' 
                : 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white'
            }`}
            title={showRightPanel ? "隱藏資訊面板" : "顯示資訊面板"}
          >
            {showRightPanel ? <LayoutPanelLeft className="h-5 w-5 rotate-180" /> : <Activity className="h-5 w-5" />}
          </button>
        </div>
      </div>
  );
}

export default App;
