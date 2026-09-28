/**
 * Fuzzy duplicate detection, used both as a warning on the add form and as a
 * Scout tool. Plain trigram similarity — no dependency, no service.
 */

import type { Application } from './supabase';

function clean(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|pvt|private|technologies|technology|labs|group)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

/** Dice coefficient over character trigrams: 0 (nothing alike) to 1 (identical). */
export function similarity(a: string, b: string): number {
  const x = clean(a);
  const y = clean(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ta = trigrams(x);
  const tb = trigrams(y);
  let shared = 0;
  ta.forEach(t => {
    if (tb.has(t)) shared += 1;
  });
  return (2 * shared) / (ta.size + tb.size);
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
