import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useDnsStore } from '../stores/useDnsStore';

export const DnsSetupBanner: React.FC = () => {
  const { t } = useTranslation();
  const { dnsIp } = useDnsStore();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // 優先使用後端回傳的 DNS 伺服器 IP，否則 fallback 到 hostname
  const dnsTarget = dnsIp || window.location.hostname;

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(dnsTarget).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [dnsTarget]);

  return (
    <div className="mx-0 border-b border-slate-100 dark:border-white/5">
      {/* Collapsed header — always visible, clickable to expand */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-2.5 bg-cyan-50/60 dark:bg-cyan-900/10 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Server className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
            {t('dns_setup_title')}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 font-mono text-xs text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-800/40 border border-cyan-200 dark:border-cyan-700/50 px-2 py-0.5 rounded hover:bg-cyan-200 dark:hover:bg-cyan-700/60 transition-colors"
          >
            <span className="max-w-[200px] truncate">{dnsTarget}</span>
            {copied
              ? <Check className="h-3 w-3 text-emerald-500" />
              : <Copy className="h-3 w-3" />
            }
          </button>
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        }
      </button>

      {/* Expandable instructions */}
      {expanded && (
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/30 text-[11px] text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
          <p className="font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider text-[10px]">{t('dns_setup_how')}</p>
          <div>
            <span className="font-bold text-slate-700 dark:text-slate-200">Windows：</span>
            {t('dns_setup_windows')}
          </div>
          <div>
            <span className="font-bold text-slate-700 dark:text-slate-200">macOS：</span>
            {t('dns_setup_macos')}
          </div>
          <div>
            <span className="font-bold text-slate-700 dark:text-slate-200">Linux：</span>
            {t('dns_setup_linux')}
          </div>
          <div>
            <span className="font-bold text-slate-700 dark:text-slate-200">iOS / Android：</span>
            {t('dns_setup_mobile')}
          </div>
        </div>
      )}
    </div>
  );
};
