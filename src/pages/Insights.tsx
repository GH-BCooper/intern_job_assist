import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Flame,
  ImageDown,
  Info,
  Loader2,
  Medal,
  Plus,
  Route,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAI } from '../context/AIContext';
import { useStore } from '../hooks/useStore';
import {
  buildSuggestions,
  computeAnalytics,
  momentumBreakdown,
  offerProjection,
  periodComparisons,
  stageFlow,
  timingInsight,
  weeklyWrapped,
} from '../lib/insights';
import Sankey from '../components/ui/Sankey';
import BadgeShelf from '../components/ui/BadgeShelf';
import WrappedCard from '../components/WrappedCard';
import EmptyState from '../components/ui/EmptyArt';
import { computeBadges } from '../lib/badges';
import { earnBadges } from '../lib/store';
import { BarChart, Donut, Funnel, Gauge, Heatmap, ProgressRing, SERIES, Sparkline } from '../components/ui/Charts';
import Markdown from '../components/ui/Markdown';
import PageShell from '../components/PageShell';
import { emitUi, toast } from '../lib/uiBus';
import { setGoal } from '../lib/store';
import { celebrate } from '../lib/fx';
import { startOfMonth, startOfWeek, ts } from '../lib/format';

const GOAL_LABEL: Record<string, string> = {
  applications: 'Applications sent',
  interviews: 'Interviews landed',
  offers: 'Offers received',
  outreach: 'Outreach messages',
};

function StatTile({
  label,
  value,
  sub,
  trend,
  spark,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  spark?: number[];
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">{label}</p>
      <div className="flex items-end gap-2 mt-1">
        <p className="text-2xl font-bold text-light-900 dark:text-white tabular-nums leading-none">{value}</p>
        {trend !== undefined && trend !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
              trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {trend > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
      {sub && <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">{sub}</p>}
      {spark && spark.length > 1 && <Sparkline values={spark} height={28} className="mt-2" />}
    </div>
  );
}

export default function Insights() {
  const { applications, interviewsMap, loading } = useData();
  const store = useStore();
  const ai = useAI();
  const [briefing, setBriefing] = useState('');
  const [briefingBusy, setBriefingBusy] = useState(false);

  const a = useMemo(
    () => computeAnalytics(applications, interviewsMap, store, store.preferences.followUpDays),
    [applications, interviewsMap, store],
  );
  const comparisons = useMemo(() => periodComparisons(applications), [applications]);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const flow = useMemo(() => stageFlow(store.stageHistory, a.byStage), [store.stageHistory, a.byStage]);
  const timing = useMemo(() => timingInsight(applications, interviewsMap), [applications, interviewsMap]);
  const projection = useMemo(() => offerProjection(a), [a]);
  const momentumParts = useMemo(() => momentumBreakdown(a), [a]);
  const badges = useMemo(() => computeBadges(a, store), [a, store]);
  const wrapped = useMemo(() => weeklyWrapped(applications, interviewsMap, a), [applications, interviewsMap, a]);
  const [showWrapped, setShowWrapped] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const snapshotRef = useRef<HTMLDivElement>(null);

  /**
   * Awards any newly-earned achievements.
   *
   * Runs during render-derived memo rather than an effect because `earnBadges`
   * is idempotent and returns only the genuinely new ids — so the celebration
   * fires once per unlock, not once per render.
   */
  const newlyEarned = useMemo(() => {
    const fresh = earnBadges(badges.filter(b => b.earned).map(b => b.id));
    if (fresh.length) celebrate();
    return fresh;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badges.map(b => `${b.id}:${b.earned}`).join('|')]);

  /** Renders the headline block to a PNG for sharing. */
  const shareSnapshot = async () => {
    const node = snapshotRef.current;
    if (!node) return;
    setSnapshotBusy(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(node, {
        backgroundColor: document.documentElement.classList.contains('dark') ? '#1B170E' : '#FEF7EC',
        scale: 2,
        logging: false,
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
      if (!blob) throw new Error('Could not render the snapshot.');
      const file = new File([blob], 'interntrack-insights.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: 'My search so far' });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'interntrack-insights.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Snapshot saved as a PNG.', 'success');
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') toast(e.message, 'error');
    } finally {
      setSnapshotBusy(false);
    }
  };

  const suggestions = useMemo(
    () => buildSuggestions(applications, interviewsMap, a, store),
    [applications, interviewsMap, a, store],
  );

  const goalProgress = useMemo(() => {
    const weekStart = startOfWeek().getTime();
    const monthStart = startOfMonth().getTime();
    return store.goals.map(g => {
      const since = g.period === 'week' ? weekStart : monthStart;
      let value = 0;
      if (g.metric === 'applications') value = applications.filter(x => ts(x.date_applied || x.created_at) >= since).length;
      else if (g.metric === 'interviews')
        value = Object.values(interviewsMap)
          .flat()
          .filter(iv => ts(iv.interview_date) >= since).length;
      else if (g.metric === 'offers')
        value = applications.filter(
          x => (x.response_status === 'Offered' || x.final_status === 'Accepted') && ts(x.updated_at) >= since,
        ).length;
      else value = store.contacts.filter(c => ts(c.created_at) >= since).length;
      return { ...g, value };
    });
  }, [store.goals, store.contacts, applications, interviewsMap]);

  const generateBriefing = async () => {
    if (!ai.configured) {
      toast('Connect a free model in Settings to generate a briefing.', 'error');
      return;
    }
    setBriefingBusy(true);
    try {
      const text = await ai.askInline(
        [
          'Write my weekly internship-search briefing. Use this data only:',
          JSON.stringify({
            totals: { total: a.total, applied: a.applied, interviews: a.interviews, offers: a.offers, rejected: a.rejected },
            rates: { response: a.responseRate, interview: a.interviewRate, offer: a.offerRate },
            stages: a.byStage,
            thisWeek: a.thisWeek,
            lastWeek: a.lastWeek,
            streak: a.streak,
            momentum: a.momentum,
            platforms: a.byPlatform,
            topRoles: a.topRoles,
            stale: a.stale.slice(0, 8).map(s => ({ company: s.app.company_name, daysQuiet: s.days })),
            upcoming: a.upcomingInterviews.slice(0, 5).map(u => ({ company: u.app.company_name, date: u.interview.interview_date })),
          }),
          '',
          'Structure: **Where you stand** (2 sentences with numbers), **What is working**, **What is not**, **Do these three things this week** (numbered, each one concrete and tied to a named company where possible). Under 220 words. No preamble.',
        ].join('\n'),
      );
      setBriefing(text);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not generate the briefing.', 'error');
    } finally {
      setBriefingBusy(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Insights">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Insights"
      subtitle="Every number in your search, and what to do about it."
      actions={
        <>
          <button onClick={() => setShowWrapped(true)} className="btn-secondary">
            <Trophy size={14} /> Week in review
          </button>
          <button onClick={() => void shareSnapshot()} disabled={snapshotBusy} className="btn-secondary">
            {snapshotBusy ? <Loader2 size={14} className="animate-spin" /> : <ImageDown size={14} />}
            <span className="hidden sm:inline">Share snapshot</span>
          </button>
          <button onClick={generateBriefing} disabled={briefingBusy} className="btn-primary">
            {briefingBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Weekly briefing
          </button>
        </>
      }
    >
      {briefing && (
        <div className="card p-5 mb-6 border-primary-300 dark:border-primary-900 bg-gradient-to-br from-primary-50/80 to-accent-50/50 dark:from-primary-950/30 dark:to-accent-950/20 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={15} className="text-primary-600 dark:text-primary-400" />
            <h2 className="text-sm font-semibold text-light-900 dark:text-white">Your weekly briefing</h2>
            <button onClick={() => setBriefing('')} className="ml-auto text-xs text-light-500 hover:text-light-800 dark:hover:text-white">
              Dismiss
            </button>
          </div>
          <Markdown text={briefing} className="text-light-800 dark:text-dark-100" />
        </div>
      )}

      {newlyEarned.length > 0 && (
        <div className="card p-4 mb-4 border-primary-300 dark:border-primary-900 bg-gradient-to-br from-primary-50/80 to-accent-50/40 dark:from-primary-950/30 dark:to-accent-950/20 animate-slide-up">
          <p className="text-sm font-semibold text-light-900 dark:text-white flex items-center gap-2">
            <Medal size={15} className="text-primary-500" />
            {newlyEarned.length === 1 ? 'Achievement unlocked' : `${newlyEarned.length} achievements unlocked`}
          </p>
          <p className="text-xs text-light-600 dark:text-dark-300 mt-1">
            {badges
              .filter(b => newlyEarned.includes(b.id))
              .map(b => b.name)
              .join(' · ')}
          </p>
        </div>
      )}

      {/* period comparison */}
      <div className="flex items-center gap-1.5 mb-3">
        <CalendarRange size={13} className="text-light-500 dark:text-dark-400" />
        <div className="flex gap-1 p-1 rounded-xl bg-light-200/80 dark:bg-dark-900 border border-light-300 dark:border-dark-800">
          {(['week', 'month', 'quarter'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`tab !py-1 !px-2.5 !text-[11px] ${period === p ? 'tab-active' : ''}`}
            >
              {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Quarter'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-light-600 dark:text-dark-300 ml-1">
          {comparisons[period].current} this {period} vs {comparisons[period].previous} last{' '}
          {comparisons[period].deltaPct !== null && (
            <span
              className={`font-semibold ${
                comparisons[period].delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              ({comparisons[period].delta >= 0 ? '+' : ''}
              {comparisons[period].deltaPct}%)
            </span>
          )}
        </p>
      </div>

      {/* headline stats */}
      <div ref={snapshotRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 p-1 rounded-2xl">
        <StatTile
          label="Applications"
          value={a.total}
          sub={`${a.active} still active`}
          trend={comparisons[period].delta}
          spark={a.byWeek.map(w => w.count)}
        />
        <StatTile label="Response rate" value={`${a.responseRate}%`} sub={`${a.responded} of ${a.applied} replied`} />
        <StatTile label="Interview rate" value={`${a.interviewRate}%`} sub={`${a.interviews} reached interview`} />
        <StatTile
          label="Avg. days to interview"
          value={a.avgResponseDays ?? '—'}
          sub={a.avgResponseDays ? 'from applying to first round' : 'no interviews dated yet'}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-3">Momentum</h2>
          <div className="flex items-center justify-around">
            <Gauge value={a.momentum} label="Search momentum" />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame size={16} className="text-primary-500" />
                <div>
                  <p className="text-lg font-bold text-light-900 dark:text-white leading-none tabular-nums">{a.streak}</p>
                  <p className="text-[11px] text-light-500 dark:text-dark-400">day streak</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-sky-500" />
                <div>
                  <p className="text-lg font-bold text-light-900 dark:text-white leading-none tabular-nums">{a.thisWeek}</p>
                  <p className="text-[11px] text-light-500 dark:text-dark-400">this week</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-3">Pipeline funnel</h2>
          <Funnel
            steps={[
              { label: 'Applied', value: a.applied, color: SERIES[1] },
              { label: 'Got a response', value: a.responded, color: SERIES[3] },
              { label: 'Interviewed', value: a.interviews, color: SERIES[0] },
              { label: 'Offered', value: a.offers, color: SERIES[2] },
            ]}
          />
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-3">Stage distribution</h2>
          <Donut
            segments={Object.entries(a.byStage).map(([label, value], i) => ({ label, value, color: SERIES[i % SERIES.length] }))}
            centerLabel="in pipeline"
            centerValue={a.active}
            size={130}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-1">Applications per week</h2>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mb-3">Last 12 weeks</p>
          <BarChart data={a.byWeek} height={150} />
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-1">Activity heatmap</h2>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mb-3">Last 6 months · {a.bestStreak} day best streak</p>
          <Heatmap data={a.heatmap} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-3">Platform performance</h2>
          {a.byPlatform.length === 0 ? (
            <p className="text-sm text-light-500 dark:text-dark-400">No platforms recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-light-500 dark:text-dark-400">
                  <th className="text-left font-semibold pb-2">Platform</th>
                  <th className="text-right font-semibold pb-2">Sent</th>
                  <th className="text-right font-semibold pb-2">Interviews</th>
                  <th className="text-right font-semibold pb-2">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-300 dark:divide-dark-800">
                {a.byPlatform.slice(0, 8).map(p => (
                  <tr key={p.platform}>
                    <td className="py-2 text-light-800 dark:text-dark-100 max-w-[10rem] truncate">{p.platform}</td>
                    <td className="py-2 text-right tabular-nums text-light-700 dark:text-dark-200">{p.total}</td>
                    <td className="py-2 text-right tabular-nums text-light-700 dark:text-dark-200">{p.interviews}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`badge ${
                          p.rate >= 20
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : p.rate > 0
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-400'
                        }`}
                      >
                        {p.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-light-900 dark:text-white">Goals</h2>
            <button
              onClick={() => {
                setGoal('applications', 5, 'week');
                toast('Weekly goal set to 5 applications. Ask Scout to change it any time.', 'success');
              }}
              className="btn-ghost btn-sm !px-2"
            >
              <Plus size={12} /> Quick goal
            </button>
          </div>
          {goalProgress.length === 0 ? (
            <div className="text-center py-6">
              <Target size={22} className="mx-auto text-light-400 dark:text-dark-600 mb-2" />
              <p className="text-sm text-light-600 dark:text-dark-300">No goals yet.</p>
              <p className="text-xs text-light-500 dark:text-dark-400 mt-1">
                Set one above, or say “set a goal of 10 applications a week”.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {goalProgress.map(g => (
                <ProgressRing
                  key={g.id}
                  value={g.value}
                  target={g.target}
                  label={`${GOAL_LABEL[g.metric]} / ${g.period}`}
                />
              ))}
            </div>
          )}
          {a.topRoles.length > 0 && (
            <>
              <div className="divider my-4" />
              <h3 className="text-xs font-semibold text-light-700 dark:text-dark-200 mb-2">Most-applied roles</h3>
              <div className="flex flex-wrap gap-1.5">
                {a.topRoles.map(r => (
                  <span key={r.role} className="chip">
                    {r.role}
                    <span className="font-semibold tabular-nums">{r.count}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* momentum breakdown */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-1">Why your momentum is {a.momentum}</h2>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mb-3">
            The four inputs the score blends, so it reads as coaching rather than a mystery number.
          </p>
          <div className="space-y-2.5">
            {momentumParts.parts.map(part => {
              const negative = part.points < 0;
              const width = Math.min(100, Math.abs(part.points) / Math.max(1, part.max) * 100);
              return (
                <div key={part.label}>
                  <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                    <span className="font-medium text-light-700 dark:text-dark-200">{part.label}</span>
                    <span
                      className={`tabular-nums font-semibold ${
                        negative ? 'text-red-600 dark:text-red-400' : 'text-light-900 dark:text-white'
                      }`}
                    >
                      {part.points > 0 ? '+' : ''}
                      {part.points}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-light-300/70 dark:bg-dark-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${negative ? 'bg-red-400' : 'bg-gradient-to-r from-primary-500 to-accent-400'}`}
                      style={{ width: `${Math.max(width, 2)}%` }}
                    />
                  </div>
                  <p className="text-[10.5px] text-light-500 dark:text-dark-400 mt-0.5">{part.detail}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-1">How far to an offer</h2>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mb-3">
            Expected value from your own conversion rates. Transparent arithmetic, not a prediction.
          </p>
          {projection.applicationsToOffer ? (
            <>
              <div className="flex items-end gap-5 mb-3">
                <div>
                  <p className="text-3xl font-bold tabular-nums text-light-900 dark:text-white leading-none">
                    {projection.applicationsToOffer}
                  </p>
                  <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">more applications</p>
                </div>
                {projection.weeksToOffer && (
                  <div>
                    <p className="text-3xl font-bold tabular-nums text-primary-600 dark:text-primary-400 leading-none">
                      {projection.weeksToOffer}
                    </p>
                    <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">weeks at this pace</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-light-700 dark:text-dark-200 leading-relaxed">{projection.headline}</p>
            </>
          ) : (
            <p className="text-xs text-light-700 dark:text-dark-200 leading-relaxed">{projection.headline}</p>
          )}
          <div className="mt-3 pt-3 border-t border-light-300 dark:border-dark-800 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-bold tabular-nums text-light-900 dark:text-white">{projection.interviewRate}%</p>
              <p className="text-[10px] text-light-500 dark:text-dark-400">applied → interview</p>
            </div>
            <div>
              <p className="text-sm font-bold tabular-nums text-light-900 dark:text-white">{projection.interviewToOfferRate}%</p>
              <p className="text-[10px] text-light-500 dark:text-dark-400">interview → offer</p>
            </div>
            <div>
              <p className="text-sm font-bold tabular-nums text-light-900 dark:text-white">{projection.perWeek}</p>
              <p className="text-[10px] text-light-500 dark:text-dark-400">per week now</p>
            </div>
          </div>
        </div>
      </div>

      {/* stage flow + timing */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-1 flex items-center gap-2">
            <Route size={14} className="text-primary-500" /> How applications actually moved
          </h2>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mb-3">
            Every recorded stage transition, including the backward ones the funnel cannot show.
          </p>
          <Sankey flow={flow} />
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-1">When you apply matters</h2>
          <p className="text-xs text-light-700 dark:text-dark-200 leading-relaxed mb-3">{timing.headline}</p>
          <div className="space-y-1.5">
            {timing.days
              .filter(d => d.applications > 0)
              .map(d => {
                const max = Math.max(1, ...timing.days.map(x => x.rate));
                return (
                  <div key={d.day} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-light-600 dark:text-dark-300 flex-shrink-0">{d.day.slice(0, 3)}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-light-300/70 dark:bg-dark-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-400"
                        style={{ width: `${Math.max((d.rate / max) * 100, d.rate ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className="w-24 text-right text-light-500 dark:text-dark-400 tabular-nums flex-shrink-0">
                      {d.rate}% of {d.applications}
                    </span>
                  </div>
                );
              })}
          </div>
          {timing.days.every(d => d.applications === 0) && (
            <EmptyState art="chart" title="No dated applications yet" hint="Add a date applied and the pattern appears here." />
          )}
        </div>
      </div>

      {/* achievements */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-1 flex items-center gap-2">
          <Medal size={14} className="text-primary-500" /> Achievements
        </h2>
        <p className="text-[11px] text-light-500 dark:text-dark-400 mb-3">
          Computed from your existing records, so importing history unlocks them retroactively.
        </p>
        <BadgeShelf badges={badges} />
      </div>

      {/* coaching */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white">What to do next</h2>
          <button
            onClick={() => emitUi({ type: 'open-assistant', prompt: 'Work through my recommended next actions with me, and do what you can automatically.' })}
            className="btn-secondary btn-sm"
          >
            <Sparkles size={12} /> Act on these
          </button>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-sm text-light-600 dark:text-dark-300">Nothing needs attention — a rare and good place to be.</p>
        ) : (
          <ul className="grid md:grid-cols-2 gap-2.5">
            {suggestions.map(s => {
              const Icon = s.severity === 'warn' ? AlertTriangle : s.severity === 'good' ? CheckCircle2 : Info;
              const tone =
                s.severity === 'warn'
                  ? 'text-amber-600 dark:text-amber-400'
                  : s.severity === 'good'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-sky-600 dark:text-sky-400';
              return (
                <li key={s.id} className="panel p-3 flex items-start gap-2.5">
                  <Icon size={15} className={`${tone} mt-0.5 flex-shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-light-900 dark:text-white leading-snug">{s.title}</p>
                    <p className="text-xs text-light-600 dark:text-dark-300 leading-snug mt-0.5">{s.detail}</p>
                    {s.applicationId && (
                      <button
                        onClick={() => {
                          emitUi({ type: 'navigate', to: '/dashboard' });
                          emitUi({ type: 'open-application', id: s.applicationId as string });
                        }}
                        className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 mt-1.5 hover:underline"
                      >
                        Open application →
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {showWrapped && <WrappedCard data={wrapped} onClose={() => setShowWrapped(false)} />}
    </PageShell>
  );
}
