import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from './useStore';
import { hasPassphrase, lock as lockVault } from '../lib/vault';

/**
 * What counts as the user being there. Regaining window focus deliberately does
 * not: coming back to a tab that has been away for an hour is exactly when it
 * should be locked, not a reason to start the idle clock again.
 */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

/** How often idleness is checked. Coarse on purpose: the limit is measured in minutes. */
const CHECK_EVERY_MS = 10_000;

/**
 * Locks the app after N idle minutes without signing out.
 *
 * Only meaningful once a vault passphrase exists — there is nothing to re-prompt
 * for otherwise — so the hook stays inert until one is set. Locking also drops
 * the in-memory passphrase, so encrypted fields go back to showing as locked.
 *
 * Idleness is measured against the wall clock, not by a long timeout. A timeout
 * does not count time the machine spent asleep and is throttled in background
 * tabs, so a laptop closed overnight used to wake up unlocked.
 */
export function useAutoLock() {
  const prefs = usePreferences();
  const minutes = prefs.autoLockMinutes;
  const [locked, setLocked] = useState(false);
  const lastActive = useRef(Date.now());

  const armed = minutes > 0 && hasPassphrase();

  useEffect(() => {
    if (!armed || locked) return;

    const limit = minutes * 60_000;
    lastActive.current = Date.now();

    const touch = () => {
      lastActive.current = Date.now();
    };
    const check = () => {
      if (Date.now() - lastActive.current >= limit) {
        lockVault();
        setLocked(true);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    const id = window.setInterval(check, CHECK_EVERY_MS);
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, touch, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(id);
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, touch));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [armed, locked, minutes]);

  return { locked, lock: () => setLocked(true), unlock: useCallback(() => setLocked(false), []) };
}
