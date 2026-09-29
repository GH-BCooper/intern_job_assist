import { memo } from 'react';
import { Calendar, CalendarClock, Flame, MapPin, Star, UserCheck, Wallet } from 'lucide-react';
import type { Application, InterviewDate } from '../lib/supabase';
import { STAGE_META, stageLabel, stageOf, type Stage } from '../lib/insights';
import { sameJson, useStoreSelector } from '../hooks/useStore';
import { toggleStar } from '../lib/store';
import { avatarGradient, daysUntil, fmtDate, initials, truncate } from '../lib/format';
import CompanyLogo from './ui/CompanyLogo';

export const RESPONSE_BADGE: Record<string, string> = {
  Pending: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
  Viewed: 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300',
  Rejected: 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300',
  Shortlisted: 'bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300',
  Offered: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300',
};

export const FINAL_BADGE: Record<string, string> = {
  'In Progress': 'bg-light-200 dark:bg-dark-800 text-light-700 dark:text-dark-200',
  Rejected: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
  Accepted: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
  Withdrawn: 'bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-400',
};

export function StageDot({ stage, label }: { stage: Stage; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[stage].dot}`} />
      <span className={`text-[11px] font-semibold ${STAGE_META[stage].accent}`}>{label || stage}</span>
    </span>
  );
}

/** The 1–5 interest rating, deliberately not a star (that means "shortlisted"). */
export function PriorityFlames({ value, size = 10 }: { value: number; size?: number }) {
  if (!value) return null;
  return (
    <span
      className="inline-flex items-center gap-[1px] text-primary-500"
      title={`Priority ${value} of 5`}
      aria-label={`Priority ${value} of 5`}
    >
      {Array.from({ length: value }).map((_, i) => (
        <Flame key={i} size={size} fill="currentColor" />
      ))}
    </span>
  );
}

export function CompanyAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className={`rounded-xl bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center flex-shrink-0 text-white font-bold`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

type Props = {
  application: Application;
  interviews?: InterviewDate[];
  /** Called with this card's application, so a parent can pass one stable handler to every card. */
  onOpen: (app: Application) => void;
  compact?: boolean;
};

const NO_INTERVIEWS: InterviewDate[] = [];

/**
 * Everything a card reads from the local store, as one small plain object.
 *
 * With hundreds of cards on the board, subscribing each to the whole store meant
 * a star toggle or an automation tick re-rendered all of them. This selects only
 * what one card shows, and `sameJson` keeps the previous object while it is equal.
 */
function useCardView(appId: string, app: Application) {
  return useStoreSelector(s => {
    const tags = s.applicationTags
      .filter(at => at.application_id === appId)
      .map(at => s.tags.find(t => t.id === at.tag_id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .slice(0, 3)
      .map(t => ({ id: t.id, name: t.name, color: t.color }));
    const referrerId = s.referrals[appId];
    return {
      stage: stageOf(app, s.stageOverrides),
      labels: s.preferences.stageLabels,
      starred: s.starred.includes(appId),
      priority: s.priorities[appId] || 0,
      tags,
      referrer: referrerId ? s.contacts.find(c => c.id === referrerId)?.name || null : null,
    };
  }, sameJson);
}

function ApplicationCard({ application: app, interviews = NO_INTERVIEWS, onOpen, compact }: Props) {
  const view = useCardView(app.id, app);
  const { stage, starred, priority, tags, referrer } = view;
  const onClick = () => onOpen(app);

  const next = interviews.find(i => daysUntil(i.interview_date) !== null && (daysUntil(i.interview_date) as number) >= 0);
  const countdown = next ? (daysUntil(next.interview_date) as number) : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        // Keys pressed on the star button bubble up here; they belong to the button.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`card card-hover w-full text-left cursor-pointer group relative ${compact ? 'p-3' : 'p-4'}`}
    >
      <button
        onClick={e => {
          e.stopPropagation();
          toggleStar(app.id);
        }}
        className={`absolute top-3 right-3 transition-all ${
          starred
            ? 'text-primary-500'
            : // Hover-only would hide it from keyboards and touch screens.
              'text-light-400 dark:text-dark-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-primary-500'
        }`}
        aria-label={starred ? 'Unstar' : 'Star'}
      >
        <Star size={14} fill={starred ? 'currentColor' : 'none'} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <CompanyLogo name={app.company_name} size={compact ? 32 : 40} />
        <div className="min-w-0 flex-1">
          <h3 className={`font-semibold text-light-900 dark:text-white truncate ${compact ? 'text-sm' : 'text-[15px]'}`}>
            {app.company_name}
          </h3>
          {app.role_applied_to && (
            <p className="text-xs text-light-600 dark:text-dark-300 truncate">{app.role_applied_to}</p>
          )}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <StageDot stage={stage} label={stageLabel(stage, { stageLabels: view.labels })} />
            <PriorityFlames value={priority} />
          </div>
        </div>
      </div>

      {referrer && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
          <UserCheck size={11} /> via {referrer}
        </p>
      )}

      {countdown !== null && (
        <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-950/40 border border-primary-200 dark:border-primary-900">
          <CalendarClock size={12} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-primary-700 dark:text-primary-300 truncate">
            {countdown === 0 ? 'Interview today' : `Interview in ${countdown}d`}
            {next?.label ? ` · ${truncate(next.label, 24)}` : ''}
          </span>
        </div>
      )}

      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`badge ${RESPONSE_BADGE[app.response_status] || RESPONSE_BADGE.Pending}`}>
            {app.response_status || 'Pending'}
          </span>
          {app.final_status && app.final_status !== 'In Progress' && (
            <span className={`badge ${FINAL_BADGE[app.final_status] || FINAL_BADGE['In Progress']}`}>{app.final_status}</span>
          )}
          {tags.map(t => (
            <span
              key={t.id}
              className="badge"
              style={{ background: `${t.color}1f`, color: t.color, border: `1px solid ${t.color}40` }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[11px] text-light-500 dark:text-dark-400 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <Calendar size={11} /> {fmtDate(app.date_applied)}
        </span>
        {app.platform_applied_on && (
          <span className="inline-flex items-center gap-1 truncate max-w-[9rem]">
            <MapPin size={11} /> {app.platform_applied_on}
          </span>
        )}
        {app.salary_info && (
          <span className="inline-flex items-center gap-1 truncate max-w-[8rem]">
            <Wallet size={11} /> {app.salary_info}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(ApplicationCard);
