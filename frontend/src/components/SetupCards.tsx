import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Play, Pause, Square, X, Sparkles, RotateCcw, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDnsStore } from '../stores/useDnsStore';
import { BrandDetection, PhoneBrand } from '../utils/phoneBrand';
import { HOST_NODES, resolveCurrentNode } from '../config/hostNodes';

// DNS Changer app 商店連結（同 wireframe constants.js）
const DNS_CHANGER_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.burakgon.dnschanger&hl=zh_TW';
const DNS_CHANGER_APP_STORE_URL = 'https://apps.apple.com/us/app/dns-ip-changer-secure-vpn/id1562292463';

const PHONE_BRANDS: PhoneBrand[] = ['apple', 'google', 'motorola', 'samsung', 'xiaomi', 'huawei', 'oppo', 'vivo', 'other'];
const BRAND_LABELS: Record<PhoneBrand, string> = {
  apple: 'Apple',
  google: 'Google',
  motorola: 'Motorola',
  samsung: 'Samsung',
  xiaomi: '小米',
  huawei: '華為',
  oppo: 'OPPO',
  vivo: 'vivo',
  other: '其他',
};

interface SetupCardsProps {
  ipInput: string;
  setIpInput: (v: string) => void;
  onStart: () => void;
  onStop: () => void;
  /** App.tsx 算好的偵測結果（基於即時 records） */
  detection: BrandDetection;
  /** 手動覆寫值，null = 跟著偵測走 */
  manualBrand: PhoneBrand | null;
  setManualBrand: (b: PhoneBrand | null) => void;
}

const HintModal: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-300 px-4 py-3 dark:border-slate-600">
          <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export const SetupCards: React.FC<SetupCardsProps> = ({ ipInput, setIpInput, onStart, onStop, detection, manualBrand, setManualBrand }) => {
  const { t } = useTranslation();
  const { dnsIp, monitoringIp, isPaused, setPaused, isSharedReport, localCountry } = useDnsStore();
  const [copied, setCopied] = useState(false);
  const [dnsHint, setDnsHint] = useState(false);
  const [ipHint, setIpHint] = useState(false);
  const [originHint, setOriginHint] = useState(false);

  const dnsTarget = dnsIp || window.location.hostname;

  const handleCopyDns = useCallback(() => {
    navigator.clipboard.writeText(dnsTarget).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [dnsTarget]);

  // 目前所在主機節點（依 hostname / localCountry 判定），供下拉預設選中
  const currentNode = resolveCurrentNode(localCountry);
  const currentNodeCode = currentNode?.code ?? '';

  // 切換節點：直接跳轉到該節點網址（不做 SPA 內切換）
  const handleNodeChange = useCallback((code: string) => {
    const node = HOST_NODES.find((n) => n.code === code);
    if (node && node.code !== currentNodeCode) {
      window.location.href = node.url;
    }
  }, [currentNodeCode]);

  const startDisabled = !ipInput || isSharedReport;
  const isMonitoring = !!monitoringIp;

  // 等效品牌：手動覆寫優先，否則用偵測結果
  const effectiveBrand: PhoneBrand = manualBrand ?? (detection.confidence !== 'none' ? detection.brand : 'apple');
  const isAuto = manualBrand === null;
  const hasDetection = detection.confidence !== 'none';

  const confidenceLabel: Record<BrandDetection['confidence'], string> = {
    high: t('brand_conf_high'),
    medium: t('brand_conf_medium'),
    low: t('brand_conf_low'),
    none: t('brand_conf_none'),
  };
  const confidenceTone: Record<BrandDetection['confidence'], string> = {
    high: 'text-emerald-600 dark:text-emerald-400',
    medium: 'text-emerald-600 dark:text-emerald-400',
    low: 'text-amber-600 dark:text-amber-400',
    none: 'text-slate-500 dark:text-slate-400',
  };

  return (
    <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-4 sm:items-stretch sm:gap-[16px]">
      {/* 第 1 步：選擇起始國家（主機節點） */}
      <div id="wf-tour-step-origin" className="col-span-1 flex min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/50 sm:col-span-1">
        <div className="border-b border-slate-200 bg-slate-50 px-[24px] py-[16px] dark:border-slate-600 dark:bg-slate-800/60">
          <h3 className="text-[18px] font-bold leading-tight text-slate-900 dark:text-slate-100">{t('setup_step_origin_title')}</h3>
        </div>
        <div className="flex flex-col gap-2 bg-white p-6 dark:bg-slate-900/50">
          <label htmlFor="wf-host-node" className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-none">{t('host_node_label')}</label>
          <select
            id="wf-host-node"
            value={currentNodeCode}
            onChange={(e) => handleNodeChange(e.target.value)}
            className="h-10 w-full max-w-full bg-white dark:bg-slate-950/60 border-[1.5px] border-slate-200 dark:border-slate-800 rounded-lg px-3 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-4 focus:ring-[#17d4a7]/40 cursor-pointer"
          >
            {currentNodeCode === '' && <option value="" disabled>{t('host_node_placeholder')}</option>}
            {HOST_NODES.map((n) => (
              <option key={n.code} value={n.code}>{t(`host_node_${n.code}`, { defaultValue: n.label })}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOriginHint(true)}
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline leading-none text-left bg-transparent border-0 p-0"
          >
            {t('host_node_hint')}
          </button>
        </div>
      </div>

      {/* 第 2 步：修改手機 DNS */}
      <div id="wf-tour-step1" className="col-span-1 flex min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/50 sm:col-span-1">
        <div className="border-b border-slate-200 bg-slate-50 px-[24px] py-[16px] dark:border-slate-600 dark:bg-slate-800/60">
          <h3 className="text-[18px] font-bold leading-tight text-slate-900 dark:text-slate-100">{t('setup_step1_title')}</h3>
        </div>
        <div className="flex flex-col bg-white p-6 dark:bg-slate-900/50">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-none">{t('dns_server_ip_label')}</label>
            <div className="h-10 w-full flex items-center gap-2 px-4 rounded-lg border-[1.5px] bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800">
              <span className="flex-1 text-sm font-mono font-semibold text-slate-700 dark:text-slate-200 truncate">{dnsTarget}</span>
              <button
                type="button"
                onClick={handleCopyDns}
                className="ml-auto p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
                title={t('dns_setup_copy')}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDnsHint(true)}
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline leading-none text-left bg-transparent border-0 p-0"
            >
              {t('dns_server_ip_hint_link')}
            </button>
          </div>
        </div>
      </div>

      {/* 第 3 步：輸入手機 IP */}
      <div id="wf-tour-step2" className="col-span-1 flex min-w-0 w-full max-w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900/50 sm:col-span-2 tour-monitoring">
        <div className="border-b border-slate-200 bg-slate-50 px-[24px] py-[16px] dark:border-slate-600 dark:bg-slate-800/60">
          <h3 className="text-[18px] font-bold leading-tight text-slate-900 dark:text-slate-100">{t('setup_step2_title')}</h3>
        </div>
        <div className="flex flex-col gap-2 bg-white p-6 dark:bg-slate-900/50">
          <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-4 sm:items-end sm:gap-[16px]">
            <div className="relative flex min-w-0 flex-col gap-2 sm:col-span-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-none">{t('phone_public_ip_label')}</label>
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                disabled={isMonitoring || isSharedReport}
                placeholder="1.2.3.4"
                onKeyDown={(e) => { if (e.key === 'Enter' && !startDisabled && !isMonitoring) onStart(); }}
                className="h-10 w-full bg-white dark:bg-slate-950/60 border-[1.5px] border-slate-200 dark:border-slate-800 rounded-lg px-4 text-sm font-mono focus:outline-none focus:ring-4 focus:ring-[#17d4a7]/40 text-slate-800 dark:text-slate-200 placeholder:text-slate-400/60 disabled:opacity-60"
              />
            </div>
            <div className="relative flex min-w-0 flex-col gap-2 sm:col-span-1">
              <label htmlFor="wf-phone-brand" className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-none flex items-center gap-1">
                {t('phone_brand')}
                {isAuto && hasDetection && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${confidenceTone[detection.confidence]}`} title={t('brand_auto_tooltip', { score: detection.score })}>
                    <Sparkles className="h-3 w-3" />
                    {confidenceLabel[detection.confidence]}
                  </span>
                )}
                {!isAuto && (
                  <button
                    type="button"
                    onClick={() => setManualBrand(null)}
                    className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                    title={t('brand_manual_revert')}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t('brand_manual_label')}
                  </button>
                )}
              </label>
              <select
                id="wf-phone-brand"
                value={effectiveBrand}
                onChange={(e) => setManualBrand(e.target.value as PhoneBrand)}
                disabled={isSharedReport}
                className="h-10 w-full max-w-full bg-white dark:bg-slate-950/60 border-[1.5px] border-slate-200 dark:border-slate-800 rounded-lg px-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-4 focus:ring-[#17d4a7]/40 cursor-pointer disabled:opacity-60"
              >
                {PHONE_BRANDS.map((b) => (
                  <option key={b} value={b}>{BRAND_LABELS[b]}</option>
                ))}
              </select>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:col-span-1">
              {!isMonitoring ? (
                <button
                  type="button"
                  onClick={onStart}
                  disabled={startDisabled}
                  className="h-10 w-full flex items-center justify-center gap-1.5 bg-[#17d4a7] hover:bg-[#0fc196] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white px-5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                >
                  <Play className="h-3.5 w-3.5" style={{ fill: 'currentColor' }} />
                  {t('start_monitor')}
                </button>
              ) : (
                <div className="flex w-full flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaused(!isPaused)}
                    className="h-10 flex items-center gap-1.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border-[1.5px] bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {isPaused ? <Play className="h-3 w-3" style={{ fill: 'currentColor' }} /> : <Pause className="h-3 w-3" style={{ fill: 'currentColor' }} />}
                    {isPaused ? t('resume') : t('pause')}
                  </button>
                  <button
                    type="button"
                    onClick={onStop}
                    className="h-10 flex items-center gap-1.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider border-[1.5px] border-red-300 bg-red-50 text-red-600 transition-colors hover:bg-red-100 hover:text-red-700 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-400 dark:hover:bg-red-900/45"
                  >
                    <Square className="h-3 w-3" style={{ fill: 'currentColor' }} />
                    {t('stop')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIpHint(true)}
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline leading-none text-left bg-transparent border-0 p-0"
          >
            {t('source_ip_hint_link')}
          </button>
        </div>
      </div>

      <HintModal open={dnsHint} onClose={() => setDnsHint(false)} title={t('dns_hint_modal_title')}>
        <div className="space-y-4">
          <ol className="list-decimal space-y-3 pl-4 marker:font-semibold">
            <li className="pl-1">{t('dns_hint_modal_step1')}</li>
            <li className="pl-1">{t('dns_hint_modal_step2')}</li>
          </ol>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            <a
              href={DNS_CHANGER_PLAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100/90 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70 sm:min-w-[10rem]"
            >
              <span>{t('dns_hint_modal_android')}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            <a
              href={DNS_CHANGER_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100/90 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/70 sm:min-w-[10rem]"
            >
              <span>{t('dns_hint_modal_ios')}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </div>
        </div>
      </HintModal>

      <HintModal open={ipHint} onClose={() => setIpHint(false)} title={t('source_ip_hint_modal_title')}>
        <ol className="list-decimal space-y-3 pl-4 marker:font-semibold">
          <li className="pl-1">{t('source_ip_hint_modal_step1')}</li>
          <li className="pl-1">{t('source_ip_hint_modal_step2')}</li>
        </ol>
      </HintModal>

      <HintModal open={originHint} onClose={() => setOriginHint(false)} title={t('host_node_hint_modal_title')}>
        <ol className="list-decimal space-y-3 pl-4 marker:font-semibold">
          <li className="pl-1">{t('host_node_hint_modal_step1')}</li>
          <li className="pl-1">{t('host_node_hint_modal_step2')}</li>
        </ol>
      </HintModal>
    </div>
  );
};
