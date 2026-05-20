import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { DisplayDnsRecord } from '../types';
import { useTranslation } from 'react-i18next';
import { Cpu, Search, SlidersHorizontal, FileText, ChevronRight, ChevronDown, Pin, Layers } from 'lucide-react';
import { AppInfoTooltip } from './AppInfoTooltip';
import { getAppInfoByName } from '../utils/appInfo';
import { mergeDnsRecords } from '../utils/mergeDnsRecords';
import { countryFlag, countryLabel, isUnknownCountry } from '../utils/countryFlag';
import { formatTime } from '../utils/formatTime';
import { detectCloudProvider } from '../utils/cloudProvider';
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

const columnHelper = createColumnHelper<DisplayDnsRecord>();

const InferenceBadge: React.FC<{ label: string; tooltip: string; color?: 'amber' | 'slate' }> = ({ label, tooltip, color = 'amber' }) => (
  <span
    title={tooltip}
    className={`inline-flex items-center ml-1 px-1 py-px rounded text-xs font-bold leading-none cursor-help ${
      color === 'amber'
        ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
        : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
    }`}
  >
    {label}
  </span>
);

/**
 * 與 wireframe 相同：右上角 "GeoIP" 灰色 outline badge，標示國家係由 GeoIP 推論得來。
 */
const GeoIPBadge: React.FC = () => (
  <span className="inline-flex items-center px-1 py-px rounded text-xs font-bold leading-none bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
    GeoIP
  </span>
);

interface LiveTableProps {
  onOpenReport?: () => void;
}

const COLUMN_KEYS = ['timestamp', 'app', 'type', 'domain', 'resultIp', 'country', 'isp'] as const;

export const LiveTable: React.FC<LiveTableProps> = ({ onOpenReport }) => {
  const { t, i18n } = useTranslation();
  const { records, monitoringIp, selectedRowIds, toggleRowSelection, toggleAllSelection, mergeRecords, toggleMergeRecords } = useDnsStore();
  const [globalFilter, setGlobalFilter] = useState('');
  // OS chips: null = 全選不過濾；Set = 只顯示 Set 內的 OS
  const [enabledOs, setEnabledOs] = useState<Set<string> | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  useEffect(() => {
    if (!mergeRecords) setExpanded({});
  }, [mergeRecords]);

  useEffect(() => {
    if (!showColumnMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setShowColumnMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showColumnMenu]);

  const prevRecordCountRef = useRef(records.length);
  const newRowCountRef = useRef(0);
  useEffect(() => {
    const diff = records.length - prevRecordCountRef.current;
    newRowCountRef.current = diff > 0 ? diff : 0;
    prevRecordCountRef.current = records.length;
  }, [records]);

  // OS chips 對應到 record.os；wireframe 顯示 android / ios / system 三個
  const filteredByOs = useMemo(() => {
    if (enabledOs === null) return records;
    return records.filter((r) => {
      if (r.os) return enabledOs.has(r.os.toLowerCase());
      // 無 OS 標記視為 system
      return enabledOs.has('system');
    });
  }, [records, enabledOs]);

  const filteredRecords: DisplayDnsRecord[] = useMemo(
    () => (mergeRecords ? mergeDnsRecords(filteredByOs) : filteredByOs),
    [filteredByOs, mergeRecords],
  );

  const liveRecords = useMemo(() => {
    const isFullyPinned = (row: DisplayDnsRecord): boolean => {
      const children = row._children ?? [row];
      return children.every((c) => selectedRowIds.has(c._id));
    };
    return filteredRecords.filter((r) => !isFullyPinned(r));
  }, [filteredRecords, selectedRowIds]);

  const pinnedRawRecords: DisplayDnsRecord[] = useMemo(
    () => records.filter((r) => selectedRowIds.has(r._id)),
    [records, selectedRowIds],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: () => {
          const allRawIds: string[] = [];
          for (const row of liveRecords) {
            if (row._children && row._children.length > 0) {
              for (const c of row._children) allRawIds.push(c._id);
            } else allRawIds.push(row._id);
          }
          const allSelected = allRawIds.length > 0 && allRawIds.every((id) => selectedRowIds.has(id));
          return (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => toggleAllSelection(allRawIds)}
              className="rounded border-slate-300 dark:border-slate-600 text-emerald-500"
            />
          );
        },
        cell: (info) => {
          if (info.row.depth > 0) return null;
          const row = info.row.original;
          const isGroup = !!(row._children && row._children.length > 0);
          if (isGroup) {
            const childIds = row._children!.map((c) => c._id);
            const pinnedCount = childIds.reduce((n, id) => n + (selectedRowIds.has(id) ? 1 : 0), 0);
            const allPinned = pinnedCount === childIds.length;
            const some = pinnedCount > 0 && !allPinned;
            return (
              <input
                type="checkbox"
                checked={allPinned}
                ref={(el) => { if (el) el.indeterminate = some; }}
                onChange={() => toggleAllSelection(childIds)}
                className="rounded border-slate-300 dark:border-slate-600 text-emerald-500"
              />
            );
          }
          return (
            <input
              type="checkbox"
              checked={selectedRowIds.has(row._id)}
              onChange={() => toggleRowSelection(row._id)}
              className="rounded border-slate-300 dark:border-slate-600 text-emerald-500"
            />
          );
        },
        size: 32,
      }),
      columnHelper.accessor('timestamp', {
        id: 'timestamp',
        header: t('time'),
        cell: (info) => {
          const row = info.row.original;
          const tableRow = info.row;
          const isSubRow = tableRow.depth > 0;
          const lastTs = row._lastSeenAt ?? info.getValue();
          const count = row._count;
          // wireframe 表格時間色：light=slate-400, dark=slate-500
          if (!isSubRow && count !== undefined && count > 1) {
            const isExpanded = tableRow.getIsExpanded();
            return (
              <span className="text-slate-400 dark:text-slate-500 font-mono inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); tableRow.toggleExpanded(); }}
                  className="p-0.5 -ml-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                {formatTime(lastTs, i18n.language)}
                <span className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-full px-1.5 py-px text-xs font-bold leading-none">
                  ×{count}
                </span>
              </span>
            );
          }
          return (
            <span className={`font-mono ${isSubRow ? 'text-slate-300 dark:text-slate-600 pl-5' : 'text-slate-400 dark:text-slate-500'}`}>
              {formatTime(info.getValue(), i18n.language)}
            </span>
          );
        },
      }),
      columnHelper.accessor('appName', {
        id: 'app',
        header: t('app'),
        cell: (info) => {
          const row = info.row.original;
          const isHeuristic = row.appMatchMethod === 'heuristic';
          const appInfo = getAppInfoByName(row.appName);
          const badge = isHeuristic ? <InferenceBadge label={t('inferred_short')} tooltip={t('inferred_app_heuristic')} /> : null;
          // 與 wireframe 相同：app 名稱顏色 light=slate-600, dark=slate-300，icon + name + badge gap-1.5
          if (appInfo) {
            return (
              <AppInfoTooltip appInfo={appInfo}>
                {appInfo.appIconUrl && (
                  <img
                    src={appInfo.appIconUrl}
                    alt={row.appName}
                    className="w-3.5 h-3.5 rounded"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span className="text-slate-600 dark:text-slate-300">{row.appName}</span>
                {badge}
              </AppInfoTooltip>
            );
          }
          return (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-600 dark:text-slate-300">{row.appName}</span>
              {badge}
            </span>
          );
        },
      }),
      columnHelper.accessor('type', {
        id: 'type',
        header: t('type'),
        cell: (info) => (
          // 與 wireframe 相同：A 藍、AAAA 紫、其他（含 CNAME）灰 outline
          <span
            className={`text-sm font-bold px-1.5 py-0.5 rounded ${
              info.getValue() === 'A'
                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                : info.getValue() === 'AAAA'
                ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
            }`}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('domain', {
        id: 'domain',
        header: t('domain'),
        cell: (info) => (
          <Link
            to={`/traceroute?target=${encodeURIComponent(info.getValue())}`}
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor('resultIp', {
        id: 'resultIp',
        header: t('result_ip'),
        cell: (info) => {
          const ip = info.getValue();
          const target = ip.includes(':') ? info.row.original.domain : ip;
          return (
            <Link
              to={`/traceroute?target=${encodeURIComponent(target)}`}
              className="text-slate-700 dark:text-slate-300 font-mono hover:underline hover:text-emerald-600 dark:hover:text-emerald-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              {ip}
            </Link>
          );
        },
      }),
      columnHelper.accessor('country', {
        id: 'country',
        header: t('country'),
        cell: (info) => {
          const country = info.getValue();
          const row = info.row.original;
          const flag = countryFlag(country);
          const label = countryLabel(country);
          const unknown = isUnknownCountry(country);
          // Anycast 判定優先順序：
          //   1. 後端 isAnycast 旗標（geoip 套件以 ASN 表查表，最可靠）
          //   2. 前端 ISP 字串比對 fallback（針對尚未更新到新後端 / 舊報告快照）
          const cdn = (unknown || row.isAnycast) ? detectCloudProvider(row.isp || '') : null;
          const isAnycastView = row.isAnycast || (unknown && !!cdn);
          return (
            <div className="flex items-center gap-1.5">
              {flag && <span>{flag}</span>}
              <span className="text-slate-600 dark:text-slate-400">
                {isAnycastView ? t('country_anycast') : label}
                {row.city ? ` · ${row.city}` : ''}
              </span>
              {cdn ? (
                <span
                  title={t('country_anycast_hint', { provider: cdn.name })}
                  className={`inline-flex items-center px-1 py-px rounded text-xs font-bold leading-none ${cdn.colorClass}`}
                >
                  {cdn.name}
                </span>
              ) : isAnycastView ? (
                <span
                  title={t('country_anycast_hint', { provider: row.isp || 'CDN' })}
                  className="inline-flex items-center px-1 py-px rounded text-xs font-bold leading-none bg-orange-500/15 text-orange-600 dark:text-orange-400"
                >
                  Anycast
                </span>
              ) : (
                <GeoIPBadge />
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('isp', {
        id: 'isp',
        header: 'ASN/ISP',
        cell: (info) => {
          const isp = info.getValue();
          // 與 wireframe 相同：兩行垂直，AS{num} 較淡在上，ISP 在下截斷
          return (
            <div className="flex flex-col">
              <span className="text-sm text-slate-400 dark:text-slate-600">AS{info.row.original.asn}</span>
              <span className="text-slate-500 dark:text-slate-500 truncate max-w-[180px]">{isp || ''}</span>
            </div>
          );
        },
      }),
    ],
    [t, i18n.language, selectedRowIds, toggleRowSelection, toggleAllSelection, liveRecords],
  );

  const table = useReactTable<DisplayDnsRecord>({
    data: liveRecords,
    columns,
    state: { globalFilter, columnVisibility, expanded },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    getRowId: (row) => row._id,
    getSubRows: (row) => row._children as DisplayDnsRecord[] | undefined,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const pinnedTable = useReactTable<DisplayDnsRecord>({
    data: pinnedRawRecords,
    columns,
    state: { globalFilter, columnVisibility },
    getRowId: (row) => row._id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const hasPinned = pinnedRawRecords.length > 0;

  const osChipClass = (key: string) => {
    const isActive = enabledOs === null || enabledOs.has(key);
    return `px-2 py-1 text-sm font-bold uppercase rounded-md border transition-colors ${
      isActive
        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
    }`;
  };

  const toggleOs = (key: string) => {
    setEnabledOs((prev) => {
      const all = ['android', 'ios', 'system'];
      if (prev === null) {
        const next = new Set<string>();
        for (const o of all) if (o !== key) next.add(o);
        return next;
      }
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === all.length) return null;
      return next;
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm overflow-hidden tour-table">
      {/* 標題列 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-300/80 dark:border-slate-600/50">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="wf-card-title font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">{t('live_queries')}</span>
        </div>
      </div>

      {/* Toolbar：搜尋 + OS chips + Columns + Report */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-300/80 dark:border-slate-600/50 bg-slate-50/50 dark:bg-slate-900/30">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={t('search_placeholder')}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-slate-800 dark:text-slate-200"
          />
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => toggleOs('android')} className={osChipClass('android')}>android</button>
          <button type="button" onClick={() => toggleOs('ios')} className={osChipClass('ios')}>ios</button>
          <button type="button" onClick={() => toggleOs('system')} className={osChipClass('system')}>system</button>
        </div>
        <button
          type="button"
          onClick={toggleMergeRecords}
          aria-pressed={mergeRecords}
          title={t('merge_duplicates_tooltip')}
          className={`flex items-center gap-1 px-2 py-1 text-sm font-bold uppercase rounded-md border transition-colors ${
            mergeRecords
              ? 'bg-[#17d4a7] hover:bg-[#0fc196] border-[#0fc196] text-white'
              : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Layers className="h-3 w-3" />
          {mergeRecords ? t('merge_active', { count: filteredRecords.length }) : t('merge_duplicates')}
        </button>
        <div className="relative" ref={colMenuRef}>
          <button
            type="button"
            onClick={() => setShowColumnMenu((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 text-sm font-bold uppercase rounded-md border bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
          >
            <SlidersHorizontal className="h-3 w-3" />
            {t('columns_label')}
          </button>
          {showColumnMenu && (
            <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1">
              {COLUMN_KEYS.map((k) => (
                <label
                  key={k}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-slate-700 dark:text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={columnVisibility[k] !== false}
                    onChange={() => setColumnVisibility((prev) => ({ ...prev, [k]: prev[k] === false ? true : false }))}
                    className="rounded border-slate-300 dark:border-slate-600 text-emerald-500"
                  />
                  <span>{t(`col_${k}`)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {hasPinned && (
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {pinnedRawRecords.length} {t('pinned')}
            </span>
          )}
          <button
            type="button"
            onClick={onOpenReport}
            disabled={!hasPinned}
            className="flex items-center gap-1 px-2.5 py-1 text-sm font-bold uppercase rounded-md bg-[#17d4a7] hover:bg-[#0fc196] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed text-white transition-colors"
          >
            <FileText className="h-3 w-3" />
            {t('generate_report')}
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
        <table className="wf-data-table w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-3 py-2 text-left font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${
                      header.column.id === 'select' ? 'w-8' : ''
                    }`}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {hasPinned && (
              <>
                <tr className="bg-amber-50/60 dark:bg-amber-900/15">
                  <td colSpan={visibleColumnCount} className="px-3 py-1.5">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-widest">
                      <Pin className="h-3 w-3" />
                      {t('pinned_section_title')}
                      <span className="font-mono text-[11px] bg-amber-200/70 dark:bg-amber-500/20 rounded-full px-1.5 py-px">{pinnedRawRecords.length}</span>
                    </div>
                  </td>
                </tr>
                {pinnedTable.getRowModel().rows.map((row) => (
                  <tr key={`pin-${row.id}`} className="bg-amber-50/30 dark:bg-amber-900/5">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={visibleColumnCount} className="px-3 py-1.5 border-t-2 border-amber-200 dark:border-amber-500/20" />
                </tr>
              </>
            )}
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row, index) => {
                const isSubRow = row.depth > 0;
                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      isSubRow
                        ? 'bg-slate-50/60 dark:bg-slate-900/40'
                        : `hover:bg-emerald-500/5 ${index < newRowCountRef.current ? 'animate-row-flash' : ''}`
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={visibleColumnCount} className="p-12 text-center text-slate-400 dark:text-slate-600">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-bold">{t('table_empty_title')}</p>
                    <p className="text-xs opacity-70">{!monitoringIp ? t('table_empty_hint_no_ip') : t('table_empty_hint_waiting')}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 底部：紀錄數 + 篩選提示 */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-300/80 dark:border-slate-600/50 text-xs text-slate-500 dark:text-slate-400 font-mono">
        <span>
          {records.length} {t('records')}
        </span>
        {globalFilter && (
          <span>
            {t('filtered_by')}: "{globalFilter}"
          </span>
        )}
      </div>
    </div>
  );
};
