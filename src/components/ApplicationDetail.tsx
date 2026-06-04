import { useState, useEffect } from 'react';
import {
  X, Edit2, Trash2, Loader2, Calendar, Briefcase,
  CheckCircle, XCircle, Download, ChevronDown, FileText, Eye
} from 'lucide-react';
import type { Application, InterviewDate, InterviewLearning } from '../lib/supabase';
import { supabase, downloadFile } from '../lib/supabase';
import { exportSingleApplicationZip } from '../utils/zipExportUtils';

type Props = {
  application: Application;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
};

const RESPONSE_BADGE: Record<string, string> = {
  Pending: 'badge bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20',
  Viewed: 'badge bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20',
  Rejected: 'badge bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20',
  Shortlisted: 'badge bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20',
  Offered: 'badge bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20',
};

const FINAL_BADGE: Record<string, string> = {
  'In Progress': 'badge bg-blue-100/50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20',
  Rejected: 'badge bg-red-100/50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20',
  Accepted: 'badge bg-green-100/50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/20',
  Withdrawn: 'badge bg-gray-100 dark:bg-slate-500/10 text-gray-700 dark:text-slate-400 border border-gray-200 dark:border-slate-500/20',
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function daysRemaining(date: string): { label: string; color: string } {
  const today = new Date().setHours(0, 0, 0, 0);
  const target = new Date(date).setHours(0, 0, 0, 0);
  const diff = Math.ceil((target - today) / 86400000);

  if (diff < 0) return { label: `${Math.abs(diff)} days ago`, color: 'text-red-600 dark:text-red-400' };
  if (diff === 0) return { label: 'Today!', color: 'text-orange-600 dark:text-orange-400' };
  return { label: `${diff} days remaining`, color: 'text-green-600 dark:text-green-400' };
}

function Field({ label, value }: { label: string; value: string | boolean | null }) {
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || '—';
  if (display === '—') return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-light-600 dark:text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-light-900 dark:text-slate-200 leading-relaxed whitespace-pre-line">{display}</p>
    </div>
  );
}

export default function ApplicationDetail({ application: app, onClose, onEdit, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [interviews, setInterviews] = useState<InterviewDate[]>([]);
  const [learnings, setLearnings] = useState<InterviewLearning | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const { data: interviewsData } = await supabase
        .from('interview_dates')
        .select('*')
        .eq('application_id', app.id)
        .order('interview_date', { ascending: true });
      setInterviews(interviewsData || []);

      const { data: learningsData } = await supabase
        .from('interview_learnings')
        .select('*')
        .eq('application_id', app.id)
        .maybeSingle();
      setLearnings(learningsData);
    };
    loadData();
  }, [app.id]);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
    onClose();
  };

  const handleDownload = async (format: 'pdf' | 'docx') => {
    setExporting(format);
    try {
      let resumeBlob: Blob | undefined;
      let coverLetterBlob: Blob | undefined;

      if (app.resume_path) {
        const { data } = supabase.storage.from('applications').getPublicUrl(app.resume_path);
        if (data?.publicUrl) resumeBlob = await downloadFile(data.publicUrl) || undefined;
      }

      if (app.cover_letter_path) {
        const { data } = supabase.storage.from('applications').getPublicUrl(app.cover_letter_path);
        if (data?.publicUrl) coverLetterBlob = await downloadFile(data.publicUrl) || undefined;
      }

      await exportSingleApplicationZip(app, interviews, resumeBlob, coverLetterBlob, format);
    } finally {
      setExporting(null);
      setDownloadOpen(false);
    }
  };

  const resumeUrl = app.resume_path
    ? supabase.storage.from('applications').getPublicUrl(app.resume_path).data?.publicUrl
    : null;

  const coverLetterUrl = app.cover_letter_path
    ? supabase.storage.from('applications').getPublicUrl(app.cover_letter_path).data?.publicUrl
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-light-100 dark:bg-dark-800 border border-light-300 dark:border-dark-600 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="px-6 py-5 border-b border-light-300 dark:border-dark-600 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <Briefcase size={18} className="text-green-400" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-light-900 dark:text-white text-xl truncate">{app.company_name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <Calendar size={12} className="text-light-600 dark:text-slate-500" />
                  <span className="text-xs text-light-600 dark:text-slate-500">{formatDate(app.date_applied)}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-light-600 dark:text-slate-400 hover:text-light-900 dark:hover:text-white transition-colors p-1 rounded flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <span className={RESPONSE_BADGE[app.response_status] ?? RESPONSE_BADGE['Pending']}>
              {app.response_status}
            </span>
            <span className={FINAL_BADGE[app.final_status] ?? FINAL_BADGE['In Progress']}>
              {app.final_status}
            </span>
            {app.interview_offered ? (
              <span className="badge bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/20">
                <CheckCircle size={11} className="mr-1" /> Interview Offered
              </span>
            ) : (
              <span className="badge bg-gray-100 dark:bg-slate-500/10 text-gray-700 dark:text-slate-400 border border-gray-200 dark:border-slate-500/20">
                <XCircle size={11} className="mr-1" /> No Interview
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Files */}
          {(resumeUrl || coverLetterUrl) && (
            <div className="space-y-2 border-b border-light-300 dark:border-dark-600 pb-4">
              <p className="text-xs font-medium text-light-600 dark:text-slate-500 uppercase">Documents</p>
              <div className="flex flex-col gap-2">
                {resumeUrl && (
                  <a
                    href={resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-light-200 dark:bg-dark-700 hover:bg-light-300 dark:hover:bg-dark-600 rounded-lg transition-colors text-sm text-light-900 dark:text-white font-medium"
                  >
                    <Eye size={14} /> View Resume
                  </a>
                )}
                {coverLetterUrl && (
                  <a
                    href={coverLetterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-light-200 dark:bg-dark-700 hover:bg-light-300 dark:hover:bg-dark-600 rounded-lg transition-colors text-sm text-light-900 dark:text-white font-medium"
                  >
                    <Eye size={14} /> View Cover Letter
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Interview Dates */}
          {interviews.length > 0 && (
            <div className="space-y-2 border-b border-light-300 dark:border-dark-600 pb-4">
              <p className="text-xs font-medium text-light-600 dark:text-slate-500 uppercase">Interview Dates</p>
              <div className="space-y-1.5">
                {interviews.map(iv => {
                  const { label, color } = daysRemaining(iv.interview_date);
                  return (
                    <div key={iv.id} className="flex items-center justify-between p-2 bg-light-200 dark:bg-dark-700 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-light-900 dark:text-white">{iv.label}</p>
                        <p className="text-xs text-light-600 dark:text-slate-500">{formatDate(iv.interview_date)}</p>
                      </div>
                      <p className={`text-xs font-semibold ${color}`}>{label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-1 gap-5">
            <Field label="Role Applied To" value={app.role_applied_to} />
            <Field label="Resume Used" value={app.resume_used} />
            <Field label="Cover Letter Used" value={app.cover_letter_used} />
            <Field label="Company Description" value={app.company_description} />
            <Field label="Salary Info / Questions to Ask" value={app.salary_info} />
            <Field label="Tasks to Complete / Learn for Interview" value={app.tasks_to_complete} />
            <Field label="Interview Questions" value={app.interview_questions} />
          </div>

          {/* Interview Learnings */}
          {learnings && (learnings.learnings || learnings.questions_asked) && (
            <div className="border-t border-light-300 dark:border-dark-600 pt-4 space-y-3">
              <h3 className="font-semibold text-light-900 dark:text-white text-sm">Interview Learnings</h3>
              {learnings.learnings && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-light-600 dark:text-slate-500 uppercase">Learnings</p>
                  <p className="text-sm text-light-900 dark:text-slate-200 leading-relaxed whitespace-pre-line">{learnings.learnings}</p>
                </div>
              )}
              {learnings.questions_asked && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-light-600 dark:text-slate-500 uppercase">Questions Asked</p>
                  <p className="text-sm text-light-900 dark:text-slate-200 leading-relaxed whitespace-pre-line">{learnings.questions_asked}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-light-300 dark:border-dark-600 flex-shrink-0">
          {/* Download row */}
          <div className="relative mb-3">
            <button
              onClick={() => setDownloadOpen(v => !v)}
              disabled={exporting !== null}
              className="btn-secondary w-full justify-center"
            >
              {exporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              Download Application
              <ChevronDown size={13} className={`transition-transform ${downloadOpen ? 'rotate-180' : ''}`} />
            </button>

            {downloadOpen && (
              <div className="absolute left-0 right-0 bottom-full mb-2 bg-light-100 dark:bg-dark-900 border border-light-300 dark:border-dark-600 rounded-lg shadow-lg overflow-hidden z-40">
                <button
                  onClick={() => handleDownload('pdf')}
                  className="w-full text-left px-4 py-2 text-sm text-light-900 dark:text-slate-300 hover:bg-light-200 dark:hover:bg-dark-700 transition-colors font-medium"
                >
                  Download as PDF (ZIP)
                </button>
                <div className="border-t border-light-300 dark:border-dark-600" />
                <button
                  onClick={() => handleDownload('docx')}
                  className="w-full text-left px-4 py-2 text-sm text-light-900 dark:text-slate-300 hover:bg-light-200 dark:hover:bg-dark-700 transition-colors font-medium"
                >
                  Download as Word (ZIP)
                </button>
              </div>
            )}
          </div>

          {/* Actions row */}
          {!confirmDelete ? (
            <div className="flex items-center gap-2">
              <button onClick={onEdit} className="btn-primary flex-1">
                <Edit2 size={14} /> Edit
              </button>
              <button onClick={() => setConfirmDelete(true)} className="btn-danger flex-1">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          ) : (
            <div className="bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
              <p className="text-red-700 dark:text-red-300 text-sm mb-3 text-center">
                Delete this application? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
                  {deleting && <Loader2 size={13} className="animate-spin" />}
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
