import { useEffect, useState } from 'react';
import { ClipboardPaste, Loader2, Sparkles, X } from 'lucide-react';
import { useAI } from '../context/AIContext';
import { useData } from '../context/DataContext';
import { findDuplicates } from '../lib/duplicates';
import { emitDeferrable, toast } from '../lib/uiBus';

/**
 * "Paste a job posting, get a filled form."
 *
 * Scout could already do this conversationally; this is the one-click version.
 * It deliberately opens the prefilled form instead of saving a record, so
 * nothing is written on the model's word alone.
 */
export default function QuickAdd({ initialText = '', onClose }: { initialText?: string; onClose: () => void }) {
  const { quickAddFromText, configured, providerLabel } = useAI();
  const { applications } = useData();
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const fields = await quickAddFromText(trimmed);
      if (!fields.company_name) {
        setError('I could not find a company name in that text. Paste a bit more of the posting, or add it by hand.');
        return;
      }
      const dupes = findDuplicates(
        { company_name: fields.company_name, role_applied_to: fields.role_applied_to },
        applications,
      );
      onClose();
      emitDeferrable({ type: 'new-application', prefill: fields });
      if (dupes.length) {
        toast(
          `Heads up — you already track ${dupes[0].application.company_name}${
            dupes[0].application.role_applied_to ? ` (${dupes[0].application.role_applied_to})` : ''
          }.`,
          'info',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try pasting less, or add it by hand.');
    } finally {
      setBusy(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) setText(clip);
    } catch {
      toast('Your browser blocked clipboard access — paste with ⌘V instead.', 'info');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-[8vh] animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Quick add from pasted text"
    >
      <div className="w-full max-w-xl card p-5 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-semibold text-light-900 dark:text-white flex items-center gap-2">
              <Sparkles size={16} className="text-primary-500" /> Quick add from a posting
            </h2>
            <p className="text-xs text-light-600 dark:text-dark-300 mt-0.5">
              Paste the job description. Scout extracts the fields and opens the form for you to check.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost btn-icon" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {!configured ? (
          <p className="panel p-4 text-sm text-light-700 dark:text-dark-200">
            This needs a free AI key. Add one in Settings → Assistant, then come back — everything else in the app works
            without it.
          </p>
        ) : (
          <>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run();
              }}
              rows={10}
              autoFocus
              placeholder="Paste the whole posting — title, company, responsibilities, everything…"
              className="input-field font-mono !text-xs leading-relaxed"
            />

            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => void run()} disabled={busy || !text.trim()} className="btn-primary flex-1">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {busy ? 'Reading the posting…' : 'Extract the fields'}
              </button>
              <button onClick={() => void pasteFromClipboard()} className="btn-secondary" title="Paste from clipboard">
                <ClipboardPaste size={15} />
              </button>
            </div>
            <p className="text-[11px] text-light-500 dark:text-dark-400 mt-2">
              {providerLabel} · ⌘↵ to run · nothing is saved until you submit the form
            </p>
          </>
        )}
      </div>
    </div>
  );
}
