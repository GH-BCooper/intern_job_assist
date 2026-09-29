import type { Application, InterviewDate } from './supabase';
import type { StageChange, StoreShape } from './store';
import { DAY_MS, dayKey, daysSince, parseDate, startOfMonth, startOfWeek, toDateInput, ts } from './format';

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

/* ============================ stage config ============================ */

/**
 * The user's stage list: the canonical six, reordered and relabelled to taste.
 *
 * Renaming is presentation only — every stored override, automation rule and
 * analytic keeps using the canonical name, so a rename can never orphan data.
 */
export function orderedStages(prefs: { stageOrder?: string[] }): Stage[] {
  const order = (prefs.stageOrder || []).filter((s): s is Stage => (STAGES as readonly string[]).includes(s));
  const missing = STAGES.filter(s => !order.includes(s));
  return order.length ? [...order, ...missing] : [...STAGES];
}

export function stageLabel(stage: string, prefs: { stageLabels?: Record<string, string> }): string {
  return prefs.stageLabels?.[stage]?.trim() || stage;
}

/** Soft cap for a column; 0 means unlimited. */
export function wipLimit(stage: string, prefs: { wipLimits?: Record<string, number> }): number {
  const raw = prefs.wipLimits?.[stage];
  return typeof raw === 'number' && raw > 0 ? Math.round(raw) : 0;
}

/* ====================== month & range comparisons ====================== */

export type PeriodComparison = {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

function countInRange(applications: Application[], from: number, to: number): number {
  return applications.filter(a => {
    const t = ts(a.date_applied || a.created_at);
    return t >= from && t < to;
  }).length;
}

function compare(label: string, current: number, previous: number): PeriodComparison {
  return {
    label,
    current,
    previous,
    delta: current - previous,
    deltaPct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
  };
}

/** Week / month / quarter comparisons, the same shape the headline stats already use. */
export function periodComparisons(applications: Application[], at = new Date()): Record<'week' | 'month' | 'quarter', PeriodComparison> {
  const weekStart = startOfWeek(at).getTime();
  const lastWeekStart = weekStart - 7 * DAY_MS;

  const monthStart = startOfMonth(at).getTime();
  const lastMonthStart = startOfMonth(new Date(at.getFullYear(), at.getMonth() - 1, 1)).getTime();

  const quarterMonth = Math.floor(at.getMonth() / 3) * 3;
  const quarterStart = new Date(at.getFullYear(), quarterMonth, 1).getTime();
  const lastQuarterStart = new Date(at.getFullYear(), quarterMonth - 3, 1).getTime();

  return {
    week: compare(
      'This week',
      countInRange(applications, weekStart, weekStart + 7 * DAY_MS),
      countInRange(applications, lastWeekStart, weekStart),
    ),
    month: compare(
      'This month',
      countInRange(applications, monthStart, at.getTime() + DAY_MS),
      countInRange(applications, lastMonthStart, monthStart),
    ),
    quarter: compare(
      'This quarter',
      countInRange(applications, quarterStart, at.getTime() + DAY_MS),
      countInRange(applications, lastQuarterStart, quarterStart),
    ),
  };
}

/* ========================= stage-flow (Sankey) ========================= */

export type FlowLink = { from: string; to: string; count: number; backward: boolean };

export type StageFlow = {
  links: FlowLink[];
  /** Stage occupancy, for column heights. */
  totals: Record<string, number>;
  max: number;
};

/**
 * How applications actually moved, built from the recorded stage history.
 *
 * Unlike the funnel (strictly linear) this shows backward moves —
 * Interviewing → Closed is the most informative edge in the whole chart.
 */
export function stageFlow(history: StageChange[], byStage: Record<string, number>): StageFlow {
  const map = new Map<string, FlowLink>();

  /**
   * Progress rank, which is not the same as position in STAGES.
   *
   * `Closed` sits last in the canonical list but is a terminal *negative*
   * outcome, so anything landing there from an active stage is a regression —
   * Interviewing → Closed is the single most informative edge in the chart, and
   * index order alone would draw it as forward progress.
   */
  const progress = (stage: string): number => {
    if (stage === 'Closed') return -1;
    const index = STAGES.indexOf(stage as Stage);
    return index < 0 ? 0 : index;
  };

  history.forEach(h => {
    const from = h.from || 'Wishlist';
    const to = h.to;
    if (!to || from === to) return;
    const key = `${from}→${to}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { from, to, count: 1, backward: progress(to) < progress(from) });
  });

  const links = [...map.values()].sort((a, b) => b.count - a.count);
  return {
    links,
    totals: { ...byStage },
    max: Math.max(1, ...links.map(l => l.count)),
  };
}

/* ==================== day-of-week / time-of-day ==================== */

export type DayPattern = {
  day: string;
  index: number;
  applications: number;
  interviews: number;
  rate: number;
  avgResponseDays: number | null;
};

export type TimingInsight = {
  days: DayPattern[];
  bestDays: string[];
  worstDays: string[];
  /** e.g. 2.3 — how many times better the best window converts. */
  advantage: number | null;
  headline: string;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Whether the day you apply correlates with hearing back.
 *
 * Deliberately conservative: with fewer than 10 dated applications there is no
 * pattern to report, and the headline says so rather than inventing one.
 */
export function timingInsight(
  applications: Application[],
  interviewsMap: Record<string, InterviewDate[]>,
): TimingInsight {
  const buckets: { applications: number; interviews: number; gaps: number[] }[] = DAY_NAMES.map(() => ({
    applications: 0,
    interviews: 0,
    gaps: [],
  }));

  let dated = 0;
  applications.forEach(app => {
    const applied = parseDate(app.date_applied);
    if (!applied) return;
    dated += 1;
    const bucket = buckets[applied.getDay()];
    bucket.applications += 1;
    const rounds = interviewsMap[app.id] || [];
    const gotInterview = app.interview_offered || rounds.length > 0;
    if (gotInterview) bucket.interviews += 1;
    const first = rounds.map(r => ts(r.interview_date)).filter(Boolean).sort((a, b) => a - b)[0];
    if (first && first > applied.getTime()) bucket.gaps.push((first - applied.getTime()) / DAY_MS);
  });

  const days: DayPattern[] = buckets.map((b, index) => ({
    day: DAY_NAMES[index],
    index,
    applications: b.applications,
    interviews: b.interviews,
    rate: b.applications ? Math.round((b.interviews / b.applications) * 1000) / 10 : 0,
    avgResponseDays: b.gaps.length ? Math.round((b.gaps.reduce((s, x) => s + x, 0) / b.gaps.length) * 10) / 10 : null,
  }));

  const eligible = days.filter(d => d.applications >= 3);
  if (dated < 10 || eligible.length < 2) {
    return {
      days,
      bestDays: [],
      worstDays: [],
      advantage: null,
      headline: `Not enough dated applications yet — ${dated} logged, and patterns need around ten.`,
    };
  }

  const sorted = [...eligible].sort((a, b) => b.rate - a.rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const advantage = worst.rate > 0 ? Math.round((best.rate / worst.rate) * 10) / 10 : null;

  const headline =
    best.rate === 0
      ? 'No day has converted yet — keep going and this will fill in.'
      : advantage && advantage >= 1.5
        ? `You hear back ${advantage}× more often when you apply on a ${best.day} than on a ${worst.day}.`
        : `Your reply rate is fairly even across the week — ${best.day} leads at ${best.rate}%.`;

  return {
    days,
    bestDays: sorted.slice(0, 2).map(d => d.day),
    worstDays: sorted.slice(-2).map(d => d.day),
    advantage,
    headline,
  };
}

/* ======================== offer projection ======================== */

export type Projection = {
  /** Applications still needed for one expected offer. */
  applicationsToOffer: number | null;
  /** Weeks at the current cadence. */
  weeksToOffer: number | null;
  interviewRate: number;
  interviewToOfferRate: number;
  perWeek: number;
  confident: boolean;
  headline: string;
};

/**
 * A transparent expected-value projection, not a model.
 *
 * P(offer per application) = P(interview | applied) × P(offer | interview).
 * Both come straight from the user's own counts, and the text says so.
 */
export function offerProjection(a: Analytics): Projection {
  const interviewRate = a.applied ? a.interviews / a.applied : 0;
  const interviewToOffer = a.interviews ? a.offers / a.interviews : 0;
  // With no offers yet, fall back to a widely-cited ~25% interview→offer rate,
  // and flag the projection as unconfident so the UI can say why.
  const assumedConversion = interviewToOffer || 0.25;
  const perApplication = interviewRate * assumedConversion;
  const recentWeeks = a.byWeek.slice(-4);
  const perWeek = recentWeeks.length ? recentWeeks.reduce((s, w) => s + w.count, 0) / recentWeeks.length : 0;
  const confident = a.applied >= 10 && a.interviews >= 2;

  if (!perApplication) {
    return {
      applicationsToOffer: null,
      weeksToOffer: null,
      interviewRate: Math.round(interviewRate * 1000) / 10,
      interviewToOfferRate: Math.round(assumedConversion * 1000) / 10,
      perWeek: Math.round(perWeek * 10) / 10,
      confident: false,
      headline:
        a.applied < 5
          ? 'A projection needs a handful of applications first — log five and this fills in.'
          : 'No interviews yet, so there is no conversion rate to project from. The resume is the lever here.',
    };
  }

  const needed = Math.ceil(1 / perApplication);
  const weeks = perWeek > 0 ? Math.ceil(needed / perWeek) : null;

  return {
    applicationsToOffer: needed,
    weeksToOffer: weeks,
    interviewRate: Math.round(interviewRate * 1000) / 10,
    interviewToOfferRate: Math.round(assumedConversion * 1000) / 10,
    perWeek: Math.round(perWeek * 10) / 10,
    confident,
    headline:
      `At your ${Math.round(interviewRate * 100)}% interview rate and ` +
      `${Math.round(assumedConversion * 100)}% interview-to-offer rate, about ${needed} more applications ` +
      `gets you to one expected offer${weeks ? ` — roughly ${weeks} week${weeks === 1 ? '' : 's'} at your current pace` : ''}.` +
      (confident ? '' : ' Treat this as a rough sketch until you have more data.'),
  };
}

/* ====================== momentum breakdown ====================== */

export type MomentumPart = { label: string; detail: string; points: number; max: number };

/**
 * Why the momentum score is what it is.
 *
 * Mirrors the weighting inside computeAnalytics exactly — if that formula
 * changes, this must change with it, which is why both live in this file.
 */
export function momentumBreakdown(a: Analytics): { parts: MomentumPart[]; total: number } {
  const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
  const applied = Math.max(a.applied, 1);

  const parts: MomentumPart[] = [
    {
      label: 'Interview conversion',
      detail: `${a.interviews} of ${a.applied} applications reached an interview`,
      points: Math.round(pct(a.interviews, applied) * 0.35),
      max: 35,
    },
    {
      label: 'Responses',
      detail: `${a.responded} of ${a.applied} got any response at all`,
      points: Math.round(pct(a.responded, applied) * 0.2),
      max: 20,
    },
    {
      label: 'This week’s cadence',
      detail: `${a.thisWeek} logged this week`,
      points: Math.min(a.thisWeek, 10) * 3,
      max: 30,
    },
    {
      label: 'Streak',
      detail: `${a.streak} consecutive day${a.streak === 1 ? '' : 's'}`,
      points: Math.min(a.streak, 7) * 2,
      max: 14,
    },
    {
      label: 'Follow-up debt',
      detail: a.stale.length ? `${a.stale.length} application${a.stale.length === 1 ? '' : 's'} gone quiet` : 'Nothing overdue',
      points: a.stale.length ? -Math.min(a.stale.length * 3, 15) : 5,
      max: 5,
    },
  ];

  return { parts, total: a.momentum };
}

/* ========================== weekly wrapped ========================== */

export type Wrapped = {
  from: string;
  to: string;
  applications: number;
  interviews: number;
  offers: number;
  responses: number;
  bestPlatform: { platform: string; rate: number } | null;
  streak: number;
  momentum: number;
  topRole: string | null;
  headline: string;
  /** vs the week before */
  delta: number;
};

/** The shareable week in review — data only; the card renders it. */
export function weeklyWrapped(
  applications: Application[],
  interviewsMap: Record<string, InterviewDate[]>,
  a: Analytics,
  at = new Date(),
): Wrapped {
  const start = startOfWeek(at);
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const prevStart = new Date(start.getTime() - 7 * DAY_MS);

  const inWeek = applications.filter(app => {
    const t = ts(app.date_applied || app.created_at);
    return t >= start.getTime() && t < end.getTime();
  });
  const lastWeekCount = countInRange(applications, prevStart.getTime(), start.getTime());

  let interviews = 0;
  applications.forEach(app => {
    (interviewsMap[app.id] || []).forEach(iv => {
      const t = ts(iv.interview_date);
      if (t >= start.getTime() && t < end.getTime()) interviews += 1;
    });
  });

  const offers = inWeek.filter(app => app.response_status === 'Offered' || app.final_status === 'Accepted').length;
  const responses = inWeek.filter(app => app.response_status && app.response_status !== 'Pending').length;
  const best = a.byPlatform.filter(p => p.total >= 2).sort((x, y) => y.rate - x.rate)[0];

  const roleCount = new Map<string, number>();
  inWeek.forEach(app => {
    const role = (app.role_applied_to || '').trim();
    if (role) roleCount.set(role, (roleCount.get(role) || 0) + 1);
  });
  const topRole = [...roleCount.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || null;

  const delta = inWeek.length - lastWeekCount;
  const headline =
    offers > 0
      ? 'You got an offer this week.'
      : interviews > 0
        ? `${interviews} interview${interviews === 1 ? '' : 's'} this week.`
        : inWeek.length === 0
          ? 'A quiet week — nothing logged.'
          : delta > 0
            ? `${inWeek.length} applications out, up ${delta} on last week.`
            : `${inWeek.length} applications out this week.`;

  return {
    from: dayKey(start),
    to: dayKey(new Date(end.getTime() - DAY_MS)),
    applications: inWeek.length,
    interviews,
    offers,
    responses,
    bestPlatform: best ? { platform: best.platform, rate: best.rate } : null,
    streak: a.streak,
    momentum: a.momentum,
    topRole,
    headline,
    delta,
  };
}

/* ====================== "now" — the single next thing ====================== */

export type NowItem = {
  kind: 'interview' | 'stale' | 'task' | 'reminder' | 'cadence' | 'offer' | 'calm';
  text: string;
  detail: string;
  applicationId?: string;
  urgency: number;
};

/**
 * The one thing that matters most right now, for the persistent status strip.
 *
 * Ranked by urgency so the strip never needs a scroll: an interview tomorrow
 * outranks three quiet applications, which outrank a cadence nudge.
 */
export function nowItems(
  a: Analytics,
  store: Pick<StoreShape, 'tasks' | 'reminders'>,
  at = Date.now(),
): NowItem[] {
  const out: NowItem[] = [];

  a.upcomingInterviews.forEach(({ app, interview }) => {
    const days = Math.ceil((ts(interview.interview_date) - at) / DAY_MS);
    if (days < 0 || days > 14) return;
    out.push({
      kind: 'interview',
      text: days <= 0 ? `Interview with ${app.company_name} today` : `Interview with ${app.company_name} in ${days} day${days === 1 ? '' : 's'}`,
      detail: interview.label || 'Interview',
      applicationId: app.id,
      urgency: 1000 - days * 10,
    });
  });

  if (a.byStage.Offer > 0) {
    out.push({
      kind: 'offer',
      text: `${a.byStage.Offer} offer${a.byStage.Offer === 1 ? '' : 's'} on the table`,
      detail: 'Compare them before you answer',
      urgency: 900,
    });
  }

  const overdueTasks = store.tasks.filter(t => !t.done && t.due_at && ts(t.due_at) <= at);
  if (overdueTasks.length) {
    out.push({
      kind: 'task',
      text: `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}`,
      detail: overdueTasks[0].title,
      urgency: 700,
    });
  }

  const dueReminders = store.reminders.filter(r => !r.done && ts(r.due_at) <= at);
  if (dueReminders.length) {
    out.push({
      kind: 'reminder',
      text: `${dueReminders.length} reminder${dueReminders.length === 1 ? '' : 's'} due`,
      detail: dueReminders[0].title,
      urgency: 650,
    });
  }

  if (a.stale.length) {
    out.push({
      kind: 'stale',
      text: `${a.stale.length} application${a.stale.length === 1 ? '' : 's'} gone quiet`,
      detail: `Longest wait: ${a.stale[0].app.company_name}, ${a.stale[0].days} days`,
      applicationId: a.stale[0].app.id,
      urgency: 500,
    });
  }

  if (a.thisWeek === 0 && a.total > 0) {
    out.push({ kind: 'cadence', text: 'Nothing logged this week', detail: 'Momentum compounds — add two', urgency: 300 });
  }

  if (!out.length) {
    out.push({
      kind: 'calm',
      text: a.total ? 'Pipeline is clean' : 'Add your first application',
      detail: a.total ? `${a.active} active, nothing overdue` : 'Or ask Scout to add it for you',
      urgency: 0,
    });
  }

  return out.sort((x, y) => y.urgency - x.urgency);
}
