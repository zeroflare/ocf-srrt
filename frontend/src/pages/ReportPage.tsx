import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDnsStore } from '../stores/useDnsStore';
import { ReportView } from '../components/ReportView';
import { decodeReportData } from '../utils/reportShare';
import { Zap, Sun, Moon } from 'lucide-react';

/**
 * ReportPage — 獨立全頁報告檢視器
 *
 * 透過 /report?zdata=<compressed> 存取，解碼後顯示 ReportView。
 */
const ReportPage: React.FC = () => {
  const { i18n } = useTranslation();
  const { theme, toggleTheme } = useDnsStore();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const reportData = useMemo(() => {
    const zdata = searchParams.get('zdata');
    if (!zdata) return null;
    return decodeReportData(zdata);
  }, [searchParams]);

  if (!reportData) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center text-rose-500 space-y-4">
        <Zap className="h-12 w-12 animate-bounce" />
        <p className="font-mono text-sm uppercase">無效的報告資料</p>
      </div>
    );
  }

  const isDark = theme === 'dark';

  return (
    <div className="relative">
      {/* 浮動主題 + 語言切換按鈕 */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en')}
          className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg ${isDark ? 'bg-slate-800 border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40' : 'bg-white border-slate-200 text-slate-500 hover:text-cyan-600 hover:border-cyan-300'}`}
        >
          {i18n.language === 'en' ? '中文' : 'EN'}
        </button>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg border text-xs transition-all shadow-lg ${isDark ? 'bg-slate-800 border-white/10 text-slate-400 hover:text-amber-400 hover:border-amber-500/40' : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300'}`}
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <ReportView
        data={reportData}
        onClose={() => window.close()}
        onEdit={() => {}}
        standalone
      />
    </div>
  );
};

export default ReportPage;
