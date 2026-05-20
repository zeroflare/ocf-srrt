import { useMemo } from 'react';
import { Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';

/**
 * 將 \n 分段渲染為多行段落（保持 wireframe 文案的段落區隔）。
 */
const formatTourBody = (text: string, isDark: boolean) => (
  <div style={{ whiteSpace: 'pre-line', textAlign: 'left', color: isDark ? '#cbd5e1' : '#475569' }}>
    {text.split(/\n\n+/).map((para, i) => (
      <p key={i} style={{ margin: i === 0 ? '0' : '12px 0 0', lineHeight: 1.6 }}>
        {para}
      </p>
    ))}
  </div>
);

export const useTour = (theme: 'dark' | 'light') => {
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  // wireframe 4 步：歡迎 + 設定 DNS + 輸入 IP + 看地圖
  const tourSteps: Step[] = useMemo(() => [
    {
      target: 'body',
      placement: 'center' as const,
      disableBeacon: true,
      title: t('tour_step0_title'),
      content: formatTourBody(t('tour_step0_body'), isDark),
    },
    {
      target: '#wf-tour-step1',
      placement: 'bottom' as const,
      disableBeacon: true,
      title: t('tour_step1_title'),
      content: formatTourBody(t('tour_step1_body'), isDark),
    },
    {
      target: '#wf-tour-step2',
      placement: 'bottom' as const,
      disableBeacon: true,
      title: t('tour_step2_title'),
      content: formatTourBody(t('tour_step2_body'), isDark),
    },
    {
      target: '#wf-tour-step3',
      placement: 'top' as const,
      disableBeacon: true,
      title: t('tour_step3_title'),
      content: formatTourBody(t('tour_step3_body'), isDark),
    },
  ], [t, isDark]);

  const joyrideStyles = useMemo(() => ({
    options: {
      primaryColor: '#17d4a7',
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      textColor: isDark ? '#f1f5f9' : '#1e293b',
      arrowColor: isDark ? '#0f172a' : '#ffffff',
      width: 460,
      zIndex: 9999,
    },
    overlay: {
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
    },
    tooltip: {
      borderRadius: '12px',
      padding: '20px',
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    },
    tooltipContainer: { textAlign: 'left' as const },
    tooltipTitle: {
      fontSize: '16px',
      fontWeight: 700,
      marginBottom: '8px',
      color: isDark ? '#f1f5f9' : '#0f172a',
    },
    tooltipContent: {
      fontSize: '14px',
      lineHeight: 1.6,
      color: isDark ? '#94a3b8' : '#475569',
      padding: '4px 0',
    },
    buttonNext: {
      backgroundColor: '#17d4a7',
      color: '#ffffff',
      borderRadius: '8px',
      padding: '8px 16px',
      fontSize: '12px',
      fontWeight: 700,
    },
    buttonBack: {
      color: isDark ? '#64748b' : '#94a3b8',
      marginRight: '12px',
      fontSize: '12px',
    },
    buttonSkip: {
      color: isDark ? '#94a3b8' : '#64748b',
      fontSize: '12px',
    },
  }), [isDark]);

  // wireframe step0 用「跳過導覽」、step1-3 用「關閉」。
  // react-joyride 只支援全域 locale，這裡採用 step0 的「跳過導覽」較清楚。
  const joyrideLocale = useMemo(() => ({
    next: t('tour_next'),
    back: t('tour_prev'),
    last: t('tour_done'),
    skip: t('tour_skip_tour'),
  }), [t]);

  return { tourSteps, joyrideStyles, joyrideLocale };
};
