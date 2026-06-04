import { Calendar, CheckCircle, XCircle, Clock, Briefcase, ChevronRight } from 'lucide-react';
import type { Application } from '../lib/supabase';

type Props = {
  application: Application;
  onClick: () => void;
};

const RESPONSE_BADGE: Record<string, { label: string; className: string }> = {
  Pending:     { label: 'Pending',     className: 'badge bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20' },
  Viewed:      { label: 'Viewed',      className: 'badge bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20' },
  Rejected:    { label: 'Rejected',    className: 'badge bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20' },
  Shortlisted: { label: 'Shortlisted', className: 'badge bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20' },
  Offered:     { label: 'Offered',     className: 'badge bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20' },
};

const FINAL_BADGE: Record<string, { label: string; className: string }> = {
  'In Progress': { label: 'In Progress', className: 'badge bg-blue-100/50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20' },
  Rejected:      { label: 'Rejected',    className: 'badge bg-red-100/50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20' },
  Accepted:      { label: 'Accepted',    className: 'badge bg-green-100/50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/20' },
  Withdrawn:     { label: 'Withdrawn',   className: 'badge bg-gray-100 dark:bg-slate-500/10 text-gray-700 dark:text-slate-400 border border-gray-200 dark:border-slate-500/20' },
};

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ApplicationCard({ application: app, onClick }: Props) {
  const responseBadge = RESPONSE_BADGE[app.response_status] ?? RESPONSE_BADGE['Pending'];
  const finalBadge = FINAL_BADGE[app.final_status] ?? FINAL_BADGE['In Progress'];

  return (
    <button
      onClick={onClick}
      className="card w-full text-left p-5 hover:border-green-500/30 hover:shadow-lg hover:shadow-green-500/5 hover:-translate-y-0.5 group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-light-200 dark:bg-dark-700 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/10 transition-colors">
            <Briefcase size={18} className="text-light-600 dark:text-slate-400 group-hover:text-green-400 transition-colors" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-light-900 dark:text-white text-base truncate">{app.company_name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Calendar size={12} className="text-light-500 dark:text-slate-500 flex-shrink-0" />
              <span className="text-xs text-light-600 dark:text-slate-500">{formatDate(app.date_applied)}</span>
            </div>
          </div>
        </div>
        <ChevronRight size={16} className="text-light-400 dark:text-slate-600 group-hover:text-green-400 transition-colors flex-shrink-0 mt-1" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={responseBadge.className}>{responseBadge.label}</span>
        <span className={finalBadge.className}>{finalBadge.label}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {app.interview_offered ? (
          <CheckCircle size={14} className="text-green-500 dark:text-green-400" />
        ) : (
          <XCircle size={14} className="text-light-400 dark:text-slate-600" />
        )}
        <span className={`text-xs ${app.interview_offered ? 'text-green-600 dark:text-green-400' : 'text-light-600 dark:text-slate-500'}`}>
          {app.interview_offered ? 'Interview offered' : 'No interview yet'}
        </span>
        {app.company_description && (
          <>
            <span className="text-light-300 dark:text-slate-700 ml-1">·</span>
            <Clock size={12} className="text-light-500 dark:text-slate-600" />
            <span className="text-xs text-light-600 dark:text-slate-500 truncate max-w-[140px]">{app.company_description}</span>
          </>
        )}
      </div>
    </button>
  );
}
