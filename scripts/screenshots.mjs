#!/usr/bin/env node
/**
 * Screenshot checks of the web preview (R-060, 10 Nov 2026).
 *
 *   node scripts/screenshots.mjs shoot <preview-web folder> <out folder>
 *   node scripts/screenshots.mjs compare <before folder> <after folder> [--strict] [--github]
 *
 * `shoot` serves a preview export (`npm run preview:web`) on 127.0.0.1 and
 * draws every `?screen=` page at a phone width and a laptop width, in light
 * and dark, into PNGs plus a `shots.json` saying how each one went. A page
 * fails when it says `previewReady=failed`, never gets ready, or throws.
 *
 * `compare` matches two such folders pixel by pixel and prints one line per
 * page: same, changed (with how much), new, gone or failed. It exits non-zero
 * when a page in the after folder failed to draw, and, with --strict, when
 * anything changed. --github adds annotations and a job summary, text only.
 *
 * Both folders are drawn by the same browser on the same machine, so a
 * difference is a difference in the app, not in the machine. No image ever
 * leaves the machine: CI prints text and uploads nothing. The preview's
 * notebook is synthetic (build-control/PREVIEW.md), but the rule for a public
 * repo stands anyway.
 */

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The widths drawn. Phone is the Fold's cover screen (PREVIEW.md); laptop a common laptop window. */
export const SIZES = [
  { name: 'phone', width: 369, height: 800 },
  { name: 'laptop', width: 1280, height: 800 },
];
export const THEMES = ['light', 'dark'];

/**
 * Every page is drawn at this one moment, so a timer's time left, "3 days
 * ago" and the like read the same in both folders. Only the clock is fixed;
 * timeouts and animation frames still run, so the app behaves as usual.
 */
const FIXED_TIME = '2026-11-10T10:00:00+11:00';

const READY_TIMEOUT_MS = 30_000;
const SETTLE_TRIES = 16;
const SETTLE_MATCHES = 2;
const SETTLE_GAP_MS = 250;
const CONCURRENCY = 4;

/** The screens, read from the app's own list so a new one is covered without touching this file. */
export function previewScreens(repo = REPO) {
  const source = readFileSync(join(repo, 'src/preview/options.web.ts'), 'utf8');
  const block = source.match(/PREVIEW_SCREENS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error('Could not find PREVIEW_SCREENS in src/preview/options.web.ts');
  const screens = [...block[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  if (screens.length === 0) throw new Error('PREVIEW_SCREENS is empty');
  return screens;
}

export function shotName(screen, size, theme) {
  return `${screen}__${size}__${theme}`;
}

// --- A static server for one export ------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Serves `root` as scripts/serve-preview.mjs does, on a free port on 127.0.0.1. */
function serve(root) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const wanted = normalize(join(root, pathname));
      const inside = wanted === root || wanted.startsWith(root + sep);
      const file = inside && isFile(wanted) ? wanted : join(root, 'index.html');
      response.writeHead(200, {
        'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      createReadStream(file).pipe(response);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolvePromise({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

// --- shoot -------------------------------------------------------------------

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('No Chrome found. Set CHROME_PATH to a Chrome or Chromium executable.');
  return found;
}

async function drawOne(browser, baseUrl, job) {
  const { screen, size, theme, outDir } = job;
  const name = shotName(screen, size.name, theme);
  const result = { name, screen, size: size.name, theme, status: 'ok', settled: false, problems: [] };
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(FIXED_TIME));
    page.on('pageerror', (error) => result.problems.push(`page error: ${String(error.message).slice(0, 200)}`));
    await page.goto(`${baseUrl}/?screen=${screen}&theme=${theme}`, { waitUntil: 'load' });
    const ready = await page
      .waitForFunction(() => {
        const state = document.body?.dataset?.previewReady;
        return state === 'yes' || state === 'failed' ? state : false;
      }, null, { timeout: READY_TIMEOUT_MS })
      .then((handle) => handle.jsonValue())
      .catch(() => 'timeout');
    if (ready !== 'yes') {
      result.status = 'failed';
      result.problems.push(ready === 'failed' ? 'the preview said previewReady=failed' : `not ready after ${READY_TIMEOUT_MS / 1000}s`);
      return result;
    }
    await page.evaluate(() => document.fonts.ready);
    // A focused field's caret blinks, which would make two runs differ.
    await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
    // Sheets fade in, photos and counts arrive after previewReady: shoot
    // until three in a row match (two can match while a photo is loading).
    let previous = await page.screenshot();
    let matches = 0;
    for (let i = 0; i < SETTLE_TRIES; i += 1) {
      await page.waitForTimeout(SETTLE_GAP_MS);
      await page.evaluate(() => Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null)))));
      const next = await page.screenshot();
      matches = next.equals(previous) ? matches + 1 : 0;
      previous = next;
      if (matches >= SETTLE_MATCHES) {
        result.settled = true;
        break;
      }
    }
    writeFileSync(join(outDir, `${name}.png`), previous);
    if (result.problems.length > 0) result.status = 'failed';
    return result;
  } catch (error) {
    result.status = 'failed';
    result.problems.push(`error: ${String(error?.message ?? error).slice(0, 200)}`);
    return result;
  } finally {
    await context.close();
  }
}

async function shoot(previewDir, outDir) {
  const root = resolve(previewDir);
  if (!isFile(join(root, 'index.html'))) {
    throw new Error(`No preview export in ${root}. Run npm run preview:web first.`);
  }
  mkdirSync(outDir, { recursive: true });
  // The screen list comes from the checkout the export was built from.
  const screens = previewScreens(resolve(root, '..'));
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    // Software drawing in one colour space, so the same page draws the same
    // pixels each time (GPU drawing left 1-2 level speckles between runs).
    args: [
      '--disable-gpu',
      '--disable-gpu-rasterization',
      '--disable-partial-raster',
      '--disable-skia-runtime-opts',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-lcd-text',
    ],
  });
  const { server, url } = await serve(root);
  const jobs = [];
  for (const screen of screens) {
    for (const size of SIZES) {
      for (const theme of THEMES) jobs.push({ screen, size, theme, outDir });
    }
  }
  const results = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      const result = await drawOne(browser, url, job);
      results.push(result);
      const note = result.status === 'ok' ? (result.settled ? '' : ' (still moving)') : ` — ${result.problems.join('; ')}`;
      console.log(`${result.status === 'ok' ? 'drawn ' : 'FAILED'} ${result.name}${note}`);
    }
  }
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    server.close();
    await browser.close();
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(
    join(outDir, 'shots.json'),
    JSON.stringify({ fixedTime: FIXED_TIME, sizes: SIZES, themes: THEMES, screens, results }, null, 2),
  );
  const failed = results.filter((r) => r.status !== 'ok').length;
  console.log(`${results.length - failed} of ${results.length} drawn (${screens.length} screens × ${SIZES.length} widths × ${THEMES.length} themes).`);
  return failed === 0 ? 0 : 1;
}

// --- compare -----------------------------------------------------------------

function readShots(dir) {
  const file = join(dir, 'shots.json');
  if (!isFile(file)) throw new Error(`No shots.json in ${dir}. Run shoot first.`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function compare(beforeDir, afterDir, { strict, github }) {
  const { PNG } = await import('pngjs');
  const { default: pixelmatch } = await import('pixelmatch');
  // A "before" that could not be drawn at all (an old commit without the
  // preview) leaves no shots.json: every page then counts as new.
  const before = isFile(join(beforeDir, 'shots.json')) ? readShots(beforeDir) : { results: [] };
  if (before.results.length === 0) console.log(`No "before" shots in ${beforeDir}: every page counts as new.`);
  const after = readShots(afterDir);
  const beforeByName = new Map(before.results.map((r) => [r.name, r]));
  const afterByName = new Map(after.results.map((r) => [r.name, r]));
  const names = [...new Set([...beforeByName.keys(), ...afterByName.keys()])].sort();
  const rows = [];
  for (const name of names) {
    const b = beforeByName.get(name);
    const a = afterByName.get(name);
    if (!a) {
      rows.push({ name, verdict: 'gone', detail: 'drawn before, not now' });
    } else if (a.status !== 'ok') {
      rows.push({ name, verdict: 'failed', detail: a.problems.join('; ') });
    } else if (!b || b.status !== 'ok') {
      rows.push({ name, verdict: 'new', detail: b ? 'did not draw before' : 'not drawn before' });
    } else {
      const imgB = PNG.sync.read(readFileSync(join(beforeDir, `${name}.png`)));
      const imgA = PNG.sync.read(readFileSync(join(afterDir, `${name}.png`)));
      if (imgB.width !== imgA.width || imgB.height !== imgA.height) {
        rows.push({ name, verdict: 'changed', detail: `size ${imgB.width}×${imgB.height} → ${imgA.width}×${imgA.height}` });
        continue;
      }
      // Exact: both folders come from the same browser on the same machine,
      // and five runs were identical to the pixel (10 Nov). A looser
      // threshold missed a hairline colour changed on purpose.
      const differing = pixelmatch(imgB.data, imgA.data, null, imgA.width, imgA.height, { threshold: 0, includeAA: true });
      if (differing === 0) {
        rows.push({ name, verdict: 'same', detail: a.settled ? '' : 'still moving when drawn' });
      } else {
        const share = (100 * differing) / (imgA.width * imgA.height);
        rows.push({ name, verdict: 'changed', detail: `${differing} pixels (${share.toFixed(2)}%)` });
      }
    }
  }
  const count = (verdict) => rows.filter((r) => r.verdict === verdict).length;
  const totals = `${count('same')} same, ${count('changed')} changed, ${count('new')} new, ${count('gone')} gone, ${count('failed')} failed, of ${rows.length}`;
  for (const row of rows) {
    console.log(`${row.verdict.padEnd(7)} ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
  }
  console.log(totals);

  if (github) {
    for (const row of rows) {
      if (row.verdict === 'failed') console.log(`::error::Screenshot ${row.name} failed to draw: ${row.detail}`);
      if (row.verdict === 'changed') console.log(`::warning::Screenshot ${row.name} changed: ${row.detail}`);
      if (row.verdict === 'gone') console.log(`::warning::Screenshot ${row.name} is no longer drawn`);
    }
    console.log(`::notice::Screenshots: ${totals}`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      const lines = [
        '## Screenshot checks',
        '',
        `${totals}. Each page drawn at ${SIZES.map((s) => `${s.name} ${s.width}×${s.height}`).join(' and ')}, light and dark, before and after this change, on this runner. No images are uploaded.`,
        '',
        '| Page | Width | Theme | Result | Detail |',
        '|---|---|---|---|---|',
        ...rows.map((r) => {
          const [screen, size, theme] = r.name.split('__');
          return `| ${screen} | ${size} | ${theme} | ${r.verdict} | ${r.detail} |`;
        }),
      ];
      appendFileSync(summary, `${lines.join('\n')}\n`);
    }
  }
  if (count('failed') > 0) return 1;
  if (strict && (count('changed') > 0 || count('gone') > 0)) return 1;
  return 0;
}

// --- main --------------------------------------------------------------------

async function main(argv) {
  const [command, first, second, ...rest] = argv;
  if (command === 'shoot' && first && second) return shoot(first, second);
  if (command === 'compare' && first && second) {
    return compare(first, second, { strict: rest.includes('--strict'), github: rest.includes('--github') });
  }
  console.error('Usage:\n  node scripts/screenshots.mjs shoot <preview-web folder> <out folder>\n  node scripts/screenshots.mjs compare <before> <after> [--strict] [--github]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error?.message ?? error);
      process.exit(2);
    },
  );
}
