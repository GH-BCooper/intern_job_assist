/**
 * An in-memory stand-in for the Supabase client.
 *
 * The hosted project has email confirmation switched on, so a throwaway account
 * cannot be created with the anon key and the signed-in screens were the one
 * part of the app a browser run could not reach. This fake implements the exact
 * surface the app uses — the query-builder chains, auth, storage and rpc — so
 * the real components, contexts and routes can be mounted and driven in tests
 * with no network at all.
 *
 * It is deliberately small: it supports what the app calls, and throws loudly on
 * anything it does not, so a new call site cannot silently pass against a stub
 * that quietly returns nothing.
 */

import type { Application, InterviewDate, InterviewLearning } from '../lib/supabase';

export type FakeRow = Record<string, unknown>;

export type FakeTables = {
  applications: Application[];
  interview_dates: InterviewDate[];
  interview_learnings: InterviewLearning[];
  shared_dashboards: FakeRow[];
};

export type FakeUser = { id: string; email: string; user_metadata: Record<string, unknown> };

type Filter = { column: string; op: 'eq' | 'in'; value: unknown };

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createFakeSupabase(options: { user?: FakeUser | null; tables?: Partial<FakeTables> } = {}) {
  const user: FakeUser | null =
    options.user === undefined
      ? { id: 'user-1', email: 'brett@example.com', user_metadata: { name: 'Brett Cooper' } }
      : options.user;

  const tables: FakeTables = {
    applications: [],
    interview_dates: [],
    interview_learnings: [],
    shared_dashboards: [],
    ...clone(options.tables || {}),
  } as FakeTables;

  /** Every call the app made, so tests can assert on writes as well as reads. */
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  const authListeners: ((event: string, session: unknown) => void)[] = [];

  const makeSession = () => (user ? { user, access_token: 'fake-token', expires_at: Date.now() / 1000 + 3600 } : null);
  /** Signing out really ends the session, so a browser run can see the signed-out screens too. */
  let session = makeSession();
  const emitAuth = (event: string) => authListeners.slice().forEach(fn => fn(event, session));

  function matches(row: FakeRow, filters: Filter[]): boolean {
    return filters.every(f => {
      const value = row[f.column];
      if (f.op === 'in') return Array.isArray(f.value) && (f.value as unknown[]).includes(value);
      return value === f.value;
    });
  }

  function from(table: keyof FakeTables) {
    const rows = () => tables[table] as unknown as FakeRow[];
    const filters: Filter[] = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let pending: FakeRow[] = [];
    let patch: FakeRow = {};

    const builder = {
      // The column list is accepted and ignored: the fake always returns whole
      // rows, which is what every call site in the app asks for anyway.
      select() {
        if (mode === 'select') calls.push({ table, op: 'select' });
        return builder;
      },
      insert(payload: FakeRow | FakeRow[]) {
        mode = 'insert';
        pending = (Array.isArray(payload) ? payload : [payload]).map(row => ({
          id: row.id || nextId(String(table).slice(0, 3)),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...row,
        }));
        calls.push({ table, op: 'insert', payload: pending });
        return builder;
      },
      update(payload: FakeRow) {
        mode = 'update';
        patch = payload;
        calls.push({ table, op: 'update', payload });
        return builder;
      },
      delete() {
        mode = 'delete';
        calls.push({ table, op: 'delete' });
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, op: 'eq', value });
        return builder;
      },
      in(column: string, value: unknown[]) {
        filters.push({ column, op: 'in', value });
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },

      /* ------------------------------ resolution ------------------------------ */

      run(): { data: FakeRow[]; error: null } {
        if (mode === 'insert') {
          rows().push(...pending);
          return { data: clone(pending), error: null };
        }
        if (mode === 'update') {
          const hit = rows().filter(r => matches(r, filters));
          hit.forEach(r => Object.assign(r, patch));
          return { data: clone(hit), error: null };
        }
        if (mode === 'delete') {
          const keep = rows().filter(r => !matches(r, filters));
          const removed = rows().filter(r => matches(r, filters));
          tables[table] = keep as never;
          return { data: clone(removed), error: null };
        }
        return { data: clone(rows().filter(r => matches(r, filters))), error: null };
      },

      single() {
        const { data } = builder.run();
        if (!data.length) return Promise.resolve({ data: null, error: { message: 'No rows found' } });
        return Promise.resolve({ data: data[0], error: null });
      },
      maybeSingle() {
        const { data } = builder.run();
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      /** Awaiting the builder itself resolves the query, as the real client does. */
      then<T>(resolve: (value: { data: FakeRow[]; error: null }) => T) {
        return Promise.resolve(builder.run()).then(resolve);
      },
    };

    return builder;
  }

  const storageFiles = new Map<string, { name: string; size: number }>();

  const client = {
    from,

    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ table: 'rpc', op: name, payload: args });
      if (name === 'public_shared_dashboard') {
        const token = String(args?.share_token || '');
        const row = tables.shared_dashboards.find(r => r.token === token && !r.revoked);
        return Promise.resolve({ data: row ? [clone(row)] : [], error: null });
      }
      return Promise.resolve({ data: null, error: { message: `Unknown rpc: ${name}` } });
    },

    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      getUser: () => Promise.resolve({ data: { user: session ? user : null }, error: null }),
      onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
        authListeners.push(fn);
        // The real client fires once with the current session.
        setTimeout(() => fn('INITIAL_SESSION', session), 0);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signInWithPassword: () => {
        session = makeSession();
        setTimeout(() => emitAuth('SIGNED_IN'), 0);
        return Promise.resolve({ data: { session, user }, error: null });
      },
      signUp: () => Promise.resolve({ data: { session: null, user }, error: null }),
      signOut: () => {
        session = null;
        setTimeout(() => emitAuth('SIGNED_OUT'), 0);
        return Promise.resolve({ error: null });
      },
      signInWithOAuth: () => Promise.resolve({ data: {}, error: null }),
      verifyOtp: () => Promise.resolve({ data: { session, user }, error: null }),
      resend: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ error: null }),
      updateUser: () => Promise.resolve({ data: { user }, error: null }),
      reauthenticate: () => Promise.resolve({ error: null }),
      mfa: {
        listFactors: () => Promise.resolve({ data: { totp: [] }, error: null }),
        enroll: () =>
          Promise.resolve({
            data: { id: 'factor-1', totp: { qr_code: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', secret: 'SECRET' } },
            error: null,
          }),
        challenge: () => Promise.resolve({ data: { id: 'challenge-1' }, error: null }),
        verify: () => Promise.resolve({ data: {}, error: null }),
        unenroll: () => Promise.resolve({ data: {}, error: null }),
      },
    },

    storage: {
      from: () => ({
        upload: (path: string, file: { name?: string; size?: number }) => {
          storageFiles.set(path, { name: file?.name || 'file', size: file?.size || 0 });
          calls.push({ table: 'storage', op: 'upload', payload: path });
          return Promise.resolve({ data: { path }, error: null });
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://fake.storage/${path}` } }),
        createSignedUrl: (path: string) =>
          Promise.resolve({ data: { signedUrl: `https://fake.storage/${path}?signed=1` }, error: null }),
        download: () => Promise.resolve({ data: new Blob(['fake']), error: null }),
        remove: (paths: string[]) => {
          paths.forEach(p => storageFiles.delete(p));
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },

    /* ----------------------------- test helpers ----------------------------- */

    __tables: tables,
    __calls: calls,
    __storage: storageFiles,
    /** Writes the app performed, for assertions. */
    __writes: () => calls.filter(c => ['insert', 'update', 'delete'].includes(c.op)),
  };

  return client;
}

/* ------------------------------- fixtures ------------------------------- */

export function seedApplications(): Application[] {
  const day = 86_400_000;
  const iso = (offset: number) => new Date(Date.now() - offset * day).toISOString();
  const date = (offset: number) => new Date(Date.now() - offset * day).toISOString().slice(0, 10);

  const base = {
    user_id: 'user-1',
    company_description: '',
    resume_used: 'Backend v3',
    cover_letter_used: '',
    salary_info: '',
    interview_questions: '',
    tasks_to_complete: '',
    resume_path: '',
    cover_letter_path: '',
  };

  return [
    {
      ...base,
      id: 'app-stripe',
      company_name: 'Stripe',
      role_applied_to: 'Backend Engineering Intern',
      platform_applied_on: 'LinkedIn',
      response_status: 'Shortlisted',
      interview_offered: true,
      final_status: 'In Progress',
      date_applied: date(21),
      interview_questions: 'Tell me about a time a project slipped.\nHow would you design an idempotent payment API?',
      created_at: iso(21),
      updated_at: iso(2),
    },
    {
      ...base,
      id: 'app-figma',
      company_name: 'Figma',
      role_applied_to: 'Product Engineering Intern',
      platform_applied_on: 'Referral',
      response_status: 'Offered',
      interview_offered: true,
      final_status: 'In Progress',
      date_applied: date(30),
      salary_info: '$9,200 / month',
      created_at: iso(30),
      updated_at: iso(1),
    },
    {
      ...base,
      id: 'app-vercel',
      company_name: 'Vercel',
      role_applied_to: 'Frontend Intern',
      platform_applied_on: 'Company site',
      response_status: 'Pending',
      interview_offered: false,
      final_status: 'In Progress',
      date_applied: date(24),
      created_at: iso(24),
      updated_at: iso(24),
    },
    {
      ...base,
      id: 'app-notion',
      company_name: 'Notion',
      role_applied_to: 'Backend Intern',
      platform_applied_on: 'LinkedIn',
      response_status: 'Rejected',
      interview_offered: false,
      final_status: 'Rejected',
      date_applied: date(40),
      created_at: iso(40),
      updated_at: iso(12),
    },
    {
      ...base,
      id: 'app-linear',
      company_name: 'Linear',
      role_applied_to: 'Full-stack Intern',
      platform_applied_on: '',
      response_status: 'Pending',
      interview_offered: false,
      final_status: 'In Progress',
      date_applied: null,
      created_at: iso(3),
      updated_at: iso(3),
    },
  ] as Application[];
}

export function seedInterviews(): InterviewDate[] {
  const day = 86_400_000;
  return [
    {
      id: 'iv-stripe-1',
      application_id: 'app-stripe',
      user_id: 'user-1',
      interview_date: new Date(Date.now() + 2 * day).toISOString(),
      label: 'Round 2 — systems design',
      created_at: new Date().toISOString(),
    },
    {
      id: 'iv-figma-1',
      application_id: 'app-figma',
      user_id: 'user-1',
      interview_date: new Date(Date.now() - 6 * day).toISOString(),
      label: 'Final round',
      created_at: new Date().toISOString(),
    },
  ];
}
