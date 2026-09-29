import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conditionsPass, inQuietHours } from './automation';
import { makeApplication, makeEmptyStore } from './testFixtures';
import type { AutomationRule } from './store';

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: 'rule-1',
    name: 'Test rule',
    description: '',
    enabled: true,
    trigger: { type: 'stale_no_response' },
    actions: [{ type: 'notify' }],
    created_at: new Date().toISOString(),
    lastRunAt: null,
    runCount: 0,
    ...overrides,
  };
}

describe('inQuietHours', () => {
  const at = (hour: number) => new Date(2026, 8, 29, hour, 0, 0);

  it('is false when disabled', () => {
    expect(inQuietHours({ enabled: false, from: 22, to: 8 }, at(2))).toBe(false);
  });

  it('handles a window that wraps midnight', () => {
    const quiet = { enabled: true, from: 22, to: 8 };
    expect(inQuietHours(quiet, at(23))).toBe(true);
    expect(inQuietHours(quiet, at(2))).toBe(true);
    expect(inQuietHours(quiet, at(9))).toBe(false);
    expect(inQuietHours(quiet, at(21))).toBe(false);
  });

  it('handles a daytime window', () => {
    const quiet = { enabled: true, from: 9, to: 17 };
    expect(inQuietHours(quiet, at(12))).toBe(true);
    expect(inQuietHours(quiet, at(18))).toBe(false);
  });

  it('is inclusive of the start hour and exclusive of the end', () => {
    const quiet = { enabled: true, from: 22, to: 8 };
    expect(inQuietHours(quiet, at(22))).toBe(true);
    expect(inQuietHours(quiet, at(8))).toBe(false);
  });

  it('is false when from and to are the same, rather than silencing everything', () => {
    expect(inQuietHours({ enabled: true, from: 10, to: 10 }, at(10))).toBe(false);
  });
});

describe('conditionsPass', () => {
  const app = makeApplication({ id: 'app-1', company_name: 'Stripe', platform_applied_on: 'LinkedIn' });

  const store = makeEmptyStore({
    tags: [
      { id: 'tag-dream', name: 'dream-company', color: '#FB923C', created_at: new Date().toISOString() },
      { id: 'tag-other', name: 'backup', color: '#38BDF8', created_at: new Date().toISOString() },
    ],
    applicationTags: [{ id: 'at-1', application_id: 'app-1', tag_id: 'tag-dream' }],
    starred: ['app-1'],
    priorities: { 'app-1': 4 },
  });

  it('passes a rule with no conditions, exactly as before they existed', () => {
    expect(conditionsPass(rule(), app, store)).toBe(true);
  });

  it('matches a tag the application carries', () => {
    expect(conditionsPass(rule({ conditions: [{ type: 'has_tag', value: 'dream-company' }] }), app, store)).toBe(true);
  });

  it('rejects a tag the application lacks', () => {
    expect(conditionsPass(rule({ conditions: [{ type: 'has_tag', value: 'backup' }] }), app, store)).toBe(false);
  });

  it('inverts with negate', () => {
    expect(
      conditionsPass(rule({ conditions: [{ type: 'has_tag', value: 'backup', negate: true }] }), app, store),
    ).toBe(true);
  });

  it('matches the platform case-insensitively', () => {
    expect(conditionsPass(rule({ conditions: [{ type: 'platform_is', value: 'linkedin' }] }), app, store)).toBe(true);
  });

  it('matches starred', () => {
    expect(conditionsPass(rule({ conditions: [{ type: 'starred' }] }), app, store)).toBe(true);
  });

  it('compares priority as a floor', () => {
    expect(conditionsPass(rule({ conditions: [{ type: 'priority_at_least', number: 4 }] }), app, store)).toBe(true);
    expect(conditionsPass(rule({ conditions: [{ type: 'priority_at_least', number: 5 }] }), app, store)).toBe(false);
  });

  it('requires every clause under "and"', () => {
    const conditions = [
      { type: 'has_tag' as const, value: 'dream-company' },
      { type: 'has_tag' as const, value: 'backup' },
    ];
    expect(conditionsPass(rule({ conditions, match: 'and' }), app, store)).toBe(false);
  });

  it('requires only one clause under "or"', () => {
    const conditions = [
      { type: 'has_tag' as const, value: 'dream-company' },
      { type: 'has_tag' as const, value: 'backup' },
    ];
    expect(conditionsPass(rule({ conditions, match: 'or' }), app, store)).toBe(true);
  });

  it('defaults to "and" when no match mode is set', () => {
    const conditions = [
      { type: 'has_tag' as const, value: 'dream-company' },
      { type: 'starred' as const },
    ];
    expect(conditionsPass(rule({ conditions }), app, store)).toBe(true);
  });

  it('fails application-scoped clauses on a workspace-wide match', () => {
    expect(conditionsPass(rule({ conditions: [{ type: 'starred' }] }), null, store)).toBe(false);
  });
});

describe('store: completeReminder', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('marks a one-off reminder done', async () => {
    const { addReminder, completeReminder, read } = await import('./store');
    const reminder = addReminder({ title: 'One-off', due_at: new Date().toISOString() });
    completeReminder(reminder.id);
    expect(read().reminders.find(r => r.id === reminder.id)?.done).toBe(true);
  });

  it('re-schedules a weekly reminder instead of completing it', async () => {
    const { addReminder, completeReminder, read } = await import('./store');
    const due = new Date(Date.now() - 86_400_000).toISOString();
    const reminder = addReminder({ title: 'Check the pipeline', due_at: due, repeat: 'weekly' });
    completeReminder(reminder.id);
    const updated = read().reminders.find(r => r.id === reminder.id);
    expect(updated?.done).toBe(false);
    expect(new Date(updated!.due_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('skips past occurrences so a neglected reminder does not fire repeatedly', async () => {
    const { addReminder, completeReminder, read } = await import('./store');
    const longAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const reminder = addReminder({ title: 'Daily standup', due_at: longAgo, repeat: 'daily' });
    completeReminder(reminder.id);
    const updated = read().reminders.find(r => r.id === reminder.id);
    expect(new Date(updated!.due_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('clears the notified flag so the next occurrence still alerts', async () => {
    const { addReminder, completeReminder, read, updateReminder } = await import('./store');
    const reminder = addReminder({ title: 'Monthly review', due_at: new Date().toISOString(), repeat: 'monthly' });
    updateReminder(reminder.id, { notified: true });
    completeReminder(reminder.id);
    expect(read().reminders.find(r => r.id === reminder.id)?.notified).toBe(false);
  });
});
