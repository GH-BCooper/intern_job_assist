import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  Bookmark,
  BookmarkPlus,
  Briefcase,
  CalendarClock,
  Flame,
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table2,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../hooks/useStore';
import type { Application, ApplicationInsert, InterviewDateInsert, InterviewLearning } from '../lib/supabase';
import { computeAnalytics, stageOf, STAGES } from '../lib/insights';
import ApplicationCard from '../components/ApplicationCard';
import ApplicationForm from '../components/ApplicationForm';
import ApplicationDetail from '../components/ApplicationDetail';
import PrintAllButton from '../components/PrintAllButton';
import BoardView from '../components/views/BoardView';
import TableView from '../components/views/TableView';
import TimelineView from '../components/views/TimelineView';
import PageShell from '../components/PageShell';
import { Sparkline } from '../components/ui/Charts';
import { deleteSavedView, saveView } from '../lib/store';
import { consumePending, emitUi, onUi, setDashboardMounted, toast, type UiEvent } from '../lib/uiBus';
import { ts } from '../lib/format';

const VIEWS = [
  { id: 'board', label: 'Board', icon: FolderKanban },
  { id: 'grid', label: 'Cards', icon: LayoutGrid },
  { id: 'table', label: 'Table', icon: Table2 },
  { id: 'timeline', label: 'Timeline', icon: List },
] as const;

const STATUS_OPTIONS = ['', 'Pending', 'Viewed', 'Rejected', 'Shortlisted', 'Offered'];

const SORTS = [
  { value: 'recent', label: 'Newest applied' },
  { value: 'oldest', label: 'Oldest applied' },
  { value: 'interview_closest', label: 'Interview soonest' },
  { value: 'company', label: 'Company A–Z' },
  { value: 'quiet', label: 'Quietest first' },
];

type Filters = { search: string; status: string; platform: string; stage: string; tag: string };

const EMPTY_FILTERS: Filters = { search: '', status: '', platform: '', stage: '', tag: '' };

export default function Dashboard() {
  const { user } = useAuth();
  const {
    applications,
    interviewsMap,
    learningsMap,
    loading,
    error,
    refresh,
    createApplication,
    updateApplication,
    deleteApplication,
    loadLearnings,
  } = useData();
  const store = useStore();

  const [view, setView] = useState<string>(store.preferences.defaultView);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState('recent');
  const [showArchived, setShowArchived] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [editLearnings, setEditLearnings] = useState<InterviewLearning | null>(null);
  const [detailApp, setDetailApp] = useState<Application | null>(null);
  const [prefill, setPrefill] = useState<Partial<ApplicationInsert> | null>(null);

  const analytics = useMemo(
    () => computeAnalytics(applications, interviewsMap, store, store.preferences.followUpDays),
    [applications, interviewsMap, store],
  );

  const openEdit = useCallback(
    (app: Application) => {
      setEditApp(app);
      setDetailApp(null);
      setPrefill(null);
      setEditLearnings(learningsMap[app.id] ?? null);
      void loadLearnings(app.id).then(setEditLearnings);
      setShowForm(true);
    },
    [learningsMap, loadLearnings],
  );

  const handleUiEvent = useCallback(
    (e: UiEvent) => {
      if (e.type === 'set-view') setView(e.view);
      else if (e.type === 'set-filters') setFilters(f => ({ ...f, ...e.filters }));
      else if (e.type === 'new-application') {
        setEditApp(null);
        setEditLearnings(null);
        const raw = (e.prefill || {}) as Record<string, unknown>;
        const cleaned = Object.fromEntries(
          Object.entries(raw).filter(([, v]) => typeof v === 'string' && v.trim()),
        ) as Partial<ApplicationInsert>;
        setPrefill(Object.keys(cleaned).length ? cleaned : null);
        setShowForm(true);
      } else if (e.type === 'open-application') {
        const app = applications.find(a => a.id === e.id);
        if (app) {
          setShowForm(false);
          setDetailApp(app);
        }
      }
    },
    [applications],
  );

  // Respond to the assistant and command palette driving the UI.
  useEffect(() => onUi(handleUiEvent), [handleUiEvent]);

  // The assistant can navigate here and act in the same tick, before this route
  // exists. Those intents are parked in the bus and replayed once on mount.
  const replayQueue = useRef<UiEvent[] | null>(null);

  useEffect(() => {
    setDashboardMounted(true);
    replayQueue.current = consumePending();
    return () => setDashboardMounted(false);
  }, []);

  // Replay only once applications have loaded, so id lookups can resolve.
  useEffect(() => {
    const queued = replayQueue.current;
    if (!queued?.length || loading) return;
    replayQueue.current = null;
    queued.forEach(handleUiEvent);
  }, [loading, handleUiEvent]);

  // Keep the open detail panel in sync after edits.
  useEffect(() => {
    if (!detailApp) return;
    const fresh = applications.find(a => a.id === detailApp.id);
    if (fresh && fresh !== detailApp) setDetailApp(fresh);
  }, [applications, detailApp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setEditApp(null);
        setShowForm(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const platforms = useMemo(
    () => [...new Set(applications.map(a => a.platform_applied_on).filter(Boolean))].sort(),
    [applications],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const tagId = filters.tag ? store.tags.find(t => t.name.toLowerCase() === filters.tag.toLowerCase())?.id : undefined;

    const rows = applications.filter(app => {
      if (!showArchived && store.archived.includes(app.id)) return false;
      if (starredOnly && !store.starred.includes(app.id)) return false;
      if (q) {
        const haystack = [app.company_name, app.role_applied_to, app.platform_applied_on, app.company_description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.status && app.response_status !== filters.status) return false;
      if (filters.platform && app.platform_applied_on !== filters.platform) return false;
      if (filters.stage && stageOf(app, store.stageOverrides) !== filters.stage) return false;
      if (filters.tag) {
        if (!tagId) return false;
        if (!store.applicationTags.some(at => at.application_id === app.id && at.tag_id === tagId)) return false;
      }
      return true;
    });

    const firstInterview = (a: Application) => ts(interviewsMap[a.id]?.[0]?.interview_date) || Infinity;

    return rows.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return ts(a.date_applied || a.created_at) - ts(b.date_applied || b.created_at);
        case 'company':
          return a.company_name.localeCompare(b.company_name);
        case 'interview_closest':
          return firstInterview(a) - firstInterview(b);
        case 'quiet':
          return ts(a.date_applied || a.created_at) - ts(b.date_applied || b.created_at);
        default:
          return ts(b.date_applied || b.created_at) - ts(a.date_applied || a.created_at);
      }
    });
  }, [applications, filters, sortBy, showArchived, starredOnly, store, interviewsMap]);

  const activeFilterCount =
    Object.values(filters).filter(Boolean).length + (starredOnly ? 1 : 0) + (showArchived ? 1 : 0);

  const handleSave = async (
    data: ApplicationInsert,
    interviews: InterviewDateInsert[],
    learnings?: InterviewLearning,
    files?: { resumeFile?: File | null; coverLetterFile?: File | null },
  ) => {
    const payload = learnings ? { learnings: learnings.learnings, questions_asked: learnings.questions_asked } : undefined;
    if (editApp) await updateApplication(editApp.id, data, interviews, payload, files);
    else await createApplication(data, interviews, payload, files);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditApp(null);
    setEditLearnings(null);
    setPrefill(null);
  };

  const firstName = (user?.user_metadata?.name as string | undefined)?.split(' ')[0];

  const heroStats = [
    { label: 'Active', value: analytics.active, icon: Briefcase, tone: 'text-light-900 dark:text-white' },
    { label: 'Interviewing', value: analytics.byStage.Interviewing, icon: CalendarClock, tone: 'text-primary-600 dark:text-primary-400' },
    { label: 'Offers', value: analytics.offers, icon: TrendingUp, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Need follow-up', value: analytics.stale.length, icon: AlertTriangle, tone: 'text-amber-600 dark:text-amber-400' },
  ];

  return (
    <PageShell
      title={firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
      subtitle={
        analytics.total === 0
          ? 'Add your first application to get started.'
          : `${analytics.total} applications tracked · ${analytics.interviewRate}% reach an interview · ${analytics.streak} day streak`
      }
      wide
      actions={
        <>
          <button onClick={() => emitUi({ type: 'open-palette' })} className="btn-secondary hidden sm:inline-flex">
            <Search size={14} /> Search <span className="kbd ml-1">⌘K</span>
          </button>
          <button
            onClick={() => {
              setEditApp(null);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> Add application
          </button>
        </>
      }
    >
      {/* hero stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {heroStats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} className="text-light-500 dark:text-dark-400" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">
                  {s.label}
                </p>
              </div>
              <p className={`text-2xl font-bold tabular-nums leading-none ${s.tone}`}>{s.value}</p>
            </div>
          );
        })}
        <div className="card p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-1">
            <Flame size={13} className="text-primary-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">Cadence</p>
          </div>
          <p className="text-2xl font-bold text-light-900 dark:text-white tabular-nums leading-none">{analytics.thisWeek}</p>
          <Sparkline values={analytics.byWeek.map(w => w.count)} height={22} className="mt-1" />
        </div>
      </div>

      {/* next up strip */}
      {(analytics.upcomingInterviews.length > 0 || analytics.stale.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {analytics.upcomingInterviews.slice(0, 2).map(({ app, interview }) => (
            <button
              key={interview.id}
              onClick={() => setDetailApp(app)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-primary-300 dark:border-primary-900 bg-primary-50 dark:bg-primary-950/30 text-xs font-medium text-primary-800 dark:text-primary-200 hover:shadow-soft transition-shadow"
            >
              <CalendarClock size={13} />
              {app.company_name} · {interview.label || 'Interview'}
            </button>
          ))}
          {analytics.stale.length > 0 && (
            <button
              onClick={() =>
                emitUi({
                  type: 'open-assistant',
                  prompt: 'Find every application that has gone quiet and schedule follow-up reminders for each.',
                })
              }
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-xs font-medium text-amber-800 dark:text-amber-200 hover:shadow-soft transition-shadow"
            >
              <Sparkles size={13} />
              {analytics.stale.length} need a follow-up — let Scout handle it
            </button>
          )}
        </div>
      )}

      {/* view switcher + toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 p-1 rounded-xl bg-light-200/80 dark:bg-dark-900 border border-light-300 dark:border-dark-800">
          {VIEWS.map(v => {
            const Icon = v.icon;
            return (
              <button key={v.id} onClick={() => setView(v.id)} className={`tab !py-1.5 !px-2.5 ${view === v.id ? 'tab-active' : ''}`}>
                <Icon size={13} />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-500 dark:text-dark-400 pointer-events-none" />
          <input
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search company, role, platform…"
            className="input-field pl-9"
          />
        </div>

        <PrintAllButton applications={filtered} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative">
          <SlidersHorizontal size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-light-500 dark:text-dark-400 pointer-events-none" />
          <select
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="input-field !w-auto !py-2 !pl-8 !pr-7 !text-xs appearance-none min-w-[9rem]"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>
                {s || 'All responses'}
              </option>
            ))}
          </select>
        </div>

        <select
          value={filters.stage}
          onChange={e => setFilters(f => ({ ...f, stage: e.target.value }))}
          className="input-field !w-auto !py-2 !px-3 !text-xs appearance-none min-w-[8rem]"
        >
          <option value="">All stages</option>
          {STAGES.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={filters.platform}
          onChange={e => setFilters(f => ({ ...f, platform: e.target.value }))}
          className="input-field !w-auto !py-2 !px-3 !text-xs appearance-none min-w-[8.5rem]"
        >
          <option value="">All platforms</option>
          {platforms.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        {store.tags.length > 0 && (
          <select
            value={filters.tag}
            onChange={e => setFilters(f => ({ ...f, tag: e.target.value }))}
            className="input-field !w-auto !py-2 !px-3 !text-xs appearance-none min-w-[7rem]"
          >
            <option value="">All tags</option>
            {store.tags.map(t => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <div className="relative">
          <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-light-500 dark:text-dark-400 pointer-events-none" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="input-field !w-auto !py-2 !pl-8 !pr-3 !text-xs appearance-none min-w-[10.5rem]"
          >
            {SORTS.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setStarredOnly(s => !s)}
          className={`btn-secondary btn-sm ${starredOnly ? '!border-primary-400 !text-primary-600 dark:!text-primary-400' : ''}`}
        >
          <Star size={12} fill={starredOnly ? 'currentColor' : 'none'} /> Starred
        </button>

        <button
          onClick={() => setShowArchived(s => !s)}
          className={`btn-secondary btn-sm ${showArchived ? '!border-primary-400 !text-primary-600 dark:!text-primary-400' : ''}`}
        >
          <Archive size={12} /> Archived
        </button>

        {activeFilterCount > 0 && (
          <>
            <button
              onClick={() => {
                const name = window.prompt('Name this view');
                if (!name?.trim()) return;
                saveView(name.trim(), filters as unknown as Record<string, string>, view);
                toast('View saved.', 'success');
              }}
              className="btn-ghost btn-sm"
            >
              <BookmarkPlus size={12} /> Save view
            </button>
            <button
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setStarredOnly(false);
                setShowArchived(false);
              }}
              className="btn-ghost btn-sm"
            >
              <X size={12} /> Clear ({activeFilterCount})
            </button>
          </>
        )}
      </div>

      {store.savedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 mr-1">
            Saved
          </span>
          {store.savedViews.map(v => (
            <span key={v.id} className="chip group">
              <button
                onClick={() => {
                  setFilters({ ...EMPTY_FILTERS, ...(v.filters as unknown as Filters) });
                  setView(v.view);
                }}
                className="inline-flex items-center gap-1.5"
              >
                <Bookmark size={10} /> {v.name}
              </button>
              <button
                onClick={() => deleteSavedView(v.id)}
                className="opacity-0 group-hover:opacity-100 text-light-400 hover:text-red-500 transition-opacity"
                aria-label={`Delete ${v.name}`}
              >
                <Trash2 size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* content */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      ) : error ? (
        <div className="card p-12 text-center">
          <AlertTriangle size={26} className="mx-auto text-amber-500 mb-3" />
          <p className="text-sm text-light-800 dark:text-dark-100 mb-4">{error}</p>
          <button onClick={() => void refresh()} className="btn-secondary">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-light-200 dark:bg-dark-800 flex items-center justify-center mb-4">
            <Briefcase size={24} className="text-light-400 dark:text-dark-600" />
          </div>
          {applications.length === 0 ? (
            <>
              <h3 className="text-light-900 dark:text-white font-semibold text-lg mb-2">No applications yet</h3>
              <p className="text-sm text-light-600 dark:text-dark-300 mb-5 max-w-sm mx-auto">
                Add one yourself, or just tell Scout: “I applied to Stripe for a backend internship on LinkedIn today.”
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setEditApp(null);
                    setShowForm(true);
                  }}
                  className="btn-primary"
                >
                  <Plus size={15} /> Add application
                </button>
                <button onClick={() => emitUi({ type: 'open-assistant' })} className="btn-secondary">
                  <Sparkles size={15} /> Ask Scout to add it
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-light-900 dark:text-white font-semibold text-lg mb-2">Nothing matches</h3>
              <p className="text-sm text-light-600 dark:text-dark-300">Loosen a filter and try again.</p>
            </>
          )}
        </div>
      ) : view === 'board' ? (
        <BoardView
          applications={filtered}
          interviewsMap={interviewsMap}
          onOpen={setDetailApp}
          onAdd={() => {
            setEditApp(null);
            setShowForm(true);
          }}
        />
      ) : view === 'table' ? (
        <TableView applications={filtered} interviewsMap={interviewsMap} onOpen={setDetailApp} />
      ) : view === 'timeline' ? (
        <TimelineView applications={filtered} interviewsMap={interviewsMap} onOpen={setDetailApp} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(app => (
            <ApplicationCard
              key={app.id}
              application={app}
              interviews={interviewsMap[app.id] || []}
              onClick={() => setDetailApp(app)}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-[11px] text-light-500 dark:text-dark-400 mt-4">
          Showing {filtered.length} of {applications.length} applications
        </p>
      )}

      {/* modals */}
      {showForm && (
        <ApplicationForm
          onClose={closeForm}
          onSave={handleSave}
          initial={editApp}
          learnings={editApp ? editLearnings : undefined}
          prefill={editApp ? null : prefill}
        />
      )}

      {detailApp && !showForm && (
        <ApplicationDetail
          application={detailApp}
          onClose={() => setDetailApp(null)}
          onEdit={() => openEdit(detailApp)}
          onDelete={async () => {
            await deleteApplication(detailApp.id);
            setDetailApp(null);
          }}
        />
      )}
    </PageShell>
  );
}
