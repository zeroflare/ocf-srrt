import React, { useState, useMemo } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord } from '../types';
import { useTranslation } from 'react-i18next';
import {
  Pause,
  Play,
  Trash2,
  Download,
  Filter,
  Globe,
  Search
} from 'lucide-react';
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
  const { records, isPaused, setPaused, clearRecords } = useDnsStore();
  const [globalFilter, setGlobalFilter] = useState('');
  const [showForeignOnly, setShowForeignOnly] = useState(false);

  const columns = useMemo(() => [
    columnHelper.accessor('timestamp', {
      header: t('time'),
      cell: info => new Date(info.getValue()).toLocaleTimeString(),
    }),

    columnHelper.accessor('app_name', {
      header: t('app'),
      cell: info => (
          <span className={`px-2 py-1 rounded text-xs font-medium ${
              info.getValue() !== 'Unknown' ? 'bg-blue-900 text-blue-200' : 'bg-gray-700 text-gray-300'
          }`}>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('domain', {
      header: t('domain'),
      cell: info => <span className="font-mono text-xs text-yellow-100">{info.getValue()}</span>
    }),

    columnHelper.accessor('result_ip', {
      header: t('result_ip'),
      cell: info => <span className="font-mono text-xs">{info.getValue()}</span>
    }),
    columnHelper.accessor('country', {
      header: t('country'),
      cell: info => {
        const country = info.getValue();
        const isLocal = country === 'TW';
        return (
            <div className={`flex items-center font-bold ${isLocal ? 'text-green-400' : 'text-orange-400'}`}>
              {country}
            </div>
        );
      },
    }),
    columnHelper.accessor('isp', {
      header: 'ASN/ISP',
      cell: info => (
          <div className="text-xs max-w-[200px] truncate text-gray-400" title={info.getValue()}>
            <span className="text-gray-500 mr-1">AS{info.row.original.asn}</span>
            {info.getValue()}
          </div>
      ),
    }),
  ], [t]);

  const filteredData = useMemo(() => {
    if (showForeignOnly) {
      return records.filter(r => r.is_foreign);
    }
    return records;
  }, [records, showForeignOnly]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const exportToCSV = () => {
    const headers = ['Time', 'App', 'Domain', 'Type', 'Result IP', 'Country', 'ASN', 'ISP'];
    const rows = records.map(r => [
      new Date(r.timestamp).toISOString(),
      `"${r.app_name}"`, // 防止名稱有逗號
      r.domain,
      r.type,
      r.result_ip,
      r.country,
      r.asn,
      `"${r.isp}"`       // ISP 名稱常包含逗號
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
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
      <div className="bg-gray-800 text-white rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700">
        {/* Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
          <h2 className="text-xl font-bold flex items-center text-gray-200">
            <Globe className="mr-2 h-5 w-5 text-blue-400" />
            {t('live_queries')}
          </h2>

          <div className="flex items-center gap-2">
            {/* Search Box */}
            <div className="relative group">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
              <input
                  type="text"
                  value={globalFilter ?? ''}
                  onChange={e => setGlobalFilter(e.target.value)}
                  placeholder={t('search_placeholder')}
                  className="pl-8 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-48 transition-all"
              />
            </div>

            {/* Filter Foreign */}
            <button
                onClick={() => setShowForeignOnly(!showForeignOnly)}
                className={`p-2 rounded-md flex items-center text-sm border transition-all ${
                    showForeignOnly
                        ? 'bg-orange-900/50 border-orange-500 text-orange-200'
                        : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                }`}
                title={t('foreign_only')}
            >
              <Filter className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">{t('foreign_only')}</span>
            </button>

            <div className="h-6 w-px bg-gray-700 mx-1" />

            {/* Controls */}
            <button
                onClick={() => setPaused(!isPaused)}
                className={`p-2 rounded-md border transition-all ${
                    isPaused
                        ? 'bg-green-900/50 border-green-500 text-green-300 hover:bg-green-900/70'
                        : 'bg-yellow-900/50 border-yellow-500 text-yellow-300 hover:bg-yellow-900/70'
                }`}
                title={isPaused ? t('resume') : t('pause')}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>

            <button
                onClick={exportToCSV}
                className="p-2 bg-gray-700 border border-gray-600 hover:bg-gray-600 rounded-md text-blue-300"
                title={t('export_csv')}
            >
              <Download className="h-4 w-4" />
            </button>

            <button
                onClick={clearRecords}
                className="p-2 bg-gray-700 border border-gray-600 hover:bg-red-900/50 hover:border-red-500 hover:text-red-300 rounded-md text-gray-400 transition-all"
                title={t('clear')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-auto flex-1 min-h-[400px] border border-gray-700 rounded-md bg-gray-900/50">
          <table className="min-w-full text-sm relative">
            <thead className="bg-gray-800 sticky top-0 z-10 shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                      <th key={header.id} className="p-3 text-left font-semibold text-gray-300 whitespace-nowrap">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                  ))}
                </tr>
            ))}
            </thead>
            <tbody className="divide-y divide-gray-800">
            {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map(row => (
                    <tr
                        key={row.id}
                        className={`hover:bg-gray-800 transition-colors ${
                            // [Fix] snake_case
                            row.original.is_foreign ? 'bg-orange-900/5' : ''
                        }`}
                    >
                      {row.getVisibleCells().map(cell => (
                          <td key={cell.id} className="p-3 whitespace-nowrap">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                      ))}
                    </tr>
                ))
            ) : (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500 flex flex-col items-center justify-center">
                    <Search className="h-8 w-8 mb-2 opacity-20" />
                    <span>Waiting for DNS traffic...</span>
                  </td>
                </tr>
            )}
            </tbody>
          </table>
        </div>
      </div>
  );
};