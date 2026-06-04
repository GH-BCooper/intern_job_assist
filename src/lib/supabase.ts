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

export function getResumeUrl(resumePath: string): string | null {
  if (!resumePath) return null;
  const { data } = supabase.storage.from('applications').getPublicUrl(resumePath);
  return data?.publicUrl || null;
}

export function getCoverLetterUrl(coverLetterPath: string): string | null {
  if (!coverLetterPath) return null;
  const { data } = supabase.storage.from('applications').getPublicUrl(coverLetterPath);
  return data?.publicUrl || null;
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
