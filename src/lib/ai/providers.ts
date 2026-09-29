/**
 * Multi-provider LLM client. Every option here has a genuinely free tier, and
 * keys stay in the browser — no server, no billing, nothing to deploy.
 *
 *  - gemini     Google AI Studio free tier (recommended)
 *  - groq       Groq Cloud free tier (fastest)
 *  - openrouter free `:free` models
 *  - ollama     fully local, no key at all
 */

import type { AiProviderId } from '../store';

export type ToolSchema = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

/** A pasted or picked image, as a base64 data payload. */
export type ImageAttachment = { mimeType: string; data: string };

export type ChatMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; images?: ImageAttachment[] }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type ChatResult = { text: string; toolCalls: ToolCall[] };

export type ProviderInfo = {
  id: AiProviderId;
  label: string;
  models: { id: string; label: string; note?: string }[];
  defaultModel: string;
  keyUrl: string;
  keyLabel: string;
  free: string;
  needsKey: boolean;
  /** Accepts image input (used by "read this job posting screenshot"). */
  vision?: boolean;
  /** Known free-tier ceiling in requests per day; used by the usage meter. */
  dailyLimit?: number;
};

export const PROVIDERS: Record<AiProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'Best balance — recommended' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', note: 'Highest free quota' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Newer, if 2.0 is unavailable' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', note: 'Newer and lighter' },
    ],
    defaultModel: 'gemini-2.0-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyLabel: 'Google AI Studio API key',
    free: 'Free tier: generous daily request limit, no card required.',
    needsKey: true,
    vision: true,
    dailyLimit: 1500,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', note: 'Strongest free tool use' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', note: 'Fastest' },
    ],
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    keyLabel: 'Groq API key',
    free: 'Free tier with high rate limits, no card required.',
    needsKey: true,
    dailyLimit: 14400,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)' },
      { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (free)' },
      { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (free)' },
    ],
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    keyUrl: 'https://openrouter.ai/keys',
    keyLabel: 'OpenRouter API key',
    free: 'Models suffixed `:free` cost nothing.',
    needsKey: true,
    dailyLimit: 200,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    models: [
      { id: 'llama3.1', label: 'llama3.1' },
      { id: 'qwen2.5', label: 'qwen2.5' },
      { id: 'mistral', label: 'mistral' },
    ],
    defaultModel: 'llama3.1',
    keyUrl: 'https://ollama.com/download',
    keyLabel: 'No key needed',
    free: 'Runs entirely on your machine. Zero cost, works offline.',
    needsKey: false,
  },
};

export type ProviderConfig = {
  provider: AiProviderId;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

/** How long to wait for a provider before giving up, so the panel never sits on "Thinking…" forever. */
const REQUEST_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 120_000;

/** `fetch` that fails with a readable error instead of hanging. */
async function fetchWithTimeout(url: string, init: RequestInit, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AiError('The model took too long to answer. Try again, or pick a faster model in Settings.', true);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export class AiError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = 'AiError';
  }
}

/* ------------------------------- Gemini ------------------------------- */

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

/** Exported for tests: the shape Gemini is sent, which has strict rules about tool-result turns. */
export function toGemini(messages: ChatMessage[]) {
  const systemParts: string[] = [];
  const contents: { role: 'user' | 'model'; parts: GeminiPart[] }[] = [];

  messages.forEach(m => {
    if (m.role === 'system') {
      systemParts.push(m.content);
      return;
    }
    if (m.role === 'tool') {
      const part: GeminiPart = { functionResponse: { name: m.name, response: { result: m.content } } };
      // Gemini wants every result for a round of tool calls in ONE turn, matching
      // the number of calls the model made. One turn per result is rejected with a
      // 400 as soon as the model calls two tools at once.
      const previous = contents[contents.length - 1];
      if (previous && previous.role === 'user' && previous.parts.every(p => 'functionResponse' in p)) {
        previous.parts.push(part);
      } else {
        contents.push({ role: 'user', parts: [part] });
      }
      return;
    }
    if (m.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      if ('toolCalls' in m && m.toolCalls) {
        m.toolCalls.forEach(tc => parts.push({ functionCall: { name: tc.name, args: tc.args } }));
      }
      if (parts.length) contents.push({ role: 'model', parts });
      return;
    }
    const parts: GeminiPart[] = [{ text: m.content }];
    if ('images' in m && m.images?.length) {
      m.images.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
    }
    contents.push({ role: 'user', parts });
  });

  return { systemInstruction: systemParts.join('\n\n'), contents };
}

async function callGemini(cfg: ProviderConfig, messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult> {
  const { systemInstruction, contents } = toGemini(messages);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  if (tools.length) {
    body.tools = [
      {
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: Object.keys(t.parameters.properties).length ? t.parameters : undefined,
        })),
      },
    ];
  }

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) throw new AiError(await describeHttpError(res), res.status === 429 || res.status >= 500);

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) {
    throw new AiError(`Request blocked by the model (${json.promptFeedback.blockReason}).`);
  }

  const parts = json.candidates?.[0]?.content?.parts || [];
  let text = '';
  const toolCalls: ToolCall[] = [];
  parts.forEach((p, i) => {
    if ('text' in p && p.text) text += p.text;
    if ('functionCall' in p && p.functionCall) {
      toolCalls.push({
        id: `call_${Date.now()}_${i}`,
        name: p.functionCall.name,
        args: p.functionCall.args || {},
      });
    }
  });
  return { text: text.trim(), toolCalls };
}

/* --------------------------- OpenAI-compatible --------------------------- */

function toOpenAi(messages: ChatMessage[]) {
  return messages.map(m => {
    if (m.role === 'tool') {
      return { role: 'tool' as const, tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === 'assistant' && 'toolCalls' in m && m.toolCalls?.length) {
      return {
        role: 'assistant' as const,
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      };
    }
    if (m.role === 'user' && 'images' in m && m.images?.length) {
      return {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: m.content },
          ...m.images.map(img => ({
            type: 'image_url' as const,
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

function openAiEndpoint(cfg: ProviderConfig): { url: string; headers: Record<string, string> } {
  if (cfg.provider === 'groq') {
    return {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    };
  }
  if (cfg.provider === 'openrouter') {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://interntrack.app',
        'X-Title': 'InternTrack',
      },
    };
  }
  const base = (cfg.baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  return { url: `${base}/v1/chat/completions`, headers: {} };
}

async function callOpenAiCompatible(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  tools: ToolSchema[],
): Promise<ChatResult> {
  const { url, headers } = openAiEndpoint(cfg);
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: toOpenAi(messages),
    temperature: 0.4,
    max_tokens: 2048,
  };
  if (tools.length) {
    body.tools = tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new AiError(await describeHttpError(res), res.status === 429 || res.status >= 500);

  const json = (await res.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
    }[];
    error?: { message?: string };
  };

  if (json.error?.message) throw new AiError(json.error.message);

  const message = json.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (message?.tool_calls || []).map(tc => {
    let args: Record<string, unknown> = {};
    try {
      args = tc.function.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function.name, args };
  });

  return { text: (message?.content || '').trim(), toolCalls };
}

async function describeHttpError(res: Response): Promise<string> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string };
      detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message || text;
    } catch {
      detail = text;
    }
  } catch {
    detail = res.statusText;
  }
  detail = detail.slice(0, 300);
  if (res.status === 401 || res.status === 403) return `Authentication failed — check your API key. ${detail}`;
  if (res.status === 404) {
    return `Model not found for this provider — it may have been retired. Pick another in Settings → Assistant. ${detail}`;
  }
  if (res.status === 429) return `Rate limit reached on the free tier. Wait a moment or switch model. ${detail}`;
  return `Provider error ${res.status}: ${detail}`;
}

/* ------------------------------ streaming ------------------------------ */

/**
 * Streams a tool-free reply token by token.
 *
 * Both Gemini and the OpenAI-compatible endpoints serve SSE on their free
 * tiers, so this is a pure perceived-latency win at no cost. Tool-calling
 * rounds still use the non-streaming path: partial tool arguments are not
 * useful, and the agent loop needs a complete call before it can execute one.
 */
export async function streamChat(
  cfg: ProviderConfig,
  messages: ChatMessage[],
  onToken: (delta: string) => void,
): Promise<ChatResult> {
  if (PROVIDERS[cfg.provider].needsKey && !cfg.apiKey) {
    throw new AiError(`Add your ${PROVIDERS[cfg.provider].keyLabel} in Settings to use the assistant.`);
  }

  const { url, headers, body } =
    cfg.provider === 'gemini'
      ? (() => {
          const { systemInstruction, contents } = toGemini(messages);
          const payload: Record<string, unknown> = {
            contents,
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
          };
          if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
          return {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`,
            headers: { 'x-goog-api-key': cfg.apiKey } as Record<string, string>,
            body: payload,
          };
        })()
      : (() => {
          const endpoint = openAiEndpoint(cfg);
          return {
            url: endpoint.url,
            headers: endpoint.headers,
            body: {
              model: cfg.model,
              messages: toOpenAi(messages),
              temperature: 0.4,
              max_tokens: 2048,
              stream: true,
            } as Record<string, unknown>,
          };
        })();

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    STREAM_TIMEOUT_MS,
  );

  if (!res.ok) throw new AiError(await describeHttpError(res), res.status === 429 || res.status >= 500);
  if (!res.body) throw new AiError('This provider returned no stream.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  const handlePayload = (payload: string) => {
    if (!payload || payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        choices?: { delta?: { content?: string | null } }[];
      };
      const delta =
        json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') ??
        json.choices?.[0]?.delta?.content ??
        '';
      if (delta) {
        text += delta;
        onToken(delta);
      }
    } catch {
      /* a partial or keep-alive frame — the next chunk completes it */
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    frames.forEach(frame => {
      frame
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .forEach(line => handlePayload(line.slice(5).trim()));
    });
  }
  if (buffer.startsWith('data:')) handlePayload(buffer.slice(5).trim());

  return { text: text.trim(), toolCalls: [] };
}

export async function chat(cfg: ProviderConfig, messages: ChatMessage[], tools: ToolSchema[] = []): Promise<ChatResult> {
  if (PROVIDERS[cfg.provider].needsKey && !cfg.apiKey) {
    throw new AiError(`Add your ${PROVIDERS[cfg.provider].keyLabel} in Settings to use the assistant.`);
  }
  if (cfg.provider === 'gemini') return callGemini(cfg, messages, tools);
  return callOpenAiCompatible(cfg, messages, tools);
}
