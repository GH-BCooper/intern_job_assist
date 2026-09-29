import { useRef, useSyncExternalStore } from 'react';
import { read, subscribe, type StoreShape } from '../lib/store';

/** Subscribe a component to the whole local store. */
export function useStore(): StoreShape {
  return useSyncExternalStore(subscribe, read, read);
}

/** Subscribe to a slice; the selector must return a stable reference per state. */
export function useStoreSlice<T>(selector: (s: StoreShape) => T): T {
  const state = useSyncExternalStore(subscribe, read, read);
  return selector(state);
}

/**
 * Subscribes to a derived value and re-renders only when that value changes.
 *
 * `useStore()` hands back the whole store, which is replaced on every write, so
 * anything using it re-renders on every write — a problem for a component that
 * appears hundreds of times. This keeps the last result and hands it back while
 * `isEqual` says nothing that matters moved.
 */
export function useStoreSelector<T>(
  selector: (s: StoreShape) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const last = useRef<{ value: T } | null>(null);
  const getSnapshot = () => {
    const next = selector(read());
    if (last.current && isEqual(last.current.value, next)) return last.current.value;
    last.current = { value: next };
    return next;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Structural equality for small plain values (a few fields, a short list). */
export function sameJson<T>(a: T, b: T): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function usePreferences() {
  return useStoreSlice(s => s.preferences);
}
