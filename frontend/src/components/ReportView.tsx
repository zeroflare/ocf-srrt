import React from 'react';
import { X, Pencil, Share2, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReportData } from './ReportModal';
import { detectCloudProvider } from '../utils/cloudProvider';

interface ReportViewProps {
  data: ReportData;
  onClose: () => void;
  onEdit: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ data, onClose, onEdit }) => {
  const { t } = useTranslation();
  const { records, appInfo, generatedAt } = data;

  const domesticCount = records.filter(r => !r.isForeign).length;
  const foreignCount = records.filter(r => r.isForeign).length;
  const domesticPct = records.length > 0 ? ((domesticCount / records.length) * 100).toFixed(1) : '0';

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div className="fixed inset-0 z-[9998] bg-white dark:bg-slate-950 overflow-y-auto transition-colors">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200 dark:border-white/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {appInfo.appLogoUrl && (
              <img
                src={appInfo.appLogoUrl}
                alt={appInfo.appName}
                className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-white/10"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">{appInfo.appName}</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">{t('report_title')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(appInfo.websiteUrl || appInfo.appleStoreUrl || appInfo.googlePlayUrl) && (
              <div className="flex items-center gap-1.5 mr-2">
                {appInfo.websiteUrl && (
                  <a href={appInfo.websiteUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-cyan-500 transition-colors" title="Website">
                    <Globe className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
            <button onClick={handleShare} className="p-2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors rounded-lg border border-slate-200 dark:border-white/10" title={t('share_data')}>
              <Share2 className="h-4 w-4" />
            </button>
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors rounded-lg border border-slate-200 dark:border-white/10">
              <Pencil className="h-3.5 w-3.5" />
              {t('report_edit')}
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors rounded-lg border border-slate-200 dark:border-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* 統計卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label={t('report_total')} value={records.length} color="slate" />
          <StatCard label={t('report_domestic')} value={domesticCount} color="emerald" />
          <StatCard label={t('report_foreign')} value={foreignCount} color="red" />
          <StatCard label={t('report_domestic_pct')} value={`${domesticPct}%`} color="blue" />
        </div>

        {/* DNS 查詢記錄表格 */}
        <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                {[t('time'), t('domain'), 'IP', 'ASN', 'ISP', t('country'), 'TYPE', t('report_cloud'), t('app'), t('report_status')].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {records.map((r, i) => {
                const provider = detectCloudProvider(r.isp);
                return (
                  <tr key={i} className="hover:bg-cyan-500/5 transition-colors">
                    <td className="px-3 py-2 text-slate-400 font-mono whitespace-nowrap">{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 text-cyan-600 dark:text-cyan-400 max-w-[200px] truncate">{r.domain}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-mono">{r.resultIp}</td>
                    <td className="px-3 py-2 text-slate-400 dark:text-slate-500 font-mono">{r.asn}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 max-w-[120px] truncate">{r.isp}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.isForeign ? 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                        {r.country}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.type === 'A' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-purple-500/20 text-purple-600 dark:text-purple-400'}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {provider ? (
                        <span className={`text-[9px] font-bold px-1 rounded uppercase ${provider.colorClass}`}>{provider.name}</span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[100px] truncate">{r.appName}</td>
                    <td className="px-3 py-2">
                      {r.isForeign ? (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          <span className="text-red-600 dark:text-red-400 text-[10px] font-bold uppercase">{t('report_foreign')}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase">{t('report_domestic')}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-white/10 text-center text-[10px] text-slate-400 dark:text-slate-600 font-mono uppercase tracking-widest">
          {t('report_generated_at', { time: new Date(generatedAt).toLocaleString() })}
          <span className="mx-2">·</span>
          &copy; {new Date().getFullYear()} ZEROFLARE TECH
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number | string; color: string }> = ({ label, value, color }) => {
  const colors: Record<string, string> = {
    slate: 'bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    red: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
    blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
  };
  return (
    <div className={`${colors[color]} rounded-xl p-4 text-center border border-slate-100 dark:border-white/5`}>
      <div className="text-2xl font-bold font-mono">{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
};
