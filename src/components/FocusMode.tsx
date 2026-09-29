import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Check, Pause, Play, Plus, RotateCcw, Timer, X } from 'lucide-react';
import type { Application, InterviewDate } from '../lib/supabase';
import { useStore } from '../hooks/useStore';
import { addTask, toggleTask } from '../lib/store';
import { stageLabel, stageOf } from '../lib/insights';
import { fmtDate, fmtDateTime } from '../lib/format';
import { play } from '../lib/fx';
import JourneyStepper from './ui/JourneyStepper';
import { toast } from '../lib/uiBus';

const POMODORO_MINUTES = 25;

/**
 * Distraction-free single-application view.
 *
 * Large type, no chrome, and an optional Pomodoro for deep prep sessions. Reads
 * the same data as ApplicationDetail — this is a different shell, not a
 * different source of truth.
 */
export default function FocusMode({
  application: app,
  interviews,
  onClose,
}: {
  application: Application;
  interviews: InterviewDate[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const store = useStore();
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [newTask, setNewTask] = useState('');
  const endedRef = useRef(false);

  const tasks = useMemo(() => store.tasks.filter(t => t.application_id === app.id), [store.tasks, app.id]);
  const notes = useMemo(() => store.notes.filter(n => n.application_id === app.id), [store.notes, app.id]);
  const history = useMemo(() => store.stageHistory.filter(h => h.application_id === app.id), [store.stageHistory, app.id]);
  const stage = stageOf(app, store.stageOverrides);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (secondsLeft > 0) {
      endedRef.current = false;
      return;
    }
    if (endedRef.current) return;
    endedRef.current = true;
    setRunning(false);
    play('chime');
    toast('Focus block done. Stand up, then decide what is next.', 'success');
  }, [secondsLeft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addOne = useCallback(() => {
    const title = newTask.trim();
    if (!title) return;
    addTask({ title, application_id: app.id });
    setNewTask('');
    play('click');
  }, [newTask, app.id]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const progress = 1 - secondsLeft / (POMODORO_MINUTES * 60);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[125] bg-light-200 dark:bg-dark-950 overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="ambient-mesh" />
      </div>

      <div className="relative max-w-3xl mx-auto px-6 py-10 sm:py-16">
        <header className="flex items-start justify-between gap-4 mb-10">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary-600 dark:text-primary-400 mb-2">
              Focus · {stageLabel(stage, store.preferences)}
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-light-900 dark:text-white tracking-tight leading-[1.05]">
              {app.company_name}
            </h1>
            {app.role_applied_to && (
              <p className="text-lg sm:text-xl text-light-600 dark:text-dark-300 mt-2">{app.role_applied_to}</p>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost btn-icon flex-shrink-0" aria-label="Leave focus mode">
            <X size={20} />
          </button>
        </header>

        {/* Pomodoro */}
        <section className="card p-5 mb-8 flex items-center gap-5 flex-wrap">
          <div className="relative">
            <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
              <circle cx="36" cy="36" r="30" fill="none" strokeWidth="5" className="stroke-light-300 dark:stroke-dark-800" />
              <circle
                cx="36"
                cy="36"
                r="30"
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                className="stroke-primary-500"
                strokeDasharray={`${progress * 2 * Math.PI * 30} ${2 * Math.PI * 30}`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-light-900 dark:text-white">
              {mm}:{ss}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-light-900 dark:text-white flex items-center gap-1.5">
              <Timer size={14} className="text-primary-500" /> {POMODORO_MINUTES}-minute prep block
            </p>
            <p className="text-xs text-light-600 dark:text-dark-300 mt-0.5">
              One company, one block. Nothing else on screen.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRunning(r => !r)} className="btn-primary btn-sm">
              {running ? <Pause size={13} /> : <Play size={13} />}
              {running ? 'Pause' : secondsLeft === POMODORO_MINUTES * 60 ? 'Start' : 'Resume'}
            </button>
            <button
              onClick={() => {
                setRunning(false);
                setSecondsLeft(POMODORO_MINUTES * 60);
              }}
              className="btn-ghost btn-icon"
              aria-label="Reset timer"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </section>

        <div className="grid sm:grid-cols-2 gap-8">
          <div className="space-y-8">
            {interviews.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-light-500 dark:text-dark-400 mb-3">Rounds</h2>
                <ul className="space-y-2">
                  {interviews.map(iv => (
                    <li key={iv.id} className="text-base text-light-800 dark:text-dark-100">
                      <span className="font-semibold">{iv.label || 'Interview'}</span>
                      <span className="text-light-600 dark:text-dark-300"> · {fmtDateTime(iv.interview_date)}</span>
                      {store.interviewMeta[iv.id]?.timezone && (
                        <span className="text-light-500 dark:text-dark-400 text-sm"> ({store.interviewMeta[iv.id].timezone})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {app.interview_questions && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-light-500 dark:text-dark-400 mb-3">
                  Questions to expect
                </h2>
                <p className="text-base leading-relaxed text-light-800 dark:text-dark-100 whitespace-pre-wrap">
                  {app.interview_questions}
                </p>
              </section>
            )}

            {app.tasks_to_complete && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-light-500 dark:text-dark-400 mb-3">
                  Take-home
                </h2>
                <p className="text-base leading-relaxed text-light-800 dark:text-dark-100 whitespace-pre-wrap">
                  {app.tasks_to_complete}
                </p>
              </section>
            )}

            {notes.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-light-500 dark:text-dark-400 mb-3">Notes</h2>
                <div className="space-y-3">
                  {notes.slice(0, 6).map(n => (
                    <p key={n.id} className="text-[15px] leading-relaxed text-light-800 dark:text-dark-100 whitespace-pre-wrap">
                      {n.body}
                    </p>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-8">
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-light-500 dark:text-dark-400 mb-3">Journey</h2>
              <JourneyStepper current={stage} history={history} appliedAt={app.date_applied} />
            </section>

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-light-500 dark:text-dark-400 mb-3">
                This session
              </h2>
              <ul className="space-y-1.5 mb-3">
                {tasks.map(t => (
                  <li key={t.id}>
                    <button
                      onClick={() => {
                        toggleTask(t.id);
                        if (!t.done) play('pop');
                      }}
                      className="flex items-start gap-2 text-left w-full group"
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          t.done
                            ? 'bg-primary-500 border-primary-500 text-white'
                            : 'border-light-400 dark:border-dark-600 group-hover:border-primary-400'
                        }`}
                      >
                        {t.done && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span
                        className={`text-[15px] ${
                          t.done ? 'line-through text-light-500 dark:text-dark-500' : 'text-light-800 dark:text-dark-100'
                        }`}
                      >
                        {t.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <input
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addOne();
                  }}
                  placeholder="Add a prep step…"
                  className="input-field !py-2"
                />
                <button onClick={addOne} className="btn-secondary btn-icon" aria-label="Add">
                  <Plus size={15} />
                </button>
              </div>
            </section>

            <p className="text-xs text-light-500 dark:text-dark-400">
              Applied {fmtDate(app.date_applied)} · {app.platform_applied_on || 'no platform recorded'}
              <br />
              <span className="opacity-70">Press Esc to leave.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
