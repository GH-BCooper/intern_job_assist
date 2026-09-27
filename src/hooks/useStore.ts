import { useSyncExternalStore } from 'react';
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

export function usePreferences() {
  return useStoreSlice(s => s.preferences);
}
