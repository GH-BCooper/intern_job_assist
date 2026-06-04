import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  Packer,
  SectionType,
} from 'docx';
import type { Application, InterviewDate } from '../lib/supabase';

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

function appFields(app: Application, interviews: InterviewDate[] = []): Array<{ label: string; value: string }> {
  const interviewText = interviews
    .sort((a, b) => new Date(a.interview_date).getTime() - new Date(b.interview_date).getTime())
    .map(iv => `${iv.label}: ${formatDate(iv.interview_date)}`)
    .join('\n');

  return [
    { label: 'Company', value: app.company_name || '—' },
    { label: 'Response Status', value: app.response_status || '—' },
    { label: 'Final Status', value: app.final_status || '—' },
    { label: 'Date Applied', value: formatDate(app.date_applied) },
    { label: 'Interview Offered', value: app.interview_offered ? 'Yes' : 'No' },
    ...(interviewText ? [{ label: 'Interview Dates', value: interviewText }] : []),
    { label: 'Resume Used', value: app.resume_used || '—' },
    { label: 'Cover Letter Used', value: app.cover_letter_used || '—' },
    { label: 'Company Description', value: app.company_description || '—' },
    { label: 'Salary Info / Questions to Ask', value: app.salary_info || '—' },
    { label: 'Interview Questions', value: app.interview_questions || '—' },
    { label: 'Tasks to Complete / Learn for Interview', value: app.tasks_to_complete || '—' },
  ];
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function buildPDF(apps: Application[], interviewsMap: Record<string, InterviewDate[]> = {}): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;

  apps.forEach((app, idx) => {
    if (idx > 0) doc.addPage();

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

    const fields = appFields(app, interviewsMap[app.id] || []);
    fields.forEach(({ label, value }) => {
      if (y > 265) {
        doc.addPage();
        y = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), margin, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);

      const lines = doc.splitTextToSize(value, contentW);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 8;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, y - 3, pageW - margin, y - 3);
    });
  });

  return doc;
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

function appDocxSections(app: Application, interviews: InterviewDate[] = []) {
  const fields = appFields(app, interviews);
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

// ── Single App ZIP ──────────────────────────────────────────────────────────

export async function exportSingleApplicationZip(
  app: Application,
  interviews: InterviewDate[] = [],
  resumeBlob?: Blob,
  coverLetterBlob?: Blob,
  format: 'pdf' | 'docx' = 'pdf'
): Promise<void> {
  const zip = new JSZip();

  // Add main document
  if (format === 'pdf') {
    const doc = buildPDF([app], { [app.id]: interviews });
    const pdfBlob = doc.output('blob');
    zip.file(`${app.company_name.replace(/[/\\?%*:|"<>]/g, '_')}_application.pdf`, pdfBlob);
  } else {
    const doc = new Document({
      styles: {
        default: {
          document: { run: { font: 'Calibri', size: 22 } },
        },
      },
      sections: [
        {
          properties: { type: SectionType.CONTINUOUS },
          children: appDocxSections(app, interviews),
        },
      ],
    });
    const docxBlob = await Packer.toBlob(doc);
    zip.file(`${app.company_name.replace(/[/\\?%*:|"<>]/g, '_')}_application.docx`, docxBlob);
  }

  // Add files
  if (resumeBlob) {
    zip.file('resume.pdf', resumeBlob);
  }
  if (coverLetterBlob) {
    zip.file('cover_letter.pdf', coverLetterBlob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, `${app.company_name.replace(/[/\\?%*:|"<>]/g, '_')}_application.zip`);
}

// ── All Apps ZIP ────────────────────────────────────────────────────────────

export async function exportAllApplicationsZip(
  apps: Application[],
  interviewsMap: Record<string, InterviewDate[]> = {},
  fileMap: Record<string, { resume?: Blob; coverLetter?: Blob }> = {},
  format: 'pdf' | 'docx' = 'pdf'
): Promise<void> {
  if (!apps.length) return;

  const zip = new JSZip();

  for (const app of apps) {
    const companyFolder = zip.folder(app.company_name.replace(/[/\\?%*:|"<>]/g, '_')) || zip;
    const interviews = interviewsMap[app.id] || [];

    // Add main document
    if (format === 'pdf') {
      const doc = buildPDF([app], { [app.id]: interviews });
      const pdfBlob = doc.output('blob');
      companyFolder.file(`${app.company_name.replace(/[/\\?%*:|"<>]/g, '_')}_application.pdf`, pdfBlob);
    } else {
      const doc = new Document({
        styles: {
          default: {
            document: { run: { font: 'Calibri', size: 22 } },
          },
        },
        sections: [
          {
            properties: { type: SectionType.CONTINUOUS },
            children: appDocxSections(app, interviews),
          },
        ],
      });
      const docxBlob = await Packer.toBlob(doc);
      companyFolder.file(`${app.company_name.replace(/[/\\?%*:|"<>]/g, '_')}_application.docx`, docxBlob);
    }

    // Add files
    const files = fileMap[app.id];
    if (files?.resume) {
      companyFolder.file('resume.pdf', files.resume);
    }
    if (files?.coverLetter) {
      companyFolder.file('cover_letter.pdf', files.coverLetter);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, `all_applications.zip`);
}
