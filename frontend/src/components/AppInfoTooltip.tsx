import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import type { AppInfo } from '../utils/appInfo';

interface AppInfoTooltipProps {
  appInfo: AppInfo;
  children: React.ReactNode;
}

export const AppInfoTooltip: React.FC<AppInfoTooltipProps> = ({ appInfo, children }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  const links = [
    appInfo.websiteUrl && { label: 'Website', url: appInfo.websiteUrl },
    appInfo.appStoreUrl && { label: 'App Store', url: appInfo.appStoreUrl },
    appInfo.googlePlayUrl && { label: 'Google Play', url: appInfo.googlePlayUrl },
  ].filter(Boolean) as { label: string; url: string }[];

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="inline-flex items-center gap-1.5 cursor-help"
      >
        {children}
      </div>
      {visible && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="mb-2 px-3 py-2.5 rounded-lg text-[11px] leading-relaxed font-sans font-normal normal-case tracking-normal bg-slate-800 dark:bg-slate-700 text-white shadow-xl max-w-[280px] w-max animate-[fade-in_0.15s_ease-out]">
            <div className="flex items-center gap-2 mb-1.5">
              {appInfo.appIconUrl && (
                <img
                  src={appInfo.appIconUrl}
                  alt={appInfo.name}
                  className="w-4 h-4 rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span className="font-bold text-xs">{appInfo.name}</span>
            </div>
            <p className="text-slate-300 text-[10px] leading-relaxed mb-2">{appInfo.description}</p>
            {links.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pointer-events-auto">
                {links.map(link => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    {link.label}
                  </a>
                ))}
              </div>
            )}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
