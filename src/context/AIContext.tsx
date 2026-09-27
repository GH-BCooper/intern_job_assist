import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { useStore } from '../hooks/useStore';
import { runAgent, systemPrompt, type AgentStep } from '../lib/ai/agent';
import { PROVIDERS, chat, type ChatMessage, type ProviderConfig } from '../lib/ai/providers';
import type { ToolBridge } from '../lib/ai/tools';
import { appendMessage, createThread, deleteThread, read, uid, type AiMessage, type AiThread } from '../lib/store';

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
  send: (text: string) => Promise<void>;
  askInline: (prompt: string) => Promise<string>;
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

  const buildSystem = useCallback(() => {
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
    (thread: AiThread | null): ChatMessage[] => {
      const history: ChatMessage[] = [{ role: 'system', content: buildSystem() }];
      (thread?.messages || []).slice(-16).forEach(m => {
        if (m.role === 'user') history.push({ role: 'user', content: m.content });
        else if (m.role === 'assistant' && m.content) history.push({ role: 'assistant', content: m.content });
      });
      return history;
    },
    [buildSystem],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const threadId = ensureThread();

      appendMessage(threadId, { id: uid(), role: 'user', content: trimmed, created_at: new Date().toISOString() });

      const thread = read().aiThreads.find(t => t.id === threadId) || null;
      const history = toChatHistory(thread);
      history.push({ role: 'user', content: trimmed });

      setBusy(true);
      setStatus('Thinking…');

      const onStep = (step: AgentStep) => {
        if (step.type === 'tool-start') setStatus(`Running ${step.name.replace(/_/g, ' ')}…`);
        else if (step.type === 'thinking' && step.round > 0) setStatus('Working through the next step…');
      };

      try {
        const result = await runAgent(cfg, history, bridge, onStep);
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
      }
    },
    [busy, ensureThread, toChatHistory, cfg, bridge],
  );

  /** One-shot generation with no tools and no thread — used by inline "draft this" buttons. */
  const askInline = useCallback(
    async (prompt: string): Promise<string> => {
      const res = await chat(cfg, [
        { role: 'system', content: buildSystem() },
        { role: 'user', content: prompt },
      ]);
      return res.text;
    },
    [cfg, buildSystem],
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
    }),
    [open, threads, activeThread, activeThreadId, busy, status, configured, provider.label, cfg.model, send, askInline],
  );

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI() {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error('useAI must be used within AIProvider');
  return ctx;
}

export type { AiMessage };
