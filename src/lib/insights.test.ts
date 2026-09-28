import { describe, expect, it } from 'vitest';
import { buildSuggestions, computeAnalytics, stageOf, stagePatch, STAGES } from './insights';
import { makeApplication as makeApp, makeEmptyStore as emptyStore } from './testFixtures';
import type { Application, InterviewDate } from './supabase';

describe('stageOf', () => {
  it('defaults to Wishlist when nothing is set', () => {
    expect(stageOf(makeApp())).toBe('Wishlist');
  });

  it('is Applied once a date_applied is present', () => {
    expect(stageOf(makeApp({ date_applied: '2026-01-01' }))).toBe('Applied');
  });

  it('is In Review when viewed or shortlisted', () => {
    expect(stageOf(makeApp({ response_status: 'Viewed' }))).toBe('In Review');
    expect(stageOf(makeApp({ response_status: 'Shortlisted' }))).toBe('In Review');
  });

  it('is Interviewing when an interview has been offered', () => {
    expect(stageOf(makeApp({ interview_offered: true }))).toBe('Interviewing');
  });

  it('is Offer when offered or accepted', () => {
    expect(stageOf(makeApp({ response_status: 'Offered' }))).toBe('Offer');
    expect(stageOf(makeApp({ final_status: 'Accepted' }))).toBe('Offer');
  });

  it('is Closed on rejection or withdrawal, which outranks every other signal', () => {
    expect(stageOf(makeApp({ response_status: 'Rejected', interview_offered: true }))).toBe('Closed');
    expect(stageOf(makeApp({ final_status: 'Withdrawn', response_status: 'Offered' }))).toBe('Closed');
  });

  it('a manual board override wins over the computed stage', () => {
    const app = makeApp({ response_status: 'Rejected' });
    expect(stageOf(app, { [app.id]: 'Interviewing' })).toBe('Interviewing');
  });

  it('ignores an override value that is not a real stage', () => {
    const app = makeApp();
    expect(stageOf(app, { [app.id]: 'Not-A-Stage' })).toBe('Wishlist');
  });
});

describe('stagePatch', () => {
  it('produces fields consistent with stageOf for every stage', () => {
    STAGES.forEach(stage => {
      const patch = stagePatch(stage);
      const synthesized = makeApp(patch as Partial<Application>);
      expect(stageOf(synthesized)).toBe(stage);
    });
  });
});

describe('computeAnalytics', () => {
  it('returns all-zero analytics for an empty pipeline', () => {
    const a = computeAnalytics([], {}, emptyStore());
    expect(a.total).toBe(0);
    expect(a.responseRate).toBe(0);
    expect(a.interviewRate).toBe(0);
    expect(a.momentum).toBeGreaterThanOrEqual(0);
  });

  it('computes response and interview rates against applied count, not total', () => {
    const apps = [
      makeApp({ id: 'a', date_applied: '2026-01-01', response_status: 'Viewed' }),
      makeApp({ id: 'b', date_applied: '2026-01-02', response_status: 'Pending' }),
      makeApp({ id: 'c' }), // never applied — a Wishlist entry, excluded from the "applied" denominator
    ];
    const a = computeAnalytics(apps, {}, emptyStore());
    expect(a.applied).toBe(2);
    expect(a.responded).toBe(1);
    expect(a.responseRate).toBe(50);
  });

  it('counts an application as interviewed if it has a logged interview date', () => {
    const app = makeApp({ id: 'a', date_applied: '2026-01-01' });
    const interviewsMap: Record<string, InterviewDate[]> = {
      a: [{ id: 'iv-1', application_id: 'a', user_id: 'u', interview_date: '2026-01-10', label: 'Round 1', created_at: '2026-01-01' }],
    };
    const a2 = computeAnalytics([app], interviewsMap, emptyStore());
    expect(a2.interviews).toBe(1);
    expect(a2.avgResponseDays).toBe(9);
  });

  it('flags stale applications past the follow-up window and excludes closed/offer/wishlist', () => {
    const stale = makeApp({ id: 'stale', date_applied: new Date(Date.now() - 10 * 86_400_000).toISOString() });
    const closed = makeApp({
      id: 'closed',
      date_applied: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      response_status: 'Rejected',
    });
    const a = computeAnalytics([stale, closed], {}, emptyStore(), 7);
    expect(a.stale.map(s => s.app.id)).toEqual(['stale']);
  });

  it('groups applications per platform with an interview rate', () => {
    const apps = [
      makeApp({ id: 'a', platform_applied_on: 'LinkedIn', interview_offered: true }),
      makeApp({ id: 'b', platform_applied_on: 'LinkedIn' }),
      makeApp({ id: 'c', platform_applied_on: 'Indeed' }),
    ];
    const a = computeAnalytics(apps, {}, emptyStore());
    const linkedIn = a.byPlatform.find(p => p.platform === 'LinkedIn')!;
    expect(linkedIn.total).toBe(2);
    expect(linkedIn.interviews).toBe(1);
    expect(linkedIn.rate).toBe(50);
  });

  it('falls back to "Unspecified" for a blank platform', () => {
    const a = computeAnalytics([makeApp({ platform_applied_on: '' })], {}, emptyStore());
    expect(a.byPlatform[0].platform).toBe('Unspecified');
  });
});

describe('buildSuggestions', () => {
  it('suggests a follow-up for every stale application', () => {
    const stale = makeApp({ id: 'stale', date_applied: new Date(Date.now() - 10 * 86_400_000).toISOString() });
    const a = computeAnalytics([stale], {}, emptyStore(), 7);
    const suggestions = buildSuggestions([stale], {}, a, emptyStore());
    expect(suggestions.some(s => s.action === 'follow_up' && s.applicationId === 'stale')).toBe(true);
  });

  it('nudges when no applications were logged this week', () => {
    const a = computeAnalytics([], {}, emptyStore());
    const suggestions = buildSuggestions([], {}, a, emptyStore());
    expect(suggestions.some(s => s.id === 'cadence')).toBe(true);
  });

  it('flags applications with no tags once the count exceeds 5', () => {
    const apps = Array.from({ length: 6 }, (_, i) => makeApp({ id: `a${i}` }));
    const a = computeAnalytics(apps, {}, emptyStore());
    const suggestions = buildSuggestions(apps, {}, a, emptyStore());
    expect(suggestions.some(s => s.id === 'tidy')).toBe(true);
  });
});
