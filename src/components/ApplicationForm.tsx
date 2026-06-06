import { useState, useEffect, FormEvent, useRef } from "react";
import { X, Loader2, Upload, FileUp, Trash2, Plus } from "lucide-react";
import type {
  Application,
  ApplicationInsert,
  InterviewDateInsert,
  InterviewLearning,
  ApplicationFiles,
} from "../lib/supabase";
import { extractTextFromFile } from "../utils/pdfUtils";

type Props = {
  onClose: () => void;
  onSave: (
    data: ApplicationInsert,
    interviews: InterviewDateInsert[],
    learnings?: InterviewLearning,
    files?: ApplicationFiles,
  ) => Promise<void>;
  initial?: Application | null;
  learnings?: InterviewLearning | null;
};

const RESPONSE_OPTIONS = [
  "Pending",
  "Viewed",
  "Rejected",
  "Shortlisted",
  "Offered",
];
const FINAL_OPTIONS = ["In Progress", "Rejected", "Accepted", "Withdrawn"];

const EMPTY: ApplicationInsert = {
  company_name: "",
  role_applied_to: "",
  company_description: "",
  resume_used: "",
  cover_letter_used: "",
  response_status: "Pending",
  interview_offered: false,
  final_status: "In Progress",
  date_applied: null,
  salary_info: "",
  interview_questions: "",
  tasks_to_complete: "",
  resume_path: "",
  cover_letter_path: "",
  platform_applied_on: "",
};

type InterviewInput = InterviewDateInsert & { tempId?: string };

export default function ApplicationForm({
  onClose,
  onSave,
  initial,
  learnings: initialLearnings,
}: Props) {
  const [form, setForm] = useState<ApplicationInsert>(EMPTY);
  const [interviews, setInterviews] = useState<InterviewInput[]>([]);
  const [learnings, setLearnings] = useState({
    learnings_text: "",
    questions_asked: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const fileRefResume = useRef<HTMLInputElement>(null);
  const fileRefCoverLetter = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initial) {
      setForm({
        company_name: initial.company_name,
        role_applied_to: initial.role_applied_to,
        company_description: initial.company_description,
        resume_used: initial.resume_used,
        cover_letter_used: initial.cover_letter_used,
        response_status: initial.response_status,
        interview_offered: initial.interview_offered,
        final_status: initial.final_status,
        date_applied: initial.date_applied,
        salary_info: initial.salary_info,
        interview_questions: initial.interview_questions,
        tasks_to_complete: initial.tasks_to_complete,
        resume_path: initial.resume_path,
        cover_letter_path: initial.cover_letter_path,
        platform_applied_on: initial.platform_applied_on,
      });
      setInterviews([]);
    }
    if (initialLearnings) {
      setLearnings({
        learnings_text: initialLearnings.learnings || "",
        questions_asked: initialLearnings.questions_asked || "",
      });
    } else if (!initial) {
      setLearnings({ learnings_text: "", questions_asked: "" });
    }
  }, [initial, initialLearnings]);

  const set = (
    key: keyof ApplicationInsert,
    value: ApplicationInsert[keyof ApplicationInsert],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setResumeFile(file);
      set("resume_used", file.name);
    }
  };

  const handleCoverLetterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverLetterFile(file);
      set("cover_letter_used", file.name);
    }
  };

  const handleParseText = async (fieldKey: keyof ApplicationInsert) => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.txt";
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (file) {
        try {
          setSaving(true);
          const text = await extractTextFromFile(file);
          set(fieldKey, text);
        } catch {
          setError("Failed to extract text from file.");
        } finally {
          setSaving(false);
        }
      }
    };
    fileInput.click();
  };

  const addInterview = () => {
    setInterviews((prev) => [
      ...prev,
      {
        application_id: initial?.id || "",
        interview_date: "",
        label: `Round ${prev.length + 1}`,
        tempId: Math.random().toString(),
      },
    ]);
  };

  const removeInterview = (tempId?: string) => {
    setInterviews((prev) => prev.filter((iv) => iv.tempId !== tempId));
  };

  const setInterview = (
    tempId: string | undefined,
    key: string,
    value: string,
  ) => {
    setInterviews((prev) =>
      prev.map((iv) => (iv.tempId === tempId ? { ...iv, [key]: value } : iv)),
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim()) {
      setError("Company name is required.");
      return;
    }
    setError("");
    setSaving(true);

    try {
      const finalForm = { ...form };
      const finalInterviews = interviews.map((iv) => ({
        application_id: iv.application_id,
        interview_date: iv.interview_date,
        label: iv.label,
      }));

      const finalLearnings: InterviewLearning = {
        id: initialLearnings?.id || "",
        application_id: initial?.id || "",
        user_id: "",
        learnings: learnings.learnings_text,
        questions_asked: learnings.questions_asked,
        created_at: initialLearnings?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await onSave(finalForm, finalInterviews, finalLearnings, {
        resumeFile,
        coverLetterFile,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-light-100 dark:bg-dark-800 border border-light-300 dark:border-dark-600 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-light-300 dark:border-dark-600 flex-shrink-0">
          <h2 className="font-semibold text-light-900 dark:text-white text-lg">
            {initial ? "Edit Application" : "New Application"}
          </h2>
          <button
            onClick={onClose}
            className="text-light-600 dark:text-slate-400 hover:text-light-900 dark:hover:text-white transition-colors p-1 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto flex-1 px-6 py-5 space-y-5"
        >
          {/* Company Name */}
          <div>
            <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              className="input-field"
              placeholder="e.g. Google, Microsoft…"
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
            />
          </div>

          {/* Role Applied To */}
          <div>
            <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
              Role Applied To
            </label>
            <input
              className="input-field"
              placeholder="e.g. Software Engineer, Product Manager…"
              value={form.role_applied_to}
              onChange={(e) => set("role_applied_to", e.target.value)}
            />
          </div>

          {/* Platform Applied On */}
          <div>
            <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
              Platform Applied On
            </label>
            <input
              className="input-field"
              placeholder="e.g. LinkedIn, Company Website, AngelList…"
              value={form.platform_applied_on}
              onChange={(e) => set("platform_applied_on", e.target.value)}
            />
          </div>

          {/* Resume Upload */}
          <div>
            <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
              Resume (PDF)
            </label>
            <div className="flex gap-2">
              <input
                ref={fileRefResume}
                type="file"
                accept=".pdf"
                onChange={handleResumeChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRefResume.current?.click()}
                className="btn-secondary flex-1 justify-center"
              >
                <Upload size={14} />
                {resumeFile?.name || form.resume_used || "Upload Resume"}
              </button>
              {resumeFile && (
                <button
                  type="button"
                  onClick={() => {
                    setResumeFile(null);
                    set("resume_used", "");
                  }}
                  className="btn-danger"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Cover Letter Upload */}
          <div>
            <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
              Cover Letter (PDF)
            </label>
            <div className="flex gap-2">
              <input
                ref={fileRefCoverLetter}
                type="file"
                accept=".pdf"
                onChange={handleCoverLetterChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRefCoverLetter.current?.click()}
                className="btn-secondary flex-1 justify-center"
              >
                <Upload size={14} />
                {coverLetterFile?.name ||
                  form.cover_letter_used ||
                  "Upload Cover Letter"}
              </button>
              {coverLetterFile && (
                <button
                  type="button"
                  onClick={() => {
                    setCoverLetterFile(null);
                    set("cover_letter_used", "");
                  }}
                  className="btn-danger"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Status row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
                Response / Status
              </label>
              <select
                className="input-field"
                value={form.response_status}
                onChange={(e) => set("response_status", e.target.value)}
              >
                {RESPONSE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
                Final Status
              </label>
              <select
                className="input-field"
                value={form.final_status}
                onChange={(e) => set("final_status", e.target.value)}
              >
                {FINAL_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Company Description with Parse */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-light-600 dark:text-slate-400">
                Company Description
              </label>
              <button
                type="button"
                onClick={() => handleParseText("company_description")}
                disabled={saving}
                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium flex items-center gap-1"
              >
                <FileUp size={12} /> Parse PDF
              </button>
            </div>
            <textarea
              className="input-field resize-none"
              rows={3}
              placeholder="Brief description of the company or role…"
              value={form.company_description}
              onChange={(e) => set("company_description", e.target.value)}
            />
          </div>

          {/* Interview Offered & Date Applied */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
                Date Applied
              </label>
              <input
                type="date"
                className="input-field"
                value={form.date_applied ?? ""}
                onChange={(e) => set("date_applied", e.target.value || null)}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.interview_offered}
                    onChange={(e) => set("interview_offered", e.target.checked)}
                  />
                  <div
                    className={`w-10 h-6 rounded-full transition-colors ${form.interview_offered ? "bg-green-500" : "bg-light-300 dark:bg-dark-600 border border-light-400 dark:border-dark-500"}`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.interview_offered ? "translate-x-4" : ""}`}
                    />
                  </div>
                </div>
                <span className="text-sm text-light-700 dark:text-slate-300 group-hover:text-light-900 dark:group-hover:text-white transition-colors">
                  Interview Offered
                </span>
              </label>
            </div>
          </div>

          {/* Interview Dates */}
          {form.interview_offered && (
            <div className="border-t border-light-300 dark:border-dark-600 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-light-900 dark:text-white text-sm">
                  Interview Dates
                </h3>
                <button
                  type="button"
                  onClick={addInterview}
                  className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1 rounded flex items-center gap-1 hover:bg-green-500/20 transition-colors"
                >
                  <Plus size={12} /> Add Date
                </button>
              </div>
              {interviews.map((iv) => (
                <div key={iv.tempId} className="flex gap-2">
                  <input
                    type="text"
                    className="input-field w-24"
                    placeholder="Round 1"
                    value={iv.label}
                    onChange={(e) =>
                      setInterview(iv.tempId, "label", e.target.value)
                    }
                  />
                  <input
                    type="date"
                    className="input-field flex-1"
                    value={iv.interview_date}
                    onChange={(e) =>
                      setInterview(iv.tempId, "interview_date", e.target.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeInterview(iv.tempId)}
                    className="btn-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Salary Info with Parse */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-light-600 dark:text-slate-400">
                Salary Info / Questions to Ask
              </label>
              <button
                type="button"
                onClick={() => handleParseText("salary_info")}
                disabled={saving}
                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium flex items-center gap-1"
              >
                <FileUp size={12} /> Parse PDF
              </button>
            </div>
            <textarea
              className="input-field resize-none"
              rows={3}
              placeholder="e.g. $45/hr, equity?, remote?…"
              value={form.salary_info}
              onChange={(e) => set("salary_info", e.target.value)}
            />
          </div>

          {/* Tasks to Complete with Parse */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-light-600 dark:text-slate-400">
                Tasks to Complete / Learn for Interview
              </label>
              <button
                type="button"
                onClick={() => handleParseText("tasks_to_complete")}
                disabled={saving}
                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium flex items-center gap-1"
              >
                <FileUp size={12} /> Parse PDF
              </button>
            </div>
            <textarea
              className="input-field resize-none"
              rows={3}
              placeholder="e.g. Study system design, practice LC mediums…"
              value={form.tasks_to_complete}
              onChange={(e) => set("tasks_to_complete", e.target.value)}
            />
          </div>

          {/* Interview Questions with Parse */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-light-600 dark:text-slate-400">
                Interview Questions
              </label>
              <button
                type="button"
                onClick={() => handleParseText("interview_questions")}
                disabled={saving}
                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium flex items-center gap-1"
              >
                <FileUp size={12} /> Parse PDF
              </button>
            </div>
            <textarea
              className="input-field resize-none"
              rows={3}
              placeholder="Note down questions asked or expected…"
              value={form.interview_questions}
              onChange={(e) => set("interview_questions", e.target.value)}
            />
          </div>

          {/* Interview Learnings Section */}
          {initial && form.interview_offered && (
            <div className="border-t border-light-300 dark:border-dark-600 pt-4 space-y-4">
              <h3 className="font-semibold text-light-900 dark:text-white text-sm">
                Interview Learnings (Post-Interview)
              </h3>

              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
                  Learnings from Interview
                </label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  placeholder="What did you learn? Skills asked about, company culture insights, etc.…"
                  value={learnings.learnings_text}
                  onChange={(e) =>
                    setLearnings((prev) => ({
                      ...prev,
                      learnings_text: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-light-600 dark:text-slate-400 mb-1.5">
                  Questions They Asked
                </label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  placeholder="List the questions you were asked during the interview…"
                  value={learnings.questions_asked}
                  onChange={(e) =>
                    setLearnings((prev) => ({
                      ...prev,
                      questions_asked: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-4 py-2">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-light-300 dark:border-dark-600 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? "Saving…" : initial ? "Save Changes" : "Add Application"}
          </button>
        </div>
      </div>
    </div>
  );
}
