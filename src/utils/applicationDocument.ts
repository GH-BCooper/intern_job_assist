/**
 * The one place an application becomes a PDF page or a Word document.
 *
 * `exportUtils` (the detail-page "Export PDF" button and the assistant's export tool)
 * and `zipExportUtils` (the bundles) each carried their own copy of this. The copies
 * had drifted: the single-PDF export left out the role, platform, interview dates and
 * learnings, and both PDF writers drew a long field in one call, so anything past the
 * bottom of the page — a long list of interview questions, say — was silently lost.
 */

import jsPDF from 'jspdf';
import { AlignmentType, BorderStyle, Document, HeadingLevel, Paragraph, SectionType, TextRun } from 'docx';
import type { Application, InterviewDate, InterviewLearning } from '../lib/supabase';
import { fmtLongDate, parseDate, ts } from '../lib/format';
import { pdfSafe } from '../lib/pdfText';

export type LearningsMap = Record<string, InterviewLearning | null | undefined>;
export type InterviewsMap = Record<string, InterviewDate[] | undefined>;

const EMPTY = '-';

/** "October 2, 2026, 3:00 PM"; a date with no time of day (midnight) prints without one. */
function formatWhen(value: string | null): string {
  const d = parseDate(value);
  if (!d) return EMPTY;
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return hasTime
    ? d.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : fmtLongDate(value, EMPTY);
}

export function appFields(
  app: Application,
  interviews: InterviewDate[] = [],
  learnings?: InterviewLearning | null,
): Array<{ label: string; value: string }> {
  const interviewText = [...interviews]
    .sort((a, b) => ts(a.interview_date) - ts(b.interview_date))
    .map(iv => `${iv.label || 'Interview'}: ${formatWhen(iv.interview_date)}`)
    .join('\n');

  return [
    { label: 'Company', value: app.company_name || EMPTY },
    { label: 'Role Applied To', value: app.role_applied_to || EMPTY },
    { label: 'Platform Applied On', value: app.platform_applied_on || EMPTY },
    { label: 'Response Status', value: app.response_status || EMPTY },
    { label: 'Final Status', value: app.final_status || EMPTY },
    { label: 'Date Applied', value: fmtLongDate(app.date_applied, EMPTY) },
    { label: 'Interview Offered', value: app.interview_offered ? 'Yes' : 'No' },
    ...(interviewText ? [{ label: 'Interview Dates', value: interviewText }] : []),
    { label: 'Resume Used', value: app.resume_used || EMPTY },
    { label: 'Cover Letter Used', value: app.cover_letter_used || EMPTY },
    { label: 'Company Description', value: app.company_description || EMPTY },
    { label: 'Salary Info / Questions to Ask', value: app.salary_info || EMPTY },
    { label: 'Interview Questions', value: app.interview_questions || EMPTY },
    { label: 'Tasks to Complete / Learn for Interview', value: app.tasks_to_complete || EMPTY },
    ...(learnings?.learnings ? [{ label: 'Interview Learnings', value: learnings.learnings }] : []),
    ...(learnings?.questions_asked ? [{ label: 'Questions Asked', value: learnings.questions_asked }] : []),
  ];
}

/* --------------------------------- PDF --------------------------------- */

export function buildPDF(
  apps: Application[],
  interviewsMap: InterviewsMap = {},
  learningsMap: LearningsMap = {},
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  const footerY = pageH - 12;
  // Lowest baseline a line may sit on; the footer lives below it.
  const bottom = pageH - 24;

  const addFooter = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text(`© ${new Date().getFullYear()} Made with love by Brett Cooper`, pageW / 2, footerY, { align: 'center' });
  };

  const valueStyle = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
  };

  apps.forEach((app, idx) => {
    if (idx > 0) doc.addPage();

    doc.setFillColor(13, 27, 46);
    doc.rect(0, 0, pageW, 40, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(34, 197, 94);
    doc.text('InternTrack', margin, 16);

    // A long name is wrapped (two lines at most, clear of the date) instead of running off the page.
    doc.setFontSize(13);
    doc.setTextColor(248, 250, 252);
    const nameLines = doc.splitTextToSize(pdfSafe(app.company_name), contentW - 48) as string[];
    doc.text(nameLines.slice(0, 2), margin, 26);

    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`Exported ${new Date().toLocaleDateString()}`, pageW - margin, 26, { align: 'right' });

    let y = 52;
    const fields = appFields(app, interviewsMap[app.id] || [], learningsMap[app.id]);

    fields.forEach(({ label, value }) => {
      // The label and at least one line of its value stay together.
      if (y + 11 > bottom) {
        addFooter();
        doc.addPage();
        y = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafe(label).toUpperCase(), margin, y);
      y += 5;

      valueStyle();
      const lines = doc.splitTextToSize(pdfSafe(value), contentW) as string[];
      lines.forEach(line => {
        // jsPDF never paginates: a field drawn in one call simply ran off the page.
        if (y > bottom) {
          addFooter();
          doc.addPage();
          y = 20;
          valueStyle();
        }
        doc.text(line, margin, y);
        y += 5;
      });
      y += 3;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, y - 3, pageW - margin, y - 3);
      y += 5;
    });

    addFooter();
  });

  return doc;
}

/* -------------------------------- Word -------------------------------- */

/** A run per line with real line breaks; `TextRun` alone collapses "\n" into a space. */
function docTextRuns(value: string): TextRun[] {
  return value.split('\n').map(
    (line, index) =>
      new TextRun({
        text: line || ' ',
        break: index === 0 ? 0 : 1,
        size: 22,
        color: '1E293B',
      }),
  );
}

function appDocxSections(app: Application, interviews: InterviewDate[], learnings?: InterviewLearning | null) {
  const children: Paragraph[] = [
    new Paragraph({ text: app.company_name, heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
    new Paragraph({
      children: [new TextRun({ text: `Exported: ${new Date().toLocaleDateString()}`, color: '94A3B8', size: 18 })],
      spacing: { after: 400 },
    }),
  ];

  appFields(app, interviews, learnings).forEach(({ label, value }) => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 20, color: '334155' })],
        spacing: { before: 200, after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' } },
      }),
      new Paragraph({ children: docTextRuns(value), spacing: { after: 240 } }),
    );
  });

  children.push(
    new Paragraph({
      text: '',
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' } },
    }),
    new Paragraph({
      children: [new TextRun({ text: `© ${new Date().getFullYear()} Made with love by Brett Cooper`, size: 18 })],
      spacing: { before: 200 },
      alignment: AlignmentType.CENTER,
    }),
  );

  return children;
}

/** One Word document holding every application, each starting on its own page. */
export function buildDocx(
  apps: Application[],
  interviewsMap: InterviewsMap = {},
  learningsMap: LearningsMap = {},
): Document {
  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: apps.map((app, idx) => ({
      properties: { type: idx === 0 ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE },
      children: appDocxSections(app, interviewsMap[app.id] || [], learningsMap[app.id]),
    })),
  });
}
