import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  Braces,
  CalendarClock,
  CheckCircle2,
  Clock,
  Eye,
  Mail,
  MessageCircle,
  Moon,
  Plus,
  Send,
  Sparkles,
  Tag as TagIcon,
  Target,
  Trash2,
  Users,
  Webhook,
  X,
  Zap,
  ListChecks,
} from 'lucide-react';
import PageShell from '../components/PageShell';
import Switch from '../components/ui/Switch';
import { useStore } from '../hooks/useStore';
import { useData } from '../context/DataContext';
import {
  addAutomationRule,
  deleteAutomationRule,
  savePreferences,
  toggleAutomationRule,
  updateAutomationRule,
  type AutomationCondition,
  type AutomationConditionType,
  type AutomationRule,
} from '../lib/store';
import { AUTOMATION_TEMPLATES, inQuietHours, previewMatches } from '../lib/automation';
import { STAGES } from '../lib/insights';
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
  interview_completed: MessageCircle,
  offer_deadline_approaching: AlertTriangle,
  goal_at_risk: Target,
  contact_follow_up_due: Users,
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
  duplicate_application: 'Duplicate application',
  send_ics: 'Send calendar invite',
  telegram: 'Telegram message',
  email: 'Email (EmailJS)',
};

const CONDITION_LABEL: Record<AutomationConditionType, string> = {
  has_tag: 'tagged',
  stage_is: 'in stage',
  platform_is: 'applied via',
  starred: 'starred',
  priority_at_least: 'priority at least',
};

/** Human-readable form of the extra clauses on a rule. */
function conditionSummary(rule: AutomationRule): string | null {
  const clauses = rule.conditions || [];
  if (!clauses.length) return null;
  const parts = clauses.map(c => {
    const label = CONDITION_LABEL[c.type];
    const value = c.type === 'priority_at_least' ? String(c.number ?? 1) : c.value || '';
    return `${c.negate ? 'not ' : ''}${label}${value ? ` ${value}` : ''}`;
  });
  return parts.join(rule.match === 'or' ? ' or ' : ' and ');
}

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
    case 'interview_completed':
      return `${t.days ?? 1} day(s) after an interview happens`;
    case 'offer_deadline_approaching':
      return `An offer deadline is ${t.days ?? 3} day(s) away`;
    case 'goal_at_risk':
      return 'A goal falls behind pace partway through its period';
    case 'contact_follow_up_due':
      return `A contact has not heard from you in ${t.days ?? 30} days`;
    default:
      return t.type;
  }
}

function RuleCard({ rule }: { rule: AutomationRule }) {
  const Icon = TRIGGER_ICON[rule.trigger.type] || Zap;
  const store = useStore();
  const { applications, interviewsMap, updateApplication, createApplication } = useData();
  const [preview, setPreview] = useState<{ company: string; detail: string }[] | null>(null);
  const [editingClauses, setEditingClauses] = useState(false);
  const clauses = rule.conditions || [];

  /**
   * "Preview matches" — runs the matcher with no actions and ignores the dedupe
   * ledger, so you can sanity-check a rule before trusting it.
   */
  const dryRun = () => {
    const matches = previewMatches(rule, {
      applications,
      interviewsMap,
      updateApplication,
      createApplication: data => createApplication(data as Parameters<typeof createApplication>[0]),
    });
    setPreview(
      matches.slice(0, 12).map(m => ({
        company: m.application?.company_name || 'Workspace-wide',
        detail: Object.entries(m.context)
          .filter(([key]) => key !== 'company')
          .map(([key, value]) => `${key}: ${value}`)
          .join(' · '),
      })),
    );
  };

  const setClause = (index: number, patch: Partial<AutomationCondition>) => {
    const next = clauses.map((c, i) => (i === index ? { ...c, ...patch } : c));
    updateAutomationRule(rule.id, { conditions: next });
  };

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
        <Switch checked={rule.enabled} onChange={() => toggleAutomationRule(rule.id)} label={`${rule.name} enabled`} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip !text-[10px]">When: {triggerSummary(rule)}</span>
        {conditionSummary(rule) && (
          <span className="chip !text-[10px] !bg-sky-100 dark:!bg-sky-950/60 !text-sky-800 dark:!text-sky-300 !border-sky-200 dark:!border-sky-900">
            And only if: {conditionSummary(rule)}
          </span>
        )}
        {rule.actions.map((a, i) => (
          <span key={i} className="chip !text-[10px]">
            Then: {ACTION_LABEL[a.type] || a.type}
          </span>
        ))}
      </div>

      {/* clause builder */}
      {editingClauses && (
        <div className="panel p-3 space-y-2 animate-slide-up">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400 flex-1">
              Extra conditions
            </p>
            {clauses.length > 1 && (
              <select
                value={rule.match || 'and'}
                onChange={e => updateAutomationRule(rule.id, { match: e.target.value as 'and' | 'or' })}
                className="input-field !w-auto !py-1 !text-[11px]"
              >
                <option value="and">Match all</option>
                <option value="or">Match any</option>
              </select>
            )}
          </div>

          {clauses.map((clause, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <button
                onClick={() => setClause(index, { negate: !clause.negate })}
                className={`btn-secondary btn-sm !px-2 !text-[10px] ${clause.negate ? '!border-accent-400 !text-accent-600 dark:!text-accent-400' : ''}`}
                title="Invert this condition"
              >
                {clause.negate ? 'NOT' : 'IS'}
              </button>
              <select
                value={clause.type}
                onChange={e => setClause(index, { type: e.target.value as AutomationConditionType, value: '', number: 1 })}
                className="input-field !py-1 !text-[11px] flex-1"
              >
                {(Object.keys(CONDITION_LABEL) as AutomationConditionType[]).map(type => (
                  <option key={type} value={type}>
                    {CONDITION_LABEL[type]}
                  </option>
                ))}
              </select>

              {clause.type === 'has_tag' && (
                <select
                  value={clause.value || ''}
                  onChange={e => setClause(index, { value: e.target.value })}
                  className="input-field !py-1 !text-[11px] !w-28"
                >
                  <option value="">pick a tag</option>
                  {store.tags.map(t => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {clause.type === 'stage_is' && (
                <select
                  value={clause.value || ''}
                  onChange={e => setClause(index, { value: e.target.value })}
                  className="input-field !py-1 !text-[11px] !w-28"
                >
                  <option value="">pick a stage</option>
                  {STAGES.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              {clause.type === 'platform_is' && (
                <input
                  value={clause.value || ''}
                  onChange={e => setClause(index, { value: e.target.value })}
                  placeholder="LinkedIn"
                  className="input-field !py-1 !text-[11px] !w-28"
                />
              )}
              {clause.type === 'priority_at_least' && (
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={clause.number ?? 1}
                  onChange={e => setClause(index, { number: Number(e.target.value) })}
                  className="input-field !py-1 !text-[11px] !w-14 text-center"
                />
              )}

              <button
                onClick={() => updateAutomationRule(rule.id, { conditions: clauses.filter((_, i) => i !== index) })}
                className="text-light-400 hover:text-red-500 flex-shrink-0"
                aria-label="Remove condition"
              >
                <X size={13} />
              </button>
            </div>
          ))}

          <button
            onClick={() => updateAutomationRule(rule.id, { conditions: [...clauses, { type: 'has_tag', value: '' }] })}
            className="btn-ghost btn-sm !text-[11px]"
          >
            <Plus size={11} /> Add a condition
          </button>
          <p className="text-[10px] text-light-500 dark:text-dark-400 leading-snug">
            One trigger plus a clause covers far more than a trigger alone — “stale <em>and</em> tagged dream-company”
            fires only where it matters.
          </p>
        </div>
      )}

      {preview && (
        <div className="panel p-3 animate-slide-up">
          <div className="flex items-center gap-2 mb-1.5">
            <Eye size={12} className="text-sky-600 dark:text-sky-400" />
            <p className="text-[11px] font-semibold text-light-900 dark:text-white flex-1">
              {preview.length ? `Would act on ${preview.length}` : 'Nothing matches right now'}
            </p>
            <button onClick={() => setPreview(null)} className="text-light-400 hover:text-light-700 dark:hover:text-dark-100">
              <X size={12} />
            </button>
          </div>
          {preview.length > 0 && (
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {preview.map((row, i) => (
                <li key={i} className="text-[11px] text-light-700 dark:text-dark-200">
                  <span className="font-medium">{row.company}</span>
                  {row.detail && <span className="text-light-500 dark:text-dark-400"> — {row.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-light-500 dark:text-dark-400 mt-1.5">
            Nothing was executed. A preview ignores the dedupe ledger, so it shows what the rule describes rather than
            what it happens not to have fired for yet.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <button onClick={dryRun} className="btn-secondary btn-sm !text-[11px]">
          <Eye size={11} /> Preview matches
        </button>
        <button
          onClick={() => setEditingClauses(e => !e)}
          className={`btn-secondary btn-sm !text-[11px] ${clauses.length ? '!border-sky-300 dark:!border-sky-800' : ''}`}
        >
          <Braces size={11} /> Conditions{clauses.length ? ` (${clauses.length})` : ''}
        </button>
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

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function Automations() {
  const store = useStore();
  const [webhook, setWebhook] = useState(store.preferences.webhookUrl);
  const installedKeys = new Set(store.automationRules.map(r => r.builtin).filter(Boolean));
  const quiet = store.preferences.quietHours;

  /** Templates that need a channel configured, so the UI can say so up front. */
  const needsSetup = useMemo(
    () => ({
      telegram: !store.preferences.telegramToken || !store.preferences.telegramChatId,
      email: !store.preferences.emailjsServiceId,
      webhook: !store.preferences.webhookUrl,
    }),
    [store.preferences],
  );

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
          <Switch
            checked={store.preferences.automationsEnabled}
            onChange={next => savePreferences({ automationsEnabled: next })}
            label="Automations engine"
          />
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
                    {t.actions.some(a => a.type === 'telegram') && needsSetup.telegram && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Send size={9} /> Needs a Telegram bot in Settings
                      </p>
                    )}
                    {t.actions.some(a => a.type === 'email') && needsSetup.email && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Mail size={9} /> Needs EmailJS keys in Settings
                      </p>
                    )}
                    {t.actions.some(a => a.type === 'webhook' || a.type === 'send_ics') && needsSetup.webhook && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Webhook size={9} /> Needs a webhook URL
                      </p>
                    )}
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
              <Moon size={15} className="text-primary-600 dark:text-primary-400" />
              <h2 className="text-sm font-semibold text-light-900 dark:text-white">Quiet hours</h2>
            </div>
            <p className="text-xs text-light-600 dark:text-dark-300 mb-3 leading-relaxed">
              Notifications, webhooks, Telegram messages and email are held back inside this window and sent on the first
              tick after it closes — queued, not dropped.
            </p>
            <label className="flex items-center justify-between gap-3 mb-2">
              <span className="text-sm font-medium text-light-900 dark:text-white">Enabled</span>
              <Switch
                checked={quiet.enabled}
                onChange={next => savePreferences({ quietHours: { ...quiet, enabled: next } })}
                label="Quiet hours"
              />
            </label>
            <div className="flex items-center gap-2">
              <select
                value={quiet.from}
                onChange={e => savePreferences({ quietHours: { ...quiet, from: Number(e.target.value) } })}
                className="input-field !py-1.5 !text-xs"
              >
                {HOURS.map(h => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              <span className="text-xs text-light-500 dark:text-dark-400">to</span>
              <select
                value={quiet.to}
                onChange={e => savePreferences({ quietHours: { ...quiet, to: Number(e.target.value) } })}
                className="input-field !py-1.5 !text-xs"
              >
                {HOURS.map(h => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
            {quiet.enabled && (
              <p className="text-[11px] mt-2 text-light-600 dark:text-dark-300">
                {inQuietHours(quiet) ? 'Quiet right now.' : 'Outside quiet hours — notifications go straight out.'}
                {store.automationQueue.length > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    {' '}
                    {store.automationQueue.length} held back.
                  </span>
                )}
              </p>
            )}
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
