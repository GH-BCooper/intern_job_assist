/**
 * Read-only share links.
 *
 * A mentor or career centre gets a URL that renders aggregate insights — never
 * the raw application records. The snapshot is stored in a Supabase table whose
 * only anonymous entry point is a security-definer function taking one token
 * (see the `shared_dashboards` migration), so a link cannot be widened into a
 * listing.
 *
 * Every call degrades gracefully: if the table has not been migrated yet, the UI
 * says so rather than throwing.
 */

import { supabase } from './supabase';
import type { Analytics } from './insights';
import type { Wrapped } from './insights';

export type SharePayload = {
  version: 1;
  generated_at: string;
  owner: string;
  totals: {
    total: number;
    active: number;
    applied: number;
    interviews: number;
    offers: number;
    responded: number;
  };
  rates: { response: number; interview: number; offer: number };
  momentum: number;
  streak: number;
  bestStreak: number;
  avgResponseDays: number | null;
  byStage: Record<string, number>;
  byWeek: { label: string; count: number }[];
  byPlatform: { platform: string; total: number; interviews: number; rate: number }[];
  topRoles: { role: string; count: number }[];
  wrapped: Pick<Wrapped, 'headline' | 'applications' | 'interviews' | 'offers' | 'from' | 'to'>;
};

export type ShareLink = {
  token: string;
  label: string;
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
  view_count: number;
};

const MISSING_TABLE = /does not exist|relation .* does not exist|schema cache|Could not find/i;

export class ShareUnavailableError extends Error {
  constructor() {
    super(
      'Sharing needs one Supabase migration that has not been applied to this project yet ' +
        '(supabase/migrations/20260929000001_add_shared_dashboards.sql). Everything else keeps working.',
    );
    this.name = 'ShareUnavailableError';
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

/** Builds the aggregate-only snapshot. Deliberately excludes company names. */
export function buildSharePayload(analytics: Analytics, wrapped: Wrapped, ownerName: string): SharePayload {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    owner: ownerName,
    totals: {
      total: analytics.total,
      active: analytics.active,
      applied: analytics.applied,
      interviews: analytics.interviews,
      offers: analytics.offers,
      responded: analytics.responded,
    },
    rates: { response: analytics.responseRate, interview: analytics.interviewRate, offer: analytics.offerRate },
    momentum: analytics.momentum,
    streak: analytics.streak,
    bestStreak: analytics.bestStreak,
    avgResponseDays: analytics.avgResponseDays,
    byStage: { ...analytics.byStage },
    byWeek: analytics.byWeek.map(w => ({ label: w.label, count: w.count })),
    byPlatform: analytics.byPlatform.map(p => ({
      platform: p.platform,
      total: p.total,
      interviews: p.interviews,
      rate: p.rate,
    })),
    topRoles: analytics.topRoles,
    wrapped: {
      headline: wrapped.headline,
      applications: wrapped.applications,
      interviews: wrapped.interviews,
      offers: wrapped.offers,
      from: wrapped.from,
      to: wrapped.to,
    },
  };
}

export async function createShareLink(
  userId: string,
  payload: SharePayload,
  opts: { label?: string; expiresInDays?: number } = {},
): Promise<ShareLink> {
  const token = randomToken();
  const expires_at = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 86_400_000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('shared_dashboards')
    .insert({ token, user_id: userId, scope: 'insights', payload, label: opts.label || '', expires_at })
    .select('token,label,created_at,expires_at,revoked,view_count')
    .single();

  if (error) {
    if (MISSING_TABLE.test(error.message)) throw new ShareUnavailableError();
    throw new Error(error.message);
  }
  return data as ShareLink;
}

export async function listShareLinks(): Promise<ShareLink[]> {
  const { data, error } = await supabase
    .from('shared_dashboards')
    .select('token,label,created_at,expires_at,revoked,view_count')
    .order('created_at', { ascending: false });
  if (error) {
    if (MISSING_TABLE.test(error.message)) throw new ShareUnavailableError();
    throw new Error(error.message);
  }
  return (data || []) as ShareLink[];
}

/** Revokes rather than deletes, so the link stops working but the record remains. */
export async function revokeShareLink(token: string): Promise<void> {
  const { error } = await supabase.from('shared_dashboards').update({ revoked: true }).eq('token', token);
  if (error) {
    if (MISSING_TABLE.test(error.message)) throw new ShareUnavailableError();
    throw new Error(error.message);
  }
}

export async function refreshShareLink(token: string, payload: SharePayload): Promise<void> {
  const { error } = await supabase
    .from('shared_dashboards')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('token', token);
  if (error) {
    if (MISSING_TABLE.test(error.message)) throw new ShareUnavailableError();
    throw new Error(error.message);
  }
}

export type SharedSnapshot = { payload: SharePayload; label: string; scope: string; created_at: string };

/** Anonymous read, through the one function the anon role can execute. */
export async function fetchSharedDashboard(token: string): Promise<SharedSnapshot | null> {
  const { data, error } = await supabase.rpc('public_shared_dashboard', { share_token: token });
  if (error) {
    if (MISSING_TABLE.test(error.message)) throw new ShareUnavailableError();
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return row as SharedSnapshot;
}

export function shareUrl(token: string): string {
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return `${origin}/shared/${token}`;
}
