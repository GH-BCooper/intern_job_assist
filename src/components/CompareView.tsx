import { useMemo, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Check, Minus, X } from 'lucide-react';
import type { Application, InterviewDate } from '../lib/supabase';
import { useStore } from '../hooks/useStore';
import { stageLabel, stageOf } from '../lib/insights';
import { fmtDate } from '../lib/format';
import CompanyLogo from './ui/CompanyLogo';
import { PriorityFlames } from './ApplicationCard';

type Row = {
  label: string;
  value: (app: Application) => string | number | null;
  /** Highlights the best value in the row where "best" is meaningful. */
  best?: 'high' | 'low';
  wide?: boolean;
};

/**
 * Side-by-side comparison of two or three applications.
 *
 * Every field already exists on the record — this is a different arrangement of
 * the same data, which is exactly what makes an offer decision easier.
 */
export default function CompareView({
  applications,
  interviewsMap,
  onClose,
  onOpen,
}: {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  onClose: () => void;
  onOpen: (app: Application) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const store = useStore();

  const rows = useMemo<Row[]>(
    () => [
      { label: 'Stage', value: app => stageLabel(stageOf(app, store.stageOverrides), store.preferences) },
      { label: 'Response', value: app => app.response_status || '—' },
      { label: 'Outcome', value: app => app.final_status || '—' },
      { label: 'Compensation', value: app => app.salary_info || '—', wide: true },
      { label: 'Applied', value: app => fmtDate(app.date_applied) },
      { label: 'Platform', value: app => app.platform_applied_on || '—' },
      { label: 'Interview rounds', value: app => (interviewsMap[app.id] || []).length, best: 'high' },
      { label: 'Priority', value: app => store.priorities[app.id] || 0, best: 'high' },
      { label: 'Resume used', value: app => app.resume_used || '—' },
      {
        label: 'Contacts',
        value: app => store.contacts.filter(c => c.application_id === app.id).length,
        best: 'high',
      },
      {
        label: 'Open tasks',
        value: app => store.tasks.filter(t => t.application_id === app.id && !t.done).length,
        best: 'low',
      },
      {
        label: 'Referred by',
        value: app => {
          const id = store.referrals[app.id];
          return (id && store.contacts.find(c => c.id === id)?.name) || '—';
        },
      },
      { label: 'About the company', value: app => app.company_description || '—', wide: true },
      { label: 'Take-home / tasks', value: app => app.tasks_to_complete || '—', wide: true },
      {
        label: 'Your notes',
        value: app =>
          store.notes
            .filter(n => n.application_id === app.id)
            .map(n => n.body)
            .join('\n\n') || '—',
        wide: true,
      },
    ],
    [store, interviewsMap],
  );

  const bestFor = (row: Row): number[] => {
    if (!row.best) return [];
    const numbers = applications.map(app => {
      const v = row.value(app);
      return typeof v === 'number' ? v : Number.NaN;
    });
    if (numbers.some(n => Number.isNaN(n))) return [];
    const target = row.best === 'high' ? Math.max(...numbers) : Math.min(...numbers);
    // Nothing is "best" when every column is identical.
    if (new Set(numbers).size === 1) return [];
    return numbers.map((n, i) => (n === target ? i : -1)).filter(i => i >= 0);
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[125] bg-black/50 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Compare applications"
    >
      <div className="max-w-5xl mx-auto my-4 card p-0 overflow-hidden animate-scale-in">
        <header className="flex items-center justify-between gap-3 px-5 h-14 border-b border-light-300 dark:border-dark-800 glass sticky top-0 z-10">
          <h2 className="text-base font-semibold text-light-900 dark:text-white">
            Comparing {applications.length} applications
          </h2>
          <button onClick={onClose} className="btn-ghost btn-icon" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-light-300 dark:border-dark-800">
                <th className="text-left p-3 w-36 sticky left-0 bg-light-50 dark:bg-dark-900 z-[1]" />
                {applications.map(app => (
                  <th key={app.id} className="text-left p-3 align-top min-w-[13rem]">
                    <button onClick={() => onOpen(app)} className="flex items-start gap-2.5 text-left group">
                      <CompanyLogo name={app.company_name} size={34} />
                      <span className="min-w-0">
                        <span className="block font-semibold text-light-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">
                          {app.company_name}
                        </span>
                        <span className="block text-xs font-normal text-light-600 dark:text-dark-300 truncate">
                          {app.role_applied_to || '—'}
                        </span>
                        <PriorityFlames value={store.priorities[app.id] || 0} />
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const winners = bestFor(row);
                return (
                  <tr key={row.label} className="border-b border-light-300/70 dark:border-dark-800/70 align-top">
                    <th className="text-left p-3 text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 sticky left-0 bg-light-50 dark:bg-dark-900 z-[1]">
                      {row.label}
                    </th>
                    {applications.map((app, i) => {
                      const value = row.value(app);
                      const isWinner = winners.includes(i);
                      const empty = value === '—' || value === 0 || value === null;
                      return (
                        <td key={app.id} className="p-3">
                          <span
                            className={`inline-flex items-start gap-1.5 ${
                              isWinner
                                ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                : empty
                                  ? 'text-light-400 dark:text-dark-600'
                                  : 'text-light-800 dark:text-dark-100'
                            } ${row.wide ? 'whitespace-pre-wrap text-[13px] leading-relaxed' : ''}`}
                          >
                            {isWinner && <Check size={13} className="mt-0.5 flex-shrink-0" />}
                            {empty && !isWinner && <Minus size={13} className="mt-0.5 flex-shrink-0" />}
                            {empty && value === 0 ? '0' : String(value ?? '—')}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="px-5 py-3 text-[11px] text-light-500 dark:text-dark-400 border-t border-light-300 dark:border-dark-800">
          A green tick marks the leading column where the comparison is numeric. Everything else is yours to weigh.
        </p>
      </div>
    </div>
  );
}
