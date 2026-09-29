import { useEffect, useMemo, useRef, useState } from 'react';
import { computeAnalytics, type Analytics } from '../lib/insights';
import type { Application, InterviewDate } from '../lib/supabase';
import type { StoreShape } from '../lib/store';
import type { AnalyticsRequest, AnalyticsResponse } from '../lib/analytics.worker';

/**
 * Above this many applications the computation moves to a worker.
 *
 * Below it, the synchronous path is faster than the structured clone the worker
 * needs — and it avoids a frame where the UI has no numbers to show.
 */
const WORKER_THRESHOLD = 150;

/**
 * Analytics, computed on a worker for large histories and inline for small ones.
 *
 * The first render of a large workspace still gets a synchronous result, so
 * nothing flashes empty; the worker then replaces it on every change. If workers
 * are unavailable (older Safari, a restrictive CSP) it silently stays inline.
 */
export function useAnalytics(
  applications: Application[],
  interviewsMap: Record<string, InterviewDate[]>,
  store: StoreShape,
  followUpDays: number,
): { analytics: Analytics; offloaded: boolean } {
  const heavy = applications.length > WORKER_THRESHOLD;

  const inline = useMemo(
    () => computeAnalytics(applications, interviewsMap, store, followUpDays),
    // Recomputing inline for a heavy workspace is exactly what the worker is
    // meant to avoid, so the dependency list is deliberately the same either
    // way — React memoises it, and the worker result takes over once it lands.
    [applications, interviewsMap, store, followUpDays],
  );

  const [fromWorker, setFromWorker] = useState<Analytics | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!heavy || !supported) return;
    if (typeof Worker === 'undefined') {
      setSupported(false);
      return;
    }

    if (!workerRef.current) {
      try {
        workerRef.current = new Worker(new URL('../lib/analytics.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        setSupported(false);
        return;
      }
    }

    const worker = workerRef.current;
    const id = requestId.current + 1;
    requestId.current = id;

    const onMessage = (event: MessageEvent<AnalyticsResponse>) => {
      // Ignore anything but the newest request — results can arrive out of order.
      if (event.data.id !== requestId.current) return;
      if ('analytics' in event.data) setFromWorker(event.data.analytics);
    };
    const onError = () => setSupported(false);

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    const payload: AnalyticsRequest = { id, applications, interviewsMap, store, followUpDays };
    try {
      worker.postMessage(payload);
    } catch {
      setSupported(false);
    }

    return () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
  }, [heavy, supported, applications, interviewsMap, store, followUpDays]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const offloaded = heavy && supported && !!fromWorker;
  return { analytics: offloaded && fromWorker ? fromWorker : inline, offloaded };
}
