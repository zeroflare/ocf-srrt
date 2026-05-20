import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useDnsStore } from '../stores/useDnsStore';
import { ReportView } from '../components/ReportView';
import { decodeReportData } from '../utils/reportShare';
import { AlertTriangle } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../components/SiteHeader';

/**
 * ReportPage — 獨立全頁報告檢視器
 *
 * 透過 /report?zdata=<compressed> 存取，解碼後顯示 ReportView。
 */
const ReportPage: React.FC = () => {
  const { t } = useTranslation();
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
      <div className="min-h-screen w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <p className="font-mono text-sm uppercase">{t('report_invalid')}</p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return <ReportView data={reportData} onClose={() => window.close()} onEdit={() => {}} standalone />;
};

export default ReportPage;
