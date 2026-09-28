import { AiError, chat, streamChat, type ChatMessage, type ProviderConfig } from './providers';
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
  /** Standing preferences the user asked Scout to remember. */
  memory?: string[];
  /** Roleplay variant: interviewer instead of coach. */
  mode?: 'assistant' | 'mock-interview';
  /** The application a mock interview is about. */
  mockTarget?: { company: string; role: string; questions?: string };
}): string {
  if (ctx.mode === 'mock-interview') {
    return [
      'You are running a mock interview inside InternTrack.',
      `You are the interviewer for ${ctx.mockTarget?.company || 'the company'}${ctx.mockTarget?.role ? `, hiring for ${ctx.mockTarget.role}` : ''}.`,
      `Today is ${ctx.today}. The candidate is ${ctx.userName || 'the candidate'}.`,
      ctx.mockTarget?.questions ? `Questions the candidate has already recorded for this role:\n${ctx.mockTarget.questions}` : '',
      '',
      'Rules of the roleplay:',
      '- Ask exactly ONE question per turn, then stop and wait. Never ask two.',
      '- Stay in character as the interviewer. No preamble, no meta-commentary, no "great question".',
      '- After the candidate answers, give at most three lines of specific critique — what landed, what was vague, what a strong answer would have added — then ask the next question.',
      '- Escalate: start with background, move to behavioural, then role-specific depth.',
      '- If an answer is empty or evasive, say so plainly and re-ask more narrowly.',
      '- When the candidate says they are done, give a short verdict: two strengths, two things to fix, and whether you would advance them.',
      '- Do not call tools during the roleplay.',
      ctx.memory?.length ? `\nStanding notes about this candidate:\n${ctx.memory.map(m => `- ${m}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

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
    ctx.memory?.length
      ? [
          '',
          'Standing preferences the user has asked you to remember. Honour them without being reminded:',
          ...ctx.memory.map(m => `- ${m}`),
          'Use remember_preference when they state a new lasting preference.',
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export type AgentStep =
  | { type: 'tool-start'; name: string; args: unknown }
  | { type: 'tool-end'; name: string; result: string; error?: string }
  | { type: 'thinking'; round: number }
  /** A streamed slice of the final answer. */
  | { type: 'token'; delta: string };

export type AgentResult = { text: string; traces: AiToolTrace[] };

type ChatResultLike = { text: string };

/**
 * Runs a tool-calling loop until the model produces a final answer.
 * Works identically across Gemini and OpenAI-compatible providers.
 */
export async function runAgent(
  cfg: ProviderConfig,
  history: ChatMessage[],
  bridge: ToolBridge,
  onStep?: (step: AgentStep) => void,
  opts: { stream?: boolean; noTools?: boolean } = {},
): Promise<AgentResult> {
  const messages: ChatMessage[] = [...history];
  const traces: AiToolTrace[] = [];

  /**
   * Streams a reply when nothing more needs a tool.
   *
   * Streaming and tool calls do not mix usefully — partial tool arguments are
   * not actionable — so the loop streams only once it is confident this turn is
   * an answer, falling back to the buffered call if the stream fails.
   */
  const finalAnswer = async (msgs: ChatMessage[]): Promise<ChatResultLike> => {
    if (!opts.stream) return chat(cfg, msgs, []);
    try {
      return await streamChat(cfg, msgs, delta => onStep?.({ type: 'token', delta }));
    } catch {
      return chat(cfg, msgs, []);
    }
  };

  if (opts.noTools) {
    const direct = await finalAnswer(messages);
    return { text: direct.text || 'Done.', traces };
  }

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
      // The model answered without tools. If the caller wants streaming and
      // this was the first round, re-run it as a stream so the user sees tokens
      // rather than a finished block; later rounds already have visible
      // progress from the tool trace, so the buffered text is enough.
      if (opts.stream && round === 0 && !traces.length) {
        const streamed = await finalAnswer(messages);
        return { text: streamed.text || result.text || 'Done.', traces };
      }
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
  const final = await finalAnswer([
    ...messages,
    { role: 'user', content: 'Summarise the outcome for the user now, without calling more tools.' },
  ]);
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
  { label: 'Score my resume', prompt: 'Score my stored resume against the job description I am about to paste, and tell me which keywords I am missing.', icon: 'target' },
  { label: 'Find duplicates', prompt: 'Check my tracker for duplicate applications and tell me which ones to merge.', icon: 'wand' },
  { label: 'Where should I apply next?', prompt: 'Based on what has actually converted for me, suggest where to apply next and why.', icon: 'sparkles' },
  { label: 'My week in review', prompt: 'Give me my weekly wrapped: what I sent, what came back, and what to fix next week.', icon: 'chart' },
];
