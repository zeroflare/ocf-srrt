import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Link as LinkIcon, X, Check, Pencil, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReportData } from '../types/report';
import { SiteHeader, Hero, SectionHeading, SiteFooter } from './SiteHeader';
import { MapSection } from './MapSection';
import { TopCards } from './TopCards';
import { LiveTable } from './LiveTable';
import { useDnsStore } from '../stores/useDnsStore';
import { formatDateTime } from '../utils/formatTime';

interface ReportViewProps {
  data: ReportData;
  onClose: () => void;
  onEdit: () => void;
  standalone?: boolean;
}

const BRAND_LABELS: Record<string, string> = {
  apple: 'Apple',
  google: 'Google',
  motorola: 'Motorola',
  samsung: 'Samsung',
  xiaomi: '小米',
  huawei: '華為',
  oppo: 'OPPO',
  vivo: 'vivo',
  other: '其他',
};

/**
 * ReportView — 分享報告快照頁面
 *
 * 與 wireframe `report.html` 相同：完全沿用主 dashboard 的版面
 * （地圖 + 統計卡 + Top 5 + 即時 DNS 查詢表格），不另起一套版型。
 * 透過 useEffect 把 snapshot records 灌進 useDnsStore，
 * 讓底下三個元件 (MapSection / TopCards / LiveTable) 直接以「shared report」模式運作。
 */
export const ReportView: React.FC<ReportViewProps> = ({ data, onClose, onEdit, standalone = false }) => {
  const { t, i18n } = useTranslation();
  const { records, appInfo, generatedAt, phoneBrand } = data;
  const [copied, setCopied] = useState(false);

  const loadSnapshot = useDnsStore((s) => s.loadSnapshot);
  const setSharedReport = useDnsStore((s) => s.setSharedReport);
  const setMonitoringIp = useDnsStore((s) => s.setMonitoringIp);
  const selectAllLoaded = useDnsStore((s) => s.selectAllLoaded);
  const clearSelection = useDnsStore((s) => s.clearSelection);

  // 進入頁面即把 snapshot records 寫進 store，並切換到「shared report」模式
  // 注意：setMonitoringIp 必須先於 loadSnapshot，loadSnapshot 內會檢查 monitoringIp 才會 commit records
  useEffect(() => {
    setSharedReport(true);
    if (records.length > 0) {
      setMonitoringIp(records[0].sourceIp || null);
    }
    loadSnapshot(records);
    // 分享報告預設所有紀錄都已勾選（符合 wireframe「報告 = 已勾選紀錄」的預期）
    selectAllLoaded();
    return () => {
      setSharedReport(false);
      clearSelection();
    };
  }, [records, loadSnapshot, setSharedReport, setMonitoringIp, selectAllLoaded, clearSelection]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const heroTitle = appInfo.appName ? `${appInfo.appName} — ${t('report_heading')}` : t('report_heading');
  const heroSubtitle = useMemo(
    () => [
      t('report_generated_at', { time: formatDateTime(generatedAt, i18n.language) }),
      phoneBrand ? t('report_observed_on', { brand: BRAND_LABELS[phoneBrand] || phoneBrand }) : null,
    ].filter(Boolean).join(' · '),
    [generatedAt, phoneBrand, i18n.language, t],
  );

  return (
    <div className={`${standalone ? 'min-h-screen' : 'fixed inset-0 z-[9998] overflow-y-auto'} w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased flex flex-col`}>
      <SiteHeader />

      {/* 報告快照 banner（與 wireframe 同款 amber 提示列） */}
      <div className="border-b border-amber-200/90 bg-amber-50/95 text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/50 dark:text-amber-50">
        <div className="max-w-7xl mx-auto px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-start gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="font-bold text-amber-900 dark:text-amber-100">{t('report_snapshot_title')}</p>
              <p className="mt-0.5 text-xs sm:text-sm text-amber-900/85 dark:text-amber-100/90">
                {t('report_snapshot_generated')}: {formatDateTime(generatedAt, i18n.language)} · {records.length} {t('report_snapshot_rows')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300/80 dark:border-amber-600/50 text-amber-950 dark:text-amber-100 font-bold uppercase hover:bg-amber-100/90 dark:hover:bg-slate-800"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
              {copied ? t('dns_setup_copied') : t('report_copy_link')}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold uppercase"
            >
              <Printer className="h-3.5 w-3.5" />
              {t('report_print')}
            </button>
            {!standalone && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300/80 dark:border-amber-600/50 text-amber-950 dark:text-amber-100 font-bold uppercase hover:bg-amber-100/90"
              >
                <Pencil className="h-3.5 w-3.5" />
                {t('report_edit')}
              </button>
            )}
            <a href="/" className="text-xs sm:text-sm font-bold uppercase text-amber-900 dark:text-amber-300 hover:underline px-1">
              {t('report_open_wireframe')}
            </a>
            {!standalone && (
              <button onClick={onClose} className="p-1 rounded hover:bg-amber-200/40 dark:hover:bg-amber-700/30" title="Close">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <Hero variant="subtitle" title={heroTitle} subtitle={heroSubtitle} />

      <main className="flex-1 w-full">
        <div className="max-w-7xl mx-auto flex flex-col gap-[60px] px-5 py-6 sm:py-8">
          {/* 檢視 DNS 分佈：地圖 + 統計 + Top 5（與主頁同一組元件） */}
          <div className="flex flex-col gap-[16px]">
            <SectionHeading variant="inline">{t('section_view_dns_distribution')}</SectionHeading>
            <div className="flex flex-col gap-4">
              <MapSection />
              <TopCards />
            </div>
          </div>

          {/* 即時 DNS 查詢表格（report 模式下無 onOpenReport，按鈕會 disabled） */}
          <LiveTable />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};
