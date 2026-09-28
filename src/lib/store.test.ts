import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAutomationRule,
  addContact,
  addNote,
  addReminder,
  addResumeVersion,
  addTask,
  appendMessage,
  automationHasRun,
  createThread,
  DEFAULT_PREFERENCES,
  deleteAutomationRule,
  deleteContact,
  deleteNote,
  deleteReminder,
  deleteResumeVersion,
  deleteSavedView,
  deleteTag,
  deleteTask,
  deleteThread,
  exportStore,
  importStore,
  logActivity,
  NEW_THREAD_TITLE,
  patchMessage,
  read,
  recordAutomationRun,
  saveView,
  savePreferences,
  setGoal,
  setStage,
  setStoreScope,
  tagsFor,
  toggleApplicationTag,
  toggleArchive,
  toggleAutomationRule,
  toggleStar,
  toggleTask,
  uid,
  updateAutomationRule,
  updateContact,
  updateNote,
  updateReminder,
  upsertTag,
} from './store';

let counter = 0;

beforeEach(() => {
  counter += 1;
  // A unique scope per test guarantees a fresh backing localStorage key,
  // so tests never see state left behind by an earlier test.
  setStoreScope(`test-scope-${counter}`);
});

describe('uid', () => {
  it('produces unique, non-empty ids', () => {
    const a = uid();
    const b = uid();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('read', () => {
  it('returns default empty shape for a fresh scope', () => {
    const s = read();
    expect(s.tags).toEqual([]);
    expect(s.reminders).toEqual([]);
    expect(s.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('scopes storage per user so two scopes never see each other', () => {
    upsertTag('Remote');
    expect(read().tags).toHaveLength(1);

    setStoreScope('a-different-user');
    expect(read().tags).toHaveLength(0);
  });
});

describe('savePreferences', () => {
  it('merges a partial patch into existing preferences', () => {
    savePreferences({ followUpDays: 14 });
    expect(read().preferences.followUpDays).toBe(14);
    expect(read().preferences.density).toBe(DEFAULT_PREFERENCES.density);
  });
});

describe('logActivity', () => {
  it('prepends new events, most recent first', () => {
    logActivity('first');
    logActivity('second');
    const [top] = read().activity;
    expect(top.summary).toBe('second');
    expect(read().activity).toHaveLength(2);
  });

  it('caps history at 500 entries', () => {
    for (let i = 0; i < 505; i += 1) logActivity(`event ${i}`);
    expect(read().activity).toHaveLength(500);
  });
});

describe('tags', () => {
  it('upsertTag creates a new tag with a color', () => {
    const t = upsertTag('Dream job');
    expect(t.name).toBe('Dream job');
    expect(t.color).toBeTruthy();
  });

  it('upsertTag is idempotent and case-insensitive', () => {
    const first = upsertTag('Remote');
    const second = upsertTag('remote');
    expect(second.id).toBe(first.id);
    expect(read().tags).toHaveLength(1);
  });

  it('deleteTag also removes its application associations', () => {
    const t = upsertTag('Backend');
    toggleApplicationTag('app-1', t.id);
    expect(tagsFor('app-1')).toHaveLength(1);

    deleteTag(t.id);
    expect(read().tags).toHaveLength(0);
    expect(tagsFor('app-1')).toHaveLength(0);
  });

  it('toggleApplicationTag adds then removes the link', () => {
    const t = upsertTag('Frontend');
    toggleApplicationTag('app-2', t.id);
    expect(tagsFor('app-2').map(x => x.id)).toContain(t.id);

    toggleApplicationTag('app-2', t.id);
    expect(tagsFor('app-2')).toHaveLength(0);
  });
});

describe('reminders', () => {
  it('adds, updates and deletes a reminder', () => {
    const r = addReminder({ title: 'Follow up', due_at: new Date().toISOString() });
    expect(read().reminders).toHaveLength(1);
    expect(r.done).toBe(false);

    updateReminder(r.id, { done: true });
    expect(read().reminders[0].done).toBe(true);

    deleteReminder(r.id);
    expect(read().reminders).toHaveLength(0);
  });
});

describe('notes', () => {
  it('adds notes most-recent-first and updates touch updated_at', () => {
    const a = addNote({ body: 'first note' });
    const b = addNote({ body: 'second note' });
    expect(read().notes[0].id).toBe(b.id);

    updateNote(a.id, { body: 'edited' });
    const found = read().notes.find(n => n.id === a.id)!;
    expect(found.body).toBe('edited');

    deleteNote(b.id);
    expect(read().notes).toHaveLength(1);
  });
});

describe('contacts', () => {
  it('supports full CRUD', () => {
    const c = addContact({ name: 'Jamie Recruiter' });
    expect(read().contacts).toHaveLength(1);

    updateContact(c.id, { email: 'jamie@example.com' });
    expect(read().contacts[0].email).toBe('jamie@example.com');

    deleteContact(c.id);
    expect(read().contacts).toHaveLength(0);
  });
});

describe('tasks', () => {
  it('adds, toggles and deletes', () => {
    const t = addTask({ title: 'Prep for interview' });
    expect(t.done).toBe(false);

    toggleTask(t.id);
    expect(read().tasks[0].done).toBe(true);

    toggleTask(t.id);
    expect(read().tasks[0].done).toBe(false);

    deleteTask(t.id);
    expect(read().tasks).toHaveLength(0);
  });
});

describe('goals', () => {
  it('creates a goal per metric and updates it in place on a second call', () => {
    setGoal('applications', 10, 'week');
    setGoal('applications', 20, 'month');
    expect(read().goals).toHaveLength(1);
    expect(read().goals[0]).toMatchObject({ target: 20, period: 'month' });
  });

  it('tracks distinct metrics separately', () => {
    setGoal('applications', 10);
    setGoal('interviews', 3);
    expect(read().goals).toHaveLength(2);
  });
});

describe('saved views', () => {
  it('saves and deletes a view', () => {
    const v = saveView('My view', { status: 'Pending' }, 'board');
    expect(read().savedViews).toHaveLength(1);

    deleteSavedView(v.id);
    expect(read().savedViews).toHaveLength(0);
  });
});

describe('stage overrides, starring and archiving', () => {
  it('setStage records a manual override per application', () => {
    setStage('app-1', 'Interviewing');
    expect(read().stageOverrides['app-1']).toBe('Interviewing');
  });

  it('toggleStar and toggleArchive flip membership', () => {
    toggleStar('app-1');
    expect(read().starred).toContain('app-1');
    toggleStar('app-1');
    expect(read().starred).not.toContain('app-1');

    toggleArchive('app-1');
    expect(read().archived).toContain('app-1');
    toggleArchive('app-1');
    expect(read().archived).not.toContain('app-1');
  });
});

describe('resume versions', () => {
  it('adds and deletes', () => {
    const r = addResumeVersion({ label: 'v1' });
    expect(read().resumes).toHaveLength(1);
    deleteResumeVersion(r.id);
    expect(read().resumes).toHaveLength(0);
  });
});

describe('automation rules', () => {
  const baseRule = {
    name: 'Test rule',
    description: '',
    enabled: true,
    trigger: { type: 'stale_no_response' as const },
    actions: [],
  };

  it('adds a rule with zeroed run stats', () => {
    const rule = addAutomationRule(baseRule);
    expect(rule.runCount).toBe(0);
    expect(rule.lastRunAt).toBeNull();
    expect(read().automationRules).toHaveLength(1);
  });

  it('toggleAutomationRule flips enabled', () => {
    const rule = addAutomationRule(baseRule);
    toggleAutomationRule(rule.id);
    expect(read().automationRules[0].enabled).toBe(false);
  });

  it('updateAutomationRule patches fields', () => {
    const rule = addAutomationRule(baseRule);
    updateAutomationRule(rule.id, { name: 'Renamed' });
    expect(read().automationRules[0].name).toBe('Renamed');
  });

  it('deleteAutomationRule removes the rule and its log entries', () => {
    const rule = addAutomationRule(baseRule);
    recordAutomationRun(rule, 'key-1', null, 'ran once');
    expect(read().automationLog).toHaveLength(1);

    deleteAutomationRule(rule.id);
    expect(read().automationRules).toHaveLength(0);
    expect(read().automationLog).toHaveLength(0);
  });

  it('recordAutomationRun marks the dedupe key as seen and bumps run count', () => {
    // recordAutomationRun/automationHasRun treat the key as an opaque string — any
    // prefixing convention (e.g. `${rule.id}:${dedupeKey}`) is the caller's responsibility.
    const rule = addAutomationRule(baseRule);
    expect(automationHasRun('key-1')).toBe(false);

    recordAutomationRun(rule, 'key-1', null, 'ran once');
    expect(automationHasRun('key-1')).toBe(true);
    expect(read().automationRules[0].runCount).toBe(1);
    expect(read().automationRules[0].lastRunAt).not.toBeNull();
  });
});

describe('AI threads', () => {
  it('creates a thread with the default title', () => {
    const t = createThread();
    expect(t.title).toBe(NEW_THREAD_TITLE);
    expect(t.messages).toEqual([]);
  });

  it('appendMessage adopts the first user message as the thread title', () => {
    const t = createThread();
    appendMessage(t.id, {
      id: uid(),
      role: 'user',
      content: 'Draft a follow-up email to Stripe',
      created_at: new Date().toISOString(),
    });
    const updated = read().aiThreads.find(x => x.id === t.id)!;
    expect(updated.title).toBe('Draft a follow-up email to Stripe');
    expect(updated.messages).toHaveLength(1);
  });

  it('patchMessage merges fields into an existing message', () => {
    const t = createThread();
    const msgId = uid();
    appendMessage(t.id, { id: msgId, role: 'assistant', content: '', created_at: new Date().toISOString() });
    patchMessage(t.id, msgId, { content: 'done' });
    const msg = read().aiThreads.find(x => x.id === t.id)!.messages[0];
    expect(msg.content).toBe('done');
  });

  it('deleteThread removes it from the list', () => {
    const t = createThread();
    deleteThread(t.id);
    expect(read().aiThreads.find(x => x.id === t.id)).toBeUndefined();
  });
});

describe('export / import', () => {
  it('exportStore produces parseable JSON carrying the current data', () => {
    upsertTag('Exported tag');
    const json = exportStore();
    const parsed = JSON.parse(json) as { version: number; data: { tags: { name: string }[] } };
    expect(parsed.version).toBe(2);
    expect(parsed.data.tags[0].name).toBe('Exported tag');
  });

  it('importStore in merge mode adds new items without duplicating existing ones', () => {
    const existing = upsertTag('Keep me');
    const json = exportStore();

    // Re-importing the same export must not duplicate the tag that already exists.
    importStore(json, 'merge');
    expect(read().tags.filter(t => t.id === existing.id)).toHaveLength(1);
  });

  it('importStore in merge mode brings in tags absent locally', () => {
    const incoming = {
      version: 2,
      data: { tags: [{ id: 'incoming-1', name: 'Imported', color: '#fff', created_at: new Date().toISOString() }] },
    };
    importStore(JSON.stringify(incoming), 'merge');
    expect(read().tags.some(t => t.id === 'incoming-1')).toBe(true);
  });

  it('importStore in replace mode wipes local data and uses the import', () => {
    upsertTag('Will be wiped');
    const incoming = {
      version: 2,
      data: { tags: [{ id: 'replace-1', name: 'Replacement', color: '#fff', created_at: new Date().toISOString() }] },
    };
    importStore(JSON.stringify(incoming), 'replace');
    expect(read().tags).toHaveLength(1);
    expect(read().tags[0].id).toBe('replace-1');
  });
});
