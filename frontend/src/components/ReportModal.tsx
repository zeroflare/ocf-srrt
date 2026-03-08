import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DnsRecord } from '../types';

export interface AppInfo {
  appName: string;
  appLogoUrl: string;
  appleStoreUrl: string;
  googlePlayUrl: string;
  websiteUrl: string;
}

export interface ReportData {
  records: DnsRecord[];
  appInfo: AppInfo;
  generatedAt: string;
}

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: ReportData) => void;
  selectedRecords: DnsRecord[];
  initialAppInfo?: AppInfo;
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, onGenerate, selectedRecords, initialAppInfo }) => {
  const { t } = useTranslation();
  const [appName, setAppName] = useState(initialAppInfo?.appName || '');
  const [appLogoUrl, setAppLogoUrl] = useState(initialAppInfo?.appLogoUrl || '');
  const [appleStoreUrl, setAppleStoreUrl] = useState(initialAppInfo?.appleStoreUrl || '');
  const [googlePlayUrl, setGooglePlayUrl] = useState(initialAppInfo?.googlePlayUrl || '');
  const [websiteUrl, setWebsiteUrl] = useState(initialAppInfo?.websiteUrl || '');

  if (!isOpen) return null;

  const domesticCount = selectedRecords.filter(r => !r.isForeign).length;
  const foreignCount = selectedRecords.filter(r => r.isForeign).length;
  const domesticPct = selectedRecords.length > 0 ? ((domesticCount / selectedRecords.length) * 100).toFixed(1) : '0';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim()) return;
    onGenerate({
      records: selectedRecords,
      appInfo: { appName: appName.trim(), appLogoUrl, appleStoreUrl, googlePlayUrl, websiteUrl },
      generatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">{t('report_export')}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 摘要統計 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 font-mono">{selectedRecords.length}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t('report_total')}</div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">{domesticCount}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t('report_domestic')}</div>
            </div>
            <div className="bg-red-50 dark:bg-red-500/10 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-red-600 dark:text-red-400 font-mono">{foreignCount}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t('report_foreign')}</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400 font-mono">{domesticPct}%</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t('report_domestic_pct')}</div>
            </div>
          </div>

          {/* App 資訊表單 */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                {t('report_app_name')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors"
                placeholder="e.g. LINE"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{t('report_app_logo')}</label>
              <input
                type="url"
                value={appLogoUrl}
                onChange={e => setAppLogoUrl(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors"
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Apple Store</label>
                <input
                  type="url"
                  value={appleStoreUrl}
                  onChange={e => setAppleStoreUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors"
                  placeholder="https://apps.apple.com/..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Google Play</label>
                <input
                  type="url"
                  value={googlePlayUrl}
                  onChange={e => setGooglePlayUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors"
                  placeholder="https://play.google.com/..."
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{t('report_website')}</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:border-cyan-500 focus:outline-none transition-colors"
                placeholder="https://..."
              />
            </div>
          </div>

          {/* 按鈕 */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!appName.trim()}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg text-sm font-bold transition-all shadow-lg disabled:shadow-none"
            >
              {t('report_generate')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
