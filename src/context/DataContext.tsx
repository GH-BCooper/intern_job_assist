import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  supabase,
  uploadCoverLetterFile,
  uploadResumeFile,
  type Application,
  type ApplicationFiles,
  type ApplicationInsert,
  type InterviewDate,
  type InterviewDateInsert,
  type InterviewLearning,
} from '../lib/supabase';
import { useAuth } from './AuthContext';
import { logActivity, setStoreScope, uid } from '../lib/store';
import { ts } from '../lib/format';
import { onUi, toast } from '../lib/uiBus';
import { enqueue, flush, registerRunner } from '../lib/outbox';

type DataContextType = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  learningsMap: Record<string, InterviewLearning>;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  createApplication: (
    data: ApplicationInsert,
    interviews?: InterviewDateInsert[],
    learnings?: Pick<InterviewLearning, 'learnings' | 'questions_asked'>,
    files?: ApplicationFiles,
  ) => Promise<Application>;
  updateApplication: (
    id: string,
    data: Partial<ApplicationInsert>,
    interviews?: InterviewDateInsert[] | null,
    learnings?: Pick<InterviewLearning, 'learnings' | 'questions_asked'>,
    files?: ApplicationFiles,
  ) => Promise<Application>;
  deleteApplication: (id: string) => Promise<void>;
  addInterviewDate: (applicationId: string, interview_date: string, label?: string) => Promise<InterviewDate>;
  removeInterviewDate: (id: string) => Promise<void>;
  loadLearnings: (applicationId: string) => Promise<InterviewLearning | null>;
};

const DataContext = createContext<DataContextType | null>(null);

const EMPTY_APPLICATION: ApplicationInsert = {
  company_name: '',
  company_description: '',
  resume_used: '',
  cover_letter_used: '',
  response_status: 'Pending',
  interview_offered: false,
  final_status: 'In Progress',
  date_applied: null,
  salary_info: '',
  interview_questions: '',
  tasks_to_complete: '',
  resume_path: '',
  cover_letter_path: '',
  role_applied_to: '',
  platform_applied_on: '',
};

export function blankApplication(patch: Partial<ApplicationInsert> = {}): ApplicationInsert {
  return { ...EMPTY_APPLICATION, ...patch };
}

function sortByRecency(list: Application[]) {
  return [...list].sort((a, b) => ts(b.created_at || b.date_applied) - ts(a.created_at || a.date_applied));
}

function errMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
    const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : '';
    return [message, hint].filter(Boolean).join(' ') || 'Something went wrong.';
  }
  return 'Failed to load applications. Please try again.';
}

function isAuthError(message: string) {
  const m = message.toLowerCase();
  return m.includes('jwt') || m.includes('token') || m.includes('not authenticated') || m.includes('unauthorized');
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [applications, setApplications] = useState<Application[]>([]);
  const [interviewsMap, setInterviewsMap] = useState<Record<string, InterviewDate[]>>({});
  const [learningsMap, setLearningsMap] = useState<Record<string, InterviewLearning>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** Current applications, for callbacks that must not re-create on every change. */
  const applicationsRef = useRef<Application[]>([]);
  applicationsRef.current = applications;

  useEffect(() => {
    setStoreScope(user?.id);
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user) {
      setApplications([]);
      setInterviewsMap({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase.from('applications').select('*');
      if (err) throw err;
      const sorted = sortByRecency(data ?? []);
      setApplications(sorted);

      if (sorted.length) {
        const { data: ivs } = await supabase
          .from('interview_dates')
          .select('*')
          .in('application_id', sorted.map(a => a.id));
        const map: Record<string, InterviewDate[]> = {};
        (ivs || []).forEach(iv => {
          if (!map[iv.application_id]) map[iv.application_id] = [];
          map[iv.application_id].push(iv);
        });
        Object.keys(map).forEach(k => {
          map[k].sort((a, b) => ts(a.interview_date) - ts(b.interview_date));
        });
        setInterviewsMap(map);

        const { data: learnings } = await supabase
          .from('interview_learnings')
          .select('*')
          .in('application_id', sorted.map(a => a.id));
        const lmap: Record<string, InterviewLearning> = {};
        (learnings || []).forEach(l => {
          lmap[l.application_id] = l;
        });
        setLearningsMap(lmap);
      } else {
        setInterviewsMap({});
        setLearningsMap({});
      }
    } catch (e) {
      const message = errMessage(e);
      if (isAuthError(message)) {
        await signOut();
        navigate('/login', { replace: true });
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user, signOut, navigate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => onUi(e => {
    if (e.type === 'refresh') void refresh();
  }), [refresh]);

  /**
   * Teaches the outbox how to replay each kind of queued write.
   *
   * Registered from the payload rather than a closure, so a write queued in a
   * previous session still replays after a reload.
   */
  useEffect(() => {
    registerRunner('create', async item => {
      const row = item.payload.row as Record<string, unknown>;
      const { error } = await supabase.from('applications').insert([row]);
      // A replayed insert can collide with itself if the tab crashed mid-flush.
      if (error && !/duplicate key|already exists/i.test(error.message)) throw new Error(error.message);
    });
    registerRunner('update', async item => {
      const { error } = await supabase
        .from('applications')
        .update(item.payload.body as Record<string, unknown>)
        .eq('id', item.payload.id as string);
      if (error) throw new Error(error.message);
    });
    registerRunner('delete', async item => {
      const { error } = await supabase.from('applications').delete().eq('id', item.payload.id as string);
      if (error) throw new Error(error.message);
    });
    registerRunner('interview_add', async item => {
      const { error } = await supabase.from('interview_dates').insert(item.payload.row as Record<string, unknown>);
      if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    });
    registerRunner('interview_remove', async item => {
      const { error } = await supabase.from('interview_dates').delete().eq('id', item.payload.id as string);
      if (error) throw new Error(error.message);
    });
  }, []);

  /** Flushes the queue on reconnect and once at startup. */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const drain = async () => {
      const { sent, failed } = await flush();
      if (cancelled || (!sent && !failed)) return;
      if (sent) {
        toast(`Synced ${sent} change${sent === 1 ? '' : 's'} made offline.`, 'success');
        void refresh();
      }
      if (failed) toast(`${failed} queued change${failed === 1 ? '' : 's'} could not be synced.`, 'error');
    };

    void drain();
    window.addEventListener('online', drain);
    return () => {
      cancelled = true;
      window.removeEventListener('online', drain);
    };
  }, [user, refresh]);

  const createApplication = useCallback<DataContextType['createApplication']>(
    async (data, interviews = [], learnings, files) => {
      if (!user) throw new Error('You must be signed in.');
      const applicationId = uid();
      let resume_path = data.resume_path;
      let cover_letter_path = data.cover_letter_path;

      if (files?.resumeFile) {
        const p = await uploadResumeFile(user.id, applicationId, files.resumeFile);
        if (!p) throw new Error('Failed to upload the resume file.');
        resume_path = p;
      }
      if (files?.coverLetterFile) {
        const p = await uploadCoverLetterFile(user.id, applicationId, files.coverLetterFile);
        if (!p) throw new Error('Failed to upload the cover letter file.');
        cover_letter_path = p;
      }

      const row = { ...data, id: applicationId, user_id: user.id, resume_path, cover_letter_path };

      const insert = await enqueue('create', `Add ${data.company_name}`, { row }, async () => {
        const { data: created, error: err } = await supabase.from('applications').insert([row]).select().single();
        if (err) throw new Error(err.message);
        return created;
      });

      if (!insert.ok) {
        if (!insert.queued) throw insert.error instanceof Error ? insert.error : new Error(String(insert.error));
        // Offline: show the record immediately and let the outbox land it later.
        const optimistic = {
          ...row,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Application;
        setApplications(prev => sortByRecency([optimistic, ...prev]));
        logActivity(`Added ${optimistic.company_name} (queued offline)`, { kind: 'create', application_id: optimistic.id });
        toast('Saved locally — it will sync when you are back online.', 'info');
        return optimistic;
      }

      const created = insert.value;
      setApplications(prev => sortByRecency([created, ...prev]));
      logActivity(`Added ${created.company_name}`, { kind: 'create', application_id: created.id });

      if (interviews.length) {
        const { data: added, error: ivErr } = await supabase
          .from('interview_dates')
          .insert(interviews.map(iv => ({ ...iv, application_id: created.id, user_id: user.id })))
          .select();
        if (ivErr) throw new Error(`Application saved, but interview dates failed to save: ${ivErr.message}`);
        if (added) setInterviewsMap(prev => ({ ...prev, [created.id]: added }));
      }
      if (learnings && (learnings.learnings || learnings.questions_asked)) {
        const { data: saved, error: lErr } = await supabase
          .from('interview_learnings')
          .insert({ application_id: created.id, user_id: user.id, ...learnings })
          .select()
          .maybeSingle();
        if (lErr) throw new Error(`Application saved, but learnings failed to save: ${lErr.message}`);
        if (saved) setLearningsMap(prev => ({ ...prev, [created.id]: saved }));
      }
      return created;
    },
    [user],
  );

  const updateApplication = useCallback<DataContextType['updateApplication']>(
    async (id, data, interviews, learnings, files) => {
      if (!user) throw new Error('You must be signed in.');
      const patch: Partial<ApplicationInsert> = { ...data };

      if (files?.resumeFile) {
        const p = await uploadResumeFile(user.id, id, files.resumeFile);
        if (!p) throw new Error('Failed to upload the resume file.');
        patch.resume_path = p;
      }
      if (files?.coverLetterFile) {
        const p = await uploadCoverLetterFile(user.id, id, files.coverLetterFile);
        if (!p) throw new Error('Failed to upload the cover letter file.');
        patch.cover_letter_path = p;
      }

      const body = { ...patch, updated_at: new Date().toISOString() };

      const result = await enqueue('update', `Update ${patch.company_name || 'an application'}`, { id, body }, async () => {
        const { data: updated, error: err } = await supabase
          .from('applications')
          .update(body)
          .eq('id', id)
          .select()
          .single();
        if (err) throw new Error(err.message);
        return updated;
      });

      if (!result.ok) {
        if (!result.queued) throw result.error instanceof Error ? result.error : new Error(String(result.error));
        // Offline: apply the patch locally so the UI stays truthful about intent.
        let optimistic: Application | null = null;
        setApplications(prev =>
          prev.map(a => {
            if (a.id !== id) return a;
            optimistic = { ...a, ...body } as Application;
            return optimistic;
          }),
        );
        toast('Change saved locally — it will sync when you are back online.', 'info');
        const existing = optimistic || applicationsRef.current.find(a => a.id === id);
        if (!existing) throw new Error('That application is not loaded.');
        return existing;
      }

      const updated = result.value;
      setApplications(prev => prev.map(a => (a.id === id ? updated : a)));
      logActivity(`Updated ${updated.company_name}`, { kind: 'update', application_id: id });

      if (interviews) {
        const { error: delErr } = await supabase.from('interview_dates').delete().eq('application_id', id);
        if (delErr) throw new Error(`Application saved, but interview dates failed to update: ${delErr.message}`);
        if (interviews.length) {
          const { data: added, error: ivErr } = await supabase
            .from('interview_dates')
            .insert(interviews.map(iv => ({ ...iv, application_id: id, user_id: user.id })))
            .select();
          if (ivErr) throw new Error(`Application saved, but interview dates failed to save: ${ivErr.message}`);
          setInterviewsMap(prev => ({ ...prev, [id]: added || [] }));
        } else {
          setInterviewsMap(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      }

      if (learnings) {
        const { data: existing, error: findErr } = await supabase
          .from('interview_learnings')
          .select('id')
          .eq('application_id', id)
          .maybeSingle();
        if (findErr) throw new Error(`Application saved, but learnings failed to save: ${findErr.message}`);
        if (existing) {
          const { data: saved, error: updErr } = await supabase
            .from('interview_learnings')
            .update({ ...learnings, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .maybeSingle();
          if (updErr) throw new Error(`Application saved, but learnings failed to save: ${updErr.message}`);
          if (saved) setLearningsMap(prev => ({ ...prev, [id]: saved }));
        } else {
          const { data: saved, error: insErr } = await supabase
            .from('interview_learnings')
            .insert({ application_id: id, user_id: user.id, ...learnings })
            .select()
            .maybeSingle();
          if (insErr) throw new Error(`Application saved, but learnings failed to save: ${insErr.message}`);
          if (saved) setLearningsMap(prev => ({ ...prev, [id]: saved }));
        }
      }

      return updated;
    },
    [user],
  );

  const deleteApplication = useCallback(async (id: string) => {
    const target = applications.find(a => a.id === id);
    const result = await enqueue('delete', `Delete ${target?.company_name || 'an application'}`, { id }, async () => {
      const { error: err } = await supabase.from('applications').delete().eq('id', id);
      if (err) throw new Error(err.message);
      return true;
    });
    if (!result.ok && !result.queued) {
      throw result.error instanceof Error ? result.error : new Error(String(result.error));
    }
    setApplications(prev => prev.filter(a => a.id !== id));
    logActivity(`Deleted ${target?.company_name || 'an application'}`, { kind: 'delete' });
    if (!result.ok) toast('Deletion queued — it will sync when you are back online.', 'info');
  }, [applications]);

  const addInterviewDate = useCallback(
    async (applicationId: string, interview_date: string, label = 'Interview') => {
      if (!user) throw new Error('You must be signed in.');
      const { data, error: err } = await supabase
        .from('interview_dates')
        .insert({ application_id: applicationId, user_id: user.id, interview_date, label })
        .select()
        .single();
      if (err) throw new Error(err.message);
      setInterviewsMap(prev => ({
        ...prev,
        [applicationId]: [...(prev[applicationId] || []), data].sort(
          (a, b) => ts(a.interview_date) - ts(b.interview_date),
        ),
      }));
      return data;
    },
    [user],
  );

  const removeInterviewDate = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('interview_dates').delete().eq('id', id);
    if (err) throw new Error(err.message);
    setInterviewsMap(prev => {
      const next: Record<string, InterviewDate[]> = {};
      Object.entries(prev).forEach(([k, list]) => {
        next[k] = list.filter(iv => iv.id !== id);
      });
      return next;
    });
  }, []);

  const loadLearnings = useCallback(async (applicationId: string) => {
    const { data } = await supabase
      .from('interview_learnings')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();
    if (data) setLearningsMap(prev => ({ ...prev, [applicationId]: data }));
    return data ?? null;
  }, []);

  const value = useMemo<DataContextType>(
    () => ({
      applications,
      interviewsMap,
      learningsMap,
      loading,
      error,
      refresh,
      createApplication,
      updateApplication,
      deleteApplication,
      addInterviewDate,
      removeInterviewDate,
      loadLearnings,
    }),
    [
      applications,
      interviewsMap,
      learningsMap,
      loading,
      error,
      refresh,
      createApplication,
      updateApplication,
      deleteApplication,
      addInterviewDate,
      removeInterviewDate,
      loadLearnings,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
