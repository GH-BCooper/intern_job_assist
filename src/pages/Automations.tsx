import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  Plus,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  Webhook,
  Zap,
  ListChecks,
} from 'lucide-react';
import PageShell from '../components/PageShell';
import { useStore } from '../hooks/useStore';
import {
  addAutomationRule,
  deleteAutomationRule,
  savePreferences,
  toggleAutomationRule,
  type AutomationRule,
} from '../lib/store';
import { AUTOMATION_TEMPLATES } from '../lib/automation';
import { fmtDateTime, relative } from '../lib/format';
import { toast } from '../lib/uiBus';

const TRIGGER_ICON: Record<string, typeof Zap> = {
  stale_no_response: Clock,
  interview_upcoming: CalendarClock,
  task_overdue: AlertTriangle,
  no_activity_days: Activity,
  application_created: Plus,
  stage_is: TagIcon,
  weekly_digest: Webhook,
};

const ACTION_LABEL: Record<string, string> = {
  add_reminder: 'Add reminder',
  add_task: 'Add task',
  add_tag: 'Add tag',
  notify: 'Notify',
  webhook: 'Webhook',
  set_stage: 'Change stage',
  archive: 'Archive',
  add_note: 'Add note',
};

function triggerSummary(rule: AutomationRule): string {
  const t = rule.trigger;
  switch (t.type) {
    case 'stale_no_response':
      return `No response after ${t.days ?? 'your follow-up window'} days`;
    case 'interview_upcoming':
      return `Interview within ${t.days ?? 1} day(s)`;
    case 'task_overdue':
      return 'A task becomes overdue';
    case 'no_activity_days':
      return `No activity for ${t.days ?? 14}+ days`;
    case 'application_created':
      return 'A new application is created';
    case 'stage_is':
      return `Application enters "${t.stage}"`;
    case 'weekly_digest':
      return `Weekly, day ${t.weekday ?? 1} at ${t.hour ?? 9}:00`;
    default:
      return t.type;
  }
}

function RuleCard({ rule }: { rule: AutomationRule }) {
  const Icon = TRIGGER_ICON[rule.trigger.type] || Zap;
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
              rule.enabled
                ? 'bg-gradient-to-br from-primary-500/15 to-accent-500/15 border-primary-300/50 dark:border-primary-900'
                : 'bg-light-200 dark:bg-dark-800 border-light-300 dark:border-dark-700'
            }`}
          >
            <Icon size={16} className={rule.enabled ? 'text-primary-600 dark:text-primary-400' : 'text-light-500 dark:text-dark-400'} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-light-900 dark:text-white truncate">{rule.name}</p>
            <p className="text-xs text-light-600 dark:text-dark-300 mt-0.5 leading-relaxed">{rule.description}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rule.enabled}
          onClick={() => toggleAutomationRule(rule.id)}
          className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors ${
            rule.enabled ? 'bg-gradient-to-r from-primary-500 to-accent-500' : 'bg-light-300 dark:bg-dark-700'
          }`}
        >
          <span
            className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
              rule.enabled ? 'translate-x-[21px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip !text-[10px]">When: {triggerSummary(rule)}</span>
        {rule.actions.map((a, i) => (
          <span key={i} className="chip !text-[10px]">
            Then: {ACTION_LABEL[a.type] || a.type}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-[11px] text-light-500 dark:text-dark-400 pt-1 border-t border-light-200 dark:border-dark-800">
        <span>
          {rule.runCount} run{rule.runCount === 1 ? '' : 's'}
          {rule.lastRunAt ? ` · last ${relative(rule.lastRunAt)}` : ' · never run yet'}
        </span>
        <button
          onClick={() => {
            deleteAutomationRule(rule.id);
            toast('Automation removed.', 'info');
          }}
          className="text-red-500 hover:text-red-600 flex items-center gap-1"
        >
          <Trash2 size={12} /> Remove
        </button>
      </div>
    </div>
  );
}

export default function Automations() {
  const store = useStore();
  const [webhook, setWebhook] = useState(store.preferences.webhookUrl);
  const installedKeys = new Set(store.automationRules.map(r => r.builtin).filter(Boolean));

  const installTemplate = (template: (typeof AUTOMATION_TEMPLATES)[number]) => {
    addAutomationRule({ ...template, enabled: true });
    toast(`"${template.name}" is live.`, 'success');
  };

  return (
    <PageShell
      title="Automations"
      subtitle="When something happens in your pipeline, InternTrack can act on it automatically — no code, no cost."
      actions={
        <label className="flex items-center gap-2 text-sm font-medium text-light-800 dark:text-dark-100">
          <button
            type="button"
            role="switch"
            aria-checked={store.preferences.automationsEnabled}
            onClick={() => savePreferences({ automationsEnabled: !store.preferences.automationsEnabled })}
            className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors ${
              store.preferences.automationsEnabled ? 'bg-gradient-to-r from-primary-500 to-accent-500' : 'bg-light-300 dark:bg-dark-700'
            }`}
          >
            <span
              className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
                store.preferences.automationsEnabled ? 'translate-x-[21px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
          Automations engine {store.preferences.automationsEnabled ? 'on' : 'paused'}
        </label>
      }
    >
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-primary-600 dark:text-primary-400" />
              <h2 className="text-sm font-semibold text-light-900 dark:text-white">Templates — add in one click</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {AUTOMATION_TEMPLATES.map(t => {
                const installed = installedKeys.has(t.builtin);
                const Icon = TRIGGER_ICON[t.trigger.type] || Zap;
                return (
                  <div key={t.builtin} className="panel p-3.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
                      <p className="text-xs font-semibold text-light-900 dark:text-white">{t.name}</p>
                    </div>
                    <p className="text-[11px] text-light-600 dark:text-dark-300 leading-relaxed flex-1">{t.description}</p>
                    <button
                      onClick={() => installTemplate(t)}
                      disabled={installed}
                      className="btn-secondary btn-sm w-full justify-center disabled:opacity-50"
                    >
                      {installed ? <CheckCircle2 size={13} /> : <Plus size={13} />}
                      {installed ? 'Added' : 'Add automation'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-light-900 dark:text-white mb-3 flex items-center gap-2">
              <ListChecks size={15} /> Your automations ({store.automationRules.length})
            </h2>
            {store.automationRules.length === 0 ? (
              <div className="card p-8 text-center">
                <Zap size={22} className="mx-auto text-light-400 dark:text-dark-500 mb-2" />
                <p className="text-sm text-light-600 dark:text-dark-300">
                  No automations yet. Add a template above, or ask Scout to "create an automation that…".
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {store.automationRules.map(r => (
                  <RuleCard key={r.id} rule={r} />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Webhook size={15} className="text-primary-600 dark:text-primary-400" />
              <h2 className="text-sm font-semibold text-light-900 dark:text-white">Webhook target</h2>
            </div>
            <p className="text-xs text-light-600 dark:text-dark-300 mb-3 leading-relaxed">
              Paste a free Discord or Slack incoming-webhook URL, or a Zapier/Make/IFTTT catch hook. Webhook actions post here —
              free to run, no server needed.
            </p>
            <input
              value={webhook}
              onChange={e => setWebhook(e.target.value)}
              onBlur={() => savePreferences({ webhookUrl: webhook.trim() })}
              placeholder="https://discord.com/api/webhooks/…"
              className="input-field font-mono text-xs"
            />
          </section>

          <section className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Bell size={15} className="text-primary-600 dark:text-primary-400" />
              <h2 className="text-sm font-semibold text-light-900 dark:text-white">Recent runs</h2>
            </div>
            {store.automationLog.length === 0 ? (
              <p className="text-xs text-light-500 dark:text-dark-400">Nothing has run yet.</p>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {store.automationLog.slice(0, 30).map(l => (
                  <li key={l.id} className="text-xs border-b border-light-200 dark:border-dark-800 pb-2 last:border-0">
                    <p className="text-light-800 dark:text-dark-100">{l.summary}</p>
                    <p className="text-[10px] text-light-500 dark:text-dark-400">{fmtDateTime(l.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Archive size={15} className="text-primary-600 dark:text-primary-400" />
              <h2 className="text-sm font-semibold text-light-900 dark:text-white">How it runs</h2>
            </div>
            <p className="text-xs text-light-600 dark:text-dark-300 leading-relaxed">
              Rules are checked every 60 seconds while the app is open, and once whenever your data refreshes. Each match fires
              once — automations never repeat themselves for the same event. Everything runs in this browser; nothing is billed.
            </p>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
