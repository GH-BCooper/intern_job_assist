import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from './useStore';
import { hasPassphrase, lock as lockVault } from '../lib/vault';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'];

/**
 * Locks the app after N idle minutes without signing out.
 *
 * Only meaningful once a vault passphrase exists — there is nothing to re-prompt
 * for otherwise — so the hook stays inert until one is set. Locking also drops
 * the in-memory passphrase, so encrypted fields go back to showing as locked.
 */
export function useAutoLock() {
  const prefs = usePreferences();
  const minutes = prefs.autoLockMinutes;
  const [locked, setLocked] = useState(false);
  const timer = useRef<number | null>(null);

  const armed = minutes > 0 && hasPassphrase();

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!armed || locked) {
      clear();
      return;
    }

    const arm = () => {
      clear();
      timer.current = window.setTimeout(() => {
        lockVault();
        setLocked(true);
      }, minutes * 60_000);
    };

    arm();
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, arm, { passive: true }));

    // A tab hidden for longer than the window should come back locked.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') arm();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clear();
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, arm));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [armed, locked, minutes, clear]);

  return { locked, lock: () => setLocked(true), unlock: useCallback(() => setLocked(false), []) };
}
