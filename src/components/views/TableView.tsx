import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Star } from 'lucide-react';
import type { Application, InterviewDate } from '../../lib/supabase';
import { orderedStages, stageLabel, stageOf } from '../../lib/insights';
import { useStore } from '../../hooks/useStore';
import { toggleStar } from '../../lib/store';
import { fmtDate, ts } from '../../lib/format';
import { PriorityFlames, RESPONSE_BADGE, StageDot } from '../ApplicationCard';

/**
 * Windowing thresholds.
 *
 * Under `VIRTUALIZE_ABOVE` rows the table renders normally — windowing costs
 * more than it saves, and a plain table prints and searches better. Past it,
 * only a visible slice is mounted, with spacer rows holding the scroll height,
 * which keeps render cost flat for someone with hundreds of applications. Doing
 * it by hand avoids adding a virtualisation dependency for one screen.
 */
const VIRTUALIZE_ABOVE = 80;
const ROW_HEIGHT = 41;
const VIEWPORT_HEIGHT = 620;
const OVERSCAN = 8;

type Props = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  onOpen: (app: Application) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (ids: string[]) => void;
};

type SortKey = 'company' | 'role' | 'platform' | 'applied' | 'status' | 'stage' | 'interview' | 'priority';

/** Responses in the order a search actually moves through them. */
const RESPONSE_ORDER = ['Pending', 'Viewed', 'Shortlisted', 'Offered', 'Rejected'];

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'platform', label: 'Platform', className: 'hidden md:table-cell' },
  { key: 'applied', label: 'Applied' },
  { key: 'status', label: 'Response', className: 'hidden sm:table-cell' },
  { key: 'stage', label: 'Stage' },
  { key: 'interview', label: 'Next interview', className: 'hidden lg:table-cell' },
  { key: 'priority', label: 'Priority', className: 'hidden xl:table-cell' },
];

export default function TableView({
  applications,
  interviewsMap,
  onOpen,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const store = useStore();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'applied', dir: -1 });

  const rows = useMemo(() => {
    const pipeline = orderedStages(store.preferences);
    const nextInterviewTs = (a: Application) => {
      const upcoming = interviewsMap[a.id]?.find(i => ts(i.interview_date) >= Date.now() - 86_400_000);
      return upcoming ? ts(upcoming.interview_date) : Number.MAX_SAFE_INTEGER;
    };
    const value = (a: Application): string | number => {
      switch (sort.key) {
        case 'company':
          return a.company_name.toLowerCase();
        case 'role':
          return (a.role_applied_to || '').toLowerCase();
        case 'platform':
          return (a.platform_applied_on || '').toLowerCase();
        case 'status': {
          const at = RESPONSE_ORDER.indexOf(a.response_status || 'Pending');
          return at < 0 ? RESPONSE_ORDER.length : at;
        }
        case 'stage':
          // Pipeline order, not alphabetical: "Closed" is not before "Interviewing".
          return pipeline.indexOf(stageOf(a, store.stageOverrides));
        case 'interview':
          // Matches the column, which shows the next upcoming round.
          return nextInterviewTs(a);
        case 'priority':
          return store.priorities[a.id] || 0;
        default:
          return ts(a.date_applied || a.created_at);
      }
    };
    return [...applications].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * sort.dir;
    });
  }, [applications, sort, store.stageOverrides, store.priorities, store.preferences, interviewsMap]);

  /* ---------------------------- virtualisation ---------------------------- */

  const virtualized = rows.length > VIRTUALIZE_ABOVE;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // A sort change can leave the viewport past the end of a shorter list.
  useEffect(() => {
    if (!virtualized) setScrollTop(0);
  }, [virtualized, rows.length]);

  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const startIndex = virtualized ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const endIndex = virtualized ? Math.min(rows.length, startIndex + visibleCount) : rows.length;
  const visibleRows = virtualized ? rows.slice(startIndex, endIndex) : rows;
  const padTop = startIndex * ROW_HEIGHT;
  const padBottom = Math.max(0, (rows.length - endIndex) * ROW_HEIGHT);

  const toggle = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'applied' ? -1 : 1 }));

  return (
    <div className="card overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={virtualized ? e => setScrollTop(e.currentTarget.scrollTop) : undefined}
        className="overflow-x-auto"
        style={virtualized ? { maxHeight: VIEWPORT_HEIGHT, overflowY: 'auto' } : undefined}
      >
        <table className="w-full text-sm">
          <thead className={virtualized ? 'sticky top-0 z-10' : ''}>
            <tr className="border-b border-light-300 dark:border-dark-800 bg-light-200/95 dark:bg-dark-900/95 backdrop-blur-sm">
              {onToggleSelectAll && (
                <th className="w-9 px-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={rows.length > 0 && rows.every(a => selectedIds?.has(a.id))}
                    onChange={() => onToggleSelectAll(rows.map(a => a.id))}
                    className="w-4 h-4 rounded accent-primary-500 cursor-pointer"
                  />
                </th>
              )}
              <th className="w-9" />
              {COLUMNS.map(c => (
                <th key={c.key} className={`text-left px-3 py-2.5 ${c.className || ''}`}>
                  <button
                    onClick={() => toggle(c.key)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-light-600 dark:text-dark-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    {c.label}
                    {sort.key === c.key &&
                      (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-light-300 dark:divide-dark-800">
            {padTop > 0 && (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={COLUMNS.length + 2} />
              </tr>
            )}
            {visibleRows.map(app => {
              const next = interviewsMap[app.id]?.find(i => ts(i.interview_date) >= Date.now() - 86_400_000);
              const starred = store.starred.includes(app.id);
              return (
                <tr
                  key={app.id}
                  onClick={() => onOpen(app)}
                  tabIndex={0}
                  aria-label={`Open ${app.company_name}`}
                  onKeyDown={e => {
                    // Rows are the only way into an application from this view, so
                    // they have to work from the keyboard too.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(app);
                    }
                  }}
                  className={`cursor-pointer focus-visible:bg-primary-50/80 dark:focus-visible:bg-primary-950/30 hover:bg-primary-50/60 dark:hover:bg-primary-950/20 transition-colors ${
                    selectedIds?.has(app.id) ? 'bg-primary-50/70 dark:bg-primary-950/30' : ''
                  }`}
                >
                  {onToggleSelect && (
                    <td className="px-2 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${app.company_name}`}
                        checked={!!selectedIds?.has(app.id)}
                        onChange={() => onToggleSelect(app.id)}
                        className="w-4 h-4 rounded accent-primary-500 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-2 py-2.5">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        toggleStar(app.id);
                      }}
                      className={starred ? 'text-primary-500' : 'text-light-300 dark:text-dark-700 hover:text-primary-500'}
                      aria-label="Star"
                    >
                      <Star size={13} fill={starred ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-light-900 dark:text-white max-w-[12rem] truncate">
                    {app.company_name}
                  </td>
                  <td className="px-3 py-2.5 text-light-700 dark:text-dark-200 max-w-[12rem] truncate">
                    {app.role_applied_to || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-light-600 dark:text-dark-300 hidden md:table-cell max-w-[9rem] truncate">
                    {app.platform_applied_on || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-light-600 dark:text-dark-300 whitespace-nowrap">
                    {fmtDate(app.date_applied, { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <span className={`badge ${RESPONSE_BADGE[app.response_status] || RESPONSE_BADGE.Pending}`}>
                      {app.response_status || 'Pending'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <StageDot
                      stage={stageOf(app, store.stageOverrides)}
                      label={stageLabel(stageOf(app, store.stageOverrides), store.preferences)}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-light-600 dark:text-dark-300 hidden lg:table-cell whitespace-nowrap">
                    {next ? fmtDate(next.interview_date, { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 hidden xl:table-cell whitespace-nowrap">
                    {store.priorities[app.id] ? (
                      <PriorityFlames value={store.priorities[app.id]} />
                    ) : (
                      <span className="text-light-400 dark:text-dark-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {padBottom > 0 && (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={COLUMNS.length + 2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {virtualized && (
        <p className="px-3 py-1.5 text-[10.5px] text-light-500 dark:text-dark-400 border-t border-light-300 dark:border-dark-800">
          Showing rows {startIndex + 1}–{endIndex} of {rows.length} — the rest mount as you scroll.
        </p>
      )}
    </div>
  );
}
