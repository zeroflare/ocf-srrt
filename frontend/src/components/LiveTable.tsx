import React, { useState, useMemo } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord } from '../types';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Trash2, Download, Search, GitBranch, Activity, Share2 } from 'lucide-react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
} from '@tanstack/react-table';

const columnHelper = createColumnHelper<DnsRecord>();

export const LiveTable: React.FC = () => {
  const { t } = useTranslation();
  const { records, isPaused, setPaused, clearRecords, exportToUrl, maxRecords } = useDnsStore();
  const [globalFilter, setGlobalFilter] = useState('');

  const handleShare = () => {
    const url = exportToUrl();
    navigator.clipboard.writeText(url);
    alert('分享網址已複製到剪貼簿！ (資料筆數上限: ' + maxRecords + ' 筆)');
  };

  const columns = useMemo(() => [
    // 1. 時間
    columnHelper.accessor('timestamp', {
      header: t('time'),
      cell: info => <span className="text-gray-400 font-mono text-xs">{new Date(info.getValue()).toLocaleTimeString()}</span>,
      size: 100,
    }),

    // 2. 來源 IP (誰在發請求？)
    columnHelper.accessor('sourceIp', {
      header: t('source'),
      cell: info => <span className="text-blue-300 font-mono text-xs">{info.getValue()}</span>,
      size: 120,
    }),

    // 3. 應用程式 (整合 Icon)
    columnHelper.accessor('appName', {
      header: t('app'),
      cell: info => {
        const record = info.row.original;
        const appName = record.appName;
        return (
          <span className="text-slate-300">
            {appName}
          </span>
        );
      },
      size: 150,
    }),

    // 4. 類型 (A/AAAA)
    columnHelper.accessor('type', {
      header: 'TYPE',
      cell: info => (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              info.getValue() === 'A' ? 'bg-blue-500/20 text-blue-400' :
                  info.getValue() === 'AAAA' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-500'
          }`}>
          {info.getValue()}
        </span>
      ),
      size: 60,
    }),

    // 5. Domain
    columnHelper.accessor('domain', {
      header: "網名",
      cell: info => <span className="text-cyan-400 hover:underline cursor-pointer">{info.getValue()}</span>,
      size: 250,
    }),

    // 6. 結果 IP
    columnHelper.accessor('resultIp', {
      header: "RESULT IP",
      cell: info => <span className="text-slate-300">{info.getValue()}</span>,
      size: 140,
    }),

    // 7. 國家 (加入國旗 Emoji 或是顏色區分)
    columnHelper.accessor('country', {
      header: "國家",
      cell: info => {
        const country = info.getValue();
        const isLocal = country === 'TW';
        return (
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isLocal ? 'bg-emerald-400' : 'bg-slate-700'}`} />
            <span className="text-slate-400">{country}</span>
          </div>
        );
      },
      size: 80,
    }),

    // 8. ASN/ISP
    columnHelper.accessor('isp', {
      header: 'ASN/ISP',
      cell: info => (
          <div className="text-xs max-w-[150px] truncate text-gray-500 group relative cursor-help">
            <span className="text-gray-600 mr-1 block text-[10px]">AS{info.row.original.asn}</span>
            {info.getValue()}
            {/* Tooltip via browser title attribute for now */}
          </div>
      ),
    }),
  ], [t]);

  const table = useReactTable({
    data: records,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // 更新 CSV 匯出邏輯，包含新欄位
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

  return (
      <div className="bg-slate-950/80 text-white flex flex-col h-full tour-table font-mono">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-white/5">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-cyan-400">
                <GitBranch className="h-4 w-4 rotate-90" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  {t('live_queries')}
                </h2>
             </div>

             {/* Search Input in Header */}
             <div className="relative group">
                <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                <input
                    type="text"
                    value={globalFilter ?? ''}
                    onChange={e => setGlobalFilter(e.target.value)}
                    placeholder="搜尋網名、App、ASN..."
                    className="pl-7 pr-3 py-1 bg-slate-950/50 border border-slate-800 rounded text-[10px] focus:outline-none focus:border-cyan-500/50 w-64 text-slate-300"
                />
              </div>
          </div>

          <div className="flex items-center gap-3 text-slate-500">
            <button onClick={handleShare} className="hover:text-cyan-400 transition-colors" title="分享監控數據">
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <div className="h-3 w-px bg-slate-800" />
            <button onClick={() => setPaused(!isPaused)} className="hover:text-slate-300 transition-colors">
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
            <button onClick={exportToCSV} className="hover:text-slate-300 transition-colors">
              <Download className="h-3.5 w-3.5" />
            </button>
            <div className="h-3 w-px bg-slate-800" />
            <button className="hover:text-slate-300 transition-colors">
              <Activity className="h-3.5 w-3.5 rotate-45" />
            </button>
            <button className="hover:text-red-400 transition-colors" onClick={clearRecords}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-auto flex-1 custom-scrollbar">
          <table className="min-w-full text-[11px]">
            <thead className="bg-slate-950 sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                      <th key={header.id} className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-widest border-b border-white/5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                  ))}
                </tr>
            ))}
            </thead>
            <tbody className="divide-y divide-white/5">
            {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map(row => (
                    <tr
                        key={row.id}
                        className="hover:bg-cyan-500/5 transition-colors group"
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
                  <td colSpan={8} className="p-12 text-center text-slate-600">
                    <div className="flex flex-col items-center">
                      <Search className="h-8 w-8 mb-2 opacity-10" />
                      <span>NO DATA DETECTED</span>
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
