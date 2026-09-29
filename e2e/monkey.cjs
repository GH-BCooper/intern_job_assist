/**
 * Randomised "monkey" run against the e2e build.
 *
 *   npm run e2e:monkey            # 400 steps, fixed seed
 *   MONKEY_STEPS=2000 MONKEY_SEED=7 npm run e2e:monkey
 *
 * Clicks random controls, types random text, presses random keys and navigates
 * around the signed-in app, and fails on the things a person would call a crash:
 * an uncaught error, the "Something went wrong" boundary, a blank page, or a
 * console error. The seed makes a failure reproducible.
 */

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.E2E_PORT || 4182);
const BASE = `http://localhost:${PORT}`;
const STEPS = Number(process.env.MONKEY_STEPS || 400);
let seed = Number(process.env.MONKEY_SEED || 20260930);

const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = list => list[Math.floor(rand() * list.length)];

const WORDS = [
  'Stripe', 'intern', '', '   ', 'a'.repeat(300), '<b>x</b>', '"quoted"', "it's", 'émoji 🚀', '日本語', '0', '-1', '99999', '2026-13-45',
  'javascript:alert(1)', '{{company}}', '%', '\\', 'null', 'undefined', 'Robert\'); DROP TABLE applications;--',
];
const KEYS = ['Escape', 'Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace', '1', '2', '3', 'n', '?', 'j', 'k', 'z'];
const ROUTES = ['/dashboard', '/insights', '/calendar', '/workspace', '/prep', '/automations', '/settings'];
// Things that would end the session or leave the sandbox.
const AVOID = /sign out|log out|wipe my data|delete everything|sign out everywhere|yes, delete|confirm delete/i;

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

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

(async () => {
  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('No Chrome or Edge found. Set E2E_BROWSER.');
    process.exit(1);
  }
  if (process.env.E2E_SKIP_BUILD !== '1') {
    const build = spawnSync('npx vite build -c vite.e2e.config.ts', { cwd: ROOT, shell: true, stdio: 'ignore' });
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

  const problems = [];
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: false });
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
      // Never really leave the page or open windows.
      window.open = () => null;
    });

    const page = await context.newPage();
    page.on('dialog', d => d.accept().catch(() => undefined));
    let step = 0;
    let last = '';
    const note = kind => text => problems.push(`[step ${step}] ${kind}: ${String(text).slice(0, 260)}   (last action: ${last})`);
    page.on('pageerror', e => note('uncaught')(e.message));
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (/ERR_BLOCKED_BY_CLIENT|ERR_FAILED|net::ERR_|Failed to load resource/.test(text)) return;
      note('console.error')(text);
    });

    await page.goto(BASE + '/dashboard?seed=40', { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    for (step = 1; step <= STEPS; step += 1) {
      try {
        const action = rand();
        if (action < 0.08) {
          const route = pick(ROUTES);
          last = `goto ${route}`;
          await page.evaluate(r => {
            window.history.pushState({}, '', r);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }, route);
        } else if (action < 0.62) {
          const targets = await page.$$('button:visible, a[href]:visible, [role="button"]:visible, [role="tab"]:visible, [role="switch"]:visible, summary:visible');
          const shuffled = targets.sort(() => rand() - 0.5).slice(0, 6);
          for (const handle of shuffled) {
            const label = ((await handle.getAttribute('aria-label')) || (await handle.innerText().catch(() => '')) || '').trim();
            if (AVOID.test(label)) continue;
            const href = await handle.getAttribute('href');
            if (href && /^(https?:|mailto:|tel:)/.test(href) && !href.startsWith(BASE)) continue;
            last = `click "${label.replace(/\s+/g, ' ').slice(0, 40)}"`;
            await handle.click({ timeout: 800, force: rand() < 0.1 }).catch(() => undefined);
            break;
          }
        } else if (action < 0.86) {
          const fields = await page.$$('input:visible:not([type=file]):not([type=checkbox]):not([type=radio]), textarea:visible');
          if (fields.length) {
            const field = pick(fields);
            const type = (await field.getAttribute('type')) || 'text';
            let value = pick(WORDS);
            if (type === 'date') value = pick(['2026-10-20', '', '2026-02-30']);
            if (type === 'datetime-local') value = pick(['2026-10-20T14:30', '']);
            if (type === 'number') value = pick(['3', '', '-4', '1e9']);
            if (type === 'range') value = pick(['5', '10']);
            if (type === 'color') value = '#ff0000';
            last = `fill ${type} with ${JSON.stringify(value).slice(0, 30)}`;
            await field.fill(value, { timeout: 800 }).catch(() => undefined);
            // Typing alone submits nothing; Enter is how most inline forms save.
            if (rand() < 0.6) await field.press('Enter', { timeout: 800 }).catch(() => undefined);
            // …and half the time, hunt for a submit-style button, so multi-field forms get saved.
            if (rand() < 0.4) {
              const submit = await page.$('button:visible:has-text("Add"), button:visible:has-text("Save"), button:visible:has-text("Set")');
              if (submit) await submit.click({ timeout: 800 }).catch(() => undefined);
            }
          }
        } else if (action < 0.94) {
          const selects = await page.$$('select:visible');
          if (selects.length) {
            const select = pick(selects);
            const options = await select.$$eval('option', els => els.map(o => o.value));
            if (options.length) {
              const value = pick(options);
              last = `select ${value}`;
              await select.selectOption(value, { timeout: 800 }).catch(() => undefined);
            }
          }
        } else {
          const key = pick(KEYS);
          const mod = rand() < 0.15 ? 'Control+' : '';
          last = `press ${mod}${key}`;
          await page.keyboard.press(mod + key).catch(() => undefined);
        }

        // Did anything just break?
        const state = await page.evaluate(() => ({
          boundary: /Something went wrong/.test(document.body.innerText),
          blank: document.body.innerText.trim().length < 20,
          path: location.pathname,
        }));
        if (state.boundary) {
          note('ERROR BOUNDARY')(await page.locator('body').innerText().then(t => t.slice(0, 200)));
          break;
        }
        if (state.blank) {
          note('BLANK PAGE')(state.path);
          break;
        }
        if (!state.path.startsWith('/') || state.path === '/login') {
          // Signed out somehow; put the session back and carry on.
          last = 'recover';
          await page.goto(BASE + '/dashboard', { waitUntil: 'load' });
        }
      } catch (e) {
        note('driver')(e.message);
      }
    }

    console.log(`Ran ${Math.min(step, STEPS)} steps (seed ${process.env.MONKEY_SEED || 20260930}).`);

    // Proof it did something: how much state the random input actually produced.
    const reached = await page
      .evaluate(() => {
        const store = JSON.parse(localStorage.getItem('interntrack.v2.user-1') || '{}');
        const count = key => (Array.isArray(store[key]) ? store[key].length : 0);
        return {
          applications: window.__fake.__tables.applications.length,
          writes: window.__fake.__writes().length,
          tasks: count('tasks'),
          reminders: count('reminders'),
          notes: count('notes'),
          contacts: count('contacts'),
          tags: count('tags'),
          automations: count('automationRules'),
          prepCards: count('srsCards'),
          undoable: 'n/a',
        };
      })
      .catch(() => null);
    if (reached) console.log('State reached:', JSON.stringify(reached));
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    stopServer();
  }

  const unique = [...new Set(problems)];
  if (unique.length) {
    console.log(`\n${unique.length} problem(s):`);
    unique.slice(0, 20).forEach(p => console.log(' - ' + p));
    process.exit(1);
  }
  console.log('No crashes, error boundaries, blank pages or console errors.');
})().catch(e => {
  console.error('MONKEY RUN CRASHED:', e.message);
  process.exit(1);
});
