/**
 * Browser-side backend for the e2e build.
 *
 * `vite.e2e.config.ts` swaps the real Supabase client for this one, so a real
 * Chrome run can sign in and use every signed-in screen with no account, no
 * network and no credentials. It wraps the same in-memory fake the Vitest
 * integration tests use, and mirrors its tables into localStorage so a page
 * reload behaves like a server round-trip.
 *
 * URL switches (first load only, before anything is stored):
 *   ?empty=1   a brand-new account with no applications
 *   ?seed=300  a large generated pipeline, for performance runs
 *
 * Tests can reach the client through `window.__fake` to seed or inspect data.
 */

import {
  createFakeSupabase,
  seedApplications,
  seedInterviews,
  type FakeTables,
} from '../src/test/fakeSupabase';
import type { Application, InterviewDate } from '../src/lib/supabase';

const KEY = 'e2e.tables';
const SIGNED_OUT_KEY = 'e2e.signedOut';

const COMPANIES = [
  'Stripe', 'Figma', 'Vercel', 'Notion', 'Linear', 'Datadog', 'Cloudflare', 'Shopify', 'Airbnb', 'Ramp',
  'Plaid', 'Retool', 'Rippling', 'Brex', 'Scale AI', 'Anthropic', 'Databricks', 'Snowflake', 'Roblox', 'Discord',
];
const ROLES = ['Backend Intern', 'Frontend Intern', 'Full-stack Intern', 'Data Intern', 'ML Intern', 'SRE Intern'];
const PLATFORMS = ['LinkedIn', 'Referral', 'Company site', 'Handshake', 'Wellfound'];
const RESPONSES = ['Pending', 'Pending', 'Viewed', 'Shortlisted', 'Rejected', 'Offered'];

/** A deterministic pipeline of `count` applications with a realistic spread of stages. */
function generate(count: number): { applications: Application[]; interview_dates: InterviewDate[] } {
  const day = 86_400_000;
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  const applications: Application[] = [];
  const interview_dates: InterviewDate[] = [];

  for (let i = 0; i < count; i += 1) {
    const age = Math.floor(rand() * 150);
    const response = pick(RESPONSES);
    const applied = rand() > 0.08;
    const id = `gen-${i}`;
    const created = new Date(Date.now() - age * day).toISOString();
    applications.push({
      id,
      user_id: 'user-1',
      company_name: `${pick(COMPANIES)}${i > 19 ? ` ${Math.floor(i / 20) + 1}` : ''}`,
      company_description: rand() > 0.5 ? 'Payments infrastructure for the internet. '.repeat(3) : '',
      resume_used: 'Backend v3',
      cover_letter_used: '',
      response_status: response,
      interview_offered: response === 'Shortlisted' || response === 'Offered',
      final_status: response === 'Rejected' ? 'Rejected' : 'In Progress',
      date_applied: applied ? new Date(Date.now() - age * day).toISOString().slice(0, 10) : null,
      salary_info: rand() > 0.6 ? `$${6 + Math.floor(rand() * 5)},000 / month` : '',
      interview_questions: rand() > 0.7 ? 'Tell me about a project.\nDesign a rate limiter.' : '',
      tasks_to_complete: '',
      resume_path: '',
      cover_letter_path: '',
      role_applied_to: pick(ROLES),
      platform_applied_on: pick(PLATFORMS),
      created_at: created,
      updated_at: created,
    });
    if (response === 'Shortlisted' || response === 'Offered') {
      interview_dates.push({
        id: `gen-iv-${i}`,
        application_id: id,
        user_id: 'user-1',
        interview_date: new Date(Date.now() + (Math.floor(rand() * 40) - 12) * day).toISOString(),
        label: `Round ${1 + Math.floor(rand() * 3)}`,
        created_at: created,
      });
    }
  }
  return { applications, interview_dates };
}

function loadTables(): Partial<FakeTables> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Partial<FakeTables>;
  } catch {
    /* fall through to the seed */
  }
  const params = new URLSearchParams(location.search);
  if (params.get('empty') === '1') return {};
  const seed = Number(params.get('seed'));
  if (seed > 0) return generate(Math.min(seed, 5000));
  return { applications: seedApplications(), interview_dates: seedInterviews() };
}

export function createE2EClient() {
  const signedOut = sessionStorage.getItem(SIGNED_OUT_KEY) === '1';
  const client = createFakeSupabase({
    user: signedOut ? null : undefined,
    tables: loadTables(),
  });

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(client.__tables));
    } catch {
      /* storage full or blocked */
    }
  };
  persist();
  // Only re-serialise when the fake has actually been called since last time, so a
  // large pipeline does not spend the run stringifying itself.
  let seen = client.__calls.length;
  setInterval(() => {
    if (client.__calls.length === seen) return;
    seen = client.__calls.length;
    persist();
  }, 300);
  window.addEventListener('pagehide', persist);

  const origSignOut = client.auth.signOut;
  client.auth.signOut = () => {
    sessionStorage.setItem(SIGNED_OUT_KEY, '1');
    return origSignOut();
  };
  const origSignIn = client.auth.signInWithPassword;
  client.auth.signInWithPassword = () => {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    return origSignIn();
  };

  (window as unknown as { __fake: unknown }).__fake = client;
  return client;
}
