import { describe, expect, it } from 'vitest';
import { findDuplicatePairs, findDuplicates, similarity } from './duplicates';
import { makeApplication } from './testFixtures';

describe('similarity', () => {
  it('is 1 for identical strings', () => {
    expect(similarity('Stripe', 'Stripe')).toBe(1);
  });

  it('ignores case and legal suffixes', () => {
    expect(similarity('Stripe Inc', 'stripe')).toBe(1);
    expect(similarity('Acme Technologies Ltd', 'ACME')).toBe(1);
  });

  it('is high for near-misses', () => {
    expect(similarity('Stripe', 'Strpe')).toBeGreaterThan(0.6);
  });

  it('is low for unrelated names', () => {
    expect(similarity('Stripe', 'Netflix')).toBeLessThan(0.3);
  });

  it('is 0 when either side is empty', () => {
    expect(similarity('', 'Stripe')).toBe(0);
    expect(similarity('Stripe', '')).toBe(0);
  });
});

describe('findDuplicates', () => {
  const apps = [
    makeApplication({ id: 'a', company_name: 'Stripe', role_applied_to: 'Backend Intern' }),
    makeApplication({ id: 'b', company_name: 'Netflix', role_applied_to: 'Frontend Intern' }),
    makeApplication({ id: 'c', company_name: 'Stripe Inc.', role_applied_to: 'Backend Engineering Intern' }),
  ];

  it('finds the same company under a different spelling', () => {
    const hits = findDuplicates({ company_name: 'stripe', role_applied_to: 'Backend Intern' }, apps);
    expect(hits.map(h => h.application.id).sort()).toEqual(['a', 'c']);
  });

  it('excludes the record being checked', () => {
    const hits = findDuplicates(
      { company_name: 'Stripe', role_applied_to: 'Backend Intern' },
      apps,
      { excludeId: 'a' },
    );
    expect(hits.map(h => h.application.id)).not.toContain('a');
  });

  it('returns nothing for a company not tracked', () => {
    expect(findDuplicates({ company_name: 'Figma' }, apps)).toEqual([]);
  });

  it('ranks an exact company-and-role match highest', () => {
    const hits = findDuplicates({ company_name: 'Stripe', role_applied_to: 'Backend Intern' }, apps);
    expect(hits[0].application.id).toBe('a');
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('explains why something matched', () => {
    const hits = findDuplicates({ company_name: 'Stripe', role_applied_to: 'Backend Intern' }, apps);
    expect(hits[0].reason).toMatch(/same company/i);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => makeApplication({ id: `s${i}`, company_name: 'Stripe' }));
    expect(findDuplicates({ company_name: 'Stripe' }, many, { limit: 3 })).toHaveLength(3);
  });
});

describe('findDuplicatePairs', () => {
  it('groups accidental double entries', () => {
    const groups = findDuplicatePairs([
      makeApplication({ id: 'a', company_name: 'Stripe', role_applied_to: 'Backend Intern' }),
      makeApplication({ id: 'b', company_name: 'Stripe', role_applied_to: 'Backend Intern' }),
      makeApplication({ id: 'c', company_name: 'Netflix', role_applied_to: 'Frontend Intern' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map(h => h.application.id).sort()).toEqual(['a', 'b']);
  });

  it('never puts one application in two groups', () => {
    const groups = findDuplicatePairs([
      makeApplication({ id: 'a', company_name: 'Stripe' }),
      makeApplication({ id: 'b', company_name: 'Stripe' }),
      makeApplication({ id: 'c', company_name: 'Stripe' }),
    ]);
    const seen = groups.flatMap(g => g.map(h => h.application.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('finds nothing in a clean tracker', () => {
    expect(
      findDuplicatePairs([
        makeApplication({ id: 'a', company_name: 'Stripe' }),
        makeApplication({ id: 'b', company_name: 'Netflix' }),
      ]),
    ).toEqual([]);
  });
});
