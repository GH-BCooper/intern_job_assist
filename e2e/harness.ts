/**
 * Browser-side backend for the e2e build.
 *
 * `vite.e2e.config.ts` swaps the real Supabase client for this one, so a real
 * Chrome run can sign in and use every signed-in screen with no account, no
 * network and no credentials. It wraps the same in-memory fake the Vitest
 * integration tests use, and mirrors its tables into localStorage so a page
 * reload behaves like a server round-trip.
 *
 * Tests can reach the client through `window.__fake` to seed or inspect data.
 */

import { createFakeSupabase, seedApplications, seedInterviews, type FakeTables } from '../src/test/fakeSupabase';

const KEY = 'e2e.tables';
const SIGNED_OUT_KEY = 'e2e.signedOut';

function loadTables(): Partial<FakeTables> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Partial<FakeTables>;
  } catch {
    /* fall through to the seed */
  }
  const params = new URLSearchParams(location.search);
  if (params.get('empty') === '1') return {};
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
  setInterval(persist, 120);
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
