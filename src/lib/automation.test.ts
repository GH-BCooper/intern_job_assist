import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOMATION_TEMPLATES, evaluateAutomations, type AutomationBridge } from './automation';
import { addAutomationRule, addTask, read, savePreferences, setStoreScope } from './store';
import { makeApplication as makeApp } from './testFixtures';
import type { Application } from './supabase';

let counter = 0;

beforeEach(() => {
  counter += 1;
  setStoreScope(`automation-test-${counter}`);
});

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

function bridge(applications: Application[], interviewsMap: AutomationBridge['interviewsMap'] = {}): AutomationBridge {
  return {
    applications,
    interviewsMap,
    updateApplication: vi.fn().mockResolvedValue(undefined),
  };
}

describe('evaluateAutomations', () => {
  it('does nothing when automations are disabled', async () => {
    savePreferences({ automationsEnabled: false });
    addAutomationRule({
      name: 'Nudge',
      description: '',
      enabled: true,
      trigger: { type: 'stale_no_response', days: 3 },
      actions: [{ type: 'add_reminder', title: 'Follow up with {{company}}' }],
    });
    const app = makeApp({ date_applied: daysAgo(10) });

    const fired = await evaluateAutomations(bridge([app]));

    expect(fired).toBe(0);
    expect(read().reminders).toHaveLength(0);
  });

  it('fires stale_no_response and creates the templated reminder', async () => {
    addAutomationRule({
      name: 'Nudge',
      description: '',
      enabled: true,
      trigger: { type: 'stale_no_response', days: 3 },
      actions: [{ type: 'add_reminder', title: 'Follow up with {{company}}' }],
    });
    const app = makeApp({ date_applied: daysAgo(10) });

    const fired = await evaluateAutomations(bridge([app]));

    expect(fired).toBe(1);
    expect(read().reminders).toHaveLength(1);
    expect(read().reminders[0].title).toBe('Follow up with Stripe');
    expect(read().reminders[0].application_id).toBe(app.id);
  });

  it('does not re-fire the same match on a second evaluation (dedupe)', async () => {
    addAutomationRule({
      name: 'Nudge',
      description: '',
      enabled: true,
      trigger: { type: 'stale_no_response', days: 3 },
      actions: [{ type: 'add_reminder', title: 'Follow up with {{company}}' }],
    });
    const app = makeApp({ date_applied: daysAgo(10) });
    const b = bridge([app]);

    await evaluateAutomations(b);
    const secondRun = await evaluateAutomations(b);

    expect(secondRun).toBe(0);
    expect(read().reminders).toHaveLength(1);
  });

  it('ignores applications that already responded', async () => {
    addAutomationRule({
      name: 'Nudge',
      description: '',
      enabled: true,
      trigger: { type: 'stale_no_response', days: 3 },
      actions: [{ type: 'add_reminder', title: 'Follow up' }],
    });
    const app = makeApp({ date_applied: daysAgo(10), response_status: 'Shortlisted' });

    const fired = await evaluateAutomations(bridge([app]));

    expect(fired).toBe(0);
  });

  it('fires interview_upcoming only within the lead window', async () => {
    addAutomationRule({
      name: 'Prep',
      description: '',
      enabled: true,
      trigger: { type: 'interview_upcoming', days: 2 },
      actions: [{ type: 'add_task', title: 'Prep for {{company}}' }],
    });
    const app = makeApp({ interview_offered: true });
    const soon = { id: 'iv-1', application_id: app.id, user_id: 'user-1', interview_date: daysFromNow(1), label: 'Round 1', created_at: new Date().toISOString() };
    const far = { id: 'iv-2', application_id: app.id, user_id: 'user-1', interview_date: daysFromNow(10), label: 'Round 2', created_at: new Date().toISOString() };

    const fired = await evaluateAutomations(bridge([app], { [app.id]: [soon, far] }));

    expect(fired).toBe(1);
    expect(read().tasks).toHaveLength(1);
    expect(read().tasks[0].title).toBe('Prep for Stripe');
  });

  it('fires task_overdue for a past-due, unfinished task', async () => {
    addAutomationRule({
      name: 'Overdue',
      description: '',
      enabled: true,
      trigger: { type: 'task_overdue' },
      actions: [{ type: 'notify', body: 'Task overdue: {{title}}' }],
    });
    addTask({ title: 'Send thank-you note', due_at: daysAgo(2) });

    const fired = await evaluateAutomations(bridge([]));

    expect(fired).toBe(1);
  });

  it('archives an application via the archive action when stage_is matches', async () => {
    addAutomationRule({
      name: 'Auto-archive',
      description: '',
      enabled: true,
      trigger: { type: 'stage_is', stage: 'Closed' },
      actions: [{ type: 'archive' }],
    });
    const app = makeApp({ response_status: 'Rejected', final_status: 'Rejected' });

    await evaluateAutomations(bridge([app]));

    expect(read().archived).toContain(app.id);
  });

  it('posts to the configured webhook URL for a webhook action', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    addAutomationRule({
      name: 'Webhook rule',
      description: '',
      enabled: true,
      trigger: { type: 'stage_is', stage: 'Closed' },
      actions: [{ type: 'webhook', webhookUrl: 'https://example.com/hook', body: '{{company}} closed out' }],
    });
    const app = makeApp({ response_status: 'Rejected', final_status: 'Rejected' });

    await evaluateAutomations(bridge([app]));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });
});

describe('AUTOMATION_TEMPLATES', () => {
  it('every template has at least one trigger and one action', () => {
    AUTOMATION_TEMPLATES.forEach(t => {
      expect(t.trigger).toBeTruthy();
      expect(t.actions.length).toBeGreaterThan(0);
    });
  });

  it('template builtin ids are unique', () => {
    const ids = AUTOMATION_TEMPLATES.map(t => t.builtin);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
