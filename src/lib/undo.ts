/**
 * A small undo stack for destructive actions.
 *
 * Deleting, archiving and moving a card between stages all used to be
 * irreversible outside of Scout's confirm gate. Every such action now pushes a
 * closure that puts the world back, and the toast that reports the action
 * offers it for a few seconds.
 */

import { emitUi } from './uiBus';

export type UndoEntry = {
  id: string;
  label: string;
  /** Puts the world back. May be async (Supabase round-trips). */
  restore: () => void | Promise<void>;
  created_at: number;
};

const MAX = 20;

const stack: UndoEntry[] = [];

let counter = 0;

/**
 * Registers an undoable action and shows a toast offering to undo it.
 *
 * The toast owns the timeout; the entry stays on the stack afterwards so
 * ⌘Z / Ctrl+Z can still reach the last few actions.
 */
export function pushUndo(label: string, restore: UndoEntry['restore'], opts: { silent?: boolean } = {}): UndoEntry {
  counter += 1;
  const entry: UndoEntry = { id: `undo-${counter}`, label, restore, created_at: Date.now() };
  stack.push(entry);
  if (stack.length > MAX) stack.shift();
  if (!opts.silent) emitUi({ type: 'toast', level: 'success', message: label, undoId: entry.id });
  return entry;
}

export function peekUndo(): UndoEntry | null {
  return stack[stack.length - 1] || null;
}

/** Runs a specific undo entry (or the most recent one) and drops it from the stack. */
export async function runUndo(id?: string): Promise<boolean> {
  const index = id ? stack.findIndex(e => e.id === id) : stack.length - 1;
  if (index < 0) return false;
  const [entry] = stack.splice(index, 1);
  try {
    await entry.restore();
    emitUi({ type: 'toast', level: 'info', message: `Undone — ${entry.label.replace(/\.$/, '')}` });
    emitUi({ type: 'refresh' });
    return true;
  } catch (e) {
    emitUi({
      type: 'toast',
      level: 'error',
      message: `Could not undo: ${e instanceof Error ? e.message : String(e)}`,
    });
    return false;
  }
}

export function clearUndo() {
  stack.length = 0;
}
