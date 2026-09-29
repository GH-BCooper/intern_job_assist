import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accessibility,
  Bell,
  BellRing,
  Bookmark,
  Check,
  Columns3,
  Copy,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  Globe,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  Lock,
  Palette,
  Plug,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Zap,
} from 'lucide-react';
import Switch from '../components/ui/Switch';
import PageShell from '../components/PageShell';
import AccountSecurity from '../components/AccountSecurity';
import { useStore } from '../hooks/useStore';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { PROVIDERS, chat } from '../lib/ai/providers';
import type { AiProviderId, LocaleId } from '../lib/store';
import {
  addSeason,
  aiCallsToday,
  deleteSeason,
  exportStore,
  importStore,
  markBackupTaken,
  savePreferences,
  wipeLocalStore,
} from '../lib/store';
import { downloadText, parseCsv, toCsv } from '../lib/ai/tools';
import { requestNotificationPermission } from '../hooks/useAlerts';
import { toast } from '../lib/uiBus';
import AccentPicker from '../components/ui/AccentPicker';
import { ACCENT_BY_ID } from '../lib/accent';
import { STAGES, computeAnalytics, weeklyWrapped } from '../lib/insights';
import { buildImportPlan, PRESETS, type ImportPreset } from '../lib/importPresets';
import { bookmarkletCode } from '../lib/bookmarklet';
import { copyText } from '../lib/clipboard';
import { buildLeaveBehindHtml, buildPortfolioHtml, downloadHtml, printHtml } from '../lib/portfolio';
import { previewSound } from '../lib/fx';
import { LOCALES, coverage } from '../lib/i18n';
import {
  forgetPassphrase,
  hasPassphrase,
  isUnlocked,
  lock as lockVault,
  setPassphrase,
  unlock as unlockVault,
  vaultSupported,
  verifyPassphrase,
} from '../lib/vault';
import {
  buildSharePayload,
  createShareLink,
  listShareLinks,
  deleteAllShareLinks,
  revokeShareLink,
  shareUrl,
  ShareUnavailableError,
  type ShareLink,
} from '../lib/share';
import { supabase } from '../lib/supabase';

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
      <Switch checked={on} onChange={onChange} label={label} className="mt-0.5" />
    </label>
  );
}

export default function Settings() {
  const store = useStore();
  const prefs = store.preferences;
  const { theme, toggleTheme, highContrast, setHighContrast, fontScale, setFontScale } = useTheme();
  const { applications, refresh } = useData();
  const { user, signOut } = useAuth();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const presetCsvRef = useRef<HTMLInputElement>(null);

  const { interviewsMap, createApplication } = useData();

  const [importPreset, setImportPreset] = useState<ImportPreset>(PRESETS[0]);
  const [importing, setImporting] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  const [vaultPass, setVaultPass] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[] | null>(null);
  const [shareError, setShareError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState(0);
  const [mfaStatus, setMfaStatus] = useState<'unknown' | 'none' | 'enrolled'>('unknown');
  const [mfaEnroll, setMfaEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const bookmarklet = useMemo(() => bookmarkletCode(), []);

  const analytics = useMemo(
    () => computeAnalytics(applications, interviewsMap, store, prefs.followUpDays),
    [applications, interviewsMap, store, prefs.followUpDays],
  );

  const usage = useMemo(() => {
    const used = aiCallsToday(prefs.aiProvider);
    const limit = PROVIDERS[prefs.aiProvider].dailyLimit ?? null;
    return { used, limit, ratio: limit ? Math.min(1, used / limit) : 0 };
    // store.aiUsage is listed so the meter re-reads after each request, even
    // though aiCallsToday reaches into the store rather than taking it as input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.aiProvider, store.aiUsage]);

  /** Existing MFA factors, so the TOTP section knows what to offer. */
  useEffect(() => {
    let live = true;
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!live) return;
      if (error) {
        setMfaStatus('none');
        return;
      }
      setMfaStatus((data?.totp?.length || 0) > 0 ? 'enrolled' : 'none');
    });
    return () => {
      live = false;
    };
  }, []);

  const loadShareLinks = async () => {
    try {
      setShareLinks(await listShareLinks());
      setShareError('');
    } catch (e) {
      setShareLinks([]);
      setShareError(e instanceof Error ? e.message : 'Could not load share links.');
    }
  };

  const createShare = async () => {
    if (!user) return;
    setSharing(true);
    try {
      const payload = buildSharePayload(
        analytics,
        weeklyWrapped(applications, interviewsMap, analytics),
        (user.user_metadata?.name as string) || '',
      );
      const link = await createShareLink(user.id, payload, { label: 'Insights snapshot', expiresInDays: 90 });
      setShareLinks(prev => [link, ...(prev || [])]);
      setShareError('');
      const copied = await copyText(shareUrl(link.token));
      toast(
        copied
          ? 'Share link created and copied. It shows aggregate insights only.'
          : 'Share link created — copy it from the list below. It shows aggregate insights only.',
        'success',
      );
    } catch (e) {
      const message =
        e instanceof ShareUnavailableError ? e.message : e instanceof Error ? e.message : 'Could not create the link.';
      setShareError(message);
      toast(message, 'error');
    } finally {
      setSharing(false);
    }
  };

  /** Imports a competitor's CSV export through a column-mapping preset. */
  const runPresetImport = async (file: File, mode: 'chosen' | 'auto' = 'chosen') => {
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const usePreset = mode === 'auto' || importPreset.id === 'generic' ? undefined : importPreset;
      const plan = buildImportPlan(rows, applications, usePreset);
      if (!plan.rows.length) {
        toast(
          plan.duplicates.length
            ? `Nothing new — all ${plan.duplicates.length} rows already exist in your tracker.`
            : 'No usable rows found. Try a different preset.',
          'info',
        );
        return;
      }
      const confirmed = window.confirm(
        `${plan.preset.label}: import ${plan.rows.length} application${plan.rows.length === 1 ? '' : 's'}?` +
          (plan.duplicates.length ? `\n\n${plan.duplicates.length} look like duplicates and will be skipped.` : '') +
          (plan.skipped ? `\n${plan.skipped} row(s) had no company name and will be skipped.` : ''),
      );
      if (!confirmed) return;

      // A few at a time: strictly one-by-one made a 200-row LinkedIn export take
      // minutes, and everything at once would trip the free tier's rate limits.
      let created = 0;
      const queue = [...plan.rows];
      const worker = async () => {
        for (let row = queue.shift(); row; row = queue.shift()) {
          try {
            await createApplication(row);
            created += 1;
          } catch {
            /* keep going: one bad row should not abort the import */
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));
      await refresh();
      toast(`Imported ${created} of ${plan.rows.length}.`, created ? 'success' : 'error');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const enrollTotp = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error || !data) {
      toast(error?.message || 'Could not start enrolment.', 'error');
      return;
    }
    setMfaEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirmTotp = async () => {
    if (!mfaEnroll || mfaCode.length < 6) return;
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaEnroll.id });
    if (challenge.error) {
      toast(challenge.error.message, 'error');
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaEnroll.id,
      challengeId: challenge.data.id,
      code: mfaCode,
    });
    if (error) {
      toast(error.message, 'error');
      return;
    }
    setMfaEnroll(null);
    setMfaCode('');
    setMfaStatus('enrolled');
    toast('Two-factor login is on. Keep a backup of your authenticator.', 'success');
  };

  const disableTotp = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp?.[0];
    if (!factor) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      toast(error.message, 'error');
      return;
    }
    setMfaStatus('none');
    toast('Two-factor login removed.', 'info');
  };

  const wipeEverything = async () => {
    if (!user) return;
    try {
      // Remote first, and only clear the browser once that has really worked: the
      // old order wiped the local workspace, ignored a failed delete, and still
      // announced success.
      await deleteAllShareLinks(user.id);

      const filePaths = [
        ...applications.flatMap(a => [a.resume_path, a.cover_letter_path]),
        ...store.resumes.map(r => r.file?.path),
      ].filter((p): p is string => !!p);
      if (filePaths.length) {
        const { error: fileError } = await supabase.storage.from('applications').remove(filePaths);
        if (fileError) throw new Error(`Could not delete your uploaded files: ${fileError.message}`);
      }

      // Applications are the user's own rows; RLS scopes this to them.
      const { error } = await supabase.from('applications').delete().eq('user_id', user.id);
      if (error) throw new Error(error.message);
    } catch (e) {
      setWipeConfirm(0);
      toast(
        `${e instanceof Error ? e.message : 'Could not delete your data.'} Nothing was removed from this browser.`,
        'error',
      );
      return;
    }
    wipeLocalStore();
    forgetPassphrase();
    toast('Your applications, files, share links and local workspace are deleted. Signing you out.', 'success');
    setTimeout(() => void signOut(), 1500);
  };

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

  return (
    <PageShell title="Settings" subtitle={user?.email || 'Your preferences, stored on this device.'}>
      <div className="grid lg:grid-cols-2 gap-4 items-start">
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

          <Section
            icon={Palette}
            title="Appearance"
            description="Light mode is bright and warm; dark mode is low-glare for late-night applying. The accent palette applies live, everywhere."
          >
            <Toggle on={theme === 'dark'} onChange={toggleTheme} label="Dark mode" hint="Also toggles from the navbar or ⌘K." />
            <div className="divider my-2" />

            <label className="label">Accent palette</label>
            <AccentPicker />
            <p className="text-[11px] text-light-500 dark:text-dark-400 mt-2">
              Currently {ACCENT_BY_ID[prefs.accent]?.label || 'Coral'}. Swapped through CSS variables at runtime — no reload.
            </p>

            <div className="divider my-3" />

            <Toggle
              on={prefs.sounds}
              onChange={v => {
                savePreferences({ sounds: v });
                if (v) previewSound('chime');
              }}
              label="Interface sounds"
              hint="A soft pop on task-complete, a rising chime on an offer. Synthesized in the browser — no audio files."
            />
            {prefs.sounds && (
              <div className="flex items-center gap-1.5 pb-2">
                {(['click', 'pop', 'chime', 'error'] as const).map(name => (
                  <button key={name} onClick={() => previewSound(name)} className="btn-ghost btn-sm !text-[11px]">
                    <Volume2 size={11} /> {name}
                  </button>
                ))}
              </div>
            )}

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

        <div className="grid lg:grid-cols-2 gap-4">
          <Section
            icon={Accessibility}
            title="Accessibility"
            description="A high-contrast variant, a base font-size slider, and the keyboard board moves that make drag-and-drop optional."
          >
            <Toggle
              on={highContrast}
              onChange={setHighContrast}
              label="High contrast"
              hint="Hardens borders, drops translucency and removes the decorative page wash."
            />
            <div className="divider my-2" />
            <label className="label">Base font size — {Math.round(fontScale * 100)}%</label>
            <input
              type="range"
              min={85}
              max={135}
              step={5}
              value={Math.round(fontScale * 100)}
              onChange={e => setFontScale(Number(e.target.value) / 100)}
              className="w-full accent-primary-500"
            />
            <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">
              Scales the root size; every rem-based measurement in the app follows it.
            </p>

            <div className="divider my-3" />
            <label className="label flex items-center gap-1.5">
              <Globe size={11} /> Language
            </label>
            <select
              value={prefs.locale}
              onChange={e => savePreferences({ locale: e.target.value as LocaleId })}
              className="input-field"
            >
              {LOCALES.map(l => (
                <option key={l.id} value={l.id}>
                  {l.native} — {coverage(l.id)}% translated
                </option>
              ))}
            </select>
            <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1 leading-relaxed">
              Spanish and Hindi cover the shell — navigation, actions, stage names. Untranslated strings fall back to
              English rather than going blank. Drafted with the free AI key for human review, not a paid translation
              service.
            </p>

            <div className="mt-3 p-3 rounded-xl bg-light-200/70 dark:bg-dark-900 border border-light-300 dark:border-dark-800">
              <p className="text-[11px] text-light-600 dark:text-dark-300 leading-relaxed">
                <strong className="text-light-900 dark:text-white">Keyboard board:</strong> arrows to move between cards,
                ⌥+arrow or 1–6 to move the focused card, Enter to open, ? for the full list. Toasts and stage changes are
                announced through a live region.
              </p>
            </div>
          </Section>

          <Section
            icon={Columns3}
            title="Pipeline & board"
            description="Rename and reorder your stages, set soft limits per column, and group cards into seasons."
          >
            <label className="label">Stage names and order</label>
            <div className="space-y-1.5">
              {(prefs.stageOrder.length ? prefs.stageOrder : [...STAGES]).map((stage, index, list) => (
                <div key={stage} className="flex items-center gap-1.5">
                  <input
                    value={prefs.stageLabels[stage] ?? ''}
                    onChange={e => savePreferences({ stageLabels: { ...prefs.stageLabels, [stage]: e.target.value } })}
                    placeholder={stage}
                    className="input-field !py-1.5 !text-xs flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={prefs.wipLimits[stage] ?? ''}
                    onChange={e => {
                      const value = Number(e.target.value);
                      savePreferences({ wipLimits: { ...prefs.wipLimits, [stage]: value > 0 ? value : 0 } });
                    }}
                    placeholder="WIP"
                    title="Soft limit for this column (blank or 0 = none)"
                    className="input-field !py-1.5 !text-xs !w-16 text-center"
                  />
                  <button
                    onClick={() => {
                      const next = [...list];
                      const target = index === 0 ? next.length - 1 : index - 1;
                      [next[index], next[target]] = [next[target], next[index]];
                      savePreferences({ stageOrder: next });
                    }}
                    className="btn-ghost btn-icon !p-1.5"
                    aria-label={`Move ${stage} earlier`}
                    title="Move earlier"
                  >
                    ↑
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1.5 leading-relaxed">
              Renaming is presentation only — stored data, automations and analytics keep using the canonical names, so a
              rename can never orphan a record. A WIP limit warns rather than blocks.
            </p>

            <div className="divider my-3" />
            <label className="label flex items-center gap-1.5">
              <Layers size={11} /> Seasons
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {store.seasons.map(season => (
                <span key={season.id} className="chip group">
                  {season.name}
                  <button
                    onClick={() => deleteSeason(season.id)}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 text-light-400 hover:text-red-500 transition-opacity"
                    aria-label={`Delete ${season.name}`}
                  >
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}
              {store.seasons.length === 0 && (
                <p className="text-[11px] text-light-500 dark:text-dark-400">
                  None yet — e.g. “Summer 2026”, “New Grad 2027”.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={seasonName}
                onChange={e => setSeasonName(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !seasonName.trim()) return;
                  addSeason(seasonName);
                  setSeasonName('');
                }}
                placeholder="New season name"
                className="input-field !py-1.5 !text-xs"
              />
              <button
                onClick={() => {
                  if (!seasonName.trim()) return;
                  addSeason(seasonName);
                  setSeasonName('');
                }}
                className="btn-secondary btn-sm"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1.5">
              A season switcher appears on the dashboard once you have one, scoping the whole pipeline.
            </p>
          </Section>
        </div>

        <Section
          icon={Plug}
          title="Integrations"
          description="Every one of these is free with no card: webhooks into Discord, Slack, Zapier, Make or IFTTT, a Telegram bot, EmailJS, a calendar feed, and a bookmarklet that needs no extension store."
        >
          <label className="label">Webhook URL</label>
          <input
            value={prefs.webhookUrl}
            onChange={e => savePreferences({ webhookUrl: e.target.value.trim() })}
            placeholder="https://discord.com/api/webhooks/…"
            className="input-field font-mono !text-xs"
          />
          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">
            Used by the <code>webhook</code> and <code>send_ics</code> automation actions. Discord and Slack incoming
            webhooks both accept this payload as-is; Zapier, Make and IFTTT catch hooks chain it into hundreds of other
            free-tier apps.
          </p>

          <div className="divider my-3" />
          <label className="label">Telegram bot</label>
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={prefs.telegramToken}
              onChange={e => savePreferences({ telegramToken: e.target.value.trim() })}
              placeholder="Bot token from @BotFather"
              className="input-field font-mono !text-xs"
            />
            <input
              value={prefs.telegramChatId}
              onChange={e => savePreferences({ telegramChatId: e.target.value.trim() })}
              placeholder="Your chat id"
              className="input-field font-mono !text-xs"
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={async () => {
                if (!prefs.telegramToken || !prefs.telegramChatId) {
                  toast('Add both the bot token and your chat id first.', 'error');
                  return;
                }
                try {
                  const res = await fetch(`https://api.telegram.org/bot${prefs.telegramToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: prefs.telegramChatId, text: 'InternTrack is connected. ✅' }),
                  });
                  toast(res.ok ? 'Test message sent.' : 'Telegram rejected that token or chat id.', res.ok ? 'success' : 'error');
                } catch {
                  toast('Could not reach Telegram.', 'error');
                }
              }}
              className="btn-secondary btn-sm"
            >
              <Send size={12} /> Send a test
            </button>
            <a
              href="https://core.telegram.org/bots#how-do-i-create-a-bot"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-primary-600 dark:text-primary-400 underline"
            >
              How to make a bot <ExternalLink size={9} className="inline" />
            </a>
          </div>

          <div className="divider my-3" />
          <label className="label">EmailJS — browser-sent mail (free tier: 200/month)</label>
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={prefs.emailjsServiceId}
              onChange={e => savePreferences({ emailjsServiceId: e.target.value.trim() })}
              placeholder="Service ID"
              className="input-field font-mono !text-xs"
            />
            <input
              value={prefs.emailjsTemplateId}
              onChange={e => savePreferences({ emailjsTemplateId: e.target.value.trim() })}
              placeholder="Template ID"
              className="input-field font-mono !text-xs"
            />
            <input
              value={prefs.emailjsPublicKey}
              onChange={e => savePreferences({ emailjsPublicKey: e.target.value.trim() })}
              placeholder="Public key"
              className="input-field font-mono !text-xs"
            />
            <input
              value={prefs.emailjsTo}
              onChange={e => savePreferences({ emailjsTo: e.target.value.trim() })}
              placeholder="Send digests to…"
              className="input-field font-mono !text-xs"
            />
          </div>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">
            Your template needs <code>to_email</code>, <code>subject</code> and <code>message</code> parameters. The
            <code> email</code> automation action then sends from the browser with no backend.
          </p>

          <div className="divider my-3" />
          <label className="label flex items-center gap-1.5">
            <Bookmark size={11} /> “Add to InternTrack” bookmarklet
          </label>
          <p className="text-[11px] text-light-600 dark:text-dark-300 leading-relaxed mb-2">
            Drag this to your bookmarks bar. On any job posting, click it and the new-application form opens prefilled —
            no extension store, no developer fee. It reads only what the page publishes about itself and passes the
            fields in the URL hash, which browsers never send to a server.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              // Set on the DOM node, not as a prop: React warns about `javascript:`
              // hrefs and a future version blocks them outright.
              ref={el => el?.setAttribute('href', bookmarklet)}
              onClick={e => e.preventDefault()}
              draggable
              className="btn-primary btn-sm cursor-grab active:cursor-grabbing"
              title="Drag me to your bookmarks bar"
            >
              <Bookmark size={12} /> Add to InternTrack
            </a>
            <button
              onClick={async () => {
                if (!(await copyText(bookmarklet))) {
                  toast('Could not copy — drag the button to your bookmarks bar instead.', 'error');
                  return;
                }
                setBookmarkletCopied(true);
                setTimeout(() => setBookmarkletCopied(false), 2000);
              }}
              className="btn-secondary btn-sm"
            >
              {bookmarkletCopied ? <Check size={12} /> : <Copy size={12} />} {bookmarkletCopied ? 'Copied' : 'Copy code'}
            </button>
            <span className="text-[11px] text-light-500 dark:text-dark-400">
              A full unpacked extension lives in <code>extension/</code>.
            </span>
          </div>
        </Section>

        <Section
          icon={Link2}
          title="Share a read-only dashboard"
          description="A link for a mentor or career centre showing your aggregate insights — never the applications, notes or contacts themselves."
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => void createShare()} disabled={sharing || !user} className="btn-primary btn-sm">
              {sharing ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} Create a link
            </button>
            <button onClick={() => void loadShareLinks()} className="btn-secondary btn-sm">
              Show my links
            </button>
            <button
              onClick={() => {
                const html = buildPortfolioHtml(applications, analytics, store, {
                  ownerName: (user?.user_metadata?.name as string) || '',
                  includeCompanies: true,
                });
                downloadHtml('interntrack-portfolio.html', html);
                toast('A single self-contained HTML file — no account needed to open it.', 'success');
              }}
              className="btn-secondary btn-sm"
            >
              <Download size={12} /> Portfolio export
            </button>
            <button
              onClick={() => {
                const targets = applications
                  .filter(a => store.starred.includes(a.id))
                  .map(a => ({
                    company: a.company_name,
                    role: a.role_applied_to,
                    why:
                      store.notes.find(n => n.application_id === a.id)?.body ||
                      a.company_description ||
                      'Shortlisted in my tracker.',
                  }));
                if (!targets.length) {
                  toast('Star the companies you want on the list first.', 'info');
                  return;
                }
                printHtml(buildLeaveBehindHtml(targets, (user?.user_metadata?.name as string) || ''));
              }}
              className="btn-secondary btn-sm"
            >
              Career-fair list
            </button>
          </div>

          {shareError && (
            <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">{shareError}</p>
          )}

          {shareLinks && shareLinks.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {shareLinks.map(link => (
                <li key={link.token} className="panel p-2.5 flex items-center gap-2 text-xs">
                  <code className="flex-1 truncate text-light-700 dark:text-dark-200">{shareUrl(link.token)}</code>
                  <span className="text-light-500 dark:text-dark-400 whitespace-nowrap">{link.view_count} views</span>
                  {link.revoked ? (
                    <span className="badge bg-light-200 dark:bg-dark-800 text-light-500">revoked</span>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          const ok = await copyText(shareUrl(link.token));
                          toast(ok ? 'Link copied.' : 'Could not copy the link.', ok ? 'success' : 'error');
                        }}
                        className="btn-ghost btn-icon !p-1"
                        aria-label="Copy link"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={async () => {
                          await revokeShareLink(link.token);
                          await loadShareLinks();
                          toast('Link revoked.', 'info');
                        }}
                        className="btn-ghost btn-icon !p-1 text-light-400 hover:text-red-500"
                        aria-label="Revoke"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-3 leading-relaxed">
            Links carry a snapshot, not a live feed, and expire after 90 days. Anonymous visitors can only read through a
            function that takes one token, so a link can never be widened into a listing.
          </p>
        </Section>

        <Section
          icon={Lock}
          title="Privacy & security"
          description="Encrypt sensitive local fields behind a passphrase, lock the app when idle, add a second login factor, or wipe everything."
        >
          <Toggle
            on={prefs.signedUrls}
            onChange={v => savePreferences({ signedUrls: v })}
            label="Time-limited document links"
            hint="Resumes and cover letters are served through signed URLs that expire in an hour, instead of permanently public ones."
          />

          <div className="divider my-2" />
          <label className="label">Local vault passphrase</label>
          {!vaultSupported() ? (
            <p className="text-[11px] text-light-500 dark:text-dark-400">This browser has no Web Crypto support.</p>
          ) : hasPassphrase() ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`badge ${isUnlocked() ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'}`}
              >
                {isUnlocked() ? 'Unlocked this session' : 'Locked'}
              </span>
              {!isUnlocked() && (
                <>
                  <input
                    type="password"
                    value={vaultPass}
                    onChange={e => setVaultPass(e.target.value)}
                    placeholder="Passphrase"
                    className="input-field !py-1.5 !text-xs !w-auto"
                  />
                  <button
                    onClick={async () => {
                      setVaultBusy(true);
                      const ok = await verifyPassphrase(vaultPass);
                      setVaultBusy(false);
                      if (!ok) {
                        toast('That passphrase does not match.', 'error');
                        return;
                      }
                      unlockVault(vaultPass);
                      setVaultPass('');
                      toast('Vault unlocked for this tab.', 'success');
                    }}
                    disabled={vaultBusy || !vaultPass}
                    className="btn-secondary btn-sm"
                  >
                    Unlock
                  </button>
                </>
              )}
              {isUnlocked() && (
                <button
                  onClick={() => {
                    lockVault();
                    toast('Locked.', 'info');
                  }}
                  className="btn-secondary btn-sm"
                >
                  <Lock size={12} /> Lock now
                </button>
              )}
              <button
                onClick={() => {
                  if (!window.confirm('Remove the passphrase? Anything already encrypted stays encrypted and unreadable.')) return;
                  forgetPassphrase();
                  lockVault();
                  toast('Passphrase removed.', 'info');
                }}
                className="btn-ghost btn-sm"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="password"
                value={vaultPass}
                onChange={e => setVaultPass(e.target.value)}
                placeholder="Choose a passphrase"
                className="input-field !py-1.5 !text-xs !w-auto"
              />
              <button
                onClick={async () => {
                  if (vaultPass.length < 8) {
                    toast('Use at least eight characters.', 'error');
                    return;
                  }
                  setVaultBusy(true);
                  await setPassphrase(vaultPass);
                  unlockVault(vaultPass);
                  setVaultBusy(false);
                  setVaultPass('');
                  toast('Vault set up. It is never stored — losing it loses the encrypted values.', 'success');
                }}
                disabled={vaultBusy || vaultPass.length < 8}
                className="btn-secondary btn-sm"
              >
                {vaultBusy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />} Set passphrase
              </button>
            </div>
          )}
          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1.5 leading-relaxed">
            AES-GCM through the browser's own Web Crypto API, with a PBKDF2-derived key. The passphrase is never stored
            or transmitted — only a verifier blob is, so a wrong passphrase fails cleanly instead of producing garbage.
          </p>

          <div className="divider my-3" />
          <label className="label">Lock when idle</label>
          <select
            value={prefs.autoLockMinutes}
            onChange={e => savePreferences({ autoLockMinutes: Number(e.target.value) })}
            className="input-field"
          >
            <option value={0}>Never</option>
            <option value={5}>After 5 minutes</option>
            <option value={15}>After 15 minutes</option>
            <option value={30}>After 30 minutes</option>
            <option value={60}>After an hour</option>
          </select>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">
            Re-prompts for the vault passphrase without signing you out. Needs a passphrase set above.
          </p>

          <div className="divider my-3" />
          <label className="label">Two-factor login (TOTP)</label>
          {mfaStatus === 'enrolled' ? (
            <div className="flex items-center gap-2">
              <span className="badge bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck size={10} /> Enabled
              </span>
              <button onClick={() => void disableTotp()} className="btn-ghost btn-sm">
                Turn off
              </button>
            </div>
          ) : mfaEnroll ? (
            <div className="space-y-2">
              <img src={mfaEnroll.qr} alt="Scan this QR code with your authenticator app" className="w-40 h-40 rounded-xl bg-white p-2" />
              <p className="text-[11px] text-light-600 dark:text-dark-300 break-all">
                Or enter this secret manually: <code>{mfaEnroll.secret}</code>
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={mfaCode}
                  onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  className="input-field !py-1.5 !text-xs !w-32 text-center font-mono"
                />
                <button onClick={() => void confirmTotp()} disabled={mfaCode.length < 6} className="btn-primary btn-sm">
                  Confirm
                </button>
                <button onClick={() => setMfaEnroll(null)} className="btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => void enrollTotp()} className="btn-secondary btn-sm">
              <ShieldCheck size={12} /> Set up an authenticator app
            </button>
          )}
          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1.5">
            Supabase Auth supports TOTP on the free tier. The existing one-time codes cover signup and password changes;
            this adds a second factor at every sign-in.
          </p>

          <div className="divider my-3" />
          <label className="label text-red-600 dark:text-red-400">Delete everything</label>
          <p className="text-[11px] text-light-600 dark:text-dark-300 leading-relaxed mb-2">
            Deletes your applications, uploaded resumes and cover letters, and every share link from Supabase, then
            clears this browser's workspace and signs you out. Export first — this cannot be undone.
          </p>
          {wipeConfirm === 0 ? (
            <button onClick={() => setWipeConfirm(1)} className="btn-danger btn-sm">
              <Trash2 size={12} /> Wipe my data
            </button>
          ) : wipeConfirm === 1 ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setWipeConfirm(2)} className="btn-danger btn-sm">
                I understand — continue
              </button>
              <button onClick={() => setWipeConfirm(0)} className="btn-ghost btn-sm">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => void wipeEverything()} className="btn-danger btn-sm">
                Permanently delete everything
              </button>
              <button onClick={() => setWipeConfirm(0)} className="btn-ghost btn-sm">
                Stop
              </button>
            </div>
          )}
        </Section>

        <Section
          icon={Database}
          title="Your data"
          description="Applications live in Supabase. Everything added since — tags, reminders, notes, contacts, goals, automations, prep cards — is stored in this browser and exports cleanly."
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

          <div className="divider my-3" />
          <label className="label">Import from another tracker</label>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={importPreset.id}
              onChange={e => setImportPreset(PRESETS.find(p => p.id === e.target.value) || PRESETS[0])}
              className="input-field !w-auto !py-1.5 !text-xs"
            >
              {PRESETS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button onClick={() => presetCsvRef.current?.click()} disabled={importing} className="btn-secondary btn-sm">
              {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Choose CSV
            </button>
            <input
              ref={presetCsvRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void runPresetImport(file);
              }}
            />
          </div>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1.5 leading-relaxed">
            {importPreset.hint} Near-duplicates of what you already track are held back, and you see the counts before
            anything is written. LinkedIn lets any user download their own applied-jobs history for free — that export
            works here too.
          </p>

          <div className="divider my-3" />
          <label className="label">Backup reminder</label>
          <div className="flex items-center gap-2">
            <select
              value={prefs.backupNudgeDays}
              onChange={e => savePreferences({ backupNudgeDays: Number(e.target.value) })}
              className="input-field !w-auto !py-1.5 !text-xs"
            >
              <option value={0}>Never remind me</option>
              <option value={7}>Every week</option>
              <option value={14}>Every two weeks</option>
              <option value={21}>Every three weeks</option>
              <option value={30}>Every month</option>
            </select>
            <button
              onClick={() => {
                downloadText('interntrack-workspace.json', exportStore(), 'application/json');
                markBackupTaken();
              }}
              className="btn-secondary btn-sm"
            >
              <Download size={12} /> Back up now
            </button>
          </div>
          <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1.5">
            The richest data — tags, notes, contacts, automations, prep cards — lives only in this browser.
          </p>
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
              // Detects the columns itself and shows the counts before writing;
              // this button used to parse the file and then do nothing with it.
              if (f) void runPresetImport(f, 'auto');
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
          {usage.limit && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-[11px] mb-1">
                <span className="font-semibold uppercase tracking-wide text-light-500 dark:text-dark-400">
                  Today&rsquo;s free-tier usage
                </span>
                <span className="tabular-nums text-light-700 dark:text-dark-200">
                  {usage.used} / {usage.limit} requests
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-light-300 dark:bg-dark-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${usage.ratio >= 0.8 ? 'bg-amber-500' : 'bg-primary-500'}`}
                  style={{ width: `${Math.max(usage.ratio * 100, 1)}%` }}
                />
              </div>
              <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">
                Counted in this browser against {PROVIDERS[prefs.aiProvider].label}&rsquo;s published daily ceiling, so
                you get a warning before a rate-limit error rather than after it.
              </p>
            </div>
          )}

          {prefs.scoutMemory.length > 0 && (
            <div className="mt-4">
              <label className="label">What Scout remembers</label>
              <ul className="space-y-1">
                {prefs.scoutMemory.map(line => (
                  <li key={line} className="flex items-start gap-2 text-[11px] text-light-700 dark:text-dark-200">
                    <span className="text-primary-500 mt-0.5">•</span>
                    <span className="flex-1">{line}</span>
                    <button
                      onClick={() => savePreferences({ scoutMemory: prefs.scoutMemory.filter(m => m !== line) })}
                      className="text-light-400 hover:text-red-500"
                      aria-label="Forget this"
                    >
                      <Trash2 size={10} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-light-500 dark:text-dark-400 mt-1">
                Injected into Scout&rsquo;s context on every turn. Say “remember that …” to add one.
              </p>
            </div>
          )}

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
