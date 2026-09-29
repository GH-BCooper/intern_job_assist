/**
 * iCalendar (RFC 5545) generation, hand-rolled — no dependency, no service.
 *
 * Produces a file every calendar app understands, so interviews and reminders
 * land in Google / Apple / Outlook Calendar from a plain download.
 */

import type { Application, InterviewDate } from './supabase';
import type { Reminder, StoreShape } from './store';
import { parseDate } from './format';

export type IcsEvent = {
  uid: string;
  start: Date;
  /** Defaults to a one-hour block. */
  end?: Date;
  title: string;
  description?: string;
  location?: string;
  /** Minutes before the start for a VALARM; omitted means no alarm. */
  alarmMinutes?: number;
};

const PRODID = '-//InternTrack//Pipeline//EN';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** UTC basic format: 20260929T140000Z */
export function icsStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escapes the reserved characters in a TEXT value. */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds a content line at 75 octets, as the spec requires for long summaries.
 *
 * The limit is in bytes, not characters, and a fold must never fall inside a
 * multi-byte character: a title with an emoji or an accent could otherwise be
 * cut in half and arrive as a replacement glyph in the calendar.
 */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  // `for…of` walks code points, so a surrogate pair is never split.
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(parts.length ? ` ${current}` : current);
      current = '';
      bytes = 0;
      limit = 74; // continuation lines start with one space
    }
    current += ch;
    bytes += size;
  }
  parts.push(parts.length ? ` ${current}` : current);
  return parts.join('\r\n');
}

export function buildIcs(events: IcsEvent[], calendarName = 'InternTrack'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
  ];

  const stamped = icsStamp(new Date());

  events.forEach(ev => {
    const end = ev.end || new Date(ev.start.getTime() + 60 * 60 * 1000);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}@interntrack`);
    lines.push(`DTSTAMP:${stamped}`);
    lines.push(`DTSTART:${icsStamp(ev.start)}`);
    lines.push(`DTEND:${icsStamp(end)}`);
    lines.push(fold(`SUMMARY:${icsEscape(ev.title)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${icsEscape(ev.description)}`));
    if (ev.location) lines.push(fold(`LOCATION:${icsEscape(ev.location)}`));
    if (ev.alarmMinutes && ev.alarmMinutes > 0) {
      lines.push('BEGIN:VALARM');
      lines.push(`TRIGGER:-PT${Math.round(ev.alarmMinutes)}M`);
      lines.push('ACTION:DISPLAY');
      lines.push(fold(`DESCRIPTION:${icsEscape(ev.title)}`));
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/** One interview round as a calendar event. */
export function interviewEvent(app: Application, interview: InterviewDate, timezone?: string): IcsEvent | null {
  const start = parseDate(interview.interview_date);
  if (!start) return null;
  const details = [
    app.role_applied_to ? `Role: ${app.role_applied_to}` : '',
    app.platform_applied_on ? `Applied via: ${app.platform_applied_on}` : '',
    timezone ? `Interviewer timezone: ${timezone}` : '',
    app.interview_questions ? `\nPrep notes:\n${app.interview_questions}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    uid: interview.id,
    start,
    end: new Date(start.getTime() + 60 * 60 * 1000),
    title: `${app.company_name} — ${interview.label || 'Interview'}`,
    description: details,
    location: app.platform_applied_on || '',
    alarmMinutes: 60,
  };
}

export function reminderEvent(reminder: Reminder, companyName?: string): IcsEvent | null {
  const start = parseDate(reminder.due_at);
  if (!start) return null;
  return {
    uid: reminder.id,
    start,
    end: new Date(start.getTime() + 30 * 60 * 1000),
    title: companyName ? `${reminder.title} (${companyName})` : reminder.title,
    description: reminder.notes,
    alarmMinutes: 15,
  };
}

/** Everything schedulable in the workspace, as one subscribable-looking calendar. */
export function buildWorkspaceIcs(
  applications: Application[],
  interviewsMap: Record<string, InterviewDate[]>,
  store: Pick<StoreShape, 'reminders' | 'interviewMeta'>,
): string {
  const events: IcsEvent[] = [];

  applications.forEach(app => {
    (interviewsMap[app.id] || []).forEach(iv => {
      const ev = interviewEvent(app, iv, store.interviewMeta[iv.id]?.timezone);
      if (ev) events.push(ev);
    });
  });

  store.reminders
    .filter(r => !r.done)
    .forEach(r => {
      const app = applications.find(a => a.id === r.application_id);
      const ev = reminderEvent(r, app?.company_name);
      if (ev) events.push(ev);
    });

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return buildIcs(events, 'InternTrack — interviews & reminders');
}

/** Triggers a browser download for an .ics payload. */
export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
