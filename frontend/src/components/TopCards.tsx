import React, { useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDnsStore } from '../stores/useDnsStore';
import { DnsRecord } from '../types';
import { countryFlag } from '../utils/countryFlag';

type Entry = { key: string; label: string; count: number };
type TopAggregate = { rows: Entry[]; maxCount: number };
type Picker = (r: DnsRecord) => { key: string; label: string } | null;

const LIMIT = 5;
const PLACEHOLDER_LABEL = '—';

const pickDomain: Picker = (r) => (r.domain ? { key: r.domain, label: r.domain } : null);

const pickCountry: Picker = (r) => {
  if (!r.country) return null;
  const flag = countryFlag(r.country);
  const label = [flag, r.country].filter(Boolean).join(' ').trim() || r.country;
  return { key: r.country, label };
};

const pickService: Picker = (r) => (r.appName ? { key: r.appName, label: r.appName } : null);

const pickAsn: Picker = (r) => {
  const num = r.asn != null && String(r.asn) !== '' ? String(r.asn) : '';
  if (!num) return null;
  const isp = (r.isp || '').trim();
  return { key: num, label: isp ? `${num} - ${isp}` : num };
};

/**
 * 依 picker 取 Top N；列數永遠為 LIMIT，不足補佔位符（與 wireframe 行為一致）。
 */
const useTopAggregate = (records: DnsRecord[], picker: Picker): TopAggregate => {
  return useMemo(() => {
    const map = new Map<string, Entry>();
    for (const r of records) {
      const item = picker(r);
      if (!item || !item.key) continue;
      const cur = map.get(item.key);
      if (cur) cur.count++;
      else map.set(item.key, { ...item, count: 1 });
    }
    const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count);
    const top: Entry[] = sorted.slice(0, LIMIT);
    while (top.length < LIMIT) {
      top.push({ key: `__placeholder_${top.length}`, label: PLACEHOLDER_LABEL, count: 0 });
    }
    const maxCount = Math.max(1, ...top.map((x) => x.count));
    return { rows: top, maxCount };
  }, [records, picker]);
};

const TopCardRow: React.FC<{ entry: Entry; maxCount: number }> = ({ entry, maxCount }) => {
  const showNum = entry.count > 0;
  const pct = showNum ? Math.min(100, Math.round((entry.count / maxCount) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-sm min-h-[22px]">
      <span
        className="truncate flex-1 min-w-0 text-slate-700 dark:text-slate-200"
        title={entry.label}
      >
        {entry.label}
      </span>
      <div className="w-12 sm:w-14 shrink-0 h-1.5 rounded-full bg-slate-200/90 dark:bg-slate-700/80 overflow-hidden">
        <div
          className="h-full bg-sky-500 dark:bg-sky-400/90 rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-slate-600 dark:text-slate-400 w-9 text-right shrink-0 font-medium">
        {showNum ? entry.count : '—'}
      </span>
    </div>
  );
};

const TopCard: React.FC<{ title: string; aggregate: TopAggregate; menuLabel: string }> = ({
  title,
  aggregate,
  menuLabel,
}) => (
  <div className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 shadow-sm overflow-hidden flex flex-col min-h-[220px]">
    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-300 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-800/40">
      <span className="wf-card-title font-semibold text-slate-800 dark:text-slate-100">{title}</span>
      <button
        type="button"
        aria-label={menuLabel}
        className="p-1 rounded-md text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
    <div className="px-3 py-3 space-y-2.5 flex-1">
      {aggregate.rows.map((entry) => (
        <TopCardRow key={entry.key} entry={entry} maxCount={aggregate.maxCount} />
      ))}
    </div>
  </div>
);

export const TopCards: React.FC = () => {
  const { t } = useTranslation();
  const { records } = useDnsStore();

  const topDomains = useTopAggregate(records, pickDomain);
  const topCountries = useTopAggregate(records, pickCountry);
  const topServices = useTopAggregate(records, pickService);
  const topAsn = useTopAggregate(records, pickAsn);

  const menuLabel = t('top_card_menu');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <TopCard title={t('top_card_domains')} aggregate={topDomains} menuLabel={menuLabel} />
      <TopCard title={t('top_card_countries')} aggregate={topCountries} menuLabel={menuLabel} />
      <TopCard title={t('top_card_services')} aggregate={topServices} menuLabel={menuLabel} />
      <TopCard title={t('top_card_asn')} aggregate={topAsn} menuLabel={menuLabel} />
    </div>
  );
};
