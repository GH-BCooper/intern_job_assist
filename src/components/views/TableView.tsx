import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Star } from 'lucide-react';
import type { Application, InterviewDate } from '../../lib/supabase';
import { stageOf } from '../../lib/insights';
import { useStore } from '../../hooks/useStore';
import { toggleStar } from '../../lib/store';
import { fmtDate, ts } from '../../lib/format';
import { RESPONSE_BADGE, StageDot } from '../ApplicationCard';

type Props = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  onOpen: (app: Application) => void;
};

type SortKey = 'company' | 'role' | 'platform' | 'applied' | 'status' | 'stage' | 'interview';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'platform', label: 'Platform', className: 'hidden md:table-cell' },
  { key: 'applied', label: 'Applied' },
  { key: 'status', label: 'Response', className: 'hidden sm:table-cell' },
  { key: 'stage', label: 'Stage' },
  { key: 'interview', label: 'Next interview', className: 'hidden lg:table-cell' },
];

export default function TableView({ applications, interviewsMap, onOpen }: Props) {
  const store = useStore();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'applied', dir: -1 });

  const rows = useMemo(() => {
    const value = (a: Application): string | number => {
      switch (sort.key) {
        case 'company':
          return a.company_name.toLowerCase();
        case 'role':
          return (a.role_applied_to || '').toLowerCase();
        case 'platform':
          return (a.platform_applied_on || '').toLowerCase();
        case 'status':
          return a.response_status || '';
        case 'stage':
          return stageOf(a, store.stageOverrides);
        case 'interview':
          return ts(interviewsMap[a.id]?.[0]?.interview_date) || Number.MAX_SAFE_INTEGER;
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
  }, [applications, sort, store.stageOverrides, interviewsMap]);

  const toggle = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'applied' ? -1 : 1 }));

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-light-300 dark:border-dark-800 bg-light-200/60 dark:bg-dark-900/60">
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
            {rows.map(app => {
              const next = interviewsMap[app.id]?.find(i => ts(i.interview_date) >= Date.now() - 86_400_000);
              const starred = store.starred.includes(app.id);
              return (
                <tr
                  key={app.id}
                  onClick={() => onOpen(app)}
                  className="cursor-pointer hover:bg-primary-50/60 dark:hover:bg-primary-950/20 transition-colors"
                >
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
                    <StageDot stage={stageOf(app, store.stageOverrides)} />
                  </td>
                  <td className="px-3 py-2.5 text-light-600 dark:text-dark-300 hidden lg:table-cell whitespace-nowrap">
                    {next ? fmtDate(next.interview_date, { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
