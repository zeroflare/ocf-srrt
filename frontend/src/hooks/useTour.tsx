import { useMemo } from 'react';
import { Step } from 'react-joyride';
import { useTranslation } from 'react-i18next';

const formatTourContent = (text: string, isDark: boolean) => {
  return (
    <div style={{ whiteSpace: 'pre-line', textAlign: 'left' }}>
      {text.split('\n').map((line, i) => {
        const trimmedLine = line.trim();

        if (trimmedLine === '---') {
          return <hr key={i} style={{ border: '0', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, margin: '12px 0' }} />;
        }

        if (/Windows|macOS|iOS|Android/.test(line) && line.includes(':')) {
          const [platform, ...rest] = line.split(':');
          return (
            <p key={i} style={{ margin: '6px 0', fontSize: '13px' }}>
              <strong style={{ color: isDark ? '#f1f5f9' : '#1e293b' }}>{platform}:</strong>
              <span style={{ color: isDark ? '#94a3b8' : '#475569' }}>{rest.join(':')}</span>
            </p>
          );
        }

        if (/Primary|Secondary|主要|備援/.test(line) && line.includes('`')) {
          return (
            <div key={i} style={{
              margin: '8px 0',
              padding: '10px 14px',
              backgroundColor: isDark ? 'rgba(34, 211, 238, 0.08)' : 'rgba(8, 145, 178, 0.06)',
              borderLeft: `4px solid ${isDark ? '#22d3ee' : '#0891b2'}`,
              borderRadius: '4px'
            }}>
              {line.split('`').map((part, index) =>
                index % 2 === 1
                  ? <code key={index} style={{ color: isDark ? '#22d3ee' : '#0891b2', fontWeight: 'bold', fontSize: '15px', fontFamily: 'monospace' }}>{part}</code>
                  : <span key={index} style={{ color: isDark ? '#cbd5e1' : '#334155' }}>{part}</span>
              )}
            </div>
          );
        }

        if (line.includes('⚠️')) {
          return (
            <div key={i} style={{
              marginTop: '16px',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: isDark ? 'rgba(251, 191, 36, 0.1)' : 'rgba(217, 119, 6, 0.08)',
              color: isDark ? '#fbbf24' : '#b45309',
              fontSize: '12.5px',
              lineHeight: '1.5',
              border: `1px solid ${isDark ? 'rgba(251, 191, 36, 0.2)' : 'rgba(217, 119, 6, 0.2)'}`
            }}>
              {line}
            </div>
          );
        }

        return <p key={i} style={{ margin: '4px 0', color: isDark ? '#94a3b8' : '#475569' }}>{line}</p>;
      })}
    </div>
  );
};

export const useTour = (theme: 'dark' | 'light') => {
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  const tourSteps: Step[] = useMemo(() => [
    {
      target: 'body',
      placement: 'center' as const,
      title: t('tour_welcome_title'),
      content: formatTourContent(t('tour_welcome_content'), isDark),
    },
    {
      target: 'body',
      placement: 'center' as const,
      title: t('tour_setup_title'),
      content: formatTourContent(t('tour_setup_content'), isDark),
    },
    {
      target: '.tour-monitoring',
      title: t('tour_monitoring_title'),
      content: t('tour_monitoring_content'),
    },
    {
      target: 'body',
      placement: 'center' as const,
      title: t('tour_dashboard_title'),
      content: t('tour_dashboard_content'),
    },
    {
      target: '.tour-map',
      title: t('tour_map_title'),
      content: t('tour_map_content'),
    },
    {
      target: '.tour-table',
      title: t('tour_table_title'),
      content: t('tour_table_content'),
    },
    {
      target: 'body',
      placement: 'center' as const,
      title: t('tour_traceroute_title'),
      content: t('tour_traceroute_content'),
    }
  ], [t, isDark]);

  const joyrideStyles = useMemo(() => ({
    options: {
      primaryColor: isDark ? '#22d3ee' : '#0891b2',
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      textColor: isDark ? '#f1f5f9' : '#1e293b',
      arrowColor: isDark ? '#0f172a' : '#ffffff',
      width: 500,
    },
    overlay: {
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)',
    },
    tooltip: {
      borderRadius: '16px',
      padding: '24px',
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #e2e8f0',
      boxShadow: isDark
        ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        : '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.03)',
    },
    tooltipContainer: {
      textAlign: 'left' as const,
    },
    tooltipTitle: {
      fontSize: '20px',
      fontWeight: '700',
      marginBottom: '12px',
      color: isDark ? '#22d3ee' : '#0e7490',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.1em',
    },
    tooltipContent: {
      fontSize: '14px',
      lineHeight: '1.6',
      color: isDark ? '#94a3b8' : '#475569',
    },
    buttonNext: {
      backgroundColor: isDark ? 'rgba(6, 182, 212, 0.2)' : 'rgba(8, 145, 178, 0.1)',
      border: `1px solid ${isDark ? 'rgba(34, 211, 238, 0.5)' : 'rgba(8, 145, 178, 0.3)'}`,
      color: isDark ? '#22d3ee' : '#0891b2',
      borderRadius: '8px',
      padding: '8px 16px',
      fontSize: '12px',
      fontWeight: 'bold',
    },
    buttonBack: {
      color: isDark ? '#64748b' : '#94a3b8',
      marginRight: '12px',
      fontSize: '12px',
    },
    buttonSkip: {
      color: isDark ? '#64748b' : '#94a3b8',
      fontSize: '12px',
    }
  }), [isDark]);

  const joyrideLocale = useMemo(() => ({
    next: t('next'),
    back: t('back'),
    last: t('last'),
    skip: t('skip'),
  }), [t]);

  return { tourSteps, joyrideStyles, joyrideLocale };
};
