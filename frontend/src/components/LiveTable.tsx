import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord, DisplayDnsRecord } from '../types';
import { useTranslation } from 'react-i18next';
import { Trash2, Download, Search, Share2, SlidersHorizontal, Radio, Filter, FileText, Pin, X, Layers, ChevronRight, ChevronDown } from 'lucide-react';
import { AppInfoTooltip } from './AppInfoTooltip';
import { getAppInfoByName } from '../utils/appInfo';
import { detectCloudProvider } from '../utils/cloudProvider';
import { mergeDnsRecords } from '../utils/mergeDnsRecords';
import { Link } from 'react-router';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
  getExpandedRowModel,
  VisibilityState,
  ExpandedState,
} from '@tanstack/react-table';

// 切換到 DisplayDnsRecord 後，合併模式下 _count / _firstSeenAt / _lastSeenAt
// 為 optional 欄位；raw 模式行為等價於原 DnsRecord（這些欄位 undefined）。
const columnHelper = createColumnHelper<DisplayDnsRecord>();

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
  const { records, clearRecords, exportToUrl, maxRecords, monitoringIp, selectedRowIds, toggleRowSelection, toggleAllSelection, mergeRecords, toggleMergeRecords } = useDnsStore();
  const [globalFilter, setGlobalFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  // null = 全選（未操作），Set = 僅顯示 Set 內的 OS（可為空 = 只顯示無 OS 標記的）
  const [enabledOs, setEnabledOs] = useState<Set<string> | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    sourceIp: false,
    type: false,
  });

  // 合併模式下，TanStack Table 用此 state 控制哪些群組被展開（顯示 _children）
  const [expanded, setExpanded] = useState<ExpandedState>({});

  // 切回 raw 模式時清掉展開狀態，避免下次再開合併時殘留無意義的 keys
  useEffect(() => {
    if (!mergeRecords) setExpanded({});
  }, [mergeRecords]);

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
  // 合併模式（doc/09）：先過濾再合併，避免合併後的 row 帶到不該被計入的紀錄。
  const filteredRecords: DisplayDnsRecord[] = useMemo(() => {
    let result: DnsRecord[] = records;
    if (categoryFilter) {
      result = result.filter(r => r.appCategory === categoryFilter);
    }
    // OS toggle filter：null = 全選不過濾，Set = 只顯示 Set 內的（空 Set = 只顯示無 OS 標記的）
    if (enabledOs !== null) {
      result = result.filter(r => !r.os || enabledOs.has(r.os));
    }
    return mergeRecords ? mergeDnsRecords(result) : result;
  }, [records, categoryFilter, enabledOs, mergeRecords]);

  // ── Live / Pinned 分割 ──
  // 設計（doc/09）：
  //   - selectedRowIds 永遠存 raw record IDs（合併 row 勾選時會展開成 children IDs）
  //   - Live 區是合併或 raw 形式（DisplayDnsRecord），只有「全 children 都釘選」
  //     的群組才會離開 live 區進入釘選區；部分釘選的群組仍留在 live，checkbox 顯示
  //     indeterminate（半勾），代表「還有 children 在 live 流量中」
  //   - Pinned 區直接用 raw records 平鋪，N = 真實紀錄數，且跨 mode 一致
  const liveRecords = useMemo(() => {
    const isFullyPinned = (row: DisplayDnsRecord): boolean => {
      const children = row._children ?? [row];
      return children.every(c => selectedRowIds.has(c._id));
    };
    return filteredRecords.filter(r => !isFullyPinned(r));
  }, [filteredRecords, selectedRowIds]);

  // 釘選區的 data：直接從 raw records 過濾，與 mergeRecords toggle 解耦。
  // 切換合併不影響此區，符合「toggle 時釘選不會消失」的設計目標。
  const pinnedRawRecords: DisplayDnsRecord[] = useMemo(() =>
    records.filter(r => selectedRowIds.has(r._id)),
    [records, selectedRowIds],
  );

  // 報告按鈕上的真實紀錄數：與釘選區的 row 數一致。
  const selectedRecordCount = pinnedRawRecords.length;

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      // 表頭全選：把 live 區所有可勾選的 raw record IDs 一次傳進 toggleAllSelection。
      // 合併模式下展開所有 children，raw 模式下就是 row 自身的 _id。
      header: () => {
        const allRawIds: string[] = [];
        for (const row of liveRecords) {
          if (row._children && row._children.length > 0) {
            for (const c of row._children) allRawIds.push(c._id);
          } else {
            allRawIds.push(row._id);
          }
        }
        const allSelected = allRawIds.length > 0 && allRawIds.every(id => selectedRowIds.has(id));
        return (
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => toggleAllSelection(allRawIds)}
            className="rounded border-slate-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500/30"
          />
        );
      },
      // 子列（合併群組展開後的原始紀錄）不顯示勾選框 — 群組是 atomic 單位。
      // 合併 row 勾選時行為：把所有 children 的 raw IDs 一次切換 → checkbox
      // 顯示三態（all/some/none），其中 some → indeterminate。
      cell: info => {
        if (info.row.depth > 0) return null;
        const row = info.row.original;
        const isMergedGroup = !!(row._children && row._children.length > 0);

        if (isMergedGroup) {
          const childIds = row._children!.map(c => c._id);
          const pinnedCount = childIds.reduce((n, id) => n + (selectedRowIds.has(id) ? 1 : 0), 0);
          const allPinned = pinnedCount === childIds.length;
          const somePinned = pinnedCount > 0 && !allPinned;
          return (
            <input
              type="checkbox"
              checked={allPinned}
              ref={el => { if (el) el.indeterminate = somePinned; }}
              onChange={() => toggleAllSelection(childIds)}
              className="rounded border-slate-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500/30"
            />
          );
        }

        return (
          <input
            type="checkbox"
            checked={selectedRowIds.has(row._id)}
            onChange={() => toggleRowSelection(row._id)}
            className="rounded border-slate-300 dark:border-slate-600 text-cyan-500 focus:ring-cyan-500/30"
          />
        );
      },
      size: 32,
    }),
    columnHelper.accessor('timestamp', {
      id: 'timestamp',
      header: t('time'),
      // 合併模式（doc/09）：顯示「最後一次時間」+ 次數 badge + 展開 chevron。
      // 子列（row.depth > 0）以原始 timestamp 顯示，無 badge。
      cell: info => {
        const row = info.row.original;
        const tableRow = info.row;
        const isSubRow = tableRow.depth > 0;
        const lastTs = row._lastSeenAt ?? info.getValue();
        const count = row._count;

        if (!isSubRow && count !== undefined && count > 1) {
          const firstTs = row._firstSeenAt ?? lastTs;
          const isExpanded = tableRow.getIsExpanded();
          return (
            <span
              className="text-slate-400 dark:text-gray-400 font-mono text-xs inline-flex items-center gap-1"
              title={`${new Date(firstTs).toLocaleTimeString()} → ${new Date(lastTs).toLocaleTimeString()}`}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); tableRow.toggleExpanded(); }}
                className="p-0.5 -ml-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
                aria-expanded={isExpanded}
              >
                {isExpanded
                  ? <ChevronDown className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                  : <ChevronRight className="h-3 w-3 text-slate-500 dark:text-slate-400" />}
              </button>
              {new Date(lastTs).toLocaleTimeString()}
              <span className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 rounded-full px-1.5 py-px text-[9px] font-bold leading-none">
                ×{count}
              </span>
            </span>
          );
        }
        return (
          <span className={`font-mono text-xs ${isSubRow ? 'text-slate-400 dark:text-gray-500 pl-5' : 'text-slate-400 dark:text-gray-400'}`}>
            {new Date(info.getValue()).toLocaleTimeString()}
          </span>
        );
      },
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
      cell: info => {
        const ip = info.getValue();
        // IPv6 地址含 ':'，traceroute 只支援 IPv4，改用 domain 做 target
        const isIPv6 = ip.includes(':');
        const traceTarget = isIPv6 ? info.row.original.domain : ip;
        return (
          <Link
            to={`/traceroute?target=${encodeURIComponent(traceTarget)}`}
            className="text-slate-600 dark:text-slate-300 font-mono hover:underline hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer"
            title={isIPv6 ? t('start_traceroute') + ' (via domain)' : t('start_traceroute')}
            target="_blank"
            rel="noopener noreferrer"
          >
            {ip}
          </Link>
        );
      },
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
            <span className="text-slate-600 dark:text-slate-400">{country}{row.city ? ` · ${row.city}` : ''}</span>
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
  ], [t, selectedRowIds, toggleRowSelection, toggleAllSelection, liveRecords]);

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
    data: liveRecords,
    columns,
    state: {
      globalFilter,
      columnVisibility,
      expanded,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    // 用 _id 當穩定 row id，避免新紀錄到來時索引位移、expanded state 失準
    getRowId: (row) => row._id,
    // 合併模式下，DisplayDnsRecord._children 是該群組的原始紀錄陣列；
    // raw 模式時 _children 為 undefined，TanStack 視為無子列。
    getSubRows: (row) => row._children as DisplayDnsRecord[] | undefined,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  // 釘選 table：直接吃 raw records，不做合併、不展開（每筆就是一列）。
  // 設計決策（doc/09）：合併下釘選後，釘選區直接展開呈現原始紀錄，
  // 列數即真實紀錄數，且 toggle 切換 mergeRecords 時釘選不會消失。
  const pinnedTable = useReactTable({
    data: pinnedRawRecords,
    columns,
    state: {
      globalFilter,
      columnVisibility,
    },
    getRowId: (row) => row._id,
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
          {/* 合併重複列 toggle（doc/09）：以 appName 為合併鍵 */}
          <button
            onClick={toggleMergeRecords}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border ${
              mergeRecords
                ? 'bg-cyan-500 text-white border-cyan-600 hover:bg-cyan-600 dark:bg-cyan-500 dark:text-white dark:border-cyan-400 dark:hover:bg-cyan-400'
                : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={t('merge_duplicates_tooltip')}
            aria-pressed={mergeRecords}
          >
            <Layers className="h-3 w-3" />
            {mergeRecords ? t('merge_active', { count: filteredRecords.length }) : t('merge_duplicates')}
          </button>

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
            {selectedRecordCount > 0 && (
              <span
                className="ml-0.5 bg-cyan-600 dark:bg-cyan-500 text-white text-[9px] font-bold rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center leading-none"
                title={mergeRecords ? `${selectedRowIds.size} groups · ${selectedRecordCount} records` : undefined}
              >
                {selectedRecordCount}
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

      {/* Table Content — 上下分區 */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* 上方：即時流動區 */}
        <div className="overflow-auto flex-1 custom-scrollbar min-h-0">
          <table className="min-w-full text-[11px]">
            <thead className="bg-slate-50 dark:bg-slate-950 sticky top-0 z-10 transition-colors">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className={`px-4 py-3 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-white/5${header.column.id === 'select' ? ' cursor-pointer select-none' : ''}`}
                    onClick={header.column.id === 'select' ? (e) => {
                      if ((e.target as HTMLElement).tagName !== 'INPUT') {
                        toggleAllSelection(liveRecords.map(r => r._id));
                      }
                    } : undefined}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row, index) => {
                const isSubRow = row.depth > 0;
                return (
                <tr
                  key={row.id}
                  className={`transition-colors group ${
                    isSubRow
                      ? 'bg-slate-50/60 dark:bg-slate-900/40 text-slate-500 dark:text-slate-500 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                      : `hover:bg-cyan-500/5 ${index < newRowCountRef.current ? 'animate-row-flash' : ''}`
                  }`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      className={`px-4 py-2 whitespace-nowrap${
                        cell.column.id === 'select' && !isSubRow ? ' cursor-pointer select-none' : ''
                      }`}
                      onClick={cell.column.id === 'select' && !isSubRow ? (e) => {
                        if ((e.target as HTMLElement).tagName !== 'INPUT') {
                          // 合併 row：toggle 整組 children；非合併：單一 raw record
                          const r = row.original;
                          if (r._children && r._children.length > 0) {
                            toggleAllSelection(r._children.map(c => c._id));
                          } else {
                            toggleRowSelection(r._id);
                          }
                        }
                      } : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                );
              })
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

        {/* 下方：釘選靜態區 */}
        {pinnedRawRecords.length > 0 && (
          <div className="flex-shrink-0 border-t-2 border-cyan-400/40 dark:border-cyan-500/30 max-h-[40%] flex flex-col">
            {/* 釘選區標題列 */}
            <div className="flex items-center justify-between px-4 py-1.5 bg-cyan-50 dark:bg-cyan-950/50 border-b border-cyan-200/50 dark:border-cyan-500/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Pin className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-700 dark:text-cyan-400">
                  {t('pinned_section_title')}
                </span>
                <span className="text-[10px] font-bold tabular-nums bg-cyan-600 dark:bg-cyan-500 text-white rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {pinnedRawRecords.length}
                </span>
              </div>
              <button
                onClick={() => useDnsStore.getState().clearSelection()}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title={t('clear')}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
            {/* 釘選記錄表格 */}
            <div className="overflow-auto flex-1 min-h-0 custom-scrollbar">
              <table className="min-w-full text-[11px]">
                <tbody className="divide-y divide-cyan-100 dark:divide-cyan-500/10">
                {pinnedTable.getRowModel().rows.map((row) => {
                  const isSubRow = row.depth > 0;
                  return (
                  <tr
                    key={row.id}
                    className={`transition-colors group ${
                      isSubRow
                        ? 'bg-cyan-500/[0.02] dark:bg-cyan-500/[0.015] text-slate-500 dark:text-slate-500 hover:bg-cyan-500/5'
                        : 'bg-cyan-500/5 dark:bg-cyan-500/[0.03] hover:bg-cyan-500/10'
                    }`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className={`px-4 py-2 whitespace-nowrap${
                          cell.column.id === 'select' && !isSubRow ? ' cursor-pointer select-none' : ''
                        }`}
                        onClick={cell.column.id === 'select' && !isSubRow ? (e) => {
                          if ((e.target as HTMLElement).tagName !== 'INPUT') {
                            toggleRowSelection(row.original._id);
                          }
                        } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
