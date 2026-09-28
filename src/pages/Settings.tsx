import { useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  Loader2,
  Palette,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import PageShell from '../components/PageShell';
import AccountSecurity from '../components/AccountSecurity';
import { useStore } from '../hooks/useStore';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { PROVIDERS, chat } from '../lib/ai/providers';
import type { AiProviderId } from '../lib/store';
import { exportStore, importStore, savePreferences } from '../lib/store';
import { downloadText, parseCsv, toCsv } from '../lib/ai/tools';
import { requestNotificationPermission } from '../hooks/useAlerts';
import { toast } from '../lib/uiBus';

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500/15 to-accent-500/15 border border-primary-300/50 dark:border-primary-900 flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-primary-600 dark:text-primary-400" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-light-900 dark:text-white">{title}</h2>
          <p className="text-xs text-light-600 dark:text-dark-300 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start justify-between gap-4 py-2.5 cursor-pointer group">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-light-900 dark:text-white">{label}</span>
        {hint && <span className="block text-xs text-light-500 dark:text-dark-400 mt-0.5 leading-snug">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors mt-0.5 ${
          on ? 'bg-gradient-to-r from-primary-500 to-accent-500' : 'bg-light-300 dark:bg-dark-700'
        }`}
      >
        <span
          className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[21px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </label>
  );
}

export default function Settings() {
  const store = useStore();
  const prefs = store.preferences;
  const { theme, toggleTheme } = useTheme();
  const { applications, refresh } = useData();
  const { user } = useAuth();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const provider = PROVIDERS[prefs.aiProvider];
  const key = prefs.aiKeys[prefs.aiProvider] || '';
  const model = prefs.aiModel[prefs.aiProvider] || provider.defaultModel;

  const setKey = (v: string) => savePreferences({ aiKeys: { ...prefs.aiKeys, [prefs.aiProvider]: v.trim() } });
  const setModel = (v: string) => savePreferences({ aiModel: { ...prefs.aiModel, [prefs.aiProvider]: v } });

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await chat(
        { provider: prefs.aiProvider, model, apiKey: key, baseUrl: prefs.ollamaUrl },
        [{ role: 'user', content: 'Reply with exactly: ready' }],
      );
      const good = res.text.toLowerCase().includes('ready') || res.text.length > 0;
      setTestResult(good ? 'ok' : 'fail');
      toast(good ? `${provider.label} is connected.` : 'Connected but got an empty reply.', good ? 'success' : 'error');
    } catch (e) {
      setTestResult('fail');
      toast(e instanceof Error ? e.message : 'Connection failed.', 'error');
    } finally {
      setTesting(false);
    }
  };

  const importJson = async (file: File) => {
    try {
      importStore(await file.text(), 'merge');
      toast('Workspace data merged in.', 'success');
    } catch {
      toast('That file is not a valid InternTrack export.', 'error');
    }
  };

  const importCsv = async (file: File) => {
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) {
        toast('No rows found in that CSV.', 'error');
        return;
      }
      toast(`Parsed ${rows.length} rows. Ask Scout to import them — it will map the columns for you.`, 'info');
      window.sessionStorage.setItem('interntrack.pendingCsv', JSON.stringify(rows.slice(0, 50)));
    } catch {
      toast('Could not read that CSV.', 'error');
    }
  };

  return (
    <PageShell title="Settings" subtitle={user?.email || 'Your preferences, stored on this device.'}>
      <div className="grid lg:grid-cols-2 gap-4">
        <AccountSecurity />

        <Section
          icon={Sparkles}
          title="AI assistant"
          description="Scout runs on a model you choose. Every option below has a real free tier — no card, no server, and your key never leaves this browser."
        >
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(Object.keys(PROVIDERS) as AiProviderId[]).map(id => {
              const p = PROVIDERS[id];
              const active = prefs.aiProvider === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    savePreferences({ aiProvider: id });
                    setTestResult(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    active
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-950/30 shadow-soft'
                      : 'border-light-300 dark:border-dark-700 hover:border-primary-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-light-900 dark:text-white">{p.label}</span>
                    {active && <Check size={13} className="text-primary-600 dark:text-primary-400" />}
                  </span>
                  <span className="block text-[10px] text-light-500 dark:text-dark-400 mt-0.5 leading-snug">{p.free}</span>
                </button>
              );
            })}
          </div>

          {provider.needsKey ? (
            <>
              <label className="label">{provider.keyLabel}</label>
              <div className="relative mb-2">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-light-500 dark:text-dark-400" />
                <input
                  type={showKey ? 'text' : 'password'}
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="Paste your key"
                  className="input-field pl-9 pr-10 font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={() => setShowKey(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-light-500 hover:text-light-800 dark:hover:text-white"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <a
                href={provider.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:underline mb-3"
              >
                Get a free key <ExternalLink size={10} />
              </a>
            </>
          ) : (
            <>
              <label className="label">Ollama server URL</label>
              <input
                value={prefs.ollamaUrl}
                onChange={e => savePreferences({ ollamaUrl: e.target.value })}
                className="input-field font-mono text-xs mb-3"
              />
            </>
          )}

          <label className="label">Model</label>
          <select value={model} onChange={e => setModel(e.target.value)} className="input-field mb-3">
            {provider.models.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.note ? ` — ${m.note}` : ''}
              </option>
            ))}
          </select>

          <button onClick={testConnection} disabled={testing || (provider.needsKey && !key)} className="btn-secondary w-full">
            {testing ? <Loader2 size={14} className="animate-spin" /> : testResult === 'ok' ? <Check size={14} className="text-emerald-500" /> : <Zap size={14} />}
            {testing ? 'Testing…' : testResult === 'ok' ? 'Connected' : 'Test connection'}
          </button>

          <div className="divider my-4" />
          <Toggle
            on={prefs.aiAutoActions}
            onChange={v => savePreferences({ aiAutoActions: v })}
            label="Let Scout act without asking"
            hint="Scout can create and edit applications, reminders, tasks and tags directly. Deleting always needs your explicit confirmation."
          />
        </Section>

        <div className="space-y-4">
          <Section
            icon={BellRing}
            title="Notifications & follow-ups"
            description="Reminders surface in the app, and as native browser notifications when you allow them."
          >
            <Toggle
              on={prefs.notificationsEnabled}
              onChange={async v => {
                if (!v) {
                  savePreferences({ notificationsEnabled: false });
                  return;
                }
                const granted = await requestNotificationPermission();
                savePreferences({ notificationsEnabled: granted });
                if (!granted) toast('Your browser blocked notifications.', 'error');
              }}
              label="Browser notifications"
              hint="Pops up when a reminder falls due, even in another tab."
            />
            <div className="divider my-2" />
            <label className="label">Follow-up window</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={3}
                max={21}
                value={prefs.followUpDays}
                onChange={e => savePreferences({ followUpDays: Number(e.target.value) })}
                className="flex-1 accent-primary-500"
              />
              <span className="text-sm font-semibold text-light-900 dark:text-white tabular-nums w-16">{prefs.followUpDays} days</span>
            </div>
            <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">
              Applications with no response after this long get flagged for follow-up.
            </p>

            <label className="label mt-4">Reminder lead time</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={72}
                value={prefs.reminderLeadHours}
                onChange={e => savePreferences({ reminderLeadHours: Number(e.target.value) })}
                className="flex-1 accent-primary-500"
              />
              <span className="text-sm font-semibold text-light-900 dark:text-white tabular-nums w-16">{prefs.reminderLeadHours}h</span>
            </div>
          </Section>

          <Section icon={Palette} title="Appearance" description="Light mode is bright and warm; dark mode is low-glare for late-night applying.">
            <Toggle on={theme === 'dark'} onChange={toggleTheme} label="Dark mode" hint="Also toggles from the navbar or ⌘K." />
            <div className="divider my-2" />
            <label className="label">Default dashboard view</label>
            <select
              value={prefs.defaultView}
              onChange={e => savePreferences({ defaultView: e.target.value })}
              className="input-field"
            >
              <option value="board">Board — Kanban pipeline</option>
              <option value="grid">Cards</option>
              <option value="table">Table</option>
              <option value="timeline">Timeline</option>
            </select>
          </Section>
        </div>

        <Section
          icon={Database}
          title="Your data"
          description="Applications live in Supabase. Everything v2 adds — tags, reminders, notes, contacts, goals — is stored in this browser and exports cleanly."
        >
          <div className="grid sm:grid-cols-2 gap-2">
            <button onClick={() => downloadText('interntrack-workspace.json', exportStore(), 'application/json')} className="btn-secondary">
              <Download size={14} /> Export workspace
            </button>
            <button onClick={() => downloadText('interntrack-applications.csv', toCsv(applications), 'text/csv')} className="btn-secondary">
              <Download size={14} /> Export applications
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary">
              <Upload size={14} /> Import workspace
            </button>
            <button onClick={() => csvRef.current?.click()} className="btn-secondary">
              <Upload size={14} /> Import CSV
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
              e.target.value = '';
            }}
          />
          <div className="divider my-4" />
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Applications', value: applications.length },
              { label: 'Reminders', value: store.reminders.length },
              { label: 'Notes', value: store.notes.length },
            ].map(s => (
              <div key={s.label} className="panel p-2.5">
                <p className="text-lg font-bold text-light-900 dark:text-white tabular-nums leading-none">{s.value}</p>
                <p className="text-[10px] text-light-500 dark:text-dark-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <button onClick={() => void refresh()} className="btn-ghost w-full mt-3 btn-sm">
            <Gauge size={13} /> Reload from Supabase
          </button>
        </Section>

        <Section
          icon={ShieldCheck}
          title="Cost & privacy"
          description="A deliberate constraint of this build: it must cost nothing to run."
        >
          <ul className="space-y-2.5 text-xs text-light-700 dark:text-dark-200">
            {[
              ['Hosting', 'Vercel Hobby — free, unlimited personal projects.'],
              ['Database & auth', 'Supabase free tier — Postgres, auth and storage.'],
              ['AI', 'Your own free-tier key (Gemini / Groq / OpenRouter) or a local Ollama model.'],
              ['Charts & exports', 'Rendered in-browser — no paid services, no server rendering.'],
              ['Notifications', 'Native browser notifications — no push service, no fees.'],
              ['Offline', 'Installable PWA with a service worker cache.'],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-2">
                <Check size={13} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong className="text-light-900 dark:text-white">{k}:</strong> {v}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 p-3 rounded-xl bg-light-200/70 dark:bg-dark-900 border border-light-300 dark:border-dark-800">
            <p className="text-[11px] text-light-600 dark:text-dark-300 leading-relaxed flex gap-2">
              <Cpu size={13} className="flex-shrink-0 mt-0.5" />
              API keys are kept in this browser's local storage and sent only to the provider you picked. They are never
              transmitted to InternTrack or to any third party.
            </p>
          </div>
        </Section>
      </div>
    </PageShell>
  );
}
