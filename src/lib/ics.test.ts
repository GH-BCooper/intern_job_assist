import { describe, expect, it } from 'vitest';
import { buildIcs, buildWorkspaceIcs, fold, icsEscape, icsStamp, interviewEvent, reminderEvent } from './ics';
import { makeApplication, makeEmptyStore, makeInterviewDate } from './testFixtures';
import type { Reminder } from './store';

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rem-1',
    application_id: null,
    title: 'Follow up with Stripe',
    notes: 'Short and specific',
    due_at: '2026-10-05T09:00:00.000Z',
    kind: 'follow_up',
    done: false,
    notified: false,
    repeat: 'none',
    timezone: '',
    created_at: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('icsStamp', () => {
  it('formats as UTC basic format', () => {
    expect(icsStamp(new Date('2026-09-29T14:05:09.000Z'))).toBe('20260929T140509Z');
  });

  it('pads single-digit components', () => {
    expect(icsStamp(new Date('2026-01-02T03:04:05.000Z'))).toBe('20260102T030405Z');
  });
});

describe('icsEscape', () => {
  it('escapes the reserved characters', () => {
    expect(icsEscape('Round 2; technical, onsite')).toBe('Round 2\\; technical\\, onsite');
  });

  it('turns newlines into literal \\n', () => {
    expect(icsEscape('one\ntwo')).toBe('one\\ntwo');
  });

  it('escapes backslashes before anything else', () => {
    expect(icsEscape('a\\b')).toBe('a\\\\b');
  });
});

describe('fold', () => {
  it('leaves short lines alone', () => {
    expect(fold('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds long lines with a leading space on continuations', () => {
    const folded = fold(`SUMMARY:${'x'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].length).toBe(75);
    lines.slice(1).forEach(line => expect(line.startsWith(' ')).toBe(true));
  });
});

describe('buildIcs', () => {
  const event = {
    uid: 'iv-1',
    start: new Date('2026-10-02T13:00:00.000Z'),
    title: 'Stripe — Round 1',
    description: 'Backend intern',
  };

  it('wraps events in a valid calendar envelope', () => {
    const ics = buildIcs([event]);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:iv-1@interntrack');
  });

  it('uses CRLF line endings, as the spec requires', () => {
    const ics = buildIcs([event]);
    expect(ics.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  it('defaults to a one-hour block', () => {
    const ics = buildIcs([event]);
    expect(ics).toContain('DTSTART:20261002T130000Z');
    expect(ics).toContain('DTEND:20261002T140000Z');
  });

  it('adds a VALARM only when asked', () => {
    expect(buildIcs([event])).not.toContain('BEGIN:VALARM');
    expect(buildIcs([{ ...event, alarmMinutes: 30 }])).toContain('TRIGGER:-PT30M');
  });

  it('emits one VEVENT per event', () => {
    const ics = buildIcs([event, { ...event, uid: 'iv-2' }]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe('interviewEvent', () => {
  it('builds a titled event from an application and a round', () => {
    const app = makeApplication({ company_name: 'Stripe', role_applied_to: 'Backend Intern' });
    const round = makeInterviewDate({ application_id: app.id, interview_date: '2026-10-02T13:00:00.000Z', label: 'Round 1' });
    const event = interviewEvent(app, round);
    expect(event?.title).toBe('Stripe — Round 1');
    expect(event?.description).toContain('Backend Intern');
  });

  it('includes the interviewer timezone when one is recorded', () => {
    const app = makeApplication();
    const round = makeInterviewDate({ interview_date: '2026-10-02T13:00:00.000Z' });
    expect(interviewEvent(app, round, 'Asia/Kolkata')?.description).toContain('Asia/Kolkata');
  });

  it('returns null for an unparseable date', () => {
    expect(interviewEvent(makeApplication(), makeInterviewDate({ interview_date: 'not a date' }))).toBeNull();
  });
});

describe('reminderEvent', () => {
  it('appends the company when there is one', () => {
    expect(reminderEvent(reminder(), 'Stripe')?.title).toBe('Follow up with Stripe (Stripe)');
  });

  it('is a half-hour block', () => {
    const event = reminderEvent(reminder());
    expect((event!.end!.getTime() - event!.start.getTime()) / 60_000).toBe(30);
  });
});

describe('buildWorkspaceIcs', () => {
  it('includes interviews and open reminders, sorted by start', () => {
    const app = makeApplication({ id: 'app-1', company_name: 'Stripe' });
    const store = makeEmptyStore({
      reminders: [reminder({ due_at: '2026-10-01T09:00:00.000Z' })],
    });
    const ics = buildWorkspaceIcs(
      [app],
      { 'app-1': [makeInterviewDate({ application_id: 'app-1', interview_date: '2026-10-09T13:00:00.000Z' })] },
      store,
    );
    const first = ics.indexOf('20261001T090000Z');
    const second = ics.indexOf('20261009T130000Z');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it('skips reminders already done', () => {
    const store = makeEmptyStore({ reminders: [reminder({ done: true })] });
    expect(buildWorkspaceIcs([], {}, store)).not.toContain('BEGIN:VEVENT');
  });
});
