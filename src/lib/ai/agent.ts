import { AiError, chat, type ChatMessage, type ProviderConfig } from './providers';
import { executeTool, TOOL_SCHEMAS, type ToolBridge } from './tools';
import type { AiToolTrace } from '../store';

export const MAX_TOOL_ROUNDS = 8;

export function systemPrompt(ctx: {
  userName: string;
  today: string;
  route: string;
  counts: { applications: number; reminders: number; tasks: number };
  tags: string[];
  autoActions: boolean;
}): string {
  return [
    'You are Scout, the built-in assistant for InternTrack — an internship application tracker.',
    `Today is ${ctx.today}. The user is ${ctx.userName || 'the signed-in user'} and is currently on the "${ctx.route}" page.`,
    `Their workspace holds ${ctx.counts.applications} applications, ${ctx.counts.reminders} open reminders and ${ctx.counts.tasks} open tasks.`,
    ctx.tags.length ? `Existing tags: ${ctx.tags.join(', ')}.` : 'No tags exist yet.',
    '',
    'You have full read and write access to the app through tools. Use them rather than guessing:',
    '- Never invent data. If a question touches the user’s records, call a tool first (get_overview is a cheap starting point).',
    '- Chain tools freely in one turn: read, then act, then confirm.',
    '- When the user asks you to do something, do it with tools instead of describing how to do it manually.',
    '- You may also drive the interface: navigate, set_view, set_filters, open_application, set_theme.',
    '- You can build lasting automations: create_automation sets up a "when X happens, do Y" rule that runs forever with no further input (e.g. auto follow-ups, interview-prep tasks, stale-pipeline alerts). Use it whenever the user wants something to happen automatically or repeatedly, not just once.',
    ctx.autoActions
      ? '- You are authorised to create and update records, reminders, tasks, notes, tags and goals without asking first.'
      : '- Ask for confirmation before any write tool.',
    '- delete_application is destructive: ask in plain language first, and only pass confirm true after the user agrees in a later turn.',
    '',
    'Beyond tools you are a job-search coach. You draft follow-up emails, cover letters, thank-you notes, STAR answers,',
    'recruiter outreach and interview prep plans. Ground every draft in the real record you fetched — company, role, platform, dates, stored learnings.',
    '',
    'Style: concise and direct. Markdown with short paragraphs, bullets and bold labels. No preamble, no restating the question.',
    'When you finish an action, state plainly what changed in one line. Surface numbers when you have them.',
    'If a tool returns an error, say what failed and what you need — do not silently retry more than once.',
  ].join('\n');
}

export type AgentStep =
  | { type: 'tool-start'; name: string; args: unknown }
  | { type: 'tool-end'; name: string; result: string; error?: string }
  | { type: 'thinking'; round: number };

export type AgentResult = { text: string; traces: AiToolTrace[] };

/**
 * Runs a tool-calling loop until the model produces a final answer.
 * Works identically across Gemini and OpenAI-compatible providers.
 */
export async function runAgent(
  cfg: ProviderConfig,
  history: ChatMessage[],
  bridge: ToolBridge,
  onStep?: (step: AgentStep) => void,
): Promise<AgentResult> {
  const messages: ChatMessage[] = [...history];
  const traces: AiToolTrace[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    onStep?.({ type: 'thinking', round });

    let result;
    try {
      result = await chat(cfg, messages, TOOL_SCHEMAS);
    } catch (e) {
      if (e instanceof AiError && e.retryable && round === 0) {
        await new Promise(r => setTimeout(r, 1200));
        result = await chat(cfg, messages, TOOL_SCHEMAS);
      } else {
        throw e;
      }
    }

    if (!result.toolCalls.length) {
      return { text: result.text || 'Done.', traces };
    }

    messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });

    for (const call of result.toolCalls) {
      onStep?.({ type: 'tool-start', name: call.name, args: call.args });
      let output: string;
      let error: string | undefined;
      try {
        output = await executeTool(call.name, call.args, bridge);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        output = JSON.stringify({ error });
      }
      traces.push({ name: call.name, args: call.args, result: output.slice(0, 4000), error });
      onStep?.({ type: 'tool-end', name: call.name, result: output, error });
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: output.slice(0, 12_000) });
    }
  }

  // Ran out of rounds — ask for a final answer with tools withheld.
  const final = await chat(
    cfg,
    [...messages, { role: 'user', content: 'Summarise the outcome for the user now, without calling more tools.' }],
    [],
  );
  return { text: final.text || 'I ran several steps but could not finish cleanly. Ask me to narrow it down.', traces };
}

export const QUICK_PROMPTS: { label: string; prompt: string; icon: string }[] = [
  { label: 'How am I doing?', prompt: 'Review my whole pipeline and tell me the three things I should do this week.', icon: 'sparkles' },
  { label: 'Schedule follow-ups', prompt: 'Find every application that has gone quiet and schedule follow-up reminders for each.', icon: 'bell' },
  { label: 'Prep my next interview', prompt: 'What is my next interview? Build me a prep plan with likely questions and two questions to ask them.', icon: 'target' },
  { label: 'Draft a follow-up email', prompt: 'Draft a short, polite follow-up email for the application that has been waiting longest.', icon: 'mail' },
  { label: 'Where should I apply more?', prompt: 'Which platforms and roles convert best for me, and where am I wasting effort?', icon: 'chart' },
  { label: 'Tidy my tracker', prompt: 'Audit my tracker for missing data — stale statuses, interviews without dates, untagged applications — and fix what you safely can.', icon: 'wand' },
  { label: 'Automate my follow-ups', prompt: 'Set up an automation that reminds me to follow up whenever an application goes quiet, and another that adds a prep task before every interview.', icon: 'zap' },
];
