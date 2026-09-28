import { useEffect, useMemo, useState } from 'react';
import { Gauge, Sparkles } from 'lucide-react';
import { matchResumeToJd, matchVerdict, type MatchResult } from '../../lib/match';
import { useStore } from '../../hooks/useStore';

/**
 * Resume ↔ job-description keyword match.
 *
 * The scoring is synchronous and cheap, but it runs on every keystroke of a
 * pasted posting, so it is debounced rather than memoised on raw text.
 */
export default function MatchScore({
  jobDescription,
  onJobDescriptionChange,
  defaultResumeLabel,
}: {
  jobDescription: string;
  onJobDescriptionChange?: (value: string) => void;
  defaultResumeLabel?: string;
}) {
  const store = useStore();
  const resumes = useMemo(() => store.resumes.filter(r => r.content.trim()), [store.resumes]);
  const [resumeId, setResumeId] = useState(
    () => resumes.find(r => r.label === defaultResumeLabel)?.id || resumes[0]?.id || '',
  );
  const [debounced, setDebounced] = useState(jobDescription);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(jobDescription), 220);
    return () => window.clearTimeout(id);
  }, [jobDescription]);

  const resume = resumes.find(r => r.id === resumeId) || resumes[0];

  const result = useMemo<MatchResult | null>(() => {
    if (!resume?.content || !debounced.trim()) return null;
    return matchResumeToJd(resume.content, debounced);
  }, [resume, debounced]);

  if (!resumes.length) {
    return (
      <div className="panel p-4">
        <p className="text-sm text-light-700 dark:text-dark-200 font-medium mb-1">No resume text stored yet</p>
        <p className="text-xs text-light-600 dark:text-dark-300">
          Add a resume version with its text in Workspace → Resumes (uploading a PDF extracts it for you), then this scores
          any job description against it — entirely in your browser.
        </p>
      </div>
    );
  }

  const tone =
    !result ? 'text-light-500 dark:text-dark-400' : result.score >= 75 ? 'text-emerald-600 dark:text-emerald-400' : result.score >= 50 ? 'text-primary-600 dark:text-primary-400' : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">
          Score against
        </label>
        <select value={resumeId} onChange={e => setResumeId(e.target.value)} className="input-field !w-auto !py-1.5 !text-xs">
          {resumes.map(r => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {onJobDescriptionChange && (
        <textarea
          value={jobDescription}
          onChange={e => onJobDescriptionChange(e.target.value)}
          rows={5}
          placeholder="Paste the job description here…"
          className="input-field font-mono !text-xs leading-relaxed"
        />
      )}

      {result && (
        <div className="panel p-4 space-y-3 animate-slide-up">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <svg width="66" height="66" viewBox="0 0 66 66" className="-rotate-90">
                <circle cx="33" cy="33" r="27" fill="none" strokeWidth="6" className="stroke-light-300 dark:stroke-dark-800" />
                <circle
                  cx="33"
                  cy="33"
                  r="27"
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  className={result.score >= 75 ? 'stroke-emerald-500' : result.score >= 50 ? 'stroke-primary-500' : 'stroke-amber-500'}
                  strokeDasharray={`${(result.score / 100) * 2 * Math.PI * 27} ${2 * Math.PI * 27}`}
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-base font-bold tabular-nums ${tone}`}>
                {result.score}%
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-light-900 dark:text-white leading-snug flex items-start gap-1.5">
                <Gauge size={14} className="mt-0.5 flex-shrink-0 text-light-500 dark:text-dark-400" />
                {matchVerdict(result)}
              </p>
              <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">
                {result.jdTermCount} distinct terms in the posting · {result.similarity}% overall document similarity ·
                computed locally, nothing sent anywhere
              </p>
            </div>
          </div>

          {result.missing.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 mb-1.5">
                Missing from your resume
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.missing.map(m => (
                  <span
                    key={m.term}
                    className="badge bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                    title={`Weight ${m.weight.toFixed(2)}`}
                  >
                    {m.term}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.matched.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 mb-1.5">
                Already covered
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.matched.map(m => (
                  <span key={m.term} className="badge bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                    {m.term}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-light-500 dark:text-dark-400 flex items-start gap-1.5">
            <Sparkles size={11} className="mt-0.5 flex-shrink-0" />
            Only add a missing keyword if it is genuinely true of you. A keyword you cannot defend in the interview costs more
            than the one you left out.
          </p>
        </div>
      )}
    </div>
  );
}
