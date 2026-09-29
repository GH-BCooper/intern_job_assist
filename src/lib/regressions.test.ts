/**
 * Regression tests for defects found by driving the real app in a browser.
 *
 * Each block names the bug it pins, so a future failure reads as "this came back"
 * rather than as a mystery.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, dayKey } from './format';
import { computeAnalytics } from './insights';
import { makeApplication as makeApp, makeEmptyStore } from './testFixtures';
import {
  addAutomationRule,
  addReminder,
  appendMessage,
  completeReminder,
  createThread,
  exportStore,
  importStore,
  read,
  savePreferences,
  setStoreScope,
  STORAGE_WARNING_EVENT,
  type AiMessage,
} from './store';
import { evaluateAutomations } from './automation';
import { toGemini } from './ai/providers';
import { userAskedToDelete } from './ai/agent';
import { copyText } from './clipboard';

let scope = 0;
beforeEach(() => {
  scope += 1;
  setStoreScope(`regression-${scope}`);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Daylight saving: stepping by 24h landed an hour off the calendar day */
/* ------------------------------------------------------------------ */

describe('addDays across a daylight-saving change', () => {
  const previousTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'America/New_York';
  });
  afterEach(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });

  it('runs in a zone that observes DST (otherwise these tests prove nothing)', () => {
    // Oct 26 + 7 * 24h is Nov 1 23:00 in New York — the bug this guards against.
    const naive = new Date(new Date(2026, 9, 26).getTime() + 7 * 86_400_000);
    expect(dayKey(naive)).toBe('2026-11-01');
  });

  it('lands on the right calendar day after the autumn change', () => {
    expect(dayKey(addDays(new Date(2026, 9, 26), 7))).toBe('2026-11-02');
    expect(addDays(new Date(2026, 9, 26), 7).getHours()).toBe(0);
  });

  it('gives 42 consecutive distinct days for a calendar grid spanning the change', () => {
    const start = new Date(2026, 9, 26);
    const keys = Array.from({ length: 42 }, (_, i) => dayKey(addDays(start, i)));
    expect(new Set(keys).size).toBe(42);
    expect(keys[7]).toBe('2026-11-02');
    expect(keys[41]).toBe('2026-12-06');
  });

  it('puts a Monday-dated application in that Monday’s week bucket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 18, 12)); // Wed 18 Nov 2026
    const app = makeApp({ date_applied: '2026-10-26' }); // Monday, before the change
    const analytics = computeAnalytics([app], {}, makeEmptyStore(), 7);

    const bucket = analytics.byWeek.find(w => w.count > 0);
    expect(bucket?.label).toBe('Oct 26');
  });
});

/* ------------------------------------------------------------------ */
/* Backups must not carry credentials                                  */
/* ------------------------------------------------------------------ */

describe('exportStore and secrets', () => {
  beforeEach(() => {
    savePreferences({
      aiKeys: { gemini: 'AIza-secret-key' },
      telegramToken: '123:telegram-secret',
      webhookUrl: 'https://discord.com/api/webhooks/1/secret',
      shareToken: 'share-secret',
      followUpDays: 11,
    });
  });

  it('leaves keys, tokens and webhook URLs out of a normal export', () => {
    const json = exportStore();
    expect(json).not.toContain('AIza-secret-key');
    expect(json).not.toContain('telegram-secret');
    expect(json).not.toContain('discord.com/api/webhooks');
    expect(json).not.toContain('share-secret');
    // …while ordinary settings still travel.
    expect(JSON.parse(json).data.preferences.followUpDays).toBe(11);
  });

  it('includes them only when asked', () => {
    expect(exportStore({ includeSecrets: true })).toContain('AIza-secret-key');
  });

  it('a merge import does not blank the credentials already on this device', () => {
    const backup = exportStore(); // scrubbed
    importStore(backup, 'merge');
    const prefs = read().preferences;
    expect(prefs.aiKeys.gemini).toBe('AIza-secret-key');
    expect(prefs.webhookUrl).toContain('discord.com');
    expect(prefs.telegramToken).toBe('123:telegram-secret');
  });

  it('a merge import fills in a credential that is missing here', () => {
    const withKey = exportStore({ includeSecrets: true });
    savePreferences({ aiKeys: {}, webhookUrl: '' });
    importStore(withKey, 'merge');
    expect(read().preferences.aiKeys.gemini).toBe('AIza-secret-key');
    expect(read().preferences.webhookUrl).toContain('discord.com');
  });
});

/* ------------------------------------------------------------------ */
/* Storage: a full quota must not silently lose every later change     */
/* ------------------------------------------------------------------ */

describe('a full browser quota', () => {
  it('sheds disposable data and warns, instead of dropping the write', () => {
    const thread = createThread();
    for (let i = 0; i < 40; i += 1) {
      appendMessage(thread.id, {
        id: `m${i}`,
        role: i % 2 ? 'assistant' : 'user',
        content: 'x'.repeat(200),
        created_at: new Date().toISOString(),
      });
    }
    const warnings: string[] = [];
    const onWarn = (e: Event) => warnings.push(String((e as CustomEvent).detail));
    window.addEventListener(STORAGE_WARNING_EVENT, onWarn);

    // Accept only writes a little smaller than the workspace as it stands, which
    // fits only once the chat has been trimmed.
    const limit = JSON.stringify(read()).length - 500;
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (value.length > limit) throw new DOMException('quota', 'QuotaExceededError');
      real.call(this, key, value);
    });

    savePreferences({ followUpDays: 9 });
    window.removeEventListener(STORAGE_WARNING_EVENT, onWarn);

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/trimmed/i);
    expect(read().preferences.followUpDays).toBe(9);
    expect(read().aiThreads[0].messages.length).toBeLessThanOrEqual(20);
  });

  it('says so plainly when even the trimmed workspace does not fit', () => {
    const warnings: string[] = [];
    const onWarn = (e: Event) => warnings.push(String((e as CustomEvent).detail));
    window.addEventListener(STORAGE_WARNING_EVENT, onWarn);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    savePreferences({ followUpDays: 4 });
    window.removeEventListener(STORAGE_WARNING_EVENT, onWarn);

    expect(warnings.some(w => /full/i.test(w))).toBe(true);
    // The session still works from memory.
    expect(read().preferences.followUpDays).toBe(4);
  });
});

describe('assistant history is bounded', () => {
  it('keeps at most 200 messages per thread', () => {
    const thread = createThread();
    for (let i = 0; i < 260; i += 1) {
      appendMessage(thread.id, { id: `m${i}`, role: 'user', content: `q${i}`, created_at: new Date().toISOString() });
    }
    const messages = read().aiThreads[0].messages;
    expect(messages).toHaveLength(200);
    expect(messages[199].content).toBe('q259');
  });

  it('truncates a huge tool result stored in a trace', () => {
    const thread = createThread();
    const message: AiMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'done',
      created_at: new Date().toISOString(),
      toolCalls: [{ name: 'list_applications', args: {}, result: 'r'.repeat(20_000) }],
    };
    appendMessage(thread.id, message);
    const stored = read().aiThreads[0].messages[0].toolCalls?.[0].result || '';
    expect(stored.length).toBeLessThan(1600);
  });
});

/* ------------------------------------------------------------------ */
/* Monthly reminders drifted (Jan 31 + 1 month = Mar 3)                 */
/* ------------------------------------------------------------------ */

describe('monthly reminders', () => {
  it('clamp to the end of a short month, then return to the 31st', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 12));
    const reminder = addReminder({ title: 'Rent', due_at: new Date(2026, 0, 31, 10).toISOString(), repeat: 'monthly' });

    completeReminder(reminder.id);
    const feb = new Date(read().reminders[0].due_at);
    expect([feb.getFullYear(), feb.getMonth(), feb.getDate()]).toEqual([2026, 1, 28]);

    vi.setSystemTime(new Date(2026, 1, 28, 12));
    completeReminder(reminder.id);
    const mar = new Date(read().reminders[0].due_at);
    expect([mar.getFullYear(), mar.getMonth(), mar.getDate()]).toEqual([2026, 2, 31]);
  });
});

/* ------------------------------------------------------------------ */
/* Assistant: deletions need the user's own say-so                      */
/* ------------------------------------------------------------------ */

describe('userAskedToDelete', () => {
  it('accepts a plain request or confirmation', () => {
    expect(userAskedToDelete('delete the Stripe application')).toBe(true);
    expect(userAskedToDelete('Yes, go ahead')).toBe(true);
    expect(userAskedToDelete('please remove that one')).toBe(true);
  });

  it('rejects messages that do not ask for one', () => {
    expect(userAskedToDelete('summarise my applications')).toBe(false);
    expect(userAskedToDelete('what should I do this week?')).toBe(false);
    expect(userAskedToDelete('')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Gemini: parallel tool calls need their results in a single turn      */
/* ------------------------------------------------------------------ */

describe('toGemini', () => {
  it('sends every result for one round of tool calls in a single turn', () => {
    const { contents } = toGemini([
      { role: 'user', content: 'how am I doing' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'a', name: 'get_overview', args: {} },
          { id: 'b', name: 'list_interviews', args: {} },
        ],
      },
      { role: 'tool', toolCallId: 'a', name: 'get_overview', content: '{"total":5}' },
      { role: 'tool', toolCallId: 'b', name: 'list_interviews', content: '[]' },
    ]);

    expect(contents).toHaveLength(3);
    const results = contents[2];
    expect(results.role).toBe('user');
    expect(results.parts).toHaveLength(2);
    expect(results.parts.every(p => 'functionResponse' in p)).toBe(true);
  });

  it('keeps a following user message as its own turn', () => {
    const { contents } = toGemini([
      { role: 'tool', toolCallId: 'a', name: 'get_overview', content: '{}' },
      { role: 'user', content: 'thanks' },
    ]);
    expect(contents).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* Clipboard                                                            */
/* ------------------------------------------------------------------ */

describe('copyText', () => {
  it('falls back to execCommand when the async clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    (document as unknown as { execCommand: () => boolean }).execCommand = vi.fn(() => true);
    await expect(copyText('hello')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back when writeText rejects, and reports failure honestly', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    (document as unknown as { execCommand: () => boolean }).execCommand = vi.fn(() => false);
    await expect(copyText('hello')).resolves.toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Automations: passes must not overlap                                 */
/* ------------------------------------------------------------------ */

describe('overlapping automation passes', () => {
  it('fires a rule once even when a second pass starts before the first finishes', async () => {
    addAutomationRule({
      name: 'Stage sync',
      description: '',
      enabled: true,
      trigger: { type: 'stale_no_response', days: 3 },
      actions: [
        { type: 'add_reminder', title: 'Follow up with {{company}}' },
        { type: 'set_stage', stage: 'In Review' },
      ],
    });
    const app = makeApp({ date_applied: new Date(Date.now() - 10 * 86_400_000).toISOString() });

    // The stage write is slow, so the first pass is still in flight when the second starts.
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const bridge = {
      applications: [app],
      interviewsMap: {},
      updateApplication: vi.fn().mockImplementation(() => gate),
    };

    const first = evaluateAutomations(bridge);
    const second = evaluateAutomations(bridge);
    release();
    await Promise.all([first, second]);

    expect(read().reminders.filter(r => r.title.startsWith('Follow up'))).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* ICS folding is in octets and never splits a character               */
/* ------------------------------------------------------------------ */

describe('ics fold', () => {
  const CRLF = String.fromCharCode(13, 10);

  it('keeps every line within 75 octets, even with accents and emoji', async () => {
    const { fold } = await import('./ics');
    const title = 'SUMMARY:' + 'Entrevista técnica 🚀 con el equipo de plataforma '.repeat(6);
    const lines = fold(title).split(CRLF);
    expect(lines.length).toBeGreaterThan(1);
    const encoder = new TextEncoder();
    lines.forEach(line => expect(encoder.encode(line).length).toBeLessThanOrEqual(75));
  });

  it('never cuts a character in half — unfolding gives the original text back', async () => {
    const { fold } = await import('./ics');
    const original = 'DESCRIPTION:' + '面接 — round 2 🚀🚀🚀 café '.repeat(20);
    const unfolded = fold(original)
      .split(CRLF)
      .map((line, i) => (i === 0 ? line : line.slice(1)))
      .join('');
    expect(unfolded).toBe(original);
    expect(unfolded.includes(String.fromCharCode(0xfffd))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Exports: two applications at one company must not overwrite          */
/* ------------------------------------------------------------------ */

describe('exportAllApplicationsZip', () => {
  it('keeps every application when several share a company name', async () => {
    const saved: Blob[] = [];
    vi.doMock('file-saver', () => ({ saveAs: (blob: Blob) => saved.push(blob) }));
    vi.resetModules();
    const { exportAllApplicationsZip } = await import('../utils/zipExportUtils');
    const JSZip = (await import('jszip')).default;

    const apps = [
      makeApp({ id: 'a', company_name: 'Stripe', role_applied_to: 'Backend Intern' }),
      makeApp({ id: 'b', company_name: 'Stripe', role_applied_to: 'Frontend Intern' }),
      makeApp({ id: 'c', company_name: 'Stripe', role_applied_to: 'Frontend Intern' }),
    ];
    await exportAllApplicationsZip(apps, {}, {}, {}, 'pdf');

    expect(saved).toHaveLength(1);
    const zip = await JSZip.loadAsync(saved[0]);
    const files = Object.keys(zip.files).filter(name => name.endsWith('.pdf'));
    expect(files).toHaveLength(3);
    expect(new Set(files.map(f => f.toLowerCase())).size).toBe(3);
    vi.doUnmock('file-saver');
  });
});
