import { describe, expect, it } from 'vitest';
import { dueQueue, extractQuestions, isDue, MIN_EASE, review, srsStats } from './srs';
import type { SrsCard } from './store';

function card(overrides: Partial<SrsCard> = {}): SrsCard {
  return {
    id: 'card-1',
    application_id: null,
    question: 'Tell me about a time a project slipped.',
    answer: '',
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    due_at: new Date(AT).toISOString(),
    last_reviewed_at: null,
    created_at: new Date(AT).toISOString(),
    ...overrides,
  };
}

// A fixed "now" for every schedule assertion; the fixture defaults to it too,
// so a card is due unless a test says otherwise.
const AT = Date.UTC(2026, 8, 29);

describe('review', () => {
  it('schedules a new card one day out on the first pass', () => {
    const next = review(card(), 4, AT);
    expect(next.reps).toBe(1);
    expect(next.interval).toBe(1);
  });

  it('jumps to six days on the second pass', () => {
    const next = review(card({ reps: 1, interval: 1 }), 4, AT);
    expect(next.reps).toBe(2);
    expect(next.interval).toBe(6);
  });

  it('multiplies by ease from the third pass', () => {
    const next = review(card({ reps: 2, interval: 6, ease: 2.5 }), 4, AT);
    expect(next.interval).toBe(Math.round(6 * next.ease));
    expect(next.interval).toBeGreaterThan(6);
  });

  it('treats a grade under 3 as a lapse and resets the interval', () => {
    const next = review(card({ reps: 5, interval: 40, lapses: 1 }), 1, AT);
    expect(next.lapses).toBe(2);
    expect(next.reps).toBe(0);
    expect(next.interval).toBe(1);
  });

  it('lowers ease on a hard answer and raises it on an easy one', () => {
    expect(review(card(), 3, AT).ease).toBeLessThan(2.5);
    expect(review(card(), 5, AT).ease).toBeGreaterThan(2.5);
  });

  it('never lets ease fall below the floor', () => {
    let state = card();
    for (let i = 0; i < 20; i += 1) state = { ...state, ...review(state, 0, AT) };
    expect(state.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });

  it('caps the interval at a year', () => {
    expect(review(card({ reps: 9, interval: 300, ease: 2.8 }), 5, AT).interval).toBeLessThanOrEqual(365);
  });

  it('records when the review happened and when the card is next due', () => {
    const next = review(card(), 4, AT);
    expect(next.last_reviewed_at).toBe(new Date(AT).toISOString());
    expect(new Date(next.due_at).getTime()).toBe(AT + next.interval * 86_400_000);
  });
});

describe('isDue', () => {
  it('is true at or before now', () => {
    expect(isDue({ due_at: new Date(AT).toISOString() }, AT)).toBe(true);
    expect(isDue({ due_at: new Date(AT - 1000).toISOString() }, AT)).toBe(true);
  });

  it('is false in the future', () => {
    expect(isDue({ due_at: new Date(AT + 86_400_000).toISOString() }, AT)).toBe(false);
  });
});

describe('dueQueue', () => {
  it('excludes cards that are not due', () => {
    const queue = dueQueue(
      [card({ id: 'a' }), card({ id: 'b', due_at: new Date(AT + 86_400_000).toISOString() })],
      AT,
    );
    expect(queue.map(c => c.id)).toEqual(['a']);
  });

  it('puts seen cards before brand-new ones', () => {
    const queue = dueQueue([card({ id: 'new' }), card({ id: 'seen', reps: 3 })], AT);
    expect(queue[0].id).toBe('seen');
  });

  it('puts the most-lapsed first among seen cards', () => {
    const queue = dueQueue(
      [card({ id: 'easy', reps: 3, lapses: 0 }), card({ id: 'hard', reps: 3, lapses: 4 })],
      AT,
    );
    expect(queue[0].id).toBe('hard');
  });

  it('respects the limit', () => {
    const cards = Array.from({ length: 50 }, (_, i) => card({ id: `c${i}` }));
    expect(dueQueue(cards, AT, 10)).toHaveLength(10);
  });
});

describe('srsStats', () => {
  it('counts due, learning and mature cards', () => {
    const stats = srsStats(
      [
        card({ id: 'a', reps: 1, interval: 3 }),
        card({ id: 'b', reps: 4, interval: 40, due_at: new Date(AT + 86_400_000).toISOString() }),
        card({ id: 'c' }),
      ],
      AT,
    );
    expect(stats.total).toBe(3);
    expect(stats.due).toBe(2);
    expect(stats.learning).toBe(1);
    expect(stats.mature).toBe(1);
  });

  it('reports retention as passes over total attempts', () => {
    const stats = srsStats([card({ reps: 7, lapses: 3 })], AT);
    expect(stats.reviews).toBe(10);
    expect(stats.retention).toBe(70);
  });

  it('reports zero retention with no reviews rather than dividing by zero', () => {
    expect(srsStats([card()], AT).retention).toBe(0);
  });
});

describe('extractQuestions', () => {
  it('splits bulleted and numbered lists', () => {
    const questions = extractQuestions('- Why this company?\n2) Describe a hard bug you fixed.\n* What is your biggest weakness?');
    expect(questions).toHaveLength(3);
    expect(questions[0]).toBe('Why this company?');
    expect(questions[1]).toBe('Describe a hard bug you fixed.');
  });

  it('drops fragments that are too short to be questions', () => {
    expect(extractQuestions('ok\nyes\nTell me about your proudest project.')).toEqual([
      'Tell me about your proudest project.',
    ]);
  });

  it('deduplicates repeats', () => {
    expect(extractQuestions('Why this company?\nWhy this company?')).toHaveLength(1);
  });

  it('splits a long run-on paragraph on question marks', () => {
    const long = `${'Why do you want this role and what draws you to the team here? '.repeat(3)}What would your first month look like?`;
    expect(extractQuestions(long).length).toBeGreaterThan(1);
  });

  it('returns nothing for empty input', () => {
    expect(extractQuestions('')).toEqual([]);
  });
});
