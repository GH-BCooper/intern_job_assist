import { useMemo } from 'react';
import { CalendarClock, FileText, Send } from 'lucide-react';
import type { Application, InterviewDate } from '../../lib/supabase';
import { stageOf } from '../../lib/insights';
import { useStore } from '../../hooks/useStore';
import { fmtDate, ts } from '../../lib/format';
import { CompanyAvatar, StageDot } from '../ApplicationCard';

type Props = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  onOpen: (app: Application) => void;
};

type Entry = {
  id: string;
  at: number;
  kind: 'applied' | 'interview';
  app: Application;
  label: string;
};

export default function TimelineView({ applications, interviewsMap, onOpen }: Props) {
  const store = useStore();

  const groups = useMemo(() => {
    const entries: Entry[] = [];
    applications.forEach(app => {
      const applied = ts(app.date_applied || app.created_at);
      if (applied) entries.push({ id: `a-${app.id}`, at: applied, kind: 'applied', app, label: 'Applied' });
      (interviewsMap[app.id] || []).forEach(iv => {
        const at = ts(iv.interview_date);
        if (at) entries.push({ id: `i-${iv.id}`, at, kind: 'interview', app, label: iv.label || 'Interview' });
      });
    });
    entries.sort((a, b) => b.at - a.at);

    const map = new Map<string, Entry[]>();
    entries.forEach(e => {
      const d = new Date(e.at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return [...map.entries()].map(([key, items]) => {
      const [y, m] = key.split('-');
      return {
        key,
        label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        items,
      };
    });
  }, [applications, interviewsMap]);

  if (!groups.length) {
    return <p className="text-sm text-light-600 dark:text-dark-300 py-12 text-center">Nothing dated yet.</p>;
  }

  return (
    <div className="space-y-8">
      {groups.map(g => (
        <section key={g.key}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-light-500 dark:text-dark-400 mb-3 sticky top-16 bg-light-200/90 dark:bg-dark-950/90 backdrop-blur-sm py-1 z-10">
            {g.label}
            <span className="ml-2 font-normal normal-case tracking-normal opacity-70">{g.items.length} events</span>
          </h3>
          <ol className="relative pl-6 space-y-3 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-px before:bg-light-300 dark:before:bg-dark-800">
            {g.items.map(e => (
              <li key={e.id} className="relative">
                <span
                  className={`absolute -left-[22px] top-3.5 w-[18px] h-[18px] rounded-full border-2 border-light-100 dark:border-dark-950 flex items-center justify-center ${
                    e.kind === 'interview' ? 'bg-primary-500' : 'bg-sky-400'
                  }`}
                >
                  {e.kind === 'interview' ? (
                    <CalendarClock size={9} className="text-white" />
                  ) : (
                    <Send size={8} className="text-white" />
                  )}
                </span>
                <button
                  onClick={() => onOpen(e.app)}
                  className="card card-hover w-full text-left p-3 flex items-center gap-3"
                >
                  <CompanyAvatar name={e.app.company_name} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-light-900 dark:text-white truncate">
                        {e.app.company_name}
                      </span>
                      <StageDot stage={stageOf(e.app, store.stageOverrides)} />
                    </span>
                    <span className="block text-xs text-light-600 dark:text-dark-300 truncate mt-0.5">
                      {e.label}
                      {e.app.role_applied_to ? ` · ${e.app.role_applied_to}` : ''}
                    </span>
                  </span>
                  <span className="text-[11px] text-light-500 dark:text-dark-400 whitespace-nowrap flex items-center gap-1">
                    <FileText size={10} /> {fmtDate(new Date(e.at).toISOString(), { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
