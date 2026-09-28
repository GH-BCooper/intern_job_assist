import { useState } from 'react';
import { ArrowRight, Check, KeyRound, Palette, Sparkles, Target, X } from 'lucide-react';
import AccentPicker from './ui/AccentPicker';
import { PROVIDERS } from '../lib/ai/providers';
import { savePreferences, setGoal, type AiProviderId } from '../lib/store';
import { usePreferences } from '../hooks/useStore';
import { emitUi, toast } from '../lib/uiBus';
import { play } from '../lib/fx';

type StepId = 'welcome' | 'accent' | 'ai' | 'goal' | 'done';

const ORDER: StepId[] = ['welcome', 'accent', 'ai', 'goal', 'done'];

/**
 * First-run flow, finally paired with the `onboarded` flag that already existed.
 *
 * Every step is skippable: the point is to make the four things that make the app
 * feel like yours discoverable, not to gate the app behind a wizard.
 */
export default function Onboarding({ onClose }: { onClose: () => void }) {
  const prefs = usePreferences();
  const [step, setStep] = useState<StepId>('welcome');
  const [provider, setProvider] = useState<AiProviderId>(prefs.aiProvider);
  const [key, setKey] = useState('');
  const [weeklyTarget, setWeeklyTarget] = useState(5);

  const index = ORDER.indexOf(step);

  const finish = () => {
    savePreferences({ onboarded: true });
    play('chime');
    onClose();
  };

  const next = () => {
    const following = ORDER[index + 1];
    if (following) setStep(following);
    else finish();
  };

  const saveKey = () => {
    const trimmed = key.trim();
    if (!trimmed) {
      next();
      return;
    }
    savePreferences({ aiProvider: provider, aiKeys: { ...prefs.aiKeys, [provider]: trimmed } });
    toast(`${PROVIDERS[provider].label} connected. Scout is live.`, 'success');
    next();
  };

  return (
    <div
      className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to InternTrack"
    >
      <div className="w-full max-w-lg card p-0 overflow-hidden animate-scale-in relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60">
          <div className="ambient-mesh" />
        </div>

        <div className="relative p-6 sm:p-8">
          <button
            onClick={finish}
            className="absolute top-4 right-4 btn-ghost btn-icon"
            aria-label="Skip setup"
          >
            <X size={16} />
          </button>

          {/* progress */}
          <div className="flex items-center gap-1.5 mb-6">
            {ORDER.map((id, i) => (
              <span
                key={id}
                className={`h-1 rounded-full transition-all ${
                  i <= index ? 'bg-primary-500 w-7' : 'bg-light-300 dark:bg-dark-800 w-3.5'
                }`}
              />
            ))}
          </div>

          {step === 'welcome' && (
            <div className="animate-slide-up">
              <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white mb-4">
                <Sparkles size={20} />
              </span>
              <h2 className="font-display text-2xl font-bold text-light-900 dark:text-white mb-2">
                Welcome to InternTrack
              </h2>
              <p className="text-sm text-light-600 dark:text-dark-300 leading-relaxed mb-5">
                A pipeline for your internship search: a Kanban board, an AI assistant that can actually act on your
                tracker, automations that run without you, and analytics that tell you what to fix. It runs entirely on
                free tiers, and the personal data lives in this browser.
              </p>
              <p className="text-xs text-light-500 dark:text-dark-400 mb-6">
                Three quick choices — about forty seconds.
              </p>
              <button onClick={next} className="btn-primary w-full">
                Set it up <ArrowRight size={15} />
              </button>
            </div>
          )}

          {step === 'accent' && (
            <div className="animate-slide-up">
              <span className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-4">
                <Palette size={20} />
              </span>
              <h2 className="font-display text-2xl font-bold text-light-900 dark:text-white mb-2">Pick a colour</h2>
              <p className="text-sm text-light-600 dark:text-dark-300 mb-5">
                Applies instantly, everywhere. Changeable later in Settings.
              </p>
              <AccentPicker />
              <button onClick={next} className="btn-primary w-full mt-6">
                Next <ArrowRight size={15} />
              </button>
            </div>
          )}

          {step === 'ai' && (
            <div className="animate-slide-up">
              <span className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-4">
                <KeyRound size={20} />
              </span>
              <h2 className="font-display text-2xl font-bold text-light-900 dark:text-white mb-2">
                Connect a free AI key
              </h2>
              <p className="text-sm text-light-600 dark:text-dark-300 mb-4">
                Optional. Scout can read and write your whole tracker, draft follow-ups and build automations. Every
                supported provider has a free tier that needs no card.
              </p>
              <div className="space-y-2.5">
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value as AiProviderId)}
                  className="input-field"
                >
                  {Object.values(PROVIDERS).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-light-500 dark:text-dark-400">{PROVIDERS[provider].free}</p>
                {PROVIDERS[provider].needsKey ? (
                  <>
                    <input
                      type="password"
                      value={key}
                      onChange={e => setKey(e.target.value)}
                      placeholder={PROVIDERS[provider].keyLabel}
                      className="input-field font-mono !text-xs"
                    />
                    <a
                      href={PROVIDERS[provider].keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary-600 dark:text-primary-400 underline"
                    >
                      Get a free key →
                    </a>
                  </>
                ) : (
                  <p className="text-xs text-light-600 dark:text-dark-300">
                    Ollama runs on your own machine — no key, and it works offline.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 mt-6">
                <button onClick={saveKey} className="btn-primary flex-1">
                  {key.trim() ? 'Save and continue' : 'Continue'} <ArrowRight size={15} />
                </button>
                <button onClick={next} className="btn-ghost">
                  Skip
                </button>
              </div>
            </div>
          )}

          {step === 'goal' && (
            <div className="animate-slide-up">
              <span className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-4">
                <Target size={20} />
              </span>
              <h2 className="font-display text-2xl font-bold text-light-900 dark:text-white mb-2">Set a weekly target</h2>
              <p className="text-sm text-light-600 dark:text-dark-300 mb-5">
                Cadence is the one input you fully control. Insights tracks you against this, and an automation can warn you
                when you drift off pace.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={weeklyTarget}
                  onChange={e => setWeeklyTarget(Number(e.target.value))}
                  className="flex-1 accent-primary-500"
                />
                <span className="text-2xl font-bold tabular-nums text-light-900 dark:text-white w-10 text-right">
                  {weeklyTarget}
                </span>
              </div>
              <p className="text-[11px] text-light-500 dark:text-dark-400 mt-2">applications per week</p>
              <button
                onClick={() => {
                  setGoal('applications', weeklyTarget, 'week');
                  next();
                }}
                className="btn-primary w-full mt-6"
              >
                Save the goal <ArrowRight size={15} />
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="animate-slide-up text-center">
              <span className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <Check size={22} strokeWidth={3} />
              </span>
              <h2 className="font-display text-2xl font-bold text-light-900 dark:text-white mb-2">You're set up</h2>
              <p className="text-sm text-light-600 dark:text-dark-300 mb-6 leading-relaxed">
                Add your first application, or just tell Scout: “I applied to Stripe for a backend internship on LinkedIn
                today.” Press <span className="kbd">⌘K</span> any time to search or jump anywhere.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    finish();
                    emitUi({ type: 'new-application' });
                  }}
                  className="btn-primary flex-1"
                >
                  Add an application
                </button>
                <button
                  onClick={() => {
                    finish();
                    emitUi({ type: 'open-assistant' });
                  }}
                  className="btn-secondary"
                >
                  <Sparkles size={14} /> Ask Scout
                </button>
              </div>
              <button onClick={finish} className="btn-ghost btn-sm mt-2 w-full">
                Just show me the dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
