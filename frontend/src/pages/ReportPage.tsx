import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useDnsStore } from '../stores/useDnsStore';
import { ReportView } from '../components/ReportView';
import { decodeReportData } from '../utils/reportShare';
import { Zap } from 'lucide-react';

/**
 * ReportPage — 獨立全頁報告檢視器
 *
 * 透過 /report?zdata=<compressed> 存取，解碼後顯示 ReportView。
 */
const ReportPage: React.FC = () => {
  const { theme } = useDnsStore();
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

  return (
    <ReportView
      data={reportData}
      onClose={() => window.close()}
      onEdit={() => {}}
      standalone
    />
  );
};

export default ReportPage;
