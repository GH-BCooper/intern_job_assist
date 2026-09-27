import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAI } from '../context/AIContext';
import { useStore } from '../hooks/useStore';
import { buildSuggestions, computeAnalytics } from '../lib/insights';
import { BarChart, Donut, Funnel, Gauge, Heatmap, ProgressRing, SERIES, Sparkline } from '../components/ui/Charts';
import Markdown from '../components/ui/Markdown';
import PageShell from '../components/PageShell';
import { emitUi, toast } from '../lib/uiBus';
import { setGoal } from '../lib/store';
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
        <button onClick={generateBriefing} disabled={briefingBusy} className="btn-primary">
          {briefingBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          Weekly briefing
        </button>
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

      {/* headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile
          label="Applications"
          value={a.total}
          sub={`${a.active} still active`}
          trend={a.thisWeek - a.lastWeek}
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
    </PageShell>
  );
}
