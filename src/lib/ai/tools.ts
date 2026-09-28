/**
 * The assistant's tool surface. These give the model read *and* write access to
 * every part of InternTrack: applications, interviews, reminders, tasks, notes,
 * contacts, tags, goals, analytics, exports and the UI itself.
 */

import type { Application, ApplicationInsert, InterviewDate, InterviewLearning } from '../supabase';
import type { ToolSchema } from './providers';
import {
  addAutomationRule,
  addContact,
  addScoutMemory,
  addSrsCards,
  addStarStory,
  addNote,
  addReminder,
  addResumeVersion,
  addTask,
  deleteAutomationRule,
  deleteReminder,
  logActivity,
  read,
  savePreferences,
  setGoal,
  setPriority,
  setStage,
  toggleApplicationTag,
  toggleArchive,
  toggleAutomationRule,
  toggleStar,
  updateReminder,
  touchContact,
  upsertTag,
  type AutomationActionType,
  type AutomationTriggerType,
  type ReminderKind,
} from '../store';
import { evaluateAutomations } from '../automation';
import {
  computeAnalytics,
  offerProjection,
  stageOf,
  stagePatch,
  STAGES,
  timingInsight,
  weeklyWrapped,
  type Stage,
} from '../insights';
import { emitDeferrable, emitUi } from '../uiBus';
import { dayKey, fmtDate, ts } from '../format';
import { matchResumeToJd, matchVerdict } from '../match';
import { findDuplicatePairs, findDuplicates } from '../duplicates';
import { buildIcs, downloadIcs, interviewEvent } from '../ics';
import { extractQuestions } from '../srs';

export type ToolBridge = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  learningsMap: Record<string, InterviewLearning>;
  createApplication: (data: ApplicationInsert) => Promise<Application>;
  updateApplication: (id: string, patch: Partial<ApplicationInsert>) => Promise<Application>;
  deleteApplication: (id: string) => Promise<void>;
  addInterviewDate: (applicationId: string, isoDate: string, label?: string) => Promise<InterviewDate>;
  refresh: () => Promise<void>;
};

type Args = Record<string, unknown>;

const str = (a: Args, k: string, d = '') => (typeof a[k] === 'string' ? (a[k] as string).trim() : d);
const num = (a: Args, k: string, d: number) => (typeof a[k] === 'number' && Number.isFinite(a[k]) ? (a[k] as number) : d);
const bool = (a: Args, k: string, d = false) => (typeof a[k] === 'boolean' ? (a[k] as boolean) : d);
const list = (a: Args, k: string): string[] => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : []);

function ok(payload: unknown) {
  return JSON.stringify(payload);
}

function parseWhen(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const base = new Date();
  const relative = /^in\s+(\d+)\s*(hour|hours|day|days|week|weeks|month|months)$/.exec(lower);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2];
    const d = new Date(base);
    if (unit.startsWith('hour')) d.setHours(d.getHours() + n);
    else if (unit.startsWith('day')) d.setDate(d.getDate() + n);
    else if (unit.startsWith('week')) d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return d.toISOString();
  }
  if (lower === 'today') return base.toISOString();
  if (lower === 'tomorrow') {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  if (lower === 'next week') {
    const d = new Date(base);
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T09:00:00` : trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Resolve an application from an id, an exact name, or a fuzzy company match. */
function resolveApp(bridge: ToolBridge, ref: string): Application | null {
  if (!ref) return null;
  const needle = ref.trim().toLowerCase();
  const byId = bridge.applications.find(a => a.id === ref);
  if (byId) return byId;
  const exact = bridge.applications.find(a => a.company_name.toLowerCase() === needle);
  if (exact) return exact;
  const partial = bridge.applications.filter(a => a.company_name.toLowerCase().includes(needle));
  if (partial.length) return partial[0];
  const byRole = bridge.applications.find(a => (a.role_applied_to || '').toLowerCase().includes(needle));
  return byRole || null;
}

function slim(app: Application, bridge: ToolBridge) {
  const s = read();
  const tagNames = s.applicationTags
    .filter(at => at.application_id === app.id)
    .map(at => s.tags.find(t => t.id === at.tag_id)?.name)
    .filter(Boolean);
  return {
    id: app.id,
    company: app.company_name,
    role: app.role_applied_to || null,
    platform: app.platform_applied_on || null,
    date_applied: app.date_applied,
    response_status: app.response_status,
    final_status: app.final_status,
    interview_offered: app.interview_offered,
    stage: stageOf(app, s.stageOverrides),
    starred: s.starred.includes(app.id),
    archived: s.archived.includes(app.id),
    tags: tagNames,
    interview_dates: (bridge.interviewsMap[app.id] || []).map(i => ({ label: i.label, date: i.interview_date })),
  };
}

/* ------------------------------ definitions ------------------------------ */

const S = {
  obj: (properties: Record<string, unknown>, required: string[] = []) => ({
    type: 'object' as const,
    properties,
    required,
  }),
  string: (description: string, enumValues?: string[]) =>
    enumValues ? { type: 'string', description, enum: enumValues } : { type: 'string', description },
  number: (description: string) => ({ type: 'number', description }),
  boolean: (description: string) => ({ type: 'boolean', description }),
  strings: (description: string) => ({ type: 'array', description, items: { type: 'string' } }),
};

const APP_REF = S.string('Application id, or the company name (fuzzy match is fine).');

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'get_overview',
    description:
      'Snapshot of the whole tracker: totals, conversion rates, stage counts, momentum score, streak, upcoming interviews, stale applications, goals, and open reminder/task counts. Call this first for any question about how the search is going.',
    parameters: S.obj({}),
  },
  {
    name: 'list_applications',
    description:
      'List applications with optional filters. Returns compact records including stage and tags. Use limit to keep results small.',
    parameters: S.obj({
      stage: S.string('Pipeline stage filter.', [...STAGES]),
      response_status: S.string('Response status filter.', ['Pending', 'Viewed', 'Rejected', 'Shortlisted', 'Offered']),
      final_status: S.string('Final status filter.', ['In Progress', 'Rejected', 'Accepted', 'Withdrawn']),
      platform: S.string('Platform substring, e.g. LinkedIn.'),
      company: S.string('Company name substring.'),
      tag: S.string('Tag name.'),
      starred_only: S.boolean('Only starred applications.'),
      include_archived: S.boolean('Include archived applications (default false).'),
      sort: S.string('Sort order.', ['recent', 'oldest', 'company', 'interview_soonest']),
      limit: S.number('Max results, default 25.'),
    }),
  },
  {
    name: 'get_application',
    description:
      'Full detail for one application: every stored field plus interview dates, learnings, notes, contacts, tasks, reminders and tags.',
    parameters: S.obj({ application: APP_REF }, ['application']),
  },
  {
    name: 'search',
    description:
      'Full-text search across applications, interview questions, learnings, notes and contacts. Use when the user references something you cannot locate by company name.',
    parameters: S.obj({ query: S.string('Search text.') }, ['query']),
  },
  {
    name: 'create_application',
    description:
      'Create a new application record. Only company is required; fill in whatever the user told you and leave the rest out.',
    parameters: S.obj(
      {
        company: S.string('Company name.'),
        role: S.string('Role applied to.'),
        platform: S.string('Where it was applied, e.g. LinkedIn, Internshala, referral.'),
        date_applied: S.string('Date applied (YYYY-MM-DD, "today", "in 2 days").'),
        response_status: S.string('Response status.', ['Pending', 'Viewed', 'Rejected', 'Shortlisted', 'Offered']),
        final_status: S.string('Final status.', ['In Progress', 'Rejected', 'Accepted', 'Withdrawn']),
        interview_offered: S.boolean('Whether an interview was offered.'),
        company_description: S.string('Short note about the company.'),
        salary_info: S.string('Stipend or salary details.'),
        resume_used: S.string('Which resume version was used.'),
        cover_letter_used: S.string('Cover letter used.'),
        interview_questions: S.string('Known interview questions.'),
        tasks_to_complete: S.string('Assignments or tasks to complete.'),
        tags: S.strings('Tag names to attach; created if new.'),
      },
      ['company'],
    ),
  },
  {
    name: 'update_application',
    description: 'Update fields on an existing application. Pass only the fields that change.',
    parameters: S.obj(
      {
        application: APP_REF,
        company: S.string('New company name.'),
        role: S.string('Role applied to.'),
        platform: S.string('Platform.'),
        date_applied: S.string('Date applied.'),
        response_status: S.string('Response status.', ['Pending', 'Viewed', 'Rejected', 'Shortlisted', 'Offered']),
        final_status: S.string('Final status.', ['In Progress', 'Rejected', 'Accepted', 'Withdrawn']),
        interview_offered: S.boolean('Interview offered.'),
        company_description: S.string('Company note.'),
        salary_info: S.string('Stipend or salary.'),
        resume_used: S.string('Resume version used.'),
        cover_letter_used: S.string('Cover letter used.'),
        interview_questions: S.string('Interview questions.'),
        tasks_to_complete: S.string('Tasks to complete.'),
      },
      ['application'],
    ),
  },
  {
    name: 'set_stage',
    description:
      'Move an application to a pipeline stage. This also syncs the underlying response/final status so the board and records agree.',
    parameters: S.obj({ application: APP_REF, stage: S.string('Target stage.', [...STAGES]) }, ['application', 'stage']),
  },
  {
    name: 'bulk_update_stage',
    description:
      'Move several applications to one stage in a single step. Good for "mark all pending Internshala applications as rejected".',
    parameters: S.obj(
      {
        applications: S.strings('Application ids or company names.'),
        stage: S.string('Target stage.', [...STAGES]),
      },
      ['applications', 'stage'],
    ),
  },
  {
    name: 'delete_application',
    description:
      'Permanently delete an application. Destructive — you must confirm with the user in a previous turn and pass confirm true.',
    parameters: S.obj({ application: APP_REF, confirm: S.boolean('Must be true.') }, ['application', 'confirm']),
  },
  {
    name: 'add_interview_date',
    description: 'Attach an interview date to an application, optionally with a round label.',
    parameters: S.obj(
      {
        application: APP_REF,
        date: S.string('Interview date/time (ISO, YYYY-MM-DD, "tomorrow", "in 3 days").'),
        label: S.string('Round label, e.g. "Round 1 — technical".'),
      },
      ['application', 'date'],
    ),
  },
  {
    name: 'list_interviews',
    description: 'All interview dates across applications, soonest first.',
    parameters: S.obj({ upcoming_only: S.boolean('Only future interviews (default true).') }),
  },
  {
    name: 'add_reminder',
    description:
      'Create a reminder. It shows in the notification centre, fires a browser notification when due, and appears on the calendar.',
    parameters: S.obj(
      {
        title: S.string('What to be reminded about.'),
        due: S.string('When (ISO, YYYY-MM-DD, "tomorrow", "in 3 days").'),
        application: S.string('Optional application id or company to link.'),
        kind: S.string('Reminder type.', ['follow_up', 'interview_prep', 'deadline', 'thank_you', 'custom']),
        notes: S.string('Extra detail.'),
      },
      ['title', 'due'],
    ),
  },
  {
    name: 'list_reminders',
    description: 'List reminders, soonest first.',
    parameters: S.obj({ include_done: S.boolean('Include completed reminders.') }),
  },
  {
    name: 'complete_reminder',
    description: 'Mark a reminder done, or delete it.',
    parameters: S.obj({ reminder_id: S.string('Reminder id.'), remove: S.boolean('Delete instead of completing.') }, [
      'reminder_id',
    ]),
  },
  {
    name: 'schedule_follow_ups',
    description:
      'Bulk-create follow-up reminders for every application that has gone quiet past the follow-up window. Returns what was scheduled.',
    parameters: S.obj({ days_quiet: S.number('Override the quiet threshold in days.') }),
  },
  {
    name: 'add_task',
    description: 'Add a checklist task, optionally linked to an application.',
    parameters: S.obj({ title: S.string('Task text.'), application: S.string('Optional application.'), due: S.string('Optional due date.') }, [
      'title',
    ]),
  },
  {
    name: 'list_tasks',
    description: 'List checklist tasks.',
    parameters: S.obj({ include_done: S.boolean('Include finished tasks.') }),
  },
  {
    name: 'add_note',
    description: 'Save a note. Link it to an application when it is company-specific.',
    parameters: S.obj({ body: S.string('Note text (markdown allowed).'), application: S.string('Optional application.'), pinned: S.boolean('Pin it.') }, [
      'body',
    ]),
  },
  {
    name: 'list_notes',
    description: 'List notes, newest first.',
    parameters: S.obj({ application: S.string('Filter to one application.') }),
  },
  {
    name: 'add_contact',
    description: 'Save a recruiter or referral contact.',
    parameters: S.obj(
      {
        name: S.string('Contact name.'),
        role: S.string('Their role/title.'),
        email: S.string('Email.'),
        phone: S.string('Phone.'),
        linkedin: S.string('LinkedIn URL.'),
        notes: S.string('Notes.'),
        application: S.string('Optional application to link.'),
      },
      ['name'],
    ),
  },
  {
    name: 'list_contacts',
    description: 'List saved contacts.',
    parameters: S.obj({}),
  },
  {
    name: 'tag_application',
    description: 'Add or remove tags on an application. Tags are created on demand.',
    parameters: S.obj({ application: APP_REF, add: S.strings('Tags to add.'), remove: S.strings('Tags to remove.') }, [
      'application',
    ]),
  },
  {
    name: 'star_application',
    description: 'Star/unstar or archive/unarchive an application.',
    parameters: S.obj({ application: APP_REF, star: S.boolean('Toggle star.'), archive: S.boolean('Toggle archive.') }, [
      'application',
    ]),
  },
  {
    name: 'set_goal',
    description: 'Set a weekly or monthly target the dashboard tracks against.',
    parameters: S.obj(
      {
        metric: S.string('What to track.', ['applications', 'interviews', 'offers', 'outreach']),
        target: S.number('Target count.'),
        period: S.string('Cadence.', ['week', 'month']),
      },
      ['metric', 'target'],
    ),
  },
  {
    name: 'add_resume_version',
    description: 'Save a resume variant in the resume library so applications can reference it.',
    parameters: S.obj({ label: S.string('Version label.'), description: S.string('What it targets.'), content: S.string('Optional pasted content.') }, [
      'label',
    ]),
  },
  {
    name: 'get_analytics',
    description:
      'Deeper analytics: per-platform conversion, weekly cadence for 12 weeks, monthly counts, top roles, and stage distribution.',
    parameters: S.obj({}),
  },
  {
    name: 'get_activity',
    description: 'Recent activity log entries for this workspace.',
    parameters: S.obj({ limit: S.number('Max entries, default 20.') }),
  },
  {
    name: 'navigate',
    description: 'Move the user to a page in the app.',
    parameters: S.obj({ route: S.string('Route.', ['/dashboard', '/insights', '/calendar', '/workspace', '/automations', '/settings', '/']) }, [
      'route',
    ]),
  },
  {
    name: 'set_view',
    description: 'Switch the dashboard layout.',
    parameters: S.obj({ view: S.string('Layout.', ['board', 'grid', 'table', 'timeline']) }, ['view']),
  },
  {
    name: 'set_filters',
    description: 'Apply dashboard filters so the user sees exactly the subset being discussed.',
    parameters: S.obj({
      search: S.string('Search text.'),
      status: S.string('Response status.'),
      platform: S.string('Platform.'),
      stage: S.string('Stage.'),
      tag: S.string('Tag name.'),
    }),
  },
  {
    name: 'open_application',
    description: 'Open an application detail panel for the user.',
    parameters: S.obj({ application: APP_REF }, ['application']),
  },
  {
    name: 'open_new_application_form',
    description: 'Open the add-application form, optionally pre-filled, when the user should finish entering details themselves.',
    parameters: S.obj({ company: S.string('Prefill company.'), role: S.string('Prefill role.'), platform: S.string('Prefill platform.') }),
  },
  {
    name: 'set_theme',
    description: 'Switch between light and dark appearance.',
    parameters: S.obj({ theme: S.string('Theme.', ['light', 'dark']) }, ['theme']),
  },
  {
    name: 'export_applications',
    description: 'Download the tracker. PDF and DOCX produce a formatted report; CSV and JSON produce raw data.',
    parameters: S.obj({ format: S.string('Format.', ['pdf', 'docx', 'csv', 'json']) }, ['format']),
  },
  {
    name: 'list_automations',
    description: 'List every automation rule (the "when X happens, do Y" engine on the Automations page), enabled state and run counts.',
    parameters: S.obj({}),
  },
  {
    name: 'create_automation',
    description:
      'Create an automation rule: one trigger and one resulting action, run automatically forever (checked every minute, zero cost). ' +
      'Use this whenever the user describes a recurring behaviour they want, e.g. "remind me automatically when an application goes quiet" or "notify me the day before interviews".',
    parameters: S.obj(
      {
        name: S.string('Short rule name.'),
        description: S.string('One sentence describing what it does.'),
        trigger_type: S.string('What starts the automation.', [
          'stale_no_response',
          'interview_upcoming',
          'task_overdue',
          'no_activity_days',
          'application_created',
          'stage_is',
          'weekly_digest',
        ]),
        trigger_days: S.number('Day threshold/lead time, used by stale_no_response, interview_upcoming, no_activity_days.'),
        trigger_stage: S.string('Stage name, used by stage_is.', [...STAGES]),
        action_type: S.string('What happens when it fires.', [
          'add_reminder',
          'add_task',
          'add_tag',
          'notify',
          'webhook',
          'set_stage',
          'archive',
          'add_note',
        ]),
        action_title: S.string('Title text for add_reminder/add_task. Supports {{company}}, {{role}}, {{days}}.'),
        action_body: S.string('Body/notes text for notify/webhook/add_note/add_reminder.'),
        action_tag: S.string('Tag name, used by add_tag.'),
        action_stage: S.string('Target stage, used by set_stage.', [...STAGES]),
        action_offset_days: S.number('Days from now to due-date, used by add_reminder/add_task.'),
      },
      ['name', 'trigger_type', 'action_type'],
    ),
  },
  {
    name: 'toggle_automation',
    description: 'Enable or disable an automation rule by name.',
    parameters: S.obj({ name: S.string('Automation rule name (fuzzy match is fine).'), enabled: S.boolean('Target state.') }, [
      'name',
      'enabled',
    ]),
  },
  {
    name: 'delete_automation',
    description: 'Permanently delete an automation rule by name.',
    parameters: S.obj({ name: S.string('Automation rule name (fuzzy match is fine).') }, ['name']),
  },
  {
    name: 'score_resume_against_jd',
    description:
      'Score a job description against a stored resume version (or pasted resume text) and report keyword coverage plus the terms the resume never mentions. Runs locally — no external call.',
    parameters: S.obj(
      {
        job_description: S.string('The full job posting text.'),
        resume_label: S.string('Label of a stored resume version to score against. Omit to use resume_text.'),
        resume_text: S.string('Raw resume text, if it is not stored as a version.'),
      },
      ['job_description'],
    ),
  },
  {
    name: 'find_duplicate_applications',
    description: 'Find applications that look like accidental double entries, by fuzzy company and role matching.',
    parameters: S.obj({
      company: S.string('Optional: check one company name against the tracker instead of scanning everything.'),
      role: S.string('Optional role to pair with company.'),
    }),
  },
  {
    name: 'suggest_next_companies',
    description:
      'Suggest where to apply next by pattern-matching the user\'s own platforms, roles and tags. Uses only their data — no web search.',
    parameters: S.obj({ limit: S.number('How many suggestions (default 6).') }),
  },
  {
    name: 'generate_ics_invite',
    description: 'Generate and download a calendar invite (.ics) for an application\'s upcoming interviews.',
    parameters: S.obj({ application: APP_REF }, ['application']),
  },
  {
    name: 'remember_preference',
    description:
      'Store a standing preference so you do not have to be told twice (e.g. "always use my Backend resume for SWE roles"). Injected into your context from then on.',
    parameters: S.obj({ note: S.string('The preference, in one short line.') }, ['note']),
  },
  {
    name: 'set_priority',
    description: 'Set how much the user wants a role, 1 (low) to 5 (dream). Separate from starring.',
    parameters: S.obj({ application: APP_REF, priority: S.number('1 to 5, or 0 to clear.') }, ['application', 'priority']),
  },
  {
    name: 'add_star_story',
    description: 'Save a reusable STAR story (Situation, Task, Action, Result) tagged by competency.',
    parameters: S.obj(
      {
        title: S.string('Short name for the story.'),
        competency: S.string('e.g. leadership, conflict, failure, ownership.'),
        situation: S.string('The situation.'),
        task: S.string('The task.'),
        action: S.string('What you did.'),
        result: S.string('The measurable result.'),
      },
      ['title'],
    ),
  },
  {
    name: 'create_prep_cards',
    description:
      'Turn interview questions into spaced-repetition flashcards for the Prep trainer. Pass questions directly, or an application to pull its stored questions from.',
    parameters: S.obj({
      application: APP_REF,
      questions: S.strings('Questions to drill.'),
    }),
  },
  {
    name: 'get_timing_patterns',
    description: 'Report whether the day of the week the user applies correlates with hearing back.',
    parameters: S.obj({}),
  },
  {
    name: 'get_projection',
    description: 'Project how many more applications are needed for one expected offer, from the user\'s own conversion rates.',
    parameters: S.obj({}),
  },
  {
    name: 'get_weekly_wrapped',
    description: 'The week in review: applications out, interviews, offers, best platform, streak.',
    parameters: S.obj({}),
  },
  {
    name: 'log_contact_outreach',
    description: 'Record that the user messaged a saved contact, which resets their follow-up clock.',
    parameters: S.obj({ name: S.string('Contact name.') }, ['name']),
  },
  {
    name: 'run_automations_now',
    description: 'Force an immediate automation check instead of waiting for the next minute — use after creating or editing a rule to show results right away.',
    parameters: S.obj({}),
  },
];

/* ------------------------------- execution ------------------------------- */

export async function executeTool(name: string, args: Args, bridge: ToolBridge): Promise<string> {
  const store = read();

  switch (name) {
    case 'get_overview': {
      const a = computeAnalytics(bridge.applications, bridge.interviewsMap, store, store.preferences.followUpDays);
      return ok({
        totals: { total: a.total, active: a.active, applied: a.applied, interviews: a.interviews, offers: a.offers, rejected: a.rejected },
        rates: { response: `${a.responseRate}%`, interview: `${a.interviewRate}%`, offer: `${a.offerRate}%` },
        avg_days_to_interview: a.avgResponseDays,
        stages: a.byStage,
        momentum_score: a.momentum,
        streak_days: a.streak,
        applications_this_week: a.thisWeek,
        applications_last_week: a.lastWeek,
        upcoming_interviews: a.upcomingInterviews.slice(0, 5).map(u => ({
          company: u.app.company_name,
          label: u.interview.label,
          date: fmtDate(u.interview.interview_date),
        })),
        needs_follow_up: a.stale.slice(0, 8).map(s => ({ company: s.app.company_name, days_quiet: s.days, id: s.app.id })),
        goals: store.goals.map(g => ({ metric: g.metric, target: g.target, period: g.period })),
        open_reminders: store.reminders.filter(r => !r.done).length,
        open_tasks: store.tasks.filter(t => !t.done).length,
        tags: store.tags.map(t => t.name),
        active_automations: store.automationRules.filter(r => r.enabled).length,
      });
    }

    case 'list_applications': {
      const limit = Math.max(1, Math.min(num(args, 'limit', 25), 100));
      const stage = str(args, 'stage');
      const tag = str(args, 'tag').toLowerCase();
      const tagId = tag ? store.tags.find(t => t.name.toLowerCase() === tag)?.id : undefined;

      let rows = bridge.applications.filter(app => {
        if (!bool(args, 'include_archived') && store.archived.includes(app.id)) return false;
        if (stage && stageOf(app, store.stageOverrides) !== stage) return false;
        if (str(args, 'response_status') && app.response_status !== str(args, 'response_status')) return false;
        if (str(args, 'final_status') && app.final_status !== str(args, 'final_status')) return false;
        if (str(args, 'platform') && !(app.platform_applied_on || '').toLowerCase().includes(str(args, 'platform').toLowerCase()))
          return false;
        if (str(args, 'company') && !app.company_name.toLowerCase().includes(str(args, 'company').toLowerCase())) return false;
        if (bool(args, 'starred_only') && !store.starred.includes(app.id)) return false;
        if (tag) {
          if (!tagId) return false;
          if (!store.applicationTags.some(at => at.application_id === app.id && at.tag_id === tagId)) return false;
        }
        return true;
      });

      const sort = str(args, 'sort', 'recent');
      if (sort === 'oldest') rows = rows.sort((a, b) => ts(a.date_applied) - ts(b.date_applied));
      else if (sort === 'company') rows = rows.sort((a, b) => a.company_name.localeCompare(b.company_name));
      else if (sort === 'interview_soonest')
        rows = rows.sort(
          (a, b) =>
            (ts(bridge.interviewsMap[a.id]?.[0]?.interview_date) || Infinity) -
            (ts(bridge.interviewsMap[b.id]?.[0]?.interview_date) || Infinity),
        );
      else rows = rows.sort((a, b) => ts(b.date_applied || b.created_at) - ts(a.date_applied || a.created_at));

      return ok({ count: rows.length, showing: Math.min(rows.length, limit), applications: rows.slice(0, limit).map(a => slim(a, bridge)) });
    }

    case 'get_application': {
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No application matched. Call list_applications to see available records.' });
      const learnings = bridge.learningsMap[app.id];
      return ok({
        ...app,
        stage: stageOf(app, store.stageOverrides),
        tags: store.applicationTags
          .filter(at => at.application_id === app.id)
          .map(at => store.tags.find(t => t.id === at.tag_id)?.name)
          .filter(Boolean),
        interview_dates: (bridge.interviewsMap[app.id] || []).map(i => ({ id: i.id, label: i.label, date: i.interview_date })),
        learnings: learnings ? { learnings: learnings.learnings, questions_asked: learnings.questions_asked } : null,
        notes: store.notes.filter(n => n.application_id === app.id).map(n => ({ id: n.id, body: n.body, created_at: n.created_at })),
        contacts: store.contacts.filter(c => c.application_id === app.id),
        tasks: store.tasks.filter(t => t.application_id === app.id).map(t => ({ id: t.id, title: t.title, done: t.done })),
        reminders: store.reminders
          .filter(r => r.application_id === app.id)
          .map(r => ({ id: r.id, title: r.title, due_at: r.due_at, done: r.done })),
      });
    }

    case 'search': {
      const q = str(args, 'query').toLowerCase();
      if (!q) return ok({ error: 'query is required' });
      const inText = (v?: string | null) => !!v && v.toLowerCase().includes(q);
      return ok({
        applications: bridge.applications
          .filter(
            a =>
              inText(a.company_name) ||
              inText(a.role_applied_to) ||
              inText(a.platform_applied_on) ||
              inText(a.company_description) ||
              inText(a.interview_questions) ||
              inText(a.tasks_to_complete) ||
              inText(a.salary_info) ||
              inText(a.resume_used),
          )
          .slice(0, 15)
          .map(a => slim(a, bridge)),
        learnings: Object.values(bridge.learningsMap)
          .filter(l => inText(l.learnings) || inText(l.questions_asked))
          .slice(0, 10)
          .map(l => ({
            company: bridge.applications.find(a => a.id === l.application_id)?.company_name,
            learnings: l.learnings,
            questions_asked: l.questions_asked,
          })),
        notes: store.notes.filter(n => inText(n.body)).slice(0, 10),
        contacts: store.contacts.filter(c => inText(c.name) || inText(c.role) || inText(c.email) || inText(c.notes)).slice(0, 10),
        tasks: store.tasks.filter(t => inText(t.title)).slice(0, 10),
      });
    }

    case 'create_application': {
      const company = str(args, 'company');
      if (!company) return ok({ error: 'company is required' });
      const dateApplied = str(args, 'date_applied') ? parseWhen(str(args, 'date_applied')) : new Date().toISOString();
      const created = await bridge.createApplication({
        company_name: company,
        company_description: str(args, 'company_description'),
        resume_used: str(args, 'resume_used'),
        cover_letter_used: str(args, 'cover_letter_used'),
        response_status: str(args, 'response_status', 'Pending'),
        interview_offered: bool(args, 'interview_offered'),
        final_status: str(args, 'final_status', 'In Progress'),
        date_applied: dateApplied ? dayKey(dateApplied) : null,
        salary_info: str(args, 'salary_info'),
        interview_questions: str(args, 'interview_questions'),
        tasks_to_complete: str(args, 'tasks_to_complete'),
        resume_path: '',
        cover_letter_path: '',
        role_applied_to: str(args, 'role'),
        platform_applied_on: str(args, 'platform'),
      });
      list(args, 'tags').forEach(t => {
        const tag = upsertTag(t);
        toggleApplicationTag(created.id, tag.id);
      });
      logActivity(`AI created ${created.company_name}`, { actor: 'ai', kind: 'create', application_id: created.id });
      return ok({ created: slim(created, bridge) });
    }

    case 'update_application': {
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No application matched.' });
      const patch: Partial<ApplicationInsert> = {};
      if ('company' in args && str(args, 'company')) patch.company_name = str(args, 'company');
      if ('role' in args) patch.role_applied_to = str(args, 'role');
      if ('platform' in args) patch.platform_applied_on = str(args, 'platform');
      if ('response_status' in args && str(args, 'response_status')) patch.response_status = str(args, 'response_status');
      if ('final_status' in args && str(args, 'final_status')) patch.final_status = str(args, 'final_status');
      if ('interview_offered' in args) patch.interview_offered = bool(args, 'interview_offered');
      if ('company_description' in args) patch.company_description = str(args, 'company_description');
      if ('salary_info' in args) patch.salary_info = str(args, 'salary_info');
      if ('resume_used' in args) patch.resume_used = str(args, 'resume_used');
      if ('cover_letter_used' in args) patch.cover_letter_used = str(args, 'cover_letter_used');
      if ('interview_questions' in args) patch.interview_questions = str(args, 'interview_questions');
      if ('tasks_to_complete' in args) patch.tasks_to_complete = str(args, 'tasks_to_complete');
      if ('date_applied' in args) {
        const when = parseWhen(str(args, 'date_applied'));
        patch.date_applied = when ? dayKey(when) : null;
      }
      if (!Object.keys(patch).length) return ok({ error: 'Nothing to update.' });
      const updated = await bridge.updateApplication(app.id, patch);
      logActivity(`AI updated ${updated.company_name}`, { actor: 'ai', kind: 'update', application_id: app.id });
      return ok({ updated: slim(updated, bridge), changed: Object.keys(patch) });
    }

    case 'set_stage': {
      const app = resolveApp(bridge, str(args, 'application'));
      const stage = str(args, 'stage') as Stage;
      if (!app) return ok({ error: 'No application matched.' });
      if (!(STAGES as readonly string[]).includes(stage)) return ok({ error: `stage must be one of ${STAGES.join(', ')}` });
      setStage(app.id, stage);
      const updated = await bridge.updateApplication(app.id, stagePatch(stage, app));
      logActivity(`AI moved ${app.company_name} to ${stage}`, { actor: 'ai', kind: 'stage', application_id: app.id });
      return ok({ application: updated.company_name, stage });
    }

    case 'bulk_update_stage': {
      const stage = str(args, 'stage') as Stage;
      if (!(STAGES as readonly string[]).includes(stage)) return ok({ error: `stage must be one of ${STAGES.join(', ')}` });
      const moved: string[] = [];
      const missed: string[] = [];
      for (const ref of list(args, 'applications')) {
        const app = resolveApp(bridge, ref);
        if (!app) {
          missed.push(ref);
          continue;
        }
        setStage(app.id, stage);
        await bridge.updateApplication(app.id, stagePatch(stage, app));
        moved.push(app.company_name);
      }
      logActivity(`AI moved ${moved.length} applications to ${stage}`, { actor: 'ai', kind: 'stage' });
      return ok({ moved, not_found: missed, stage });
    }

    case 'delete_application': {
      if (!bool(args, 'confirm')) return ok({ error: 'Refused: pass confirm true only after the user explicitly agreed.' });
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No application matched.' });
      await bridge.deleteApplication(app.id);
      logActivity(`AI deleted ${app.company_name}`, { actor: 'ai', kind: 'delete' });
      return ok({ deleted: app.company_name });
    }

    case 'add_interview_date': {
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No application matched.' });
      const when = parseWhen(str(args, 'date'));
      if (!when) return ok({ error: 'Could not understand the date.' });
      const iv = await bridge.addInterviewDate(app.id, when, str(args, 'label', 'Interview'));
      if (!app.interview_offered) await bridge.updateApplication(app.id, { interview_offered: true });
      logActivity(`AI scheduled interview for ${app.company_name}`, { actor: 'ai', kind: 'interview', application_id: app.id });
      return ok({ application: app.company_name, interview: { id: iv.id, label: iv.label, date: iv.interview_date } });
    }

    case 'list_interviews': {
      const upcomingOnly = bool(args, 'upcoming_only', true);
      const rows: { company: string; label: string; date: string; application_id: string }[] = [];
      bridge.applications.forEach(app => {
        (bridge.interviewsMap[app.id] || []).forEach(iv => {
          if (upcomingOnly && ts(iv.interview_date) < Date.now() - 86_400_000) return;
          rows.push({ company: app.company_name, label: iv.label, date: iv.interview_date, application_id: app.id });
        });
      });
      rows.sort((a, b) => ts(a.date) - ts(b.date));
      return ok({ count: rows.length, interviews: rows.slice(0, 40) });
    }

    case 'add_reminder': {
      const when = parseWhen(str(args, 'due'));
      if (!when) return ok({ error: 'Could not understand the due date.' });
      const app = str(args, 'application') ? resolveApp(bridge, str(args, 'application')) : null;
      const r = addReminder({
        title: str(args, 'title'),
        due_at: when,
        notes: str(args, 'notes'),
        kind: (str(args, 'kind', 'custom') as ReminderKind) || 'custom',
        application_id: app?.id ?? null,
      });
      logActivity(`AI set reminder: ${r.title}`, { actor: 'ai', kind: 'reminder', application_id: app?.id ?? null });
      return ok({ reminder: { id: r.id, title: r.title, due_at: r.due_at, linked_to: app?.company_name ?? null } });
    }

    case 'list_reminders': {
      const rows = store.reminders
        .filter(r => bool(args, 'include_done') || !r.done)
        .sort((a, b) => ts(a.due_at) - ts(b.due_at))
        .map(r => ({
          id: r.id,
          title: r.title,
          due_at: r.due_at,
          kind: r.kind,
          done: r.done,
          company: bridge.applications.find(a => a.id === r.application_id)?.company_name ?? null,
        }));
      return ok({ count: rows.length, reminders: rows.slice(0, 50) });
    }

    case 'complete_reminder': {
      const id = str(args, 'reminder_id');
      if (!store.reminders.some(r => r.id === id)) return ok({ error: 'Reminder not found.' });
      if (bool(args, 'remove')) deleteReminder(id);
      else updateReminder(id, { done: true });
      return ok({ ok: true, removed: bool(args, 'remove') });
    }

    case 'schedule_follow_ups': {
      const threshold = num(args, 'days_quiet', store.preferences.followUpDays);
      const a = computeAnalytics(bridge.applications, bridge.interviewsMap, store, threshold);
      const created: { company: string; due: string }[] = [];
      a.stale.forEach(({ app, days }) => {
        const already = read().reminders.some(r => r.application_id === app.id && r.kind === 'follow_up' && !r.done);
        if (already) return;
        const due = new Date();
        due.setDate(due.getDate() + 1);
        due.setHours(10, 0, 0, 0);
        const r = addReminder({
          title: `Follow up with ${app.company_name}`,
          due_at: due.toISOString(),
          kind: 'follow_up',
          notes: `No response ${days} days after applying.`,
          application_id: app.id,
        });
        created.push({ company: app.company_name, due: r.due_at });
      });
      logActivity(`AI scheduled ${created.length} follow-ups`, { actor: 'ai', kind: 'reminder' });
      return ok({ scheduled: created, skipped_existing: a.stale.length - created.length });
    }

    case 'add_task': {
      const app = str(args, 'application') ? resolveApp(bridge, str(args, 'application')) : null;
      const due = str(args, 'due') ? parseWhen(str(args, 'due')) : null;
      const t = addTask({ title: str(args, 'title'), application_id: app?.id ?? null, due_at: due });
      return ok({ task: { id: t.id, title: t.title, due_at: t.due_at, company: app?.company_name ?? null } });
    }

    case 'list_tasks':
      return ok({
        tasks: store.tasks
          .filter(t => bool(args, 'include_done') || !t.done)
          .slice(0, 60)
          .map(t => ({
            id: t.id,
            title: t.title,
            done: t.done,
            due_at: t.due_at,
            company: bridge.applications.find(a => a.id === t.application_id)?.company_name ?? null,
          })),
      });

    case 'add_note': {
      const app = str(args, 'application') ? resolveApp(bridge, str(args, 'application')) : null;
      const n = addNote({ body: str(args, 'body'), application_id: app?.id ?? null, pinned: bool(args, 'pinned') });
      return ok({ note: { id: n.id, company: app?.company_name ?? null } });
    }

    case 'list_notes': {
      const app = str(args, 'application') ? resolveApp(bridge, str(args, 'application')) : null;
      return ok({
        notes: store.notes
          .filter(n => !app || n.application_id === app.id)
          .slice(0, 40)
          .map(n => ({ id: n.id, body: n.body, pinned: n.pinned, created_at: n.created_at })),
      });
    }

    case 'add_contact': {
      const app = str(args, 'application') ? resolveApp(bridge, str(args, 'application')) : null;
      const c = addContact({
        name: str(args, 'name'),
        role: str(args, 'role'),
        email: str(args, 'email'),
        phone: str(args, 'phone'),
        linkedin: str(args, 'linkedin'),
        notes: str(args, 'notes'),
        application_id: app?.id ?? null,
      });
      return ok({ contact: { id: c.id, name: c.name, company: app?.company_name ?? null } });
    }

    case 'list_contacts':
      return ok({
        contacts: store.contacts.slice(0, 60).map(c => ({
          ...c,
          company: bridge.applications.find(a => a.id === c.application_id)?.company_name ?? null,
        })),
      });

    case 'tag_application': {
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No application matched.' });
      list(args, 'add').forEach(name => {
        const tag = upsertTag(name);
        const has = read().applicationTags.some(at => at.application_id === app.id && at.tag_id === tag.id);
        if (!has) toggleApplicationTag(app.id, tag.id);
      });
      list(args, 'remove').forEach(name => {
        const tag = read().tags.find(t => t.name.toLowerCase() === name.trim().toLowerCase());
        if (!tag) return;
        const has = read().applicationTags.some(at => at.application_id === app.id && at.tag_id === tag.id);
        if (has) toggleApplicationTag(app.id, tag.id);
      });
      return ok({ application: app.company_name, tags: read()
        .applicationTags.filter(at => at.application_id === app.id)
        .map(at => read().tags.find(t => t.id === at.tag_id)?.name)
        .filter(Boolean) });
    }

    case 'star_application': {
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No application matched.' });
      if ('star' in args) toggleStar(app.id);
      if ('archive' in args) toggleArchive(app.id);
      const s = read();
      return ok({ application: app.company_name, starred: s.starred.includes(app.id), archived: s.archived.includes(app.id) });
    }

    case 'set_goal': {
      const metric = str(args, 'metric') as 'applications' | 'interviews' | 'offers' | 'outreach';
      if (!['applications', 'interviews', 'offers', 'outreach'].includes(metric)) return ok({ error: 'Unknown metric.' });
      setGoal(metric, Math.max(1, Math.round(num(args, 'target', 5))), str(args, 'period', 'week') === 'month' ? 'month' : 'week');
      return ok({ goals: read().goals });
    }

    case 'add_resume_version': {
      const r = addResumeVersion({ label: str(args, 'label'), description: str(args, 'description'), content: str(args, 'content') });
      return ok({ resume: { id: r.id, label: r.label } });
    }

    case 'get_analytics': {
      const a = computeAnalytics(bridge.applications, bridge.interviewsMap, store, store.preferences.followUpDays);
      return ok({
        by_platform: a.byPlatform,
        by_week: a.byWeek,
        by_month: a.byMonth,
        by_stage: a.byStage,
        top_roles: a.topRoles,
        rates: { response: a.responseRate, interview: a.interviewRate, offer: a.offerRate },
        avg_days_to_interview: a.avgResponseDays,
        streak: a.streak,
        best_streak: a.bestStreak,
        momentum: a.momentum,
      });
    }

    case 'get_activity':
      return ok({ activity: store.activity.slice(0, Math.max(1, Math.min(num(args, 'limit', 20), 100))) });

    case 'navigate': {
      const route = str(args, 'route');
      if (!route.startsWith('/')) return ok({ error: 'route must start with /' });
      emitUi({ type: 'navigate', to: route });
      return ok({ navigated_to: route });
    }

    case 'set_view': {
      const view = str(args, 'view');
      emitDeferrable({ type: 'set-view', view });
      emitUi({ type: 'navigate', to: '/dashboard' });
      return ok({ view });
    }

    case 'set_filters': {
      const filters: Record<string, string> = {};
      ['search', 'status', 'platform', 'stage', 'tag'].forEach(k => {
        if (typeof args[k] === 'string') filters[k] = args[k] as string;
      });
      emitUi({ type: 'navigate', to: '/dashboard' });
      emitDeferrable({ type: 'set-filters', filters });
      return ok({ applied: filters });
    }

    case 'open_application': {
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No application matched.' });
      emitUi({ type: 'navigate', to: '/dashboard' });
      emitDeferrable({ type: 'open-application', id: app.id });
      return ok({ opened: app.company_name });
    }

    case 'open_new_application_form': {
      emitUi({ type: 'navigate', to: '/dashboard' });
      emitDeferrable({
        type: 'new-application',
        prefill: {
          company_name: str(args, 'company'),
          role_applied_to: str(args, 'role'),
          platform_applied_on: str(args, 'platform'),
        },
      });
      return ok({ opened: 'new application form' });
    }

    case 'set_theme': {
      const theme = str(args, 'theme') === 'dark' ? 'dark' : 'light';
      emitUi({ type: 'set-theme', theme });
      return ok({ theme });
    }

    case 'export_applications': {
      const format = str(args, 'format', 'pdf');
      const apps = bridge.applications;
      if (!apps.length) return ok({ error: 'Nothing to export yet.' });
      if (format === 'pdf' || format === 'docx') {
        const mod = await import('../../utils/exportUtils');
        if (format === 'pdf') mod.exportAllPDF(apps);
        else await mod.exportAllDocx(apps);
      }
      else if (format === 'csv') downloadText('interntrack.csv', toCsv(apps), 'text/csv');
      else downloadText('interntrack.json', JSON.stringify(apps, null, 2), 'application/json');
      return ok({ exported: format, records: apps.length });
    }

    case 'list_automations':
      return ok({
        automations: store.automationRules.map(r => ({
          id: r.id,
          name: r.name,
          enabled: r.enabled,
          trigger: r.trigger,
          actions: r.actions,
          run_count: r.runCount,
          last_run_at: r.lastRunAt,
        })),
      });

    case 'create_automation': {
      const triggerType = str(args, 'trigger_type') as AutomationTriggerType;
      const actionType = str(args, 'action_type') as AutomationActionType;
      const rule = addAutomationRule({
        name: str(args, 'name', 'Untitled automation'),
        description: str(args, 'description', 'Created by Scout.'),
        enabled: true,
        trigger: {
          type: triggerType,
          days: 'trigger_days' in args ? num(args, 'trigger_days', 7) : undefined,
          stage: str(args, 'trigger_stage') || undefined,
        },
        actions: [
          {
            type: actionType,
            title: str(args, 'action_title') || undefined,
            body: str(args, 'action_body') || undefined,
            tag: str(args, 'action_tag') || undefined,
            stage: str(args, 'action_stage') || undefined,
            offsetDays: 'action_offset_days' in args ? num(args, 'action_offset_days', 0) : undefined,
          },
        ],
      });
      logActivity(`AI created automation "${rule.name}"`, { actor: 'ai', kind: 'automation' });
      return ok({ created: { id: rule.id, name: rule.name } });
    }

    case 'toggle_automation': {
      const target = store.automationRules.find(r => r.name.toLowerCase().includes(str(args, 'name').toLowerCase()));
      if (!target) return ok({ error: 'No automation matched that name.' });
      if (target.enabled !== bool(args, 'enabled')) toggleAutomationRule(target.id);
      return ok({ name: target.name, enabled: bool(args, 'enabled') });
    }

    case 'delete_automation': {
      const target = store.automationRules.find(r => r.name.toLowerCase().includes(str(args, 'name').toLowerCase()));
      if (!target) return ok({ error: 'No automation matched that name.' });
      deleteAutomationRule(target.id);
      return ok({ deleted: target.name });
    }

    case 'score_resume_against_jd': {
      const jd = str(args, 'job_description');
      if (!jd) return ok({ error: 'Pass the job description text.' });
      const label = str(args, 'resume_label');
      let resumeText = str(args, 'resume_text');
      let usedLabel = 'pasted text';
      if (!resumeText) {
        const version = label
          ? store.resumes.find(r => r.label.toLowerCase().includes(label.toLowerCase()))
          : store.resumes.find(r => !!r.content) || store.resumes[0];
        if (!version?.content) {
          return ok({
            error: label
              ? `No stored resume version named "${label}" has any text saved.`
              : 'No resume version with text is stored. Add one in Workspace → Resumes, or pass resume_text.',
            available: store.resumes.map(r => r.label),
          });
        }
        resumeText = version.content;
        usedLabel = version.label;
      }
      const result = matchResumeToJd(resumeText, jd);
      return ok({
        resume: usedLabel,
        score: `${result.score}%`,
        similarity: `${result.similarity}%`,
        matched_keywords: result.matched.map(m => m.term),
        missing_keywords: result.missing.map(m => m.term),
        verdict: matchVerdict(result),
      });
    }

    case 'find_duplicate_applications': {
      const company = str(args, 'company');
      if (company) {
        const hits = findDuplicates(
          { company_name: company, role_applied_to: str(args, 'role') },
          bridge.applications,
        );
        return ok({
          checked: company,
          matches: hits.map(h => ({
            id: h.application.id,
            company: h.application.company_name,
            role: h.application.role_applied_to,
            confidence: `${Math.round(h.score * 100)}%`,
            reason: h.reason,
          })),
        });
      }
      const groups = findDuplicatePairs(bridge.applications);
      return ok({
        duplicate_groups: groups.map(g =>
          g.map(h => ({ id: h.application.id, company: h.application.company_name, role: h.application.role_applied_to })),
        ),
        count: groups.length,
      });
    }

    case 'suggest_next_companies': {
      const limit = Math.max(1, Math.min(12, num(args, 'limit', 6)));
      const a = computeAnalytics(bridge.applications, bridge.interviewsMap, store, store.preferences.followUpDays);
      const strongPlatforms = a.byPlatform.filter(p => p.total >= 2).sort((x, y) => y.rate - x.rate).slice(0, 3);
      const rolePattern = a.topRoles.slice(0, 3).map(r => r.role);
      const tracked = new Set(bridge.applications.map(app => app.company_name.toLowerCase()));

      // Companies the user already reached an interview at are the best signal
      // for the *kind* of company to try next; wishlist entries not yet applied
      // to are the most actionable suggestions of all.
      const notYetApplied = bridge.applications
        .filter(app => stageOf(app, store.stageOverrides) === 'Wishlist')
        .map(app => ({ company: app.company_name, why: 'Already on your wishlist, never submitted' }));

      const converted = bridge.applications
        .filter(app => app.interview_offered || (bridge.interviewsMap[app.id] || []).length)
        .map(app => app.company_name);

      return ok({
        act_on_first: notYetApplied.slice(0, limit),
        your_strongest_platforms: strongPlatforms.map(p => ({ platform: p.platform, interview_rate: `${p.rate}%` })),
        roles_you_target: rolePattern,
        companies_that_converted: converted.slice(0, 8),
        tracked_count: tracked.size,
        guidance:
          'Suggest companies similar in size, sector and stack to the ones that converted, sourced through the platforms with the best rate. Say plainly that these are inferred from their own data, not a live job search.',
      });
    }

    case 'generate_ics_invite': {
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No matching application.' });
      const rounds = (bridge.interviewsMap[app.id] || []).filter(iv => ts(iv.interview_date) >= Date.now() - 86_400_000);
      if (!rounds.length) return ok({ error: `${app.company_name} has no upcoming interview dates to export.` });
      const events = rounds
        .map(iv => interviewEvent(app, iv, store.interviewMeta[iv.id]?.timezone))
        .filter((e): e is NonNullable<typeof e> => !!e);
      downloadIcs(`${app.company_name.replace(/[^\w.-]+/g, '-').toLowerCase()}-interview`, buildIcs(events));
      return ok({ downloaded: `${events.length} event(s) for ${app.company_name}` });
    }

    case 'remember_preference': {
      const note = str(args, 'note');
      if (!note) return ok({ error: 'Nothing to remember.' });
      addScoutMemory(note);
      logActivity(`Scout remembered: ${note}`, { actor: 'ai', kind: 'memory' });
      return ok({ remembered: note, total: read().preferences.scoutMemory.length });
    }

    case 'set_priority': {
      const app = resolveApp(bridge, str(args, 'application'));
      if (!app) return ok({ error: 'No matching application.' });
      const value = Math.max(0, Math.min(5, Math.round(num(args, 'priority', 0))));
      setPriority(app.id, value);
      return ok({ company: app.company_name, priority: value || 'cleared' });
    }

    case 'add_star_story': {
      const title = str(args, 'title');
      if (!title) return ok({ error: 'A story needs a title.' });
      const story = addStarStory({
        title,
        competency: str(args, 'competency'),
        situation: str(args, 'situation'),
        task: str(args, 'task'),
        action: str(args, 'action'),
        result: str(args, 'result'),
      });
      return ok({ saved: story.title, id: story.id });
    }

    case 'create_prep_cards': {
      const explicit = list(args, 'questions');
      let questions = explicit;
      let source = 'the questions you passed';
      if (!questions.length) {
        const app = resolveApp(bridge, str(args, 'application'));
        if (!app) return ok({ error: 'Pass questions, or an application whose stored questions I should use.' });
        const learnings = bridge.learningsMap[app.id];
        questions = extractQuestions([app.interview_questions, learnings?.questions_asked].filter(Boolean).join('\n'));
        source = app.company_name;
      }
      if (!questions.length) return ok({ error: 'No questions found to turn into cards.' });
      const added = addSrsCards(questions.map(q => ({ question: q })));
      return ok({ added, skipped_as_duplicates: questions.length - added, source });
    }

    case 'get_timing_patterns': {
      const insight = timingInsight(bridge.applications, bridge.interviewsMap);
      return ok({
        headline: insight.headline,
        best_days: insight.bestDays,
        worst_days: insight.worstDays,
        by_day: insight.days
          .filter(d => d.applications > 0)
          .map(d => ({ day: d.day, applications: d.applications, interview_rate: `${d.rate}%`, avg_days_to_interview: d.avgResponseDays })),
      });
    }

    case 'get_projection': {
      const a = computeAnalytics(bridge.applications, bridge.interviewsMap, store, store.preferences.followUpDays);
      const projection = offerProjection(a);
      return ok({
        headline: projection.headline,
        applications_to_one_expected_offer: projection.applicationsToOffer,
        weeks_at_current_pace: projection.weeksToOffer,
        interview_rate: `${projection.interviewRate}%`,
        interview_to_offer_rate: `${projection.interviewToOfferRate}%`,
        applications_per_week: projection.perWeek,
        confident: projection.confident,
      });
    }

    case 'get_weekly_wrapped': {
      const a = computeAnalytics(bridge.applications, bridge.interviewsMap, store, store.preferences.followUpDays);
      return ok(weeklyWrapped(bridge.applications, bridge.interviewsMap, a));
    }

    case 'log_contact_outreach': {
      const name = str(args, 'name').toLowerCase();
      const contact = store.contacts.find(c => c.name.toLowerCase().includes(name));
      if (!contact) return ok({ error: `No saved contact matching "${name}".` });
      touchContact(contact.id);
      return ok({ logged: contact.name, at: new Date().toISOString() });
    }

    case 'run_automations_now': {
      const fired = await evaluateAutomations({
        applications: bridge.applications,
        interviewsMap: bridge.interviewsMap,
        updateApplication: bridge.updateApplication,
        createApplication: data => bridge.createApplication(data as ApplicationInsert),
      });
      return ok({ fired });
    }

    default:
      return ok({ error: `Unknown tool: ${name}` });
  }
}

/* -------------------------------- helpers -------------------------------- */

const CSV_COLUMNS: (keyof Application)[] = [
  'company_name',
  'role_applied_to',
  'platform_applied_on',
  'date_applied',
  'response_status',
  'final_status',
  'interview_offered',
  'salary_info',
  'company_description',
  'resume_used',
  'cover_letter_used',
  'interview_questions',
  'tasks_to_complete',
  'created_at',
];

export function toCsv(apps: Application[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = CSV_COLUMNS.join(',');
  const rows = apps.map(a => CSV_COLUMNS.map(c => esc(a[c])).join(','));
  return [head, ...rows].join('\n');
}

export function downloadText(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter(r => r.some(c => c.trim()));
  if (!header) return [];
  const keys = header.map(h => h.trim());
  return body.map(r => {
    const obj: Record<string, string> = {};
    keys.forEach((k, i) => {
      obj[k] = (r[i] || '').trim();
    });
    return obj;
  });
}

/** Tool names that mutate state — used to badge the trace in the UI. */
export const WRITE_TOOLS = new Set([
  'create_application',
  'update_application',
  'set_stage',
  'bulk_update_stage',
  'delete_application',
  'add_interview_date',
  'add_reminder',
  'complete_reminder',
  'schedule_follow_ups',
  'add_task',
  'add_note',
  'add_contact',
  'tag_application',
  'star_application',
  'set_goal',
  'add_resume_version',
  'export_applications',
  'create_automation',
  'toggle_automation',
  'delete_automation',
  'run_automations_now',
  'remember_preference',
  'set_priority',
  'add_star_story',
  'create_prep_cards',
  'generate_ics_invite',
  'log_contact_outreach',
]);

export function markSuggestionsSeen() {
  savePreferences({ onboarded: true });
}
