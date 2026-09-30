import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { makeApplication, makeInterviewDate } from '../lib/testFixtures';
import { pdfSafe } from '../lib/pdfText';
import { appFields, buildDocx, buildPDF } from './applicationDocument';

/** Everything the PDF asked jsPDF to draw, with the page it landed on. */
const drawn = vi.hoisted(() => [] as { text: string; y: number; page: number }[]);

vi.mock('jspdf', async importOriginal => {
  const mod = await importOriginal<typeof import('jspdf')>();
  const Real = mod.jsPDF;
  // The real writer, with `text` (an instance method, so it cannot be spied on a prototype) recorded.
  class Recording extends Real {
    constructor(...args: ConstructorParameters<typeof Real>) {
      super(...args);
      const original = this.text.bind(this) as (...a: unknown[]) => unknown;
      (this as unknown as { text: unknown }).text = (text: unknown, x: number, y: number, ...rest: unknown[]) => {
        const lines = Array.isArray(text) ? text : [text];
        const internal = this.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } };
        const page = internal.getCurrentPageInfo().pageNumber;
        lines.forEach((line, i) => drawn.push({ text: String(line), y: y + i * 5, page }));
        return original(text, x, y, ...rest);
      };
    }
  }
  return { ...mod, default: Recording, jsPDF: Recording };
});

beforeEach(() => {
  drawn.length = 0;
});

const captureText = () => drawn;

describe('the PDF writer', () => {
  it('carries a long field across pages instead of running off the bottom', () => {
    const drawn = captureText();
    const questions = Array.from({ length: 120 }, (_, i) => `Question number ${i + 1}: explain how you would design it`).join('\n');
    const doc = buildPDF([makeApplication({ interview_questions: questions })]);

    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    // Before the fix every one of these was drawn in a single call on page 1, past y = 297 mm.
    const pageHeight = doc.internal.pageSize.getHeight();
    expect(drawn.every(line => line.y <= pageHeight)).toBe(true);
    expect(drawn.some(line => line.text.includes('Question number 120'))).toBe(true);
    expect(drawn.find(line => line.text.includes('Question number 120'))?.page).toBeGreaterThan(1);
  });

  it('starts a field with its label and does not orphan the label at the foot of a page', () => {
    const drawn = captureText();
    const doc = buildPDF([makeApplication({ company_description: 'x '.repeat(4000) })]);
    const pageHeight = doc.internal.pageSize.getHeight();
    expect(drawn.every(line => line.y <= pageHeight - 20 || /Made with love|Exported/.test(line.text))).toBe(true);
  });

  it('prints the role, platform and interview rounds that the single-PDF export used to leave out', () => {
    const drawn = captureText();
    buildPDF(
      [makeApplication({ id: 'app-1', role_applied_to: 'Backend Intern', platform_applied_on: 'LinkedIn' })],
      { 'app-1': [makeInterviewDate({ label: 'Phone screen', interview_date: '2026-10-02T15:00:00' })] },
    );
    const all = drawn.map(line => line.text).join('\n');
    expect(all).toContain('ROLE APPLIED TO');
    expect(all).toContain('Backend Intern');
    expect(all).toContain('LinkedIn');
    expect(all).toContain('Phone screen: October 2, 2026');
    expect(all).toContain('3:00 PM');
  });

  it('wraps a very long company name in the header', () => {
    const drawn = captureText();
    const name = 'The International Association of Extremely Long Company Names and Holdings Worldwide Limited';
    buildPDF([makeApplication({ company_name: name })]);
    // The header band draws the name at y = 26. The full name also appears, unwrapped, in
    // the 10 pt "Company" field further down, so only the header lines are checked.
    const header = drawn.filter(line => line.page === 1 && line.y >= 26 && line.y < 36 && name.includes(line.text));
    expect(header.length).toBeGreaterThan(0);
    expect(header.some(line => line.text === name)).toBe(false);
  });
});

describe('appFields', () => {
  it('lists interview rounds in date order and shows a bare date without a time', () => {
    const value = appFields(makeApplication(), [
      makeInterviewDate({ id: 'b', label: 'Final', interview_date: '2026-10-20' }),
      makeInterviewDate({ id: 'a', label: 'Screen', interview_date: '2026-10-02T09:30:00' }),
    ]).find(f => f.label === 'Interview Dates')!.value;
    const [screen, final] = value.split('\n');
    // Newer ICU writes "October 2, 2026 at 9:30 AM", older "October 2, 2026, 9:30 AM".
    expect(screen).toMatch(/^Screen: October 2, 2026(,| at) 9:30 AM$/);
    expect(final).toBe('Final: October 20, 2026');
  });

  it('includes learnings when there are some', () => {
    const fields = appFields(makeApplication(), [], { learnings: 'They care about tests', questions_asked: 'Why us?' } as never);
    expect(fields.map(f => f.label)).toEqual(expect.arrayContaining(['Interview Learnings', 'Questions Asked']));
  });
});

describe('the Word writer', () => {
  it('keeps the line breaks of multi-line fields', async () => {
    const buffer = await Packer.toBuffer(
      buildDocx([makeApplication({ interview_questions: 'First question\nSecond question\nThird question' })]),
    );
    const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
    expect(xml).toContain('First question');
    expect((xml.match(/<w:br\/>/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('puts each application on its own page', async () => {
    const buffer = await Packer.toBuffer(
      buildDocx([makeApplication({ id: 'a', company_name: 'Alpha' }), makeApplication({ id: 'b', company_name: 'Beta' })]),
    );
    const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
    expect(xml).toContain('Alpha');
    expect(xml).toContain('Beta');
    expect(xml).toContain('w:type w:val="nextPage"');
  });
});

describe('pdfSafe', () => {
  it('keeps everything the built-in fonts can draw', () => {
    expect(pdfSafe('Zürich – “quoted” • 5€ …')).toBe('Zürich – “quoted” • 5€ …');
  });

  it('folds accents that have no glyph and marks what it cannot draw', () => {
    expect(pdfSafe('Łódź')).toBe('?ódz'); // Ł has no decomposition; ó is Latin-1; ź folds to z
    expect(pdfSafe('ą')).toBe('a');
    expect(pdfSafe('株式会社')).toBe('????');
    expect(pdfSafe('Ship it 🚀')).toBe('Ship it ?');
  });

  it('drops invisible joiners and keeps line breaks', () => {
    expect(pdfSafe('a\u200bb\ufe0f')).toBe('ab');
    expect(pdfSafe('one\ntwo\tthree')).toBe('one\ntwo three');
    expect(pdfSafe(null)).toBe('');
  });
});
