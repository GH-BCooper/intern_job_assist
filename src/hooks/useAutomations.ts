import { useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useStore } from './useStore';
import { evaluateAutomations, type AutomationBridge } from '../lib/automation';
import type { ApplicationInsert } from '../lib/supabase';

const SYNC_TAG = 'interntrack-automations';

/**
 * Asks the service worker to wake us for automation passes.
 *
 * Background Sync fires on reconnect; Periodic Sync fires on the browser's own
 * schedule for installed PWAs. Both are Chromium-only and neither is
 * guaranteed, so they supplement the in-tab interval rather than replacing it —
 * and every failure path is a silent no-op.
 */
async function registerSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;

    const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (sync) await sync.register(SYNC_TAG).catch(() => undefined);

    const periodic = (
      registration as ServiceWorkerRegistration & {
        periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> };
      }
    ).periodicSync;
    if (periodic && 'permissions' in navigator) {
      const status = await navigator.permissions
        .query({ name: 'periodic-background-sync' as PermissionName })
        .catch(() => null);
      if (status?.state === 'granted') {
        await periodic.register(SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 }).catch(() => undefined);
      }
    }
  } catch {
    /* an unsupported or blocked API must not affect the in-tab engine */
  }
}

/** Runs the automation engine on an interval and whenever the underlying data changes. */
export function useAutomationEngine() {
  const { applications, interviewsMap, updateApplication, createApplication } = useData();
  const store = useStore();
  const enabled = store.preferences.automationsEnabled;
  const rulesCount = store.automationRules.length;

  const spawn = (data: Record<string, unknown>) => createApplication(data as ApplicationInsert);

  const bridgeRef = useRef<AutomationBridge>({ applications, interviewsMap, updateApplication, createApplication: spawn });
  bridgeRef.current = { applications, interviewsMap, updateApplication, createApplication: spawn };

  useEffect(() => {
    if (!enabled || !rulesCount) return;
    const run = () => void evaluateAutomations(bridgeRef.current);
    run();
    const id = window.setInterval(run, 60_000);

    void registerSync();

    // The worker posts this when a sync event wakes it.
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'run-automations') run();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);

    // A tab left open overnight should catch up the moment it is looked at again.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(id);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, rulesCount, applications, interviewsMap]);
}
