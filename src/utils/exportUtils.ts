import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  Packer,
  AlignmentType,
  SectionType,
} from 'docx';
import type { Application } from '../lib/supabase';

const STATUS_LABELS: Record<string, string> = {
  response_status: 'Response Status',
  final_status: 'Final Status',
  company_name: 'Company',
  company_description: 'Company Description',
  resume_used: 'Resume Used',
  cover_letter_used: 'Cover Letter Used',
  interview_offered: 'Interview Offered',
  date_applied: 'Date Applied',
  salary_info: 'Salary Info / Questions to Ask',
  interview_questions: 'Interview Questions',
  tasks_to_complete: 'Tasks to Complete / Learn for Interview',
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return d;
  }
}

function appFields(app: Application): Array<{ label: string; value: string }> {
  return [
    { label: 'Company', value: app.company_name || '—' },
    { label: 'Response Status', value: app.response_status || '—' },
    { label: 'Final Status', value: app.final_status || '—' },
    { label: 'Date Applied', value: formatDate(app.date_applied) },
    { label: 'Interview Offered', value: app.interview_offered ? 'Yes' : 'No' },
    { label: 'Resume Used', value: app.resume_used || '—' },
    { label: 'Cover Letter Used', value: app.cover_letter_used || '—' },
    { label: 'Company Description', value: app.company_description || '—' },
    { label: 'Salary Info / Questions to Ask', value: app.salary_info || '—' },
    { label: 'Interview Questions', value: app.interview_questions || '—' },
    { label: 'Tasks to Complete / Learn for Interview', value: app.tasks_to_complete || '—' },
  ];
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function buildPDF(apps: Application[], title: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;

  apps.forEach((app, idx) => {
    if (idx > 0) doc.addPage();

    // Header band
    doc.setFillColor(13, 27, 46);
    doc.rect(0, 0, pageW, 40, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(34, 197, 94);
    doc.text('InternTrack', margin, 16);

    doc.setFontSize(13);
    doc.setTextColor(248, 250, 252);
    doc.text(app.company_name, margin, 28);

    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`Exported ${new Date().toLocaleDateString()}`, pageW - margin, 28, { align: 'right' });

    let y = 52;

    const fields = appFields(app);
    fields.forEach(({ label, value }) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }

      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), margin, y);
      y += 5;

      // Value
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);

      const lines = doc.splitTextToSize(value, contentW);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 8;

      // Divider
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, y - 3, pageW - margin, y - 3);
    });
  });

  return doc;
}

export function exportSinglePDF(app: Application): void {
  const doc = buildPDF([app], app.company_name);
  doc.save(`${app.company_name.replace(/\s+/g, '_')}_application.pdf`);
}

export function exportAllPDF(apps: Application[]): void {
  if (!apps.length) return;
  const doc = buildPDF(apps, 'All Applications');
  doc.save('all_applications.pdf');
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

function appDocxSections(app: Application) {
  const fields = appFields(app);
  const children: Paragraph[] = [
    new Paragraph({
      text: app.company_name,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Exported: ${new Date().toLocaleDateString()}`,
          color: '94A3B8',
          size: 18,
        }),
      ],
      spacing: { after: 400 },
    }),
  ];

  fields.forEach(({ label, value }) => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 20, color: '334155' })],
        spacing: { before: 200, after: 60 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
        },
      }),
      new Paragraph({
        children: [new TextRun({ text: value, size: 22, color: '1E293B' })],
        spacing: { after: 240 },
      })
    );
  });

  return children;
}

export async function exportSingleDocx(app: Application): Promise<void> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [
      {
        properties: { type: SectionType.CONTINUOUS },
        children: appDocxSections(app),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${app.company_name.replace(/\s+/g, '_')}_application.docx`);
}

export async function exportAllDocx(apps: Application[]): Promise<void> {
  if (!apps.length) return;

  const sections = apps.map((app, idx) => ({
    properties: {
      type: idx === 0 ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE,
    },
    children: appDocxSections(app),
  }));

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections,
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'all_applications.docx');
}
