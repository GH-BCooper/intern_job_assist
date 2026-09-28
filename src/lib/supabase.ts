import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Application = {
  id: string;
  user_id: string;
  company_name: string;
  company_description: string;
  resume_used: string;
  cover_letter_used: string;
  response_status: string;
  interview_offered: boolean;
  final_status: string;
  date_applied: string | null;
  salary_info: string;
  interview_questions: string;
  tasks_to_complete: string;
  resume_path: string;
  cover_letter_path: string;
  role_applied_to: string;
  platform_applied_on: string;
  created_at: string;
  updated_at: string;
};

export type ApplicationInsert = Omit<Application, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export type InterviewLearning = {
  id: string;
  application_id: string;
  user_id: string;
  learnings: string;
  questions_asked: string;
  created_at: string;
  updated_at: string;
};

export type InterviewLearningInsert = Omit<InterviewLearning, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export type InterviewDate = {
  id: string;
  application_id: string;
  user_id: string;
  interview_date: string;
  label: string;
  created_at: string;
};

export type InterviewDateInsert = Omit<InterviewDate, 'id' | 'user_id' | 'created_at'>;

export type ApplicationFiles = {
  resumeFile?: File | null;
  coverLetterFile?: File | null;
};

// File upload helpers
export async function uploadResumeFile(
  userId: string,
  applicationId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'pdf';
  const path = `${userId}/${applicationId}/resume.${ext}`;

  const { error } = await supabase.storage.from('applications').upload(path, file, {
    upsert: true,
  });

  if (error) return null;
  return path;
}

export async function uploadCoverLetterFile(
  userId: string,
  applicationId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'pdf';
  const path = `${userId}/${applicationId}/cover_letter.${ext}`;

  const { error } = await supabase.storage.from('applications').upload(path, file, {
    upsert: true,
  });

  if (error) return null;
  return path;
}

/** How long a signed document URL stays valid. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * A time-limited signed URL for an uploaded document.
 *
 * Resumes and cover letters routinely carry a home address and a phone number,
 * so a link that expires is a better default than a permanently public one.
 * Signed URLs are on the same free tier as public ones.
 */
export async function getSignedFileUrl(path: string, expiresIn = SIGNED_URL_TTL_SECONDS): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('applications').createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

export function getPublicFileUrl(path: string): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from('applications').getPublicUrl(path);
  return data?.publicUrl || null;
}

/**
 * Resolves a stored path to a viewable URL.
 *
 * Prefers a signed URL and falls back to the public one, so a bucket that was
 * set up as public before this change keeps working.
 */
export async function getFileUrl(path: string, opts: { signed?: boolean } = {}): Promise<string | null> {
  if (!path) return null;
  if (opts.signed !== false) {
    const signed = await getSignedFileUrl(path);
    if (signed) return signed;
  }
  return getPublicFileUrl(path);
}

/** Kept for callers that only need a URL synchronously; prefer getFileUrl. */
export function getResumeUrl(resumePath: string): string | null {
  return getPublicFileUrl(resumePath);
}

export function getCoverLetterUrl(coverLetterPath: string): string | null {
  return getPublicFileUrl(coverLetterPath);
}

/** Uploads a real file for a resume *version* (not tied to one application). */
export async function uploadResumeVersionFile(
  userId: string,
  versionId: string,
  file: File,
): Promise<{ path: string; name: string; size: number } | null> {
  const ext = file.name.split('.').pop() || 'pdf';
  const path = `${userId}/resume-versions/${versionId}.${ext}`;
  const { error } = await supabase.storage.from('applications').upload(path, file, { upsert: true });
  if (error) return null;
  return { path, name: file.name, size: file.size };
}

export async function deleteStoredFile(path: string): Promise<boolean> {
  if (!path) return true;
  const { error } = await supabase.storage.from('applications').remove([path]);
  return !error;
}

export async function downloadFile(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}
