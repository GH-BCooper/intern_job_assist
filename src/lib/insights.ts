import type { Application, InterviewDate } from './supabase';
import type { StoreShape } from './store';
import { DAY_MS, dayKey, daysSince, startOfWeek, toDateInput, ts } from './format';

export const STAGES = ['Wishlist', 'Applied', 'In Review', 'Interviewing', 'Offer', 'Closed'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<Stage, { hint: string; accent: string; dot: string }> = {
  Wishlist: { hint: 'Found it, not applied yet', accent: 'text-light-600 dark:text-dark-300', dot: 'bg-light-400 dark:bg-dark-500' },
  Applied: { hint: 'Submitted, waiting', accent: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-400' },
  'In Review': { hint: 'Seen or shortlisted', accent: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-400' },
  Interviewing: { hint: 'Interview rounds active', accent: 'text-primary-600 dark:text-primary-400', dot: 'bg-primary-500' },
  Offer: { hint: 'Offer on the table', accent: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  Closed: { hint: 'Rejected or withdrawn', accent: 'text-light-500 dark:text-dark-400', dot: 'bg-red-400' },
};

/** Stage an application sits in, honouring manual board moves. */
export function stageOf(app: Application, overrides: Record<string, string> = {}): Stage {
  const manual = overrides[app.id];
  if (manual && (STAGES as readonly string[]).includes(manual)) return manual as Stage;
  if (app.final_status === 'Rejected' || app.final_status === 'Withdrawn' || app.response_status === 'Rejected') return 'Closed';
  if (app.final_status === 'Accepted' || app.response_status === 'Offered') return 'Offer';
  if (app.interview_offered) return 'Interviewing';
  if (app.response_status === 'Viewed' || app.response_status === 'Shortlisted') return 'In Review';
  if (app.date_applied) return 'Applied';
  return 'Wishlist';
}

/**
 * Supabase fields implied by a board move, so the two stay consistent.
 *
 * Every stage past Wishlist implies the application was actually submitted.
 * Without a `date_applied`, `stageOf` can't tell "Applied" apart from
 * "Wishlist" and analytics that gate on `date_applied` (applied count, the
 * stale-follow-up list, average response time) silently skip the record. If
 * the caller passes the current record and it already has a date, that date
 * is preserved; otherwise today's date is stamped in.
 */
export function stagePatch(stage: Stage, current?: Pick<Application, 'date_applied'>): Partial<Application> {
  const withAppliedDate = (patch: Partial<Application>): Partial<Application> =>
    current?.date_applied ? patch : { ...patch, date_applied: toDateInput() };

  switch (stage) {
    case 'Wishlist':
      return { response_status: 'Pending', final_status: 'In Progress', interview_offered: false };
    case 'Applied':
      return withAppliedDate({ response_status: 'Pending', final_status: 'In Progress', interview_offered: false });
    case 'In Review':
      return withAppliedDate({ response_status: 'Viewed', final_status: 'In Progress' });
    case 'Interviewing':
      return withAppliedDate({ response_status: 'Shortlisted', final_status: 'In Progress', interview_offered: true });
    case 'Offer':
      return withAppliedDate({ response_status: 'Offered', final_status: 'In Progress' });
    case 'Closed':
      return withAppliedDate({ response_status: 'Rejected', final_status: 'Rejected' });
    default:
      return {};
  }
}

export type Analytics = {
  total: number;
  active: number;
  applied: number;
  responded: number;
  interviews: number;
  offers: number;
  rejected: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  avgResponseDays: number | null;
  byStage: Record<Stage, number>;
  byPlatform: { platform: string; total: number; interviews: number; offers: number; rate: number }[];
  byWeek: { label: string; iso: string; count: number }[];
  byMonth: { label: string; count: number }[];
  heatmap: { date: string; count: number }[];
  upcomingInterviews: { app: Application; interview: InterviewDate }[];
  stale: { app: Application; days: number }[];
  streak: number;
  bestStreak: number;
  thisWeek: number;
  lastWeek: number;
  momentum: number;
  topRoles: { role: string; count: number }[];
};

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function computeAnalytics(
  applications: Application[],
  interviewsMap: Record<string, InterviewDate[]>,
  store: StoreShape,
  followUpDays = 7,
): Analytics {
  const overrides = store.stageOverrides;
  const byStage = STAGES.reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {} as Record<Stage, number>);

  applications.forEach(a => {
    byStage[stageOf(a, overrides)] += 1;
  });

  const applied = applications.filter(a => !!a.date_applied).length;
  const responded = applications.filter(a => a.response_status && a.response_status !== 'Pending').length;
  const interviews = applications.filter(a => a.interview_offered || (interviewsMap[a.id] || []).length > 0).length;
  const offers = applications.filter(a => a.response_status === 'Offered' || a.final_status === 'Accepted').length;
  const rejected = applications.filter(a => a.response_status === 'Rejected' || a.final_status === 'Rejected').length;

  // Average days from applying to first recorded interview — the only reliable response signal.
  const responseGaps: number[] = [];
  applications.forEach(a => {
    const first = (interviewsMap[a.id] || [])
      .map(i => ts(i.interview_date))
      .filter(Boolean)
      .sort((x, y) => x - y)[0];
    const appliedAt = ts(a.date_applied);
    if (first && appliedAt && first > appliedAt) responseGaps.push((first - appliedAt) / DAY_MS);
  });
  const avgResponseDays = responseGaps.length
    ? Math.round((responseGaps.reduce((s, x) => s + x, 0) / responseGaps.length) * 10) / 10
    : null;

  const platformMap = new Map<string, { total: number; interviews: number; offers: number }>();
  applications.forEach(a => {
    const p = (a.platform_applied_on || 'Unspecified').trim() || 'Unspecified';
    const entry = platformMap.get(p) || { total: 0, interviews: 0, offers: 0 };
    entry.total += 1;
    if (a.interview_offered || (interviewsMap[a.id] || []).length) entry.interviews += 1;
    if (a.response_status === 'Offered' || a.final_status === 'Accepted') entry.offers += 1;
    platformMap.set(p, entry);
  });
  const byPlatform = [...platformMap.entries()]
    .map(([platform, v]) => ({ platform, ...v, rate: pct(v.interviews, v.total) }))
    .sort((a, b) => b.total - a.total);

  // 12-week application cadence
  const weekStart = startOfWeek();
  const byWeek: Analytics['byWeek'] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const from = new Date(weekStart.getTime() - i * 7 * DAY_MS);
    const to = new Date(from.getTime() + 7 * DAY_MS);
    const count = applications.filter(a => {
      const t = ts(a.date_applied || a.created_at);
      return t >= from.getTime() && t < to.getTime();
    }).length;
    byWeek.push({
      label: from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      iso: from.toISOString(),
      count,
    });
  }

  const monthMap = new Map<string, number>();
  applications.forEach(a => {
    const t = ts(a.date_applied || a.created_at);
    if (!t) return;
    const d = new Date(t);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(k, (monthMap.get(k) || 0) + 1);
  });
  const byMonth = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([k, count]) => {
      const [y, m] = k.split('-');
      return {
        label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
        count,
      };
    });

  const dayMap = new Map<string, number>();
  applications.forEach(a => {
    const t = ts(a.date_applied || a.created_at);
    if (!t) return;
    const key = dayKey(t);
    dayMap.set(key, (dayMap.get(key) || 0) + 1);
  });
  const heatmap: Analytics['heatmap'] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 181; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const key = dayKey(d);
    heatmap.push({ date: key, count: dayMap.get(key) || 0 });
  }

  const upcomingInterviews: Analytics['upcomingInterviews'] = [];
  applications.forEach(a => {
    (interviewsMap[a.id] || []).forEach(iv => {
      if (ts(iv.interview_date) >= Date.now() - DAY_MS) upcomingInterviews.push({ app: a, interview: iv });
    });
  });
  upcomingInterviews.sort((a, b) => ts(a.interview.interview_date) - ts(b.interview.interview_date));

  const stale = applications
    .filter(a => {
      const stage = stageOf(a, overrides);
      if (stage === 'Closed' || stage === 'Offer' || stage === 'Wishlist') return false;
      if (a.response_status && a.response_status !== 'Pending') return false;
      const d = daysSince(a.date_applied);
      return d !== null && d >= followUpDays;
    })
    .map(a => ({ app: a, days: daysSince(a.date_applied) || 0 }))
    .sort((a, b) => b.days - a.days);

  // Application streak, measured in days that have at least one application.
  const days = [...dayMap.keys()].sort();
  let streak = 0;
  let bestStreak = 0;
  let run = 0;
  let prev: number | null = null;
  days.forEach(k => {
    const t = new Date(`${k}T00:00:00`).getTime();
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = t;
  });
  if (prev !== null) {
    const gap = Math.round((today.getTime() - prev) / DAY_MS);
    streak = gap <= 1 ? run : 0;
  }

  const thisWeek = byWeek[byWeek.length - 1]?.count || 0;
  const lastWeek = byWeek[byWeek.length - 2]?.count || 0;

  const momentum = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        pct(interviews, Math.max(applied, 1)) * 0.35 +
          pct(responded, Math.max(applied, 1)) * 0.2 +
          Math.min(thisWeek, 10) * 3 +
          Math.min(streak, 7) * 2 +
          (stale.length ? -Math.min(stale.length * 3, 15) : 5),
      ),
    ),
  );

  const roleMap = new Map<string, number>();
  applications.forEach(a => {
    const r = (a.role_applied_to || '').trim();
    if (r) roleMap.set(r, (roleMap.get(r) || 0) + 1);
  });
  const topRoles = [...roleMap.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    total: applications.length,
    active: applications.filter(a => {
      const s = stageOf(a, overrides);
      return s !== 'Closed';
    }).length,
    applied,
    responded,
    interviews,
    offers,
    rejected,
    responseRate: pct(responded, applied),
    interviewRate: pct(interviews, applied),
    offerRate: pct(offers, applied),
    avgResponseDays,
    byStage,
    byPlatform,
    byWeek,
    byMonth,
    heatmap,
    upcomingInterviews,
    stale,
    streak,
    bestStreak,
    thisWeek,
    lastWeek,
    momentum,
    topRoles,
  };
}

export type Suggestion = {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warn' | 'good';
  applicationId?: string;
  action?: 'follow_up' | 'prep' | 'add' | 'thank_you' | 'tidy';
};

/** Rule-based coaching that works with no API key configured. */
export function buildSuggestions(
  applications: Application[],
  interviewsMap: Record<string, InterviewDate[]>,
  a: Analytics,
  store: StoreShape,
): Suggestion[] {
  const out: Suggestion[] = [];

  a.stale.slice(0, 5).forEach(({ app, days }) => {
    out.push({
      id: `stale-${app.id}`,
      title: `Follow up with ${app.company_name}`,
      detail: `Applied ${days} days ago with no response logged. A short nudge lifts reply rates.`,
      severity: 'warn',
      applicationId: app.id,
      action: 'follow_up',
    });
  });

  a.upcomingInterviews.slice(0, 4).forEach(({ app, interview }) => {
    const d = Math.ceil((ts(interview.interview_date) - Date.now()) / DAY_MS);
    if (d < 0) return;
    out.push({
      id: `prep-${interview.id}`,
      title: `${app.company_name} interview ${d === 0 ? 'today' : `in ${d}d`}`,
      detail: `${interview.label || 'Interview'} — draft answers, re-read the JD, and prepare two questions.`,
      severity: d <= 2 ? 'warn' : 'info',
      applicationId: app.id,
      action: 'prep',
    });
  });

  if (a.thisWeek === 0) {
    out.push({
      id: 'cadence',
      title: 'No applications logged this week',
      detail: 'Momentum compounds. Adding even two applications keeps your pipeline warm.',
      severity: 'warn',
      action: 'add',
    });
  } else if (a.thisWeek > a.lastWeek) {
    out.push({
      id: 'cadence-up',
      title: `Up ${a.thisWeek - a.lastWeek} vs last week`,
      detail: `${a.thisWeek} applications logged this week. Keep the streak alive.`,
      severity: 'good',
    });
  }

  if (a.applied >= 8 && a.interviewRate < 10) {
    out.push({
      id: 'conversion',
      title: 'Interview rate is low',
      detail: `${a.interviewRate}% of ${a.applied} applications reached an interview. Ask the assistant to review your resume targeting.`,
      severity: 'warn',
    });
  }

  const best = a.byPlatform.filter(p => p.total >= 3).sort((x, y) => y.rate - x.rate)[0];
  if (best && best.rate > 0) {
    out.push({
      id: 'platform',
      title: `${best.platform} converts best for you`,
      detail: `${best.rate}% interview rate across ${best.total} applications. Weight your effort there.`,
      severity: 'good',
    });
  }

  const untagged = applications.filter(app => !store.applicationTags.some(t => t.application_id === app.id)).length;
  if (untagged > 5) {
    out.push({
      id: 'tidy',
      title: `${untagged} applications have no tags`,
      detail: 'Tags make filtering, analytics and AI answers sharper.',
      severity: 'info',
      action: 'tidy',
    });
  }

  const missingInterviewDate = applications.filter(
    app => app.interview_offered && !(interviewsMap[app.id] || []).length,
  );
  missingInterviewDate.slice(0, 3).forEach(app => {
    out.push({
      id: `no-date-${app.id}`,
      title: `${app.company_name} interview has no date`,
      detail: 'Add the interview date so reminders and the calendar can track it.',
      severity: 'info',
      applicationId: app.id,
    });
  });

  return out;
}
