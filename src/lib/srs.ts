/**
 * SM-2 spaced repetition, ~60 lines of arithmetic and no library.
 *
 * The scheduler behind the interview-question trainer: each review grades
 * recall 0–5, which adjusts the card's ease factor and the interval until the
 * next showing. Everything is stored locally, so the trainer works offline.
 */

import { DAY_MS } from './format';
import type { SrsCard } from './store';

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export const GRADES: { grade: Grade; label: string; hint: string; tone: string }[] = [
  { grade: 1, label: 'Again', hint: 'Blanked on it', tone: 'text-red-600 dark:text-red-400' },
  { grade: 3, label: 'Hard', hint: 'Recalled with effort', tone: 'text-amber-600 dark:text-amber-400' },
  { grade: 4, label: 'Good', hint: 'Solid answer', tone: 'text-sky-600 dark:text-sky-400' },
  { grade: 5, label: 'Easy', hint: 'Instant', tone: 'text-emerald-600 dark:text-emerald-400' },
];

export const MIN_EASE = 1.3;

export type SrsUpdate = Pick<SrsCard, 'ease' | 'interval' | 'reps' | 'lapses' | 'due_at' | 'last_reviewed_at'>;

/**
 * Applies one review to a card's schedule.
 *
 * A grade below 3 is a lapse: the card resets to a one-day interval but keeps a
 * reduced ease, so repeatedly-missed cards keep coming back sooner than new ones.
 */
export function review(card: Pick<SrsCard, 'ease' | 'interval' | 'reps' | 'lapses'>, grade: Grade, at = Date.now()): SrsUpdate {
  const q = Math.max(0, Math.min(5, grade));
  let { ease, interval, reps, lapses } = card;

  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    lapses += 1;
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }

  interval = Math.max(1, Math.min(interval, 365));

  return {
    ease: Math.round(ease * 100) / 100,
    interval,
    reps,
    lapses,
    due_at: new Date(at + interval * DAY_MS).toISOString(),
    last_reviewed_at: new Date(at).toISOString(),
  };
}

export function isDue(card: Pick<SrsCard, 'due_at'>, at = Date.now()): boolean {
  return new Date(card.due_at).getTime() <= at;
}

/** Cards to study now: everything due, hardest first, then never-seen cards. */
export function dueQueue(cards: SrsCard[], at = Date.now(), limit = 40): SrsCard[] {
  return cards
    .filter(c => isDue(c, at))
    .sort((a, b) => {
      if (a.reps === 0 !== (b.reps === 0)) return a.reps === 0 ? 1 : -1;
      return b.lapses - a.lapses || new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    })
    .slice(0, limit);
}

export type SrsStats = { total: number; due: number; learning: number; mature: number; reviews: number; retention: number };

export function srsStats(cards: SrsCard[], at = Date.now()): SrsStats {
  const reviews = cards.reduce((n, c) => n + c.reps + c.lapses, 0);
  const lapses = cards.reduce((n, c) => n + c.lapses, 0);
  return {
    total: cards.length,
    due: cards.filter(c => isDue(c, at)).length,
    learning: cards.filter(c => c.interval < 21 && c.reps > 0).length,
    mature: cards.filter(c => c.interval >= 21).length,
    reviews,
    retention: reviews ? Math.round(((reviews - lapses) / reviews) * 100) : 0,
  };
}

/**
 * Splits a free-text interview-questions field into individual cards.
 *
 * Accepts the shapes people actually type: bulleted lines, numbered lists, and
 * question marks running together in one paragraph.
 */
export function extractQuestions(text: string): string[] {
  if (!text) return [];
  const byLine = text
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

  const out: string[] = [];
  byLine.forEach(line => {
    if (line.length > 160 && line.includes('?')) {
      line
        .split(/(?<=\?)\s+/)
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(s => out.push(s));
    } else {
      out.push(line);
    }
  });

  return [...new Set(out.filter(q => q.length > 8))];
}
