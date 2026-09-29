import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoLock } from './useAutoLock';
import { savePreferences, setStoreScope } from '../lib/store';

let scope = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 1, 9, 0, 0));
  scope += 1;
  setStoreScope(`autolock-${scope}`);
  localStorage.setItem('interntrack.vault.verifier', 'v1.x.y.z');
  savePreferences({ autoLockMinutes: 5 });
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.removeItem('interntrack.vault.verifier');
});

describe('useAutoLock', () => {
  it('locks after the idle window', () => {
    const { result } = renderHook(() => useAutoLock());
    expect(result.current.locked).toBe(false);
    act(() => {
      vi.advanceTimersByTime(5 * 60_000 + 11_000);
    });
    expect(result.current.locked).toBe(true);
  });

  it('is kept awake by activity', () => {
    const { result } = renderHook(() => useAutoLock());
    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(4 * 60_000);
    });
    expect(result.current.locked).toBe(false);
  });

  it('comes back locked after the machine slept past the window', () => {
    // A timeout does not count time asleep. The wall clock jumps and the tab
    // becomes visible again without a single timer having fired.
    const { result } = renderHook(() => useAutoLock());
    act(() => {
      vi.setSystemTime(new Date(2026, 5, 1, 17, 0, 0));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.locked).toBe(true);
  });

  it('does not treat regaining window focus as activity', () => {
    const { result } = renderHook(() => useAutoLock());
    act(() => {
      vi.setSystemTime(new Date(2026, 5, 1, 17, 0, 0));
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.locked).toBe(true);
  });

  it('stays inert with no passphrase set', () => {
    localStorage.removeItem('interntrack.vault.verifier');
    const { result } = renderHook(() => useAutoLock());
    act(() => {
      vi.advanceTimersByTime(60 * 60_000);
    });
    expect(result.current.locked).toBe(false);
  });
});
