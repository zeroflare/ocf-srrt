import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCableStore, CableEventWithId } from '../stores/useCableStore';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Wrench,
  Circle,
} from 'lucide-react';

type Tab = 'active' | 'history';

const STATUS_CONFIG: Record<string, { color: string; bgLight: string; bgDark: string; icon: React.ReactNode }> = {
  '斷線': {
    color: 'text-red-600 dark:text-red-400',
    bgLight: 'bg-red-50 border-red-200',
    bgDark: 'dark:bg-red-500/10 dark:border-red-500/20',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  '部分斷線': {
    color: 'text-amber-600 dark:text-amber-400',
    bgLight: 'bg-amber-50 border-amber-200',
    bgDark: 'dark:bg-amber-500/10 dark:border-amber-500/20',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  '預定維護': {
    color: 'text-blue-600 dark:text-blue-400',
    bgLight: 'bg-blue-50 border-blue-200',
    bgDark: 'dark:bg-blue-500/10 dark:border-blue-500/20',
    icon: <Wrench className="w-3 h-3" />,
  },
};

const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status] ?? {
    color: 'text-slate-500 dark:text-slate-400',
    bgLight: 'bg-slate-50 border-slate-200',
    bgDark: 'dark:bg-slate-500/10 dark:border-slate-500/20',
    icon: <Circle className="w-3 h-3" />,
  };

const statusI18nKey = (status: string) => {
  switch (status) {
    case '斷線': return 'event_status_broken';
    case '部分斷線': return 'event_status_partial';
    case '預定維護': return 'event_status_maintenance';
    default: return 'event_status_unknown';
  }
};

/**
 * 內嵌式海纜事件面板 — 放在圖例內部，可收合展開
 */
export const CableEventPanel: React.FC = () => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>('active');
  const { activeEvents, historyEvents, cableStats, selectedEventCableId, toggleEventCable } = useCableStore();

  const events = tab === 'active' ? activeEvents : historyEvents;

  const activeCount = useMemo(() => {
    return activeEvents.filter(e => e.status === '斷線' || e.status === '部分斷線').length;
  }, [activeEvents]);

  return (
    <div className="mt-2.5 pt-2.5 border-t border-slate-300 dark:border-white/5">
      {/* 收合狀態：只顯示摘要列 + 展開按鈕 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-700 dark:text-cyan-400">
            {t('event_panel_title')}
          </span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-[9px] font-bold tabular-nums leading-none">
              {activeCount}
            </span>
          )}
        </div>
        {/* Stats inline */}
        {cableStats && (
          <div className="flex items-center gap-2 text-[9px] mr-1">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-slate-500 dark:text-slate-500 tabular-nums">{cableStats.normal}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-red-600 dark:text-red-400 tabular-nums">{cableStats.affected}</span>
            </span>
          </div>
        )}
        {expanded
          ? <ChevronUp className="w-3 h-3 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
        }
      </button>

      {/* 展開：完整事件列表 */}
      {expanded && (
        <div className="mt-2">
          {/* Tabs */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setTab('active')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                tab === 'active'
                  ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {t('event_tab_active')} ({activeEvents.length})
            </button>
            <button
              onClick={() => setTab('history')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                tab === 'history'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {t('event_tab_history')} ({historyEvents.length})
            </button>
          </div>

          {/* Event List */}
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-0.5">
            {events.map((event, i) => (
              <EventItem
                key={`${tab}-${i}`}
                event={event}
                isSelected={!!(event.parsedCableId && event.parsedCableId === selectedEventCableId)}
                onToggle={() => toggleEventCable(event.parsedCableId ?? null)}
                t={t}
              />
            ))}
            {events.length === 0 && (
              <div className="text-center text-slate-400 dark:text-slate-600 text-xs py-4">
                —
              </div>
            )}
          </div>

          {/* Hint */}
          <div className="mt-2 text-[9px] text-slate-400 dark:text-slate-600">
            {t('event_click_hint')}
          </div>
        </div>
      )}
    </div>
  );
};

const EventItem: React.FC<{
  event: CableEventWithId;
  isSelected: boolean;
  onToggle: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}> = ({ event, isSelected, onToggle, t }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = getStatusConfig(event.status);
  const hasCableId = !!event.parsedCableId;

  return (
    <div
      className={`rounded-lg border text-[11px] transition-all ${
        isSelected
          ? 'border-cyan-400 dark:border-cyan-500/50 bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-400/30'
          : `${cfg.bgLight} ${cfg.bgDark}`
      }`}
    >
      {/* Clickable header */}
      <button
        onClick={() => {
          if (hasCableId) onToggle();
        }}
        className={`w-full text-left px-2.5 py-1.5 ${hasCableId ? 'cursor-pointer' : 'cursor-default'}`}
        disabled={!hasCableId}
      >
        <div className="flex items-start gap-1.5">
          <span className={`flex-shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">
              {event.title}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] flex-wrap">
              <span className="text-slate-500 dark:text-slate-500 font-mono">{event.date}</span>
              <span className={`px-1 py-0.5 rounded font-bold leading-none ${cfg.color} ${cfg.bgLight} ${cfg.bgDark}`}>
                {t(statusI18nKey(event.status))}
              </span>
              {event.resolvedTime && (
                <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {t('event_resolved')}
                </span>
              )}
            </div>
            {!event.resolvedTime && event.estimatedRepairTime && (
              <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                {t('event_etr')}: <span className="font-mono">{event.estimatedRepairTime}</span>
              </div>
            )}
          </div>
          {/* Expand toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex-shrink-0 p-0.5 rounded hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors"
          >
            {expanded
              ? <ChevronUp className="w-3 h-3 text-slate-400" />
              : <ChevronDown className="w-3 h-3 text-slate-400" />
            }
          </button>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && event.description && (
        <div className="px-2.5 pb-2 pt-0.5 border-t border-slate-200/50 dark:border-white/5">
          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap break-words">
            {event.description}
          </p>
          {event.resolvedTime && (
            <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              {t('event_resolved')}: <span className="font-mono">{event.resolvedTime}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
