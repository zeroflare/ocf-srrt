import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Server, X, Copy, Check } from 'lucide-react';
import { useDnsStore } from '../stores/useDnsStore';

/**
 * DnsServerBadge — header 上直接顯示目標伺服器 IP，點擊複製
 */
export const DnsServerBadge: React.FC = () => {
  const { t } = useTranslation();
  const { dnsIp } = useDnsStore();
  const [copied, setCopied] = useState(false);

  const dnsTarget = dnsIp || window.location.hostname;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(dnsTarget).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [dnsTarget]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 rounded-lg text-cyan-700 dark:text-cyan-300 transition-all border border-cyan-200 dark:border-cyan-500/30 text-[11px] font-bold font-mono"
      title={`${t('dns_setup_title')}: ${dnsTarget} — ${t('dns_setup_copy')}`}
    >
      <Server className="h-3 w-3 shrink-0 opacity-70" />
      <span className="max-w-[140px] truncate">{dnsTarget}</span>
      {copied
        ? <Check className="h-3 w-3 text-emerald-500 shrink-0" />
        : <Copy className="h-3 w-3 shrink-0 opacity-50" />
      }
    </button>
  );
};

/**
 * DnsSetupBanner — 「如何設定」按鈕 + Modal 說明各平台 DNS 設定方式
 */
export const DnsSetupBanner: React.FC = () => {
  const { t } = useTranslation();
  const { dnsIp } = useDnsStore();
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const dnsTarget = dnsIp || window.location.hostname;

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(dnsTarget).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [dnsTarget]);

  return (
    <>
      <button
        onClick={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded-lg text-slate-600 dark:text-slate-300 transition-all border border-slate-200 dark:border-white/10 text-[11px] font-bold"
        title={t('dns_setup_how')}
      >
        <Server className="h-3.5 w-3.5" />
        {t('dns_setup_how')}
      </button>

      {visible && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={close}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[backdrop-in_0.2s_ease-out]" />

          <div
            className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[480px] max-w-full max-h-[85vh] overflow-y-auto custom-scrollbar animate-[popup-in_0.25s_cubic-bezier(0.34,1.56,0.64,1)] font-sans"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/20 dark:to-blue-500/20 px-6 pt-6 pb-5 rounded-t-2xl z-10">
              <button
                onClick={close}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-100 dark:bg-cyan-500/20 rounded-xl">
                  <Server className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h2 className="font-bold text-xl text-slate-800 dark:text-slate-100">
                    {t('dns_setup_title')}
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest mt-0.5">
                    {t('dns_setup_how')}
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* DNS IP 複製區塊 */}
              <div className="flex items-center justify-between bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-500/20 rounded-xl p-4">
                <div>
                  <div className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-widest mb-1">DNS Server IP</div>
                  <div className="text-lg font-mono font-bold text-cyan-700 dark:text-cyan-300">{dnsTarget}</div>
                </div>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 bg-cyan-100 dark:bg-cyan-800/40 hover:bg-cyan-200 dark:hover:bg-cyan-700/60 border border-cyan-200 dark:border-cyan-700/50 rounded-lg text-xs font-bold text-cyan-700 dark:text-cyan-300 transition-colors"
                >
                  {copied
                    ? <><Check className="h-3.5 w-3.5 text-emerald-500" />{t('dns_setup_copied')}</>
                    : <><Copy className="h-3.5 w-3.5" />{t('dns_setup_copy')}</>
                  }
                </button>
              </div>

              {/* 各平台設定說明 */}
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {(['Windows', 'macOS', 'Linux', 'iOS / Android'] as const).map((platform) => {
                  const keyMap: Record<string, string> = {
                    'Windows': 'dns_setup_windows',
                    'macOS': 'dns_setup_macos',
                    'Linux': 'dns_setup_linux',
                    'iOS / Android': 'dns_setup_mobile',
                  };
                  return (
                    <div key={platform} className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5">
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider mb-1">{platform}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{t(keyMap[platform])}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
