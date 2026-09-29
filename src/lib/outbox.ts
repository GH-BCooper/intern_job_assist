/**
 * The offline write queue.
 *
 * `NetworkBanner` warned that writes would fail offline; this makes them
 * survive instead. Every Supabase mutation goes through `enqueue`, which runs
 * it immediately when online and parks it in IndexedDB when not. On reconnect
 * the queue is flushed in order, so a train ride's worth of edits lands intact.
 */

export type OutboxKind = 'create' | 'update' | 'delete' | 'interview_add' | 'interview_remove' | 'learnings';

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  /** Human-readable, shown in the pending-writes UI. */
  label: string;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  lastError?: string;
  /** The user who queued it. The database is shared by every account on this browser. */
  owner?: string;
};

const DB_NAME = 'interntrack';
const DB_VERSION = 1;
const STORE = 'outbox';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    db =>
      new Promise<T | null>(resolve => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const transaction = db.transaction(STORE, mode);
          const request = fn(transaction.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

const listeners = new Set<(items: OutboxItem[]) => void>();

let cached: OutboxItem[] = [];

/**
 * Whose writes this session may see and replay.
 *
 * The queue lives in one IndexedDB per browser, not per account. Without this, a
 * write queued offline by one user was replayed under the next user's session —
 * rejected by row-level security at best, and either way surfaced as a failure to
 * someone who never made it.
 */
let owner: string | null = null;

export function setOutboxOwner(userId: string | null) {
  if (owner === userId) return;
  owner = userId;
  void notify();
}

const mine = (item: OutboxItem) => !item.owner || item.owner === owner;

export function onOutboxChange(fn: (items: OutboxItem[]) => void) {
  listeners.add(fn);
  fn(cached);
  return () => {
    listeners.delete(fn);
  };
}

async function notify() {
  cached = ((await list()) || []).filter(mine);
  listeners.forEach(l => l(cached));
}

export async function list(): Promise<OutboxItem[]> {
  const all = await tx<OutboxItem[]>('readonly', s => s.getAll() as IDBRequest<OutboxItem[]>);
  return (all || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function put(item: OutboxItem): Promise<void> {
  await tx('readwrite', s => s.put(item) as IDBRequest<IDBValidKey>);
  await notify();
}

export async function remove(id: string): Promise<void> {
  await tx('readwrite', s => s.delete(id) as IDBRequest<undefined>);
  await notify();
}

export async function clear(): Promise<void> {
  await tx('readwrite', s => s.clear() as IDBRequest<undefined>);
  await notify();
}

export async function count(): Promise<number> {
  return (await list()).length;
}

/** A queued operation, re-runnable from its payload after a reload. */
export type Runner = (item: OutboxItem) => Promise<unknown>;

const runners = new Map<OutboxKind, Runner>();

/** DataContext registers how to replay each kind of write. */
export function registerRunner(kind: OutboxKind, runner: Runner) {
  runners.set(kind, runner);
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** True when the failure looks like a lost connection rather than a rejected write. */
export function isNetworkError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed') ||
    message.includes('timeout') ||
    message.includes('offline')
  );
}

export type EnqueueResult<T> = { ok: true; value: T } | { ok: false; queued: boolean; error: unknown };

/**
 * Runs a write, queueing it instead of failing when the browser is offline.
 *
 * Genuine rejections (a bad payload, a permissions error) are *not* queued —
 * retrying those forever would hide a real problem.
 */
export async function enqueue<T>(
  kind: OutboxKind,
  label: string,
  payload: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<EnqueueResult<T>> {
  const item: OutboxItem = {
    id: `ob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    label,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    ...(owner ? { owner } : {}),
  };

  if (!isOnline()) {
    await put(item);
    return { ok: false, queued: true, error: new Error('offline') };
  }

  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (isNetworkError(error)) {
      await put({ ...item, attempts: 1, lastError: error instanceof Error ? error.message : String(error) });
      return { ok: false, queued: true, error };
    }
    return { ok: false, queued: false, error };
  }
}

let flushing = false;

/** Replays the queue oldest-first. Returns how many writes landed. */
export async function flush(): Promise<{ sent: number; failed: number }> {
  if (flushing || !isOnline()) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const items = (await list()).filter(mine);
    for (const item of items) {
      const runner = runners.get(item.kind);
      if (!runner) {
        // Nothing can replay it (e.g. an old schema) — drop it rather than blocking the queue.
        await remove(item.id);
        continue;
      }
      try {
        await runner(item);
        await remove(item.id);
        sent += 1;
      } catch (error) {
        failed += 1;
        if (isNetworkError(error)) break; // still offline — keep the rest in order
        await put({
          ...item,
          attempts: item.attempts + 1,
          lastError: error instanceof Error ? error.message : String(error),
        });
        if (item.attempts + 1 >= 5) await remove(item.id);
      }
    }
  } finally {
    flushing = false;
  }
  await notify();
  return { sent, failed };
}

void notify();
