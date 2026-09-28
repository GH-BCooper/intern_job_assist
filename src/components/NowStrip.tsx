import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ListTodo, Sparkles, Trophy, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useStore } from '../hooks/useStore';
import { computeAnalytics, nowItems, type NowItem } from '../lib/insights';
import { emitDeferrable, emitUi } from '../lib/uiBus';

const ICONS: Record<NowItem['kind'], typeof CalendarClock> = {
  interview: CalendarClock,
  offer: Trophy,
  task: ListTodo,
  reminder: ListTodo,
  stale: AlertTriangle,
  cadence: Sparkles,
  calm: CheckCircle2,
};

const TONES: Record<NowItem['kind'], string> = {
  interview: 'border-primary-300 dark:border-primary-900 bg-primary-50/90 dark:bg-primary-950/50 text-primary-900 dark:text-primary-100',
  offer: 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100',
  task: 'border-amber-300 dark:border-amber-900 bg-amber-50/90 dark:bg-amber-950/50 text-amber-900 dark:text-amber-100',
  reminder: 'border-sky-300 dark:border-sky-900 bg-sky-50/90 dark:bg-sky-950/50 text-sky-900 dark:text-sky-100',
  stale: 'border-amber-300 dark:border-amber-900 bg-amber-50/90 dark:bg-amber-950/50 text-amber-900 dark:text-amber-100',
  cadence: 'border-light-300 dark:border-dark-700 bg-light-50/90 dark:bg-dark-900/80 text-light-800 dark:text-dark-100',
  calm: 'border-light-300 dark:border-dark-700 bg-light-50/90 dark:bg-dark-900/80 text-light-700 dark:text-dark-200',
};

/**
 * The persistent "now" strip: one line, always the single most relevant thing.
 *
 * Sits above the fold on every signed-in page so an interview in two days never
 * needs a trip to Insights or the notification centre to notice. Dismissing it
 * is per-session only — tomorrow's most relevant thing is a different thing.
 */
export default function NowStrip() {
  const { applications, interviewsMap } = useData();
  const store = useStore();
  const [dismissed, setDismissed] = useState(false);

  const items = useMemo(() => {
    const analytics = computeAnalytics(applications, interviewsMap, store, store.preferences.followUpDays);
    return nowItems(analytics, store);
  }, [applications, interviewsMap, store]);

  const top = items[0];
  if (!top || dismissed) return null;
  if (top.kind === 'calm' && !applications.length) return null;

  const Icon = ICONS[top.kind];
  const more = items.length - 1;

  const act = () => {
    if (top.applicationId) emitDeferrable({ type: 'open-application', id: top.applicationId });
    else if (top.kind === 'offer') emitUi({ type: 'navigate', to: '/insights' });
    else if (top.kind === 'task' || top.kind === 'reminder') emitUi({ type: 'navigate', to: '/workspace' });
    else if (top.kind === 'cadence') emitDeferrable({ type: 'new-application' });
  };

  const actionable = !!top.applicationId || ['offer', 'task', 'reminder', 'cadence'].includes(top.kind);

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 mb-4 rounded-xl border backdrop-blur-xl shadow-soft ${TONES[top.kind]}`}
    >
      <Icon size={14} className="flex-shrink-0" />
      <p className="text-xs font-semibold truncate">{top.text}</p>
      <span className="text-[11px] opacity-70 truncate hidden sm:inline">· {top.detail}</span>

      {more > 0 && (
        <span className="hidden md:inline-flex items-center text-[10px] font-semibold uppercase tracking-wide opacity-60 ml-1">
          +{more} more
        </span>
      )}

      {actionable && (
        <button onClick={act} className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-bold hover:underline flex-shrink-0">
          Open <ChevronRight size={12} />
        </button>
      )}

      <button
        onClick={() => setDismissed(true)}
        className={`${actionable ? '' : 'ml-auto'} opacity-50 hover:opacity-100 transition-opacity flex-shrink-0`}
        aria-label="Dismiss for now"
      >
        <X size={13} />
      </button>
    </div>
  );
}
