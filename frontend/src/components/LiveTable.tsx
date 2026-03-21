import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord } from '../types';
import { useTranslation } from 'react-i18next';
import { Trash2, Download, Search, Share2, SlidersHorizontal, Radio, Filter, FileText } from 'lucide-react';
import { AppInfoTooltip } from './AppInfoTooltip';
import { getAppInfoByName } from '../utils/appInfo';
import { detectCloudProvider } from '../utils/cloudProvider';
import { Link } from 'react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  VisibilityState,
} from '@tanstack/react-table';

const columnHelper = createColumnHelper<DnsRecord>();

/** 推測標記 badge — 小型標籤顯示推測來源 */
const InferenceBadge: React.FC<{ label: string; tooltip: string; color?: 'amber' | 'slate' }> = ({ label, tooltip, color = 'amber' }) => (
  <span
    title={tooltip}
    className={`inline-flex items-center ml-1 px-1 py-px rounded text-[8px] font-bold leading-none cursor-help ${
      color === 'amber'
        ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
    }`}
  >
    {label}
  </span>
);

interface LiveTableProps {
  onOpenReport?: () => void;
}

export const LiveTable: React.FC<LiveTableProps> = ({ onOpenReport }) => {
  const { t } = useTranslation();
  const { records, clearRecords, exportToUrl, maxRecords, monitoringIp, selectedRowIds, toggleRowSelection, toggleAllSelection } = useDnsStore();
  const [globalFilter, setGlobalFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // null = 全選（未操作），Set = 僅顯示 Set 內的 OS（可為空 = 只顯示無 OS 標記的）
  const [enabledOs, setEnabledOs] = useState<Set<string> | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    sourceIp: false,
    type: false,
  });

  // Track previous record count for flash animation
  const prevRecordCountRef = useRef(records.length);
  const newRowCountRef = useRef(0);

  useEffect(() => {
    const diff = records.length - prevRecordCountRef.current;
    if (diff > 0) {
      newRowCountRef.current = diff;
    } else {
      newRowCountRef.current = 0;
    }
    prevRecordCountRef.current = records.length;
  }, [records]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2000);
  }, []);

  const handleShare = () => {
    const url = exportToUrl();
    navigator.clipboard.writeText(url);
    showToast(t('share_copied', { count: maxRecords }));
  };

  // Filter records by category and OS (moved before columns for checkbox dep)
  const filteredRecords = useMemo(() => {
    let result = records;
    if (categoryFilter) {
      result = result.filter(r => r.appCategory === categoryFilter);
    }
    // OS toggle filter：null = 全選不過濾，Set = 只顯示 Set 內的（空 Set = 只顯示無 OS 標記的）
    if (enabledOs !== null) {
      result = result.filter(r => !r.os || enabledOs.has(r.os));
    }
    return result;
  }, [records, categoryFilter, enabledOs]);

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: () => {
        const allIds = filteredRecords.map(r => r._id);
        const allSelected = allIds.length > 0 && allIds.every(id => selectedRowIds.has(id));
        return (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => toggleAllSelection(allIds)}
            className="rounded border-slate-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500/30"
          />
        );
      },
      cell: info => (
        <input
          type="checkbox"
          checked={selectedRowIds.has(info.row.original._id)}
          onChange={() => toggleRowSelection(info.row.original._id)}
          className="rounded border-slate-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500/30"
        />
      ),
      size: 32,
    }),
    columnHelper.accessor('timestamp', {
      id: 'timestamp',
      header: t('time'),
      cell: info => <span className="text-slate-400 dark:text-gray-400 font-mono text-xs">{new Date(info.getValue()).toLocaleTimeString()}</span>,
      size: 100,
    }),
    columnHelper.accessor('sourceIp', {
      id: 'sourceIp',
      header: t('source'),
      cell: info => <span className="text-blue-600 dark:text-blue-300 font-mono text-xs">{info.getValue()}</span>,
      size: 120,
    }),
    columnHelper.accessor('appName', {
      id: 'appName',
      header: t('app'),
      cell: info => {
        const row = info.row.original;
        const appName = row.appName;
        const matchMethod = row.appMatchMethod;
        const isHeuristic = matchMethod === 'heuristic';
        const appInfo = getAppInfoByName(appName);

        const badge = isHeuristic ? (
          <InferenceBadge label={t('inferred_short')} tooltip={t('inferred_app_heuristic')} />
        ) : null;

        if (appInfo) {
          return (
            <AppInfoTooltip appInfo={appInfo}>
              {appInfo.appIconUrl && (
                <img
                  src={appInfo.appIconUrl}
                  alt={appName}
                  className="w-3.5 h-3.5 rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span className="text-slate-600 dark:text-slate-300">{appName}</span>
              {badge}
            </AppInfoTooltip>
          );
        }
        return (
          <span className="flex items-center">
            <span className="text-slate-600 dark:text-slate-300">{appName}</span>
            {badge}
          </span>
        );
      },
      size: 150,
    }),
    columnHelper.accessor('type', {
      id: 'type',
      header: t('type'),
      cell: info => (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          info.getValue() === 'A' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
            info.getValue() === 'AAAA' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
        }`}>
          {info.getValue()}
        </span>
      ),
      size: 60,
    }),
    columnHelper.accessor('domain', {
      id: 'domain',
      header: t('domain'),
      cell: info => (
        <Link
          to={`/traceroute?target=${encodeURIComponent(info.getValue())}`}
          className="text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
          title={t('start_traceroute')}
          target="_blank"
          rel="noopener noreferrer"
        >
          {info.getValue()}
        </Link>
      ),
      size: 250,
    }),
    columnHelper.accessor('resultIp', {
      id: 'resultIp',
      header: t('result_ip'),
      cell: info => (
        <Link
          to={`/traceroute?target=${encodeURIComponent(info.getValue())}`}
          className="text-slate-600 dark:text-slate-300 font-mono hover:underline hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer"
          title={t('start_traceroute')}
          target="_blank"
          rel="noopener noreferrer"
        >
          {info.getValue()}
        </Link>
      ),
      size: 160,
    }),
    columnHelper.accessor('country', {
      id: 'country',
      header: t('country'),
      cell: info => {
        const country = info.getValue();
        const row = info.row.original;
        const localCountry = useDnsStore.getState().localCountry;
        const isLocal = localCountry ? country === localCountry : country === 'TW';
        const confidence = row.foreignConfidence;
        return (
          <div className="flex items-center gap-1.5">
            {row.isForeign && confidence === 'high' ? (
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]" title={t('country')} />
            ) : row.isForeign && confidence === 'low' ? (
              <div className="w-2 h-2 rounded-full border border-orange-400 bg-transparent" title={t('confidence_low')} />
            ) : (
              <div className={`w-1.5 h-1.5 rounded-full ${isLocal ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-700'}`} />
            )}
            <span className="text-slate-600 dark:text-slate-400">{country}</span>
            {country && (
              <InferenceBadge label="GeoIP" tooltip={t('inferred_geoip')} color="slate" />
            )}
            {row.isForeign && confidence === 'low' && (
              <span className="text-[9px] text-orange-400 dark:text-orange-500" title={t('confidence_low')}>?</span>
            )}
          </div>
        );
      },
      size: 80,
    }),
    columnHelper.accessor('isp', {
      id: 'isp',
      header: t('asn') + '/ISP',
      cell: info => {
        const isp = info.getValue();
        const provider = detectCloudProvider(isp);
        return (
          <div className="flex flex-col gap-1 max-w-[150px]">
            <div className="text-xs truncate text-slate-500 dark:text-gray-500 group relative cursor-help">
              <span className="text-slate-400 dark:text-gray-600 mr-1 block text-[10px]">AS{info.row.original.asn}</span>
              {isp}
            </div>
            {provider && (
              <div className="flex">
                <span className={`text-[9px] font-bold px-1 rounded uppercase tracking-tighter ${provider.colorClass}`}>
                  {provider.name}
                </span>
              </div>
            )}
          </div>
        );
      },
    }),
  ], [t, selectedRowIds, toggleRowSelection, toggleAllSelection, filteredRecords]);

  const allColumnIds = useMemo(() => columns.map(c => (c as any).id as string).filter(id => id !== 'select'), [columns]);
  const columnLabels: Record<string, string> = {
    timestamp: t('time'),
    sourceIp: t('source') + ' IP',
    appName: t('app'),
    type: t('type'),
    domain: t('domain'),
    resultIp: t('result_ip'),
    country: t('country'),
    isp: 'ASN/ISP',
  };

  // Derive available categories from records
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const r of records) {
      if (r.appCategory) cats.add(r.appCategory);
    }
    return Array.from(cats).sort();
  }, [records]);

  // Derive available OS types from records
  const availableOsTypes = useMemo(() => {
    const osSet = new Set<string>();
    for (const r of records) {
      if (r.os) osSet.add(r.os);
    }
    return Array.from(osSet).sort();
  }, [records]);

  const table = useReactTable({
    data: filteredRecords,
    columns,
    state: {
      globalFilter,
      columnVisibility,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const exportToCSV = () => {
    const headers = ['Time', 'Source IP', 'App', 'Category', 'Domain', 'Type', 'Result IP', 'Country', 'ASN', 'ISP'];
    const rows = records.map(r => [
      new Date(r.timestamp).toISOString(),
      r.sourceIp,
      `"${r.appName}"`,
      `"${r.appCategory}"`,
      r.domain,
      r.type,
      r.resultIp,
      r.country,
      r.asn,
      `"${r.isp}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dns_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const visibleColumnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="bg-white dark:bg-slate-950/80 text-slate-800 dark:text-white flex flex-col h-full tour-table font-mono transition-colors relative">
      {/* Toast */}
      <div
        className={`absolute top-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-xs font-sans font-bold shadow-lg border transition-all duration-300 ${
          toastMessage
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        } bg-cyan-50 dark:bg-cyan-900/80 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30`}
      >
        {toastMessage}
      </div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-white/5">
        <div className="relative group">
          <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-400 dark:text-slate-500 group-focus-within:text-cyan-600 dark:group-focus-within:text-cyan-400 transition-colors" />
          <input
            type="text"
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder={t('search_placeholder')}
            className="pl-7 pr-3 py-1 bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded text-[10px] focus:outline-none focus:border-cyan-500/50 w-48 text-slate-600 dark:text-slate-300 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
          {/* Column visibility toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[10px] font-bold uppercase tracking-wider"
              title={t('columns')}
            >
              <SlidersHorizontal className="h-3 w-3" />
              {t('columns')}
            </button>
            {showColumnPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 p-3 min-w-[160px]">
                {allColumnIds.map(colId => (
                  <label key={colId} className="flex items-center gap-2 py-1 cursor-pointer text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                    <input
                      type="checkbox"
                      checked={columnVisibility[colId] !== false}
                      onChange={() => {
                        setColumnVisibility(prev => ({
                          ...prev,
                          [colId]: prev[colId] === false ? true : false,
                        }));
                      }}
                      className="rounded border-slate-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500/30"
                    />
                    {columnLabels[colId] || colId}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onOpenReport}
            disabled={selectedRowIds.size === 0}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              selectedRowIds.size > 0
                ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 border border-cyan-200 dark:border-cyan-500/30'
                : 'opacity-30 cursor-not-allowed'
            }`}
            title={t('report_export')}
          >
            <FileText className="h-3 w-3" />
            {t('report_export')}
            {selectedRowIds.size > 0 && (
              <span className="ml-0.5 bg-cyan-600 dark:bg-cyan-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {selectedRowIds.size}
              </span>
            )}
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[10px] font-bold uppercase tracking-wider"
            title={t('share_data')}
          >
            <Share2 className="h-3 w-3" />
            {t('share_data')}
          </button>

          <div className="h-3 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <button
            onClick={exportToCSV}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[10px] font-bold uppercase tracking-wider"
            title={t('export_csv')}
          >
            <Download className="h-3 w-3" />
            {t('export_csv')}
          </button>

          <div className="h-3 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <button
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors text-[10px] font-bold uppercase tracking-wider"
            onClick={clearRecords}
            title={t('clear')}
          >
            <Trash2 className="h-3 w-3" />
            {t('clear')}
          </button>
        </div>
      </div>

      {/* Filters: Category + OS merged */}
      {(availableCategories.length > 0 || availableOsTypes.length > 0) && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-white/5 overflow-x-auto flex-wrap">
          <Filter className="h-3 w-3 text-slate-400 dark:text-slate-600 shrink-0" />
          {/* Category chips */}
          {availableCategories.length > 0 && (
            <>
              <button
                onClick={() => setCategoryFilter(null)}
                className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-all ${
                  !categoryFilter
                    ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/40'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border border-transparent'
                }`}
              >
                {t('all')}
              </button>
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                  className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-all ${
                    categoryFilter === cat
                      ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/40'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border border-transparent'
                  }`}
                >
                  {t(`cat_${cat.toLowerCase()}`, cat)}
                </button>
              ))}
            </>
          )}
          {/* Separator if both exist */}
          {availableCategories.length > 0 && availableOsTypes.length > 0 && (
            <div className="h-3 w-px bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
          )}
          {/* OS toggle chips — 全亮 = 不過濾，點擊切換開/關 */}
          {availableOsTypes.length > 0 && (
            <>
              {availableOsTypes.map(os => {
                const isActive = enabledOs === null || enabledOs.has(os);
                return (
                  <button
                    key={os}
                    onClick={() => {
                      setEnabledOs(prev => {
                        if (prev === null) {
                          // 從「全選」狀態 → 關掉這一個 = 啟用其他所有
                          const next = new Set<string>();
                          for (const o of availableOsTypes) {
                            if (o !== os) next.add(o);
                          }
                          return next;
                        }
                        const next = new Set(prev);
                        if (next.has(os)) {
                          next.delete(os);
                        } else {
                          next.add(os);
                        }
                        // 全部重新啟用 → 回到 null（全選）
                        if (next.size === availableOsTypes.length) return null;
                        return next;
                      });
                    }}
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-all border ${
                      isActive
                        ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-500/40'
                        : 'text-slate-400/40 dark:text-slate-600 border-transparent line-through decoration-slate-300 dark:decoration-slate-600'
                    }`}
                  >
                    {t(`os_${os.toLowerCase()}`, os)}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Table Content */}
      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="min-w-full text-[11px]">
          <thead className="bg-slate-50 dark:bg-slate-950 sticky top-0 z-10 transition-colors">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th key={header.id} className="px-4 py-3 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row, index) => (
              <tr
                key={row.id}
                className={`hover:bg-cyan-500/5 transition-colors group ${index < newRowCountRef.current ? 'animate-row-flash' : ''} ${selectedRowIds.has(row.original._id) ? 'bg-cyan-500/10 dark:bg-cyan-500/5' : ''}`}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-2 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={visibleColumnCount} className="p-12 text-center text-slate-400 dark:text-slate-600 transition-colors">
                <div className="flex flex-col items-center gap-3">
                  <Radio className="h-8 w-8 opacity-20 animate-pulse" />
                  <div>
                    <p className="text-sm font-bold">{t('table_empty_title')}</p>
                    <p className="text-xs mt-1 opacity-60">
                      {!monitoringIp ? t('table_empty_hint_no_ip') : t('table_empty_hint_waiting')}
                    </p>
                  </div>
                </div>
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
