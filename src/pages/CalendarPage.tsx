import { useMemo, useState } from 'react';
import { Bell, CalendarClock, ChevronLeft, ChevronRight, Plus, Send, Sparkles } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useStore } from '../hooks/useStore';
import PageShell from '../components/PageShell';
import { DAY_MS, addDays, dayKey, fmtDate, fmtDateTime, monthLabel, toLocalInput, ts } from '../lib/format';
import { addReminder } from '../lib/store';
import { emitUi, toast } from '../lib/uiBus';

type Item = {
  id: string;
  kind: 'interview' | 'reminder' | 'applied';
  title: string;
  detail: string;
  at: string;
  applicationId?: string;
};

const KIND_STYLE = {
  interview: 'bg-primary-100 dark:bg-primary-950/60 text-primary-800 dark:text-primary-200 border-primary-300 dark:border-primary-800',
  reminder: 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200 border-sky-300 dark:border-sky-800',
  applied: 'bg-light-200 dark:bg-dark-800 text-light-700 dark:text-dark-200 border-light-300 dark:border-dark-700',
};

const KIND_ICON = { interview: CalendarClock, reminder: Bell, applied: Send };

export default function CalendarPage() {
  const { applications, interviewsMap } = useData();
  const store = useStore();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selected, setSelected] = useState<string | null>(dayKey(new Date()));
  const [quickTitle, setQuickTitle] = useState('');
  const [quickWhen, setQuickWhen] = useState(() => toLocalInput());

  const items = useMemo(() => {
    const out: Item[] = [];
    applications.forEach(app => {
      (interviewsMap[app.id] || []).forEach(iv => {
        if (!ts(iv.interview_date)) return;
        out.push({
          id: `iv-${iv.id}`,
          kind: 'interview',
          title: app.company_name,
          detail: iv.label || 'Interview',
          at: iv.interview_date,
          applicationId: app.id,
        });
      });
      if (app.date_applied) {
        out.push({
          id: `ap-${app.id}`,
          kind: 'applied',
          title: app.company_name,
          detail: `Applied${app.role_applied_to ? ` · ${app.role_applied_to}` : ''}`,
          at: app.date_applied,
          applicationId: app.id,
        });
      }
    });
    store.reminders.forEach(r => {
      out.push({
        id: `rm-${r.id}`,
        kind: 'reminder',
        title: r.title,
        detail: r.done ? 'Completed' : applications.find(a => a.id === r.application_id)?.company_name || 'Reminder',
        at: r.due_at,
        applicationId: r.application_id || undefined,
      });
    });
    return out;
  }, [applications, interviewsMap, store.reminders]);

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach(i => {
      const t = ts(i.at);
      if (!t) return;
      const key = dayKey(t);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    map.forEach(list => list.sort((a, b) => ts(a.at) - ts(b.at)));
    return map;
  }, [items]);

  const grid = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const start = addDays(first, -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const upcoming = useMemo(
    () => items.filter(i => ts(i.at) >= Date.now() - DAY_MS).sort((a, b) => ts(a.at) - ts(b.at)).slice(0, 12),
    [items],
  );

  const selectedItems = selected ? byDay.get(selected) || [] : [];
  const todayKey = dayKey(new Date());

  const addQuick = () => {
    if (!quickTitle.trim()) return;
    const iso = new Date(quickWhen).toISOString();
    addReminder({ title: quickTitle.trim(), due_at: iso, kind: 'custom' });
    setQuickTitle('');
    toast('Reminder added to your calendar.', 'success');
  };

  return (
    <PageShell
      title="Calendar"
      subtitle="Interviews, reminders and application dates in one place."
      actions={
        <button
          onClick={() =>
            emitUi({
              type: 'open-assistant',
              prompt: 'Look at my calendar for the next two weeks and tell me what to prepare, then add any reminders I am missing.',
            })
          }
          className="btn-secondary"
        >
          <Sparkles size={15} /> Plan my fortnight
        </button>
      }
      wide
    >
      <div className="grid lg:grid-cols-[1fr,20rem] gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-light-900 dark:text-white">{monthLabel(cursor)}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                className="btn-ghost btn-icon"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  setCursor(d);
                  setSelected(todayKey);
                }}
                className="btn-ghost btn-sm"
              >
                Today
              </button>
              <button
                onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                className="btn-ghost btn-icon"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <span key={d} className="text-[10px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 text-center py-1">
                {d.slice(0, 1)}
                <span className="hidden sm:inline">{d.slice(1)}</span>
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map(d => {
              const key = dayKey(d);
              const dayItems = byDay.get(key) || [];
              const otherMonth = d.getMonth() !== cursor.getMonth();
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`min-h-[4.5rem] rounded-xl border p-1.5 text-left transition-all ${
                    selected === key
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-950/30 shadow-soft'
                      : 'border-light-300 dark:border-dark-800 hover:border-primary-300 dark:hover:border-primary-900'
                  } ${otherMonth ? 'opacity-45' : ''}`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold ${
                      isToday ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white' : 'text-light-700 dark:text-dark-200'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <span className="block mt-1 space-y-0.5">
                    {dayItems.slice(0, 2).map(i => (
                      <span
                        key={i.id}
                        className={`block text-[9px] leading-tight px-1 py-0.5 rounded border truncate ${KIND_STYLE[i.kind]}`}
                      >
                        {i.title}
                      </span>
                    ))}
                    {dayItems.length > 2 && (
                      <span className="block text-[9px] text-light-500 dark:text-dark-400 px-1">+{dayItems.length - 2}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-light-900 dark:text-white mb-2">
              {selected ? fmtDate(selected, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Pick a day'}
            </h3>
            {selectedItems.length === 0 ? (
              <p className="text-xs text-light-500 dark:text-dark-400 py-3">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {selectedItems.map(i => {
                  const Icon = KIND_ICON[i.kind];
                  return (
                    <li key={i.id}>
                      <button
                        onClick={() => {
                          if (i.applicationId) {
                            emitUi({ type: 'navigate', to: '/dashboard' });
                            emitUi({ type: 'open-application', id: i.applicationId });
                          }
                        }}
                        className={`w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-xl border ${KIND_STYLE[i.kind]}`}
                      >
                        <Icon size={13} className="mt-0.5 flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold truncate">{i.title}</span>
                          <span className="block text-[11px] opacity-80 truncate">{i.detail}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="divider my-3" />
            <h4 className="label">Quick reminder</h4>
            <input
              value={quickTitle}
              onChange={e => setQuickTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addQuick()}
              placeholder="Follow up with…"
              className="input-field mb-2"
            />
            <input type="datetime-local" value={quickWhen} onChange={e => setQuickWhen(e.target.value)} className="input-field mb-2" />
            <button onClick={addQuick} disabled={!quickTitle.trim()} className="btn-primary w-full btn-sm">
              <Plus size={13} /> Add reminder
            </button>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-light-900 dark:text-white mb-2">Coming up</h3>
            {upcoming.length === 0 ? (
              <p className="text-xs text-light-500 dark:text-dark-400">Nothing on the horizon.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map(i => {
                  const Icon = KIND_ICON[i.kind];
                  return (
                    <li key={i.id} className="flex items-start gap-2">
                      <Icon size={12} className="mt-1 text-light-500 dark:text-dark-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-light-900 dark:text-white truncate">{i.title}</p>
                        <p className="text-[10px] text-light-500 dark:text-dark-400">{fmtDateTime(i.at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
