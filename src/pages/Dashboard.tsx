import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, Loader2, Briefcase, RefreshCw, ArrowUpDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, uploadResumeFile, uploadCoverLetterFile } from '../lib/supabase';
import type { Application, ApplicationInsert, InterviewDate, InterviewDateInsert, InterviewLearning, ApplicationFiles } from '../lib/supabase';
import ApplicationCard from '../components/ApplicationCard';
import ApplicationForm from '../components/ApplicationForm';
import ApplicationDetail from '../components/ApplicationDetail';
import PrintAllButton from '../components/PrintAllButton';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Viewed', label: 'Viewed' },
  { value: 'Rejected', label: 'Rejected' },
  { value: 'Shortlisted', label: 'Shortlisted' },
  { value: 'Offered', label: 'Offered' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recently Applied' },
  { value: 'oldest', label: 'Least Recently Applied' },
  { value: 'interview_closest', label: 'Interview Date: Closest First' },
  { value: 'interview_furthest', label: 'Interview Date: Furthest First' },
];

function getTimestamp(value?: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortApplicationsByDate(applications: Application[]) {
  return [...applications].sort(
    (a, b) =>
      getTimestamp(b.created_at || b.date_applied) - getTimestamp(a.created_at || a.date_applied)
  );
}

function sortInterviewDates(dates: InterviewDate[]) {
  return [...dates].sort((a, b) => getTimestamp(a.interview_date) - getTimestamp(b.interview_date));
}

function isAuthError(message: string) {
  return /unauthoriz|forbidden|jwt|session/i.test(message);
}

function getSupabaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (error && typeof error === 'object') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
    const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : '';
    return [message, hint].filter(Boolean).join(' ');
  }

  return 'Failed to load applications. Please try again.';
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [applications, setApplications] = useState<Application[]>([]);
  const [interviewsMap, setInterviewsMap] = useState<Record<string, InterviewDate[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  const [showForm, setShowForm] = useState(false);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [editLearnings, setEditLearnings] = useState<InterviewLearning | null>(null);
  const [detailApp, setDetailApp] = useState<Application | null>(null);

  const fetchAllInterviews = useCallback(async (appIds: string[]) => {
    try {
      const { data } = await supabase
        .from('interview_dates')
        .select('*')
        .in('application_id', appIds);

      const map: Record<string, InterviewDate[]> = {};
      (data || []).forEach(iv => {
        if (!map[iv.application_id]) map[iv.application_id] = [];
        map[iv.application_id].push(iv);
      });

      Object.keys(map).forEach(key => {
        map[key] = sortInterviewDates(map[key]);
      });

      setInterviewsMap(map);
    } catch {
      // Keep the dashboard usable even if interview dates fail to load.
      setInterviewsMap({});
    }
  }, []);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('applications')
        .select('*');

      if (err) throw err;

      const sortedApplications = sortApplicationsByDate(data ?? []);
      setApplications(sortedApplications);

      if (sortedApplications.length) {
        await fetchAllInterviews(sortedApplications.map(d => d.id));
      }
    } catch (err) {
      const message = getSupabaseErrorMessage(err);

      if (isAuthError(message)) {
        await signOut();
        navigate('/login', { replace: true });
        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fetchAllInterviews, navigate, signOut]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    void fetchApplications();
  }, [user, navigate, fetchApplications]);

  const filtered = useMemo(() => {
    const result = applications.filter(app => {
      const matchSearch = app.company_name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || app.response_status === statusFilter;
      const matchPlatform = !platformFilter || app.platform_applied_on === platformFilter;
      return matchSearch && matchStatus && matchPlatform;
    });

    if (sortBy === 'recent') {
      result.sort((a, b) => new Date(b.date_applied || 0).getTime() - new Date(a.date_applied || 0).getTime());
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.date_applied || 0).getTime() - new Date(b.date_applied || 0).getTime());
    } else if (sortBy === 'interview_closest') {
      result.sort((a, b) => {
        const aInterviews = interviewsMap[a.id] || [];
        const bInterviews = interviewsMap[b.id] || [];

        if (!aInterviews.length && !bInterviews.length) return 0;
        if (!aInterviews.length) return 1;
        if (!bInterviews.length) return -1;

        const aDate = new Date(aInterviews[0].interview_date).getTime();
        const bDate = new Date(bInterviews[0].interview_date).getTime();
        return aDate - bDate;
      });
    } else if (sortBy === 'interview_furthest') {
      result.sort((a, b) => {
        const aInterviews = interviewsMap[a.id] || [];
        const bInterviews = interviewsMap[b.id] || [];

        if (!aInterviews.length && !bInterviews.length) return 0;
        if (!aInterviews.length) return 1;
        if (!bInterviews.length) return -1;

        const aDate = new Date(aInterviews[0].interview_date).getTime();
        const bDate = new Date(bInterviews[0].interview_date).getTime();
        return bDate - aDate;
      });
    }

    return result;
  }, [applications, search, statusFilter, platformFilter, sortBy, interviewsMap]);

  const handleCreate = async (
    data: ApplicationInsert,
    interviews: InterviewDateInsert[],
    learnings?: InterviewLearning,
    files?: ApplicationFiles
  ) => {
    const applicationId = crypto.randomUUID();
    let resumePath = data.resume_path;
    let coverLetterPath = data.cover_letter_path;

    if (files?.resumeFile) {
      const uploadedResumePath = await uploadResumeFile(user!.id, applicationId, files.resumeFile);
      if (!uploadedResumePath) throw new Error('Failed to upload the resume file.');
      resumePath = uploadedResumePath;
    }

    if (files?.coverLetterFile) {
      const uploadedCoverLetterPath = await uploadCoverLetterFile(user!.id, applicationId, files.coverLetterFile);
      if (!uploadedCoverLetterPath) throw new Error('Failed to upload the cover letter file.');
      coverLetterPath = uploadedCoverLetterPath;
    }

    const { data: created, error: err } = await supabase
      .from('applications')
      .insert([{
        ...data,
        id: applicationId,
        user_id: user!.id,
        resume_path: resumePath,
        cover_letter_path: coverLetterPath,
      }])
      .select()
      .single();

    if (err) throw new Error(err.message);
    setApplications(prev => [created, ...prev]);

    if (interviews.length && created) {
      const interviewsToAdd = interviews.map(iv => ({
        ...iv,
        application_id: created.id,
        user_id: user!.id,
      }));
      const { data: addedInterviews } = await supabase
        .from('interview_dates')
        .insert(interviewsToAdd)
        .select();
      if (addedInterviews) {
        setInterviewsMap(prev => ({
          ...prev,
          [created.id]: addedInterviews,
        }));
      }
    }

    if (learnings && created) {
      await supabase.from('interview_learnings').insert({
        application_id: created.id,
        user_id: user!.id,
        learnings: learnings.learnings,
        questions_asked: learnings.questions_asked,
      });
    }
  };

  const handleUpdate = async (
    data: ApplicationInsert,
    interviews: InterviewDateInsert[],
    learnings?: InterviewLearning,
    files?: ApplicationFiles
  ) => {
    if (!editApp) return;
    let resumePath = data.resume_path;
    let coverLetterPath = data.cover_letter_path;

    if (files?.resumeFile) {
      const uploadedResumePath = await uploadResumeFile(user!.id, editApp.id, files.resumeFile);
      if (!uploadedResumePath) throw new Error('Failed to upload the resume file.');
      resumePath = uploadedResumePath;
    }

    if (files?.coverLetterFile) {
      const uploadedCoverLetterPath = await uploadCoverLetterFile(user!.id, editApp.id, files.coverLetterFile);
      if (!uploadedCoverLetterPath) throw new Error('Failed to upload the cover letter file.');
      coverLetterPath = uploadedCoverLetterPath;
    }

    const { data: updated, error: err } = await supabase
      .from('applications')
      .update({
        ...data,
        resume_path: resumePath,
        cover_letter_path: coverLetterPath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editApp.id)
      .select()
      .single();

    if (err) throw new Error(err.message);
    setApplications(prev => prev.map(a => a.id === editApp.id ? updated : a));
    if (detailApp?.id === editApp.id) setDetailApp(updated);

    await supabase.from('interview_dates').delete().eq('application_id', editApp.id);
    if (interviews.length) {
      const interviewsToAdd = interviews.map(iv => ({
        ...iv,
        application_id: editApp.id,
        user_id: user!.id,
      }));
      const { data: newInterviews } = await supabase
        .from('interview_dates')
        .insert(interviewsToAdd)
        .select();
      if (newInterviews) {
        setInterviewsMap(prev => ({
          ...prev,
          [editApp.id]: newInterviews,
        }));
      }
    } else {
      setInterviewsMap(prev => {
        const newMap = { ...prev };
        delete newMap[editApp.id];
        return newMap;
      });
    }

    if (learnings) {
      const { data: existing } = await supabase
        .from('interview_learnings')
        .select('id')
        .eq('application_id', editApp.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('interview_learnings')
          .update({
            learnings: learnings.learnings,
            questions_asked: learnings.questions_asked,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('interview_learnings').insert({
          application_id: editApp.id,
          user_id: user!.id,
          learnings: learnings.learnings,
          questions_asked: learnings.questions_asked,
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    const { error: err } = await supabase.from('applications').delete().eq('id', id);
    if (err) throw new Error(err.message);
    setApplications(prev => prev.filter(a => a.id !== id));
    setDetailApp(null);
  };

  const openEdit = (app: Application) => {
    setEditApp(app);
    setDetailApp(null);
    // Fetch learnings for this application
    (async () => {
      const { data } = await supabase
        .from('interview_learnings')
        .select('*')
        .eq('application_id', app.id)
        .maybeSingle();
      setEditLearnings(data);
    })();
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditApp(null);
    setEditLearnings(null);
  };

  const stats = useMemo(() => ({
    total: applications.length,
    interviews: applications.filter(a => a.interview_offered).length,
    offered: applications.filter(a => a.response_status === 'Offered' || a.final_status === 'Accepted').length,
    rejected: applications.filter(a => a.response_status === 'Rejected' || a.final_status === 'Rejected').length,
  }), [applications]);

  return (
    <div className="min-h-screen pt-16 bg-light-50 dark:bg-dark-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-light-900 dark:text-white">Dashboard</h1>
            <p className="text-light-600 dark:text-slate-400 text-sm mt-0.5">
              {user?.user_metadata?.name
                ? `Welcome back, ${user.user_metadata.name.split(' ')[0]}`
                : 'Your internship applications'}
            </p>
          </div>
          <button
            onClick={() => { setEditApp(null); setShowForm(true); }}
            className="btn-primary"
          >
            <Plus size={16} />
            Add Application
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: stats.total, color: 'text-light-900 dark:text-white' },
            { label: 'Interviews', value: stats.interviews, color: 'text-green-600 dark:text-green-400' },
            { label: 'Offers / Accepted', value: stats.offered, color: 'text-sky-600 dark:text-sky-400' },
            { label: 'Rejected', value: stats.rejected, color: 'text-red-600 dark:text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4 border-light-300 dark:border-dark-600">
              <p className="text-xs text-light-600 dark:text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-500 dark:text-slate-500 pointer-events-none" />
            <input
              className="input-field pl-9"
              placeholder="Search by company name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <SlidersHorizontal size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-500 dark:text-slate-500 pointer-events-none" />
              <select
                className="input-field pl-9 pr-4 appearance-none min-w-[160px]"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Briefcase size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-500 dark:text-slate-500 pointer-events-none" />
              <select
                className="input-field pl-9 pr-4 appearance-none min-w-[160px]"
                value={platformFilter}
                onChange={e => setPlatformFilter(e.target.value)}
              >
                <option value="">All Platforms</option>
                {[...new Set(applications.map(a => a.platform_applied_on).filter(Boolean))]
                  .sort()
                  .map(platform => (
                    <option key={platform} value={platform}>{platform}</option>
                  ))}
              </select>
            </div>

            <div className="relative">
              <ArrowUpDown size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-500 dark:text-slate-500 pointer-events-none" />
              <select
                className="input-field pl-9 pr-4 appearance-none min-w-[200px]"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <PrintAllButton applications={filtered} />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-green-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button onClick={fetchApplications} className="btn-secondary">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-light-200 dark:bg-dark-700 flex items-center justify-center mb-4">
              <Briefcase size={28} className="text-light-400 dark:text-slate-600" />
            </div>
            {applications.length === 0 ? (
              <>
                <h3 className="text-light-900 dark:text-white font-semibold text-lg mb-2">No applications yet</h3>
                <p className="text-light-600 dark:text-slate-500 text-sm mb-6 max-w-sm">
                  Start tracking your internship search by adding your first application.
                </p>
                <button
                  onClick={() => { setEditApp(null); setShowForm(true); }}
                  className="btn-primary"
                >
                  <Plus size={16} /> Add First Application
                </button>
              </>
            ) : (
              <>
                <h3 className="text-light-900 dark:text-white font-semibold text-lg mb-2">No results found</h3>
                <p className="text-light-600 dark:text-slate-500 text-sm">
                  Try adjusting your search or filter.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(app => (
              <ApplicationCard
                key={app.id}
                application={app}
                onClick={() => setDetailApp(app)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <ApplicationForm
          onClose={closeForm}
          onSave={editApp ? handleUpdate : handleCreate}
          initial={editApp}
          learnings={editApp ? editLearnings : undefined}
        />
      )}

      {detailApp && !showForm && (
        <ApplicationDetail
          application={detailApp}
          onClose={() => setDetailApp(null)}
          onEdit={() => openEdit(detailApp)}
          onDelete={() => handleDelete(detailApp.id)}
        />
      )}
    </div>
  );
}
