/**
 * One-shot Supabase setup: applies the pending migrations and deploys the
 * calendar-feed Edge Function.
 *
 * These are the only two steps in the whole project that need a credential the
 * repo does not hold. Everything downstream of that credential is automated
 * here, so the entire job is:
 *
 *   1. Open https://supabase.com/dashboard/account/tokens
 *   2. "Generate new token", copy it
 *   3. npm run setup:supabase -- sbp_your_token_here
 *
 * The token is used for this run only. It is never written to disk, never
 * committed, and never sent anywhere except api.supabase.com.
 *
 * SQL goes through the Management API's query endpoint rather than a direct
 * Postgres connection, so no database password is needed either.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const API = 'https://api.supabase.com';

/* --------------------------------- helpers -------------------------------- */

const colour = {
  ok: s => `\u001b[32m${s}\u001b[0m`,
  bad: s => `\u001b[31m${s}\u001b[0m`,
  dim: s => `\u001b[2m${s}\u001b[0m`,
  bold: s => `\u001b[1m${s}\u001b[0m`,
};

class SetupError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

/** Aborts the run. Throws rather than exiting, so pending sockets unwind first. */
function fail(message, hint) {
  throw new SetupError(message, hint);
}

function readEnv(key) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return '';
  const match = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

/** `https://abcdefgh.supabase.co` -> `abcdefgh` */
function projectRef(url) {
  const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i);
  return match ? match[1] : '';
}

async function api(token, route, init = {}) {
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : body?.message || body?.error || JSON.stringify(body);
    throw new Error(`${res.status} ${String(detail).slice(0, 300)}`);
  }
  return body;
}

/* ---------------------------------- steps --------------------------------- */

async function applyMigrations(token, ref) {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`\n${colour.bold('Migrations')}  ${colour.dim(`${files.length} file(s)`)}`);

  // A ledger so re-runs are safe and only genuinely new migrations are applied.
  await api(token, `/v1/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({
      query: `CREATE TABLE IF NOT EXISTS public._interntrack_migrations (
                name text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
              );`,
    }),
  });

  const appliedRows = await api(token, `/v1/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: 'SELECT name FROM public._interntrack_migrations;' }),
  });
  const applied = new Set((Array.isArray(appliedRows) ? appliedRows : []).map(r => r.name));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ${colour.dim('·')} ${file} ${colour.dim('already applied')}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await api(token, `/v1/projects/${ref}/database/query`, {
        method: 'POST',
        body: JSON.stringify({ query: sql }),
      });
      await api(token, `/v1/projects/${ref}/database/query`, {
        method: 'POST',
        body: JSON.stringify({
          query: `INSERT INTO public._interntrack_migrations (name) VALUES ('${file.replace(/'/g, "''")}')
                  ON CONFLICT (name) DO NOTHING;`,
        }),
      });
      console.log(`  ${colour.ok('✓')} ${file}`);
      ran += 1;
    } catch (e) {
      // The older migrations describe tables this project already has, so an
      // "already exists" is the expected outcome for them, not a failure.
      if (/already exists|duplicate/i.test(e.message)) {
        await api(token, `/v1/projects/${ref}/database/query`, {
          method: 'POST',
          body: JSON.stringify({
            query: `INSERT INTO public._interntrack_migrations (name) VALUES ('${file.replace(/'/g, "''")}')
                    ON CONFLICT (name) DO NOTHING;`,
          }),
        });
        console.log(`  ${colour.dim('·')} ${file} ${colour.dim('objects already present — recorded')}`);
        continue;
      }
      throw new Error(`${file}: ${e.message}`);
    }
  }
  return ran;
}

async function verifyShareFunction(ref) {
  const anon = readEnv('VITE_SUPABASE_ANON_KEY');
  const url = readEnv('VITE_SUPABASE_URL');
  if (!anon || !url) return null;

  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/public_shared_dashboard`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ share_token: 'verification-probe-not-a-real-token' }),
  });
  // A 200 with an empty array is exactly right: the function exists and found
  // nothing for a token that was never issued.
  return { ok: res.status === 200, status: res.status };
}

/**
 * Proves both live paths with a real row, then removes it.
 *
 * A reachable endpoint is not the same as a working one — the first deploy of
 * this feed answered every request with a 500 because the new table had RLS
 * policies but no GRANT. Writing a row and reading it back through the public
 * surfaces is what actually catches that class of problem.
 */
async function verifyEndToEnd(token, ref) {
  const anon = readEnv('VITE_SUPABASE_ANON_KEY');
  const url = readEnv('VITE_SUPABASE_URL').replace(/\/$/, '');
  if (!anon || !url) return null;

  const probeToken = `setup-verify-${Date.now().toString(36)}`;
  const owner = await api(token, `/v1/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: 'SELECT id FROM auth.users ORDER BY created_at LIMIT 1;' }),
  });
  const userId = Array.isArray(owner) && owner[0]?.id;
  if (!userId) return { skipped: 'no user account exists yet to attach a test row to' };

  const start = new Date(Date.now() + 86_400_000).toISOString();
  const payload = {
    events: [{ uid: 'verify-1', start, title: 'InternTrack setup verification', description: 'temporary' }],
  };

  const insert = `INSERT INTO public.shared_dashboards (token, user_id, scope, payload, label)
                  VALUES ('${probeToken}', '${userId}', 'calendar', '${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb, 'setup verification');`;
  await api(token, `/v1/projects/${ref}/database/query`, { method: 'POST', body: JSON.stringify({ query: insert }) });

  const result = { share: false, feed: false };
  try {
    const shareRes = await fetch(`${url}/rest/v1/rpc/public_shared_dashboard`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ share_token: probeToken }),
    });
    const rows = shareRes.ok ? await shareRes.json() : [];
    result.share = Array.isArray(rows) && rows.length === 1;

    const feedRes = await fetch(`${url}/functions/v1/calendar-feed?token=${probeToken}`);
    const body = feedRes.ok ? await feedRes.text() : '';
    result.feed = body.includes('BEGIN:VEVENT') && body.includes('InternTrack setup verification');
  } finally {
    await api(token, `/v1/projects/${ref}/database/query`, {
      method: 'POST',
      body: JSON.stringify({ query: `DELETE FROM public.shared_dashboards WHERE token = '${probeToken}';` }),
    });
  }

  return result;
}

/**
 * Runs the Supabase CLI through npx.
 *
 * Windows needs a shell: since the CVE-2024-27980 hardening, Node refuses to
 * spawn a `.cmd` shim directly and fails with EINVAL. When a shell is involved
 * the command is passed as one string rather than an args array — Node
 * deprecates the array form there (DEP0190) because it concatenates without
 * escaping. Every argument below is a literal except the project ref, which
 * `projectRef()` has already constrained to [a-z0-9], and the working directory
 * travels as an option rather than in the command line, so there is nothing
 * left to escape.
 */
function runCli(args, token) {
  const options = {
    cwd: ROOT,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    encoding: 'utf8',
  };
  return process.platform === 'win32'
    ? spawnSync(`npx.cmd ${args.join(' ')}`, { ...options, shell: true })
    : spawnSync('npx', args, options);
}

function deployFunction(token, ref) {
  console.log(`\n${colour.bold('Edge Function')}  ${colour.dim('calendar-feed')}`);

  const base = ['--yes', 'supabase', 'functions', 'deploy', 'calendar-feed', '--project-ref', ref, '--no-verify-jwt'];

  // `--use-api` bundles server-side, so a machine without Docker can still
  // deploy. If this CLI is too old to know the flag, fall back to the plain
  // form, which needs Docker.
  const attempts = [
    { args: [...base, '--use-api'], label: 'server-side bundling' },
    { args: base, label: 'local bundling (needs Docker)' },
  ];

  let last = '';
  for (const attempt of attempts) {
    const result = runCli(attempt.args, token);
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();

    if (result.status === 0) {
      console.log(`  ${colour.ok('✓')} deployed ${colour.dim(`(${attempt.label})`)}`);
      const line = output.split('\n').find(l => /https?:\/\//.test(l));
      if (line) console.log(`  ${colour.dim(line.trim())}`);
      return true;
    }

    last = output || result.error?.message || `exit ${result.status}`;
    // An unknown flag is worth retrying without it; anything else is real.
    if (!/unknown flag|unknown shorthand|flag provided but not defined/i.test(last)) break;
  }

  console.log(`  ${colour.bad('✗')} ${colour.dim(last.split('\n').slice(-5).join('\n  '))}`);
  if (/docker/i.test(last)) {
    console.log(`  ${colour.dim('Docker is not required — this CLI just needs --use-api, which it did not accept.')}`);
  }
  return false;
}

/* ----------------------------------- run ---------------------------------- */

(async () => {
  const token = (process.argv[2] || process.env.SUPABASE_ACCESS_TOKEN || '').trim();

  if (!token) {
    console.log(`
${colour.bold('Supabase setup')}

This applies the pending migration (read-only share links) and deploys the
calendar-feed Edge Function. Both need a Supabase access token, which only you
can create.

  ${colour.bold('1.')} Open  https://supabase.com/dashboard/account/tokens
  ${colour.bold('2.')} "Generate new token", name it anything, copy it
  ${colour.bold('3.')} Run:

       npm run setup:supabase -- sbp_your_token_here

The token is used for this run only — never written to disk, never committed.
`);
    process.exitCode = 1;
    return;
  }

  if (!/^sbp_/.test(token)) {
    fail(
      'That does not look like a Supabase access token.',
      'Personal access tokens start with "sbp_" and come from https://supabase.com/dashboard/account/tokens',
    );
  }

  const url = readEnv('VITE_SUPABASE_URL');
  const ref = projectRef(url);
  if (!ref) fail('Could not read the project ref from VITE_SUPABASE_URL in .env', `Found: ${url || '(nothing)'}`);

  console.log(`${colour.bold('Project')}  ${ref}  ${colour.dim(url)}`);

  let project;
  try {
    project = await api(token, `/v1/projects/${ref}`);
  } catch (e) {
    fail(
      `Could not reach the project with that token (${e.message})`,
      'Check the token is valid and has access to this project.',
    );
  }
  console.log(`${colour.ok('✓')} authenticated — ${project?.name || ref} (${project?.region || 'unknown region'})`);

  let ran = 0;
  try {
    ran = await applyMigrations(token, ref);
  } catch (e) {
    fail(`Migration failed: ${e.message}`);
  }

  const probe = await verifyShareFunction(ref);
  if (probe) {
    console.log(
      probe.ok
        ? `  ${colour.ok('✓')} public_shared_dashboard responds — share links are live`
        : `  ${colour.bad('✗')} public_shared_dashboard still returns ${probe.status}`,
    );
  }

  const deployed = deployFunction(token, ref);

  let live = null;
  if (deployed) {
    console.log(`\n${colour.bold('End-to-end check')}  ${colour.dim('writes a temporary row, reads it back, deletes it')}`);
    try {
      live = await verifyEndToEnd(token, ref);
      if (live?.skipped) {
        console.log(`  ${colour.dim(`skipped — ${live.skipped}`)}`);
      } else if (live) {
        console.log(
          live.share
            ? `  ${colour.ok('✓')} a real share token reads back through the public function`
            : `  ${colour.bad('✗')} share token did not read back`,
        );
        console.log(
          live.feed
            ? `  ${colour.ok('✓')} the calendar feed served that row as a VEVENT`
            : `  ${colour.bad('✗')} the calendar feed did not serve the event`,
        );
      }
    } catch (e) {
      console.log(`  ${colour.bad('✗')} ${colour.dim(e.message)}`);
    }
  }

  console.log(`\n${colour.bold('Done.')}`);
  console.log(`  migrations applied this run: ${ran}`);
  console.log(`  share links: ${probe?.ok ? colour.ok('live') : colour.bad('not responding')}`);
  console.log(`  calendar feed: ${deployed ? colour.ok('deployed') : colour.bad('not deployed')}`);
  if (live && !live.skipped) {
    console.log(`  verified live: ${live.share && live.feed ? colour.ok('both paths') : colour.bad('see above')}`);
  }
  if (deployed) {
    console.log(
      `\n  ${colour.dim(`Feed URL shape: ${url}/functions/v1/calendar-feed?token=<share token>`)}`,
    );
  }

  process.exitCode = probe?.ok && deployed ? 0 : 1;
})().catch(e => {
  console.error(`\n${colour.bad('✗')} ${e.message}`);
  if (e.hint) console.error(`  ${colour.dim(e.hint)}`);
  process.exitCode = 1;
});
