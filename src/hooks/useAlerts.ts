import { useEffect, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useStore } from './useStore';
import { computeAnalytics } from '../lib/insights';
import { DAY_MS, ts } from '../lib/format';
import { updateReminder } from '../lib/store';

export type Alert = {
  id: string;
  kind: 'reminder' | 'interview' | 'stale' | 'task' | 'goal';
  title: string;
  detail: string;
  at: string;
  urgent: boolean;
  applicationId?: string;
  reminderId?: string;
};

/** The notification feed: due reminders, imminent interviews, quiet applications, overdue tasks. */
export function useAlerts(): { alerts: Alert[]; unread: number } {
  const { applications, interviewsMap } = useData();
  const store = useStore();

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    const nowMs = Date.now();
    const lead = store.preferences.reminderLeadHours * 3_600_000;

    store.reminders
      .filter(r => !r.done)
      .forEach(r => {
        const due = ts(r.due_at);
        if (due - nowMs > lead) return;
        const app = applications.find(a => a.id === r.application_id);
        out.push({
          id: `rem-${r.id}`,
          kind: 'reminder',
          title: r.title,
          detail: app ? `${app.company_name}${r.notes ? ` · ${r.notes}` : ''}` : r.notes || 'Reminder',
          at: r.due_at,
          urgent: due <= nowMs,
          applicationId: r.application_id || undefined,
          reminderId: r.id,
        });
      });

    const analytics = computeAnalytics(applications, interviewsMap, store, store.preferences.followUpDays);

    analytics.upcomingInterviews.forEach(({ app, interview }) => {
      const at = ts(interview.interview_date);
      const diff = at - nowMs;
      if (diff > 7 * DAY_MS) return;
      const days = Math.ceil(diff / DAY_MS);
      out.push({
        id: `iv-${interview.id}`,
        kind: 'interview',
        title: `${app.company_name} — ${interview.label || 'Interview'}`,
        detail: days <= 0 ? 'Happening today' : `In ${days} day${days === 1 ? '' : 's'}`,
        at: interview.interview_date,
        urgent: diff <= 2 * DAY_MS,
        applicationId: app.id,
      });
    });

    analytics.stale.slice(0, 6).forEach(({ app, days }) => {
      out.push({
        id: `stale-${app.id}`,
        kind: 'stale',
        title: `${app.company_name} has gone quiet`,
        detail: `${days} days since you applied — time to follow up.`,
        at: app.date_applied || app.created_at,
        urgent: days >= store.preferences.followUpDays * 2,
        applicationId: app.id,
      });
    });

    store.tasks
      .filter(t => !t.done && t.due_at && ts(t.due_at) <= nowMs + DAY_MS)
      .forEach(t => {
        out.push({
          id: `task-${t.id}`,
          kind: 'task',
          title: t.title,
          detail: ts(t.due_at) <= nowMs ? 'Overdue task' : 'Due soon',
          at: t.due_at as string,
          urgent: ts(t.due_at) <= nowMs,
          applicationId: t.application_id || undefined,
        });
      });

    return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || ts(a.at) - ts(b.at));
  }, [applications, interviewsMap, store]);

  return { alerts, unread: alerts.filter(a => a.urgent).length };
}

/** Fires browser notifications for reminders that have come due, once each. */
export function useNotificationEngine() {
  const store = useStore();
  const { applications } = useData();
  const enabled = store.preferences.notificationsEnabled;

  // The latest data, read through a ref so the timer below does not have to be
  // torn down and rebuilt on every store write (each write hands out fresh arrays).
  const latest = useRef({ reminders: store.reminders, applications });
  latest.current = { reminders: store.reminders, applications };

  // Changes only when a reminder becomes due or is notified — the moments the
  // engine has something new to do — instead of on every unrelated write.
  const dueKey = store.reminders
    .filter(r => !r.done && !r.notified && ts(r.due_at) <= Date.now())
    .map(r => r.id)
    .join(',');

  useEffect(() => {
    if (!enabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const run = () => {
      const nowMs = Date.now();
      latest.current.reminders
        .filter(r => !r.done && !r.notified && ts(r.due_at) <= nowMs)
        .forEach(r => {
          const app = latest.current.applications.find(a => a.id === r.application_id);
          try {
            new Notification('InternTrack', {
              body: app ? `${r.title} — ${app.company_name}` : r.title,
              tag: r.id,
              icon: '/icon-192.png',
            });
          } catch {
            /* notification API can throw on some platforms */
          }
          updateReminder(r.id, { notified: true });
        });
    };

    run();
    const id = window.setInterval(run, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, dueKey]);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
