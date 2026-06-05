import { useState, useRef, useEffect } from 'react';
import { ChevronDown, FileText, FileDown, Loader2, Download } from 'lucide-react';
import type { Application, InterviewDate, InterviewLearning } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { exportAllApplicationsZip } from '../utils/zipExportUtils';

type Props = {
  applications: Application[];
};

export default function PrintAllButton({ applications }: Props) {
  const [open, setOpen] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingDocx, setLoadingDocx] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadAllInterviews = async () => {
    if (!applications.length) return {};

    const appIds = applications.map(a => a.id);
    const { data } = await supabase
      .from('interview_dates')
      .select('*')
      .in('application_id', appIds);

    const map: Record<string, InterviewDate[]> = {};
    (data || []).forEach(iv => {
      if (!map[iv.application_id]) map[iv.application_id] = [];
      map[iv.application_id].push(iv);
    });
    return map;
  };

  const loadAllLearnings = async () => {
    if (!applications.length) return {};

    const appIds = applications.map(a => a.id);
    const { data } = await supabase
      .from('interview_learnings')
      .select('*')
      .in('application_id', appIds);

    const map: Record<string, InterviewLearning> = {};
    (data || []).forEach(item => {
      map[item.application_id] = item;
    });

    return map;
  };

  const loadAllFiles = async () => {
    const fileMap: Record<string, {
      resume?: Blob;
      coverLetter?: Blob;
      resumeName?: string;
      coverLetterName?: string;
    }> = {};

    for (const app of applications) {
      fileMap[app.id] = {
        resumeName: app.resume_used || undefined,
        coverLetterName: app.cover_letter_used || undefined,
      };

      if (app.resume_path) {
        const { data } = await supabase.storage.from('applications').download(app.resume_path);
        if (data) {
          fileMap[app.id].resume = data;
        }
      }

      if (app.cover_letter_path) {
        const { data } = await supabase.storage.from('applications').download(app.cover_letter_path);
        if (data) {
          fileMap[app.id].coverLetter = data;
        }
      }
    }

    return fileMap;
  };

  const handlePDF = async () => {
    setOpen(false);
    setLoadingPdf(true);
    try {
      const interviews = await loadAllInterviews();
      const learnings = await loadAllLearnings();
      const fileMap = await loadAllFiles();
      await exportAllApplicationsZip(applications, interviews, learnings, fileMap, 'pdf');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDocx = async () => {
    setOpen(false);
    setLoadingDocx(true);
    try {
      const interviews = await loadAllInterviews();
      const learnings = await loadAllLearnings();
      const fileMap = await loadAllFiles();
      await exportAllApplicationsZip(applications, interviews, learnings, fileMap, 'docx');
    } finally {
      setLoadingDocx(false);
    }
  };

  const isLoading = loadingPdf || loadingDocx;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !isLoading && setOpen(v => !v)}
        disabled={isLoading || applications.length === 0}
        className="btn-secondary"
        title={applications.length === 0 ? 'No applications to export' : 'Export all applications'}
      >
        {isLoading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Download size={15} />
        )}
        Export All
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-light-100 dark:bg-dark-800 border border-light-300 dark:border-dark-600 rounded-xl shadow-2xl overflow-hidden z-40 transition-colors">
          <button
            onClick={handlePDF}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-light-900 dark:text-slate-300 hover:bg-light-200 dark:hover:bg-dark-700 transition-colors text-left"
          >
            <FileText size={15} className="text-red-500 dark:text-red-400" />
            Export All as PDF (ZIP)
          </button>
          <div className="border-t border-light-300 dark:border-dark-600" />
          <button
            onClick={handleDocx}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-light-900 dark:text-slate-300 hover:bg-light-200 dark:hover:bg-dark-700 transition-colors text-left"
          >
            <FileDown size={15} className="text-blue-500 dark:text-blue-400" />
            Export All as Word (ZIP)
          </button>
        </div>
      )}
    </div>
  );
}
