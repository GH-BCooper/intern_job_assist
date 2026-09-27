import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUp,
  Bell,
  BarChart3,
  ChevronDown,
  Cpu,
  KeyRound,
  Loader2,
  Mail,
  MessageSquarePlus,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import { useAI } from '../context/AIContext';
import { QUICK_PROMPTS } from '../lib/ai/agent';
import { WRITE_TOOLS } from '../lib/ai/tools';
import Markdown from './ui/Markdown';
import { relative } from '../lib/format';
import { onUi } from '../lib/uiBus';

const ICONS: Record<string, typeof Sparkles> = {
  sparkles: Sparkles,
  bell: Bell,
  target: Target,
  mail: Mail,
  chart: BarChart3,
  wand: Wand2,
};

function ToolTrace({ traces }: { traces: { name: string; args: unknown; error?: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!traces.length) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-light-500 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
      >
        <Wrench size={11} />
        {traces.length} action{traces.length === 1 ? '' : 's'}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 animate-fade-in">
          {traces.map((t, i) => (
            <li
              key={`${t.name}-${i}`}
              className="flex items-start gap-2 text-[11px] font-mono px-2 py-1.5 rounded-lg bg-light-200/70 dark:bg-dark-800/70 border border-light-300 dark:border-dark-700"
            >
              <span
                className={`badge !px-1.5 !py-0 !text-[9px] ${
                  t.error
                    ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                    : WRITE_TOOLS.has(t.name)
                      ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                      : 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300'
                }`}
              >
                {t.error ? 'fail' : WRITE_TOOLS.has(t.name) ? 'write' : 'read'}
              </span>
              <span className="flex-1 min-w-0 break-words text-light-700 dark:text-dark-200">
                {t.name}
                {t.error ? ` — ${t.error}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AssistantPanel() {
  const ai = useAI();
  const [draft, setDraft] = useState('');
  const [showThreads, setShowThreads] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () =>
      onUi(e => {
        if (e.type === 'open-assistant') {
          ai.setOpen(true);
          if (e.prompt) void ai.send(e.prompt);
        }
      }),
    [ai],
  );

  useEffect(() => {
    if (!ai.open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [ai.open, ai.activeThreadId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [ai.activeThread?.messages.length, ai.busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ai.open) ai.setOpen(false);
      if (e.key.toLowerCase() === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ai.setOpen(!ai.open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ai]);

  const submit = () => {
    const text = draft.trim();
    if (!text || ai.busy) return;
    setDraft('');
    void ai.send(text);
  };

  const messages = ai.activeThread?.messages || [];

  return (
    <>
      {!ai.open && (
        <button
          onClick={() => ai.setOpen(true)}
          className="fixed bottom-5 right-5 z-[90] group flex items-center gap-2 pl-4 pr-5 py-3 rounded-2xl text-white font-semibold text-sm bg-gradient-to-br from-primary-500 to-accent-500 shadow-lift hover:shadow-glow hover:-translate-y-0.5 transition-all"
          title="Ask Scout  (Ctrl/Cmd + J)"
        >
          <span className="relative flex items-center justify-center">
            <span className="absolute w-8 h-8 rounded-full bg-white/40 animate-pulse-ring" />
            <Sparkles size={18} />
          </span>
          Ask Scout
          <span className="hidden sm:inline kbd !bg-white/20 !border-white/30 !text-white/90">⌘J</span>
        </button>
      )}

      {ai.open && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-light-900/20 dark:bg-black/50 backdrop-blur-[2px] animate-fade-in lg:hidden"
            onClick={() => ai.setOpen(false)}
          />
          <aside className="fixed top-0 right-0 bottom-0 z-[100] w-full sm:w-[28rem] flex flex-col bg-light-100 dark:bg-dark-950 border-l border-light-300 dark:border-dark-800 shadow-lift animate-slide-in-right">
            {/* header */}
            <header className="flex items-center gap-2 px-4 h-14 border-b border-light-300 dark:border-dark-800 flex-shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                <Sparkles size={16} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-light-900 dark:text-white leading-tight">Scout</p>
                <p className="text-[10px] text-light-500 dark:text-dark-400 truncate flex items-center gap-1">
                  <Cpu size={9} /> {ai.providerLabel}
                </p>
              </div>
              <button onClick={() => setShowThreads(s => !s)} className="btn-ghost btn-icon" title="Conversations">
                <MessageSquarePlus size={16} />
              </button>
              <button onClick={ai.newThread} className="btn-ghost btn-icon" title="New conversation">
                <Wand2 size={16} />
              </button>
              <button onClick={() => ai.setOpen(false)} className="btn-ghost btn-icon" title="Close">
                <X size={17} />
              </button>
            </header>

            {showThreads && (
              <div className="border-b border-light-300 dark:border-dark-800 max-h-56 overflow-y-auto animate-fade-in flex-shrink-0">
                {ai.threads.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-light-500 dark:text-dark-400">No conversations yet.</p>
                ) : (
                  ai.threads.map(t => (
                    <div
                      key={t.id}
                      className={`flex items-center gap-2 px-4 py-2 text-xs border-l-2 ${
                        t.id === ai.activeThreadId
                          ? 'border-primary-500 bg-light-200 dark:bg-dark-900'
                          : 'border-transparent hover:bg-light-200/60 dark:hover:bg-dark-900/60'
                      }`}
                    >
                      <button
                        onClick={() => {
                          ai.selectThread(t.id);
                          setShowThreads(false);
                        }}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="truncate text-light-800 dark:text-dark-100 font-medium">{t.title}</p>
                        <p className="text-[10px] text-light-500 dark:text-dark-500">
                          {t.messages.length} messages · {relative(t.updated_at)}
                        </p>
                      </button>
                      <button
                        onClick={() => ai.removeThread(t.id)}
                        className="text-light-400 hover:text-red-500 transition-colors"
                        aria-label="Delete conversation"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* body */}
            <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {!ai.configured && (
                <div className="panel p-4 border-primary-300 dark:border-primary-800 bg-primary-50/80 dark:bg-primary-950/30">
                  <div className="flex items-start gap-2.5">
                    <KeyRound size={16} className="text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-light-900 dark:text-white">Connect a free model</p>
                      <p className="text-xs text-light-600 dark:text-dark-300 mt-1 leading-relaxed">
                        Scout runs on your own free API key — Google Gemini, Groq, OpenRouter, or a local Ollama model.
                        Nothing is billed and the key never leaves your browser.
                      </p>
                      <Link to="/settings" onClick={() => ai.setOpen(false)} className="btn-primary btn-sm mt-3">
                        Set it up — 60 seconds
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {messages.length === 0 && (
                <div className="animate-slide-up">
                  <h3 className="text-base font-semibold text-light-900 dark:text-white">
                    I can see and change your entire tracker.
                  </h3>
                  <p className="text-xs text-light-600 dark:text-dark-300 mt-1 leading-relaxed">
                    Ask a question, or tell me to do something — add applications, move stages, schedule follow-ups, draft
                    emails, run analytics, even change the page you are looking at.
                  </p>
                  <div className="grid gap-2 mt-4">
                    {QUICK_PROMPTS.map(q => {
                      const Icon = ICONS[q.icon] || Sparkles;
                      return (
                        <button
                          key={q.label}
                          onClick={() => void ai.send(q.prompt)}
                          disabled={ai.busy}
                          className="card card-hover p-3 text-left flex items-start gap-2.5 disabled:opacity-60"
                        >
                          <Icon size={15} className="text-primary-500 mt-0.5 flex-shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-light-900 dark:text-white">{q.label}</span>
                            <span className="block text-[11px] text-light-600 dark:text-dark-400 leading-snug mt-0.5">
                              {q.prompt}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {messages.map(m =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br-md bg-gradient-to-br from-primary-500 to-accent-500 text-white text-sm leading-relaxed whitespace-pre-wrap">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-2.5 animate-fade-in">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles size={12} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Markdown text={m.content} className="text-light-800 dark:text-dark-100" />
                      <ToolTrace traces={m.toolCalls || []} />
                    </div>
                  </div>
                ),
              )}

              {ai.busy && (
                <div className="flex items-center gap-2.5 text-xs text-light-600 dark:text-dark-300 animate-fade-in">
                  <Loader2 size={14} className="animate-spin text-primary-500" />
                  {ai.status || 'Thinking…'}
                </div>
              )}
            </div>

            {/* composer */}
            <div className="border-t border-light-300 dark:border-dark-800 p-3 flex-shrink-0">
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={2}
                  placeholder="Ask anything, or tell me what to do…"
                  className="input-field resize-none pr-11 py-3 max-h-40"
                />
                <button
                  onClick={submit}
                  disabled={!draft.trim() || ai.busy}
                  className="absolute right-2 bottom-2.5 w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
                  aria-label="Send"
                >
                  {ai.busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-light-500 dark:text-dark-500 mt-1.5 px-1">
                Enter to send · Shift+Enter for a new line · ⌘J to toggle
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
