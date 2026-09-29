/**
 * End-to-end smoke test: drives the built app in real Chrome.
 *
 * Uses `playwright-core` against the Chrome or Edge already installed, so there
 * is no browser download and nothing to pay for.
 *
 *   npm run build && npm run preview     # in one terminal
 *   npm run smoke                        # in another
 *
 * Set SMOKE_EMAIL and SMOKE_PASSWORD to also exercise the signed-in journey;
 * without them the run covers everything reachable while signed out and says
 * plainly what it skipped. Any unexpected console error fails the run.
 */

const fs = require('fs');
const { chromium } = require('playwright-core');

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';

/** First browser we can find; Chrome, then Edge. */
function findBrowser() {
  const candidates = [
    process.env.SMOKE_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find(p => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

const results = [];
const notes = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const label = ok ? '\u001b[32mPASS\u001b[0m' : '\u001b[31mFAIL\u001b[0m';
  console.log(`${label}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === 'string' ? detail : '');
  } catch (e) {
    record(name, false, e.message.split('\n')[0].slice(0, 180));
  }
}

/**
 * Console noise that is expected rather than a defect.
 *
 * Logo services legitimately 404 (the app falls back to initials), and the
 * share-link RPC 404s until its migration is applied — which the UI already
 * explains in plain language.
 */
const EXPECTED = [
  { pattern: /clearbit|s2\/favicons|favicon/i, note: null },
  { pattern: /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|net::ERR_/i, note: null },
  {
    pattern: /public_shared_dashboard|rpc\//i,
    note: 'share links need supabase/migrations/20260929000001_add_shared_dashboards.sql applied',
  },
];

(async () => {
  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('No Chrome or Edge found. Set SMOKE_BROWSER to a browser executable.');
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath, headless: !process.env.SMOKE_HEADED });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  const classify = text => {
    const match = EXPECTED.find(e => e.pattern.test(text));
    if (!match) {
      errors.push(text);
      return;
    }
    if (match.note && !notes.includes(match.note)) notes.push(match.note);
  };

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    // A failed request logs a console error whose text has no URL in it
    // ("Failed to load resource: ... 404"), so classify on the location the
    // message carries instead, falling back to the text for real page errors.
    const url = msg.location()?.url || '';
    classify(url ? `${url} ${msg.text()}` : msg.text());
  });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('response', r => {
    if (r.status() >= 400) classify(`${r.status()} ${r.url()}`);
  });

  /* ------------------------------ public routes ------------------------------ */

  await check('home page renders', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const title = await page.title();
    if (!/intern/i.test(title)) throw new Error(`unexpected title: ${title}`);
    return title;
  });

  await check('runtime accent variables are applied', async () => {
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary-500').trim(),
    );
    if (!value) throw new Error('--color-primary-500 is empty');
    return value;
  });

  await check('tailwind colours resolve through those variables', async () => {
    const colour = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'text-primary-500';
      document.body.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    });
    if (!/^rgb/.test(colour) || colour === 'rgb(0, 0, 0)') throw new Error(`resolved to ${colour}`);
    return colour;
  });

  await check('login page renders', async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  });

  await check('protected routes redirect when signed out', async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => location.pathname === '/login', { timeout: 12000 });
  });

  await check('shared route handles a bad token gracefully', async () => {
    await page.goto(`${BASE}/shared/definitely-not-a-real-token`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => /Nothing to show|Shared read-only/.test(document.body.innerText), {
      timeout: 15000,
    });
  });

  /* ---------------------------- signed-in journey ---------------------------- */

  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;

  if (!email || !password) {
    record('signed-in journey', true, 'SKIPPED — set SMOKE_EMAIL and SMOKE_PASSWORD to include it');
  } else {
    await check('sign in', async () => {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 25000 });
    });

    await check('dashboard bento renders', () => page.waitForSelector('text=Momentum', { timeout: 20000 }));

    for (const [name, route, marker] of [
      ['insights', '/insights', 'Why your momentum'],
      ['calendar', '/calendar', ''],
      ['workspace', '/workspace', 'Cover letters'],
      ['prep', '/prep', 'STAR stories'],
      ['automations', '/automations', 'Quiet hours'],
      ['settings', '/settings', 'Accent palette'],
    ]) {
      await check(`${name} page loads`, async () => {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
        if (marker) await page.waitForSelector(`text=${marker}`, { timeout: 20000 });
        else await page.waitForTimeout(900);
      });
    }

    await check('command palette offers an inline answer', async () => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await page.keyboard.press('Control+k');
      await page.waitForSelector('input[placeholder*="Search applications"]', { timeout: 10000 });
      await page.keyboard.type('how many applications did I send this week?');
      await page.waitForSelector('text=Ask Scout', { timeout: 10000 });
      await page.keyboard.press('Escape');
    });

    await check('switching accent repaints the palette', async () => {
      await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
      const read = () =>
        page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary-500').trim());
      const before = await read();
      await page.click('button[title*="Cool blue"]');
      await page.waitForTimeout(400);
      const after = await read();
      if (before === after) throw new Error('the variable did not change');
      await page.click('button[title*="original warm gold"]');
      return `${before} -> ${after}`;
    });

    await check('calendar export downloads an .ics', async () => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click('button[title*="ics"]'),
      ]);
      const name = download.suggestedFilename();
      if (!name.endsWith('.ics')) throw new Error(`downloaded ${name}`);
      return name;
    });
  }

  record('no unexpected console or network errors', errors.length === 0, errors.slice(0, 4).join(' | ').slice(0, 400));

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (notes.length) {
    console.log('\nExpected, environment-dependent:');
    notes.forEach(n => console.log(` - ${n}`));
  }
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach(f => console.log(` - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
    process.exit(1);
  }
})().catch(e => {
  console.error('SMOKE RUN CRASHED:', e.message);
  process.exit(1);
});

