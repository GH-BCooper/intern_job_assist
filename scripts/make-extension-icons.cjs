/**
 * Generates the extension's icon set from the PWA icon already in `public/`.
 *
 * Uses the headless Chrome that `npm run smoke` already drives, so there is no
 * image-processing dependency and nothing to install: the browser decodes the
 * source PNG, draws it into a canvas at each size, and hands back the encoded
 * result.
 *
 *   node scripts/make-extension-icons.cjs
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const SIZES = [16, 48, 128];
const SOURCE = path.join(__dirname, '..', 'public', 'icon-192.png');
const OUT_DIR = path.join(__dirname, '..', 'extension');

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

(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source icon not found: ${SOURCE}`);
    process.exit(1);
  }

  const executablePath = findBrowser();
  if (!executablePath) {
    console.error('No Chrome or Edge found. Set SMOKE_BROWSER to a browser executable.');
    process.exit(1);
  }

  const dataUrl = `data:image/png;base64,${fs.readFileSync(SOURCE).toString('base64')}`;

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();

  const encoded = await page.evaluate(
    async ({ src, sizes }) => {
      const image = new Image();
      image.src = src;
      await image.decode();

      const out = {};
      for (const size of sizes) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // High-quality downscale; the source is 192px, so every target is a
        // reduction and smoothing is what keeps the mark legible at 16px.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(image, 0, 0, size, size);
        out[size] = canvas.toDataURL('image/png').split(',')[1];
      }
      return out;
    },
    { src: dataUrl, sizes: SIZES },
  );

  await browser.close();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const file = path.join(OUT_DIR, `icon-${size}.png`);
    fs.writeFileSync(file, Buffer.from(encoded[size], 'base64'));
    console.log(`wrote ${path.relative(process.cwd(), file)} (${fs.statSync(file).size} bytes)`);
  }
})().catch(e => {
  console.error('ICON GENERATION FAILED:', e.message);
  process.exit(1);
});
