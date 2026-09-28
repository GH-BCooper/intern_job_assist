import { describe, expect, it } from 'vitest';
import {
  avatarGradient,
  dayKey,
  daysBetween,
  daysSince,
  daysUntil,
  DAY_MS,
  fmtDate,
  initials,
  parseDate,
  pluralize,
  relative,
  slugify,
  toDateInput,
  toLocalInput,
  truncate,
  ts,
} from './format';

describe('parseDate', () => {
  it('returns null for empty or null input', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('parses a bare YYYY-MM-DD as local midnight, not UTC', () => {
    const d = parseDate('2026-03-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2); // March
    expect(d!.getDate()).toBe(15);
    expect(d!.getHours()).toBe(0);
  });

  it('parses a full ISO timestamp normally', () => {
    const d = parseDate('2026-03-15T18:30:00.000Z');
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBe(new Date('2026-03-15T18:30:00.000Z').getTime());
  });
});

describe('ts', () => {
  it('is 0 for missing values', () => {
    expect(ts(null)).toBe(0);
    expect(ts(undefined)).toBe(0);
    expect(ts('')).toBe(0);
  });

  it('matches parseDate().getTime() for valid values', () => {
    expect(ts('2026-01-01')).toBe(parseDate('2026-01-01')!.getTime());
  });
});

describe('dayKey', () => {
  it('formats a bare date string back to the same YYYY-MM-DD key', () => {
    expect(dayKey('2026-01-05')).toBe('2026-01-05');
  });

  it('pads single-digit months and days', () => {
    expect(dayKey('2026-01-05')).toBe('2026-01-05');
    expect(dayKey('2026-11-09')).toBe('2026-11-09');
  });

  it('accepts a numeric timestamp', () => {
    const d = new Date(2026, 5, 3); // local June 3 2026
    expect(dayKey(d.getTime())).toBe('2026-06-03');
  });

  it('accepts a Date object directly', () => {
    const d = new Date(2026, 0, 20);
    expect(dayKey(d)).toBe('2026-01-20');
  });

  it('returns an empty string for null/invalid input', () => {
    expect(dayKey(null)).toBe('');
    expect(dayKey(undefined)).toBe('');
  });
});

describe('daysBetween / daysSince / daysUntil', () => {
  it('daysBetween computes whole days from millisecond timestamps', () => {
    expect(daysBetween(DAY_MS * 5, 0)).toBe(5);
    expect(daysBetween(0, DAY_MS * 5)).toBe(-5);
  });

  it('daysSince returns null for missing dates', () => {
    expect(daysSince(null)).toBeNull();
  });

  it('daysSince returns a non-negative number for a past date', () => {
    const yesterday = new Date(Date.now() - DAY_MS * 3).toISOString();
    expect(daysSince(yesterday)).toBeGreaterThanOrEqual(2);
  });

  it('daysUntil returns null for missing dates', () => {
    expect(daysUntil(undefined)).toBeNull();
  });

  it('daysUntil is positive for a future date', () => {
    const future = new Date(Date.now() + DAY_MS * 4).toISOString();
    expect(daysUntil(future)).toBeGreaterThanOrEqual(3);
  });
});

describe('relative', () => {
  it('returns an em-dash placeholder for missing values', () => {
    expect(relative(null)).toBe('—');
  });

  it('describes a moment in the very recent past as "just now"', () => {
    expect(relative(new Date(Date.now() - 1000).toISOString())).toBe('just now');
  });

  it('describes a future date with "from now"', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000 * 5).toISOString();
    expect(relative(future)).toMatch(/from now$/);
  });

  it('describes a past date with "ago"', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000 * 5).toISOString();
    expect(relative(past)).toMatch(/ago$/);
  });
});

describe('fmtDate', () => {
  it('formats a valid date', () => {
    expect(fmtDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('returns an em-dash for invalid/missing dates', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('nonsense')).toBe('—');
  });
});

describe('toLocalInput / toDateInput', () => {
  it('toDateInput round-trips a bare date', () => {
    expect(toDateInput('2026-07-04')).toBe('2026-07-04');
  });

  it('toLocalInput produces a datetime-local compatible string', () => {
    const s = toLocalInput('2026-07-04T09:30:00');
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe('initials', () => {
  it('returns ? for empty input', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });

  it('takes the first two letters of a single word', () => {
    expect(initials('Stripe')).toBe('ST');
  });

  it('takes the first letter of the first two words', () => {
    expect(initials('Acme Corp')).toBe('AC');
  });

  it('splits on hyphens too', () => {
    expect(initials('Notion-Labs')).toBe('NL');
  });
});

describe('avatarGradient', () => {
  it('is deterministic for the same seed', () => {
    expect(avatarGradient('Stripe')).toBe(avatarGradient('Stripe'));
  });

  it('returns one of the known gradient classes', () => {
    expect(avatarGradient('Stripe')).toContain('from-');
  });
});

describe('pluralize', () => {
  it('uses the singular for 1', () => {
    expect(pluralize(1, 'application')).toBe('1 application');
  });

  it('uses the default plural (adds s) for other counts', () => {
    expect(pluralize(0, 'application')).toBe('0 applications');
    expect(pluralize(3, 'application')).toBe('3 applications');
  });

  it('uses a supplied irregular plural', () => {
    expect(pluralize(2, 'company', 'companies')).toBe('2 companies');
  });
});

describe('truncate', () => {
  it('returns empty string for empty input', () => {
    expect(truncate('')).toBe('');
  });

  it('leaves short strings untouched', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('truncates long strings with an ellipsis, respecting max length', () => {
    const result = truncate('a'.repeat(20), 10);
    expect(result.length).toBe(10);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('slugify', () => {
  it('lowercases and dashifies', () => {
    expect(slugify('Software Engineer Intern')).toBe('software-engineer-intern');
  });

  it('strips leading/trailing separators', () => {
    expect(slugify('  --Weird Input!!--  ')).toBe('weird-input');
  });
});
