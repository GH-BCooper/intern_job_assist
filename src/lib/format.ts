export const DAY_MS = 86_400_000;

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a stored value into a Date. Bare `YYYY-MM-DD` values (how Supabase
 * returns `date` columns) are read as *local* midnight, not UTC — otherwise
 * every date shifts by a day for anyone west of Greenwich.
 */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(BARE_DATE.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ts(value?: string | null): number {
  return parseDate(value)?.getTime() ?? 0;
}

/** Local calendar-day key (`YYYY-MM-DD`) — safe to compare and group by. */
export function dayKey(value: Date | number | string | null | undefined): string {
  const d = typeof value === 'object' && value !== null ? value : typeof value === 'number' ? new Date(value) : parseDate(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(value?: string | null, opts?: Intl.DateTimeFormatOptions): string {
  const t = parseDate(value);
  if (!t) return '—';
  return t.toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * "September 15, 2026" for exports. `new Date('2026-09-15')` is UTC midnight, so the
 * PDF/Word "Date Applied" read one day early for anyone west of Greenwich, and
 * garbage input printed "Invalid Date" into a document that gets sent to people.
 */
export function fmtLongDate(value?: string | null, empty = '—'): string {
  const t = parseDate(value);
  return t ? t.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : empty;
}

export function fmtDateTime(value?: string | null): string {
  const t = parseDate(value);
  if (!t) return '—';
  return t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * A date `n` calendar days away, keeping the local time of day.
 *
 * Adding `n * 86_400_000` ms is wrong across a daylight-saving change: the day is
 * 23 or 25 hours long, so the result lands an hour off — on the previous date
 * after the autumn change. Week buckets, the heatmap and the calendar grid all
 * step by whole days, so they use this.
 */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function daysBetween(a: number, b: number): number {
  return Math.round((a - b) / DAY_MS);
}

export function daysSince(value?: string | null): number | null {
  const t = ts(value);
  if (!t) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

export function daysUntil(value?: string | null): number | null {
  const t = ts(value);
  if (!t) return null;
  return Math.ceil((t - Date.now()) / DAY_MS);
}

export function relative(value?: string | null): string {
  const t = ts(value);
  if (!t) return '—';
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const sign = diff < 0 ? 'ago' : 'from now';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ${sign}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ${sign}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ${sign}`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ${sign}`;
  return `${Math.round(months / 12)}y ${sign}`;
}

export function toLocalInput(value?: string | null): string {
  const t = value ? parseDate(value) : new Date();
  if (!t) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export function toDateInput(value?: string | null): string {
  return dayKey(value ? parseDate(value) : new Date());
}

export function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function startOfMonth(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(1);
  return x;
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function initials(text: string): string {
  const parts = text.trim().split(/[\s-]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'from-primary-400 to-accent-400',
  'from-sky-400 to-cyan-400',
  'from-emerald-400 to-teal-400',
  'from-violet-400 to-fuchsia-400',
  'from-amber-400 to-orange-400',
  'from-rose-400 to-pink-400',
];

export function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 9973;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function pluralize(n: number, word: string, plural?: string): string {
  return `${n} ${n === 1 ? word : plural || `${word}s`}`;
}

export function truncate(text: string, max = 120): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
