/**
 * Local-first store for everything InternTrack layers on top of Supabase.
 *
 * Applications / interview dates / learnings stay in Supabase (untouched).
 * Everything added in v2 — tags, reminders, notes, contacts, tasks, goals,
 * saved views, activity log, AI threads, preferences — is persisted locally
 * per-user so the whole feature set runs at zero infrastructure cost.
 */

export type ID = string;

export type Tag = { id: ID; name: string; color: string; created_at: string };

export type ApplicationTag = { id: ID; application_id: ID; tag_id: ID };

export type ReminderKind = 'follow_up' | 'interview_prep' | 'deadline' | 'custom' | 'thank_you';

export type Reminder = {
  id: ID;
  application_id: ID | null;
  title: string;
  notes: string;
  due_at: string;
  kind: ReminderKind;
  done: boolean;
  notified: boolean;
  created_at: string;
};

export type Note = {
  id: ID;
  application_id: ID | null;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: ID;
  application_id: ID | null;
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  notes: string;
  created_at: string;
};

export type Task = {
  id: ID;
  application_id: ID | null;
  title: string;
  done: boolean;
  due_at: string | null;
  created_at: string;
};

export type Goal = {
  id: ID;
  metric: 'applications' | 'interviews' | 'offers' | 'outreach';
  target: number;
  period: 'week' | 'month';
  created_at: string;
};

export type SavedView = {
  id: ID;
  name: string;
  filters: Record<string, string>;
  view: string;
  created_at: string;
};

export type ActivityEvent = {
  id: ID;
  kind: string;
  summary: string;
  application_id: ID | null;
  actor: 'you' | 'ai' | 'system';
  created_at: string;
};

export type ResumeVersion = {
  id: ID;
  label: string;
  description: string;
  content: string;
  created_at: string;
};

export type AiToolTrace = { name: string; args: unknown; result?: string; error?: string };

export type AiMessage = {
  id: ID;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: AiToolTrace[];
  created_at: string;
};

export type AiThread = {
  id: ID;
  title: string;
  messages: AiMessage[];
  created_at: string;
  updated_at: string;
};

export type AiProviderId = 'gemini' | 'groq' | 'openrouter' | 'ollama';

export type Preferences = {
  aiProvider: AiProviderId;
  aiKeys: Partial<Record<AiProviderId, string>>;
  aiModel: Partial<Record<AiProviderId, string>>;
  aiAutoActions: boolean;
  ollamaUrl: string;
  notificationsEnabled: boolean;
  followUpDays: number;
  reminderLeadHours: number;
  defaultView: string;
  density: 'comfortable' | 'compact';
  weeklyDigest: boolean;
  onboarded: boolean;
  webhookUrl: string;
  automationsEnabled: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  aiProvider: 'gemini',
  aiKeys: {},
  aiModel: {},
  aiAutoActions: true,
  ollamaUrl: 'http://localhost:11434',
  notificationsEnabled: false,
  followUpDays: 7,
  reminderLeadHours: 24,
  defaultView: 'board',
  density: 'comfortable',
  weeklyDigest: true,
  onboarded: false,
  webhookUrl: '',
  automationsEnabled: true,
};

/* --------------------------- automation engine --------------------------- */

export type AutomationTriggerType =
  | 'stale_no_response'
  | 'interview_upcoming'
  | 'task_overdue'
  | 'no_activity_days'
  | 'application_created'
  | 'stage_is'
  | 'weekly_digest';

export type AutomationActionType =
  | 'add_reminder'
  | 'add_task'
  | 'add_tag'
  | 'notify'
  | 'webhook'
  | 'set_stage'
  | 'archive'
  | 'add_note';

export type AutomationTrigger = {
  type: AutomationTriggerType;
  days?: number;
  weekday?: number;
  hour?: number;
  stage?: string;
};

export type AutomationAction = {
  type: AutomationActionType;
  title?: string;
  body?: string;
  offsetDays?: number;
  tag?: string;
  stage?: string;
  webhookUrl?: string;
};

export type AutomationRule = {
  id: ID;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  builtin?: string;
  created_at: string;
  lastRunAt: string | null;
  runCount: number;
};

export type AutomationLogEntry = {
  id: ID;
  ruleId: ID;
  ruleName: string;
  applicationId: ID | null;
  summary: string;
  created_at: string;
};

export type StoreShape = {
  tags: Tag[];
  applicationTags: ApplicationTag[];
  reminders: Reminder[];
  notes: Note[];
  contacts: Contact[];
  tasks: Task[];
  goals: Goal[];
  savedViews: SavedView[];
  activity: ActivityEvent[];
  resumes: ResumeVersion[];
  aiThreads: AiThread[];
  preferences: Preferences;
  stageOverrides: Record<ID, string>;
  archived: ID[];
  starred: ID[];
  automationRules: AutomationRule[];
  automationLog: AutomationLogEntry[];
  automationSeen: Record<string, string>;
};

const EMPTY: StoreShape = {
  tags: [],
  applicationTags: [],
  reminders: [],
  notes: [],
  contacts: [],
  tasks: [],
  goals: [],
  savedViews: [],
  activity: [],
  resumes: [],
  aiThreads: [],
  preferences: DEFAULT_PREFERENCES,
  stageOverrides: {},
  archived: [],
  starred: [],
  automationRules: [],
  automationLog: [],
  automationSeen: {},
};

const PREFIX = 'interntrack.v2';
let scope = 'anon';

let cache: StoreShape | null = null;
let cacheKey = '';

const listeners = new Set<() => void>();

function storeKey() {
  return PREFIX + '.' + scope;
}

function emit() {
  cache = null;
  listeners.forEach(l => l());
}

export function setStoreScope(userId: string | null | undefined) {
  const next = userId || 'anon';
  if (next === scope) return;
  scope = next;
  emit();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function read(): StoreShape {
  if (cache && cacheKey === storeKey()) return cache;
  let parsed: Partial<StoreShape> = {};
  try {
    const raw = localStorage.getItem(storeKey());
    if (raw) parsed = JSON.parse(raw) as Partial<StoreShape>;
  } catch {
    parsed = {};
  }
  cache = {
    ...EMPTY,
    ...parsed,
    preferences: { ...DEFAULT_PREFERENCES, ...(parsed.preferences || {}) },
    stageOverrides: { ...(parsed.stageOverrides || {}) },
  };
  cacheKey = storeKey();
  return cache;
}

export function write(next: StoreShape) {
  try {
    localStorage.setItem(storeKey(), JSON.stringify(next));
  } catch {
    /* quota exceeded — session keeps working from memory */
  }
  cache = next;
  cacheKey = storeKey();
  listeners.forEach(l => l());
}

export function mutate(fn: (draft: StoreShape) => void) {
  const next = JSON.parse(JSON.stringify(read())) as StoreShape;
  fn(next);
  write(next);
  return next;
}

export function uid(): ID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function now() {
  return new Date().toISOString();
}

/* ----------------------------- mutations ----------------------------- */

export function logActivity(summary: string, opts: Partial<ActivityEvent> = {}) {
  mutate(d => {
    d.activity.unshift({
      id: uid(),
      kind: opts.kind || 'update',
      summary,
      application_id: opts.application_id ?? null,
      actor: opts.actor || 'you',
      created_at: now(),
    });
    d.activity = d.activity.slice(0, 500);
  });
}

export function savePreferences(patch: Partial<Preferences>) {
  mutate(d => {
    d.preferences = { ...d.preferences, ...patch };
  });
}

export const TAG_COLORS = ['#FB923C', '#FF7E7E', '#38BDF8', '#34D399', '#A78BFA', '#FBBF24', '#F472B6', '#22D3EE'];

export function upsertTag(name: string, color?: string): Tag {
  const trimmed = name.trim();
  const existing = read().tags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const tag: Tag = {
    id: uid(),
    name: trimmed,
    color: color || TAG_COLORS[read().tags.length % TAG_COLORS.length],
    created_at: now(),
  };
  mutate(d => {
    d.tags.push(tag);
  });
  return tag;
}

export function deleteTag(id: ID) {
  mutate(d => {
    d.tags = d.tags.filter(t => t.id !== id);
    d.applicationTags = d.applicationTags.filter(at => at.tag_id !== id);
  });
}

export function setApplicationTags(applicationId: ID, tagIds: ID[]) {
  mutate(d => {
    d.applicationTags = d.applicationTags.filter(at => at.application_id !== applicationId);
    tagIds.forEach(tag_id => d.applicationTags.push({ id: uid(), application_id: applicationId, tag_id }));
  });
}

export function toggleApplicationTag(applicationId: ID, tagId: ID) {
  mutate(d => {
    const i = d.applicationTags.findIndex(at => at.application_id === applicationId && at.tag_id === tagId);
    if (i >= 0) d.applicationTags.splice(i, 1);
    else d.applicationTags.push({ id: uid(), application_id: applicationId, tag_id: tagId });
  });
}

export function tagsFor(applicationId: ID): Tag[] {
  const s = read();
  const ids = s.applicationTags.filter(at => at.application_id === applicationId).map(at => at.tag_id);
  return s.tags.filter(t => ids.includes(t.id));
}

export function addReminder(input: Partial<Reminder> & { title: string; due_at: string }): Reminder {
  const reminder: Reminder = {
    id: uid(),
    application_id: input.application_id ?? null,
    title: input.title,
    notes: input.notes || '',
    due_at: input.due_at,
    kind: input.kind || 'custom',
    done: false,
    notified: false,
    created_at: now(),
  };
  mutate(d => {
    d.reminders.push(reminder);
  });
  return reminder;
}

export function updateReminder(id: ID, patch: Partial<Reminder>) {
  mutate(d => {
    const r = d.reminders.find(x => x.id === id);
    if (r) Object.assign(r, patch);
  });
}

export function deleteReminder(id: ID) {
  mutate(d => {
    d.reminders = d.reminders.filter(r => r.id !== id);
  });
}

export function addNote(input: { application_id?: ID | null; body: string; pinned?: boolean }): Note {
  const note: Note = {
    id: uid(),
    application_id: input.application_id ?? null,
    body: input.body,
    pinned: !!input.pinned,
    created_at: now(),
    updated_at: now(),
  };
  mutate(d => {
    d.notes.unshift(note);
  });
  return note;
}

export function updateNote(id: ID, patch: Partial<Note>) {
  mutate(d => {
    const n = d.notes.find(x => x.id === id);
    if (n) Object.assign(n, patch, { updated_at: now() });
  });
}

export function deleteNote(id: ID) {
  mutate(d => {
    d.notes = d.notes.filter(n => n.id !== id);
  });
}

export function addContact(input: Partial<Contact> & { name: string }): Contact {
  const contact: Contact = {
    id: uid(),
    application_id: input.application_id ?? null,
    name: input.name,
    role: input.role || '',
    email: input.email || '',
    phone: input.phone || '',
    linkedin: input.linkedin || '',
    notes: input.notes || '',
    created_at: now(),
  };
  mutate(d => {
    d.contacts.unshift(contact);
  });
  return contact;
}

export function updateContact(id: ID, patch: Partial<Contact>) {
  mutate(d => {
    const c = d.contacts.find(x => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

export function deleteContact(id: ID) {
  mutate(d => {
    d.contacts = d.contacts.filter(c => c.id !== id);
  });
}

export function addTask(input: { application_id?: ID | null; title: string; due_at?: string | null }): Task {
  const task: Task = {
    id: uid(),
    application_id: input.application_id ?? null,
    title: input.title,
    done: false,
    due_at: input.due_at ?? null,
    created_at: now(),
  };
  mutate(d => {
    d.tasks.unshift(task);
  });
  return task;
}

export function toggleTask(id: ID) {
  mutate(d => {
    const t = d.tasks.find(x => x.id === id);
    if (t) t.done = !t.done;
  });
}

export function deleteTask(id: ID) {
  mutate(d => {
    d.tasks = d.tasks.filter(t => t.id !== id);
  });
}

export function setGoal(metric: Goal['metric'], target: number, period: Goal['period'] = 'week') {
  mutate(d => {
    const existing = d.goals.find(g => g.metric === metric);
    if (existing) {
      existing.target = target;
      existing.period = period;
    } else {
      d.goals.push({ id: uid(), metric, target, period, created_at: now() });
    }
  });
}

export function saveView(name: string, filters: Record<string, string>, view: string) {
  const v: SavedView = { id: uid(), name, filters, view, created_at: now() };
  mutate(d => {
    d.savedViews.push(v);
  });
  return v;
}

export function deleteSavedView(id: ID) {
  mutate(d => {
    d.savedViews = d.savedViews.filter(v => v.id !== id);
  });
}

export function setStage(applicationId: ID, stage: string) {
  mutate(d => {
    d.stageOverrides[applicationId] = stage;
  });
}

export function toggleStar(applicationId: ID) {
  mutate(d => {
    d.starred = d.starred.includes(applicationId)
      ? d.starred.filter(i => i !== applicationId)
      : [...d.starred, applicationId];
  });
}

export function toggleArchive(applicationId: ID) {
  mutate(d => {
    d.archived = d.archived.includes(applicationId)
      ? d.archived.filter(i => i !== applicationId)
      : [...d.archived, applicationId];
  });
}

export function addResumeVersion(input: { label: string; description?: string; content?: string }) {
  const r: ResumeVersion = {
    id: uid(),
    label: input.label,
    description: input.description || '',
    content: input.content || '',
    created_at: now(),
  };
  mutate(d => {
    d.resumes.unshift(r);
  });
  return r;
}

export function deleteResumeVersion(id: ID) {
  mutate(d => {
    d.resumes = d.resumes.filter(r => r.id !== id);
  });
}

/* --------------------------- automation rules --------------------------- */

export function addAutomationRule(input: Omit<AutomationRule, 'id' | 'created_at' | 'lastRunAt' | 'runCount'>): AutomationRule {
  const rule: AutomationRule = { ...input, id: uid(), created_at: now(), lastRunAt: null, runCount: 0 };
  mutate(d => {
    d.automationRules.unshift(rule);
  });
  return rule;
}

export function updateAutomationRule(id: ID, patch: Partial<AutomationRule>) {
  mutate(d => {
    const r = d.automationRules.find(x => x.id === id);
    if (r) Object.assign(r, patch);
  });
}

export function toggleAutomationRule(id: ID) {
  mutate(d => {
    const r = d.automationRules.find(x => x.id === id);
    if (r) r.enabled = !r.enabled;
  });
}

export function deleteAutomationRule(id: ID) {
  mutate(d => {
    d.automationRules = d.automationRules.filter(r => r.id !== id);
    d.automationLog = d.automationLog.filter(l => l.ruleId !== id);
  });
}

/** True if a rule already fired for this dedupe key (prevents duplicate actions on every tick). */
export function automationHasRun(key: string): boolean {
  return !!read().automationSeen[key];
}

export function recordAutomationRun(rule: AutomationRule, key: string, applicationId: ID | null, summary: string) {
  mutate(d => {
    d.automationSeen[key] = now();
    const r = d.automationRules.find(x => x.id === rule.id);
    if (r) {
      r.lastRunAt = now();
      r.runCount += 1;
    }
    d.automationLog.unshift({ id: uid(), ruleId: rule.id, ruleName: rule.name, applicationId, summary, created_at: now() });
    d.automationLog = d.automationLog.slice(0, 300);
  });
}

/* ------------------------------ AI threads ------------------------------ */

export const NEW_THREAD_TITLE = 'New conversation';

export function createThread(title = NEW_THREAD_TITLE): AiThread {
  const thread: AiThread = { id: uid(), title, messages: [], created_at: now(), updated_at: now() };
  mutate(d => {
    d.aiThreads.unshift(thread);
    d.aiThreads = d.aiThreads.slice(0, 50);
  });
  return thread;
}

export function appendMessage(threadId: ID, message: AiMessage) {
  mutate(d => {
    const t = d.aiThreads.find(x => x.id === threadId);
    if (!t) return;
    t.messages.push(message);
    t.updated_at = now();
    if (t.title === NEW_THREAD_TITLE && message.role === 'user') {
      t.title = message.content.slice(0, 48);
    }
  });
}

export function patchMessage(threadId: ID, messageId: ID, patch: Partial<AiMessage>) {
  mutate(d => {
    const t = d.aiThreads.find(x => x.id === threadId);
    const m = t?.messages.find(x => x.id === messageId);
    if (m) Object.assign(m, patch);
  });
}

export function deleteThread(id: ID) {
  mutate(d => {
    d.aiThreads = d.aiThreads.filter(t => t.id !== id);
  });
}

/* ------------------------------ portability ------------------------------ */

export function exportStore(): string {
  return JSON.stringify({ version: 2, exported_at: now(), data: read() }, null, 2);
}

const MERGEABLE = [
  'tags',
  'applicationTags',
  'reminders',
  'notes',
  'contacts',
  'tasks',
  'goals',
  'savedViews',
  'resumes',
  'activity',
  'automationRules',
  'automationLog',
] as const;

export function importStore(json: string, mode: 'merge' | 'replace' = 'merge') {
  const parsed = JSON.parse(json) as { data?: Partial<StoreShape> };
  const incoming = parsed.data || (parsed as unknown as Partial<StoreShape>);
  if (mode === 'replace') {
    write({
      ...EMPTY,
      ...incoming,
      preferences: { ...DEFAULT_PREFERENCES, ...(incoming.preferences || {}) },
    } as StoreShape);
    return;
  }
  mutate(d => {
    MERGEABLE.forEach(k => {
      const list = (incoming[k] as { id: ID }[] | undefined) || [];
      const target = d[k] as { id: ID }[];
      const seen = new Set(target.map(x => x.id));
      list.filter(x => x && !seen.has(x.id)).forEach(x => target.push(x));
    });
    d.preferences = { ...d.preferences, ...(incoming.preferences || {}) };
    d.stageOverrides = { ...d.stageOverrides, ...(incoming.stageOverrides || {}) };
  });
}
