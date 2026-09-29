import { useState, useRef, useEffect } from 'react';
import { ChevronDown, FileText, FileDown, FileJson, FileSpreadsheet, Loader2, Download } from 'lucide-react';
import type { Application } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useData } from '../context/DataContext';
import { downloadText, toCsv } from '../lib/ai/tools';
import { toast } from '../lib/uiBus';

type Props = {
  applications: Application[];
};

type FileEntry = { resume?: Blob; coverLetter?: Blob; resumeName?: string; coverLetterName?: string };

/** Downloads a few at a time: one-by-one was slow, all at once trips rate limits. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export default function PrintAllButton({ applications }: Props) {
  const { interviewsMap, learningsMap } = useData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'docx' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const loadAllFiles = async () => {
    const fileMap: Record<string, FileEntry> = {};
    applications.forEach(app => {
      fileMap[app.id] = {
        resumeName: app.resume_used || undefined,
        coverLetterName: app.cover_letter_used || undefined,
      };
    });

    const withFiles = applications.filter(a => a.resume_path || a.cover_letter_path);
    await inBatches(withFiles, 4, async app => {
      if (app.resume_path) {
        const { data } = await supabase.storage.from('applications').download(app.resume_path);
        if (data) fileMap[app.id].resume = data;
      }
      if (app.cover_letter_path) {
        const { data } = await supabase.storage.from('applications').download(app.cover_letter_path);
        if (data) fileMap[app.id].coverLetter = data;
      }
    });
    return fileMap;
  };

  const exportZip = async (format: 'pdf' | 'docx') => {
    setOpen(false);
    setBusy(format);
    try {
      // The interviews and learnings are already loaded for the dashboard; asking
      // the server again with an `in (...)` list of every id both repeated the work
      // and, past a few hundred applications, overflowed the request URL.
      const ids = new Set(applications.map(a => a.id));
      const interviews = Object.fromEntries(Object.entries(interviewsMap).filter(([id]) => ids.has(id)));
      const learnings = Object.fromEntries(Object.entries(learningsMap).filter(([id]) => ids.has(id)));
      const fileMap = await loadAllFiles();
      const { exportAllApplicationsZip } = await import('../utils/zipExportUtils');
      await exportAllApplicationsZip(applications, interviews, learnings, fileMap, format);
    } catch (e) {
      toast(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportData = (kind: 'csv' | 'json') => {
    setOpen(false);
    if (kind === 'csv') downloadText('interntrack.csv', toCsv(applications), 'text/csv');
    else downloadText('interntrack.json', JSON.stringify(applications, null, 2), 'application/json');
  };

  const isLoading = busy !== null;
  const item =
    'w-full flex items-center gap-3 px-4 py-3 text-sm text-light-900 dark:text-dark-300 hover:bg-light-200 dark:hover:bg-dark-700 transition-colors text-left';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !isLoading && setOpen(v => !v)}
        disabled={isLoading || applications.length === 0}
        className="btn-secondary"
        title={applications.length === 0 ? 'No applications to export' : 'Export all applications'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        Export All
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 bg-light-100 dark:bg-dark-800 border border-light-300 dark:border-dark-600 rounded-xl shadow-2xl overflow-hidden z-40 transition-colors"
        >
          <button role="menuitem" onClick={() => exportData('csv')} className={item}>
            <FileSpreadsheet size={15} className="text-emerald-500 dark:text-emerald-400" />
            Export as CSV
          </button>
          <div className="border-t border-light-300 dark:border-dark-600" />
          <button role="menuitem" onClick={() => exportData('json')} className={item}>
            <FileJson size={15} className="text-amber-500 dark:text-amber-400" />
            Export as JSON
          </button>
          <div className="border-t border-light-300 dark:border-dark-600" />
          <button role="menuitem" onClick={() => void exportZip('pdf')} className={item}>
            <FileText size={15} className="text-red-500 dark:text-red-400" />
            Export All as PDF (ZIP)
          </button>
          <div className="border-t border-light-300 dark:border-dark-600" />
          <button role="menuitem" onClick={() => void exportZip('docx')} className={item}>
            <FileDown size={15} className="text-blue-500 dark:text-blue-400" />
            Export All as Word (ZIP)
          </button>
        </div>
      )}
    </div>
  );
}
