import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowUpDown,
  Bookmark,
  BookmarkPlus,
  Briefcase,
  CalendarClock,
  CalendarPlus,
  Columns3,
  Copy,
  Flame,
  FolderKanban,
  Gauge,
  Layers,
  LayoutGrid,
  Lightbulb,
  List,
  Maximize2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table2,
  Trash2,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../hooks/useStore';
import type { Application, ApplicationInsert, InterviewDateInsert, InterviewLearning } from '../lib/supabase';
import {
  computeAnalytics,
  orderedStages,
  stageLabel,
  stageOf,
  weeklyWrapped,
} from '../lib/insights';
import ApplicationCard from '../components/ApplicationCard';
import ApplicationForm from '../components/ApplicationForm';
import ApplicationDetail from '../components/ApplicationDetail';
import PrintAllButton from '../components/PrintAllButton';
import BoardView from '../components/views/BoardView';
import TableView from '../components/views/TableView';
import TimelineView from '../components/views/TimelineView';
import PageShell from '../components/PageShell';
import { Sparkline } from '../components/ui/Charts';
import BentoTile, { StatTile } from '../components/ui/BentoTile';
import NowStrip from '../components/NowStrip';
import FocusMode from '../components/FocusMode';
import CompareView from '../components/CompareView';
import WrappedCard from '../components/WrappedCard';
import QuickAdd from '../components/QuickAdd';
import Onboarding from '../components/Onboarding';
import EmptyState from '../components/ui/EmptyArt';
import {
  addAppTemplate,
  deleteAppTemplate,
  deleteSavedView,
  markBackupTaken,
  savePreferences,
  saveView,
  toggleApplicationTag,
  toggleArchive,
  toggleStar,
  type SwimlaneId,
} from '../lib/store';
import { consumePending, emitUi, onUi, setDashboardMounted, toast, type UiEvent } from '../lib/uiBus';
import { daysSince, ts } from '../lib/format';
import { pushUndo } from '../lib/undo';
import { buildWorkspaceIcs, downloadIcs } from '../lib/ics';
import { tipOfTheDay } from '../lib/tips';
import { play } from '../lib/fx';

const VIEWS = [
  { id: 'board', label: 'Board', icon: FolderKanban },
  { id: 'grid', label: 'Cards', icon: LayoutGrid },
  { id: 'table', label: 'Table', icon: Table2 },
  { id: 'timeline', label: 'Timeline', icon: List },
] as const;

const STATUS_OPTIONS = ['', 'Pending', 'Viewed', 'Rejected', 'Shortlisted', 'Offered'];

const SWIMLANES: { value: SwimlaneId; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'platform', label: 'Group by platform' },
  { value: 'tag', label: 'Group by tag' },
  { value: 'priority', label: 'Group by priority' },
];

const SORTS = [
  { value: 'recent', label: 'Newest applied' },
  { value: 'oldest', label: 'Oldest applied' },
  { value: 'interview_closest', label: 'Interview soonest' },
  { value: 'company', label: 'Company A–Z' },
  { value: 'quiet', label: 'Quietest first' },
  { value: 'priority', label: 'Priority first' },
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [focusApp, setFocusApp] = useState<Application | null>(null);
  const [compareIds, setCompareIds] = useState<string[] | null>(null);
  const [showWrapped, setShowWrapped] = useState(false);
  const [quickAddText, setQuickAddText] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

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
      } else if (e.type === 'open-focus') {
        const app = applications.find(a => a.id === e.id);
        if (app) {
          setDetailApp(null);
          setShowForm(false);
          setFocusApp(app);
        }
      } else if (e.type === 'compare') {
        const ids = e.ids.filter(id => applications.some(a => a.id === id));
        if (ids.length >= 2) setCompareIds(ids.slice(0, 3));
        else toast('Pick two or three applications to compare.', 'info');
      } else if (e.type === 'open-wrapped') {
        setShowWrapped(true);
      } else if (e.type === 'quick-add') {
        setQuickAddText(e.text || '');
      } else if (e.type === 'open-onboarding') {
        setShowOnboarding(true);
      } else if (e.type === 'set-swimlane') {
        savePreferences({ swimlane: e.swimlane });
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

  // First run: show the guided setup once, and never again after it completes.
  useEffect(() => {
    if (!loading && !store.preferences.onboarded) setShowOnboarding(true);
  }, [loading, store.preferences.onboarded]);

  /**
   * Local-backup nudge.
   *
   * The richest data — tags, notes, contacts, automations, AI threads — lives
   * only in this browser's storage, so a periodic reminder to export it is the
   * difference between a backup and a hope.
   */
  useEffect(() => {
    if (loading) return;
    const { backupNudgeDays, lastBackupAt, onboarded } = store.preferences;
    if (!backupNudgeDays || !onboarded) return;
    const since = daysSince(lastBackupAt);
    if (since !== null && since < backupNudgeDays) return;
    if (since === null && applications.length < 5) return;
    const id = window.setTimeout(() => {
      toast(
        since === null
          ? 'Your workspace has never been exported. Settings → Data has a one-click backup.'
          : `It has been ${since} days since your last workspace export.`,
        'info',
      );
      // Snooze by recording the nudge itself, so it is not shown every visit.
      markBackupTaken();
    }, 4000);
    return () => window.clearTimeout(id);
  }, [loading, store.preferences, applications.length]);

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
      if (store.preferences.activeSeason && store.seasonOf[app.id] !== store.preferences.activeSeason) return false;
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
        case 'priority':
          return (store.priorities[b.id] || 0) - (store.priorities[a.id] || 0);
        default:
          return ts(b.date_applied || b.created_at) - ts(a.date_applied || a.created_at);
      }
    });
  }, [applications, filters, sortBy, showArchived, starredOnly, store, interviewsMap]);

  const activeFilterCount =
    Object.values(filters).filter(Boolean).length + (starredOnly ? 1 : 0) + (showArchived ? 1 : 0);

  // Selection only makes sense in table view, and must never point at a row that scrolled out of the filtered set.
  useEffect(() => {
    if (view !== 'table') {
      setSelectedIds(prev => (prev.size ? new Set() : prev));
      return;
    }
    const visible = new Set(filtered.map(a => a.id));
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [view, filtered]);

  const toggleSelect = useCallback((id: string) => {
    setConfirmBulkDelete(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[]) => {
    setConfirmBulkDelete(false);
    setSelectedIds(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, []);

  const selectedApps = useMemo(() => applications.filter(a => selectedIds.has(a.id)), [applications, selectedIds]);

  const bulkStar = () => {
    selectedApps.forEach(a => {
      if (!store.starred.includes(a.id)) toggleStar(a.id);
    });
    toast(`Starred ${selectedApps.length} application${selectedApps.length === 1 ? '' : 's'}.`, 'success');
  };

  const bulkArchiveToggle = () => {
    const allArchived = selectedApps.every(a => store.archived.includes(a.id));
    const touched = selectedApps.filter(a => (allArchived ? store.archived.includes(a.id) : !store.archived.includes(a.id)));
    touched.forEach(a => toggleArchive(a.id));
    pushUndo(
      `${allArchived ? 'Unarchived' : 'Archived'} ${touched.length} application${touched.length === 1 ? '' : 's'}.`,
      () => touched.forEach(a => toggleArchive(a.id)),
    );
    setSelectedIds(new Set());
  };

  /** Saves the current selection's shape as a reusable template. */
  const saveAsTemplate = (app: Application) => {
    const name = window.prompt('Name this template', `${app.role_applied_to || app.company_name} template`);
    if (!name?.trim()) return;
    addAppTemplate({
      name: name.trim(),
      patch: {
        role_applied_to: app.role_applied_to,
        platform_applied_on: app.platform_applied_on,
        resume_used: app.resume_used,
        cover_letter_used: app.cover_letter_used,
        salary_info: app.salary_info,
      },
      tagIds: store.applicationTags.filter(at => at.application_id === app.id).map(at => at.tag_id),
    });
    toast('Template saved — spawn a new application from it any time.', 'success');
  };

  const bulkTag = (tagId: string) => {
    if (!tagId) return;
    selectedApps.forEach(a => {
      if (!store.applicationTags.some(at => at.application_id === a.id && at.tag_id === tagId)) {
        toggleApplicationTag(a.id, tagId);
      }
    });
    toast(`Tagged ${selectedApps.length} application${selectedApps.length === 1 ? '' : 's'}.`, 'success');
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(ids.map(id => deleteApplication(id)));
    const failed = results.filter(r => r.status === 'rejected').length;
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    setSelectedIds(new Set());
    if (detailApp && ids.includes(detailApp.id)) setDetailApp(null);
    if (failed) toast(`Deleted ${ids.length - failed} of ${ids.length}. ${failed} failed.`, 'error');
    else toast(`Deleted ${ids.length} application${ids.length === 1 ? '' : 's'}.`, 'success');
  };

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

  const nextInterview = analytics.upcomingInterviews[0];
  const nextInterviewDays = nextInterview
    ? Math.max(0, Math.ceil((ts(nextInterview.interview.interview_date) - Date.now()) / 86_400_000))
    : null;
  const wrapped = useMemo(
    () => weeklyWrapped(applications, interviewsMap, analytics),
    [applications, interviewsMap, analytics],
  );
  const tip = useMemo(() => tipOfTheDay(), []);
  const stages = useMemo(() => orderedStages(store.preferences), [store.preferences]);

  const exportCalendar = () => {
    const ics = buildWorkspaceIcs(applications, interviewsMap, store);
    downloadIcs('interntrack-calendar', ics);
    toast('Calendar exported — open it to add everything to Google, Apple or Outlook.', 'success');
  };

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
          {analytics.upcomingInterviews[0] && (
            <button
              onClick={() => setFocusApp(analytics.upcomingInterviews[0].app)}
              className="btn-secondary hidden md:inline-flex"
              title="Distraction-free prep for your next interview"
            >
              <Maximize2 size={14} /> Focus
            </button>
          )}
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
      <NowStrip />

      {/* bento hero: variable-sized tiles instead of a uniform stat row */}
      <div className="bento mb-5">
        <BentoTile label="Momentum" icon={Gauge} span="wide" accent>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-4xl font-bold tabular-nums leading-none text-light-900 dark:text-white animate-count-up">
                {analytics.momentum}
                <span className="text-lg font-semibold text-light-500 dark:text-dark-400">/100</span>
              </p>
              <p className="text-[11px] text-light-600 dark:text-dark-300 mt-1.5 leading-snug max-w-[13rem]">
                {analytics.thisWeek} out this week · {analytics.interviewRate}% reach an interview ·{' '}
                {analytics.streak} day streak
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <Sparkline values={analytics.byWeek.map(w => w.count)} height={44} />
            </div>
          </div>
          <button
            onClick={() => emitUi({ type: 'navigate', to: '/insights' })}
            className="mt-2 text-[11px] font-semibold text-primary-700 dark:text-primary-300 hover:underline self-start"
          >
            See why →
          </button>
        </BentoTile>

        {nextInterview ? (
          <BentoTile label="Next interview" icon={CalendarClock} onClick={() => setDetailApp(nextInterview.app)}>
            <p className="text-3xl font-bold tabular-nums leading-none text-primary-600 dark:text-primary-400 animate-count-up">
              {nextInterviewDays === 0 ? 'Today' : `${nextInterviewDays}d`}
            </p>
            <p className="text-xs font-semibold text-light-900 dark:text-white mt-1.5 truncate">
              {nextInterview.app.company_name}
            </p>
            <p className="text-[11px] text-light-500 dark:text-dark-400 truncate">
              {nextInterview.interview.label || 'Interview'}
            </p>
          </BentoTile>
        ) : (
          <StatTile label="Interviewing" value={analytics.byStage.Interviewing} icon={CalendarClock} tone="text-primary-600 dark:text-primary-400" hint="No dates logged yet" />
        )}

        <StatTile label="Active" value={analytics.active} icon={Briefcase} />
        <StatTile
          label="Offers"
          value={analytics.offers}
          icon={TrendingUp}
          tone="text-emerald-600 dark:text-emerald-400"
          hint={analytics.offers > 1 ? 'Compare them side by side' : undefined}
          onClick={
            analytics.offers > 1
              ? () =>
                  setCompareIds(
                    applications
                      .filter(a => stageOf(a, store.stageOverrides) === 'Offer')
                      .slice(0, 3)
                      .map(a => a.id),
                  )
              : undefined
          }
        />
        <StatTile
          label="Need follow-up"
          value={analytics.stale.length}
          icon={AlertTriangle}
          tone={analytics.stale.length ? 'text-amber-600 dark:text-amber-400' : undefined}
          hint={analytics.stale.length ? `Longest: ${analytics.stale[0].app.company_name}` : 'Nothing overdue'}
          onClick={
            analytics.stale.length
              ? () =>
                  emitUi({
                    type: 'open-assistant',
                    prompt: 'Find every application that has gone quiet and schedule follow-up reminders for each.',
                  })
              : undefined
          }
        />

        <BentoTile label="This week" icon={Flame} onClick={() => setShowWrapped(true)}>
          <p className="text-3xl font-bold tabular-nums leading-none text-light-900 dark:text-white animate-count-up">
            {analytics.thisWeek}
          </p>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1.5 leading-snug">
            {wrapped.delta === 0
              ? 'Level with last week'
              : wrapped.delta > 0
                ? `Up ${wrapped.delta} on last week`
                : `Down ${Math.abs(wrapped.delta)} on last week`}
          </p>
          <span className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 mt-1 inline-flex items-center gap-1">
            <Trophy size={11} /> Week in review
          </span>
        </BentoTile>

        {analytics.total === 0 ? (
          <BentoTile label="Tip of the day" icon={Lightbulb} span="wide">
            <p className="text-xs text-light-700 dark:text-dark-200 leading-relaxed">{tip.tip}</p>
            <p className="text-[10px] uppercase tracking-wide text-light-500 dark:text-dark-400 mt-1.5">{tip.source}</p>
          </BentoTile>
        ) : (
          <BentoTile label="Pipeline" icon={Columns3} span="wide">
            <div className="flex items-end gap-1.5 h-12">
              {stages.map(stage => {
                const count = analytics.byStage[stage] || 0;
                const max = Math.max(1, ...stages.map(s => analytics.byStage[s] || 0));
                return (
                  <button
                    key={stage}
                    onClick={() => setFilters(fl => ({ ...fl, stage: fl.stage === stage ? '' : stage }))}
                    title={`${stageLabel(stage, store.preferences)}: ${count}`}
                    className="flex-1 flex flex-col items-center justify-end gap-1 group"
                  >
                    <span className="text-[10px] font-bold tabular-nums text-light-700 dark:text-dark-200">{count}</span>
                    <span
                      className="w-full rounded-t bg-gradient-to-t from-primary-500 to-accent-400 group-hover:opacity-80 transition-opacity"
                      style={{ height: `${Math.max((count / max) * 30, count ? 3 : 1)}px`, opacity: count ? 1 : 0.2 }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1">
              {stages.map(stage => (
                <span key={stage} className="flex-1 text-[8.5px] text-center text-light-500 dark:text-dark-400 truncate">
                  {stageLabel(stage, store.preferences).slice(0, 8)}
                </span>
              ))}
            </div>
          </BentoTile>
        )}
      </div>

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

        {view === 'board' && (
          <select
            value={store.preferences.swimlane}
            onChange={e => savePreferences({ swimlane: e.target.value as SwimlaneId })}
            className="input-field !w-auto !py-2 !px-3 !text-xs appearance-none"
            aria-label="Board grouping"
          >
            {SWIMLANES.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}

        <button onClick={() => setQuickAddText('')} className="btn-secondary btn-sm" title="Paste a job posting">
          <Sparkles size={12} /> <span className="hidden lg:inline">Quick add</span>
        </button>

        <button onClick={exportCalendar} className="btn-secondary btn-sm" title="Download interviews and reminders as .ics">
          <CalendarPlus size={12} /> <span className="hidden lg:inline">Calendar</span>
        </button>

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
          {stages.map(s => (
            <option key={s} value={s}>
              {stageLabel(s, store.preferences)}
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

      {(store.seasons.length > 0 || store.appTemplates.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {store.seasons.length > 0 && (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 mr-1 inline-flex items-center gap-1">
                <Layers size={11} /> Season
              </span>
              <button
                onClick={() => savePreferences({ activeSeason: '' })}
                className={`btn-secondary btn-sm ${!store.preferences.activeSeason ? '!border-primary-400 !text-primary-600 dark:!text-primary-400' : ''}`}
              >
                All
              </button>
              {store.seasons.map(season => (
                <button
                  key={season.id}
                  onClick={() => savePreferences({ activeSeason: season.id })}
                  className={`btn-secondary btn-sm ${store.preferences.activeSeason === season.id ? '!border-primary-400 !text-primary-600 dark:!text-primary-400' : ''}`}
                >
                  {season.name}
                </button>
              ))}
            </>
          )}
          {store.appTemplates.length > 0 && (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 ml-2 mr-1 inline-flex items-center gap-1">
                <Copy size={11} /> Templates
              </span>
              {store.appTemplates.map(tpl => (
                <span key={tpl.id} className="chip group">
                  <button
                    onClick={() => {
                      setEditApp(null);
                      setEditLearnings(null);
                      setPrefill(tpl.patch as Partial<ApplicationInsert>);
                      setShowForm(true);
                    }}
                    className="inline-flex items-center gap-1.5"
                  >
                    {tpl.name}
                  </button>
                  <button
                    onClick={() => deleteAppTemplate(tpl.id)}
                    className="opacity-0 group-hover:opacity-100 text-light-400 hover:text-red-500 transition-opacity"
                    aria-label={`Delete ${tpl.name}`}
                  >
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}
            </>
          )}
        </div>
      )}

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
        <div className="card">
          {applications.length === 0 ? (
            <EmptyState
              art="inbox"
              title="No applications yet"
              hint="Add one yourself, paste a posting for Scout to read, or just say: “I applied to Stripe for a backend internship on LinkedIn today.”"
              action={
                <>
                  <button
                    onClick={() => {
                      setEditApp(null);
                      setShowForm(true);
                    }}
                    className="btn-primary"
                  >
                    <Plus size={15} /> Add application
                  </button>
                  <button onClick={() => setQuickAddText('')} className="btn-secondary">
                    <Sparkles size={15} /> Paste a posting
                  </button>
                </>
              }
            />
          ) : (
            <EmptyState
              art="search"
              title="Nothing matches"
              hint="Loosen a filter and try again."
              action={
                <button
                  onClick={() => {
                    setFilters(EMPTY_FILTERS);
                    setStarredOnly(false);
                    setShowArchived(false);
                  }}
                  className="btn-secondary"
                >
                  <X size={14} /> Clear filters
                </button>
              }
            />
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
        <>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 rounded-xl border border-primary-300 dark:border-primary-900 bg-primary-50 dark:bg-primary-950/30">
              <span className="text-xs font-semibold text-primary-800 dark:text-primary-200 px-1.5">
                {selectedIds.size} selected
              </span>
              <button onClick={bulkStar} className="btn-secondary btn-sm">
                <Star size={12} /> Star
              </button>
              <button onClick={bulkArchiveToggle} className="btn-secondary btn-sm">
                <Archive size={12} /> {selectedApps.every(a => store.archived.includes(a.id)) ? 'Unarchive' : 'Archive'}
              </button>
              {store.tags.length > 0 && (
                <select
                  defaultValue=""
                  onChange={e => {
                    bulkTag(e.target.value);
                    e.target.value = '';
                  }}
                  className="input-field !w-auto !py-1.5 !text-xs"
                >
                  <option value="" disabled>
                    Add tag…
                  </option>
                  {store.tags.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {selectedApps.length >= 2 && selectedApps.length <= 3 && (
                <button onClick={() => setCompareIds(selectedApps.map(a => a.id))} className="btn-secondary btn-sm">
                  <Columns3 size={12} /> Compare
                </button>
              )}
              {selectedApps.length === 1 && (
                <button onClick={() => saveAsTemplate(selectedApps[0])} className="btn-secondary btn-sm">
                  <Copy size={12} /> Save as template
                </button>
              )}
              <PrintAllButton applications={selectedApps} />
              {confirmBulkDelete ? (
                <span className="flex items-center gap-1.5">
                  <button onClick={() => void bulkDelete()} disabled={bulkDeleting} className="btn-danger btn-sm">
                    {bulkDeleting ? 'Deleting…' : 'Confirm delete'}
                  </button>
                  <button onClick={() => setConfirmBulkDelete(false)} className="btn-ghost btn-sm">
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmBulkDelete(true)} className="btn-danger btn-sm">
                  <Trash2 size={12} /> Delete
                </button>
              )}
              <button onClick={() => setSelectedIds(new Set())} className="btn-ghost btn-sm ml-auto">
                <X size={12} /> Clear
              </button>
            </div>
          )}
          <TableView
            applications={filtered}
            interviewsMap={interviewsMap}
            onOpen={setDetailApp}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        </>
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

      {detailApp && !showForm && !focusApp && (
        <ApplicationDetail
          application={detailApp}
          onClose={() => setDetailApp(null)}
          onEdit={() => openEdit(detailApp)}
          onFocus={() => {
            setFocusApp(detailApp);
            setDetailApp(null);
          }}
          onDelete={async () => {
            const snapshot = detailApp;
            await deleteApplication(snapshot.id);
            setDetailApp(null);
            play('click');
            // Recreating gives a new row id, so undo restores the record's content
            // rather than its identity — which is what the user actually wants back.
            pushUndo(`Deleted ${snapshot.company_name}.`, async () => {
              await createApplication({
                company_name: snapshot.company_name,
                company_description: snapshot.company_description,
                resume_used: snapshot.resume_used,
                cover_letter_used: snapshot.cover_letter_used,
                response_status: snapshot.response_status,
                interview_offered: snapshot.interview_offered,
                final_status: snapshot.final_status,
                date_applied: snapshot.date_applied,
                salary_info: snapshot.salary_info,
                interview_questions: snapshot.interview_questions,
                tasks_to_complete: snapshot.tasks_to_complete,
                resume_path: snapshot.resume_path,
                cover_letter_path: snapshot.cover_letter_path,
                role_applied_to: snapshot.role_applied_to,
                platform_applied_on: snapshot.platform_applied_on,
              });
            });
          }}
        />
      )}

      {focusApp && (
        <FocusMode
          application={focusApp}
          interviews={interviewsMap[focusApp.id] || []}
          onClose={() => setFocusApp(null)}
        />
      )}

      {compareIds && compareIds.length >= 2 && (
        <CompareView
          applications={applications.filter(a => compareIds.includes(a.id))}
          interviewsMap={interviewsMap}
          onClose={() => setCompareIds(null)}
          onOpen={app => {
            setCompareIds(null);
            setDetailApp(app);
          }}
        />
      )}

      {showWrapped && <WrappedCard data={wrapped} onClose={() => setShowWrapped(false)} />}

      {quickAddText !== null && <QuickAdd initialText={quickAddText} onClose={() => setQuickAddText(null)} />}

      {showOnboarding && <Onboarding onClose={() => setShowOnboarding(false)} />}
    </PageShell>
  );
}
