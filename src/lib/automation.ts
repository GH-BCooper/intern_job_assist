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
  logActivity,
  read,
  recordAutomationRun,
  setStage,
  toggleApplicationTag,
  toggleArchive,
  upsertTag,
  type AutomationAction,
  type AutomationRule,
} from './store';
import { stageOf, stagePatch, type Stage } from './insights';
import { DAY_MS, daysSince, daysUntil, dayKey, ts } from './format';
import { toast } from './uiBus';

export type AutomationBridge = {
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  updateApplication: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
};

type Match = { application: Application | null; dedupeKey: string; context: Record<string, string | number> };

function interpolate(text: string | undefined, ctx: Record<string, string | number>): string {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(ctx[k] ?? ''));
}

function weekKey(d = new Date()): string {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / DAY_MS + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
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
  }

  return out.filter(m => !automationHasRun(`${rule.id}:${m.dedupeKey}`));
}

function runAction(action: AutomationAction, rule: AutomationRule, app: Application | null, ctx: Record<string, string | number>) {
  const title = interpolate(action.title, ctx) || `Automation: ${rule.name}`;

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
      if (app && action.stage) setStage(app.id, action.stage);
      break;
    }
  }
}

/** Evaluate every enabled rule and execute newly-matched actions. Safe to call often. */
export async function evaluateAutomations(bridge: AutomationBridge): Promise<number> {
  const store = read();
  if (!store.preferences.automationsEnabled) return 0;
  const nowMs = Date.now();
  let fired = 0;

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
    name: 'Weekly digest webhook',
    description: 'Every Monday at 9am, ping your webhook (Discord/Slack/Zapier/Make) with a nudge to check Insights.',
    builtin: 'weekly-digest',
    trigger: { type: 'weekly_digest', weekday: 1, hour: 9 },
    actions: [{ type: 'webhook', body: 'Weekly InternTrack check-in — open Insights for your briefing.' }],
  },
];
