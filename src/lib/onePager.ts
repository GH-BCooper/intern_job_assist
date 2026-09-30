/**
 * The single-page application brief, built with the jsPDF already in the stack.
 *
 * Everything you want in front of you walking into an on-site: company, role,
 * dates, contacts, your own notes and the questions you meant to ask.
 */

import type { Application, InterviewDate } from './supabase';
import type { Contact, Note, StoreShape, Task } from './store';
import { stageOf } from './insights';
import { fmtDate, fmtDateTime, ts } from './format';
import { pdfSafe } from './pdfText';

type PageState = { y: number; page: number };

const MARGIN = 46;
const WIDTH = 595.28; // A4 portrait, points
const HEIGHT = 841.89;
const CONTENT = WIDTH - MARGIN * 2;

export type OnePagerInput = {
  application: Application;
  interviews: InterviewDate[];
  store: Pick<StoreShape, 'stageOverrides' | 'notes' | 'contacts' | 'tasks' | 'applicationTags' | 'tags' | 'priorities' | 'referrals'>;
  ownerName?: string;
};

/** Generates the PDF and hands the browser a download. */
export async function downloadOnePager(input: OnePagerInput): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const app = input.application;
  const state: PageState = { y: MARGIN, page: 1 };

  const ensure = (needed: number) => {
    if (state.y + needed <= HEIGHT - MARGIN) return;
    doc.addPage();
    state.page += 1;
    state.y = MARGIN;
  };

  const rule = () => {
    ensure(14);
    doc.setDrawColor(235, 226, 210);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, state.y, WIDTH - MARGIN, state.y);
    state.y += 16;
  };

  const heading = (text: string) => {
    // Room for the heading and at least a couple of lines, so it is never stranded
    // alone at the foot of a page with its content on the next.
    ensure(46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(150, 130, 105);
    doc.text(pdfSafe(text).toUpperCase(), MARGIN, state.y);
    state.y += 15;
    doc.setTextColor(35, 28, 17);
  };

  const body = (text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) => {
    if (!text) return;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    const lines = doc.splitTextToSize(pdfSafe(text), CONTENT) as string[];
    lines.forEach(line => {
      ensure(14);
      doc.text(line, MARGIN, state.y);
      state.y += (opts.size ?? 10) + 3.5;
    });
    state.y += opts.gap ?? 6;
  };

  const kv = (pairs: [string, string][]) => {
    const visible = pairs.filter(([, v]) => v && v !== '—');
    visible.forEach(([label, value]) => {
      ensure(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(124, 104, 81);
      doc.text(pdfSafe(label), MARGIN, state.y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(35, 28, 17);
      const lines = doc.splitTextToSize(pdfSafe(value), CONTENT - 130) as string[];
      lines.forEach((line, i) => {
        if (i > 0) {
          ensure(13);
          state.y += 13;
        }
        doc.text(line, MARGIN + 130, state.y);
      });
      state.y += 16;
    });
    state.y += 2;
  };

  /* ------------------------------- header ------------------------------- */

  doc.setFillColor(251, 146, 60);
  doc.rect(0, 0, WIDTH, 5, 'F');

  state.y = MARGIN + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(35, 28, 17);
  // Long names are wrapped: a single unwrapped line ran off the right edge of the page.
  (doc.splitTextToSize(pdfSafe(app.company_name) || 'Application', CONTENT) as string[]).slice(0, 3).forEach(line => {
    doc.text(line, MARGIN, state.y);
    state.y += 26;
  });
  state.y -= 4;

  if (app.role_applied_to) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12.5);
    doc.setTextColor(124, 104, 81);
    (doc.splitTextToSize(pdfSafe(app.role_applied_to), CONTENT) as string[]).slice(0, 3).forEach(line => {
      doc.text(line, MARGIN, state.y);
      state.y += 16;
    });
    state.y += 2;
  }

  const stage = stageOf(app, input.store.stageOverrides);
  doc.setFontSize(9.5);
  doc.setTextColor(150, 130, 105);
  doc.text(
    doc.splitTextToSize(pdfSafe([stage, app.response_status, app.platform_applied_on].filter(Boolean).join('  ·  ')), CONTENT) as string[],
    MARGIN,
    state.y,
  );
  state.y += 14;
  rule();

  /* -------------------------------- facts -------------------------------- */

  const tagNames = input.store.applicationTags
    .filter(at => at.application_id === app.id)
    .map(at => input.store.tags.find(t => t.id === at.tag_id)?.name)
    .filter(Boolean)
    .join(', ');

  const referrer = input.store.referrals[app.id]
    ? input.store.contacts.find(c => c.id === input.store.referrals[app.id])?.name || ''
    : '';

  const priority = input.store.priorities[app.id];

  heading('The facts');
  kv([
    ['Applied', fmtDate(app.date_applied)],
    ['Stage', stage],
    ['Response', app.response_status || '—'],
    ['Outcome', app.final_status || '—'],
    ['Platform', app.platform_applied_on || '—'],
    ['Compensation', app.salary_info || '—'],
    ['Resume used', app.resume_used || '—'],
    ['Cover letter', app.cover_letter_used || '—'],
    ['Referred by', referrer],
    ['Priority', priority ? `${priority}/5` : ''],
    ['Tags', tagNames],
  ]);

  /* ------------------------------ interviews ------------------------------ */

  if (input.interviews.length) {
    heading('Interview rounds');
    [...input.interviews]
      .sort((a, b) => ts(a.interview_date) - ts(b.interview_date))
      .forEach(iv => {
        body(`${iv.label || 'Interview'} — ${fmtDateTime(iv.interview_date)}`, { gap: 2 });
      });
    state.y += 6;
  }

  /* -------------------------------- company -------------------------------- */

  if (app.company_description) {
    heading('About the company');
    body(app.company_description);
  }

  /* -------------------------------- prep -------------------------------- */

  if (app.interview_questions) {
    heading('Questions to expect');
    body(app.interview_questions);
  }

  if (app.tasks_to_complete) {
    heading('Take-home / tasks');
    body(app.tasks_to_complete);
  }

  const openTasks: Task[] = input.store.tasks.filter(t => t.application_id === app.id && !t.done);
  if (openTasks.length) {
    heading('Still to do');
    openTasks.forEach(t => body(`•  ${t.title}${t.due_at ? `  (due ${fmtDate(t.due_at)})` : ''}`, { gap: 1 }));
    state.y += 6;
  }

  /* ------------------------------- contacts ------------------------------- */

  const contacts: Contact[] = input.store.contacts.filter(c => c.application_id === app.id);
  if (contacts.length) {
    heading('Who you know here');
    contacts.forEach(c => {
      body(
        [c.name, c.role, c.email, c.phone].filter(Boolean).join('  ·  '),
        { gap: 1 },
      );
      if (c.notes) body(c.notes, { size: 9, gap: 3 });
    });
    state.y += 4;
  }

  /* --------------------------------- notes --------------------------------- */

  const notes: Note[] = input.store.notes.filter(n => n.application_id === app.id).slice(0, 8);
  if (notes.length) {
    heading('Your notes');
    notes.forEach(n => {
      body(n.body, { gap: 2 });
    });
  }

  /* -------------------------------- footer -------------------------------- */

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(170, 155, 135);
    doc.text(
      pdfSafe(`${input.ownerName ? `${input.ownerName} · ` : ''}InternTrack brief · ${fmtDate(new Date().toISOString())}`),
      MARGIN,
      HEIGHT - 24,
    );
    if (pages > 1) doc.text(`${i} / ${pages}`, WIDTH - MARGIN, HEIGHT - 24, { align: 'right' });
  }

  // Accents are folded ("Nestlé" → nestle) and stray dashes trimmed, so a name in a script
  // the pattern cannot keep no longer produces a file called "-brief.pdf".
  const safe =
    (app.company_name || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'application';
  doc.save(`${safe}-brief.pdf`);
}
