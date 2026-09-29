import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Keyboard, Layers, Plus } from 'lucide-react';
import type { Application, InterviewDate } from '../../lib/supabase';
import {
  orderedStages,
  STAGE_META,
  stageLabel,
  stageOf,
  stagePatch,
  wipLimit,
  type Stage,
} from '../../lib/insights';
import { setStage } from '../../lib/store';
import { useStore } from '../../hooks/useStore';
import { useData } from '../../context/DataContext';
import { announce, toast } from '../../lib/uiBus';
import { pushUndo } from '../../lib/undo';
import { celebrate, play } from '../../lib/fx';
import ApplicationCard from '../ApplicationCard';

type Props = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  onOpen: (app: Application) => void;
  onAdd: () => void;
};

type Lane = { key: string; label: string; items: Application[] };

const PRIORITY_LABELS = ['No rating', '1 — long shot', '2 — worth a try', '3 — solid fit', '4 — strong want', '5 — dream role'];

export default function BoardView({ applications, interviewsMap, onOpen, onAdd }: Props) {
  const store = useStore();
  const { updateApplication } = useData();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  /** The card keyboard navigation is on, as `${stage}:${id}`. */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const stages = useMemo(() => orderedStages(store.preferences), [store.preferences]);
  const swimlane = store.preferences.swimlane;

  const columns = useMemo(
    () =>
      stages.map(stage => ({
        stage,
        items: applications.filter(a => stageOf(a, store.stageOverrides) === stage),
      })),
    [stages, applications, store.stageOverrides],
  );

  /** Groups a column's cards by the chosen swimlane — pure client-side regrouping. */
  const lanesFor = useCallback(
    (items: Application[]): Lane[] => {
      if (swimlane === 'none') return [{ key: 'all', label: '', items }];

      const buckets = new Map<string, Application[]>();
      items.forEach(app => {
        let key: string;
        if (swimlane === 'platform') key = (app.platform_applied_on || '').trim() || 'No platform';
        else if (swimlane === 'priority') key = PRIORITY_LABELS[store.priorities[app.id] || 0];
        else {
          const tag = store.applicationTags
            .filter(at => at.application_id === app.id)
            .map(at => store.tags.find(t => t.id === at.tag_id)?.name)
            .filter(Boolean)[0];
          key = tag || 'Untagged';
        }
        const list = buckets.get(key);
        if (list) list.push(app);
        else buckets.set(key, [app]);
      });

      return [...buckets.entries()]
        .sort((a, b) => {
          // "No …" / "Untagged" buckets sink to the bottom; the rest by size.
          const aEmpty = /^(No |Untagged)/.test(a[0]);
          const bEmpty = /^(No |Untagged)/.test(b[0]);
          if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
          return b[1].length - a[1].length || a[0].localeCompare(b[0]);
        })
        .map(([key, list]) => ({ key, label: key, items: list }));
    },
    [swimlane, store.priorities, store.applicationTags, store.tags],
  );

  /**
   * Moves an application to a stage, syncing the Supabase fields the stage
   * implies and registering an undo that restores both halves.
   */
  const move = useCallback(
    async (app: Application, stage: Stage) => {
      const from = stageOf(app, store.stageOverrides);
      if (from === stage) return;
      const previousOverride = store.stageOverrides[app.id];

      setStage(app.id, stage, from);
      if (stage === 'Offer') celebrate();
      else play('pop');

      announce(`${app.company_name} moved to ${stageLabel(stage, store.preferences)}`);

      try {
        await updateApplication(app.id, stagePatch(stage, app));
        pushUndo(`${app.company_name} → ${stageLabel(stage, store.preferences)}`, async () => {
          if (previousOverride) setStage(app.id, previousOverride, stage);
          else setStage(app.id, from, stage);
          await updateApplication(app.id, {
            response_status: app.response_status,
            final_status: app.final_status,
            interview_offered: app.interview_offered,
            date_applied: app.date_applied,
          });
        });
      } catch (e) {
        // Put the local override back so the board doesn't lie about what saved.
        if (previousOverride) setStage(app.id, previousOverride, stage);
        else setStage(app.id, from, stage);
        toast(e instanceof Error ? e.message : 'Could not save the move.', 'error');
      }
    },
    [store.stageOverrides, store.preferences, updateApplication],
  );

  const drop = async (stage: Stage) => {
    const id = dragId;
    setDragId(null);
    setOverStage(null);
    if (!id) return;
    const app = applications.find(a => a.id === id);
    if (app) await move(app, stage);
  };

  /* ----------------------------- keyboard ----------------------------- */

  const flat = useMemo(
    () => columns.flatMap(c => c.items.map(app => ({ stage: c.stage, app }))),
    [columns],
  );

  const focused = focusKey ? flat.find(f => `${f.stage}:${f.app.id}` === focusKey) : null;

  // A card that scrolls out of the filtered set must not keep the focus ring.
  useEffect(() => {
    if (focusKey && !flat.some(f => `${f.stage}:${f.app.id}` === focusKey)) setFocusKey(null);
  }, [flat, focusKey]);

  /**
   * Full keyboard operation of the board.
   *
   * Drag-and-drop alone locks out keyboard and assistive-tech users from the
   * app's primary interaction, so every move is reachable here: arrows to
   * navigate, ⌥/Alt+arrow or 1–6 to move the focused card, Enter to open.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /input|textarea|select/i.test(target.tagName))) return;
      if (e.metaKey || e.ctrlKey) return;
      // A modal owns the keyboard. Without this, digits pressed in the detail
      // panel moved the card behind it, and Enter re-opened it.
      if (document.querySelector('[aria-modal="true"]')) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowKeys(s => !s);
        return;
      }

      if (!flat.length) return;

      // The board only takes the keyboard once it has focus (tab to it, or click a
      // card). Claiming arrows and digits page-wide meant the dashboard could no
      // longer be scrolled with the arrow keys, and stray digits moved cards.
      if (!boardRef.current || !boardRef.current.contains(document.activeElement)) return;

      // Pick up the first card when nothing is focused yet.
      if (!focused) {
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
          e.preventDefault();
          setFocusKey(`${flat[0].stage}:${flat[0].app.id}`);
        }
        return;
      }

      const column = columns.find(c => c.stage === focused.stage);
      const indexInColumn = column ? column.items.findIndex(a => a.id === focused.app.id) : -1;
      const stageIndex = stages.indexOf(focused.stage);

      const moveTo = (nextStage: Stage) => {
        e.preventDefault();
        setFocusKey(`${nextStage}:${focused.app.id}`);
        void move(focused.app, nextStage);
      };

      // Number keys jump straight to a stage.
      const asNumber = Number(e.key);
      if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= stages.length) {
        moveTo(stages[asNumber - 1]);
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          e.preventDefault();
          if (!column || indexInColumn < 0) return;
          const next = e.key === 'ArrowDown' ? indexInColumn + 1 : indexInColumn - 1;
          const card = column.items[Math.max(0, Math.min(column.items.length - 1, next))];
          if (card) setFocusKey(`${focused.stage}:${card.id}`);
          break;
        }
        case 'ArrowRight':
        case 'ArrowLeft': {
          e.preventDefault();
          const delta = e.key === 'ArrowRight' ? 1 : -1;
          const nextStage = stages[stageIndex + delta];
          if (!nextStage) return;
          if (e.altKey || e.shiftKey) {
            moveTo(nextStage);
          } else {
            const nextColumn = columns.find(c => c.stage === nextStage);
            const card = nextColumn?.items[Math.min(indexInColumn < 0 ? 0 : indexInColumn, (nextColumn?.items.length || 1) - 1)];
            setFocusKey(card ? `${nextStage}:${card.id}` : null);
          }
          break;
        }
        case 'Enter':
          // On a focused button or link, Enter already means "press it".
          if (target?.closest('button, a, [role="button"], summary')) return;
          e.preventDefault();
          onOpen(focused.app);
          break;
        case 'Escape':
          setFocusKey(null);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, focused, columns, stages, move, onOpen]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {swimlane !== 'none' && (
          <span className="chip">
            <Layers size={11} /> Grouped by {swimlane}
          </span>
        )}
        <button
          onClick={() => setShowKeys(s => !s)}
          className="btn-ghost btn-sm ml-auto !text-[11px]"
          aria-expanded={showKeys}
        >
          <Keyboard size={12} /> Keyboard moves
        </button>
      </div>

      {showKeys && (
        <div className="card p-3 mb-3 text-[11px] text-light-700 dark:text-dark-200 flex flex-wrap gap-x-5 gap-y-1.5 animate-slide-up">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> move within a column
          </span>
          <span>
            <span className="kbd">←</span> <span className="kbd">→</span> move between columns
          </span>
          <span>
            <span className="kbd">⌥</span>+<span className="kbd">←</span>/<span className="kbd">→</span> move the card
          </span>
          <span>
            <span className="kbd">1</span>–<span className="kbd">6</span> send to that stage
          </span>
          <span>
            <span className="kbd">↵</span> open · <span className="kbd">esc</span> release
          </span>
        </div>
      )}

      <div
        ref={boardRef}
        tabIndex={0}
        aria-label="Pipeline board. Use the arrow keys to move between cards."
        className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 snap-x rounded-2xl"
      >
        {columns.map(({ stage, items }) => {
          const limit = wipLimit(stage, store.preferences);
          const overLimit = limit > 0 && items.length > limit;
          const lanes = lanesFor(items);

          return (
            <section
              key={stage}
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverStage(stage);
              }}
              onDragLeave={e => {
                // Moving over a child fires dragleave on the column; only clear the
                // highlight when the pointer really left it.
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setOverStage(s => (s === stage ? null : s));
              }}
              onDrop={() => void drop(stage)}
              aria-label={`${stageLabel(stage, store.preferences)}, ${items.length} applications`}
              className={`flex-shrink-0 w-[19rem] snap-start rounded-2xl border transition-colors ${
                overStage === stage
                  ? 'border-primary-400 bg-primary-50/70 dark:bg-primary-950/20'
                  : overLimit
                    ? 'border-amber-300 dark:border-amber-900/70 bg-amber-50/40 dark:bg-amber-950/10'
                    : 'border-light-300 dark:border-dark-800 bg-light-100/60 dark:bg-dark-900/40'
              }`}
            >
              <header className="sticky top-0 z-10 flex items-center gap-2 px-3.5 h-12 border-b border-light-300/80 dark:border-dark-800/80 glass rounded-t-2xl">
                <span className={`w-2 h-2 rounded-full ${STAGE_META[stage].dot}`} />
                <h3 className="text-sm font-semibold text-light-900 dark:text-white truncate">
                  {stageLabel(stage, store.preferences)}
                </h3>
                <span
                  className={`badge ${
                    overLimit
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                      : 'bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-300'
                  }`}
                  title={limit ? `${items.length} of a ${limit} soft limit` : undefined}
                >
                  {items.length}
                  {limit > 0 && <span className="opacity-60">/{limit}</span>}
                </span>
                {overLimit && (
                  <span className="text-amber-600 dark:text-amber-400" title={`Over your ${limit} limit for this stage`}>
                    <AlertTriangle size={12} />
                  </span>
                )}
                {stage === 'Wishlist' && (
                  <button onClick={onAdd} className="ml-auto btn-ghost btn-icon !p-1" title="Add application">
                    <Plus size={14} />
                  </button>
                )}
              </header>

              {overLimit && (
                <p className="px-3.5 py-1.5 text-[10.5px] text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/30 leading-snug">
                  {items.length} here, past your soft limit of {limit}. Spreading attention thin costs more than it looks.
                </p>
              )}

              <div className="p-2.5 space-y-2.5 min-h-[8rem] max-h-[calc(100vh-20rem)] overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-[11px] text-light-500 dark:text-dark-500 px-1.5 py-6 text-center leading-relaxed">
                    {STAGE_META[stage].hint}
                    <br />
                    <span className="opacity-70">Drag cards here, or press {stages.indexOf(stage) + 1}.</span>
                  </p>
                ) : (
                  lanes.map(lane => (
                    <div key={lane.key} className={swimlane === 'none' ? 'space-y-2.5' : 'space-y-2 pt-0.5'}>
                      {lane.label && (
                        <p className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">
                          {lane.label}
                          <span className="flex-1 h-px bg-light-300 dark:bg-dark-800" />
                          {lane.items.length}
                        </p>
                      )}
                      {lane.items.map(app => {
                        const key = `${stage}:${app.id}`;
                        return (
                          <div
                            key={app.id}
                            draggable
                            onDragStart={e => {
                              // Firefox will not start a drag unless data is set.
                              e.dataTransfer.setData('text/plain', app.id);
                              e.dataTransfer.effectAllowed = 'move';
                              setDragId(app.id);
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setOverStage(null);
                            }}
                            className={`transition-transform duration-150 rounded-2xl ${
                              dragId === app.id ? 'drag-lift opacity-90' : ''
                            } ${focusKey === key ? 'kbd-focus' : ''}`}
                          >
                            <ApplicationCard
                              application={app}
                              interviews={interviewsMap[app.id] || []}
                              onClick={() => {
                                setFocusKey(key);
                                onOpen(app);
                              }}
                              compact
                            />
                            {focusKey === key && (
                              <div className="flex items-center justify-between px-1 pt-1">
                                <button
                                  onClick={() => {
                                    const prev = stages[stages.indexOf(stage) - 1];
                                    if (prev) void move(app, prev);
                                  }}
                                  disabled={stages.indexOf(stage) === 0}
                                  className="btn-ghost btn-sm !px-1.5 !py-0.5 disabled:opacity-30"
                                  aria-label="Move to previous stage"
                                >
                                  <ChevronLeft size={12} />
                                </button>
                                <span className="text-[10px] text-light-500 dark:text-dark-400">⌥ ← →</span>
                                <button
                                  onClick={() => {
                                    const next = stages[stages.indexOf(stage) + 1];
                                    if (next) void move(app, next);
                                  }}
                                  disabled={stages.indexOf(stage) === stages.length - 1}
                                  className="btn-ghost btn-sm !px-1.5 !py-0.5 disabled:opacity-30"
                                  aria-label="Move to next stage"
                                >
                                  <ChevronRight size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
