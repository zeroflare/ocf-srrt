import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, Cpu, Eye, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const AboutModal: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

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

  return (
    <>
      <button
        onClick={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800/80 rounded-lg text-slate-600 dark:text-slate-300 transition-all border border-slate-200 dark:border-white/10 text-[11px] font-bold"
        title={t('about')}
      >
        <Shield className="h-3.5 w-3.5" />
        {t('about')}
      </button>

      {visible && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={close}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[backdrop-in_0.2s_ease-out]" />

          <div
            className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-[520px] max-w-full max-h-[85vh] overflow-y-auto custom-scrollbar animate-[popup-in_0.25s_cubic-bezier(0.34,1.56,0.64,1)] font-sans"
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
                  <Shield className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h2 className="font-bold text-xl text-slate-800 dark:text-slate-100">
                    {t('about_title')}
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest mt-0.5">
                    Real-time DNS Traffic Analyzer
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-6">
              {/* What */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    {t('about_what_title')}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('about_what_desc')}
                </p>
              </section>

              {/* How */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    {t('about_how_title')}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                  {t('about_how_desc')}
                </p>
                <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  {[1, 2, 3, 4, 5].map(i => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i}
                      </span>
                      <span className="leading-relaxed">{t(`about_how_${i}`)}</span>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Privacy */}
              <section className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-bold text-sm text-emerald-800 dark:text-emerald-300">
                    {t('about_privacy_title')}
                  </h3>
                </div>
                <p className="text-sm text-emerald-700 dark:text-emerald-300/80 leading-relaxed">
                  {t('about_privacy_desc')}
                </p>
              </section>

              {/* Tech */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Server className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    {t('about_tech_title')}
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 text-xs font-mono text-slate-600 dark:text-slate-400">
                    {t('about_tech_backend')}
                  </div>
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 text-xs font-mono text-slate-600 dark:text-slate-400">
                    {t('about_tech_frontend')}
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 text-center">
              <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-widest">
                {t('about_footer')}
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
