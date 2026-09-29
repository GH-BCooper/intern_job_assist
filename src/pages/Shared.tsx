import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { fetchSharedDashboard, ShareUnavailableError, type SharedSnapshot } from '../lib/share';
import { BarChart, Funnel, Gauge } from '../components/ui/Charts';
import { fmtDate } from '../lib/format';

const STAGE_COLORS: Record<string, string> = {
  Wishlist: '#A99175',
  Applied: '#38BDF8',
  'In Review': '#A78BFA',
  Interviewing: '#FB923C',
  Offer: '#34D399',
  Closed: '#FF7E7E',
};

/**
 * The public read-only view behind a share link.
 *
 * Aggregate numbers only — no company names, no notes, no contacts. Renders
 * without an account, and deliberately does not mount the app's providers.
 */
export default function Shared() {
  const { token = '' } = useParams();
  const [snapshot, setSnapshot] = useState<SharedSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    // A previous link's result must not linger: an old error used to hide a new,
    // perfectly good snapshot.
    setLoading(true);
    setError('');
    setSnapshot(null);
    fetchSharedDashboard(token)
      .then(result => {
        if (!live) return;
        if (!result) setError('This link has expired, been revoked, or never existed.');
        else setSnapshot(result);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(
          e instanceof ShareUnavailableError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Could not load this dashboard.',
        );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={26} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <AlertTriangle size={26} className="mx-auto text-amber-500 mb-3" />
          <h1 className="text-lg font-bold text-light-900 dark:text-white mb-2">Nothing to show</h1>
          <p className="text-sm text-light-600 dark:text-dark-300 mb-5 leading-relaxed">{error}</p>
          <Link to="/" className="btn-secondary">
            Go to InternTrack <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  const p = snapshot.payload;
  const owner = p.owner || 'A job seeker';

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden border-b border-light-300 dark:border-dark-800">
        <div className="absolute inset-0 pointer-events-none">
          <div className="ambient-mesh" />
        </div>
        <div className="relative max-w-5xl mx-auto px-5 py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary-600 dark:text-primary-400 mb-2">
            Shared read-only · {snapshot.label || 'Search progress'}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-light-900 dark:text-white tracking-tight">
            {owner}&rsquo;s internship search
          </h1>
          <p className="text-sm text-light-600 dark:text-dark-300 mt-2">
            Snapshot taken {fmtDate(p.generated_at)} · aggregate figures only, no individual applications
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 py-8 space-y-5">
        <p className="text-sm text-light-700 dark:text-dark-200 font-medium">{p.wrapped.headline}</p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Applications', value: p.totals.total, sub: `${p.totals.active} still active` },
            { label: 'Response rate', value: `${p.rates.response}%`, sub: `${p.totals.responded} replied` },
            { label: 'Interview rate', value: `${p.rates.interview}%`, sub: `${p.totals.interviews} reached an interview` },
            { label: 'Offers', value: p.totals.offers, sub: p.avgResponseDays ? `${p.avgResponseDays}d avg to first round` : '' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">
                {s.label}
              </p>
              <p className="text-2xl font-bold tabular-nums text-light-900 dark:text-white leading-none mt-1">{s.value}</p>
              {s.sub && <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">{s.sub}</p>}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="card p-5 flex flex-col items-center justify-center">
            <Gauge value={p.momentum} label="Search momentum" />
            <p className="text-xs text-light-600 dark:text-dark-300 mt-2 text-center">
              {p.streak} day streak · best {p.bestStreak}
            </p>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-3">Pipeline</h2>
            <Funnel
              steps={Object.entries(p.byStage).map(([stage, value]) => ({
                label: stage,
                value,
                color: STAGE_COLORS[stage] || '#FB923C',
              }))}
            />
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-1">Applications per week</h2>
            <p className="text-[11px] text-light-500 dark:text-dark-400 mb-3">Last twelve weeks</p>
            <BarChart data={p.byWeek} height={130} />
          </div>
        </div>

        {p.byPlatform.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-3">Where the applications went</h2>
            <div className="space-y-2">
              {p.byPlatform.slice(0, 8).map(platform => {
                const max = Math.max(1, ...p.byPlatform.map(x => x.total));
                return (
                  <div key={platform.platform} className="flex items-center gap-3 text-xs">
                    <span className="w-28 truncate text-light-700 dark:text-dark-200">{platform.platform}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-light-300/70 dark:bg-dark-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-400"
                        style={{ width: `${(platform.total / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-28 text-right tabular-nums text-light-500 dark:text-dark-400">
                      {platform.total} sent · {platform.rate}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {p.topRoles.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-3">Roles targeted</h2>
            <div className="flex flex-wrap gap-1.5">
              {p.topRoles.map(role => (
                <span key={role.role} className="chip">
                  {role.role} · {role.count}
                </span>
              ))}
            </div>
          </div>
        )}

        <footer className="pt-4 border-t border-light-300 dark:border-dark-800 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-light-500 dark:text-dark-400">
            Shared from InternTrack. The owner can revoke this link at any time.
          </p>
          <Link to="/" className="btn-secondary btn-sm">
            Track your own search <ArrowRight size={13} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
