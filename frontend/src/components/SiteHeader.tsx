import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router';
import { Shield, BookOpen, Route, Info, Sun, Moon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDnsStore } from '../stores/useDnsStore';

interface SiteHeaderProps {
  onTour?: () => void;
}

const AboutModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-300 dark:border-slate-600">
          <h3 className="text-lg font-bold">{t('about_title')}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>{t('about_what_desc')}</p>
          <ul className="list-disc list-inside text-xs space-y-1 text-slate-500 dark:text-slate-400">
            <li>{t('about_bullet_1')}</li>
            <li>{t('about_bullet_2')}</li>
            <li>{t('about_bullet_3')}</li>
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const SiteHeader: React.FC<SiteHeaderProps> = ({ onTour }) => {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useDnsStore();
  const location = useLocation();
  const isTrace = location.pathname.startsWith('/traceroute');
  const [aboutOpen, setAboutOpen] = useState(false);

  const toggleLanguage = useCallback(() => {
    i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en');
  }, [i18n]);

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#17233a] border-b border-[#202f4a]">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-[#17d4a7]/15 border border-[#17d4a7]/30 shrink-0">
              <Shield className="h-5 w-5 text-[#17d4a7]" />
            </div>
            <h1 className="text-sm sm:text-base font-bold tracking-wide truncate leading-none min-w-0">
              <Link to="/" className="text-white hover:text-white/90 block truncate">
                {t('title')}
              </Link>
            </h1>
            <a
              href="https://ocf.tw"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/40 hover:text-white/70 font-normal whitespace-nowrap transition-colors shrink-0 leading-none"
            >
              by OCF
            </a>
          </div>
          <div className="flex items-center gap-1.5">
            {onTour && (
              <button
                type="button"
                onClick={onTour}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-all border border-white/10 font-bold shrink-0"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>{t('guided_tour')}</span>
              </button>
            )}
            <Link
              to="/traceroute"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg transition-all border font-bold shrink-0 max-w-[11rem] sm:max-w-none ${
                isTrace
                  ? 'bg-[#17d4a7]/15 hover:bg-[#17d4a7]/25 border-[#17d4a7]/30 text-[#17d4a7]'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80 hover:text-white'
              }`}
            >
              <Route className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t('trace_title')}</span>
            </Link>
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-all border border-white/10 font-bold"
            >
              <Info className="h-3.5 w-3.5" />
              <span>{t('nav_about_srtt')}</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-all border border-white/10"
              title={theme === 'dark' ? 'Light' : 'Dark'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-all font-mono border border-white/10 text-white/80 hover:text-white"
            >
              {i18n.language === 'en' ? '中文' : 'EN'}
            </button>
          </div>
        </div>
      </header>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
};

interface HeroProps {
  variant?: 'main' | 'subtitle';
  title?: string;
  subtitle?: string;
}

export const Hero: React.FC<HeroProps> = ({ variant = 'main', title, subtitle }) => {
  const { t } = useTranslation();
  return (
    <section
      className="relative bg-[#17233b] text-white overflow-hidden"
      style={{ backgroundImage: "url('/hero-bg.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[#17233b]/85 via-[#17233b]/55 to-[#17233b]/85 pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#17233a] to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#17233b] to-transparent pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-5 pt-14 pb-10 sm:pt-20 sm:pb-14 text-center">
        {variant === 'main' ? (
          <>
            <h1 className="text-3xl sm:text-[40px] font-semibold leading-tight sm:leading-[1.3] tracking-tight">
              <span className="text-[#17d4a7]">{t('hero_tagline_green')}</span>
              <span className="text-white">{t('hero_tagline_rest')}</span>
            </h1>
            <p className="mt-5 text-sm sm:text-base text-white/60 max-w-2xl mx-auto leading-relaxed">{t('hero_description')}</p>
          </>
        ) : (
          <>
            <h2 className="text-3xl sm:text-[40px] font-semibold leading-tight sm:leading-[1.3] tracking-tight text-white">{title}</h2>
            {subtitle && <p className="mt-5 text-sm sm:text-base text-white/75 max-w-2xl mx-auto leading-relaxed">{subtitle}</p>}
          </>
        )}
      </div>
    </section>
  );
};

interface SectionHeadingProps {
  children: React.ReactNode;
  /**
   * 預設 'block'：h2 自帶 mb-[24px]，用於獨立的段落標題。
   * 'inline'：h2 不帶 margin，用於與其他元素並排（例如標題 + 按鈕同一列）。
   */
  variant?: 'block' | 'inline';
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({ children, variant = 'block' }) => {
  if (variant === 'inline') {
    return (
      <h2 className="flex min-w-0 items-center gap-3 pr-2 text-[24px] font-bold leading-tight text-slate-900 dark:text-slate-100">
        <span className="inline-block h-[1.15em] w-1 shrink-0 rounded-sm bg-[#17d4a7]" aria-hidden="true" />
        <span className="min-w-0">{children}</span>
      </h2>
    );
  }
  return (
    <h2 className="mb-[24px] flex items-center gap-3 text-[24px] font-bold leading-tight text-slate-900 dark:text-slate-100">
      <span className="inline-block h-[1.15em] w-1 shrink-0 rounded-sm bg-[#17d4a7]" aria-hidden="true" />
      <span>{children}</span>
    </h2>
  );
};

export const SiteFooter: React.FC = () => (
  <footer className="flex-shrink-0 mt-4 px-5 py-4 text-center text-slate-400 dark:text-slate-600 text-xs uppercase tracking-widest border-t border-slate-300 dark:border-slate-600/60">
    &copy; {new Date().getFullYear()} OCF (Open Culture Foundation)
  </footer>
);
