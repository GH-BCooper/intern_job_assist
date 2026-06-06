import JSZip from "jszip";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  BorderStyle,
  Packer,
  SectionType,
  Footer,
  AlignmentType,
} from "docx";
import type {
  Application,
  InterviewDate,
  InterviewLearning,
} from "../lib/supabase";

type LearningsMap = Record<string, InterviewLearning | null | undefined>;

type FileMapEntry = {
  resume?: Blob;
  coverLetter?: Blob;
  resumeName?: string;
  coverLetterName?: string;
};

function formatDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function sanitizeFileName(value: string, fallback = "file"): string {
  const cleaned = value.trim().replace(/[/\\?%*:|"<>]/g, "_");
  return cleaned || fallback;
}

function attachmentName(
  preferredName: string | undefined,
  fallbackName: string,
): string {
  return sanitizeFileName(preferredName || fallbackName, fallbackName);
}

function docTextRuns(value: string): TextRun[] {
  return value.split("\n").map(
    (line, index) =>
      new TextRun({
        text: line || " ",
        break: index === 0 ? 0 : 1,
        size: 22,
        color: "1E293B",
      }),
  );
}

function appFields(
  app: Application,
  interviews: InterviewDate[] = [],
  learnings?: InterviewLearning | null,
): Array<{ label: string; value: string }> {
  const interviewText = [...interviews]
    .sort(
      (a, b) =>
        new Date(a.interview_date).getTime() -
        new Date(b.interview_date).getTime(),
    )
    .map((iv) => `${iv.label}: ${formatDate(iv.interview_date)}`)
    .join("\n");

  return [
    { label: "Company", value: app.company_name || "-" },
    { label: "Role Applied To", value: app.role_applied_to || "-" },
    { label: "Platform Applied On", value: app.platform_applied_on || "-" },
    { label: "Response Status", value: app.response_status || "-" },
    { label: "Final Status", value: app.final_status || "-" },
    { label: "Date Applied", value: formatDate(app.date_applied) },
    { label: "Interview Offered", value: app.interview_offered ? "Yes" : "No" },
    ...(interviewText
      ? [{ label: "Interview Dates", value: interviewText }]
      : []),
    { label: "Resume Used", value: app.resume_used || "-" },
    { label: "Cover Letter Used", value: app.cover_letter_used || "-" },
    { label: "Company Description", value: app.company_description || "-" },
    { label: "Salary Info / Questions to Ask", value: app.salary_info || "-" },
    { label: "Interview Questions", value: app.interview_questions || "-" },
    {
      label: "Tasks to Complete / Learn for Interview",
      value: app.tasks_to_complete || "-",
    },
    ...(learnings?.learnings
      ? [{ label: "Interview Learnings", value: learnings.learnings }]
      : []),
    ...(learnings?.questions_asked
      ? [{ label: "Questions Asked", value: learnings.questions_asked }]
      : []),
  ];
}

function buildPDF(
  apps: Application[],
  interviewsMap: Record<string, InterviewDate[]> = {},
  learningsMap: LearningsMap = {},
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  const footerY = pageH - 12;

  const addFooter = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text(
      `© ${new Date().getFullYear()} Made with love by Brett Cooper`,
      pageW / 2,
      footerY,
      { align: 'center' }
    );
  };

  apps.forEach((app, idx) => {
    if (idx > 0) doc.addPage();

    doc.setFillColor(13, 27, 46);
    doc.rect(0, 0, pageW, 40, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(34, 197, 94);
    doc.text("InternTrack", margin, 16);

    doc.setFontSize(13);
    doc.setTextColor(248, 250, 252);
    doc.text(app.company_name, margin, 28);

    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Exported ${new Date().toLocaleDateString()}`,
      pageW - margin,
      28,
      { align: "right" },
    );

    let y = 52;
    const fields = appFields(
      app,
      interviewsMap[app.id] || [],
      learningsMap[app.id],
    );

    fields.forEach(({ label, value }) => {
      if (y > 260) {
        addFooter();
        doc.addPage();
        y = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), margin, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);

      const lines = doc.splitTextToSize(value, contentW);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 8;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, y - 3, pageW - margin, y - 3);
    });

    addFooter();
  });

  return doc;
}

function appDocxSections(
  app: Application,
  interviews: InterviewDate[] = [],
  learnings?: InterviewLearning | null,
) {
  const fields = appFields(app, interviews, learnings);
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
          color: "94A3B8",
          size: 18,
        }),
      ],
      spacing: { after: 400 },
    }),
  ];

  fields.forEach(({ label, value }) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: label, bold: true, size: 20, color: "334155" }),
        ],
        spacing: { before: 200, after: 60 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
        },
      }),
      new Paragraph({
        children: docTextRuns(value),
        spacing: { after: 240 },
      }),
    );
  });

  return children;
}

async function buildDocxBlob(
  app: Application,
  interviews: InterviewDate[] = [],
  learnings?: InterviewLearning | null,
) {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `© ${new Date().getFullYear()} Made with love by Brett Cooper`,
                      size: 18,
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 100 },
                }),
              ],
            }),
          },
        },
        children: appDocxSections(app, interviews, learnings),
      },
    ],
  });

  return Packer.toBlob(doc);
}

function addAttachmentFiles(zip: JSZip, files: FileMapEntry = {}) {
  if (files.resume) {
    zip.file(attachmentName(files.resumeName, "resume.pdf"), files.resume);
  }
  if (files.coverLetter) {
    zip.file(
      attachmentName(files.coverLetterName, "cover_letter.pdf"),
      files.coverLetter,
    );
  }
}

export async function exportSingleApplicationZip(
  app: Application,
  interviews: InterviewDate[] = [],
  learnings?: InterviewLearning | null,
  files: FileMapEntry = {},
): Promise<void> {
  const zip = new JSZip();
  const companyName = sanitizeFileName(app.company_name, "application");

  const pdfBlob = buildPDF(
    [app],
    { [app.id]: interviews },
    { [app.id]: learnings },
  ).output("blob");
  zip.file(`${companyName}_application.pdf`, pdfBlob);

  const docxBlob = await buildDocxBlob(app, interviews, learnings);
  zip.file(`${companyName}_application.docx`, docxBlob);

  addAttachmentFiles(zip, files);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `${companyName}_application.zip`);
}

export async function exportAllApplicationsZip(
  apps: Application[],
  interviewsMap: Record<string, InterviewDate[]> = {},
  learningsMap: LearningsMap = {},
  fileMap: Record<string, FileMapEntry> = {},
  format: "pdf" | "docx" = "pdf",
): Promise<void> {
  if (!apps.length) return;

  const zip = new JSZip();

  for (const app of apps) {
    const companyName = sanitizeFileName(app.company_name, "application");
    const companyFolder = zip.folder(companyName) || zip;
    const interviews = interviewsMap[app.id] || [];
    const learnings = learningsMap[app.id];

    if (format === "pdf") {
      const pdfBlob = buildPDF(
        [app],
        { [app.id]: interviews },
        { [app.id]: learnings },
      ).output("blob");
      companyFolder.file(`${companyName}_application.pdf`, pdfBlob);
    } else {
      const docxBlob = await buildDocxBlob(app, interviews, learnings);
      companyFolder.file(`${companyName}_application.docx`, docxBlob);
    }

    addAttachmentFiles(companyFolder, fileMap[app.id]);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, "all_applications.zip");
}
