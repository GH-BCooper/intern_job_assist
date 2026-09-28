import { Check, Circle, CornerDownLeft } from 'lucide-react';
import { STAGES, STAGE_META, stageLabel, type Stage } from '../../lib/insights';
import type { StageChange } from '../../lib/store';
import { fmtDate, relative } from '../../lib/format';
import { usePreferences } from '../../hooks/useStore';

/**
 * One application's story as a compact vertical stepper — shipment-tracker
 * energy, reusing the `before:absolute` connector-line trick from TimelineView.
 *
 * Recorded transitions carry timestamps; stages passed before the history
 * existed are inferred from the current stage so an older record still reads as
 * a journey rather than a blank.
 */
export default function JourneyStepper({
  current,
  history,
  appliedAt,
}: {
  current: Stage;
  history: StageChange[];
  appliedAt?: string | null;
}) {
  const prefs = usePreferences();
  const currentIndex = STAGES.indexOf(current);

  const reachedAt = new Map<string, string>();
  history.forEach(h => {
    if (!reachedAt.has(h.to)) reachedAt.set(h.to, h.created_at);
  });
  if (appliedAt && !reachedAt.has('Applied')) reachedAt.set('Applied', appliedAt);

  const backwardMoves = history.filter(h => STAGES.indexOf(h.to as Stage) < STAGES.indexOf(h.from as Stage));

  return (
    <div className="space-y-0">
      {STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const at = reachedAt.get(stage);
        const last = i === STAGES.length - 1;

        return (
          <div
            key={stage}
            className={`relative flex gap-3 pb-3 last:pb-0 ${
              last ? '' : 'before:absolute before:left-[9px] before:top-5 before:bottom-0 before:w-px'
            } ${done ? 'before:bg-primary-400/70' : 'before:bg-light-300 dark:before:bg-dark-800'}`}
          >
            <span
              className={`relative z-10 w-[19px] h-[19px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border-2 ${
                active
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : done
                    ? 'bg-primary-100 dark:bg-primary-950 border-primary-400 text-primary-600 dark:text-primary-400'
                    : 'bg-light-100 dark:bg-dark-900 border-light-300 dark:border-dark-700 text-light-400 dark:text-dark-600'
              }`}
            >
              {done ? <Check size={10} strokeWidth={3} /> : active ? <Circle size={7} fill="currentColor" /> : null}
            </span>

            <div className="min-w-0 flex-1 pb-0.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <p
                  className={`text-sm leading-tight ${
                    active
                      ? 'font-semibold text-light-900 dark:text-white'
                      : done
                        ? 'font-medium text-light-700 dark:text-dark-200'
                        : 'text-light-500 dark:text-dark-500'
                  }`}
                >
                  {stageLabel(stage, prefs)}
                </p>
                {at && <span className="text-[11px] text-light-500 dark:text-dark-400 tabular-nums">{fmtDate(at)}</span>}
                {active && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${STAGE_META[stage].accent}`}>now</span>
                )}
              </div>
              {(active || done) && (
                <p className="text-[11px] text-light-500 dark:text-dark-400 leading-snug">{STAGE_META[stage].hint}</p>
              )}
            </div>
          </div>
        );
      })}

      {backwardMoves.length > 0 && (
        <div className="mt-3 pt-3 border-t border-light-300 dark:border-dark-800 space-y-1">
          {backwardMoves.slice(0, 3).map(move => (
            <p key={move.id} className="text-[11px] text-light-500 dark:text-dark-400 flex items-center gap-1.5">
              <CornerDownLeft size={11} className="text-amber-500 flex-shrink-0" />
              Moved back from {stageLabel(move.from, prefs)} to {stageLabel(move.to, prefs)} · {relative(move.created_at)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
