// Before-and-after screenshots for the design system (src/styles/tokens.css, src/components/ui/):
// proof that a change to the look moved only what it meant to move. It drives two copies of the
// app the same way, compares their pictures pixel by pixel, and prints one STEP line per check.
// Exits 1 if any check fails.
//
//   node scripts/design-shots.cjs --before <tree> --out <dir> [--after <tree>] [--parts app,cards,gallery,playback] [--pictures <dir>]
//
// A <tree> is a source folder of the app with its node_modules and its web build (dist-web). The
// "before" tree is the commit compared against, unpacked somewhere outside the repo, for example
//   git archive <commit> | tar -x -C <folder>; link node_modules and copy src/generated in;
//   then, inside that folder, vite build --config vite.config.web.ts
// The "after" tree defaults to this repo, whose dist-web must be built first (npm run build:web).
// The two copies are served by a small static server (the app, the cards) or by each tree's own
// Vite dev server (the component gallery and the 3D playback, which are dev-only pages).
//
// Environment, as scripts/playback-shots.cjs: PLAYWRIGHT_MODULE (a playwright-core or playwright
// folder; else require('playwright')), CHROME_PATH (the Chromium binary; else Playwright's own),
// PLAYBACK_GL_FLAGS (WebGL flags for the playback; default software WebGL). It opens local ports
// and starts a browser, so it cannot run inside a sandbox that forbids either.
//
// The parts:
//   app       the web build at 1400x900 and 390x844, both copies, driven alike with the synthetic
//             mission: landing, import preview, map, and on the desktop the Waypoints panel and
//             Settings. Map tiles are blocked (a blank map is the same in every run) and motion is
//             reduced. The "before" copy runs twice: its two runs must match pixel for pixel, or a
//             difference could be noise.
//             HS1  the map is untouched: on the desktop map, every pixel that changed lies in the
//                  header or the panel buttons (their box and 60 px round it, for their shadow) or
//                  moved by at most 4 of 255 in each channel; on the phone, only in the top bar and
//                  the tab bar. The markers sit where they sat (the map framed the route the same).
//             HS2  the app's text is in the bundled Figtree, and the map's legend and Leaflet keep
//                  their own font and ordinary digits.
//             HS3  every font comes from the app itself, and the only hosts contacted are the local
//                  server and the map tile server.
//             HS4  nothing is wider than the window, and no dialog is wider than itself; on the
//                  desktop the header, the map and the import dialog keep their size and place.
//             HS6  before, after and a diff picture (changed pixels red over the darkened before)
//                  of every screen, in <out>/app.
//   cards     HS7  the kneeboard cards byte for byte: the same three attacks planned in both copies,
//                  the cards shared on the phone layout (no share sheet in a headless browser, so
//                  they download), and the SHA-256 of each PNG compared. Tiles are blocked here too:
//                  with live tiles two runs differ along a tile seam.
//   gallery   HS5  the building blocks at their sizes, on ui-gallery.html (the "after" tree's dev
//                  server) at 1400x900 and 390x844, where the phone's touch sizes take over.
//   playback  HS8  the 3D playback looks as it did: its overlay at 1400x900, paused at the start
//                  with the Show menu open, in both copies (the "before" twice, as for the app); not
//                  one pixel may differ. The frame-time readout, which changes from run to run, is
//                  pinned to one text first.
//
// --pictures <dir> also writes pictures for a person to judge by eye: the playback's lettering kept and
// let go (the overlay's legacy-ui class taken off in the page), and the gallery's main button
// ready, greyed and at half strength (a copy of the ready one made in the page).
//
// Each check was seen failing once under one change, made in a copy of the source and built there;
// the change and the failure it printed are written beside the check below.
'use strict';
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const repo = path.resolve(__dirname, '..');
const beforeTree = opt('before') ? path.resolve(opt('before')) : null;
const afterTree = path.resolve(opt('after', repo));
const out = opt('out') ? path.resolve(opt('out')) : null;
const parts = new Set(opt('parts', 'app,cards,gallery,playback').split(','));
const pictures = opt('pictures') ? path.resolve(opt('pictures')) : null;
const needsBefore = parts.has('app') || parts.has('cards') || parts.has('playback');
if (!out || (needsBefore && !beforeTree)) {
  console.error('usage: node scripts/design-shots.cjs --before <tree> --out <dir> [--after <tree>] [--parts app,cards,gallery,playback] [--pictures <dir>]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
if (pictures) fs.mkdirSync(pictures, { recursive: true });
const GL_FLAGS = (process.env.PLAYBACK_GL_FLAGS || '--use-angle=swiftshader --enable-unsafe-swiftshader').split(/\s+/).filter(Boolean);
const fixture = fs.readFileSync(path.join(repo, 'test-data/nevada_SYNTHETIC_link_payload.json'), 'utf8');
const DESKTOP = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };
const TILE_HOST = /(^|\.)tile\.openstreetmap\.org$/;

const failures = [];
function step(name, ok, detail) {
  console.log(`STEP ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}
const note = (s) => console.log(`NOTE ${s}`);

function loadPlaywright() {
  return process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// ── Serving the two copies.

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

/** A built folder on a local port, as a web host would serve it. */
function serveStatic(dir) {
  if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`no web build in ${dir} (build it first)`);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://local').pathname));
      if (!file.startsWith(dir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => new Promise((r) => {
          server.closeAllConnections();
          server.close(() => r());
        }),
      }));
  });
}

// A tree's own Vite dev server, in a process of its own whose working folder is the tree: Tailwind
// finds its config and the files it scans from the working folder, so two trees cannot share one
// process. Each tree gets its own dependency cache, so neither rebuilds the other's, and the tree's
// node_modules may be a link to another copy's (its real folder is allowed to be served).
const DEV_SERVER = `
const path = require('path'), fs = require('fs'), url = require('url');
(async () => {
  const tree = process.cwd();
  const [port, cacheDir] = [Number(process.argv[1]), process.argv[2]];
  const { createServer } = await import(url.pathToFileURL(path.join(tree, 'node_modules/vite/dist/node/index.js')).href);
  const server = await createServer({
    root: tree,
    configFile: path.join(tree, 'vite.config.ts'),
    logLevel: 'error',
    clearScreen: false,
    cacheDir,
    server: { port, strictPort: true, host: '127.0.0.1', hmr: false, open: false, fs: { allow: [tree, fs.realpathSync(path.join(tree, 'node_modules')), cacheDir] } },
    optimizeDeps: { entries: ['playback-harness.html', 'ui-gallery.html'].filter((f) => fs.existsSync(path.join(tree, f))) },
  });
  await server.listen();
  console.log('READY');
})().catch((e) => { console.error((e && e.stack) || String(e)); process.exit(1); });
`;

async function startDevServer(tree) {
  const port = await freePort();
  const cacheDir = path.join(os.tmpdir(), `design-shots-vite-${crypto.createHash('sha1').update(tree).digest('hex').slice(0, 12)}`);
  const child = spawn(process.execPath, ['-e', DEV_SERVER, String(port), cacheDir], { cwd: tree, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (d) => {
    errors += d;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the dev server for ${tree} did not start within 180 s: ${errors}`)), 180000);
    child.stdout.on('data', (d) => {
      if (/READY/.test(String(d))) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`the dev server for ${tree} stopped (exit ${code}): ${errors}`));
    });
  });
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((r) => {
      if (child.exitCode !== null) return r();
      child.once('exit', () => r());
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }),
  };
}

// ── Pictures, compared inside the browser (it decodes a PNG, so this script needs no decoder).

let canvasPage = null;
async function pageForPictures(browser) {
  if (!canvasPage) canvasPage = await (await browser.newContext()).newPage();
  return canvasPage;
}
const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
const fromDataUrl = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

/**
 * Compare two same-size pictures. Counts every changed pixel, those that moved by more than `tol`
 * of 255 in some channel, and of those the ones outside every `ignore` rectangle ([x0, y0, x1, y1]),
 * with their bounding box and largest change. Returns the diff picture as PNG bytes.
 */
async function comparePictures(browser, a, b, { ignore = [], tol = 0 } = {}) {
  const page = await pageForPictures(browser);
  const r = await page.evaluate(async ({ a, b, ignore, tol }) => {
    const load = (src) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('a picture did not load'));
      img.src = src;
    });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
    const w = ia.width, h = ia.height;
    const pixels = (img) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, w, h).data;
    };
    const pa = pixels(ia), pb = pixels(ib);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const o = img.data;
    const inside = (x, y) => ignore.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
    let changed = 0, beyond = 0, outside = 0, largest = 0;
    let box = null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
        if (d > 0) {
          changed++;
          o[i] = 255; o[i + 1] = 0; o[i + 2] = 0; o[i + 3] = 255;
          if (d > tol) {
            beyond++;
            if (!inside(x, y)) {
              outside++;
              largest = Math.max(largest, d);
              box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
            }
          }
        } else {
          o[i] = pa[i] * 0.35; o[i + 1] = pa[i + 1] * 0.35; o[i + 2] = pa[i + 2] * 0.35; o[i + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    return { changed, beyond, outside, largest, box, diff: c.toDataURL('image/png') };
  }, { a: dataUrl(a), b: dataUrl(b), ignore, tol });
  if (r.size) return { ...r, diff: null };
  return { ...r, diff: fromDataUrl(r.diff) };
}

/** Pieces of pictures ([png, [x0, y0, x1, y1]]) laid one under the other ('column') or side by side ('row'), with a gap. */
async function compose(browser, pieces, direction) {
  const page = await pageForPictures(browser);
  const url = await page.evaluate(async ({ pieces, direction }) => {
    const load = (src) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('a picture did not load'));
      img.src = src;
    });
    const imgs = await Promise.all(pieces.map(([src]) => load(src)));
    const GAP = 16;
    const sizes = pieces.map(([, [x0, y0, x1, y1]]) => [x1 - x0, y1 - y0]);
    const W = direction === 'column' ? Math.max(...sizes.map((s) => s[0])) : sizes.reduce((n, s) => n + s[0], 0) + GAP * (sizes.length - 1);
    const H = direction === 'column' ? sizes.reduce((n, s) => n + s[1], 0) + GAP * (sizes.length - 1) : Math.max(...sizes.map((s) => s[1]));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(128, 128, 128)'; // a neutral gap between the pieces
    g.fillRect(0, 0, W, H);
    let at = 0;
    pieces.forEach(([, [x0, y0]], i) => {
      const [w, h] = sizes[i];
      g.drawImage(imgs[i], x0, y0, w, h, direction === 'column' ? 0 : at, direction === 'column' ? at : 0, w, h);
      at += (direction === 'column' ? h : w) + GAP;
    });
    return c.toDataURL('image/png');
  }, { pieces: pieces.map(([png, rect]) => [dataUrl(png), rect]), direction });
  return fromDataUrl(url);
}

const inflate = ([x0, y0, x1, y1], by) => [x0 - by, y0 - by, x1 + by, y1 + by];
const union = (a, b) => (a && b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a || b);
const rectText = (r) => (r ? `[${r.map((v) => Math.round(v)).join(',')}]` : 'none');
const sameRect = (a, b) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < 0.5);

// ── Driving the app.

async function newAppContext(browser, size, extra = {}) {
  const phone = size.width < 768 || size.height < 500;
  // Service workers off: the phone's offline cache would fetch every file in the background and blur what a screen asks for.
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, reducedMotion: 'reduce', hasTouch: phone, serviceWorkers: 'block', ...extra });
  await context.route((u) => TILE_HOST.test(u.host), (r) => r.abort());
  const record = { hosts: new Set(), fonts: [], problems: [] };
  context.on('request', (r) => record.hosts.add(new URL(r.url()).host));
  context.on('response', (r) => {
    if (r.request().resourceType() === 'font') {
      const u = new URL(r.url());
      record.fonts.push({ host: u.host, file: u.pathname.slice(u.pathname.lastIndexOf('/') + 1), status: r.status() });
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => record.problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    // A blocked tile is a failed load by design; anything else is a problem.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) record.problems.push(`console: ${m.text()}`);
  });
  return { context, page, record, phone };
}

/** Fonts loaded and the layout settled, then the picture. */
async function picture(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return page.screenshot();
}

/** The page's width against the window, and how far the newest dialog's content runs past its own width. */
const widths = (page) => page.evaluate(() => {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const top = dialogs[dialogs.length - 1];
  return { page: document.documentElement.scrollWidth, window: innerWidth, dialog: top ? top.scrollWidth - top.clientWidth : 0 };
});
const box = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return [r.left, r.top, r.right, r.bottom];
});

/**
 * The first screen, settled: the front page with its load box, or, in a copy from before the front page,
 * the old landing with its "Import FragOrders" button. Either copy can be the "before" one, so both are read.
 * Resolves to true for the front page.
 */
async function firstScreen(page) {
  const front = page.getByRole('heading', { name: 'Load a mission' });
  await front.or(page.getByRole('button', { name: 'Import FragOrders' })).first().waitFor();
  return (await front.count()) > 0;
}

/**
 * Load the synthetic mission as far as the flight picker, whose own button reads "Import Viper 1" (the flight's
 * name), or "Import Mission" in a copy from before "Choose your flight" was rebuilt. The header's own Import (a row
 * of its File menu, or in an older copy a button) has no word after it, and the old landing's "Import FragOrders" is
 * left out, so the pattern finds only the picker's.
 */
const IMPORT_PICKED = /^Import (?!FragOrders)/;
async function importMission(page) {
  if (await firstScreen(page)) {
    await page.getByPlaceholder('Paste a FragOrders link').fill(fixture);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Import FragOrders' }).click();
    await page.getByRole('button', { name: 'From JSON' }).click();
    await page.getByPlaceholder('Or paste FragOrders JSON here...').fill(fixture);
    await page.getByRole('button', { name: 'Parse JSON' }).click();
  }
  await page.getByRole('button', { name: IMPORT_PICKED }).waitFor();
}

/**
 * After a load, on to the planner's map. A copy with the Flight overview lands there first and goes on with its
 * "Open the map"; an older copy lands on the map at once. Either can be the "before" one.
 */
async function toMap(page) {
  const openMap = page.getByRole('button', { name: 'Open the map', exact: true });
  const threats = page.getByRole('button', { name: /^Threats/ });
  await openMap.or(threats).first().waitFor();
  if ((await openMap.count()) > 0) await openMap.first().click();
  await threats.first().waitFor();
}

/** One copy at one size: every screen's picture and the measures the checks need. */
async function appRun(browser, base, size) {
  const { context, page, record, phone } = await newAppContext(browser, size);
  const shots = {};
  const m = { widths: {} };
  try {
    await page.goto(base);
    await firstScreen(page);
    shots.landing = await picture(page);
    m.widths.landing = await widths(page);

    await importMission(page);
    shots['import-preview'] = await picture(page);
    m.widths['import-preview'] = await widths(page);
    m.importDialog = await box(page.locator('[role="dialog"]').last());

    await page.getByRole('button', { name: IMPORT_PICKED }).click();
    await toMap(page);
    await page.locator('.leaflet-marker-icon').first().waitFor();
    await page.waitForTimeout(1500); // the map's fit, and the blocked tiles giving up
    shots.map = await picture(page);
    m.widths.map = await widths(page);
    m.markers = await page.locator('.leaflet-marker-icon').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10];
    }));
    m.map = await box(page.locator('.leaflet-container').first());
    m.fonts = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      figtree: document.fonts.check('600 15px "Figtree Variable"'),
      leaflet: getComputedStyle(document.querySelector('.leaflet-container')).fontFamily,
    }));
    // The legend: a box on the desktop map, the Layers button on a phone. Both sit in the map's font-map wrapper.
    const legend = phone ? page.getByRole('button', { name: 'Layers' }) : page.getByRole('button', { name: /Legend/ }).locator('xpath=..');
    m.legend = await legend.evaluate((el) => ({ font: getComputedStyle(el).fontFamily, digits: getComputedStyle(el).fontVariantNumeric }));
    if (phone) {
      m.bars = [await box(page.locator('header').first()), await box(page.locator('nav').last())];
    } else {
      m.header = await box(page.locator('header').first());
      const rail = page.getByRole('button', { name: /^Waypoints \(/ }).locator('xpath=..');
      m.rail = await box(rail);
      m.railButton = await box(page.getByRole('button', { name: /^Waypoints \(/ }));

      await page.getByRole('button', { name: /^Waypoints \(/ }).click();
      await page.waitForTimeout(300);
      shots.panel = await picture(page);
      m.widths.panel = await widths(page);
      await page.getByRole('button', { name: /^Waypoints \(/ }).click();

      // The header's Settings button: named "Settings" since the one 48 px header, "⚙ Settings" in a copy from before it.
      await page.getByRole('button', { name: 'Settings', exact: true }).or(page.getByRole('button', { name: '⚙ Settings', exact: true })).first().click();
      await page.getByRole('dialog', { name: 'Settings' }).waitFor();
      shots.settings = await picture(page);
      m.widths.settings = await widths(page);
    }
  } finally {
    await context.close();
  }
  return { shots, m, record };
}

async function runApp(browser) {
  const before = await serveStatic(path.join(beforeTree, 'dist-web'));
  const after = await serveStatic(path.join(afterTree, 'dist-web'));
  const dir = path.join(out, 'app');
  fs.mkdirSync(dir, { recursive: true });
  try {
    for (const [tag, size] of [['1400x900', DESKTOP], ['390x844', PHONE]]) {
      const phone = size === PHONE;
      const b = await appRun(browser, before.url, size);
      const b2 = await appRun(browser, before.url, size);
      const a = await appRun(browser, after.url, size);

      // A run against itself: the pictures must match exactly, or a difference below could be noise.
      const noisy = [];
      for (const name of Object.keys(b.shots)) {
        const c = await comparePictures(browser, b.shots[name], b2.shots[name]);
        if (c.size || c.changed > 0) noisy.push(`${name}: ${c.size || `${c.changed} px`}`);
      }
      step(`noise: the before copy against itself, every screen (${tag})`, noisy.length === 0, noisy.join('; ') || `${Object.keys(b.shots).length} screens identical`);

      // HS6: the pair and the diff of every screen, for a person to look at.
      const counts = [];
      for (const name of Object.keys(b.shots)) {
        fs.writeFileSync(path.join(dir, `before-${name}-${tag}.png`), b.shots[name]);
        fs.writeFileSync(path.join(dir, `after-${name}-${tag}.png`), a.shots[name]);
        const c = await comparePictures(browser, b.shots[name], a.shots[name]);
        if (c.diff) fs.writeFileSync(path.join(dir, `diff-${name}-${tag}.png`), c.diff);
        counts.push(`${name} ${c.size || `${c.changed} px changed`}`);
      }
      step(`HS6 before, after and diff pictures written to ${path.relative(process.cwd(), dir) || dir} (${tag})`, Object.keys(a.shots).length === Object.keys(b.shots).length, counts.join('; '));

      // HS1: the map is untouched.
      // Red when: index.css gets `* { transition-duration: 0.01ms !important; }` (Leaflet measures its box mid-transition).
      // Seen: STEP FAIL HS1 the map is untouched: … (1400x900) — 40383 px changed, 31803 by more than 4, 19503 of those outside [0,0,1400,76] and
      //       [-20,56,236,408] (box [494,239,877,702], largest change 237); markers 8 before, 8 after, moved: before [[832,649],…] after [[832,617],…]
      //       (and at 390x844: 11851 outside the two bars, markers 24 px higher)
      // Red when: ` font-map` is taken off the map's wrapper in MapView.tsx (the legend sets in Figtree with even digits).
      // Seen: STEP FAIL HS1 the map is untouched: … (1400x900) — 24595 px changed, 17212 by more than 4, 4912 of those outside … (box [52,622,197,868],
      //       largest change 224); markers 8 before, 8 after, all in place   (HS2 red with it, below)
      const ignore = phone
        ? [union(b.m.bars[0], a.m.bars[0]), union(b.m.bars[1], a.m.bars[1])]
        : [union(b.m.header, a.m.header), inflate(union(b.m.rail, a.m.rail), 60)];
      const map = await comparePictures(browser, b.shots.map, a.shots.map, { ignore, tol: 4 });
      const markersSame = JSON.stringify(b.m.markers) === JSON.stringify(a.m.markers);
      step(`HS1 the map is untouched: every changed pixel lies in the ${phone ? 'top bar or the tab bar' : 'header or round the panel buttons'} or moved by at most 4 of 255, and the markers sit where they sat (${tag})`,
        !map.size && map.outside === 0 && markersSame,
        `${map.size || `${map.changed} px changed, ${map.beyond} by more than 4, ${map.outside} of those outside ${ignore.map(rectText).join(' and ')}${map.outside ? ` (box ${rectText(map.box)}, largest change ${map.largest})` : ''}`}; markers ${b.m.markers.length} before, ${a.m.markers.length} after, ${markersSame ? 'all in place' : `moved: before ${JSON.stringify(b.m.markers.slice(0, 4))} after ${JSON.stringify(a.m.markers.slice(0, 4))}`}`);

      // HS2: the app's text is in the bundled font; the map keeps its own.
      // Red when: ` font-map` is taken off the map's wrapper in MapView.tsx.
      // Seen: STEP FAIL HS2 fonts: … (1400x900) — body "Figtree Variable", … (Figtree loaded true); legend "Figtree Variable", "Segoe UI", …
      //       / digits tabular-nums (before Inter, system-ui, Avenir, Helvetica, Arial, sans-serif); leaflet …   (and the same at 390x844)
      step(`HS2 fonts: the app's text in Figtree, the map's legend and Leaflet in their own font with ordinary digits (${tag})`,
        /^"?Figtree Variable"?/.test(a.m.fonts.body) && a.m.fonts.figtree && a.m.legend.font === b.m.legend.font && a.m.legend.digits === 'normal' && a.m.fonts.leaflet === b.m.fonts.leaflet,
        `body ${a.m.fonts.body} (Figtree loaded ${a.m.fonts.figtree}); legend ${a.m.legend.font} / digits ${a.m.legend.digits} (before ${b.m.legend.font}); leaflet ${a.m.fonts.leaflet} (before ${b.m.fonts.leaflet})`);

      // HS3: no font from anywhere but the app; no host but the app and the tile server.
      // Red when: index.css starts with `@import url(https://fonts.googleapis.com/css2?family=Figtree);`.
      // Seen: STEP FAIL HS3 no foreign host: … (1400x900) — fonts: figtree-latin-wght-normal-D_ZTVpCC.woff2 200, jetbrains-mono-latin-wght-normal-B9CIFXIH.woff2 200;
      //       other hosts: fonts.googleapis.com   (and the same at 390x844)
      const local = new URL(after.url).host;
      const foreignFonts = a.record.fonts.filter((f) => f.host !== local || f.status !== 200);
      const foreignHosts = [...a.record.hosts].filter((h) => h !== local && !TILE_HOST.test(h));
      step(`HS3 no foreign host: every font from the app itself, no host but the app and the map tiles (${tag})`,
        foreignFonts.length === 0 && foreignHosts.length === 0,
        `fonts: ${a.record.fonts.map((f) => `${f.file} ${f.status}${f.host === local ? '' : ` from ${f.host}`}`).join(', ') || 'none'}; other hosts: ${foreignHosts.join(', ') || 'none'}`);

      // HS4: nothing too wide; on the desktop the frame of the screen keeps its size.
      // Red when: DialogFrame's phone title gets `min-w-[600px]`.
      // Seen: STEP FAIL HS4 no overflow, no shift: nothing wider than the window or its dialog (390x844) — after import-preview: the dialog's content 270 px wider than the dialog
      // Red when (the desktop half, the frame keeps its size): DialogFrame's default heightClass becomes `max-h-[80vh]`.
      // Seen: STEP FAIL HS4 no overflow, no shift: … (1400x900) — no overflow; import dialog [252,45,1148,855] → [252,90,1148,810]
      const wide = [];
      for (const [copy, run] of [['before', b], ['after', a]]) {
        for (const [screen, w] of Object.entries(run.m.widths)) {
          if (w.page > w.window) wide.push(`${copy} ${screen}: page ${w.page} > ${w.window}`);
          if (w.dialog > 1) wide.push(`${copy} ${screen}: the dialog's content ${w.dialog} px wider than the dialog`);
        }
      }
      const frame = phone ? [] : [
        ['header', b.m.header, a.m.header, (x, y) => Math.abs((x[3] - x[1]) - (y[3] - y[1])) < 0.5],
        ['map', b.m.map, a.m.map, sameRect],
        ['import dialog', b.m.importDialog, a.m.importDialog, sameRect],
      ];
      const moved = frame.filter(([, x, y, same]) => !same(x, y)).map(([n, x, y]) => `${n} ${rectText(x)} → ${rectText(y)}`);
      step(`HS4 no overflow, no shift: nothing wider than the window or its dialog${phone ? '' : '; the header, the map and the import dialog keep their size'} (${tag})`,
        wide.length === 0 && moved.length === 0,
        `${wide.join('; ') || 'no overflow'}${phone ? '' : `; ${moved.join('; ') || frame.map(([n, , y]) => `${n} ${rectText(y)}`).join(', ')}`}`);
      if (!phone) note(`panel buttons (informational): the first ${rectText(b.m.railButton)} before, ${rectText(a.m.railButton)} after`);

      const problems = [...b.record.problems, ...a.record.problems];
      step(`app: no page errors in either copy (${tag})`, problems.length === 0, problems.slice(0, 6).join(' | ') || 'none');
    }
  } finally {
    await before.close();
    await after.close();
  }
}

// ── The kneeboard cards.

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Plan three attacks (pilot 1, 2, 1, as web-smoke-cards.cjs), then share every card on the phone layout. */
async function cardsRun(browser, base, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { context, page, record } = await newAppContext(browser, { width: 1280, height: 800 }, { acceptDownloads: true, hasTouch: true });
  try {
    await page.goto(base);
    await importMission(page);
    await page.getByRole('button', { name: IMPORT_PICKED }).click();
    await toMap(page);
    await page.getByRole('button', { name: /^Attacks/ }).waitFor();
    const selectWith = (placeholder) => page.locator(`select:has(option:text("${placeholder}"))`);
    for (const attacker of [1, 2, 1]) {
      await page.getByRole('button', { name: /^Attacks/ }).click();
      await page.getByRole('button', { name: '+ Add Attack' }).click();
      const target = selectWith('Select target');
      await target.selectOption(await target.locator('option', { hasText: 'TGT1' }).first().getAttribute('value'));
      await selectWith('Select attacker').selectOption({ index: attacker });
      const weapon = selectWith('Select weapon');
      if ((await weapon.count()) && (await weapon.inputValue()) === '') await weapon.selectOption({ index: 1 });
      await page.getByRole('button', { name: /^Save attack$/ }).click();
      await page.getByRole('button', { name: /^Save attack$/ }).waitFor({ state: 'detached', timeout: 10000 });
    }
    await page.setViewportSize(PHONE);
    await page.getByRole('button', { name: /^Cards/ }).click();
    const carousel = page.getByLabel('Kneeboard cards');
    await carousel.getByRole('img').first().waitFor({ timeout: 30000 });
    // All three drawn before sharing: a press while the cards are still drawing can download none.
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Kneeboard cards"] img').length >= 3, null, { timeout: 60000 });
    await page.getByRole('button', { name: /^Share all \(3\)/ }).waitFor();
    await page.waitForTimeout(1500);
    const got = [];
    const onDownload = (d) => got.push(d);
    page.on('download', onDownload);
    await page.getByRole('button', { name: /^Share all/ }).click();
    for (let i = 0; i < 300 && got.length < 3; i++) await page.waitForTimeout(200);
    page.off('download', onDownload);
    await page.screenshot({ path: path.join(dir, 'after-share-all.png') });
    const cards = {};
    for (const d of got) {
      const file = path.join(dir, d.suggestedFilename());
      await d.saveAs(file);
      const bytes = fs.readFileSync(file);
      cards[d.suggestedFilename()] = { sha: sha(bytes), size: `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` };
    }
    return { cards, problems: record.problems };
  } finally {
    await context.close();
  }
}

async function runCards(browser) {
  const before = await serveStatic(path.join(beforeTree, 'dist-web'));
  const after = await serveStatic(path.join(afterTree, 'dist-web'));
  try {
    const b = await cardsRun(browser, before.url, path.join(out, 'cards', 'before'));
    const a = await cardsRun(browser, after.url, path.join(out, 'cards', 'after'));
    // HS7: the cards byte for byte. (A card prints today's date and the two copies are made a few seconds
    // apart: a run that crosses midnight goes red here with no real change. Run it again.)
    // Red when: one Day colour in cardTheme.ts changes (DAY_THEME textPrimary '#0F0F0F' becomes '#0F0F10').
    // Seen: STEP FAIL HS7 the kneeboard cards are byte for byte the same (…) — Viper_1-1_TGT1.png 2304x3072 b5349bc2a786… after 9bfafff012c7…;
    //       Viper_1-1_TGT1_2.png 2304x3072 b5349bc2a786… after 9bfafff012c7…; Viper_1-2_TGT1.png 2304x3072 59451db86bf0… after ec9e2f1dec24…
    const names = Object.keys(b.cards).sort();
    const differ = names.filter((n) => !a.cards[n] || a.cards[n].sha !== b.cards[n].sha);
    step('HS7 the kneeboard cards are byte for byte the same (three cards, shared on the phone layout, map tiles blocked)',
      names.length === 3 && Object.keys(a.cards).length === 3 && differ.length === 0,
      names.map((n) => `${n} ${b.cards[n].size} ${b.cards[n].sha.slice(0, 12)}… ${a.cards[n] ? (a.cards[n].sha === b.cards[n].sha ? 'same' : `after ${a.cards[n].sha.slice(0, 12)}…`) : 'missing after'}`).join('; ') || 'no cards downloaded');
    const problems = [...b.problems, ...a.problems];
    step('cards: no page errors in either copy', problems.length === 0, problems.slice(0, 6).join(' | ') || 'none');
  } finally {
    await before.close();
    await after.close();
  }
}

// ── The component gallery.

async function runGallery(browser) {
  const dev = await startDevServer(afterTree);
  try {
    for (const [tag, size] of [['1400x900', DESKTOP], ['390x844', PHONE]]) {
      const phone = size === PHONE;
      const { context, page, record } = await newAppContext(browser, size);
      try {
        await page.goto(`${dev.url}ui-gallery.html`);
        await page.locator('[data-gallery="button-md"]').first().waitFor({ timeout: 120000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        // The window only: the whole page is taller than a browser can capture in one picture.
        await page.screenshot({ path: path.join(out, `gallery-${tag}.png`) });
        const g = await page.evaluate(() => {
          const boxes = (name, inner) => [...document.querySelectorAll(`[data-gallery="${name}"]`)].map((el) => (inner ? el.firstElementChild : el).getBoundingClientRect());
          const heights = (name, inner) => [...new Set(boxes(name, inner).map((r) => Math.round(r.height * 10) / 10))];
          const sizes = (name) => [...new Set(boxes(name).map((r) => `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`))];
          const text = document.querySelector('[data-gallery="button-text"]');
          const dialog = document.querySelector('[data-gallery="dialog-desktop"] [role="dialog"]');
          return {
            md: heights('button-md'), lg: heights('button-lg'), compact: heights('button-compact'), sm: heights('button-sm'), bar: heights('button-bar'),
            text: heights('button-text'), textFont: getComputedStyle(text).fontSize,
            iconMd: sizes('iconbutton-md'), iconSm: sizes('iconbutton-sm'),
            chipSm: heights('chip-sm', true), chipLg: heights('chip-lg', true),
            barTabs: [...new Set([...document.querySelectorAll('[data-gallery="tabs-bar"] button')].map((b) => Math.round(b.getBoundingClientRect().height * 10) / 10))],
            tapSm: getComputedStyle(document.documentElement).getPropertyValue('--tap-sm').trim(),
            radius: dialog ? getComputedStyle(dialog).borderTopLeftRadius : 'none',
            page: document.documentElement.scrollWidth, window: innerWidth,
          };
        });
        const all = (v, want) => v.length > 0 && v.every(want);
        const want = {
          'button-md >= 44': all(g.md, (h) => h >= 44),
          'button-lg 52': all(g.lg, (h) => h === 52),
          'button-compact >= 44': all(g.compact, (h) => h >= 44),
          'button-sm 36': all(g.sm, (h) => h === 36),
          'button-bar 36': all(g.bar, (h) => h === 36),
          [`button-text ${phone ? 44 : 32} at ${phone ? 15 : 13} px`]: all(g.text, (h) => h === (phone ? 44 : 32)) && g.textFont === (phone ? '15px' : '13px'),
          'iconbutton-md 44x44': all(g.iconMd, (s) => s === '44x44'),
          [`iconbutton-sm ${phone ? '44x44' : '32x32'}`]: all(g.iconSm, (s) => s === (phone ? '44x44' : '32x32')),
          'chip-sm 22, chip-lg 28': all(g.chipSm, (h) => h === 22) && all(g.chipLg, (h) => h === 28),
          'phone bar tabs 56': all(g.barTabs, (h) => h === 56),
          [`--tap-sm ${phone ? '44px' : '32px'}`]: g.tapSm === (phone ? '44px' : '32px'),
          'dialog corners 24px': g.radius === '24px',
          'nothing wider than the window': g.page <= g.window,
        };
        const missed = Object.entries(want).filter(([, ok]) => !ok).map(([k]) => k);
        // HS5: the building blocks at their sizes.
        // Red when: Button's compact size has `min-h-btn-sm` for `min-h-tap`.
        // Seen: STEP FAIL HS5 sizes: … (1400x900) — wrong: button-compact >= 44; md 44, lg 52, compact 36, sm 36, bar 36, …   (and the same at 390x844)
        step(`HS5 sizes: every button, icon button, chip and tab of the gallery at its size (${tag})`, missed.length === 0,
          `${missed.length ? `wrong: ${missed.join(', ')}; ` : ''}md ${g.md}, lg ${g.lg}, compact ${g.compact}, sm ${g.sm}, bar ${g.bar}, text ${g.text} at ${g.textFont}, icon md ${g.iconMd}, icon sm ${g.iconSm}, chips ${g.chipSm} / ${g.chipLg}, bar tabs ${g.barTabs}, --tap-sm ${g.tapSm}, dialog corners ${g.radius}, width ${g.page} of ${g.window}; fonts ${record.fonts.map((f) => `${f.file} ${f.status}`).join(', ') || 'none'}`);
        step(`gallery: no page errors (${tag})`, record.problems.length === 0, record.problems.slice(0, 6).join(' | ') || 'none');

        if (pictures && !phone) {
          // The main button three ways on a panel: ready, greyed as built, and the ready one at half strength.
          const cells = page.locator('[data-surface="navy"] [data-sample="import"]').first().locator('xpath=..');
          await cells.evaluate((el) => {
            const half = el.querySelector('[data-sample="import"][data-state="default"]').cloneNode(true);
            half.style.opacity = '0.5';
            half.setAttribute('data-state', 'half');
            el.appendChild(half);
          });
          // The row as wide as its three buttons, with a margin of the panel round them, for a picture of just those.
          await cells.evaluate((el) => {
            el.style.width = 'max-content';
            el.style.padding = '16px';
          });
          await page.waitForTimeout(200);
          await cells.screenshot({ path: path.join(pictures, 'main-button-ready-grey-faded.png') });
          note(`picture written: ${path.join(pictures, 'main-button-ready-grey-faded.png')}`);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await dev.close();
  }
}

// ── The 3D playback.

/** Wait until the playback stops drawing (a fade or a callout done), as playback-shots.cjs does. */
async function playbackIdle(page) {
  await page.waitForTimeout(500);
  for (let i = 0; i < 30; i++) {
    const a = await page.evaluate(() => window.__pb.stats().renders);
    await page.waitForTimeout(400);
    if ((await page.evaluate(() => window.__pb.stats().renders)) === a) return;
  }
}

/** The overlay of one tree, paused at the start with the Show menu open. */
async function playbackShot(browser, tree, withPictures) {
  const dev = await startDevServer(tree);
  const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const problems = [];
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    await page.goto(`${dev.url}playback-harness.html?tiles=synthetic&notes=1`);
    await page.waitForFunction(() => window.__pb && window.__pb.ready, null, { timeout: 180000, polling: 100 });
    await page.evaluate(() => {
      window.__pb.pause();
      window.__pb.seek(window.__pb.snapshot().start);
    });
    await playbackIdle(page);
    await page.getByRole('button', { name: 'Show ▾' }).click();
    await page.locator('#pb-show').waitFor();
    await page.mouse.move(1, 1);
    await playbackIdle(page);
    // The frame-time readout says how long the last frame took, which differs from run to run.
    const pin = () => page.evaluate(() => {
      for (const el of document.querySelectorAll('[role="dialog"] *')) {
        if (el.children.length === 0 && /ms a frame/.test(el.textContent || '')) el.textContent = 'dev: 100.0 ms a frame (10 fps)';
      }
    });
    await pin();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const shot = await page.screenshot();
    const look = await page.evaluate(() => {
      const root = document.querySelector('[role="dialog"]');
      const mono = root.querySelector('.font-mono');
      const show = document.querySelector('#pb-show').getBoundingClientRect();
      const button = [...root.querySelectorAll('button')].find((b) => /^Show/.test(b.textContent || '')).getBoundingClientRect();
      return {
        font: getComputedStyle(root).fontFamily, mono: mono ? getComputedStyle(mono).fontFamily : 'none', scheme: getComputedStyle(root).colorScheme,
        legacy: root.classList.contains('legacy-ui'),
        show: [Math.floor(Math.min(show.left, button.left)) - 8, Math.floor(button.top) - 8, Math.ceil(Math.max(show.right, button.right)) + 8, Math.ceil(show.bottom) + 8],
      };
    });
    let without = null;
    if (withPictures) {
      // The same overlay with today's lettering let go, as it would look without the fence.
      await page.evaluate(() => document.querySelector('[role="dialog"]').classList.remove('legacy-ui'));
      await pin();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      without = await page.screenshot();
    }
    return { shot, look, without, problems };
  } finally {
    await context.close();
    await dev.close();
  }
}

async function runPlayback(browser) {
  const b = await playbackShot(browser, beforeTree, false);
  const b2 = await playbackShot(browser, beforeTree, false);
  const a = await playbackShot(browser, afterTree, !!pictures);
  const dir = path.join(out, 'playback');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'before-show-open-1400x900.png'), b.shot);
  fs.writeFileSync(path.join(dir, 'after-show-open-1400x900.png'), a.shot);
  const noise = await comparePictures(browser, b.shot, b2.shot);
  step('noise: the before playback against itself (1400x900, Show open)', !noise.size && noise.changed === 0, noise.size || `${noise.changed} px changed${noise.changed ? ` (box ${rectText(noise.box)})` : ''}`);
  const c = await comparePictures(browser, b.shot, a.shot);
  if (c.diff) fs.writeFileSync(path.join(dir, 'diff-show-open-1400x900.png'), c.diff);
  // HS8: the playback looks as it did.
  // Red when: ` legacy-ui` is taken out of PlaybackOverlay.tsx.
  // Seen: STEP FAIL HS8 the 3D playback is unchanged: … — 65236 px changed (box [16,14,1383,890], largest change 240); before: Inter, system-ui, …
  //       / mono Consolas, Monaco, monospace / normal; after: "Figtree Variable", … / mono "JetBrains Mono Variable", … / dark, legacy-ui false
  step('HS8 the 3D playback is unchanged: its overlay at 1400x900, paused, Show open, pixel for pixel',
    !c.size && c.changed === 0,
    `${c.size || `${c.changed} px changed${c.changed ? ` (box ${rectText(c.box)}, largest change ${c.largest})` : ''}`}; before: ${b.look.font} / mono ${b.look.mono} / ${b.look.scheme}; after: ${a.look.font} / mono ${a.look.mono} / ${a.look.scheme}, legacy-ui ${a.look.legacy}`);
  const problems = [...b.problems, ...b2.problems, ...a.problems];
  step('playback: no page errors in either copy', problems.length === 0, problems.slice(0, 6).join(' | ') || 'none');

  if (pictures && a.without) {
    // Today's lettering on top, the new lettering below: the timeline strip, then the Show menu.
    const strip = [0, 725, DESKTOP.width, DESKTOP.height];
    fs.writeFileSync(path.join(pictures, 'playback-timeline-today-above-new-below.png'), await compose(browser, [[a.shot, strip], [a.without, strip]], 'column'));
    fs.writeFileSync(path.join(pictures, 'playback-show-menu-today-left-new-right.png'), await compose(browser, [[a.shot, a.look.show], [a.without, a.look.show]], 'row'));
    fs.writeFileSync(path.join(pictures, 'playback-whole-today.png'), a.shot);
    fs.writeFileSync(path.join(pictures, 'playback-whole-new-lettering.png'), a.without);
    note(`pictures written: ${pictures}/playback-*.png`);
  }
}

(async () => {
  let browser;
  try {
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: GL_FLAGS });
    console.log(`STEP before ${beforeTree || '(not needed)'}; after ${afterTree}; parts ${[...parts].join(', ')}`);
    if (parts.has('app')) await runApp(browser);
    if (parts.has('cards')) await runCards(browser);
    if (parts.has('gallery')) await runGallery(browser);
    if (parts.has('playback')) await runPlayback(browser);
  } catch (e) {
    step('run', false, (e && e.stack) || String(e));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  console.log(failures.length ? `FAILED: ${failures.join(', ')}` : 'ALL PASSED');
  process.exit(failures.length ? 1 : 0);
})();
