import {
  Brain,
  Calendar,
  Flame,
  Medal,
  Rocket,
  Sparkles,
  Target,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Badge } from '../../lib/badges';

const ICONS: Record<Badge['icon'], LucideIcon> = {
  rocket: Rocket,
  flame: Flame,
  trophy: Trophy,
  target: Target,
  calendar: Calendar,
  users: Users,
  brain: Brain,
  sparkles: Sparkles,
  medal: Medal,
  zap: Zap,
};

const TIERS: Record<Badge['tier'], { ring: string; fill: string }> = {
  bronze: { ring: 'border-amber-300 dark:border-amber-800', fill: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' },
  silver: { ring: 'border-sky-300 dark:border-sky-800', fill: 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300' },
  gold: { ring: 'border-primary-300 dark:border-primary-800', fill: 'bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300' },
};

/** Achievements, earned ones first, with progress shown for the rest. */
export default function BadgeShelf({ badges, showLocked = true }: { badges: Badge[]; showLocked?: boolean }) {
  const earned = badges.filter(b => b.earned);
  const locked = badges.filter(b => !b.earned).sort((a, b) => b.progress - a.progress);
  const shown = showLocked ? [...earned, ...locked] : earned;

  if (!shown.length) {
    return <p className="text-sm text-light-500 dark:text-dark-400">Log your first application to start unlocking these.</p>;
  }

  return (
    <div>
      <p className="text-xs text-light-600 dark:text-dark-300 mb-3">
        <span className="font-semibold text-light-900 dark:text-white">{earned.length}</span> of {badges.length} unlocked
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {shown.map(badge => {
          const Icon = ICONS[badge.icon];
          const tier = TIERS[badge.tier];
          return (
            <div
              key={badge.id}
              className={`rounded-xl border p-3 transition-all ${
                badge.earned ? `${tier.ring} bg-light-50 dark:bg-dark-900` : 'border-light-300 dark:border-dark-800 opacity-70'
              }`}
              title={badge.detail}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    badge.earned ? tier.fill : 'bg-light-200 dark:bg-dark-800 text-light-400 dark:text-dark-600'
                  }`}
                >
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-semibold leading-tight ${
                      badge.earned ? 'text-light-900 dark:text-white' : 'text-light-600 dark:text-dark-300'
                    }`}
                  >
                    {badge.name}
                  </p>
                  <p className="text-[10.5px] text-light-500 dark:text-dark-400 leading-snug mt-0.5">{badge.detail}</p>
                </div>
              </div>
              {!badge.earned && badge.progress > 0 && (
                <div className="mt-2 h-1 rounded-full bg-light-300 dark:bg-dark-800 overflow-hidden">
                  <div className="h-full rounded-full bg-primary-400" style={{ width: `${Math.round(badge.progress * 100)}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
