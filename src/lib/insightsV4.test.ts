import { describe, expect, it } from 'vitest';
import {
  computeAnalytics,
  momentumBreakdown,
  nowItems,
  offerProjection,
  orderedStages,
  periodComparisons,
  stageFlow,
  stageLabel,
  timingInsight,
  weeklyWrapped,
  wipLimit,
  STAGES,
} from './insights';
import { makeApplication, makeEmptyStore, makeInterviewDate } from './testFixtures';
import { DAY_MS, dayKey } from './format';
import type { StageChange } from './store';

const DAY = DAY_MS;

function change(from: string, to: string, at = new Date().toISOString()): StageChange {
  return { id: `h-${from}-${to}-${at}`, application_id: 'app-1', from, to, actor: 'you', created_at: at };
}

describe('stage configuration', () => {
  it('falls back to the canonical order when none is set', () => {
    expect(orderedStages({})).toEqual([...STAGES]);
  });

  it('honours a user order and appends anything missing', () => {
    const ordered = orderedStages({ stageOrder: ['Offer', 'Applied'] });
    expect(ordered.slice(0, 2)).toEqual(['Offer', 'Applied']);
    expect(ordered).toHaveLength(STAGES.length);
    expect(new Set(ordered).size).toBe(STAGES.length);
  });

  it('ignores stage names it does not recognise', () => {
    expect(orderedStages({ stageOrder: ['Nonsense', 'Offer'] })[0]).toBe('Offer');
  });

  it('renames for display only', () => {
    expect(stageLabel('Applied', { stageLabels: { Applied: 'Sent' } })).toBe('Sent');
    expect(stageLabel('Applied', { stageLabels: { Applied: '  ' } })).toBe('Applied');
    expect(stageLabel('Applied', {})).toBe('Applied');
  });

  it('treats a missing or zero WIP limit as no limit', () => {
    expect(wipLimit('Applied', {})).toBe(0);
    expect(wipLimit('Applied', { wipLimits: { Applied: 0 } })).toBe(0);
    expect(wipLimit('Applied', { wipLimits: { Applied: 5 } })).toBe(5);
  });
});

describe('periodComparisons', () => {
  it('counts this period against the last', () => {
    const at = new Date(2026, 8, 16); // a Wednesday
    const apps = [
      makeApplication({ date_applied: dayKey(new Date(at.getTime() - DAY)) }),
      makeApplication({ date_applied: dayKey(new Date(at.getTime() - 9 * DAY)) }),
    ];
    const result = periodComparisons(apps, at);
    expect(result.week.current).toBe(1);
    expect(result.week.previous).toBe(1);
    expect(result.week.delta).toBe(0);
  });

  it('reports a null percentage rather than dividing by zero', () => {
    const at = new Date(2026, 8, 16);
    const result = periodComparisons([makeApplication({ date_applied: dayKey(at) })], at);
    expect(result.month.previous).toBe(0);
    expect(result.month.deltaPct).toBeNull();
  });
});

describe('stageFlow', () => {
  it('aggregates repeated transitions', () => {
    const flow = stageFlow([change('Applied', 'In Review'), change('Applied', 'In Review', '2026-09-02T00:00:00Z')], {});
    expect(flow.links).toHaveLength(1);
    expect(flow.links[0].count).toBe(2);
  });

  it('flags backward moves', () => {
    const flow = stageFlow([change('Interviewing', 'Closed')], {});
    expect(flow.links[0].backward).toBe(true);
  });

  it('does not flag forward moves as backward', () => {
    expect(stageFlow([change('Applied', 'Offer')], {}).links[0].backward).toBe(false);
  });

  it('ignores self-transitions', () => {
    expect(stageFlow([change('Applied', 'Applied')], {}).links).toEqual([]);
  });

  it('treats a blank origin as Wishlist', () => {
    expect(stageFlow([change('', 'Applied')], {}).links[0].from).toBe('Wishlist');
  });
});

describe('timingInsight', () => {
  it('declines to claim a pattern from too little data', () => {
    const result = timingInsight([makeApplication({ date_applied: '2026-09-01' })], {});
    expect(result.advantage).toBeNull();
    expect(result.headline).toMatch(/not enough/i);
  });

  it('buckets by weekday and reports a rate', () => {
    // 2026-09-07 is a Monday.
    const apps = Array.from({ length: 12 }, (_, i) =>
      makeApplication({
        id: `a${i}`,
        date_applied: i < 6 ? '2026-09-07' : '2026-09-09',
        interview_offered: i < 4,
      }),
    );
    const result = timingInsight(apps, {});
    const monday = result.days.find(d => d.day === 'Monday');
    expect(monday?.applications).toBe(6);
    expect(monday?.rate).toBeGreaterThan(0);
  });

  it('always returns seven day buckets', () => {
    expect(timingInsight([], {}).days).toHaveLength(7);
  });
});

describe('offerProjection', () => {
  const analytics = (overrides: Partial<ReturnType<typeof computeAnalytics>>) =>
    ({ ...computeAnalytics([], {}, makeEmptyStore()), ...overrides }) as ReturnType<typeof computeAnalytics>;

  it('asks for more data when there is almost none', () => {
    const projection = offerProjection(analytics({ applied: 2, interviews: 0 }));
    expect(projection.applicationsToOffer).toBeNull();
    expect(projection.headline).toMatch(/handful/i);
  });

  it('points at the resume when there are applications but no interviews', () => {
    const projection = offerProjection(analytics({ applied: 30, interviews: 0 }));
    expect(projection.applicationsToOffer).toBeNull();
    expect(projection.headline).toMatch(/resume/i);
  });

  it('projects from the user’s own rates', () => {
    const projection = offerProjection(
      analytics({ applied: 50, interviews: 10, offers: 2, byWeek: [{ label: 'w', iso: '', count: 5 }] }),
    );
    // 20% interview rate x 20% interview-to-offer = 4% per application = 25 needed.
    expect(projection.applicationsToOffer).toBe(25);
    expect(projection.confident).toBe(true);
  });

  it('falls back to an assumed conversion, flagged as unconfident, with no offers yet', () => {
    const projection = offerProjection(analytics({ applied: 20, interviews: 4, offers: 0 }));
    expect(projection.applicationsToOffer).toBeGreaterThan(0);
    expect(projection.interviewToOfferRate).toBe(25);
  });
});

describe('momentumBreakdown', () => {
  it('lists the four positive inputs plus follow-up debt', () => {
    const a = computeAnalytics([], {}, makeEmptyStore());
    const { parts } = momentumBreakdown(a);
    expect(parts).toHaveLength(5);
    expect(parts.map(p => p.label)).toContain('Interview conversion');
  });

  it('shows follow-up debt as a negative when applications go quiet', () => {
    const stale = makeApplication({
      id: 'old',
      date_applied: dayKey(new Date(Date.now() - 40 * DAY)),
      response_status: 'Pending',
    });
    const a = computeAnalytics([stale], {}, makeEmptyStore(), 7);
    const debt = momentumBreakdown(a).parts.find(p => p.label === 'Follow-up debt');
    expect(debt?.points).toBeLessThan(0);
  });
});

describe('weeklyWrapped', () => {
  it('summarises the current week', () => {
    const at = new Date(2026, 8, 16);
    const apps = [makeApplication({ id: 'a', date_applied: dayKey(new Date(at.getTime() - DAY)) })];
    const a = computeAnalytics(apps, {}, makeEmptyStore());
    const wrapped = weeklyWrapped(apps, {}, a, at);
    expect(wrapped.applications).toBe(1);
    expect(wrapped.headline).toBeTruthy();
  });

  it('says so plainly on a quiet week', () => {
    const at = new Date(2026, 8, 16);
    const a = computeAnalytics([], {}, makeEmptyStore());
    expect(weeklyWrapped([], {}, a, at).headline).toMatch(/quiet week/i);
  });

  it('leads with an offer when there is one', () => {
    const at = new Date(2026, 8, 16);
    const apps = [
      makeApplication({ id: 'a', date_applied: dayKey(new Date(at.getTime() - DAY)), response_status: 'Offered' }),
    ];
    const a = computeAnalytics(apps, {}, makeEmptyStore());
    expect(weeklyWrapped(apps, {}, a, at).headline).toMatch(/offer/i);
  });
});

describe('nowItems', () => {
  it('puts the soonest interview first', () => {
    const app = makeApplication({ id: 'app-1', interview_offered: true });
    const soon = makeInterviewDate({
      application_id: 'app-1',
      interview_date: new Date(Date.now() + DAY).toISOString(),
    });
    const store = makeEmptyStore();
    const a = computeAnalytics([app], { 'app-1': [soon] }, store);
    const items = nowItems(a, store);
    expect(items[0].kind).toBe('interview');
    expect(items[0].applicationId).toBe('app-1');
  });

  it('falls back to a calm state with nothing pending', () => {
    const store = makeEmptyStore();
    const a = computeAnalytics([], {}, store);
    expect(nowItems(a, store)[0].kind).toBe('calm');
  });

  it('surfaces overdue tasks', () => {
    const store = makeEmptyStore({
      tasks: [
        {
          id: 't1',
          application_id: null,
          title: 'Send the take-home',
          done: false,
          due_at: new Date(Date.now() - DAY).toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    });
    const a = computeAnalytics([], {}, store);
    expect(nowItems(a, store).some(i => i.kind === 'task')).toBe(true);
  });

  it('is ordered by urgency', () => {
    const store = makeEmptyStore();
    const a = computeAnalytics([], {}, store);
    const items = nowItems(a, store);
    const urgencies = items.map(i => i.urgency);
    expect([...urgencies].sort((x, y) => y - x)).toEqual(urgencies);
  });
});
