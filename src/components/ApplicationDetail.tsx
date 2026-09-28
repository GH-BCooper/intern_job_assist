import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  Calendar,
  CalendarClock,
  Copy,
  Download,
  Edit2,
  Eye,
  FileText,
  Loader2,
  Mail,
  Plus,
  Sparkles,
  Star,
  StickyNote,
  Tag as TagIcon,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import type { Application, InterviewDate, InterviewLearning } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useData } from '../context/DataContext';
import { useAI } from '../context/AIContext';
import { useStore } from '../hooks/useStore';
import { STAGES, stageOf, stagePatch, type Stage } from '../lib/insights';
import {
  addNote,
  addReminder,
  deleteNote,
  setStage,
  toggleApplicationTag,
  toggleStar,
  upsertTag,
} from '../lib/store';
import { daysUntil, fmtDate, fmtDateTime, relative, toLocalInput } from '../lib/format';
import { toast } from '../lib/uiBus';
import Markdown from './ui/Markdown';
import { CompanyAvatar } from './ApplicationCard';
import { FINAL_BADGE, RESPONSE_BADGE } from './ApplicationCard';

type Props = {
  application: Application;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
};

function Field({ label, value }: { label: string; value: string | boolean | null }) {
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || '';
  if (!display) return null;
  return (
    <div>
      <p className="label !mb-1">{label}</p>
      <p className="text-sm text-light-800 dark:text-dark-100 leading-relaxed whitespace-pre-line">{display}</p>
    </div>
  );
}

const AI_ACTIONS = [
  {
    id: 'followup',
    label: 'Draft follow-up email',
    icon: Mail,
    prompt: (app: Application) =>
      `Draft a short, polite follow-up email about my application to ${app.company_name}${
        app.role_applied_to ? ` for the ${app.role_applied_to} role` : ''
      }. Use get_application on "${app.company_name}" first so the details are right. Give me a subject line and body I can paste.`,
  },
  {
    id: 'prep',
    label: 'Build interview prep plan',
    icon: Target,
    prompt: (app: Application) =>
      `Build me an interview prep plan for ${app.company_name}. Call get_application on "${app.company_name}" first, use any stored interview questions and learnings, and end with two sharp questions I should ask them.`,
  },
  {
    id: 'summary',
    label: 'Summarise where this stands',
    icon: BookOpen,
    prompt: (app: Application) =>
      `Summarise where my ${app.company_name} application stands, what has happened so far, and the single next action. Use get_application on "${app.company_name}".`,
  },
  {
    id: 'cover',
    label: 'Draft a tailored cover letter',
    icon: FileText,
    prompt: (app: Application) =>
      `Write a tailored, concise cover letter for ${app.company_name}${
        app.role_applied_to ? ` (${app.role_applied_to})` : ''
      }. Call get_application on "${app.company_name}" first. Keep it under 250 words, specific, no clichés.`,
  },
];

export default function ApplicationDetail({ application: app, onClose, onEdit, onDelete }: Props) {
  const { interviewsMap, learningsMap, updateApplication, addInterviewDate, removeInterviewDate, createApplication } = useData();
  const ai = useAI();
  const store = useStore();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [learnings, setLearnings] = useState<InterviewLearning | null>(learningsMap[app.id] ?? null);
  const [tagInput, setTagInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [ivDate, setIvDate] = useState(() => toLocalInput());
  const [ivLabel, setIvLabel] = useState('');
  const [showIvForm, setShowIvForm] = useState(false);
  const [remTitle, setRemTitle] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; text: string } | null>(null);

  const interviews: InterviewDate[] = interviewsMap[app.id] || [];
  const stage = stageOf(app, store.stageOverrides);
  const starred = store.starred.includes(app.id);
  const notes = store.notes.filter(n => n.application_id === app.id);
  const reminders = store.reminders.filter(r => r.application_id === app.id && !r.done);
  const appTagIds = useMemo(
    () => store.applicationTags.filter(at => at.application_id === app.id).map(at => at.tag_id),
    [store.applicationTags, app.id],
  );

  useEffect(() => {
    setLearnings(learningsMap[app.id] ?? null);
    if (learningsMap[app.id]) return;
    let live = true;
    void supabase
      .from('interview_learnings')
      .select('*')
      .eq('application_id', app.id)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setLearnings(data ?? null);
      });
    return () => {
      live = false;
    };
  }, [app.id, learningsMap]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changeStage = async (next: Stage) => {
    setStage(app.id, next);
    try {
      await updateApplication(app.id, stagePatch(next, app));
      toast(`Moved to ${next}.`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the stage.', 'error');
    }
  };

  const runAiAction = async (action: (typeof AI_ACTIONS)[number]) => {
    if (!ai.configured) {
      toast('Connect a free model in Settings first.', 'error');
      return;
    }
    setBusyAction(action.id);
    setDraft(null);
    try {
      const text = await ai.askInline(action.prompt(app));
      setDraft({ label: action.label, text });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The model could not answer.', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadZip = async () => {
    setExporting(true);
    try {
      const files: { resume?: Blob; coverLetter?: Blob; resumeName?: string; coverLetterName?: string } = {
        resumeName: app.resume_used || undefined,
        coverLetterName: app.cover_letter_used || undefined,
      };
      if (app.resume_path) {
        const { data } = await supabase.storage.from('applications').download(app.resume_path);
        if (data) files.resume = data;
      }
      if (app.cover_letter_path) {
        const { data } = await supabase.storage.from('applications').download(app.cover_letter_path);
        if (data) files.coverLetter = data;
      }
      const { exportSingleApplicationZip } = await import('../utils/zipExportUtils');
      await exportSingleApplicationZip(app, interviews, learnings, files);
    } catch {
      toast('Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      await createApplication({
        company_name: `${app.company_name} (copy)`,
        company_description: app.company_description,
        resume_used: app.resume_used,
        cover_letter_used: app.cover_letter_used,
        response_status: 'Pending',
        interview_offered: false,
        final_status: 'In Progress',
        date_applied: null,
        salary_info: app.salary_info,
        interview_questions: app.interview_questions,
        tasks_to_complete: app.tasks_to_complete,
        resume_path: '',
        cover_letter_path: '',
        role_applied_to: app.role_applied_to,
        platform_applied_on: app.platform_applied_on,
      });
      toast('Duplicated — added to Wishlist. Re-attach files if needed.', 'success');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Duplicate failed.', 'error');
    } finally {
      setDuplicating(false);
    }
  };

  const resumeUrl = app.resume_path ? supabase.storage.from('applications').getPublicUrl(app.resume_path).data?.publicUrl : null;
  const coverUrl = app.cover_letter_path
    ? supabase.storage.from('applications').getPublicUrl(app.cover_letter_path).data?.publicUrl
    : null;

  return (
    <div className="fixed inset-0 z-[105] flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-light-900/25 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl my-0 sm:my-8 card !rounded-none sm:!rounded-2xl !bg-light-100 dark:!bg-dark-950 shadow-lift animate-scale-in">
        {/* header */}
        <header className="sticky top-0 z-10 flex items-start gap-3 px-5 py-4 border-b border-light-300 dark:border-dark-800 bg-light-100/95 dark:bg-dark-950/95 backdrop-blur-sm sm:rounded-t-2xl">
          <CompanyAvatar name={app.company_name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-light-900 dark:text-white truncate">{app.company_name}</h2>
              <button
                onClick={() => toggleStar(app.id)}
                className={starred ? 'text-primary-500' : 'text-light-400 hover:text-primary-500'}
                aria-label="Star"
              >
                <Star size={15} fill={starred ? 'currentColor' : 'none'} />
              </button>
            </div>
            <p className="text-sm text-light-600 dark:text-dark-300 truncate">
              {[app.role_applied_to, app.platform_applied_on].filter(Boolean).join(' · ') || 'No role recorded'}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost btn-icon flex-shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="px-5 py-5 grid lg:grid-cols-[1fr,17rem] gap-6">
          {/* main column */}
          <div className="space-y-5 min-w-0">
            {/* stage picker */}
            <div>
              <p className="label">Pipeline stage</p>
              <div className="flex flex-wrap gap-1.5">
                {STAGES.map(s => (
                  <button
                    key={s}
                    onClick={() => void changeStage(s)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      stage === s
                        ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white border-transparent shadow-soft'
                        : 'border-light-300 dark:border-dark-700 text-light-700 dark:text-dark-200 hover:border-primary-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${RESPONSE_BADGE[app.response_status] || RESPONSE_BADGE.Pending}`}>
                {app.response_status || 'Pending'}
              </span>
              <span className={`badge ${FINAL_BADGE[app.final_status] || FINAL_BADGE['In Progress']}`}>
                {app.final_status || 'In Progress'}
              </span>
              <span className="badge bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-300">
                <Calendar size={10} /> Applied {fmtDate(app.date_applied)}
              </span>
            </div>

            {/* AI actions */}
            <div className="panel p-4 border-primary-200 dark:border-primary-900 bg-gradient-to-br from-primary-50/70 to-transparent dark:from-primary-950/20">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-primary-600 dark:text-primary-400" />
                <h3 className="text-sm font-semibold text-light-900 dark:text-white">Scout can help with this one</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {AI_ACTIONS.map(action => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => void runAiAction(action)}
                      disabled={busyAction !== null}
                      className="btn-secondary !justify-start text-xs !py-2"
                    >
                      {busyAction === action.id ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                      {action.label}
                    </button>
                  );
                })}
              </div>

              {draft && (
                <div className="mt-3 p-3 rounded-xl bg-light-50 dark:bg-dark-900 border border-light-300 dark:border-dark-800 animate-slide-up">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-light-600 dark:text-dark-300">
                      {draft.label}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(draft.text);
                          toast('Copied to clipboard.', 'success');
                        }}
                        className="btn-ghost btn-sm !px-2"
                      >
                        <Copy size={11} /> Copy
                      </button>
                      <button
                        onClick={() => {
                          addNote({ application_id: app.id, body: `**${draft.label}**\n\n${draft.text}` });
                          toast('Saved as a note.', 'success');
                        }}
                        className="btn-ghost btn-sm !px-2"
                      >
                        <StickyNote size={11} /> Save
                      </button>
                      <button onClick={() => setDraft(null)} className="btn-ghost btn-icon !p-1" aria-label="Dismiss">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <Markdown text={draft.text} className="text-light-800 dark:text-dark-100" />
                </div>
              )}
            </div>

            {/* interviews */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="label !mb-0">Interview rounds</p>
                <button onClick={() => setShowIvForm(s => !s)} className="btn-ghost btn-sm !px-2">
                  <Plus size={12} /> Add
                </button>
              </div>

              {showIvForm && (
                <div className="panel p-3 mb-2 space-y-2 animate-fade-in">
                  <input type="datetime-local" value={ivDate} onChange={e => setIvDate(e.target.value)} className="input-field" />
                  <input
                    value={ivLabel}
                    onChange={e => setIvLabel(e.target.value)}
                    placeholder="Round label — e.g. Round 2, technical"
                    className="input-field"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await addInterviewDate(app.id, new Date(ivDate).toISOString(), ivLabel.trim() || 'Interview');
                        if (!app.interview_offered) await updateApplication(app.id, { interview_offered: true });
                        setIvLabel('');
                        setShowIvForm(false);
                        toast('Interview added.', 'success');
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'Could not add the interview.', 'error');
                      }
                    }}
                    className="btn-primary btn-sm w-full"
                  >
                    Save round
                  </button>
                </div>
              )}

              {interviews.length === 0 ? (
                <p className="text-xs text-light-500 dark:text-dark-400">No rounds recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {interviews.map(iv => {
                    const d = daysUntil(iv.interview_date);
                    return (
                      <li key={iv.id} className="panel p-3 flex items-center gap-3">
                        <CalendarClock size={15} className="text-primary-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-light-900 dark:text-white truncate">{iv.label || 'Interview'}</p>
                          <p className="text-[11px] text-light-500 dark:text-dark-400">{fmtDateTime(iv.interview_date)}</p>
                        </div>
                        {d !== null && (
                          <span
                            className={`badge ${
                              d < 0
                                ? 'bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-400'
                                : d <= 2
                                  ? 'bg-accent-100 dark:bg-accent-950/60 text-accent-700 dark:text-accent-300'
                                  : 'bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300'
                            }`}
                          >
                            {d < 0 ? `${Math.abs(d)}d ago` : d === 0 ? 'Today' : `in ${d}d`}
                          </span>
                        )}
                        <button
                          onClick={() => void removeInterviewDate(iv.id)}
                          className="text-light-400 hover:text-red-500 flex-shrink-0"
                          aria-label="Remove round"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Company notes" value={app.company_description} />
              <Field label="Stipend / salary" value={app.salary_info} />
              <Field label="Resume used" value={app.resume_used} />
              <Field label="Cover letter used" value={app.cover_letter_used} />
            </div>

            <Field label="Interview questions" value={app.interview_questions} />
            <Field label="Tasks to complete" value={app.tasks_to_complete} />

            {learnings && (learnings.learnings || learnings.questions_asked) && (
              <div className="panel p-4 space-y-3">
                <h3 className="text-sm font-semibold text-light-900 dark:text-white flex items-center gap-2">
                  <BookOpen size={14} className="text-primary-500" /> Interview learnings
                </h3>
                <Field label="What I learned" value={learnings.learnings} />
                <Field label="Questions they asked" value={learnings.questions_asked} />
              </div>
            )}

            {(resumeUrl || coverUrl) && (
              <div>
                <p className="label">Attached documents</p>
                <div className="flex flex-wrap gap-2">
                  {resumeUrl && (
                    <a href={resumeUrl} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                      <Eye size={12} /> View resume
                    </a>
                  )}
                  {coverUrl && (
                    <a href={coverUrl} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                      <Eye size={12} /> View cover letter
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* side rail */}
          <aside className="space-y-4 min-w-0">
            <div className="panel p-3">
              <p className="label flex items-center gap-1.5">
                <TagIcon size={11} /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {store.tags.map(t => {
                  const on = appTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleApplicationTag(app.id, t.id)}
                      className="badge transition-all"
                      style={{
                        background: on ? `${t.color}26` : 'transparent',
                        color: on ? t.color : undefined,
                        border: `1px solid ${on ? `${t.color}59` : 'transparent'}`,
                        opacity: on ? 1 : 0.6,
                      }}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !tagInput.trim()) return;
                  const tag = upsertTag(tagInput);
                  if (!appTagIds.includes(tag.id)) toggleApplicationTag(app.id, tag.id);
                  setTagInput('');
                }}
                placeholder="New tag + Enter"
                className="input-field !py-1.5 !text-xs"
              />
            </div>

            <div className="panel p-3">
              <p className="label flex items-center gap-1.5">
                <Bell size={11} /> Reminders
              </p>
              {reminders.length > 0 && (
                <ul className="space-y-1.5 mb-2">
                  {reminders.map(r => (
                    <li key={r.id} className="text-[11px] text-light-700 dark:text-dark-200">
                      <span className="block font-medium truncate">{r.title}</span>
                      <span className="text-light-500 dark:text-dark-400">{relative(r.due_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <input
                value={remTitle}
                onChange={e => setRemTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !remTitle.trim()) return;
                  const due = new Date();
                  due.setDate(due.getDate() + 3);
                  due.setHours(10, 0, 0, 0);
                  addReminder({ title: remTitle.trim(), due_at: due.toISOString(), application_id: app.id, kind: 'follow_up' });
                  setRemTitle('');
                  toast('Reminder set for 3 days from now.', 'success');
                }}
                placeholder="Remind me… + Enter"
                className="input-field !py-1.5 !text-xs"
              />
            </div>

            <div className="panel p-3">
              <p className="label flex items-center gap-1.5">
                <StickyNote size={11} /> Notes
              </p>
              {notes.length > 0 && (
                <ul className="space-y-2 mb-2 max-h-56 overflow-y-auto">
                  {notes.map(n => (
                    <li key={n.id} className="group text-[11px] text-light-700 dark:text-dark-200 border-l-2 border-primary-300 dark:border-primary-800 pl-2">
                      <Markdown text={n.body} className="!text-[11px]" />
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-light-500 dark:text-dark-500">{relative(n.created_at)}</span>
                        <button
                          onClick={() => deleteNote(n.id)}
                          className="opacity-0 group-hover:opacity-100 text-light-400 hover:text-red-500 transition-opacity"
                          aria-label="Delete note"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && noteInput.trim()) {
                    addNote({ application_id: app.id, body: noteInput.trim() });
                    setNoteInput('');
                  }
                }}
                rows={2}
                placeholder="Add a note… ⌘Enter"
                className="input-field !py-1.5 !text-xs resize-none"
              />
            </div>

            <div className="panel p-3 space-y-1.5">
              <p className="label">Actions</p>
              <button onClick={onEdit} className="btn-secondary btn-sm w-full !justify-start">
                <Edit2 size={12} /> Edit application
              </button>
              <button
                onClick={async () => {
                  const { exportSinglePDF } = await import('../utils/exportUtils');
                  exportSinglePDF(app);
                }}
                className="btn-secondary btn-sm w-full !justify-start"
              >
                <FileText size={12} /> Export PDF
              </button>
              <button onClick={handleDownloadZip} disabled={exporting} className="btn-secondary btn-sm w-full !justify-start">
                {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Download ZIP
              </button>
              <button onClick={handleDuplicate} disabled={duplicating} className="btn-secondary btn-sm w-full !justify-start">
                {duplicating ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                Duplicate
              </button>
              {confirmDelete ? (
                <div className="pt-1 space-y-1.5">
                  <p className="text-[11px] text-red-600 dark:text-red-400 leading-snug">
                    Delete this application permanently?
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={async () => {
                        setDeleting(true);
                        try {
                          await onDelete();
                          onClose();
                        } catch (e) {
                          toast(e instanceof Error ? e.message : 'Delete failed.', 'error');
                        } finally {
                          setDeleting(false);
                        }
                      }}
                      className="btn-danger btn-sm flex-1"
                    >
                      {deleting ? <Loader2 size={12} className="animate-spin" /> : 'Yes, delete'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-ghost btn-sm flex-1">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="btn-danger btn-sm w-full !justify-start">
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
