import { saveAs } from 'file-saver';
import { Packer } from 'docx';
import type { Application, InterviewDate, InterviewLearning } from '../lib/supabase';
import { buildDocx, buildPDF, type InterviewsMap, type LearningsMap } from './applicationDocument';

/** `Acme_Corp` for a file name: spaces joined, and the characters no file system accepts replaced. */
function fileStem(name: string): string {
  const stem = (name || '').trim().replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_');
  return stem || 'application';
}

export function exportSinglePDF(app: Application, interviews: InterviewDate[] = [], learnings?: InterviewLearning | null): void {
  const doc = buildPDF([app], { [app.id]: interviews }, { [app.id]: learnings });
  doc.save(`${fileStem(app.company_name)}_application.pdf`);
}

export function exportAllPDF(apps: Application[], interviewsMap: InterviewsMap = {}, learningsMap: LearningsMap = {}): void {
  if (!apps.length) return;
  buildPDF(apps, interviewsMap, learningsMap).save('all_applications.pdf');
}

export async function exportSingleDocx(
  app: Application,
  interviews: InterviewDate[] = [],
  learnings?: InterviewLearning | null,
): Promise<void> {
  const blob = await Packer.toBlob(buildDocx([app], { [app.id]: interviews }, { [app.id]: learnings }));
  saveAs(blob, `${fileStem(app.company_name)}_application.docx`);
}

export async function exportAllDocx(
  apps: Application[],
  interviewsMap: InterviewsMap = {},
  learningsMap: LearningsMap = {},
): Promise<void> {
  if (!apps.length) return;
  const blob = await Packer.toBlob(buildDocx(apps, interviewsMap, learningsMap));
  saveAs(blob, 'all_applications.docx');
}
