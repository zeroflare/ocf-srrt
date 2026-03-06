import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X, Globe, Smartphone } from 'lucide-react';
import type { AppInfo } from '../utils/appInfo';

interface AppInfoTooltipProps {
  appInfo: AppInfo;
  children: React.ReactNode;
}

export const AppInfoTooltip: React.FC<AppInfoTooltipProps> = ({ appInfo, children }) => {
  const [visible, setVisible] = useState(false);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setVisible(v => !v);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close]);

  const primaryDomains = appInfo.domains.filter(d => !d.startsWith('.')).slice(0, 5);

  return (
    <>
      <div
        onClick={toggle}
        className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
      >
        {children}
      </div>
      {visible && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={close}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[backdrop-in_0.2s_ease-out]" />

          {/* Popup */}
          <div
            className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[420px] max-w-full animate-[popup-in_0.25s_cubic-bezier(0.34,1.56,0.64,1)] font-sans overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header with accent bar */}
            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 dark:from-cyan-500/20 dark:to-blue-500/20 px-6 pt-6 pb-5">
              <button
                onClick={close}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-4">
                {appInfo.appIconUrl && (
                  <img
                    src={appInfo.appIconUrl}
                    alt={appInfo.name}
                    className="w-14 h-14 rounded-xl shadow-lg border border-white/50 dark:border-slate-600 bg-white dark:bg-slate-700"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100 truncate">{appInfo.name}</h3>
                  {primaryDomains.length > 0 && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1 truncate">
                      {primaryDomains.join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {appInfo.description}
              </p>
            </div>

            {/* Links */}
            {(appInfo.websiteUrl || appInfo.appStoreUrl || appInfo.googlePlayUrl) && (
              <div className="px-6 pb-6 flex flex-wrap gap-2.5">
                {appInfo.websiteUrl && (
                  <a
                    href={appInfo.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors border border-cyan-200 dark:border-cyan-500/30"
                  >
                    <Globe className="w-4 h-4" />
                    Website
                  </a>
                )}
                {appInfo.appStoreUrl && (
                  <a
                    href={appInfo.appStoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-slate-200 dark:border-slate-600"
                  >
                    <Smartphone className="w-4 h-4" />
                    App Store
                  </a>
                )}
                {appInfo.googlePlayUrl && (
                  <a
                    href={appInfo.googlePlayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-slate-200 dark:border-slate-600"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Google Play
                  </a>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
