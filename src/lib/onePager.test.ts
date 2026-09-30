import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeApplication, makeEmptyStore, makeInterviewDate } from './testFixtures';

/**
 * jsPDF cannot measure or draw text in jsdom, so a small stand-in records what the
 * brief asks it to do: which strings are drawn (in order) and the file it saves.
 */
const drawn: string[] = [];
let saved = '';

vi.mock('jspdf', () => {
  class FakePdf {
    private pages = 1;
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setFillColor() {}
    setLineWidth() {}
    line() {}
    rect() {}
    addPage() {
      this.pages += 1;
    }
    setPage() {}
    getNumberOfPages() {
      return this.pages;
    }
    // Wraps at 30 characters so a long name has to become several lines.
    splitTextToSize(text: string) {
      const out: string[] = [];
      for (let i = 0; i < text.length; i += 30) out.push(text.slice(i, i + 30));
      return out.length ? out : [''];
    }
    text(value: string | string[]) {
      drawn.push(...(Array.isArray(value) ? value : [value]));
    }
    save(name: string) {
      saved = name;
    }
  }
  return { jsPDF: FakePdf };
});

const build = async (company: string, interviews = [makeInterviewDate()]) => {
  const { downloadOnePager } = await import('./onePager');
  const store = makeEmptyStore();
  await downloadOnePager({
    application: makeApplication({ company_name: company, role_applied_to: 'Backend Intern' }),
    interviews,
    store,
  });
};

describe('downloadOnePager', () => {
  beforeEach(() => {
    drawn.length = 0;
    saved = '';
  });

  it('names the file after the company, with accents folded', async () => {
    await build('Nestlé Suisse');
    expect(saved).toBe('nestle-suisse-brief.pdf');
  });

  it('never saves a file called "-brief.pdf" for a name it cannot keep', async () => {
    await build('株式会社ソニー');
    expect(saved).toBe('application-brief.pdf');
    await build('  !!! ');
    expect(saved).toBe('application-brief.pdf');
  });

  it('wraps a long company name instead of drawing one line off the page edge', async () => {
    const long = 'The International Association of Extremely Long Company Names';
    await build(long);
    // Every drawn fragment of the name fits the wrapper's width; none is the whole name.
    expect(drawn).not.toContain(long);
    expect(drawn.filter(line => long.includes(line) && line.length > 3).length).toBeGreaterThan(1);
  });

  it('lists interview rounds in date order whatever order they arrive in', async () => {
    await build('Stripe', [
      makeInterviewDate({ id: 'late', label: 'Final round', interview_date: '2026-10-20T15:00:00' }),
      makeInterviewDate({ id: 'early', label: 'Phone screen', interview_date: '2026-10-02T15:00:00' }),
    ]);
    const first = drawn.findIndex(line => line.startsWith('Phone screen'));
    const second = drawn.findIndex(line => line.startsWith('Final round'));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });
});

describe('downloadOnePager text', () => {
  beforeEach(() => {
    drawn.length = 0;
  });

  it('replaces characters the built-in PDF fonts cannot draw instead of writing garbage', async () => {
    await build('Łódź 🚀 Labs');
    const header = drawn.join('\n');
    expect(header).toContain('?ódz ? Labs');
    expect(header).not.toMatch(/[🚀Ł]/u);
  });
});
