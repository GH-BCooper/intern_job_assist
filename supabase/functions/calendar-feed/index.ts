/**
 * Subscribable ICS feed — a Supabase Edge Function on the free tier.
 *
 * The one-click `.ics` download in the app is a snapshot: import it once and it
 * never changes. Calendar apps can *subscribe* to a URL instead, re-fetching it
 * on their own schedule, which is what this serves.
 *
 * GET /functions/v1/calendar-feed?token=<share token>
 *   → text/calendar built from the snapshot stored in `shared_dashboards`
 *     for a row whose scope is 'calendar'.
 *
 * Deploy (once, from a machine with the Supabase CLI logged in):
 *   supabase functions deploy calendar-feed --no-verify-jwt
 *
 * `--no-verify-jwt` is required: calendar clients cannot send an Authorization
 * header. Security comes from the unguessable token, the same way an iCloud or
 * Google secret calendar address works, and the function only ever returns
 * events — never the underlying records.
 */

// @ts-nocheck -- Deno runtime; this file is not part of the Vite/TS build.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type FeedEvent = {
  uid: string;
  start: string;
  end?: string;
  title: string;
  description?: string;
  location?: string;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function stamp(value: string): string {
  const d = new Date(value);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function esc(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const out = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    out.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) out.push(` ${rest}`);
  return out.join('\r\n');
}

function buildCalendar(events: FeedEvent[], name: string): string {
  const now = stamp(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//InternTrack//Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    // Ask subscribers to re-poll hourly; most clients honour one of these.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const ev of events) {
    if (!ev?.start || !ev?.title) continue;
    const startMs = new Date(ev.start).getTime();
    if (Number.isNaN(startMs)) continue;
    const end = ev.end && !Number.isNaN(new Date(ev.end).getTime())
      ? ev.end
      : new Date(startMs + 60 * 60 * 1000).toISOString();

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${esc(ev.uid || String(startMs))}@interntrack`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${stamp(ev.start)}`);
    lines.push(`DTEND:${stamp(end)}`);
    lines.push(fold(`SUMMARY:${esc(ev.title)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`));
    if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`));
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT60M');
    lines.push('ACTION:DISPLAY');
    lines.push(fold(`DESCRIPTION:${esc(ev.title)}`));
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  if (!token) {
    return new Response('Missing token.', { status: 400, headers: CORS });
  }

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    // The service role stays server-side; the token in the query string is the
    // only credential the caller presents, and it is scoped to one row.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data, error } = await client
    .from('shared_dashboards')
    .select('payload,label,revoked,expires_at')
    .eq('token', token)
    .eq('scope', 'calendar')
    .maybeSingle();

  if (error) return new Response('Feed unavailable.', { status: 500, headers: CORS });
  if (!data || data.revoked || (data.expires_at && new Date(data.expires_at) < new Date())) {
    // An empty but valid calendar, so a subscribed client shows nothing rather
    // than an error dialog every hour.
    return new Response(buildCalendar([], 'InternTrack (link inactive)'), {
      headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8' },
    });
  }

  const events: FeedEvent[] = Array.isArray(data.payload?.events) ? data.payload.events : [];
  const body = buildCalendar(events, data.label || 'InternTrack — interviews & reminders');

  return new Response(body, {
    headers: {
      ...CORS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Content-Disposition': 'inline; filename="interntrack.ics"',
    },
  });
});
