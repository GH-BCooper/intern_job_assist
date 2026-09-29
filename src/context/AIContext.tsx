import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { useStore } from '../hooks/useStore';
import { runAgent, systemPrompt, type AgentStep } from '../lib/ai/agent';
import {
  PROVIDERS,
  chat,
  type ChatMessage,
  type ImageAttachment,
  type ProviderConfig,
} from '../lib/ai/providers';
import type { ToolBridge } from '../lib/ai/tools';
import {
  aiCallsToday,
  appendMessage,
  createThread,
  deleteThread,
  read,
  recordAiCall,
  uid,
  type AiMessage,
  type AiProviderId,
  type AiThread,
} from '../lib/store';
import { toast } from '../lib/uiBus';

export type SendOptions = {
  images?: ImageAttachment[];
  /** Roleplay the interviewer for this application instead of coaching. */
  mock?: { company: string; role: string; questions?: string } | null;
};

export type UsageMeter = {
  provider: AiProviderId;
  label: string;
  used: number;
  limit: number | null;
  /** 0–1 of the known free-tier ceiling. */
  ratio: number;
  warn: boolean;
};

type AIContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
  threads: AiThread[];
  activeThread: AiThread | null;
  activeThreadId: string | null;
  selectThread: (id: string) => void;
  newThread: () => void;
  removeThread: (id: string) => void;
  busy: boolean;
  status: string;
  configured: boolean;
  providerLabel: string;
  send: (text: string, opts?: SendOptions) => Promise<void>;
  askInline: (prompt: string) => Promise<string>;
  /** Text streamed so far for the in-flight reply, before it is committed. */
  streaming: string;
  /** Free-tier usage for the active provider. */
  usage: UsageMeter;
  /** Providers with a key configured, for the A/B compare button. */
  availableProviders: AiProviderId[];
  /** Re-runs a prompt against a second configured provider, without touching the thread. */
  askWithProvider: (provider: AiProviderId, prompt: string) => Promise<string>;
  /** Headless one-shot: turns pasted job text into new-application fields. */
  quickAddFromText: (text: string) => Promise<Record<string, string>>;
  /** Whether the active provider accepts image input. */
  visionSupported: boolean;
};

const AIContext = createContext<AIContextType | null>(null);

export function AIProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const data = useData();
  const store = useStore();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [streaming, setStreaming] = useState('');

  const dataRef = useRef(data);
  dataRef.current = data;
  const routeRef = useRef(location.pathname);
  routeRef.current = location.pathname;

  const prefs = store.preferences;
  const provider = PROVIDERS[prefs.aiProvider] ?? PROVIDERS.gemini;
  const apiKey = prefs.aiKeys[prefs.aiProvider] || '';
  const configured = !provider.needsKey || !!apiKey;

  const cfg = useMemo<ProviderConfig>(
    () => ({
      provider: prefs.aiProvider,
      model: prefs.aiModel[prefs.aiProvider] || provider.defaultModel,
      apiKey,
      baseUrl: prefs.ollamaUrl,
    }),
    [prefs.aiProvider, prefs.aiModel, prefs.ollamaUrl, apiKey, provider.defaultModel],
  );

  const bridge = useMemo<ToolBridge>(
    () => ({
      get applications() {
        return dataRef.current.applications;
      },
      get interviewsMap() {
        return dataRef.current.interviewsMap;
      },
      get learningsMap() {
        return dataRef.current.learningsMap;
      },
      createApplication: d => dataRef.current.createApplication(d),
      updateApplication: (id, patch) => dataRef.current.updateApplication(id, patch),
      deleteApplication: id => dataRef.current.deleteApplication(id),
      addInterviewDate: (id, date, label) => dataRef.current.addInterviewDate(id, date, label),
      refresh: () => dataRef.current.refresh(),
    }),
    [],
  );

  const buildSystem = useCallback((mock?: SendOptions['mock']) => {
    const s = read();
    return systemPrompt({
      userName: (user?.user_metadata?.name as string) || user?.email || '',
      today: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      route: routeRef.current,
      counts: {
        applications: dataRef.current.applications.length,
        reminders: s.reminders.filter(r => !r.done).length,
        tasks: s.tasks.filter(t => !t.done).length,
      },
      tags: s.tags.map(t => t.name),
      autoActions: s.preferences.aiAutoActions,
      memory: s.preferences.scoutMemory,
      mode: mock ? 'mock-interview' : 'assistant',
      mockTarget: mock || undefined,
    });
  }, [user]);

  const threads = store.aiThreads;
  const activeThread = threads.find(t => t.id === activeThreadId) || null;

  const ensureThread = useCallback(() => {
    if (activeThreadId && read().aiThreads.some(t => t.id === activeThreadId)) return activeThreadId;
    const t = createThread();
    setActiveThreadId(t.id);
    return t.id;
  }, [activeThreadId]);

  const toChatHistory = useCallback(
    (thread: AiThread | null, mock?: SendOptions['mock']): ChatMessage[] => {
      const history: ChatMessage[] = [{ role: 'system', content: buildSystem(mock) }];
      (thread?.messages || []).slice(-16).forEach(m => {
        if (m.role === 'user') history.push({ role: 'user', content: m.content });
        else if (m.role === 'assistant' && m.content) history.push({ role: 'assistant', content: m.content });
      });
      return history;
    },
    [buildSystem],
  );

  const send = useCallback(
    async (text: string, opts: SendOptions = {}) => {
      const trimmed = text.trim();
      if ((!trimmed && !opts.images?.length) || busy) return;
      const threadId = ensureThread();
      const imageCount = opts.images?.length || 0;

      // The history is built from the thread *before* the new message is stored,
      // then the message is added once, with its images. Reading the thread after
      // storing it put every prompt into the model's context twice.
      const priorThread = read().aiThreads.find(t => t.id === threadId) || null;
      const history = toChatHistory(priorThread, opts.mock);
      history.push({ role: 'user', content: trimmed, images: opts.images });

      appendMessage(threadId, {
        id: uid(),
        role: 'user',
        content: trimmed || (imageCount ? '[image]' : ''),
        created_at: new Date().toISOString(),
      });

      setBusy(true);
      setStatus('Thinking…');
      setStreaming('');

      // Warn *before* the 429 rather than surfacing it afterwards. A call that
      // cannot leave the browser (no key yet) is not a request and is not counted.
      const before = configured ? recordAiCall(prefs.aiProvider) : 0;
      const ceiling = PROVIDERS[prefs.aiProvider].dailyLimit;
      if (ceiling && before === Math.floor(ceiling * 0.9)) {
        toast(`You are at 90% of ${provider.label}'s known free daily limit.`, 'info');
      }

      let accumulated = '';
      const onStep = (step: AgentStep) => {
        if (step.type === 'tool-start') setStatus(`Running ${step.name.replace(/_/g, ' ')}…`);
        else if (step.type === 'thinking' && step.round > 0) setStatus('Working through the next step…');
        else if (step.type === 'token') {
          accumulated += step.delta;
          setStreaming(accumulated);
          setStatus('');
        }
      };

      try {
        const result = await runAgent(cfg, history, bridge, onStep, {
          stream: true,
          // A mock interview is a conversation, not an errand — tools would
          // break character and the roleplay prompt already forbids them.
          noTools: !!opts.mock,
        });
        appendMessage(threadId, {
          id: uid(),
          role: 'assistant',
          content: result.text,
          toolCalls: result.traces,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        appendMessage(threadId, {
          id: uid(),
          role: 'assistant',
          content: `**I hit a problem.**\n\n${e instanceof Error ? e.message : String(e)}`,
          created_at: new Date().toISOString(),
        });
      } finally {
        setBusy(false);
        setStatus('');
        setStreaming('');
      }
    },
    [busy, configured, ensureThread, toChatHistory, cfg, bridge, prefs.aiProvider, provider.label],
  );

  /** One-shot generation with no tools and no thread — used by inline "draft this" buttons. */
  const askInline = useCallback(
    async (prompt: string): Promise<string> => {
      // Inline drafts, briefings and palette answers spend the same free quota as
      // a chat message, so they show up in the meter too.
      if (configured) recordAiCall(prefs.aiProvider);
      const res = await chat(cfg, [
        { role: 'system', content: buildSystem() },
        { role: 'user', content: prompt },
      ]);
      return res.text;
    },
    [cfg, buildSystem, configured, prefs.aiProvider],
  );

  /** Runs the same prompt on a different configured provider, side by side. */
  const askWithProvider = useCallback(
    async (target: AiProviderId, prompt: string): Promise<string> => {
      const info = PROVIDERS[target];
      const key = prefs.aiKeys[target] || '';
      if (info.needsKey && !key) throw new Error(`No ${info.label} key configured.`);
      recordAiCall(target);
      const res = await chat(
        { provider: target, model: prefs.aiModel[target] || info.defaultModel, apiKey: key, baseUrl: prefs.ollamaUrl },
        [
          { role: 'system', content: buildSystem() },
          { role: 'user', content: prompt },
        ],
      );
      return res.text;
    },
    [prefs.aiKeys, prefs.aiModel, prefs.ollamaUrl, buildSystem],
  );

  /**
   * One headless call that turns pasted job text into form fields.
   *
   * Scout can already do this conversationally; this is the same capability as a
   * one-click affordance, and it deliberately returns data rather than writing a
   * record, so the user still sees the form before anything is saved.
   */
  const quickAddFromText = useCallback(
    async (text: string): Promise<Record<string, string>> => {
      const trimmed = text.trim();
      if (!trimmed) return {};
      recordAiCall(prefs.aiProvider);
      const res = await chat(cfg, [
        {
          role: 'system',
          content:
            'Extract structured fields from a job posting. Reply with ONLY a JSON object, no prose and no code fence. ' +
            'Keys: company_name, role_applied_to, platform_applied_on, salary_info, company_description, interview_questions, tasks_to_complete. ' +
            'Use an empty string for anything the posting does not state. Never invent a company name.',
        },
        { role: 'user', content: trimmed.slice(0, 12_000) },
      ]);
      const raw = res.text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start < 0 || end <= start) throw new Error('The model did not return usable fields.');
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      const out: Record<string, string> = {};
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === 'string' && v.trim()) out[k] = v.trim();
      });
      return out;
    },
    [cfg, prefs.aiProvider],
  );

  const usage = useMemo<UsageMeter>(() => {
    const used = aiCallsToday(prefs.aiProvider);
    const limit = provider.dailyLimit ?? null;
    const ratio = limit ? Math.min(1, used / limit) : 0;
    return { provider: prefs.aiProvider, label: provider.label, used, limit, ratio, warn: ratio >= 0.8 };
    // store.aiUsage is in the dependency list so the meter re-reads after each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.aiProvider, provider.label, provider.dailyLimit, store.aiUsage]);

  const availableProviders = useMemo<AiProviderId[]>(
    () =>
      (Object.keys(PROVIDERS) as AiProviderId[]).filter(id => {
        const info = PROVIDERS[id];
        return !info.needsKey || !!prefs.aiKeys[id];
      }),
    [prefs.aiKeys],
  );

  const value = useMemo<AIContextType>(
    () => ({
      open,
      setOpen,
      threads,
      activeThread,
      activeThreadId,
      selectThread: setActiveThreadId,
      newThread: () => setActiveThreadId(createThread().id),
      removeThread: (id: string) => {
        deleteThread(id);
        setActiveThreadId(prev => (prev === id ? null : prev));
      },
      busy,
      status,
      configured,
      providerLabel: `${provider.label} · ${cfg.model}`,
      send,
      askInline,
      streaming,
      usage,
      availableProviders,
      askWithProvider,
      quickAddFromText,
      visionSupported: !!provider.vision,
    }),
    [
      open,
      threads,
      activeThread,
      activeThreadId,
      busy,
      status,
      configured,
      provider.label,
      provider.vision,
      cfg.model,
      send,
      askInline,
      streaming,
      usage,
      availableProviders,
      askWithProvider,
      quickAddFromText,
    ],
  );

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI() {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error('useAI must be used within AIProvider');
  return ctx;
}

export type { AiMessage };
