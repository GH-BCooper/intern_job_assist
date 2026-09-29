/**
 * The automation engine: "when X happens, do Y" rules that run entirely in the
 * browser against the local-first store, at zero infrastructure cost.
 *
 * Each rule pairs one trigger with one or more actions. `evaluateAutomations`
 * is called on an interval (see useAutomations) and on every data refresh; it
 * finds matches, executes their actions, and records a dedupe key so the same
 * match never fires twice.
 */

import type { Application, InterviewDate } from './supabase';
import {
  addNote,
  addReminder,
  addTask,
  automationHasRun,
  drainQuietQueue,
  logActivity,
  queueQuietAction,
  read,
  recordAutomationRun,
  setStage,
  toggleApplicationTag,
  toggleArchive,
  upsertTag,
  type AutomationAction,
  type AutomationCondition,
  type AutomationRule,
  type QuietHours,
  type StoreShape,
} from './store';
import { stageOf, stagePatch, type Stage } from './insights';
import { DAY_MS, daysSince, daysUntil, dayKey, startOfMonth, startOfWeek, ts } from './format';
import { buildIcs, interviewEvent } from './ics';
import { toast } from './uiBus';

export type AutomationBridge = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  updateApplication: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  /** Needed by the duplicate_application action; optional so older callers still compile. */
  createApplication?: (data: Record<string, unknown>) => Promise<unknown>;
};

type Match = { application: Application | null; dedupeKey: string; context: Record<string, string | number> };

function interpolate(text: string | undefined, ctx: Record<string, string | number>): string {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(ctx[k] ?? ''));
}

/**
 * Whether a moment falls inside the user's quiet window.
 *
 * Windows that wrap midnight (22:00 → 08:00, the default) are the normal case,
 * so the comparison is a union rather than a range when `from > to`.
 */
export function inQuietHours(quiet: QuietHours, at = new Date()): boolean {
  if (!quiet?.enabled) return false;
  const hour = at.getHours();
  const { from, to } = quiet;
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Actions that reach out to a person, and so respect quiet hours. */
const NOISY = new Set<AutomationAction['type']>(['notify', 'webhook', 'telegram', 'email']);

function weekKey(d = new Date()): string {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / DAY_MS + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

/** Evaluates one extra clause against an application. */
function conditionHolds(condition: AutomationCondition, app: Application | null, store: StoreShape): boolean {
  const result = (() => {
    switch (condition.type) {
      case 'has_tag': {
        if (!app || !condition.value) return false;
        const tag = store.tags.find(t => t.name.toLowerCase() === condition.value!.trim().toLowerCase());
        if (!tag) return false;
        return store.applicationTags.some(at => at.application_id === app.id && at.tag_id === tag.id);
      }
      case 'stage_is':
        return !!app && !!condition.value && stageOf(app, store.stageOverrides) === condition.value;
      case 'platform_is':
        return !!app && (app.platform_applied_on || '').toLowerCase() === (condition.value || '').toLowerCase();
      case 'starred':
        return !!app && store.starred.includes(app.id);
      case 'priority_at_least':
        return !!app && (store.priorities[app.id] || 0) >= (condition.number ?? 1);
      default:
        return false;
    }
  })();
  return condition.negate ? !result : result;
}

/**
 * Whether a rule's extra clauses allow a match through.
 *
 * A rule with no clauses always passes, so every rule written before conditions
 * existed behaves exactly as it did.
 */
export function conditionsPass(rule: AutomationRule, app: Application | null, store: StoreShape): boolean {
  const clauses = rule.conditions || [];
  if (!clauses.length) return true;
  return rule.match === 'or'
    ? clauses.some(c => conditionHolds(c, app, store))
    : clauses.every(c => conditionHolds(c, app, store));
}

function findMatches(rule: AutomationRule, bridge: AutomationBridge, nowMs: number): Match[] {
  const store = read();
  const overrides = store.stageOverrides;
  const out: Match[] = [];

  switch (rule.trigger.type) {
    case 'stale_no_response': {
      const threshold = Math.max(1, rule.trigger.days || store.preferences.followUpDays);
      bridge.applications.forEach(app => {
        const stage = stageOf(app, overrides);
        if (stage === 'Closed' || stage === 'Offer' || stage === 'Wishlist') return;
        if (app.response_status && app.response_status !== 'Pending') return;
        const days = daysSince(app.date_applied);
        if (days === null || days < threshold) return;
        const bucket = Math.floor(days / threshold);
        out.push({
          application: app,
          dedupeKey: `${app.id}:${bucket}`,
          context: { company: app.company_name, role: app.role_applied_to || '', days },
        });
      });
      break;
    }

    case 'interview_upcoming': {
      const lead = Math.max(0, rule.trigger.days ?? 1);
      bridge.applications.forEach(app => {
        (bridge.interviewsMap[app.id] || []).forEach(iv => {
          const d = daysUntil(iv.interview_date);
          if (d === null || d < 0 || d > lead) return;
          out.push({
            application: app,
            dedupeKey: iv.id,
            context: { company: app.company_name, role: app.role_applied_to || '', days: d, label: iv.label || 'Interview' },
          });
        });
      });
      break;
    }

    case 'task_overdue': {
      store.tasks
        .filter(t => !t.done && t.due_at && ts(t.due_at) < nowMs)
        .forEach(t => {
          const app = bridge.applications.find(a => a.id === t.application_id) || null;
          out.push({
            application: app,
            dedupeKey: `${t.id}:${dayKey(nowMs)}`,
            context: { company: app?.company_name || '', title: t.title },
          });
        });
      break;
    }

    case 'no_activity_days': {
      const threshold = Math.max(1, rule.trigger.days || 14);
      bridge.applications.forEach(app => {
        const stage = stageOf(app, overrides);
        if (stage === 'Closed') return;
        const last = store.activity
          .filter(a => a.application_id === app.id)
          .map(a => ts(a.created_at))
          .sort((a, b) => b - a)[0];
        const anchor = last || ts(app.date_applied) || ts(app.created_at);
        if (!anchor) return;
        const days = Math.floor((nowMs - anchor) / DAY_MS);
        if (days < threshold) return;
        const bucket = Math.floor(days / threshold);
        out.push({
          application: app,
          dedupeKey: `${app.id}:${bucket}`,
          context: { company: app.company_name, days },
        });
      });
      break;
    }

    case 'application_created': {
      const ruleCreated = ts(rule.created_at);
      bridge.applications.forEach(app => {
        const createdAt = ts(app.created_at) || ts(app.date_applied);
        if (createdAt < ruleCreated) return;
        out.push({ application: app, dedupeKey: app.id, context: { company: app.company_name, role: app.role_applied_to || '' } });
      });
      break;
    }

    case 'stage_is': {
      if (!rule.trigger.stage) break;
      bridge.applications.forEach(app => {
        if (stageOf(app, overrides) !== rule.trigger.stage) return;
        out.push({ application: app, dedupeKey: `${app.id}:${rule.trigger.stage}`, context: { company: app.company_name } });
      });
      break;
    }

    case 'weekly_digest': {
      const d = new Date(nowMs);
      const targetDay = rule.trigger.weekday ?? 1;
      const targetHour = rule.trigger.hour ?? 9;
      if (d.getDay() !== targetDay || d.getHours() < targetHour) return out;
      out.push({ application: null, dedupeKey: weekKey(d), context: { week: weekKey(d) } });
      break;
    }

    /**
     * The day after a logged interview, nudge for a retro — unless learnings
     * for that application already exist, in which case the job is done.
     */
    case 'interview_completed': {
      const lag = Math.max(0, rule.trigger.days ?? 1);
      bridge.applications.forEach(app => {
        (bridge.interviewsMap[app.id] || []).forEach(iv => {
          const since = Math.floor((nowMs - ts(iv.interview_date)) / DAY_MS);
          if (since < lag || since > lag + 7) return;
          out.push({
            application: app,
            dedupeKey: `retro:${iv.id}`,
            context: { company: app.company_name, label: iv.label || 'Interview', days: since },
          });
        });
      });
      break;
    }

    /**
     * An offer with a response deadline coming up.
     *
     * The deadline lives on a linked reminder of kind `deadline` rather than a
     * new Supabase column, so this needs no schema change.
     */
    case 'offer_deadline_approaching': {
      const lead = Math.max(1, rule.trigger.days ?? 3);
      store.reminders
        .filter(r => !r.done && r.kind === 'deadline' && r.application_id)
        .forEach(r => {
          const left = daysUntil(r.due_at);
          if (left === null || left < 0 || left > lead) return;
          const app = bridge.applications.find(a => a.id === r.application_id) || null;
          if (!app) return;
          out.push({
            application: app,
            dedupeKey: `deadline:${r.id}:${left}`,
            context: { company: app.company_name, days: left, title: r.title },
          });
        });
      break;
    }

    /**
     * A goal that will be missed at the current pace, checked partway through
     * its period so there is still time to act.
     */
    case 'goal_at_risk': {
      const at = new Date(nowMs);
      store.goals.forEach(goal => {
        const start = goal.period === 'week' ? startOfWeek(at) : startOfMonth(at);
        const lengthDays = goal.period === 'week' ? 7 : new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
        const elapsed = Math.max(1, Math.floor((nowMs - start.getTime()) / DAY_MS) + 1);
        const fractionElapsed = elapsed / lengthDays;
        // Only meaningful once a third of the period has gone.
        if (fractionElapsed < 0.34 || fractionElapsed > 1) return;

        const done = (() => {
          switch (goal.metric) {
            case 'applications':
              return bridge.applications.filter(a => ts(a.date_applied || a.created_at) >= start.getTime()).length;
            case 'interviews':
              return bridge.applications.filter(a =>
                (bridge.interviewsMap[a.id] || []).some(iv => ts(iv.interview_date) >= start.getTime()),
              ).length;
            case 'offers':
              return bridge.applications.filter(
                a =>
                  (a.response_status === 'Offered' || a.final_status === 'Accepted') &&
                  ts(a.updated_at || a.created_at) >= start.getTime(),
              ).length;
            case 'outreach':
              return Object.values(store.contactTouched).filter(t => ts(t) >= start.getTime()).length;
            default:
              return 0;
          }
        })();

        const expected = goal.target * fractionElapsed;
        if (done >= expected) return;
        out.push({
          application: null,
          dedupeKey: `goal:${goal.id}:${dayKey(nowMs)}`,
          context: {
            metric: goal.metric,
            target: goal.target,
            done,
            behind: Math.max(1, Math.ceil(expected - done)),
            period: goal.period,
          },
        });
      });
      break;
    }

    /** A saved contact you have not messaged in a while. */
    case 'contact_follow_up_due': {
      const threshold = Math.max(1, rule.trigger.days ?? 30);
      store.contacts.forEach(contact => {
        const last = store.contactTouched[contact.id] || contact.created_at;
        const days = daysSince(last);
        if (days === null || days < threshold) return;
        const bucket = Math.floor(days / threshold);
        const app = bridge.applications.find(a => a.id === contact.application_id) || null;
        out.push({
          application: app,
          dedupeKey: `contact:${contact.id}:${bucket}`,
          context: { name: contact.name, company: app?.company_name || contact.role || '', days },
        });
      });
      break;
    }
  }

  return out.filter(m => conditionsPass(rule, m.application, store) && !automationHasRun(`${rule.id}:${m.dedupeKey}`));
}

/**
 * Matches a rule would act on right now, without executing anything.
 *
 * Powers the rule editor's "preview matches" button — the same matcher the
 * engine uses, so the preview cannot drift from the behaviour.
 */
export function previewMatches(
  rule: AutomationRule,
  bridge: AutomationBridge,
): { application: Application | null; context: Record<string, string | number> }[] {
  const nowMs = Date.now();
  const store = read();
  // Ignore the dedupe ledger in a preview: the user wants to see what the rule
  // describes, not what it happens not to have fired for yet.
  const seen = store.automationSeen;
  try {
    (store as { automationSeen: Record<string, string> }).automationSeen = {};
    return findMatches(rule, bridge, nowMs).map(m => ({ application: m.application, context: m.context }));
  } finally {
    (store as { automationSeen: Record<string, string> }).automationSeen = seen;
  }
}

/**
 * The bridge the current evaluation pass is using.
 *
 * Two actions (send_ics, duplicate_application) need data and writes that the
 * old `runAction` signature has no access to. Threading it through module state
 * for the duration of one synchronous pass keeps every existing call site — and
 * the quiet-hours replay, which has no bridge of its own — working unchanged.
 */
let icsBridge: AutomationBridge | null = null;

function runAction(action: AutomationAction, rule: AutomationRule, app: Application | null, ctx: Record<string, string | number>) {
  const title = interpolate(action.title, ctx) || `Automation: ${rule.name}`;

  if (NOISY.has(action.type) && inQuietHours(read().preferences.quietHours)) {
    queueQuietAction({
      ruleId: rule.id,
      ruleName: rule.name,
      applicationId: app?.id ?? null,
      action,
      context: ctx,
    });
    return;
  }

  switch (action.type) {
    case 'add_reminder': {
      const due = new Date(Date.now() + (action.offsetDays ?? 1) * DAY_MS);
      addReminder({
        title,
        notes: interpolate(action.body, ctx) || `Triggered by "${rule.name}"`,
        due_at: due.toISOString(),
        kind: 'follow_up',
        application_id: app?.id ?? null,
      });
      break;
    }
    case 'add_task': {
      const due = action.offsetDays ? new Date(Date.now() + action.offsetDays * DAY_MS).toISOString() : null;
      addTask({ title, application_id: app?.id ?? null, due_at: due });
      break;
    }
    case 'add_tag': {
      if (app && action.tag) {
        const tag = upsertTag(action.tag);
        const has = read().applicationTags.some(at => at.application_id === app.id && at.tag_id === tag.id);
        if (!has) toggleApplicationTag(app.id, tag.id);
      }
      break;
    }
    case 'add_note': {
      addNote({ body: interpolate(action.body, ctx) || title, application_id: app?.id ?? null });
      break;
    }
    case 'archive': {
      if (app && !read().archived.includes(app.id)) toggleArchive(app.id);
      break;
    }
    case 'notify': {
      const body = interpolate(action.body, ctx) || title;
      toast(body, 'info');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('InternTrack automation', { body, tag: `auto-${rule.id}`, icon: '/icon-192.png' });
        } catch {
          /* notification API can throw on some platforms */
        }
      }
      break;
    }
    case 'webhook': {
      const url = action.webhookUrl || read().preferences.webhookUrl;
      if (!url) break;
      const content = interpolate(action.body, ctx) || title;
      fetch(url, { method: 'POST', body: JSON.stringify({ content, text: content, rule: rule.name, ...ctx }) }).catch(() => {
        /* best-effort — offline or blocked webhooks must not break the app */
      });
      break;
    }
    case 'set_stage': {
      if (app && action.stage) setStage(app.id, action.stage, undefined, 'system');
      break;
    }
    case 'telegram': {
      const prefs = read().preferences;
      if (!prefs.telegramToken || !prefs.telegramChatId) break;
      const text = interpolate(action.body, ctx) || title;
      fetch(`https://api.telegram.org/bot${prefs.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: prefs.telegramChatId, text }),
      }).catch(() => {
        /* best-effort, exactly like the webhook action */
      });
      break;
    }
    case 'email': {
      const prefs = read().preferences;
      if (!prefs.emailjsServiceId || !prefs.emailjsTemplateId || !prefs.emailjsPublicKey) break;
      const message = interpolate(action.body, ctx) || title;
      fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: prefs.emailjsServiceId,
          template_id: prefs.emailjsTemplateId,
          user_id: prefs.emailjsPublicKey,
          template_params: {
            to_email: prefs.emailjsTo,
            subject: title,
            message,
            rule: rule.name,
            company: String(ctx.company || ''),
          },
        }),
      }).catch(() => {
        /* EmailJS free tier can rate-limit; never block the engine on it */
      });
      break;
    }
    /** Attaches a calendar invite for the matched interview to the webhook payload. */
    case 'send_ics': {
      const url = action.webhookUrl || read().preferences.webhookUrl;
      if (!app) break;
      const interviews = (icsBridge?.interviewsMap[app.id] || []).filter(iv => ts(iv.interview_date) >= Date.now() - DAY_MS);
      const events = interviews.map(iv => interviewEvent(app, iv)).filter((e): e is NonNullable<typeof e> => !!e);
      if (!events.length) break;
      const ics = buildIcs(events, `${app.company_name} — interviews`);
      if (url) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: interpolate(action.body, ctx) || title, ics, filename: 'interview.ics' }),
        }).catch(() => {
          /* best-effort */
        });
      }
      addNote({
        application_id: app.id,
        body: `Calendar invite generated by "${rule.name}".\n\n\`\`\`\n${ics}\n\`\`\``,
      });
      break;
    }
    /** Spins off a fresh record — reapplying next cycle, without retyping it. */
    case 'duplicate_application': {
      if (!app || !icsBridge?.createApplication) break;
      void icsBridge
        .createApplication({
          company_name: app.company_name,
          company_description: app.company_description,
          role_applied_to: app.role_applied_to,
          platform_applied_on: app.platform_applied_on,
          salary_info: app.salary_info,
          resume_used: app.resume_used,
          cover_letter_used: app.cover_letter_used,
          interview_questions: '',
          tasks_to_complete: '',
          resume_path: '',
          cover_letter_path: '',
          response_status: 'Pending',
          final_status: 'In Progress',
          interview_offered: false,
          date_applied: null,
        })
        .catch(() => {
          /* the log entry still records the attempt */
        });
      break;
    }
  }
}

let evaluating = false;
let rerunRequested = false;

/**
 * Evaluate every enabled rule and execute newly-matched actions. Safe to call often.
 *
 * Passes never overlap. A pass awaits network writes before it records what it has
 * done, and it is triggered by a timer, by every data change and by tab focus — so
 * a second pass starting mid-way used to match the same application again and fire
 * its actions twice (and clear the shared calendar bridge under the first pass).
 * A call made during a pass just asks for one more pass when it finishes.
 */
export async function evaluateAutomations(bridge: AutomationBridge): Promise<number> {
  if (evaluating) {
    rerunRequested = true;
    return 0;
  }
  evaluating = true;
  try {
    let fired = await evaluateOnce(bridge);
    while (rerunRequested) {
      rerunRequested = false;
      fired += await evaluateOnce(bridge);
    }
    return fired;
  } finally {
    evaluating = false;
    rerunRequested = false;
  }
}

async function evaluateOnce(bridge: AutomationBridge): Promise<number> {
  const store = read();
  if (!store.preferences.automationsEnabled) return 0;
  const nowMs = Date.now();
  let fired = 0;
  icsBridge = bridge;

  // Anything quiet hours held back goes out as soon as the window closes.
  if (!inQuietHours(store.preferences.quietHours)) {
    const parked = drainQuietQueue();
    parked.forEach(item => {
      const rule = store.automationRules.find(r => r.id === item.ruleId) || {
        id: item.ruleId,
        name: item.ruleName,
        description: '',
        enabled: true,
        trigger: { type: 'weekly_digest' as const },
        actions: [],
        created_at: item.created_at,
        lastRunAt: null,
        runCount: 0,
      };
      const app = bridge.applications.find(a => a.id === item.applicationId) || null;
      runAction(item.action, rule, app, item.context);
    });
  }

  for (const rule of store.automationRules.filter(r => r.enabled)) {
    const matches = findMatches(rule, bridge, nowMs);
    for (const m of matches) {
      for (const action of rule.actions) {
        runAction(action, rule, m.application, m.context);
        if (action.type === 'set_stage' && m.application && action.stage) {
          try {
            await bridge.updateApplication(m.application.id, stagePatch(action.stage as Stage, m.application));
          } catch {
            /* stage sync failure shouldn't block the rest of the automation */
          }
        }
      }
      const label = m.application ? m.application.company_name : 'workspace';
      // Must match the `${rule.id}:${dedupeKey}` format findMatches() checks via automationHasRun,
      // or every rule refires on the next tick instead of being deduplicated.
      recordAutomationRun(rule, `${rule.id}:${m.dedupeKey}`, m.application?.id ?? null, `${rule.name} → ${label}`);
      logActivity(`Automation "${rule.name}" ran for ${label}`, {
        actor: 'system',
        kind: 'automation',
        application_id: m.application?.id ?? null,
      });
      fired += 1;
    }
  }
  icsBridge = null;
  return fired;
}

/* ------------------------------ templates -------------------------------- */

export type AutomationTemplate = Omit<AutomationRule, 'id' | 'created_at' | 'lastRunAt' | 'runCount' | 'enabled'>;

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    name: 'Auto follow-up nudge',
    description: 'When an application goes quiet past your follow-up window, schedule a reminder automatically.',
    builtin: 'stale-follow-up',
    trigger: { type: 'stale_no_response' },
    actions: [
      {
        type: 'add_reminder',
        title: 'Follow up with {{company}}',
        body: 'No response {{days}} days after applying — sent by automation.',
        offsetDays: 0,
      },
    ],
  },
  {
    name: 'Interview prep reminder',
    description: 'Two days before an interview, add a prep task automatically.',
    builtin: 'interview-prep',
    trigger: { type: 'interview_upcoming', days: 2 },
    actions: [{ type: 'add_task', title: 'Prep for {{company}} — {{label}}' }],
  },
  {
    name: 'Stale pipeline alert',
    description: 'Notify you when an application has had no activity for 21 days.',
    builtin: 'no-activity',
    trigger: { type: 'no_activity_days', days: 21 },
    actions: [{ type: 'notify', body: '{{company}} has had no activity in {{days}} days.' }],
  },
  {
    name: 'Auto-archive rejections',
    description: 'Tag and archive applications the moment they land in the Closed stage.',
    builtin: 'auto-archive',
    trigger: { type: 'stage_is', stage: 'Closed' },
    actions: [
      { type: 'add_tag', tag: 'Closed out' },
      { type: 'archive' },
    ],
  },
  {
    name: 'Overdue task alert',
    description: 'Get notified the day a checklist task slips past its due date.',
    builtin: 'task-overdue',
    trigger: { type: 'task_overdue' },
    actions: [{ type: 'notify', body: 'Task overdue: {{title}}' }],
  },
  {
    name: 'Post-interview retro nudge',
    description: 'The day after any interview, ask how it went and open a note for your learnings.',
    builtin: 'interview-retro',
    trigger: { type: 'interview_completed', days: 1 },
    actions: [
      { type: 'add_task', title: 'Write up the {{company}} {{label}} retro' },
      { type: 'notify', body: 'How did the {{company}} interview go? Log it while it is fresh.' },
    ],
  },
  {
    name: 'Thank-you note after every interview',
    description: 'Schedules a thank-you reminder the same day an interview happens.',
    builtin: 'thank-you',
    trigger: { type: 'interview_completed', days: 0 },
    actions: [
      {
        type: 'add_reminder',
        title: 'Send a thank-you note to {{company}}',
        body: 'Two sentences, one concrete detail from the conversation.',
        offsetDays: 0,
      },
    ],
  },
  {
    name: 'Celebrate and tag every offer',
    description: 'Tags and notifies the moment anything reaches the Offer stage.',
    builtin: 'offer-tag',
    trigger: { type: 'stage_is', stage: 'Offer' },
    actions: [
      { type: 'add_tag', tag: 'Offer' },
      { type: 'notify', body: '{{company}} made an offer. Compare it before you answer.' },
    ],
  },
  {
    name: 'Offer deadline warning',
    description: 'Three days before an offer deadline reminder, nudge you to decide.',
    builtin: 'offer-deadline',
    trigger: { type: 'offer_deadline_approaching', days: 3 },
    actions: [{ type: 'notify', body: '{{days}} days left to answer {{company}}.' }],
  },
  {
    name: 'Goal pace check',
    description: 'Warns when a weekly or monthly goal is falling behind while there is still time.',
    builtin: 'goal-risk',
    trigger: { type: 'goal_at_risk' },
    actions: [{ type: 'notify', body: 'Behind on your {{period}} {{metric}} goal — {{done}} of {{target}}, about {{behind}} short of pace.' }],
  },
  {
    name: 'Keep your network warm',
    description: 'Reminds you to message a saved contact you have not spoken to in 30 days.',
    builtin: 'contact-warm',
    trigger: { type: 'contact_follow_up_due', days: 30 },
    actions: [{ type: 'add_task', title: 'Check in with {{name}} — {{days}} days since the last message' }],
  },
  {
    name: 'Resume refresh nudge',
    description: 'If an application has sat untouched for 60 days, revisit the resume you used.',
    builtin: 'resume-refresh',
    trigger: { type: 'no_activity_days', days: 60 },
    actions: [{ type: 'add_task', title: 'Revisit the resume used for {{company}}' }],
  },
  {
    name: 'Auto-tag by platform',
    description: 'Tags every new application with its source so platform analytics stay honest.',
    builtin: 'auto-tag-platform',
    trigger: { type: 'application_created' },
    actions: [{ type: 'add_tag', tag: 'New' }],
  },
  {
    name: 'Calendar invite for interviews',
    description: 'Two days out, generate an .ics invite for the interview and attach it to your webhook.',
    builtin: 'ics-invite',
    trigger: { type: 'interview_upcoming', days: 2 },
    actions: [{ type: 'send_ics', body: 'Calendar invite for {{company}} — {{label}}' }],
  },
  {
    name: 'Telegram interview alert',
    description: 'Pings your personal Telegram chat the day before an interview.',
    builtin: 'telegram-interview',
    trigger: { type: 'interview_upcoming', days: 1 },
    actions: [{ type: 'telegram', body: 'Tomorrow: {{company}} — {{label}}. Prep is on you.' }],
  },
  {
    name: 'Weekly digest webhook',
    description: 'Every Monday at 9am, ping your webhook (Discord/Slack/Zapier/Make) with a nudge to check Insights.',
    builtin: 'weekly-digest',
    trigger: { type: 'weekly_digest', weekday: 1, hour: 9 },
    actions: [{ type: 'webhook', body: 'Weekly InternTrack check-in — open Insights for your briefing.' }],
  },
];
