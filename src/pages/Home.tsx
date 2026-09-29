import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  BrainCircuit,
  CalendarDays,
  Check,
  Command,
  Download,
  FolderKanban,
  Github,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Scout, your AI co-pilot',
    body: 'An assistant with genuine read and write access to your tracker. It reads your pipeline, adds applications, moves stages, schedules follow-ups, drafts emails and even changes the page you are on — through 30+ real tools, not canned replies.',
    span: true,
  },
  {
    icon: FolderKanban,
    title: 'Kanban pipeline',
    body: 'Drag applications across Wishlist → Applied → In Review → Interviewing → Offer. Status fields stay in sync automatically.',
  },
  {
    icon: TrendingUp,
    title: 'Insights that mean something',
    body: 'Conversion funnel, per-platform interview rates, 12-week cadence, activity heatmap, streaks and a momentum score.',
  },
  {
    icon: Bell,
    title: 'Follow-ups that fire',
    body: 'Quiet applications get flagged, reminders arrive as native browser notifications, and interviews count down.',
  },
  {
    icon: CalendarDays,
    title: 'One calendar',
    body: 'Interviews, reminders and application dates on a single month view, with a “plan my fortnight” button.',
  },
  {
    icon: Command,
    title: '⌘K everything',
    body: 'A command palette that jumps to any application, view, page or action without lifting your hands.',
  },
  {
    icon: Workflow,
    title: 'Automations that run themselves',
    body: 'Rules and one-click templates: nudge quiet applications, add prep tasks before interviews, tag offers, ping a webhook. Quiet hours included.',
  },
  {
    icon: BrainCircuit,
    title: 'A prep trainer',
    body: 'Turn the questions you were asked into spaced-repetition flashcards, and keep the STAR stories you reuse in every behavioural round.',
  },
  {
    icon: Download,
    title: 'Your data, portable',
    body: 'PDF, DOCX, CSV, JSON and ZIP exports with attachments. Import back in, or share a read-only dashboard link. Nothing is locked up.',
  },
  {
    icon: ShieldCheck,
    title: 'Offline and private',
    body: 'Installable as an app, keeps working with no connection and syncs when you are back. Sensitive notes can sit behind a local passphrase.',
  },
];

const STACK = [
  ['Hosting', 'Vercel Hobby'],
  ['Database & auth', 'Supabase free tier'],
  ['AI', 'Gemini / Groq / OpenRouter free tiers, or local Ollama'],
  ['Charts', 'Hand-rolled SVG — no paid services'],
  ['Notifications', 'Native browser APIs'],
];

export default function Home() {
  const { user } = useAuth();
  usePageTitle();

  return (
    <div className="min-h-screen pt-16">
      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-noise opacity-60 dark:opacity-25" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary-100/80 dark:bg-primary-950/50 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-900 mb-6 animate-fade-in">
            <Zap size={12} /> Version 4 — undo, offline sync, a prep trainer and shareable insights
          </span>

          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-light-900 dark:text-white leading-[1.05] animate-slide-up">
            Run your internship search
            <br />
            <span className="text-gradient">like a premium operation.</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-light-700 dark:text-dark-200 max-w-2xl mx-auto leading-relaxed animate-slide-up">
            Track every application, interview round and learning in one place — then hand the busywork to an AI assistant
            that can see and change your whole tracker. Built to cost nothing to run.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3 animate-slide-up">
            {user ? (
              <Link to="/dashboard" className="btn-primary !px-6 !py-3 !text-base">
                Open your dashboard <ArrowRight size={17} />
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary !px-6 !py-3 !text-base">
                  Start tracking free <ArrowRight size={17} />
                </Link>
                <Link to="/login" className="btn-secondary !px-6 !py-3 !text-base">
                  I already have an account
                </Link>
              </>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-light-600 dark:text-dark-300">
            {['No card, ever', 'Your AI key stays in your browser', 'Export everything, any time'].map(t => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <Check size={12} className="text-emerald-500" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <article
                key={f.title}
                className={`card p-6 card-hover ${f.span ? 'sm:col-span-2 lg:col-span-3 bg-gradient-to-br from-primary-50/80 to-accent-50/40 dark:from-primary-950/25 dark:to-accent-950/15 border-primary-200 dark:border-primary-900' : ''}`}
              >
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                    f.span
                      ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white shadow-soft'
                      : 'bg-light-200 dark:bg-dark-800 text-primary-600 dark:text-primary-400'
                  }`}
                >
                  <Icon size={18} />
                </span>
                <h3 className={`font-semibold text-light-900 dark:text-white mb-2 ${f.span ? 'text-lg' : 'text-base'}`}>
                  {f.title}
                </h3>
                <p className={`text-light-700 dark:text-dark-200 leading-relaxed ${f.span ? 'text-sm max-w-3xl' : 'text-[13px]'}`}>
                  {f.body}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* cost */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="card p-7">
          <h2 className="text-xl font-bold text-light-900 dark:text-white">Zero-cost by design</h2>
          <p className="text-sm text-light-700 dark:text-dark-200 mt-1.5 mb-5 leading-relaxed">
            Every layer runs on a permanent free tier. There is no paid dependency anywhere in the stack — that was a hard
            constraint, not an afterthought.
          </p>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {STACK.map(([k, v]) => (
              <div key={k} className="flex items-start gap-2.5 py-1.5 border-b border-light-300 dark:border-dark-800">
                <Check size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-light-900 dark:text-white">{k}</dt>
                  <dd className="text-xs text-light-600 dark:text-dark-300">{v}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* cta */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-light-900 dark:text-white">
          Stop losing track. Start closing offers.
        </h2>
        <p className="text-sm text-light-700 dark:text-dark-200 mt-3 max-w-xl mx-auto">
          Set it up in two minutes. Connect a free AI key whenever you feel like it — everything works without one.
        </p>
        <Link to={user ? '/dashboard' : '/register'} className="btn-primary !px-6 !py-3 !text-base mt-7">
          {user ? 'Back to your dashboard' : 'Create your tracker'} <ArrowRight size={17} />
        </Link>
      </section>

      <footer className="border-t border-light-300 dark:border-dark-800 py-7 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-light-500 dark:text-dark-400 text-xs">
            © {new Date().getFullYear()} Made with ❤️ by Brett Cooper
          </p>
          <a
            href="https://github.com/GH-BCooper/intern_job_assist"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-light-600 dark:text-dark-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <Github size={13} /> Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
