/**
 * Analytics off the main thread.
 *
 * `computeAnalytics` walks every application several times and builds a 182-day
 * heatmap; for someone with years of history that is enough work to show as a
 * stutter when Insights mounts. The worker runs the identical function — imported,
 * not duplicated, so the two can never disagree — and posts the result back.
 */

import { computeAnalytics, type Analytics } from './insights';
import type { Application, InterviewDate } from './supabase';
import type { StoreShape } from './store';

export type AnalyticsRequest = {
  id: number;
  applications: Application[];
  interviewsMap: Record<string, InterviewDate[]>;
  store: StoreShape;
  followUpDays: number;
};

export type AnalyticsResponse = { id: number; analytics: Analytics } | { id: number; error: string };

self.onmessage = (event: MessageEvent<AnalyticsRequest>) => {
  const { id, applications, interviewsMap, store, followUpDays } = event.data;
  try {
    const analytics = computeAnalytics(applications, interviewsMap, store, followUpDays);
    (self as unknown as Worker).postMessage({ id, analytics } satisfies AnalyticsResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({
      id,
      error: e instanceof Error ? e.message : String(e),
    } satisfies AnalyticsResponse);
  }
};
