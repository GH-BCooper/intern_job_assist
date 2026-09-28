import { useMemo, useState } from 'react';
import {
  Brain,
  Check,
  ChevronRight,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import PageShell from '../components/PageShell';
import EmptyState from '../components/ui/EmptyArt';
import { useData } from '../context/DataContext';
import { useStore } from '../hooks/useStore';
import {
  addSrsCard,
  addSrsCards,
  addStarStory,
  deleteSrsCard,
  deleteStarStory,
  updateSrsCard,
  updateStarStory,
  type SrsCard,
  type StarStory,
} from '../lib/store';
import { dueQueue, extractQuestions, GRADES, review, srsStats, type Grade } from '../lib/srs';
import { fmtDate, relative } from '../lib/format';
import { emitUi, toast } from '../lib/uiBus';
import { play } from '../lib/fx';

const TABS = [
  { id: 'drill', label: 'Drill', icon: Brain },
  { id: 'cards', label: 'All cards', icon: Layers },
  { id: 'stories', label: 'STAR stories', icon: Star },
] as const;

type TabId = (typeof TABS)[number]['id'];

const COMPETENCIES = [
  'Leadership',
  'Conflict',
  'Failure',
  'Ownership',
  'Teamwork',
  'Ambiguity',
  'Deadline pressure',
  'Persuasion',
  'Learning fast',
  'Technical depth',
];

/**
 * The prep trainer: spaced repetition over your own recorded interview
 * questions, plus a reusable STAR story bank.
 *
 * Both run entirely offline — the scheduler is arithmetic (see lib/srs.ts) and
 * everything is stored locally, so this works on a train with no signal.
 */
export default function Prep() {
  const store = useStore();
  const { applications, learningsMap } = useData();
  const [tab, setTab] = useState<TabId>('drill');

  const stats = useMemo(() => srsStats(store.srsCards), [store.srsCards]);

  return (
    <PageShell
      title="Prep"
      subtitle="Drill your own interview questions, and keep the stories you reuse in every behavioural round."
      actions={
        <button
          onClick={() =>
            emitUi({
              type: 'open-assistant',
              prompt:
                'Look at my upcoming interviews and generate a set of likely questions for each, then add them to my prep trainer with create_prep_cards.',
            })
          }
          className="btn-primary"
        >
          <Sparkles size={15} /> Ask Scout for questions
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Due now', value: stats.due, tone: stats.due ? 'text-primary-600 dark:text-primary-400' : undefined },
          { label: 'Total cards', value: stats.total },
          { label: 'Learning', value: stats.learning },
          { label: 'Mature', value: stats.mature, tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Recall rate', value: stats.reviews ? `${stats.retention}%` : '—' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums leading-none mt-1 ${s.tone || 'text-light-900 dark:text-white'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 p-1 mb-5 rounded-xl bg-light-200/80 dark:bg-dark-900 border border-light-300 dark:border-dark-800 w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`tab ${tab === t.id ? 'tab-active' : ''}`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'drill' && <DrillTab />}
      {tab === 'cards' && <CardsTab applications={applications} learningsMap={learningsMap} />}
      {tab === 'stories' && <StoriesTab />}
    </PageShell>
  );
}

/* ------------------------------- drilling ------------------------------- */

function DrillTab() {
  const store = useStore();
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  const queue = useMemo(() => dueQueue(store.srsCards), [store.srsCards]);
  const card = queue[0];

  const grade = (value: Grade) => {
    if (!card) return;
    updateSrsCard(card.id, review(card, value));
    setRevealed(false);
    setDone(n => n + 1);
    play(value >= 4 ? 'pop' : 'click');
  };

  if (!store.srsCards.length) {
    return (
      <div className="card">
        <EmptyState
          art="notes"
          title="No cards yet"
          hint="Your recorded interview questions become flashcards. Open any application and use “questions → flashcards”, add them by hand in All cards, or ask Scout to generate a set."
          action={
            <button onClick={() => emitUi({ type: 'navigate', to: '/dashboard' })} className="btn-secondary">
              Open the board <ChevronRight size={14} />
            </button>
          }
        />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="card">
        <EmptyState
          art="trophy"
          title={done ? `${done} card${done === 1 ? '' : 's'} reviewed — nothing left due` : 'Nothing due right now'}
          hint={
            store.srsCards.length
              ? `Next card comes back ${relative(
                  store.srsCards
                    .slice()
                    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())[0].due_at,
                )}. Spacing is the point — coming back tomorrow beats cramming today.`
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between text-xs text-light-600 dark:text-dark-300 mb-2">
        <span>
          {queue.length} due · {done} done this session
        </span>
        {card.reps === 0 ? (
          <span className="badge bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">New card</span>
        ) : (
          <span className="badge bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-300">
            seen {card.reps}× · ease {card.ease.toFixed(2)}
          </span>
        )}
      </div>

      <div className="card p-6 sm:p-8 min-h-[16rem] flex flex-col">
        <p className="text-lg sm:text-xl font-semibold text-light-900 dark:text-white leading-snug">{card.question}</p>

        {revealed ? (
          <div className="mt-5 pt-5 border-t border-light-300 dark:border-dark-800 flex-1 animate-slide-up">
            {card.answer ? (
              <p className="text-[15px] leading-relaxed text-light-800 dark:text-dark-100 whitespace-pre-wrap">
                {card.answer}
              </p>
            ) : (
              <p className="text-sm text-light-500 dark:text-dark-400 italic">
                No model answer saved. Grade yourself on how the answer came out loud.
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-end">
            <p className="text-xs text-light-500 dark:text-dark-400">
              Answer it out loud first — answers that read well in your head fall apart at speaking pace.
            </p>
          </div>
        )}
      </div>

      {revealed ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          {GRADES.map(g => (
            <button key={g.grade} onClick={() => grade(g.grade)} className="btn-secondary !flex-col !gap-0.5 !py-2.5">
              <span className={`text-sm font-bold ${g.tone}`}>{g.label}</span>
              <span className="text-[10px] text-light-500 dark:text-dark-400">{g.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => setRevealed(true)} className="btn-primary w-full mt-3">
          Show answer
        </button>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => {
            updateSrsCard(card.id, { due_at: new Date(Date.now() + 10 * 60_000).toISOString() });
            setRevealed(false);
          }}
          className="btn-ghost btn-sm"
        >
          <RotateCcw size={12} /> Later
        </button>
        <button
          onClick={() => {
            deleteSrsCard(card.id);
            setRevealed(false);
            toast('Card removed.', 'info');
          }}
          className="btn-ghost btn-sm ml-auto"
        >
          <Trash2 size={12} /> Delete card
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ all cards ------------------------------ */

function CardsTab({
  applications,
  learningsMap,
}: {
  applications: ReturnType<typeof useData>['applications'];
  learningsMap: ReturnType<typeof useData>['learningsMap'];
}) {
  const store = useStore();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState<SrsCard | null>(null);

  const companyOf = (id: string | null) => applications.find(a => a.id === id)?.company_name || '';

  /** Pulls every stored question across the tracker into the trainer at once. */
  const importAll = () => {
    const questions: { question: string; application_id: string | null }[] = [];
    applications.forEach(app => {
      extractQuestions(
        [app.interview_questions, learningsMap[app.id]?.questions_asked].filter(Boolean).join('\n'),
      ).forEach(q => questions.push({ question: q, application_id: app.id }));
    });
    if (!questions.length) {
      toast('No interview questions are recorded on your applications yet.', 'info');
      return;
    }
    const added = addSrsCards(questions);
    toast(
      added ? `${added} new card${added === 1 ? '' : 's'} imported.` : 'Everything recorded is already in your trainer.',
      added ? 'success' : 'info',
    );
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="label">Add a card</p>
        <div className="space-y-2">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Question — e.g. Tell me about a time a project slipped."
            className="input-field"
          />
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            rows={2}
            placeholder="Your answer, or the bones of one (optional)"
            className="input-field"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!question.trim()) return;
                addSrsCard({ question: question.trim(), answer: answer.trim() });
                setQuestion('');
                setAnswer('');
                play('click');
              }}
              disabled={!question.trim()}
              className="btn-primary btn-sm"
            >
              <Plus size={13} /> Add card
            </button>
            <button onClick={importAll} className="btn-secondary btn-sm">
              <Layers size={13} /> Import every recorded question
            </button>
          </div>
        </div>
      </div>

      {store.srsCards.length === 0 ? (
        <div className="card">
          <EmptyState art="notes" title="No cards yet" hint="Add one above, or import the questions already on your applications." />
        </div>
      ) : (
        <div className="space-y-2">
          {store.srsCards.map(card => (
            <div key={card.id} className="card p-3.5 group">
              {editing?.id === card.id ? (
                <div className="space-y-2">
                  <input
                    value={editing.question}
                    onChange={e => setEditing({ ...editing, question: e.target.value })}
                    className="input-field"
                  />
                  <textarea
                    value={editing.answer}
                    onChange={e => setEditing({ ...editing, answer: e.target.value })}
                    rows={3}
                    className="input-field"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        updateSrsCard(card.id, { question: editing.question.trim(), answer: editing.answer.trim() });
                        setEditing(null);
                      }}
                      className="btn-primary btn-sm"
                    >
                      <Check size={13} /> Save
                    </button>
                    <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-light-900 dark:text-white">{card.question}</p>
                      {card.answer && (
                        <p className="text-xs text-light-600 dark:text-dark-300 mt-1 line-clamp-2 whitespace-pre-wrap">
                          {card.answer}
                        </p>
                      )}
                      <p className="text-[10.5px] text-light-500 dark:text-dark-400 mt-1.5">
                        {companyOf(card.application_id) && <span className="mr-2">{companyOf(card.application_id)}</span>}
                        {card.reps ? `seen ${card.reps}×` : 'new'} · due {fmtDate(card.due_at)}
                        {card.lapses > 0 && ` · ${card.lapses} lapse${card.lapses === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditing(card)} className="btn-ghost btn-icon !p-1" aria-label="Edit">
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => deleteSrsCard(card.id)}
                        className="btn-ghost btn-icon !p-1 text-light-400 hover:text-red-500"
                        aria-label="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- STAR stories ---------------------------- */

const BLANK_STORY = { title: '', competency: '', situation: '', task: '', action: '', result: '' };

function StoriesTab() {
  const store = useStore();
  const [form, setForm] = useState<typeof BLANK_STORY>(BLANK_STORY);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const save = () => {
    if (!form.title.trim()) return;
    if (editingId) updateStarStory(editingId, form);
    else addStarStory(form);
    setForm(BLANK_STORY);
    setEditingId(null);
    setOpen(false);
    play('click');
    toast(editingId ? 'Story updated.' : 'Story saved to your bank.', 'success');
  };

  const edit = (story: StarStory) => {
    setForm({
      title: story.title,
      competency: story.competency,
      situation: story.situation,
      task: story.task,
      action: story.action,
      result: story.result,
    });
    setEditingId(story.id);
    setOpen(true);
  };

  const byCompetency = useMemo(() => {
    const map = new Map<string, StarStory[]>();
    store.starStories.forEach(s => {
      const key = s.competency.trim() || 'Uncategorised';
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [store.starStories]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-light-600 dark:text-dark-300 max-w-xl leading-relaxed">
          Most behavioural questions are five stories asked differently. Write them once here, tagged by what they
          demonstrate, and reuse them instead of improvising in the room.
        </p>
        <button
          onClick={() => {
            setForm(BLANK_STORY);
            setEditingId(null);
            setOpen(o => !o);
          }}
          className="btn-primary btn-sm"
        >
          {open ? <X size={13} /> : <Plus size={13} />} {open ? 'Cancel' : 'New story'}
        </button>
      </div>

      {open && (
        <div className="card p-4 space-y-2.5 animate-slide-up">
          <div className="grid sm:grid-cols-2 gap-2.5">
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Story name — e.g. The migration that slipped"
              className="input-field"
            />
            <input
              value={form.competency}
              onChange={e => setForm(f => ({ ...f, competency: e.target.value }))
              }
              list="competencies"
              placeholder="What it demonstrates"
              className="input-field"
            />
            <datalist id="competencies">
              {COMPETENCIES.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          {(
            [
              ['situation', 'Situation — where and when, in two lines'],
              ['task', 'Task — what was actually on you'],
              ['action', 'Action — what you did, specifically'],
              ['result', 'Result — the number, if there is one'],
            ] as const
          ).map(([key, placeholder]) => (
            <textarea
              key={key}
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              rows={2}
              placeholder={placeholder}
              className="input-field"
            />
          ))}
          <button onClick={save} disabled={!form.title.trim()} className="btn-primary btn-sm">
            <Check size={13} /> {editingId ? 'Update story' : 'Save story'}
          </button>
        </div>
      )}

      {store.starStories.length === 0 ? (
        <div className="card">
          <EmptyState
            art="notes"
            title="No stories yet"
            hint="Aim for five: a leadership story, a conflict story, a failure story, an ownership story, and one technical deep-dive."
          />
        </div>
      ) : (
        byCompetency.map(([competency, stories]) => (
          <div key={competency}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 mb-2">
              {competency}
            </p>
            <div className="space-y-2">
              {stories.map(story => (
                <div key={story.id} className="card p-3.5">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => setExpanded(e => (e === story.id ? null : story.id))}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-semibold text-light-900 dark:text-white">{story.title}</p>
                      {expanded !== story.id && story.result && (
                        <p className="text-xs text-light-600 dark:text-dark-300 truncate mt-0.5">{story.result}</p>
                      )}
                    </button>
                    <button onClick={() => edit(story)} className="btn-ghost btn-sm !px-2">
                      Edit
                    </button>
                    <button
                      onClick={() => deleteStarStory(story.id)}
                      className="text-light-400 hover:text-red-500"
                      aria-label="Delete story"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {expanded === story.id && (
                    <dl className="mt-3 pt-3 border-t border-light-300 dark:border-dark-800 space-y-2 animate-slide-up">
                      {(
                        [
                          ['Situation', story.situation],
                          ['Task', story.task],
                          ['Action', story.action],
                          ['Result', story.result],
                        ] as const
                      ).map(([label, value]) =>
                        value ? (
                          <div key={label}>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">
                              {label}
                            </dt>
                            <dd className="text-[13px] text-light-800 dark:text-dark-100 leading-relaxed whitespace-pre-wrap">
                              {value}
                            </dd>
                          </div>
                        ) : null,
                      )}
                      <button
                        onClick={() =>
                          emitUi({
                            type: 'open-assistant',
                            prompt: `Critique this STAR story and tighten it to 90 seconds spoken:\n\nSituation: ${story.situation}\nTask: ${story.task}\nAction: ${story.action}\nResult: ${story.result}`,
                          })
                        }
                        className="btn-secondary btn-sm"
                      >
                        <Sparkles size={12} /> Ask Scout to tighten it
                      </button>
                    </dl>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
