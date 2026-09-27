import { useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  CheckSquare,
  FileText,
  History,
  Mail,
  Phone,
  Pin,
  Plus,
  Sparkles,
  StickyNote,
  Tag as TagIcon,
  Trash2,
  Users,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useStore } from '../hooks/useStore';
import PageShell from '../components/PageShell';
import {
  addContact,
  addNote,
  addReminder,
  addResumeVersion,
  addTask,
  deleteContact,
  deleteNote,
  deleteReminder,
  deleteResumeVersion,
  deleteTag,
  deleteTask,
  toggleTask,
  updateNote,
  updateReminder,
  upsertTag,
} from '../lib/store';
import { emitUi, toast } from '../lib/uiBus';
import { fmtDateTime, relative, toLocalInput, ts } from '../lib/format';
import Markdown from '../components/ui/Markdown';

const TABS = [
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'resumes', label: 'Resumes', icon: FileText },
  { id: 'tags', label: 'Tags', icon: TagIcon },
  { id: 'activity', label: 'Activity', icon: History },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function Workspace() {
  const store = useStore();
  const { applications } = useData();
  const [tab, setTab] = useState<TabId>('tasks');

  const companyOf = (id: string | null) => applications.find(a => a.id === id)?.company_name || null;

  const counts = useMemo(
    () => ({
      tasks: store.tasks.filter(t => !t.done).length,
      reminders: store.reminders.filter(r => !r.done).length,
      notes: store.notes.length,
      contacts: store.contacts.length,
      resumes: store.resumes.length,
      tags: store.tags.length,
      activity: store.activity.length,
    }),
    [store],
  );

  return (
    <PageShell
      title="Workspace"
      subtitle="Tasks, reminders, notes, contacts and resume versions — everything around the applications."
      actions={
        <button
          onClick={() =>
            emitUi({
              type: 'open-assistant',
              prompt: 'Review my tasks, reminders and notes, then tidy them up: close what is done, add anything obviously missing.',
            })
          }
          className="btn-secondary"
        >
          <Sparkles size={15} /> Let Scout tidy this
        </button>
      }
    >
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-5 pb-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`tab flex-shrink-0 ${tab === t.id ? 'tab-active' : ''}`}>
              <Icon size={14} />
              {t.label}
              {counts[t.id] > 0 && (
                <span className="badge bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-300 !text-[10px]">
                  {counts[t.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'tasks' && <TasksTab companyOf={companyOf} />}
      {tab === 'reminders' && <RemindersTab companyOf={companyOf} />}
      {tab === 'notes' && <NotesTab companyOf={companyOf} />}
      {tab === 'contacts' && <ContactsTab companyOf={companyOf} />}
      {tab === 'resumes' && <ResumesTab />}
      {tab === 'tags' && <TagsTab />}
      {tab === 'activity' && <ActivityTab companyOf={companyOf} />}
    </PageShell>
  );
}

/* --------------------------------- tabs --------------------------------- */

type CompanyOf = (id: string | null) => string | null;

function EmptyState({ icon: Icon, title, hint }: { icon: typeof Bell; title: string; hint: string }) {
  return (
    <div className="card p-12 text-center">
      <Icon size={26} className="mx-auto text-light-400 dark:text-dark-600 mb-3" />
      <p className="text-sm font-medium text-light-800 dark:text-dark-100">{title}</p>
      <p className="text-xs text-light-500 dark:text-dark-400 mt-1">{hint}</p>
    </div>
  );
}

function TasksTab({ companyOf }: { companyOf: CompanyOf }) {
  const store = useStore();
  const [title, setTitle] = useState('');
  const open = store.tasks.filter(t => !t.done);
  const done = store.tasks.filter(t => t.done);

  return (
    <div className="space-y-4">
      <div className="card p-3 flex gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && title.trim()) {
              addTask({ title: title.trim() });
              setTitle('');
            }
          }}
          placeholder="Add a task — e.g. rewrite resume bullet points for backend roles"
          className="input-field"
        />
        <button
          onClick={() => {
            if (!title.trim()) return;
            addTask({ title: title.trim() });
            setTitle('');
          }}
          disabled={!title.trim()}
          className="btn-primary flex-shrink-0"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks yet" hint="Add one above, or ask Scout to break a goal into tasks." />
      ) : (
        <div className="card divide-y divide-light-300 dark:divide-dark-800">
          {[...open, ...done].map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <button
                onClick={() => toggleTask(t.id)}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  t.done ? 'bg-emerald-500 border-emerald-500' : 'border-light-400 dark:border-dark-600 hover:border-primary-500'
                }`}
                aria-label={t.done ? 'Mark not done' : 'Mark done'}
              >
                {t.done && <CheckSquare size={10} className="text-white" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${t.done ? 'line-through text-light-500 dark:text-dark-500' : 'text-light-900 dark:text-white'}`}>
                  {t.title}
                </p>
                <p className="text-[10px] text-light-500 dark:text-dark-400">
                  {[companyOf(t.application_id), t.due_at ? `due ${relative(t.due_at)}` : null].filter(Boolean).join(' · ') ||
                    relative(t.created_at)}
                </p>
              </div>
              <button onClick={() => deleteTask(t.id)} className="text-light-400 hover:text-red-500 transition-colors" aria-label="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RemindersTab({ companyOf }: { companyOf: CompanyOf }) {
  const store = useStore();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(() => toLocalInput());
  const sorted = [...store.reminders].sort((a, b) => Number(a.done) - Number(b.done) || ts(a.due_at) - ts(b.due_at));

  return (
    <div className="space-y-4">
      <div className="card p-3 flex flex-col sm:flex-row gap-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Remind me to…" className="input-field" />
        <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="input-field sm:w-56" />
        <button
          onClick={() => {
            if (!title.trim()) return;
            addReminder({ title: title.trim(), due_at: new Date(when).toISOString() });
            setTitle('');
            toast('Reminder set.', 'success');
          }}
          disabled={!title.trim()}
          className="btn-primary flex-shrink-0"
        >
          <Plus size={15} /> Set
        </button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={Bell} title="No reminders" hint="Say “schedule follow-ups for everything quiet” and Scout will fill this in." />
      ) : (
        <div className="card divide-y divide-light-300 dark:divide-dark-800">
          {sorted.map(r => {
            const overdue = !r.done && ts(r.due_at) <= Date.now();
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    r.done ? 'bg-light-400 dark:bg-dark-600' : overdue ? 'bg-accent-500' : 'bg-primary-500'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${r.done ? 'line-through text-light-500 dark:text-dark-500' : 'text-light-900 dark:text-white'}`}>
                    {r.title}
                  </p>
                  <p className={`text-[10px] ${overdue ? 'text-accent-600 dark:text-accent-400 font-semibold' : 'text-light-500 dark:text-dark-400'}`}>
                    {[fmtDateTime(r.due_at), companyOf(r.application_id), r.kind.replace('_', ' ')].filter(Boolean).join(' · ')}
                  </p>
                  {r.notes && <p className="text-[11px] text-light-600 dark:text-dark-300 mt-0.5">{r.notes}</p>}
                </div>
                {!r.done && (
                  <button onClick={() => updateReminder(r.id, { done: true })} className="btn-ghost btn-sm !px-2 text-emerald-600 dark:text-emerald-400">
                    Done
                  </button>
                )}
                <button onClick={() => deleteReminder(r.id)} className="text-light-400 hover:text-red-500 transition-colors" aria-label="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotesTab({ companyOf }: { companyOf: CompanyOf }) {
  const store = useStore();
  const [body, setBody] = useState('');
  const sorted = [...store.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || ts(b.updated_at) - ts(a.updated_at));

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          placeholder="Jot down a learning, a recruiter's exact words, a question you fumbled… markdown works."
          className="input-field resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={() => {
              if (!body.trim()) return;
              addNote({ body: body.trim() });
              setBody('');
            }}
            disabled={!body.trim()}
            className="btn-primary btn-sm"
          >
            <Plus size={13} /> Save note
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes yet" hint="Notes are searchable by Scout, so it can quote them back to you." />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {sorted.map(n => (
            <div key={n.id} className="card p-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-[10px] text-light-500 dark:text-dark-400">
                  {[companyOf(n.application_id), relative(n.updated_at)].filter(Boolean).join(' · ')}
                </p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => updateNote(n.id, { pinned: !n.pinned })}
                    className={n.pinned ? 'text-primary-500' : 'text-light-400 hover:text-primary-500'}
                    aria-label="Pin"
                  >
                    <Pin size={13} fill={n.pinned ? 'currentColor' : 'none'} />
                  </button>
                  <button onClick={() => deleteNote(n.id)} className="text-light-400 hover:text-red-500" aria-label="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <Markdown text={n.body} className="text-light-800 dark:text-dark-100" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactsTab({ companyOf }: { companyOf: CompanyOf }) {
  const store = useStore();
  const [form, setForm] = useState({ name: '', role: '', email: '', linkedin: '' });

  return (
    <div className="space-y-4">
      <div className="card p-3 grid sm:grid-cols-5 gap-2">
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" className="input-field" />
        <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Role" className="input-field" />
        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" className="input-field" />
        <input value={form.linkedin} onChange={e => setForm({ ...form, linkedin: e.target.value })} placeholder="LinkedIn" className="input-field" />
        <button
          onClick={() => {
            if (!form.name.trim()) return;
            addContact(form);
            setForm({ name: '', role: '', email: '', linkedin: '' });
          }}
          disabled={!form.name.trim()}
          className="btn-primary"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      {store.contacts.length === 0 ? (
        <EmptyState icon={Users} title="No contacts yet" hint="Recruiters, referrals and interviewers — Scout drafts outreach using these." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {store.contacts.map(c => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-light-900 dark:text-white truncate">{c.name}</p>
                  <p className="text-xs text-light-600 dark:text-dark-300 truncate">
                    {[c.role, companyOf(c.application_id)].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <button onClick={() => deleteContact(c.id)} className="text-light-400 hover:text-red-500 flex-shrink-0" aria-label="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-2.5 space-y-1">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-[11px] text-primary-600 dark:text-primary-400 hover:underline truncate">
                    <Mail size={11} /> {c.email}
                  </a>
                )}
                {c.phone && (
                  <span className="flex items-center gap-1.5 text-[11px] text-light-600 dark:text-dark-300">
                    <Phone size={11} /> {c.phone}
                  </span>
                )}
                {c.linkedin && (
                  <a
                    href={c.linkedin.startsWith('http') ? c.linkedin : `https://${c.linkedin}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-primary-600 dark:text-primary-400 hover:underline truncate"
                  >
                    <Users size={11} /> LinkedIn
                  </a>
                )}
              </div>
              <button
                onClick={() =>
                  emitUi({
                    type: 'open-assistant',
                    prompt: `Draft a short, warm outreach message to ${c.name}${c.role ? ` (${c.role})` : ''}${
                      companyOf(c.application_id) ? ` at ${companyOf(c.application_id)}` : ''
                    }, referencing my actual application.`,
                  })
                }
                className="btn-secondary btn-sm w-full mt-3"
              >
                <Sparkles size={12} /> Draft outreach
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumesTab() {
  const store = useStore();
  const [form, setForm] = useState({ label: '', description: '' });

  return (
    <div className="space-y-4">
      <div className="card p-3 grid sm:grid-cols-[1fr,1.5fr,auto] gap-2">
        <input
          value={form.label}
          onChange={e => setForm({ ...form, label: e.target.value })}
          placeholder="Version label — e.g. Backend v3"
          className="input-field"
        />
        <input
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="What it targets"
          className="input-field"
        />
        <button
          onClick={() => {
            if (!form.label.trim()) return;
            addResumeVersion(form);
            setForm({ label: '', description: '' });
          }}
          disabled={!form.label.trim()}
          className="btn-primary"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      {store.resumes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resume versions tracked"
          hint="Name your variants here, then record which one each application used — Insights will show which converts."
        />
      ) : (
        <div className="card divide-y divide-light-300 dark:divide-dark-800">
          {store.resumes.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <FileText size={15} className="text-light-500 dark:text-dark-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-light-900 dark:text-white">{r.label}</p>
                <p className="text-[11px] text-light-500 dark:text-dark-400">{r.description || relative(r.created_at)}</p>
              </div>
              <button onClick={() => deleteResumeVersion(r.id)} className="text-light-400 hover:text-red-500" aria-label="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TagsTab() {
  const store = useStore();
  const [name, setName] = useState('');
  const usage = (id: string) => store.applicationTags.filter(at => at.tag_id === id).length;

  return (
    <div className="space-y-4">
      <div className="card p-3 flex gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim()) {
              upsertTag(name);
              setName('');
            }
          }}
          placeholder="New tag — e.g. dream-company, remote, referral"
          className="input-field"
        />
        <button
          onClick={() => {
            if (!name.trim()) return;
            upsertTag(name);
            setName('');
          }}
          disabled={!name.trim()}
          className="btn-primary flex-shrink-0"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      {store.tags.length === 0 ? (
        <EmptyState icon={TagIcon} title="No tags yet" hint="Tags power filtering and give Scout sharper context." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {store.tags.map(t => (
            <span
              key={t.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{ background: `${t.color}1f`, color: t.color, border: `1px solid ${t.color}40` }}
            >
              {t.name}
              <span className="text-[10px] opacity-70 tabular-nums">{usage(t.id)}</span>
              <button onClick={() => deleteTag(t.id)} className="opacity-60 hover:opacity-100" aria-label={`Delete ${t.name}`}>
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityTab({ companyOf }: { companyOf: CompanyOf }) {
  const store = useStore();
  if (store.activity.length === 0) {
    return <EmptyState icon={Activity} title="No activity recorded yet" hint="Every change you or Scout make shows up here." />;
  }
  return (
    <div className="card divide-y divide-light-300 dark:divide-dark-800">
      {store.activity.slice(0, 100).map(e => (
        <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
          <span
            className={`badge !text-[9px] flex-shrink-0 ${
              e.actor === 'ai'
                ? 'bg-primary-100 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300'
                : 'bg-light-200 dark:bg-dark-800 text-light-600 dark:text-dark-300'
            }`}
          >
            {e.actor === 'ai' ? 'Scout' : e.actor}
          </span>
          <p className="text-sm text-light-800 dark:text-dark-100 flex-1 min-w-0 truncate">
            {e.summary}
            {companyOf(e.application_id) ? '' : ''}
          </p>
          <p className="text-[10px] text-light-500 dark:text-dark-400 flex-shrink-0">{relative(e.created_at)}</p>
        </div>
      ))}
    </div>
  );
}
