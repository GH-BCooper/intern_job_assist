import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Packer } from "docx";
import type {
  Application,
  InterviewDate,
  InterviewLearning,
} from "../lib/supabase";
import { buildDocx, buildPDF, type LearningsMap } from "./applicationDocument";

type FileMapEntry = {
  resume?: Blob;
  coverLetter?: Blob;
  resumeName?: string;
  coverLetterName?: string;
};

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

async function buildDocxBlob(
  app: Application,
  interviews: InterviewDate[] = [],
  learnings?: InterviewLearning | null,
) {
  return Packer.toBlob(
    buildDocx([app], { [app.id]: interviews }, { [app.id]: learnings }),
  );
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
  const taken = new Set<string>();

  /**
   * A folder name no other application has claimed.
   *
   * Two roles at one company (or applying twice) shared the same folder and file
   * name, so the second silently overwrote the first — an application missing
   * from a backup with no warning. The role tells them apart; a counter is the
   * last resort.
   */
  const uniqueName = (app: Application): string => {
    const base = sanitizeFileName(app.company_name, "application");
    const candidates = [
      base,
      app.role_applied_to ? sanitizeFileName(`${base} - ${app.role_applied_to}`, base) : "",
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (!taken.has(candidate.toLowerCase())) {
        taken.add(candidate.toLowerCase());
        return candidate;
      }
    }
    for (let n = 2; ; n += 1) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate.toLowerCase())) {
        taken.add(candidate.toLowerCase());
        return candidate;
      }
    }
  };

  for (const app of apps) {
    const companyName = uniqueName(app);
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
