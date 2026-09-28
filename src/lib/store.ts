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
  /** Recurring reminders re-schedule themselves when completed. */
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  /** IANA zone, for interviews with a remote or international interviewer. */
  timezone: string;
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
  /** A real uploaded file backing this version (Supabase Storage path). */
  file: { path: string; name: string; size: number } | null;
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

/** A saved "shape" of an application, spawned with one click for repeat applying. */
export type ApplicationTemplate = {
  id: ID;
  name: string;
  patch: Record<string, string>;
  tagIds: ID[];
  created_at: string;
};

/** Reusable Situation/Task/Action/Result story, referenced from any prep panel. */
export type StarStory = {
  id: ID;
  title: string;
  competency: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  created_at: string;
  updated_at: string;
};

/** One flashcard in the SM-2 spaced-repetition trainer. */
export type SrsCard = {
  id: ID;
  application_id: ID | null;
  question: string;
  answer: string;
  ease: number;
  interval: number;
  reps: number;
  lapses: number;
  due_at: string;
  last_reviewed_at: string | null;
  created_at: string;
};

/** Every stage transition, so an application has a history and not just a current value. */
export type StageChange = {
  id: ID;
  application_id: ID;
  from: string;
  to: string;
  actor: 'you' | 'ai' | 'system';
  created_at: string;
};

/** A named season ("Summer 2026") that scopes the pipeline. */
export type Season = {
  id: ID;
  name: string;
  created_at: string;
};

/** Cover letter with {{company}}-style merge fields. */
export type CoverTemplate = {
  id: ID;
  name: string;
  body: string;
  created_at: string;
};

export type QuietHours = { enabled: boolean; from: number; to: number };

export type AccentId = 'coral' | 'ocean' | 'forest' | 'grape' | 'slate';

export type LocaleId = 'en' | 'es' | 'hi';

export type SwimlaneId = 'none' | 'platform' | 'tag' | 'priority';

/** Rolling per-provider request count, so we can warn before a free-tier 429. */
export type AiUsage = Record<string, { day: string; count: number }>;

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

  /* ------------------------------- v4 ------------------------------- */
  /** Runtime accent palette, swapped through CSS custom properties. */
  accent: AccentId;
  /** Third theme variant beyond light/dark. */
  highContrast: boolean;
  /** Scales the root font size; the rem-based Tailwind scale follows. */
  fontScale: number;
  /** Tiny synthesized Web Audio UI sounds. Off by default. */
  sounds: boolean;
  locale: LocaleId;
  /** Real company logos via a keyless favicon service, initials as fallback. */
  companyLogos: boolean;
  /** Board grouping within a column. */
  swimlane: SwimlaneId;
  /** Soft cap per stage; 0 or missing means no limit. */
  wipLimits: Record<string, number>;
  /** User-renamed stage labels, keyed by the canonical stage name. */
  stageLabels: Record<string, string>;
  /** User stage order; falls back to the canonical order when empty. */
  stageOrder: string[];
  /** Don't fire notify/webhook actions inside this window. */
  quietHours: QuietHours;
  /** Standing instructions injected into Scout's system prompt. */
  scoutMemory: string[];
  /** Personal Telegram bot notifications. */
  telegramToken: string;
  telegramChatId: string;
  /** EmailJS (free tier, 200/month) for browser-sent mail. */
  emailjsServiceId: string;
  emailjsTemplateId: string;
  emailjsPublicKey: string;
  emailjsTo: string;
  /** Time-limited signed URLs instead of public URLs for uploaded documents. */
  signedUrls: boolean;
  /** Lock the app after N idle minutes (0 = off). */
  autoLockMinutes: number;
  /** Nudge to export the local workspace every N days (0 = off). */
  backupNudgeDays: number;
  lastBackupAt: string | null;
  /** Optional GitHub username for the public contribution badge. */
  githubUsername: string;
  /** Token for the read-only shared Insights link. */
  shareToken: string | null;
  timezone: string;
  /** Season currently in focus; empty means "everything". */
  activeSeason: ID | '';
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

  accent: 'coral',
  highContrast: false,
  fontScale: 1,
  sounds: false,
  locale: 'en',
  companyLogos: true,
  swimlane: 'none',
  wipLimits: {},
  stageLabels: {},
  stageOrder: [],
  quietHours: { enabled: false, from: 22, to: 8 },
  scoutMemory: [],
  telegramToken: '',
  telegramChatId: '',
  emailjsServiceId: '',
  emailjsTemplateId: '',
  emailjsPublicKey: '',
  emailjsTo: '',
  signedUrls: true,
  autoLockMinutes: 0,
  backupNudgeDays: 21,
  lastBackupAt: null,
  githubUsername: '',
  shareToken: null,
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '',
  activeSeason: '',
};

/* --------------------------- automation engine --------------------------- */

export type AutomationTriggerType =
  | 'stale_no_response'
  | 'interview_upcoming'
  | 'task_overdue'
  | 'no_activity_days'
  | 'application_created'
  | 'stage_is'
  | 'weekly_digest'
  | 'interview_completed'
  | 'offer_deadline_approaching'
  | 'goal_at_risk'
  | 'contact_follow_up_due';

export type AutomationActionType =
  | 'add_reminder'
  | 'add_task'
  | 'add_tag'
  | 'notify'
  | 'webhook'
  | 'set_stage'
  | 'archive'
  | 'add_note'
  | 'duplicate_application'
  | 'send_ics'
  | 'telegram'
  | 'email';

export type AutomationTrigger = {
  type: AutomationTriggerType;
  days?: number;
  weekday?: number;
  hour?: number;
  stage?: string;
};

/**
 * An extra clause a rule can require (or forbid) on top of its trigger, so the
 * trigger types can express far more situations without adding new ones.
 */
export type AutomationConditionType = 'has_tag' | 'stage_is' | 'platform_is' | 'starred' | 'priority_at_least';

export type AutomationCondition = {
  type: AutomationConditionType;
  value?: string;
  number?: number;
  /** true inverts the clause ("NOT tagged dream-company"). */
  negate?: boolean;
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
  /** Extra clauses combined with the trigger. */
  conditions?: AutomationCondition[];
  /** How those clauses combine. Defaults to 'and'. */
  match?: 'and' | 'or';
  actions: AutomationAction[];
  builtin?: string;
  created_at: string;
  lastRunAt: string | null;
  runCount: number;
};

/** One action parked by quiet hours, with everything needed to run it later. */
export type QueuedAction = {
  id: ID;
  ruleId: ID;
  ruleName: string;
  applicationId: ID | null;
  action: AutomationAction;
  context: Record<string, string | number>;
  created_at: string;
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
  /** Notification-shaped actions held back by quiet hours, replayed on the next allowed tick. */
  automationQueue: QueuedAction[];

  /* ------------------------------- v4 ------------------------------- */
  appTemplates: ApplicationTemplate[];
  starStories: StarStory[];
  srsCards: SrsCard[];
  stageHistory: StageChange[];
  seasons: Season[];
  /** application id -> season id */
  seasonOf: Record<ID, ID>;
  coverTemplates: CoverTemplate[];
  /** 1-5 "how much do I want this", separate from the star. */
  priorities: Record<ID, number>;
  /** application id -> contact id that referred it */
  referrals: Record<ID, ID>;
  /** contact id -> ISO timestamp of the last outreach */
  contactTouched: Record<ID, string>;
  /** interview date id -> extra local metadata Supabase has no column for */
  interviewMeta: Record<ID, { timezone?: string }>;
  /** achievement id -> earned timestamp */
  badges: Record<string, string>;
  aiUsage: AiUsage;
};

/** The canonical empty store — also the base every test fixture spreads. */
export const EMPTY_STORE: StoreShape = {
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
  automationQueue: [],

  appTemplates: [],
  starStories: [],
  srsCards: [],
  stageHistory: [],
  seasons: [],
  seasonOf: {},
  coverTemplates: [],
  priorities: {},
  referrals: {},
  contactTouched: {},
  interviewMeta: {},
  badges: {},
  aiUsage: {},
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
    ...EMPTY_STORE,
    ...parsed,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...(parsed.preferences || {}),
      quietHours: { ...DEFAULT_PREFERENCES.quietHours, ...(parsed.preferences?.quietHours || {}) },
      wipLimits: { ...(parsed.preferences?.wipLimits || {}) },
      stageLabels: { ...(parsed.preferences?.stageLabels || {}) },
      stageOrder: [...(parsed.preferences?.stageOrder || [])],
      scoutMemory: [...(parsed.preferences?.scoutMemory || [])],
    },
    stageOverrides: { ...(parsed.stageOverrides || {}) },
    seasonOf: { ...(parsed.seasonOf || {}) },
    priorities: { ...(parsed.priorities || {}) },
    referrals: { ...(parsed.referrals || {}) },
    contactTouched: { ...(parsed.contactTouched || {}) },
    interviewMeta: { ...(parsed.interviewMeta || {}) },
    badges: { ...(parsed.badges || {}) },
    aiUsage: { ...(parsed.aiUsage || {}) },
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
    repeat: input.repeat || 'none',
    timezone: input.timezone || '',
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

/**
 * Move an application to a stage and record the transition.
 *
 * `from` is the stage the caller saw before the move — passing it keeps the
 * per-application journey complete, since the derived stage (which depends on
 * Supabase fields this function cannot see) is not recoverable afterwards.
 */
export function setStage(applicationId: ID, stage: string, from?: string, actor: StageChange['actor'] = 'you') {
  mutate(d => {
    const previous = from ?? d.stageOverrides[applicationId] ?? '';
    d.stageOverrides[applicationId] = stage;
    if (previous !== stage) {
      d.stageHistory.unshift({
        id: uid(),
        application_id: applicationId,
        from: previous,
        to: stage,
        actor,
        created_at: now(),
      });
      d.stageHistory = d.stageHistory.slice(0, 1000);
    }
  });
}

export function stageHistoryFor(applicationId: ID): StageChange[] {
  return read()
    .stageHistory.filter(h => h.application_id === applicationId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
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

export function addResumeVersion(input: {
  label: string;
  description?: string;
  content?: string;
  file?: ResumeVersion['file'];
}) {
  const r: ResumeVersion = {
    id: uid(),
    label: input.label,
    description: input.description || '',
    content: input.content || '',
    file: input.file ?? null,
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
  'appTemplates',
  'starStories',
  'srsCards',
  'stageHistory',
  'seasons',
  'coverTemplates',
] as const;

export function importStore(json: string, mode: 'merge' | 'replace' = 'merge') {
  const parsed = JSON.parse(json) as { data?: Partial<StoreShape> };
  const incoming = parsed.data || (parsed as unknown as Partial<StoreShape>);
  if (mode === 'replace') {
    write({
      ...EMPTY_STORE,
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
    d.priorities = { ...d.priorities, ...(incoming.priorities || {}) };
    d.seasonOf = { ...d.seasonOf, ...(incoming.seasonOf || {}) };
    d.referrals = { ...d.referrals, ...(incoming.referrals || {}) };
    d.badges = { ...d.badges, ...(incoming.badges || {}) };
  });
}

/* =========================== v4 mutations =========================== */

/* ----------------------------- priorities ----------------------------- */

/** 1–5 "how much do I want this", deliberately separate from the star. */
export function setPriority(applicationId: ID, value: number) {
  const clamped = Math.max(0, Math.min(5, Math.round(value)));
  mutate(d => {
    if (clamped === 0) delete d.priorities[applicationId];
    else d.priorities[applicationId] = clamped;
  });
}

export function priorityOf(applicationId: ID): number {
  return read().priorities[applicationId] || 0;
}

/* ---------------------------- referrals ---------------------------- */

export function setReferral(applicationId: ID, contactId: ID | null) {
  mutate(d => {
    if (contactId) d.referrals[applicationId] = contactId;
    else delete d.referrals[applicationId];
  });
}

export function referrerFor(applicationId: ID): Contact | null {
  const s = read();
  const id = s.referrals[applicationId];
  return (id && s.contacts.find(c => c.id === id)) || null;
}

/** Records that you reached out to a contact, which feeds contact_follow_up_due. */
export function touchContact(contactId: ID) {
  mutate(d => {
    d.contactTouched[contactId] = now();
  });
}

/* --------------------------- app templates --------------------------- */

export function addAppTemplate(input: { name: string; patch: Record<string, string>; tagIds?: ID[] }): ApplicationTemplate {
  const tpl: ApplicationTemplate = {
    id: uid(),
    name: input.name,
    patch: input.patch,
    tagIds: input.tagIds || [],
    created_at: now(),
  };
  mutate(d => {
    d.appTemplates.unshift(tpl);
  });
  return tpl;
}

export function deleteAppTemplate(id: ID) {
  mutate(d => {
    d.appTemplates = d.appTemplates.filter(t => t.id !== id);
  });
}

/* ---------------------------- STAR stories ---------------------------- */

export function addStarStory(input: Partial<StarStory> & { title: string }): StarStory {
  const story: StarStory = {
    id: uid(),
    title: input.title,
    competency: input.competency || '',
    situation: input.situation || '',
    task: input.task || '',
    action: input.action || '',
    result: input.result || '',
    created_at: now(),
    updated_at: now(),
  };
  mutate(d => {
    d.starStories.unshift(story);
  });
  return story;
}

export function updateStarStory(id: ID, patch: Partial<StarStory>) {
  mutate(d => {
    const s = d.starStories.find(x => x.id === id);
    if (s) Object.assign(s, patch, { updated_at: now() });
  });
}

export function deleteStarStory(id: ID) {
  mutate(d => {
    d.starStories = d.starStories.filter(s => s.id !== id);
  });
}

/* ------------------------------- SRS ------------------------------- */

export function addSrsCard(input: { question: string; answer?: string; application_id?: ID | null }): SrsCard {
  const card: SrsCard = {
    id: uid(),
    application_id: input.application_id ?? null,
    question: input.question,
    answer: input.answer || '',
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    due_at: now(),
    last_reviewed_at: null,
    created_at: now(),
  };
  mutate(d => {
    d.srsCards.unshift(card);
  });
  return card;
}

/** Adds only the questions not already present, so re-importing a card set is safe. */
export function addSrsCards(questions: { question: string; answer?: string; application_id?: ID | null }[]): number {
  const existing = new Set(read().srsCards.map(c => c.question.trim().toLowerCase()));
  const fresh = questions.filter(q => {
    const key = q.question.trim().toLowerCase();
    if (!key || existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  fresh.forEach(q => addSrsCard(q));
  return fresh.length;
}

export function updateSrsCard(id: ID, patch: Partial<SrsCard>) {
  mutate(d => {
    const c = d.srsCards.find(x => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

export function deleteSrsCard(id: ID) {
  mutate(d => {
    d.srsCards = d.srsCards.filter(c => c.id !== id);
  });
}

/* ------------------------------ seasons ------------------------------ */

export function addSeason(name: string): Season {
  const existing = read().seasons.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return existing;
  const season: Season = { id: uid(), name: name.trim(), created_at: now() };
  mutate(d => {
    d.seasons.push(season);
  });
  return season;
}

export function deleteSeason(id: ID) {
  mutate(d => {
    d.seasons = d.seasons.filter(s => s.id !== id);
    Object.keys(d.seasonOf).forEach(k => {
      if (d.seasonOf[k] === id) delete d.seasonOf[k];
    });
    if (d.preferences.activeSeason === id) d.preferences.activeSeason = '';
  });
}

export function assignSeason(applicationId: ID, seasonId: ID | '') {
  mutate(d => {
    if (seasonId) d.seasonOf[applicationId] = seasonId;
    else delete d.seasonOf[applicationId];
  });
}

/* -------------------------- cover templates -------------------------- */

export function addCoverTemplate(input: { name: string; body: string }): CoverTemplate {
  const tpl: CoverTemplate = { id: uid(), name: input.name, body: input.body, created_at: now() };
  mutate(d => {
    d.coverTemplates.unshift(tpl);
  });
  return tpl;
}

export function updateCoverTemplate(id: ID, patch: Partial<CoverTemplate>) {
  mutate(d => {
    const t = d.coverTemplates.find(x => x.id === id);
    if (t) Object.assign(t, patch);
  });
}

export function deleteCoverTemplate(id: ID) {
  mutate(d => {
    d.coverTemplates = d.coverTemplates.filter(t => t.id !== id);
  });
}

/* ------------------------------ badges ------------------------------ */

/** Marks achievements as earned; returns only the ones newly unlocked. */
export function earnBadges(ids: string[]): string[] {
  const seen = read().badges;
  const fresh = ids.filter(id => !seen[id]);
  if (!fresh.length) return [];
  mutate(d => {
    fresh.forEach(id => {
      d.badges[id] = now();
    });
  });
  return fresh;
}

/* ---------------------------- interviews ---------------------------- */

export function setInterviewTimezone(interviewId: ID, timezone: string) {
  mutate(d => {
    d.interviewMeta[interviewId] = { ...(d.interviewMeta[interviewId] || {}), timezone };
  });
}

/* --------------------------- Scout memory --------------------------- */

export function addScoutMemory(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  mutate(d => {
    if (d.preferences.scoutMemory.some(m => m.toLowerCase() === trimmed.toLowerCase())) return;
    d.preferences.scoutMemory = [...d.preferences.scoutMemory, trimmed].slice(-20);
  });
}

export function removeScoutMemory(line: string) {
  mutate(d => {
    d.preferences.scoutMemory = d.preferences.scoutMemory.filter(m => m !== line);
  });
}

/* --------------------------- AI usage meter --------------------------- */

/** Counts one request against today's bucket for a provider and returns the new count. */
export function recordAiCall(provider: string): number {
  const today = new Date().toISOString().slice(0, 10);
  let count = 1;
  mutate(d => {
    const entry = d.aiUsage[provider];
    count = entry && entry.day === today ? entry.count + 1 : 1;
    d.aiUsage[provider] = { day: today, count };
  });
  return count;
}

export function aiCallsToday(provider: string): number {
  const entry = read().aiUsage[provider];
  const today = new Date().toISOString().slice(0, 10);
  return entry && entry.day === today ? entry.count : 0;
}

/* ------------------------------- wipe ------------------------------- */

/** Clears everything this browser holds for the signed-in user. */
export function wipeLocalStore() {
  try {
    localStorage.removeItem(storeKey());
  } catch {
    /* nothing more we can do */
  }
  write({ ...EMPTY_STORE, preferences: { ...DEFAULT_PREFERENCES } });
}

export function markBackupTaken() {
  savePreferences({ lastBackupAt: now() });
}

/* ------------------------- quiet-hours queue ------------------------- */

/** Parks a notification-shaped action until quiet hours are over. */
export function queueQuietAction(input: Omit<QueuedAction, 'id' | 'created_at'>) {
  mutate(d => {
    d.automationQueue.push({ ...input, id: uid(), created_at: now() });
    // A week of parked nudges is already more than anyone will read.
    d.automationQueue = d.automationQueue.slice(-100);
  });
}

/** Removes and returns everything parked, for replay once the window closes. */
export function drainQuietQueue(): QueuedAction[] {
  const parked = read().automationQueue;
  if (!parked.length) return [];
  mutate(d => {
    d.automationQueue = [];
  });
  return parked;
}
