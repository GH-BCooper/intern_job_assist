import { useState, useEffect, FormEvent, useRef } from "react";
import { X, Loader2, Upload, FileUp, Trash2, Plus } from "lucide-react";
import { toDateInput, toLocalInput } from "../lib/format";
import type {
  Application,
  ApplicationInsert,
  InterviewDate,
  InterviewLearning,
  ApplicationFiles,
} from "../lib/supabase";
import type { InterviewDraft } from "../context/DataContext";
import { useFocusTrap } from "../hooks/useFocusTrap";

type Props = {
  onClose: () => void;
  onSave: (
    data: ApplicationInsert,
    interviews: InterviewDraft[],
    learnings?: InterviewLearning,
    files?: ApplicationFiles,
  ) => Promise<void>;
  initial?: Application | null;
  /** The application's existing interview dates, so editing it does not wipe them. */
  interviewDates?: InterviewDate[];
  learnings?: InterviewLearning | null;
  /** Applied only when creating — lets the assistant open a part-filled form. */
  prefill?: Partial<ApplicationInsert> | null;
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

/** One editable interview row. `id` is set for rows that already exist. */
type InterviewInput = {
  id?: string;
  application_id: string;
  /** A `datetime-local` value, so the time of day is kept and not just the date. */
  interview_date: string;
  label: string;
  tempId: string;
  /** The stored timestamp for an existing row, kept so an untouched row is saved untouched. */
  stored?: string;
};

const formFrom = (initial?: Application | null, prefill?: Partial<ApplicationInsert> | null): ApplicationInsert => {
  if (initial) {
    return {
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
    };
  }
  if (prefill) return { ...EMPTY, date_applied: toDateInput(), ...prefill };
  return EMPTY;
};

let tempCounter = 0;
const nextTempId = () => `iv-${(tempCounter += 1)}`;

/** Row snapshot without the throwaway key, for comparing against the opening state. */
const snapshot = (
  form: ApplicationInsert,
  interviews: InterviewInput[],
  learnings: { learnings_text: string; questions_asked: string },
) =>
  JSON.stringify({
    form,
    interviews: interviews.map(({ id, interview_date, label }) => ({ id, interview_date, label })),
    learnings,
  });

export default function ApplicationForm({
  onClose,
  onSave,
  initial,
  interviewDates,
  learnings: initialLearnings,
  prefill,
}: Props) {
  // State is seeded once, from props, when the form opens. It used to be filled by
  // an effect keyed on the props, which re-ran (and wiped whatever had been typed)
  // whenever a parent re-render handed down a fresh object or the learnings
  // arrived late.
  const [form, setForm] = useState<ApplicationInsert>(() => formFrom(initial, prefill));
  const [interviews, setInterviews] = useState<InterviewInput[]>(() =>
    (interviewDates || []).map((iv) => ({
      id: iv.id,
      application_id: iv.application_id,
      interview_date: toLocalInput(iv.interview_date),
      label: iv.label,
      tempId: nextTempId(),
      stored: iv.interview_date,
    })),
  );
  const [learnings, setLearnings] = useState(() => ({
    learnings_text: initialLearnings?.learnings || "",
    questions_asked: initialLearnings?.questions_asked || "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const fileRefResume = useRef<HTMLInputElement>(null);
  const fileRefCoverLetter = useRef<HTMLInputElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  // What the form looked like on open, to tell "closed untouched" from "about to
  // throw away typing".
  const baseline = useRef(snapshot(form, interviews, learnings));
  const isDirty = () =>
    !!resumeFile || !!coverLetterFile || snapshot(form, interviews, learnings) !== baseline.current;

  const requestClose = () => {
    if (saving) return;
    if (isDirty() && !window.confirm("Discard your changes?")) return;
    onClose();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    firstFieldRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Learnings are fetched after the form opens; fill them in only if the user has
  // not started typing there.
  useEffect(() => {
    if (!initialLearnings) return;
    const loaded = {
      learnings_text: initialLearnings.learnings || "",
      questions_asked: initialLearnings.questions_asked || "",
    };
    setLearnings((prev) => (prev.learnings_text || prev.questions_asked ? prev : loaded));
    baseline.current = snapshot(form, interviews, loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLearnings?.id]);

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
          const { extractTextFromFile } = await import("../utils/pdfUtils");
          const text = await extractTextFromFile(file);
          // Add to what is there rather than silently replacing it.
          setForm((prev) => {
            const existing = String(prev[fieldKey] ?? "").trim();
            return { ...prev, [fieldKey]: existing ? existing + "\n\n" + text : text };
          });
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
        tempId: nextTempId(),
      },
    ]);
  };

  const removeInterview = (tempId: string) => {
    setInterviews((prev) => prev.filter((iv) => iv.tempId !== tempId));
  };

  const setInterview = (
    tempId: string,
    key: "label" | "interview_date",
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
    // The rows are only visible while "Interview Offered" is on, so they only
    // count then. A row with no date cannot be stored, so ask for one rather than
    // letting the write fail after the application itself has saved.
    const activeInterviews = form.interview_offered ? interviews : [];
    if (activeInterviews.some((iv) => !iv.interview_date)) {
      setError("Give every interview a date, or remove the empty row.");
      return;
    }
    setError("");
    setSaving(true);

    try {
      const finalForm = { ...form, company_name: form.company_name.trim() };
      const finalInterviews: InterviewDraft[] = activeInterviews.map((iv) => ({
        ...(iv.id ? { id: iv.id } : {}),
        application_id: iv.application_id,
        // The input only holds minutes; an untouched row keeps its exact stored
        // timestamp instead of being rewritten with the seconds cut off.
        interview_date:
          iv.stored && toLocalInput(iv.stored) === iv.interview_date
            ? iv.stored
            : new Date(iv.interview_date).toISOString(),
        label: iv.label.trim() || "Interview",
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
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[108] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit application" : "New application"}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={requestClose}
      />
      <div className="relative w-full max-w-2xl bg-light-100 dark:bg-dark-800 border border-light-300 dark:border-dark-600 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-light-300 dark:border-dark-600 flex-shrink-0">
          <h2 className="font-semibold text-light-900 dark:text-white text-lg">
            {initial ? "Edit Application" : "New Application"}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="text-light-600 dark:text-dark-400 hover:text-light-900 dark:hover:text-white transition-colors p-1 rounded"
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
            <label htmlFor="app-company" className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              id="app-company"
              ref={firstFieldRef}
              maxLength={200}
              className="input-field"
              placeholder="e.g. Google, Microsoft…"
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
            />
          </div>

          {/* Role Applied To */}
          <div>
            <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
            <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
            <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
            <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
              <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
              <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
              <label className="block text-xs font-medium text-light-600 dark:text-dark-400">
                Company Description
              </label>
              <button
                type="button"
                onClick={() => handleParseText("company_description")}
                disabled={saving}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1"
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
              <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
                    className={`w-10 h-6 rounded-full transition-colors ${form.interview_offered ? "bg-primary-500" : "bg-light-300 dark:bg-dark-600 border border-light-400 dark:border-dark-500"}`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.interview_offered ? "translate-x-4" : ""}`}
                    />
                  </div>
                </div>
                <span className="text-sm text-light-700 dark:text-dark-300 group-hover:text-light-900 dark:group-hover:text-white transition-colors">
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
                  className="text-xs bg-primary-500/10 text-primary-600 dark:text-primary-400 px-2 py-1 rounded flex items-center gap-1 hover:bg-primary-500/20 transition-colors"
                >
                  <Plus size={12} /> Add Date
                </button>
              </div>
              {interviews.map((iv) => (
                <div key={iv.tempId} className="flex gap-2">
                  <input
                    type="text"
                    aria-label="Interview label"
                    className="input-field w-28"
                    placeholder="Round 1"
                    value={iv.label}
                    onChange={(e) =>
                      setInterview(iv.tempId, "label", e.target.value)
                    }
                  />
                  <input
                    type="datetime-local"
                    aria-label={(iv.label || "Interview") + " date and time"}
                    className="input-field flex-1"
                    value={iv.interview_date}
                    onChange={(e) =>
                      setInterview(iv.tempId, "interview_date", e.target.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeInterview(iv.tempId)}
                    aria-label="Remove interview"
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
              <label className="block text-xs font-medium text-light-600 dark:text-dark-400">
                Salary Info / Questions to Ask
              </label>
              <button
                type="button"
                onClick={() => handleParseText("salary_info")}
                disabled={saving}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1"
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
              <label className="block text-xs font-medium text-light-600 dark:text-dark-400">
                Tasks to Complete / Learn for Interview
              </label>
              <button
                type="button"
                onClick={() => handleParseText("tasks_to_complete")}
                disabled={saving}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1"
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
              <label className="block text-xs font-medium text-light-600 dark:text-dark-400">
                Interview Questions
              </label>
              <button
                type="button"
                onClick={() => handleParseText("interview_questions")}
                disabled={saving}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium flex items-center gap-1"
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
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
                <label className="block text-xs font-medium text-light-600 dark:text-dark-400 mb-1.5">
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
          <button type="button" onClick={requestClose} className="btn-secondary">
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
