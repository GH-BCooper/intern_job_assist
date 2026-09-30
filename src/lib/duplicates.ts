/**
 * Fuzzy duplicate detection, used both as a warning on the add form and as a
 * Scout tool. Plain trigram similarity — no dependency, no service.
 */

import type { Application } from './supabase';

function clean(value: string): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // "Zürich" and "Zurich" are the same company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|pvt|private|technologies|technology|labs|group)\b/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ') // keep non-Latin scripts instead of erasing them
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

type Prepared = { text: string; grams: Set<string> };

/**
 * Normalising and trigramming a name is the expensive part of a comparison, and
 * `findDuplicatePairs` compares every application with every other — 1,000 of them
 * spent ~1.5 s re-preparing the same strings a million times. Each distinct string is
 * now prepared once (the cache is emptied when it grows large, so it cannot leak).
 */
const PREPARED = new Map<string, Prepared>();
const PREPARED_LIMIT = 4000;

function prepare(value: string): Prepared {
  const key = value || '';
  const hit = PREPARED.get(key);
  if (hit) return hit;
  if (PREPARED.size >= PREPARED_LIMIT) PREPARED.clear();
  const text = clean(key);
  const made = { text, grams: trigrams(text) };
  PREPARED.set(key, made);
  return made;
}

/** Dice coefficient over character trigrams: 0 (nothing alike) to 1 (identical). */
export function similarity(a: string, b: string): number {
  const x = prepare(a);
  const y = prepare(b);
  if (!x.text || !y.text) return 0;
  if (x.text === y.text) return 1;
  let shared = 0;
  x.grams.forEach(t => {
    if (y.grams.has(t)) shared += 1;
  });
  return (2 * shared) / (x.grams.size + y.grams.size);
}

export type DuplicateHit = { application: Application; score: number; reason: string };

/**
 * Applications that look like the one being added.
 *
 * Company similarity dominates — two different roles at the same company are
 * not duplicates, so the role only lifts an already-strong company match.
 */
export function findDuplicates(
  candidate: { company_name: string; role_applied_to?: string },
  applications: Application[],
  opts: { threshold?: number; excludeId?: string; limit?: number } = {},
): DuplicateHit[] {
  const threshold = opts.threshold ?? 0.62;
  const hits: DuplicateHit[] = [];

  applications.forEach(app => {
    if (opts.excludeId && app.id === opts.excludeId) return;
    const company = similarity(candidate.company_name, app.company_name);
    if (company < threshold) return;
    const role = candidate.role_applied_to
      ? similarity(candidate.role_applied_to, app.role_applied_to || '')
      : 0;
    const score = Math.min(1, company * 0.75 + role * 0.25);
    const reason =
      company > 0.92 && role > 0.7
        ? 'Same company and a near-identical role'
        : company > 0.92
          ? 'Same company, different role'
          : 'Similar company name';
    hits.push({ application: app, score, reason });
  });

  return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 5);
}

/** Every pair in the tracker that looks like an accidental double entry. */
export function findDuplicatePairs(applications: Application[], threshold = 0.8): DuplicateHit[][] {
  const groups: DuplicateHit[][] = [];
  const claimed = new Set<string>();

  applications.forEach(app => {
    if (claimed.has(app.id)) return;
    const matches = findDuplicates(
      { company_name: app.company_name, role_applied_to: app.role_applied_to },
      applications,
      { excludeId: app.id, threshold, limit: 8 },
    ).filter(h => !claimed.has(h.application.id));
    if (!matches.length) return;
    claimed.add(app.id);
    matches.forEach(m => claimed.add(m.application.id));
    groups.push([{ application: app, score: 1, reason: 'original' }, ...matches]);
  });

  return groups;
}
