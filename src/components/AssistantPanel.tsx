import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUp,
  Bell,
  BarChart3,
  ChevronDown,
  Columns2,
  Cpu,
  ImagePlus,
  KeyRound,
  History,
  Loader2,
  Mail,
  MessageSquarePlus,
  Mic,
  MicOff,
  Sparkles,
  Square,
  Target,
  Trash2,
  Volume2,
  Wand2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useAI } from '../context/AIContext';
import { QUICK_PROMPTS } from '../lib/ai/agent';
import { WRITE_TOOLS } from '../lib/ai/tools';
import { PROVIDERS, type ImageAttachment } from '../lib/ai/providers';
import Markdown from './ui/Markdown';
import { relative } from '../lib/format';
import { onUi, toast } from '../lib/uiBus';
import { dictationSupported, isSpeaking, speak, speechSupported, startDictation, stopSpeaking, type Dictation } from '../lib/speech';
import type { AiProviderId } from '../lib/store';

/** Images are inlined as base64, so they have to stay small. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

async function toAttachment(file: File): Promise<ImageAttachment> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('That image is over 3 MB — crop or compress it first.');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
  return { mimeType: file.type || 'image/png', data };
}

const ICONS: Record<string, typeof Sparkles> = {
  sparkles: Sparkles,
  bell: Bell,
  target: Target,
  mail: Mail,
  chart: BarChart3,
  wand: Wand2,
  zap: Zap,
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
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [listening, setListening] = useState(false);
  /** Which reply is being read aloud, so only that one offers "Stop". */
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ provider: AiProviderId; text: string } | null>(null);
  const [comparing, setComparing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const dictation = useRef<Dictation | null>(null);
  /** Text already in the box when dictation started, so interim results append. */
  const dictationBase = useRef('');

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
    // While tokens stream in this runs for every one of them; restarting a smooth
    // scroll each time made the panel judder, so it jumps while streaming.
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: ai.streaming ? 'auto' : 'smooth' });
  }, [ai.activeThread?.messages.length, ai.busy, ai.streaming]);

  // Dictation must not outlive the panel.
  useEffect(
    () => () => {
      dictation.current?.stop();
      stopSpeaking();
    },
    [],
  );

  /** Dictate into the composer with the browser's own speech recognition. */
  const toggleDictation = useCallback(() => {
    if (listening) {
      dictation.current?.stop();
      dictation.current = null;
      setListening(false);
      return;
    }
    dictationBase.current = draft ? `${draft.trim()} ` : '';
    const session = startDictation(
      (transcript, isFinal) => {
        setDraft(`${dictationBase.current}${transcript}`);
        if (isFinal) dictationBase.current = `${dictationBase.current}${transcript} `;
      },
      {
        onError: message => {
          toast(message, 'error');
          setListening(false);
        },
        onEnd: () => setListening(false),
      },
    );
    if (!session) {
      toast('This browser has no speech recognition. Chrome and Edge do.', 'error');
      return;
    }
    dictation.current = session;
    setListening(true);
  }, [listening, draft]);

  const readAloud = useCallback((id: string, text: string) => {
    if (isSpeaking()) {
      const wasThisOne = speakingId === id;
      stopSpeaking();
      setSpeakingId(null);
      if (wasThisOne) return;
    }
    const started = speak(text, { onEnd: () => setSpeakingId(current => (current === id ? null : current)) });
    setSpeakingId(started ? id : null);
    if (!started) toast('This browser cannot read text aloud.', 'error');
  }, [speakingId]);

  const addImages = useCallback(async (files: FileList | File[]) => {
    const picked = [...files].filter(file => file.type.startsWith('image/')).slice(0, 3);
    if (!picked.length) return;
    if (!ai.visionSupported) {
      toast(`${PROVIDERS[ai.usage.provider].label} does not take images. Gemini's free tier does.`, 'error');
      return;
    }
    try {
      const attachments = await Promise.all(picked.map(toAttachment));
      setImages(prev => [...prev, ...attachments].slice(0, 3));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not attach that image.', 'error');
    }
  }, [ai.visionSupported, ai.usage.provider]);

  /** Re-runs the last prompt on a second configured provider, side by side. */
  const runCompare = useCallback(
    async (provider: AiProviderId) => {
      const lastUser = [...(ai.activeThread?.messages || [])].reverse().find(m => m.role === 'user');
      if (!lastUser) {
        toast('Ask something first, then compare the answers.', 'info');
        return;
      }
      setComparing(true);
      setCompare(null);
      try {
        const text = await ai.askWithProvider(provider, lastUser.content);
        setCompare({ provider, text });
      } catch (e) {
        toast(e instanceof Error ? e.message : 'That provider could not answer.', 'error');
      } finally {
        setComparing(false);
      }
    },
    [ai],
  );

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
    if ((!text && !images.length) || ai.busy) return;
    if (listening) {
      dictation.current?.stop();
      setListening(false);
    }
    setDraft('');
    const attached = images;
    setImages([]);
    setCompare(null);
    void ai.send(text || 'Read this job posting and extract the application details.', {
      images: attached.length ? attached : undefined,
    });
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
          <aside
            aria-label="Scout assistant"
            className="fixed top-0 right-0 bottom-0 z-[100] w-full sm:w-[28rem] flex flex-col bg-light-100 dark:bg-dark-950 border-l border-light-300 dark:border-dark-800 shadow-lift animate-slide-in-right"
          >
            {/* header */}
            <header className="flex items-center gap-2 px-4 h-14 border-b border-light-300 dark:border-dark-800 flex-shrink-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                <Sparkles size={16} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-light-900 dark:text-white leading-tight">Scout</p>
                <p className="text-[10px] text-light-500 dark:text-dark-400 truncate flex items-center gap-1">
                  <Cpu size={9} /> {ai.providerLabel}
                  {ai.usage.limit && (
                    <span
                      className={ai.usage.warn ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}
                      title={`${ai.usage.used} of ${ai.usage.limit} free requests used today`}
                    >
                      · {ai.usage.used}/{ai.usage.limit}
                    </span>
                  )}
                </p>
              </div>
              {ai.availableProviders.length > 1 && (
                <div className="relative">
                  <select
                    value=""
                    onChange={e => {
                      const value = e.target.value as AiProviderId;
                      if (value) void runCompare(value);
                      e.target.value = '';
                    }}
                    disabled={comparing || ai.busy}
                    title="Re-run the last prompt on another provider"
                    aria-label="Compare providers"
                    className="appearance-none w-8 h-8 rounded-lg opacity-0 absolute inset-0 cursor-pointer"
                  >
                    <option value="">Compare with…</option>
                    {ai.availableProviders
                      .filter(p => p !== ai.usage.provider)
                      .map(p => (
                        <option key={p} value={p}>
                          {PROVIDERS[p].label}
                        </option>
                      ))}
                  </select>
                  <span className="btn-ghost btn-icon pointer-events-none">
                    {comparing ? <Loader2 size={15} className="animate-spin" /> : <Columns2 size={15} />}
                  </span>
                </div>
              )}
              <button
                onClick={() => setShowThreads(s => !s)}
                className="btn-ghost btn-icon"
                title="Conversations"
                aria-label="Conversations"
                aria-expanded={showThreads}
              >
                <History size={16} />
              </button>
              <button onClick={ai.newThread} className="btn-ghost btn-icon" title="New conversation" aria-label="New conversation">
                <MessageSquarePlus size={16} />
              </button>
              <button onClick={() => ai.setOpen(false)} className="btn-ghost btn-icon" title="Close" aria-label="Close assistant">
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
                      {speechSupported() && m.content.length > 40 && (
                        <button
                          onClick={() => readAloud(m.id, m.content)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-light-500 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        >
                          {speakingId === m.id ? <Square size={10} /> : <Volume2 size={11} />}
                          {speakingId === m.id ? 'Stop' : 'Read aloud'}
                        </button>
                      )}
                    </div>
                  </div>
                ),
              )}

              {/* the in-flight reply, token by token */}
              {ai.streaming && (
                <div className="flex gap-2.5 animate-fade-in">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles size={12} className="text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Markdown text={ai.streaming} className="text-light-800 dark:text-dark-100" />
                    <span className="inline-block w-1.5 h-3.5 align-middle bg-primary-500 animate-pulse ml-0.5" />
                  </div>
                </div>
              )}

              {ai.busy && !ai.streaming && (
                <div className="flex items-center gap-2.5 text-xs text-light-600 dark:text-dark-300 animate-fade-in">
                  <Loader2 size={14} className="animate-spin text-primary-500" />
                  {ai.status || 'Thinking…'}
                </div>
              )}

              {compare && (
                <div className="panel p-3 border-sky-300 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/20 animate-slide-up">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Columns2 size={12} className="text-sky-600 dark:text-sky-400" />
                    <p className="text-[11px] font-semibold text-sky-800 dark:text-sky-200 flex-1">
                      {PROVIDERS[compare.provider].label}&rsquo;s answer to the same prompt
                    </p>
                    <button onClick={() => setCompare(null)} className="text-sky-600/70 hover:text-sky-800 dark:hover:text-sky-200">
                      <X size={12} />
                    </button>
                  </div>
                  <Markdown text={compare.text} className="text-light-800 dark:text-dark-100" />
                </div>
              )}
            </div>

            {/* composer */}
            <div className="border-t border-light-300 dark:border-dark-800 p-3 flex-shrink-0">
              {images.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  {images.map((img, i) => (
                    <span key={i} className="relative">
                      <img
                        src={`data:${img.mimeType};base64,${img.data}`}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover border border-light-300 dark:border-dark-700"
                      />
                      <button
                        onClick={() => setImages(prev => prev.filter((_, index) => index !== i))}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-light-900 dark:bg-dark-50 text-light-50 dark:text-dark-950 flex items-center justify-center"
                        aria-label="Remove image"
                      >
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                  <span className="text-[10px] text-light-500 dark:text-dark-400">
                    Scout will read the posting out of the screenshot.
                  </span>
                </div>
              )}

              <div
                className="relative"
                onPaste={e => {
                  const files = [...(e.clipboardData?.files || [])];
                  if (files.some(file => file.type.startsWith('image/'))) {
                    e.preventDefault();
                    void addImages(files);
                  }
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  if (e.dataTransfer?.files?.length) {
                    e.preventDefault();
                    void addImages(e.dataTransfer.files);
                  }
                }}
              >
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    // Enter while an input method is composing (Japanese, Chinese, Korean)
                    // confirms the candidate; it must not send the message.
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={2}
                  placeholder={listening ? 'Listening…' : 'Ask anything, or tell me what to do…'}
                  className="input-field resize-none pr-[5.5rem] py-3 max-h-40"
                />

                <div className="absolute right-2 bottom-2.5 flex items-center gap-1">
                  {ai.visionSupported && (
                    <>
                      <button
                        onClick={() => imageRef.current?.click()}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-light-500 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title="Attach a screenshot of a job posting"
                        aria-label="Attach an image"
                      >
                        <ImagePlus size={16} />
                      </button>
                      <input
                        ref={imageRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={e => {
                          if (e.target.files?.length) void addImages(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </>
                  )}

                  {dictationSupported() && (
                    <button
                      onClick={toggleDictation}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        listening
                          ? 'bg-accent-500 text-white'
                          : 'text-light-500 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400'
                      }`}
                      title={listening ? 'Stop dictating' : 'Dictate a message'}
                      aria-label={listening ? 'Stop dictating' : 'Dictate a message'}
                      aria-pressed={listening}
                    >
                      {listening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}

                  <button
                    onClick={submit}
                    disabled={(!draft.trim() && !images.length) || ai.busy}
                    className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
                    aria-label="Send"
                  >
                    {ai.busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-light-500 dark:text-dark-500 mt-1.5 px-1">
                Enter to send · Shift+Enter for a new line · ⌘J to toggle
                {ai.visionSupported && ' · paste or drop a screenshot'}
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
