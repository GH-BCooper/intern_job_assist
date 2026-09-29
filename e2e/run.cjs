/**
 * Real-browser end-to-end run, with no account and no network.
 *
 *   npm run e2e
 *
 * Builds the app with the in-memory Supabase fake swapped in (vite.e2e.config.ts),
 * serves it, and drives it in the Chrome or Edge already installed via
 * `playwright-core` — so signed-in screens, drag and drop, real layout and real
 * console output are all exercised, which jsdom cannot do.
 *
 * Every external request is blocked, so the run is deterministic and cannot touch
 * anything but the local server. A check fails on an assertion, and the run
 * fails on any unexpected console error.
 */

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.E2E_PORT || 4181);
const BASE = `http://localhost:${PORT}`;
const SKIP_BUILD = process.env.E2E_SKIP_BUILD === '1';

const results = [];
const errors = [];

function findBrowser() {
  return [
    process.env.E2E_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
    .filter(Boolean)
    .find(p => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`\u001b[32mPASS\u001b[0m  ${name}${detail ? ` — ${detail}` : ''} (${Date.now() - started}ms)`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`\u001b[31mFAIL\u001b[0m  ${name} — ${String(e.message).split('\n')[0].slice(0, 200)}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`The preview server did not start on ${BASE}`);
}

(async () => {
  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('No Chrome or Edge found. Set E2E_BROWSER to a browser executable.');
    process.exit(1);
  }

  if (!SKIP_BUILD) {
    console.log('Building the e2e bundle…');
    const build = spawnSync('npx vite build -c vite.e2e.config.ts', { cwd: ROOT, shell: true, stdio: 'inherit' });
    if (build.status !== 0) process.exit(build.status || 1);
  }

  const server = spawn(`npx vite preview -c vite.e2e.config.ts --outDir dist-e2e --port ${PORT} --strictPort`, {
    cwd: ROOT,
    shell: true,
    stdio: 'ignore',
  });
  const stopServer = () => {
    if (process.platform === 'win32') spawnSync(`taskkill /pid ${server.pid} /T /F`, { shell: true, stdio: 'ignore' });
    else server.kill();
  };

  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath, headless: !process.env.E2E_HEADED });

    const newSession = async (viewport = { width: 1440, height: 900 }) => {
      const context = await browser.newContext({ viewport });
      await context.route(
        url => {
          try {
            const { hostname, protocol } = new URL(url);
            return protocol.startsWith('http') && hostname !== 'localhost';
          } catch {
            return false;
          }
        },
        route => route.abort('blockedbyclient'),
      );
      await context.addInitScript(() => {
        try {
          localStorage.setItem('interntrack.v2.user-1', JSON.stringify({ preferences: { onboarded: true, backupNudgeDays: 0 } }));
        } catch {
          /* private mode */
        }
      });
      const page = await context.newPage();
      page.on('console', msg => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        // Blocked external services (fonts, logos) are expected in this sandbox.
        if (/ERR_BLOCKED_BY_CLIENT|ERR_FAILED|net::ERR_/.test(text)) return;
        errors.push(text.slice(0, 240));
      });
      page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 240)}`));
      return { context, page };
    };

    const fake = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__fake.__tables)));
    const go = async (page, route) => {
      await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(600);
    };

    /* ------------------------------ signed in ------------------------------ */

    const { page } = await newSession();

    await check('dashboard loads with no onboarding wizard for a returning user', async () => {
      await go(page, '/dashboard');
      await page.waitForSelector('[aria-label^="Pipeline board"]', { timeout: 20000 });
      assert((await page.locator('[aria-label="Welcome to InternTrack"]').count()) === 0, 'the wizard is showing');
    });

    await check('every switch draws its knob inside its track', async () => {
      await go(page, '/settings');
      await page.waitForSelector('[role=switch]');
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('[role=switch]')].filter(b => {
          const k = b.firstElementChild.getBoundingClientRect();
          const t = b.getBoundingClientRect();
          return k.left < t.left - 0.5 || k.right > t.right + 0.5;
        }).length,
      );
      assert(bad === 0, `${bad} switch(es) with the knob outside the track`);
    });

    await check('editing an application keeps its interview date', async () => {
      await go(page, '/dashboard');
      await page.waitForSelector('[aria-label^="Pipeline board"]');
      const before = (await fake(page)).interview_dates.find(i => i.id === 'iv-stripe-1');
      await page.locator('[role="button"]:has-text("Backend Engineering Intern")').first().click();
      await page.getByRole('button', { name: /Edit application/ }).click();
      await page.fill('input[placeholder*="Software Engineer"]', 'Backend Engineering Intern (edited)');
      await page.getByRole('button', { name: 'Save Changes' }).click();
      await page.waitForTimeout(800);
      const after = (await fake(page)).interview_dates.find(i => i.id === 'iv-stripe-1');
      assert(after, 'the interview row is gone');
      assert(after.interview_date === before.interview_date, 'the interview time was rewritten');
    });

    await check('drag and drop moves a card, Ctrl+Z puts it back', async () => {
      await go(page, '/dashboard');
      await page.waitForSelector('[aria-label^="Pipeline board"]');
      const status = async () => (await fake(page)).applications.find(a => a.id === 'app-vercel').response_status;
      const start = await status();
      await page.locator('[role="button"]:has-text("Frontend Intern")').first().dragTo(page.locator('section[aria-label^="In Review"]'));
      await page.waitForTimeout(800);
      assert((await status()) !== start, 'the card did not move');
      await page.locator('body').click({ position: { x: 5, y: 300 } });
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(900);
      assert((await status()) === start, 'undo did not restore it');
    });

    await check('page scrolls with the arrow keys instead of the board taking them', async () => {
      await go(page, '/dashboard');
      await page.waitForSelector('[aria-label^="Pipeline board"]');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);
      assert((await page.evaluate(() => window.scrollY)) > 0, 'ArrowDown did not scroll the page');
      assert((await page.locator('.kbd-focus').count()) === 0, 'the board grabbed the arrow keys');
    });

    await check('navigating between pages does not refetch the pipeline', async () => {
      await go(page, '/dashboard');
      await page.waitForSelector('[aria-label^="Pipeline board"]');
      const selects = () =>
        page.evaluate(() => window.__fake.__calls.filter(c => c.table === 'applications' && c.op === 'select').length);
      const first = await selects();
      for (const label of ['Insights', 'Calendar', 'Workspace']) {
        await page.locator(`nav a:has-text("${label}")`).first().click();
        await page.waitForTimeout(500);
      }
      assert((await selects()) === first, `fetched ${first} → ${await selects()} times`);
    });

    await check('the command palette opens and Escape closes only the palette', async () => {
      await go(page, '/dashboard');
      await page.waitForSelector('[aria-label^="Pipeline board"]');
      await page.locator('[role="button"]:has-text("Backend Engineering Intern")').first().click();
      await page.waitForSelector('[aria-label$="application"]');
      await page.keyboard.press('Control+k');
      await page.waitForSelector('[aria-label="Command palette"]');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      assert((await page.locator('[aria-label="Command palette"]').count()) === 0, 'palette still open');
      assert((await page.locator('[aria-label$="application"]').count()) === 1, 'Escape also closed the panel behind it');
    });

    /* ------------------------------- phone ------------------------------- */

    const phone = await newSession({ width: 390, height: 844 });
    for (const route of ['/dashboard', '/insights', '/calendar', '/workspace', '/prep', '/automations', '/settings']) {
      await check(`no horizontal overflow at phone width: ${route}`, async () => {
        await go(phone.page, route);
        await phone.page.waitForTimeout(800);
        const { sw, cw } = await phone.page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        assert(sw <= cw + 1, `page is ${sw}px wide in a ${cw}px viewport`);
      });
    }

    /* ------------------------------ navbar widths ------------------------------ */

    // The labelled bar needs ~1,100px; it used to switch on at 768px, pushing
    // notifications, settings and sign-out off the screen on tablets.
    for (const width of [768, 1024, 1100, 1279, 1440]) {
      await check(`navbar fits and sign-out is reachable at ${width}px`, async () => {
        const session = await newSession({ width, height: 720 });
        await go(session.page, '/dashboard');
        await session.page.waitForSelector('nav');
        const info = await session.page.evaluate(() => {
          const nav = document.querySelector('nav');
          const shown = [...nav.querySelectorAll('button,a')].filter(e => e.offsetParent !== null);
          const names = shown.map(e => (e.getAttribute('aria-label') || e.innerText || '').trim());
          const overflow = Math.max(...[...nav.querySelectorAll('*')].map(e => e.getBoundingClientRect().right)) - document.documentElement.clientWidth;
          return { overflow, menu: names.some(n => /^menu$/i.test(n)), signOut: names.some(n => /sign out/i.test(n)) };
        });
        await session.context.close();
        assert(info.overflow <= 1, `the navbar overflows the screen by ${Math.round(info.overflow)}px`);
        assert(info.menu || info.signOut, 'no way to reach the menu or sign out');
      });
    }

    /* ---------------------------- large pipeline ---------------------------- */

    const big = await newSession();
    let mountedCards = 0;
    await check('typing in search stays responsive with 300 applications', async () => {
      await big.page.addInitScript(() => {
        window.__long = [];
        try {
          new PerformanceObserver(list => list.getEntries().forEach(e => window.__long.push(e.duration))).observe({
            entryTypes: ['longtask'],
          });
        } catch {
          /* unsupported */
        }
      });
      await big.page.goto(`${BASE}/dashboard?seed=300`, { waitUntil: 'load', timeout: 60000 });
      await big.page.waitForSelector('[aria-label^="Pipeline board"]', { timeout: 30000 });
      await big.page.waitForTimeout(1500);
      mountedCards = await big.page.evaluate(() => document.querySelectorAll('[role="button"]').length);
      await big.page.evaluate(() => (window.__long.length = 0));
      await big.page.locator('input[placeholder^="Search company"]').click();
      await big.page.keyboard.type('stripe intern', { delay: 25 });
      await big.page.waitForTimeout(800);
      const worst = await big.page.evaluate(() => Math.max(0, ...window.__long));
      assert(worst < 250, `a ${Math.round(worst)}ms task blocked the page while typing`);
      return `worst long task ${Math.round(worst)}ms`;
    });

    await check('the board pages long columns instead of mounting every card', async () => {
      assert(mountedCards > 0, 'no cards were mounted at all');
      assert(mountedCards < 260, `${mountedCards} card elements mounted for 300 applications`);
      return `${mountedCards} cards mounted`;
    });

    await check('no unexpected console errors across the whole run', async () => {
      assert(errors.length === 0, [...new Set(errors)].slice(0, 3).join(' | '));
    });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    stopServer();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    failed.forEach(f => console.log(` - ${f.name}`));
    process.exit(1);
  }
})().catch(e => {
  console.error('E2E RUN CRASHED:', e.message);
  process.exit(1);
});
