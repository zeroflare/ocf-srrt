import { useDnsStream } from './hooks/useDnsStream';
import { LiveTable } from './components/LiveTable';
import { TrafficDashboard } from './components/TrafficDashboard';
import { CyberMap } from './components/CyberMap';
import { useTranslation } from 'react-i18next';

function App() {
  // [SRE] 獲取真實連線狀態，用於監控儀表板
  const isConnected = useDnsStream();

  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en');
  };

  return (
      <div className="min-h-screen bg-gray-900 text-white p-4 font-sans">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-blue-400">
            {t('title')}
          </h1>
          <div className="flex gap-4">
            <button
                onClick={toggleLanguage}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors font-mono"
            >
              {i18n.language === 'en' ? '中文' : 'EN'}
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Dashboard & Map */}
          <div className="lg:col-span-1 space-y-6">
            <TrafficDashboard />
            <CyberMap />

            {/* System Status Panel */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
              <h3 className="text-lg font-bold mb-2 text-gray-200">
                {t('system_status')}
              </h3>
              <div className="space-y-2 text-sm">

                {/* Local Country */}
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('local_country')}:</span>
                  <span className="text-blue-400 font-mono">TW</span>
                </div>

                {/* WebSocket Status (Real-time) */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">{t('websocket_status')}:</span>
                  <span className={`font-mono font-bold flex items-center gap-2 ${
                      isConnected ? 'text-green-400' : 'text-red-500 animate-pulse'
                  }`}>
                    {/* 燈號指示器 */}
                    <span className={`w-2 h-2 rounded-full ${
                        isConnected ? 'bg-green-400' : 'bg-red-500'
                    }`}></span>
                    {isConnected ? t('connected') : t('disconnected')}
                  </span>
                </div>

                {/* Buffer Size */}
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('max_logs')}:</span>
                  <span className="text-gray-300 font-mono">1000</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Table */}
          <div className="lg:col-span-2">
            <LiveTable />
          </div>
        </main>

        <footer className="mt-8 text-center text-gray-500 text-xs">
          &copy; {new Date().getFullYear()} DNS Analyzer (SRRT) - Privacy First, RAM Only
        </footer>
      </div>
  );
}

export default App;