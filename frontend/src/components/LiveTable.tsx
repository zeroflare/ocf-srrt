import React, { useState, useMemo } from 'react';
import { useDnsStore } from '../stores/useDnsStore';
import { useCableStore } from '../stores/useCableStore';
import { DnsRecord } from '../types';
import { useTranslation } from 'react-i18next';
import { Share2, Pause, Play, Trash2, Download, Filter, Globe, Search, Smartphone, Server, Shield, HelpCircle, Video, MessageCircle, GitBranch, Cloud, Zap } from 'lucide-react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getFilteredRowModel,
} from '@tanstack/react-table';

const columnHelper = createColumnHelper<DnsRecord>();

// [UI] 簡單的圖示對應邏輯
const getAppIcon = (appName: string, category: string) => {
  const size = "h-4 w-4 mr-1";

  // 1. 針對特定知名 App 做通用圖示映射
  if (appName === 'Google' || appName === 'iCloud') return <Cloud className={`${size} text-blue-400`} />;
  if (appName === 'YouTube') return <Video className={`${size} text-red-500`} />;
  if (appName === 'Facebook' || appName === 'Instagram') return <MessageCircle className={`${size} text-blue-500`} />;
  if (appName === 'GitHub') return <GitBranch className={`${size} text-gray-100`} />;

  // 2. 再對類別做通用圖示
  switch (category) {
    case 'Device': return <Smartphone className={`${size} text-purple-400`} />;
    case 'Dev': return <Server className={`${size} text-green-400`} />;
    case 'Security': return <Shield className={`${size} text-yellow-400`} />;
    case 'Social': return <MessageCircle className={`${size} text-pink-400`} />;
    case 'General':
    default:
      return <HelpCircle className={`${size} text-gray-500`} />;
  }
};

export const LiveTable: React.FC = () => {
  const { t } = useTranslation();
  const { records, isPaused, setPaused, clearRecords, exportToUrl, maxRecords, isSharedReport } = useDnsStore();
  const [globalFilter, setGlobalFilter] = useState('');
  const [showForeignOnly, setShowForeignOnly] = useState(false);
  const [traceResult, setTraceResult] = useState<any>(null);
  const [isTracing, setIsTracing] = useState(false);

  const handleTraceroute = async (target: string) => {
    setIsTracing(true);
    setTraceResult(null);
    try {
      if (import.meta.env.VITE_USE_MOCK === 'true') {
        // 模擬延遲與假資料
        await new Promise(resolve => setTimeout(resolve, 1500));
        const data = {
          target,
          hops: [
            { ip: '192.168.1.1', latency: 1.2 },
            { ip: '10.0.0.1', latency: 5.4 },
            { ip: '172.16.10.5', latency: 12.8 },
            { ip: target, latency: 45.2 },
          ]
        };
        setTraceResult(data);
        window.dispatchEvent(new CustomEvent('traceroute-done', { detail: data }));
        return;
      }
      const resp = await fetch(`/api/traceroute?target=${target}`);
      const data = await resp.json();
      setTraceResult(data);
      // 發送自定義事件通知地圖繪製路徑
      window.dispatchEvent(new CustomEvent('traceroute-done', { detail: data }));
    } catch (err) {
      console.error('Traceroute failed:', err);
    } finally {
      setIsTracing(false);
    }
  };

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

    // 2. [新增] 來源 IP (誰在發請求？)
    columnHelper.accessor('sourceIp', {
      header: t('source'), // 記得在 i18n 加 'source'
      cell: info => <span className="text-blue-300 font-mono text-xs">{info.getValue()}</span>,
      size: 120,
    }),

    // 3. 應用程式 (整合 Icon)
    columnHelper.accessor('appName', {
      header: t('app'),
      cell: info => {
        const record = info.row.original;
        const appName = record.appName;
        const category = record.appCategory;
        const { selectCableByRecord } = useCableStore();
        return (
            <div 
              className="flex items-center cursor-pointer hover:bg-white/5 rounded px-1 transition-colors"
              onClick={() => selectCableByRecord(record)}
            >
              {getAppIcon(appName, category)}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  appName !== 'Unknown' ? 'bg-blue-900/30 text-blue-200' : 'bg-gray-800 text-gray-500'
              }`}>
                {appName}
              </span>
            </div>
        );
      },
      size: 150,
    }),

    // 4. [新增] 類型 (A/AAAA)
    columnHelper.accessor('type', {
      header: 'Type',
      cell: info => (
          <span className={`text-[10px] font-bold px-1 rounded border ${
              info.getValue() === 'A' ? 'border-green-800 text-green-400' :
                  info.getValue() === 'AAAA' ? 'border-purple-800 text-purple-400' : 'border-gray-700 text-gray-500'
          }`}>
          {info.getValue()}
        </span>
      ),
      size: 60,
    }),

    // 5. Domain
    columnHelper.accessor('domain', {
      header: t('domain'),
      cell: info => <span className="font-mono text-xs text-yellow-100 hover:text-white transition-colors cursor-pointer select-all" title={info.getValue()}>{info.getValue()}</span>,
      size: 250,
    }),

    // 6. 結果 IP
    columnHelper.accessor('resultIp', {
      header: t('resultIp'),
      cell: info => {
        const ip = info.getValue();
        const latency = info.row.original.latency;
        return (
          <div className="flex flex-col">
            <span className="font-mono text-xs text-gray-300">{ip}</span>
            {latency > 0 && (
              <span className={`text-[10px] font-mono ${latency < 10 ? 'text-green-400' : 'text-orange-400'}`}>
                {latency.toFixed(1)} ms
              </span>
            )}
          </div>
        );
      },
      size: 140,
    }),

    // 7. 國家 (加入國旗 Emoji 或是顏色區分)
    columnHelper.accessor('country', {
      header: t('country'),
      cell: info => {
        const country = info.getValue();
        const isLocal = country === 'TW'; // 假設本地是 TW
        const destIp = info.row.original.resultIp;
        return (
          <div className="flex items-center justify-between group/cell">
            <div className={`flex items-center gap-1 font-bold text-xs ${isLocal ? 'text-green-500' : 'text-orange-400'}`}>
              {!isLocal && <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />}
              {country}
            </div>
            {!isLocal && (
              <button
                onClick={() => handleTraceroute(destIp)}
                className={`p-1 bg-blue-600 hover:bg-blue-500 rounded transition-all ${isTracing ? 'opacity-50 cursor-not-allowed' : 'opacity-0 group-hover/cell:opacity-100'}`}
                disabled={isTracing}
                title="Traceroute"
              >
                <Zap className={`h-3 w-3 text-white ${isTracing ? 'animate-bounce' : ''}`} />
              </button>
            )}
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

  const filteredData = useMemo(() => {
    if (showForeignOnly) {
      return records.filter(r => r.isForeign);
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
      <div className="bg-gray-800 text-white rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700 tour-table">
        {/* Traceroute Result Modal/Panel */}
        { (isTracing || traceResult) && (
          <div className="mb-4 bg-gray-900 border border-blue-500/50 rounded-lg p-4 overflow-hidden relative tour-traceroute">
            <button
              onClick={() => { setTraceResult(null); setIsTracing(false); }}
              className="absolute top-2 right-2 text-gray-500 hover:text-white"
            >
              &times;
            </button>
            <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Traceroute: {isTracing ? 'Tracing...' : traceResult?.target}
            </h3>
            {isTracing ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                Analyzing path...
              </div>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-xs">
                {traceResult?.hops?.map((hop: any) => (
                  <div key={hop.index} className="flex gap-4">
                    <span className="text-gray-500 w-4">{hop.index}</span>
                    <span className="text-blue-300 w-32">{hop.ip}</span>
                    <span className="text-orange-400">{hop.latency > 0 ? `${hop.latency} ms` : '*'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Header (保持不變) */}
        <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
          <h2 className="text-xl font-bold flex items-center text-gray-200">
            <Globe className="mr-2 h-5 w-5 text-blue-400" />
            {t('live_queries')}
          </h2>

          <div className="flex items-center gap-2">
            <div className="relative group">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
              <input
                  type="text"
                  value={globalFilter ?? ''}
                  onChange={e => setGlobalFilter(e.target.value)}
                  placeholder={t('search_placeholder')}
                  className="pl-8 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-md text-sm focus:outline-none focus:border-blue-500 w-48"
              />
            </div>

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

            <button
                onClick={() => setPaused(!isPaused)}
                disabled={isSharedReport}
                className={`p-2 rounded-md border transition-all flex items-center gap-1 ${
                    isPaused
                        ? 'bg-green-900/50 border-green-500 text-green-300'
                        : 'bg-yellow-900/50 border-yellow-500 text-yellow-300'
                } ${isSharedReport ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
                title={isSharedReport ? t('static_report') : (isPaused ? t('resume') : t('pause'))}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              <span className="text-xs font-bold hidden xl:inline">
                {isPaused ? t('resume') : t('pause')}
              </span>
            </button>

            <button onClick={exportToCSV} className="p-2 bg-gray-700 border border-gray-600 rounded-md text-blue-300" title="匯出 CSV">
              <Download className="h-4 w-4" />
            </button>

            <button onClick={handleShare} className="p-2 bg-gray-700 border border-gray-600 rounded-md text-green-300" title="分享記錄 (URL)">
              <Share2 className="h-4 w-4" />
            </button>

            <button 
                onClick={clearRecords} 
                disabled={isSharedReport}
                className={`p-2 bg-gray-700 border border-gray-600 hover:text-red-300 rounded-md text-gray-400 ${isSharedReport ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-auto flex-1 min-h-[400px] border border-gray-700 rounded-md bg-gray-900/50 relative">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-800 sticky top-0 z-10 shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                      <th key={header.id} className="p-3 text-left font-semibold text-gray-300 whitespace-nowrap text-xs uppercase tracking-wider">
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
                        className={`hover:bg-gray-800/80 transition-colors ${
                            row.original.isForeign ? 'bg-orange-950/10' : ''
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
                  <td colSpan={8} className="p-12 text-center text-gray-500 flex flex-col items-center justify-center h-64">
                    <div className="animate-pulse flex flex-col items-center">
                      <Search className="h-10 w-10 mb-3 opacity-20" />
                      <span className="text-lg">Waiting for DNS traffic...</span>
                      <span className="text-xs mt-2 opacity-50">Try visiting a website</span>
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
