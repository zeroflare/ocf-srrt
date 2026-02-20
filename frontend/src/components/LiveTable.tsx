import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { useTracerouteStore } from '../stores/useTracerouteStore';
import { DnsRecord } from '../types';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Trash2, Download, Search, GitBranch, Share2, Zap, SlidersHorizontal, Radio, Tag } from 'lucide-react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  VisibilityState,
} from '@tanstack/react-table';

const columnHelper = createColumnHelper<DnsRecord>();

export const LiveTable: React.FC = () => {
  const { t } = useTranslation();
  const { records, isPaused, setPaused, clearRecords, exportToUrl, maxRecords, monitoringIp } = useDnsStore();
  const { runTraceroute } = useTracerouteStore();
  const [globalFilter, setGlobalFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    sourceIp: false,
    isp: false,
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

  const columns = useMemo(() => [
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
      cell: info => (
        <span className="text-slate-600 dark:text-slate-300">
          {info.row.original.appName}
        </span>
      ),
      size: 150,
    }),
    columnHelper.accessor('type', {
      id: 'type',
      header: 'TYPE',
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
      cell: info => <span className="text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer">{info.getValue()}</span>,
      size: 250,
    }),
    columnHelper.accessor('resultIp', {
      id: 'resultIp',
      header: 'RESULT IP',
      cell: info => (
        <div className="flex items-center gap-2 group/ip">
          <span className="text-slate-600 dark:text-slate-300 font-mono">{info.getValue()}</span>
          <button
            onClick={() => runTraceroute(info.getValue())}
            className="opacity-0 group-hover/ip:opacity-100 p-1 hover:bg-cyan-500/20 rounded transition-all text-cyan-600 dark:text-cyan-400"
            title={t('start_traceroute')}
          >
            <Zap className="h-3 w-3 fill-cyan-400/20" />
          </button>
        </div>
      ),
      size: 160,
    }),
    columnHelper.accessor('country', {
      id: 'country',
      header: t('country'),
      cell: info => {
        const country = info.getValue();
        const row = info.row.original;
        const isLocal = country === 'TW';
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
      header: 'ASN/ISP',
      cell: info => (
        <div className="text-xs max-w-[150px] truncate text-slate-500 dark:text-gray-500 group relative cursor-help">
          <span className="text-slate-400 dark:text-gray-600 mr-1 block text-[10px]">AS{info.row.original.asn}</span>
          {info.getValue()}
        </div>
      ),
    }),
  ], [t, runTraceroute]);

  const allColumnIds = useMemo(() => columns.map(c => (c as any).id as string), [columns]);
  const columnLabels: Record<string, string> = {
    timestamp: t('time'),
    sourceIp: 'Source IP',
    appName: t('app'),
    type: 'Type',
    domain: t('domain'),
    resultIp: 'Result IP',
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

  // Filter records by category
  const filteredRecords = useMemo(() => {
    if (!categoryFilter) return records;
    return records.filter(r => r.appCategory === categoryFilter);
  }, [records, categoryFilter]);

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
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
            <GitBranch className="h-4 w-4 rotate-90" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              {t('live_queries')}
            </h2>
          </div>

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
        </div>

        <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500">
          {/* Column visibility toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
              title={t('columns')}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
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

          <button onClick={handleShare} className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors" title={t('share_data')}>
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
          <button onClick={() => setPaused(!isPaused)} className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors" title={isPaused ? t('resume') : t('pause')}>
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <button onClick={exportToCSV} className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors" title={t('export_csv')}>
            <Download className="h-3.5 w-3.5" />
          </button>
          <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
          <button className="hover:text-red-600 dark:hover:text-red-400 transition-colors" onClick={clearRecords} title={t('clear')}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Category filter chips */}
      {availableCategories.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-white/5 overflow-x-auto">
          <Tag className="h-3 w-3 text-slate-400 dark:text-slate-600 shrink-0" />
          <button
            onClick={() => setCategoryFilter(null)}
            className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
              !categoryFilter
                ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/40'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border border-transparent'
            }`}
          >
            {t('all') || 'All'}
          </button>
          {availableCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                categoryFilter === cat
                  ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/40'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
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
                className={`hover:bg-cyan-500/5 transition-colors group ${
                  row.original.isForeign
                    ? row.original.foreignConfidence === 'high'
                      ? 'shadow-[inset_3px_0_0_0_#ef4444]'
                      : row.original.foreignConfidence === 'low'
                        ? 'shadow-[inset_3px_0_0_0_#fb923c99]'
                        : 'shadow-[inset_3px_0_0_0_#ef444499]'
                    : ''
                } ${index < newRowCountRef.current ? 'animate-row-flash' : ''}`}
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
