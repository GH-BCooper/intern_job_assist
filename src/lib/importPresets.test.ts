import { describe, expect, it } from 'vitest';
import { buildImportPlan, detectPreset, mapRow, PRESETS } from './importPresets';
import { bookmarkletCode, HASH_KEY } from './bookmarklet';

const byId = (id: string) => PRESETS.find(p => p.id === id)!;

describe('detectPreset', () => {
  it('recognises a Huntr export by its headers', () => {
    expect(detectPreset([{ Company: 'Stripe', Title: 'Backend Intern', List: 'Applied' }]).id).toBe('huntr');
  });

  it('recognises a Teal export', () => {
    expect(detectPreset([{ 'Company Name': 'Stripe', 'Job Title': 'Intern', Status: 'Applied' }]).id).toBe('teal');
  });

  it('recognises a LinkedIn data export', () => {
    expect(
      detectPreset([{ 'Application Date': '2026/09/01', 'Company Name': 'Stripe', 'Job Title': 'Intern' }]).id,
    ).toBe('linkedin');
  });

  it('falls back to the generic preset for anything unfamiliar', () => {
    expect(detectPreset([{ foo: 'bar' }]).id).toBe('generic');
  });

  it('falls back for an empty file', () => {
    expect(detectPreset([]).id).toBe('generic');
  });
});

describe('mapRow', () => {
  it('maps a Huntr row, including its list to a response status', () => {
    const { data, skipped } = mapRow(
      { Company: 'Stripe', Title: 'Backend Intern', List: 'Interview', 'Date Applied': '2026-09-01' },
      byId('huntr'),
    );
    expect(skipped).toBe(false);
    expect(data.company_name).toBe('Stripe');
    expect(data.role_applied_to).toBe('Backend Intern');
    expect(data.response_status).toBe('Shortlisted');
    expect(data.interview_offered).toBe(true);
    expect(data.date_applied).toBe('2026-09-01');
  });

  it('marks a rejection in both status fields', () => {
    const { data } = mapRow({ Company: 'Stripe', Title: 'Intern', List: 'Rejected' }, byId('huntr'));
    expect(data.response_status).toBe('Rejected');
    expect(data.final_status).toBe('Rejected');
  });

  it('skips a row with no company name, and says why', () => {
    const result = mapRow({ Title: 'Intern', List: 'Applied' }, byId('huntr'));
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/company/i);
  });

  it('matches headers regardless of case', () => {
    expect(mapRow({ COMPANY: 'Stripe', title: 'Intern' }, byId('huntr')).data.company_name).toBe('Stripe');
  });

  it('normalises a slash-separated date', () => {
    const { data } = mapRow({ Company: 'Stripe', 'Date Applied': '9/14/2026' }, byId('huntr'));
    expect(data.date_applied).toBe('2026-09-14');
  });

  it('leaves an unparseable date null rather than guessing', () => {
    expect(mapRow({ Company: 'Stripe', 'Date Applied': 'soon' }, byId('huntr')).data.date_applied).toBeNull();
  });
});

describe('buildImportPlan', () => {
  const rows: Record<string, string>[] = [
    { Company: 'Stripe', Title: 'Backend Intern', List: 'Applied' },
    { Company: 'Netflix', Title: 'Frontend Intern', List: 'Applied' },
    { Title: 'Orphan row', List: 'Applied' },
  ];

  it('separates importable rows, duplicates and skips', () => {
    const plan = buildImportPlan(rows, [{ company_name: 'Stripe', role_applied_to: 'Backend Intern' }]);
    expect(plan.rows.map(r => r.company_name)).toEqual(['Netflix']);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.skipped).toBe(1);
  });

  it('holds back duplicates within the file itself', () => {
    const plan = buildImportPlan(
      [
        { Company: 'Stripe', Title: 'Intern', List: 'Applied' },
        { Company: 'Stripe', Title: 'Intern', List: 'Applied' },
      ],
      [],
    );
    expect(plan.rows).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
  });

  it('imports everything into an empty tracker', () => {
    const plan = buildImportPlan(rows.slice(0, 2), []);
    expect(plan.rows).toHaveLength(2);
    expect(plan.duplicates).toHaveLength(0);
  });

  it('honours an explicit preset over detection', () => {
    const plan = buildImportPlan([{ company: 'Stripe', role: 'Intern' }], [], byId('generic'));
    expect(plan.preset.id).toBe('generic');
    expect(plan.rows[0].company_name).toBe('Stripe');
  });
});

describe('bookmarkletCode', () => {
  it('is a javascript: URL', () => {
    expect(bookmarkletCode('https://example.com').startsWith('javascript:')).toBe(true);
  });

  it('targets the given origin and the hash handoff', () => {
    const decoded = decodeURIComponent(bookmarkletCode('https://example.com/'));
    expect(decoded).toContain('https://example.com/dashboard#');
    expect(decoded).toContain(HASH_KEY);
  });

  it('collapses to a single line, as a bookmark URL must', () => {
    expect(bookmarkletCode('https://example.com')).not.toContain('\n');
  });

  it('reads JSON-LD job postings', () => {
    expect(decodeURIComponent(bookmarkletCode('https://example.com'))).toContain('JobPosting');
  });
});
