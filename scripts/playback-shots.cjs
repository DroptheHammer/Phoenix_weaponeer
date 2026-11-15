// Screenshot checks for the 3D strike playback, on the dev-only harness page
// (playback-harness.html, src/components/playback/dev/). One self-contained
// run: it starts the Vite dev server itself on a free port, drives Chromium
// with software WebGL, writes PNG screenshots into the folder given, prints
// one STEP line per check, and always closes the browser and the server.
// Exits 1 if any check fails.
//
//   node scripts/playback-shots.cjs <screenshotDir>          the checks (synthetic tiles, offline)
//   node scripts/playback-shots.cjs <screenshotDir> --live   real map and terrain tiles, screenshots only
//
// Environment:
//   PLAYWRIGHT_MODULE   path to a playwright-core (or playwright) folder; else require('playwright')
//   CHROME_PATH         the Chromium binary to launch; else Playwright's own
//   PLAYBACK_GL_FLAGS   Chromium flags for WebGL, space-separated
//                       (default "--use-angle=swiftshader --enable-unsafe-swiftshader")
//
// Every pixel is read from a PAGE screenshot, never from the WebGL canvas
// itself: with three's default preserveDrawingBuffer false, reading the
// canvas back gives a blank image.
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const zlib = require('zlib');

const args = process.argv.slice(2);
const live = args.includes('--live');
const out = args.find((a) => !a.startsWith('--'));
if (!out) {
  console.error('usage: node scripts/playback-shots.cjs <screenshotDir> [--live]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(__dirname, '..');
const GL_FLAGS = (process.env.PLAYBACK_GL_FLAGS || '--use-angle=swiftshader --enable-unsafe-swiftshader').split(/\s+/).filter(Boolean);

const failures = [];
function step(name, ok, detail) {
  console.log(`STEP ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

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

// ── A small PNG reader (8-bit RGB or RGBA, not interlaced: what Chromium's screenshots are).
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
  const ch = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= ch ? px[y * stride + x - ch] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0;
      let r;
      if (f === 0) r = v;
      else if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = r & 255;
    }
  }
  return { width, height, at(x, y) {
    const i = (Math.round(y) * width + Math.round(x)) * ch;
    return [px[i], px[i + 1], px[i + 2]];
  } };
}

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const near = (p, q, tol) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol;
const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
function patch(img, [cx, cy], r) {
  const px = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x >= 0 && y >= 0 && x < img.width && y < img.height) px.push(img.at(x, y));
  }
  return px;
}
function median(px) {
  const m = (k) => px.map((p) => p[k]).sort((a, b) => a - b)[px.length >> 1];
  return [m(0), m(1), m(2)];
}
// The arrow is the jet's colour on top and darker shades of it underneath and on the fin: cyan
// whatever the shade. Neither drape colour nor the navy background passes this. The target ring
// did until it took the planner's red, and the path and the trail did until they took the planner's
// colours: see check 2 for how it allowed for them.
const jetLike = (p) => p[2] > p[0] + 80 && p[1] > p[0] + 80 && Math.abs(p[1] - p[2]) < 70;

// ── Page helpers.
async function openPage(browser, url, w, h, waitForScene = true) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') problems.push(`console error: ${t}`);
    else if (/too many active webgl contexts/i.test(t)) problems.push(`console: ${t}`);
  });
  await page.goto(url);
  if (waitForScene) await waitReady(page);
  return { context, page, problems };
}
const waitReady = (page, timeout = 60000) => page.waitForFunction(() => window.__pb && window.__pb.ready, null, { timeout, polling: 100 });
const pbEval = (page, fn, arg) => page.evaluate(fn, arg);
async function settle(page, ms = 250) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(ms);
}
const shotPath = (name) => path.join(out, `${name}.png`);
async function shot(page, name) {
  return decodePng(await page.screenshot({ path: shotPath(name) }));
}
const dialogGone = (page) => page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 10000 });
/**
 * Hide or show the 2D overlay (the action points' discs, the planner's words, the jets' labels). It is
 * drawn over the 3D on purpose (the pull-up's disc sits on the arrow as it passes, the jet's label beside
 * it), so the checks that read the 3D's own pixels (the arrow, the lines' colours) look under it.
 */
const overlay = (page, shown) => page.evaluate((s) => {
  const c = document.querySelector('[role="dialog"] canvas[data-labels]');
  if (c) c.style.visibility = s ? '' : 'hidden';
}, shown);
/**
 * Wait `ms`, then until the scene stops drawing (a callout's fade done). Each frame's fade step is capped
 * at 0.1 s, as the clock's is, so on the software renderer's few frames a second a fade takes longer than
 * its half second of wall time.
 */
async function settleIdle(page, ms) {
  await page.waitForTimeout(ms);
  for (let i = 0; i < 30; i++) {
    const a = await pbEval(page, () => __pb.stats().renders);
    await page.waitForTimeout(400);
    if ((await pbEval(page, () => __pb.stats().renders)) === a) return;
  }
}

// ── The checks.

/**
 * Check 1: flat ground, paused, home view: each part of the drape shows its exact colour (no tone
 * mapping, sRGB right). West and north are mirror images about the target's latitude, so a drape
 * drawn upside down (flipY lost, or an ImageBitmap source) cannot pass both; east and west catch a
 * left-right mirror. Run with Show › Whole run-in on (the time bar, and so Home, from the start of the
 * whole run-in), the view these sample points were laid out for; the points are projected through
 * the live camera. Checks 2 and 3 run in the same state after it.
 *
 * Proven red 2026-11-14, each by one temporary edit to scene/terrainLayer.ts:
 * `texture.colorSpace = SRGBColorSpace` removed (the colours wash out; 3a goes red with it):
 *   STEP FAIL 1 drape colours exact on flat ground (1400x900) — west at (1095,280): median 229,219,196 vs 200,180,140, 0% within 3; north at (1188,373): median 219,208,229 vs 180,160,200, 0% within 3; east at (686,295): median 192,212,179 vs 134,168,115, 0% within 3
 * `texture.flipY = false` added (the drape upside down):
 *   STEP FAIL 1 drape colours exact on flat ground (1400x900) — west at (1095,280): median 180,160,200 vs 200,180,140, 0% within 3; north at (1188,373): median 180,160,200 vs 180,160,200, 100% within 3; east …, 100% within 3
 * The first proof again once the points were projected through the live camera, Whole run-in on:
 *   STEP FAIL 1 drape colours exact on flat ground (1400x900) — west at (1220,260): median 229,219,196 vs 200,180,140, 0% within 3; north at (1357,364): median 219,208,229 vs 180,160,200, 0% within 3; east at (755,277): median 192,212,179 vs 134,168,115, 0% within 3
 *   STEP FAIL 3a hillshade: north-west flank brighter (1400x900) — ground real; NW 202,223,188 (lum 216), flat 157, SE 176,194,164 (lum 188)
 */
async function checkColours(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(true); __pb.setGround('flat'); __pb.goHome(); __pb.seek(__pb.moments.t0); });
  await settle(page, 400);
  const img = await shot(page, `${tag}-01-flat-home`);
  const { samples, colours } = await pbEval(page, () => ({ samples: __pb.samples, colours: __pb.colours }));
  const parts = [];
  let ok = true;
  for (const side of ['west', 'north', 'east']) {
    const p = await pbEval(page, ([e, n]) => __pb.projectPoint(e, n, 0), samples[side]);
    const want = hex(colours[side]);
    const px = patch(img, p, 4);
    const hits = px.filter((q) => near(q, want, 3)).length / px.length;
    ok = ok && hits >= 0.8;
    parts.push(`${side} at (${p.map(Math.round)}): median ${median(px)} vs ${want}, ${(hits * 100).toFixed(0)}% within 3`);
  }
  step(`1 drape colours exact on flat ground (${tag})`, ok, parts.join('; '));
}

/**
 * Check 2: the arrow itself is drawn where the scene says the jet is. Jet-coloured pixels within
 * ARROW_PATCH px of that point: the path and the trail run through the same patch in the same
 * colour, so the count must be more than those lines alone can give (ARROW_MIN). The moments are
 * all well away from the target, whose ring is the jet's colour too.
 *
 * Measured 2026-11-14 at both window sizes: with the arrow 164 / 139 / 126 px (the lowest of all
 * runs 121); with the arrow shrunk to nothing, the lines alone give 19 / 51 / 51. Proven red by
 * that mutation (jetLayer.ts afterCamera, the arrow's scale × 1e-6):
 *   STEP FAIL 2 jet arrow on screen (1400x900) — start t=-151.2 at 141,549: 19 px; run-in t=-94.0 at 517,442: 51 px; pull-up t=-36.8 at 802,365: 51 px
 * and again once Home framed the attack's own box (Whole run-in set first; green 170 / 144 / 130 px):
 *   STEP FAIL 2 jet arrow on screen (1400x900) — start t=-151.2 at 144,573: 19 px; run-in t=-94.0 at 583,444: 53 px; pull-up t=-36.8 at 901,356: 51 px (need 90)
 *   STEP FAIL 5b after the rebuild, the jet arrow on screen (1400x900-rebuilt) — start t=-151.2 at 174,554: 20 px; run-in …: 53 px; pull-up …: 50 px (need 90)
 * (The first version of this check counted within 20 px, needed 30, and included the release
 * moment beside the ring: with the arrow gone it still passed, on 35 / 99 / 211 px of lines and ring.)
 * Since the path and trail wear the planner's colours (2026-11-14) the lines give no cyan at all: the
 * same mutation reads 0 / 0 / 0 px at both sizes, and green is 170 / 140 / 128 and 168 / 138 / 122.
 * Since the 2D overlay carries the action points (2026-11-14) the pull-up's disc covers the arrow at
 * the pull-up moment (0 px there), so the overlay is hidden for these shots: the check is the 3D's arrow.
 * Green with it hidden: 172 / 138 / 130 px at 1400×900, 171 / 138 / 127 at 1024×768. Proven red again
 * by the arrow-shrink mutation:
 *   STEP FAIL 2 jet arrow on screen (1400x900) — start t=-151.2 at 159,563: 0 px; run-in t=-94.0 at 586,438: 0 px; pull-up t=-36.8 at 896,352: 0 px (need 90)
 *   STEP FAIL 5b after the rebuild, the jet arrow on screen (1400x900-rebuilt) — … 0 px; … 0 px; … 0 px (need 90)
 */
const ARROW_PATCH = 10;
const ARROW_MIN = 90;
async function checkJet(page, tag, label = '2 jet arrow on screen') {
  // The moments include the whole run-in's start: the time bar must reach back that far (it does after
  // check 1, and after a rebuild, which keeps the choice; set again so the check stands on its own).
  await pbEval(page, () => __pb.setRange(true));
  const m = await pbEval(page, () => __pb.moments);
  const parts = [];
  let ok = true;
  await overlay(page, false);
  try {
    for (const [name, t] of [['start', m.t0], ['run-in', (m.t0 + m.pullUp) / 2], ['pull-up', m.pullUp]]) {
      await pbEval(page, (tt) => __pb.seek(tt), t);
      await settle(page);
      const p = await pbEval(page, () => __pb.project(0, 'jet'));
      const img = await shot(page, `${tag}-02-jet-${name}`);
      const n = p ? patch(img, p.map(Math.round), ARROW_PATCH).filter(jetLike).length : 0;
      ok = ok && n >= ARROW_MIN;
      parts.push(`${name} t=${t.toFixed(1)} at ${p ? p.map(Math.round) : 'none'}: ${n} px`);
    }
  } finally {
    await overlay(page, true); // a step that throws must not leave the later checks without the overlay
  }
  step(`${label} (${tag})`, ok, `${parts.join('; ')} (need ${ARROW_MIN})`);
}

/**
 * Check 3: real ground: the hill's sunward (north-west) flank is brighter; the bomb's last sample sits on the ring.
 *
 * 3b proven red 2026-11-14 (jetLayer.ts placeRing, the ring's centre moved 600 m east: `ringCentre.set(t.x + 600, …)`):
 *   STEP FAIL 3b bomb's last sample at the target ring (1400x900) — on screen 10.8 px apart 0.05 s before impact; in the world 0.29 m apart 1 ms before impact; target at height 0.00 m
 * The ring is the target layer's since it took the planner's red (one ring per distinct target, read
 * through `project(0, 'target')` as before). Proven red again on it 2026-11-14 (scene/targetLayer.ts
 * placeRing, `mk.ringCentre.set(t.x + 600, …)`):
 *   STEP FAIL 3b bomb's last sample at the target ring (1400x900) — on screen 12.5 px apart 0.05 s before impact; in the world 0.29 m apart 1 ms before impact; target at height 0.00 m (the ground there is 0)
 *   STEP FAIL 3b … (1024x768) — on screen 9.2 px apart 0.05 s before impact; …
 */
async function checkReal(page, tag) {
  await pbEval(page, () => { __pb.setGround('real'); __pb.goHome(); __pb.seek(__pb.moments.t0); });
  await settle(page, 400);
  const ground = await pbEval(page, () => __pb.terrain().ground);
  const img = await shot(page, `${tag}-03-real-hill`);
  const hill = await pbEval(page, () => {
    const h = __pb.hill, d = (0.8 * h.sigma_m) / Math.SQRT2;
    const at = (e, n) => __pb.projectPoint(e, n, h.heightAt(e, n));
    return { nw: at(h.e_m - d, h.n_m + d), se: at(h.e_m + d, h.n_m - d), flat: __pb.colours.east };
  });
  const nw = median(patch(img, hill.nw.map(Math.round), 3));
  const se = median(patch(img, hill.se.map(Math.round), 3));
  const flatLum = lum(hex(hill.flat));
  const shadeOk = ground === 'real' && lum(nw) > flatLum + 4 && lum(se) < flatLum - 4 && lum(nw) > lum(se) + 8;
  step(`3a hillshade: north-west flank brighter (${tag})`, shadeOk,
    `ground ${ground}; NW ${nw} (lum ${lum(nw).toFixed(0)}), flat ${flatLum.toFixed(0)}, SE ${se} (lum ${lum(se).toFixed(0)})`);

  await pbEval(page, () => __pb.seek(__pb.moments.impact - 0.05));
  await settle(page);
  const bomb = await pbEval(page, () => __pb.project(0, 'bomb'));
  const ring = await pbEval(page, () => __pb.project(0, 'target'));
  await shot(page, `${tag}-03-bomb-at-ring`);
  const w = await pbEval(page, () => __pb.bombAtImpact());
  const px = bomb && ring ? Math.hypot(bomb[0] - ring[0], bomb[1] - ring[1]) : Infinity;
  const m = Math.hypot(w.bomb[0] - w.target[0], w.bomb[1] - w.target[1], w.bomb[2] - w.target[2]);
  step(`3b bomb's last sample at the target ring (${tag})`, px <= 3 && m <= 1 && Math.abs(w.target[1]) < 0.5,
    `on screen ${px.toFixed(1)} px apart 0.05 s before impact; in the world ${m.toFixed(2)} m apart 1 ms before impact; target at height ${w.target[1].toFixed(2)} m (the ground there is 0)`);
}

/** Check 7: every control inside the window. */
async function checkFit(page, tag, w, h) {
  await shot(page, `${tag}-07-fit`);
  const boxes = await page.$$eval('[role="dialog"] button, [role="dialog"] input, [role="dialog"] select, [role="dialog"] p', (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30), l: r.left, t: r.top, r: r.right, b: r.bottom };
    }));
  const canvas = await page.$eval('[role="dialog"] canvas', (c) => [c.clientWidth, c.clientHeight]);
  const outside = boxes.filter((b) => b.l < 0 || b.t < 0 || b.r > w + 0.5 || b.b > h + 0.5);
  step(`7 every control inside ${w}x${h} (${tag})`, boxes.length > 0 && outside.length === 0,
    `${boxes.length} controls and notes; canvas ${canvas.join('x')}${outside.length ? `; outside: ${outside.map((b) => `${b.name} [${[b.l, b.t, b.r, b.b].map(Math.round)}]`).join(', ')}` : ''}`);
}

/**
 * Check 7b: the rows under the picture leave it room. At each window size every control (buttons, the
 * range, the selects, the small print, the sliders, the folded list's summary and the labels) is inside
 * the window; the 3D canvas is at least FLOOR px (1000×420 at 1024×768, 1350×560 at 1400×900), with the
 * lane, the theater note (?notes=1) and the real-ground note all showing; the credits and the
 * "Elevation sources" summary are one row, the credits' first line level with the summary (a row
 * saved); and the software-renderer line, when it is shown, is a chip on the picture and not a row
 * under it.
 *
 * Measured 2026-11-14 (one lane, ground real, the theater note shown, the software chip up): canvas
 * 1400×702 and 1024×554. With one lane the floors are far from tight (the row the merge saves is 16
 * px of 702), so the floors alone could not go red under "the credits row split in two"; the "one
 * row" clause holds the merge instead (the credits' top level with the summary's, within 6 px).
 * The floors become the tight ones once four lanes and an Apply line stand under the picture.
 *
 * Also run on the four-ship with the theater note (four lanes, the line of frag warnings under them, and
 * the note), at both sizes. Measured 2026-11-15: canvas 1400×592 and 1024×444 (floors 560 and 420); the one
 * lane with its warnings line, 1400×682 and 1024×534.
 *
 * Proven red on the four-ship 2026-11-15 by two temporary edits to ui.ts, each lane 40 px tall and the box
 * of lanes allowed 160 px (`LANE` 'h-[40px]', `LANES` 'max-h-[160px]': the canvas 40 px shorter):
 *   STEP FAIL 7b canvas at least 1000x420 with all 4 lanes, the warnings line and every control inside 1024x768; … (1024x768-strike4) — canvas 1024x404 (want ≥ 1000x420); 4 lanes (want 4); 25 controls; credits at 728, sources at 728 (left 896) (one row true); software line a chip on the picture
 *
 * Proven red 2026-11-14 by one temporary edit to StatusNotes.tsx, the credits row's wrapper
 * `flex flex-wrap items-start gap-x-3 text-gray-500` taken back to a plain `text-gray-500` block (the
 * credits and the summary on two rows; the canvas 16 px shorter):
 *   STEP FAIL 7b canvas at least 1350x560 with the lane and every control inside 1400x900; … (1400x900) — canvas 1400x686 (want ≥ 1350x560); 1 lane; 20 controls; credits at 860, sources at 876 (left 16) (one row false); software line a chip on the picture
 *   STEP FAIL 7b … (1024x768) — canvas 1024x554 (want ≥ 1000x420); 1 lane; 20 controls; credits at 728, sources at 744 (left 16) (one row false); …
 */
const LAYOUT_FLOOR = { 1024: [1000, 420], 1400: [1350, 560] };
async function checkLayout(page, tag, w, h, lanesWanted = 1) {
  await pbEval(page, () => __pb.pause());
  await settle(page);
  const r = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const box = (e) => {
      const b = e.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom };
    };
    const controls = [...d.querySelectorAll('button, input, select, p, [role="slider"], summary, label')]
      .map((e) => ({ name: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30), ...box(e) }));
    const textOf = (e) => e.textContent || '';
    return {
      controls,
      canvas: box(d.querySelector('canvas')),
      lanes: d.querySelectorAll('[data-lane]').length,
      credits: [...d.querySelectorAll('p')].filter((p) => /three\.js/.test(textOf(p))).map(box)[0] || null,
      sources: [...d.querySelectorAll('summary')].filter((s) => /Elevation sources/.test(textOf(s))).map(box)[0] || null,
      softRow: [...d.querySelectorAll('p')].filter((p) => /draws 3D in software/.test(textOf(p))).length,
      softChip: [...d.querySelectorAll('div')].filter((e) => e.children.length === 0 && /draws 3D in software/.test(textOf(e))).map(box)[0] || null,
    };
  });
  const [fw, fh] = LAYOUT_FLOOR[w];
  const cw = r.canvas.r - r.canvas.l, ch = r.canvas.b - r.canvas.t;
  const outside = r.controls.filter((b) => b.l < 0 || b.t < 0 || b.r > w + 0.5 || b.b > h + 0.5);
  const oneRow = !!r.credits && !!r.sources && Math.abs(r.credits.t - r.sources.t) <= 6 && r.sources.l >= r.credits.l;
  const chipOnPicture = r.softRow === 0 && (!r.softChip || (r.softChip.l >= r.canvas.l && r.softChip.r <= r.canvas.r && r.softChip.t >= r.canvas.t && r.softChip.b <= r.canvas.b));
  step(`7b canvas at least ${fw}x${fh} with ${lanesWanted === 1 ? 'the lane' : `all ${lanesWanted} lanes`}, the warnings line and every control inside ${w}x${h}; credits and sources on one row; the software line on the picture (${tag})`,
    r.lanes === lanesWanted && r.controls.length > 0 && outside.length === 0 && cw >= fw && ch >= fh && oneRow && chipOnPicture,
    `canvas ${Math.round(cw)}x${Math.round(ch)} (want ≥ ${fw}x${fh}); ${r.lanes} lane${r.lanes === 1 ? '' : 's'} (want ${lanesWanted}); ${r.controls.length} controls${outside.length ? `, outside: ${outside.map((b) => b.name).join(', ')}` : ''}; credits at ${r.credits ? Math.round(r.credits.t) : 'none'}, sources at ${r.sources ? `${Math.round(r.sources.t)} (left ${Math.round(r.sources.l)})` : 'none'} (one row ${oneRow}); software line ${r.softChip ? 'a chip on the picture' : 'not shown'}${r.softRow ? ', and also a row under it' : ''}`);
}

/**
 * Check 32: the timeline wears the planner's colours. At 1400×900, paused at the time bar's start: the
 * lane's climb stretch is the climb yellow at its middle pixel, its attack stretch the attack red (both
 * ±3 of the colour), its route stretch shows both the route blue (the dashes) and the panel (between
 * them); the five letters AP, POP, PDP, TRK and REL are chips on the lane; the IP crossing, off the
 * time bar's start, is one "‹" group; and the scrubber's own band is yellow under the climb too.
 *
 * Proven red 2026-11-14 by one temporary edit to ui.ts, bandBackground's `LINE_STYLE[style]` taken as
 * `LINE_STYLE[style === 'climb' ? 'pullDown' : style]` (the climb drawn in the pull-down orange):
 *   STEP FAIL 32 the timeline wears the planner's colours: … (1400x900) — climb at 432,795: 249,115,22 (want #fbbf24) false; attack at 631,795: 239,68,68 (want #ef4444) true; route: 62 blue and 41 panel pixels along it (dashes, want ≥ 8 and ≥ 4); chips AP POP PDP TRK REL (all five); ‹ elements 1; scrubber's climb at 428,766: 249,115,22 false
 * Green: 251,191,36 on the lane and on the scrubber's band, 62 blue and 43 panel pixels along the route
 * (the 10 px dash is 6 on, 4 off), the attack stretch 239,68,68.
 */
async function checkLaneColours(page, tag) {
  // The default range, as a player first sees it; the range is put back as it was, for the checks after.
  const wasWhole = await pbEval(page, () => __pb.show().wholeRunIn);
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  const img = await shot(page, `${tag}-32-lane-colours`);
  const lane = (await pbEval(page, () => __pb.lanes()))[0];
  const scrub = await page.$$eval('[role="dialog"] [data-scrub-band]', (els) => els.map((e) => {
    const b = e.getBoundingClientRect();
    return { style: e.getAttribute('data-scrub-band'), l: b.left, t: b.top, r: b.right, b: b.bottom };
  }));
  const parts = [];
  let ok = !!lane;
  const mid = (b) => [(b.l + b.r) / 2, (b.t + b.b) / 2];
  for (const [style, colour] of [['climb', '#fbbf24'], ['attack', '#ef4444']]) {
    const band = lane?.bands.find((s) => s.style === style);
    const p = band ? img.at(...mid(band.box)) : null;
    const good = !!p && near(p, hex(colour), 3);
    ok = ok && good;
    parts.push(`${style} at ${band ? mid(band.box).map(Math.round) : 'none'}: ${p ? p.join(',') : 'none'} (want ${colour}) ${good}`);
  }
  const route = lane?.bands.find((s) => s.style === 'route');
  let blue = 0, panel = 0;
  if (route) {
    const y = (route.box.t + route.box.b) / 2;
    for (let x = Math.ceil(route.box.l) + 4; x < route.box.r - 2; x++) {
      const p = img.at(x, y);
      if (near(p, hex('#60a5fa'), 3)) blue++;
      else if (near(p, hex('#16213e'), 3)) panel++;
    }
  }
  ok = ok && blue >= 8 && panel >= 4;
  parts.push(`route: ${blue} blue and ${panel} panel pixels along it (dashes, want ≥ 8 and ≥ 4)`);
  const letters = (lane?.chips || []).map((c) => c.letters);
  const have = ['AP', 'POP', 'PDP', 'TRK', 'REL'].every((l) => letters.includes(l));
  const pins = await page.$$eval('[role="dialog"] [data-pinned-mark]', (els) => els.filter((e) => (e.textContent || '').trim() === '‹').length);
  ok = ok && have && pins === 1;
  parts.push(`chips ${letters.join(' ')} (${have ? 'all five' : 'missing some'}); ‹ elements ${pins}`);
  const sClimb = scrub.find((s) => s.style === 'climb');
  const sp = sClimb ? img.at(...mid(sClimb)) : null;
  const sGood = !!sp && near(sp, hex('#fbbf24'), 3);
  ok = ok && sGood;
  parts.push(`scrubber's climb at ${sClimb ? mid(sClimb).map(Math.round) : 'none'}: ${sp ? sp.join(',') : 'none'} ${sGood}`);
  step(`32 the timeline wears the planner's colours: yellow climb, red attack, dashed blue route, lettered chips, one ‹ (${tag})`, ok, parts.join('; '));
  await pbEval(page, (whole) => __pb.setRange(whole), wasWhole);
}

/**
 * Check 19 (one jet): the lane and the time bar share one time axis. With the playhead at the time over
 * target, the lane's diamond is within 3 px of the scrubber's thumb (its centre, which for the
 * browser's 16 px thumb travels from 8 px in to 8 px in); the white line at the clock's time is within
 * 3 px of the thumb at the start, at the time over target and at the end; and the lane's band starts
 * and ends where the scrubber's own band does. The thumb's place is worked out from the input's box
 * and the clock's position, the way a 16 px thumb moves.
 *
 * Measured green 2026-11-14 at both sizes: the line 0.5 px from the thumb at the start, the time over
 * target and the end, the diamond 0.0 px, the bands' edges 0.0 px.
 *
 * Proven red 2026-11-14 by one temporary edit to ui.ts, LANE's `px-2` → `px-4` (the lane's axis box 8
 * px narrower each side: the line is 8 px out at the start and the end, and only 0.4 px at the middle,
 * so the diamond at the time over target alone would not have caught it):
 *   STEP FAIL 19 the lane's time over target and clock line sit on the scrubber's thumb (1400x900) — start: thumb 196.0, line 204.5 (8.5 px); time over target: thumb 751.2, line 750.8 (0.4 px), diamond 750.3 (0.9 px); end: thumb 1194.0, line 1186.5 (7.5 px); band edges differ from the scrubber's band by 8.0 and 8.0 px
 *
 * It also holds that a strike of one has no tooltip on its times cell. Proven red 2026-11-15 by one temporary
 * edit to JetLanes.tsx, the condition turned round (`lanes.length >= 2 ? READOUT_TITLE : undefined` →
 * `lanes.length >= 2 ? undefined : READOUT_TITLE`, which also takes the title off the four-ship's cells):
 *   STEP FAIL 19 the lane's time over target and clock line sit on the scrubber's thumb (1400x900) — start: thumb 196.0, line 196.5 (0.5 px); …; times cell title "times est., relative to the lead's TOT" (want none)
 */
async function checkLaneTime(page, tag) {
  const wasWhole = await pbEval(page, () => __pb.show().wholeRunIn);
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); });
  const m = await pbEval(page, () => __pb.moments);
  const input = await page.locator('[role="dialog"] input[type="range"]').boundingBox();
  const parts = [];
  let ok = true;
  for (const [name, t] of [['start', null], ['time over target', m.impact], ['end', 'end']]) {
    await pbEval(page, (tt) => { const s = __pb.snapshot(); __pb.seek(tt === null ? s.start : tt === 'end' ? s.end : tt); }, t);
    await settle(page, 150);
    const snap = await pbEval(page, () => __pb.snapshot());
    const lane = (await pbEval(page, () => __pb.lanes()))[0];
    const f = (snap.t - snap.start) / (snap.end - snap.start);
    const thumb = input.x + 8 + (input.width - 16) * f;
    const nowX = lane?.now ? (lane.now.l + lane.now.r) / 2 : NaN;
    const dNow = Math.abs(nowX - thumb);
    let line = `${name}: thumb ${thumb.toFixed(1)}, line ${nowX.toFixed(1)} (${dNow.toFixed(1)} px)`;
    ok = ok && dNow <= 3;
    if (t === m.impact) {
      const dx = lane?.impact ? (lane.impact.l + lane.impact.r) / 2 : NaN;
      ok = ok && Math.abs(dx - thumb) <= 3;
      line += `, diamond ${dx.toFixed(1)} (${Math.abs(dx - thumb).toFixed(1)} px)`;
    }
    parts.push(line);
  }
  const lane = (await pbEval(page, () => __pb.lanes()))[0];
  const scrub = await page.$$eval('[role="dialog"] [data-scrub-band]', (els) => els.map((e) => {
    const b = e.getBoundingClientRect();
    return { l: b.left, r: b.right };
  }));
  const lb = lane?.bands || [];
  const edges = lb.length && scrub.length
    ? [Math.abs(lb[0].box.l - scrub[0].l), Math.abs(lb[lb.length - 1].box.r - scrub[scrub.length - 1].r)]
    : [NaN, NaN];
  ok = ok && edges.every((e) => e <= 3);
  parts.push(`band edges differ from the scrubber's band by ${edges.map((e) => e.toFixed(1)).join(' and ')} px`);
  // A strike of one has its times cell without a tooltip (the plan's own times need no explaining).
  const titles = await page.$$eval('[role="dialog"] [data-readout]', (els) => els.map((e) => e.getAttribute('title')));
  ok = ok && titles.length === 1 && titles[0] === null;
  parts.push(`times cell title ${titles.length === 1 ? JSON.stringify(titles[0]) : `${titles.length} cells`} (want none)`);
  step(`19 the lane's time over target and clock line sit on the scrubber's thumb (${tag})`, ok, parts.join('; '));
  await pbEval(page, (whole) => __pb.setRange(whole), wasWhole);
}

/** Check 6: 50 scrubber drags never rebuild the scene. */
async function checkScrub(page) {
  const before = await pbEval(page, () => __pb.stats().sceneCreates);
  const box = await page.locator('[role="dialog"] input[type="range"]').boundingBox();
  const y = box.y + box.height / 2;
  const t = [];
  for (let i = 0; i < 50; i++) {
    const x1 = box.x + box.width * (0.05 + 0.9 * (((i * 37) % 50) / 50));
    const x2 = box.x + box.width * (0.05 + 0.9 * (((i * 11 + 7) % 50) / 50));
    await page.mouse.move(x1, y);
    await page.mouse.down();
    await page.mouse.move(x2, y, { steps: 4 });
    await page.mouse.up();
    if (i % 10 === 9) t.push((await pbEval(page, () => __pb.snapshot().t)).toFixed(1));
  }
  const after = await pbEval(page, () => __pb.stats().sceneCreates);
  const moved = new Set(t).size > 1;
  step('6 50 scrubber drags keep one scene', after === before && moved, `sceneCreates ${before} → ${after}; times after every 10th drag: ${t.join(', ')}`);
}

/**
 * Check 37: Space plays after the time bar has been used. A press on the scrubber leaves it focused, and a
 * range does nothing with Space itself, so Space there plays and pauses the scene instead of being swallowed
 * as a key a control wants.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackOverlay.tsx, the key's skip list taking every
 * input again (`input:not([type="range"])` → `input`): the range is the focus and Space does nothing:
 *   STEP FAIL 37 Space plays and pauses with the time bar focused — the range had the focus true; Space played false, then paused true
 */
async function checkSpaceAfterScrub(page) {
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); });
  const box = await page.locator('[role="dialog"] input[type="range"]').boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  const onRange = await page.evaluate(() => !!document.activeElement && document.activeElement.getAttribute('type') === 'range');
  await page.keyboard.press(' ');
  const playing = await pbEval(page, () => __pb.snapshot().playing);
  await page.keyboard.press(' ');
  const paused = !(await pbEval(page, () => __pb.snapshot().playing));
  step('37 Space plays and pauses with the time bar focused', onRange && playing && paused, `the range had the focus ${onRange}; Space played ${playing}, then paused ${paused}`);
}

/**
 * Check 28: the speed buttons read exactly 1×, 2×, 4×, 8×, 16× (no ½×) with 1× pressed before any press;
 * pressing 16× marks it pressed and a second of play then moves the clock far more than a second at
 * 1× does (at least four times as far, and never over 17 s), and 1× is back to about a second per
 * second (at most 1.2). Wall time is read in the page, from the Play call to the Pause call, so the
 * check's own round trips do not count.
 *
 * Why "four times as far" and not "about 16 s": the software renderer here draws a few frames a
 * second, and each frame counts for at most 0.1 s before the speed multiplies it, so 16× moves
 * 1.6 s a frame and what a second covers depends on how many frames it got (measured 2026-11-14
 * at 1400x900: 6.8 to 8.3 s at 16×, 0.3 to 0.6 s at 1×). A floor in seconds would start failing as
 * the scene grows heavier; the comparison with 1× in the same run does not. The exact arithmetic
 * (16 s a second, the cap before the multiply) is pinned in geo-check, where no renderer is involved.
 *
 * Proven red 2026-11-14 by temporary edits to src/lib/playbackScene/playClock.ts, one at a time.
 * With the speed ignored in `advance` (`* 1` in place of `* this.speed`):
 *   STEP FAIL 28 speed buttons 1×…16×, 16× plays far faster than 1×, 1× about a second a second (1400x900) — buttons 1× 2× 4× 8× 16×; pressed at open 1×, after 16× 16×, after 1× 1×; 16×: 0.42 s in 1.00 s wall (0.4/s); 1×: 0.41 s in 1.00 s wall (0.41/s, want ≤ 1.2); 16× over 1×: 1.0 (want ≥ 4, and 16× ≤ 17 s)
 * With `SPEEDS` = `[1, 2, 4, 8]` (no 16; seen with this check's first wording): the buttons read
 * "1× 2× 4× 8×", 16× is never pressed and its reading is NaN, so the check fails on the words alone.
 */
async function checkSpeeds(page, tag) {
  const group = '[role="dialog"] [role="group"][aria-label="Speed"] button';
  const labels = () => page.$$eval(group, (els) => els.map((e) => (e.textContent || '').trim()));
  const pressed = () => page.$$eval(group, (els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').map((e) => (e.textContent || '').trim()));
  // A second of play from the start of the range, paused again; the page measures its own wall time.
  const playOneSecond = () => pbEval(page, async () => {
    __pb.pause();
    __pb.seek(__pb.snapshot().start);
    const t0 = __pb.snapshot().t;
    const w0 = performance.now();
    __pb.play();
    await new Promise((r) => setTimeout(r, 1000));
    __pb.pause();
    return { moved: __pb.snapshot().t - t0, wall_s: (performance.now() - w0) / 1000 };
  });

  // A missing button is a failed check with a reading, not a click that waits out its timeout.
  const press = async (label) => {
    const b = page.getByRole('button', { name: label, exact: true });
    if ((await b.count()) === 0) return false;
    await b.click();
    return true;
  };
  const none = { moved: NaN, wall_s: NaN };

  await pbEval(page, () => __pb.pause());
  const shown = await labels();
  const atOpen = await pressed();
  const fast = (await press('16×')) ? await playOneSecond() : none;
  const after16 = await pressed();
  const slow = (await press('1×')) ? await playOneSecond() : none;
  const after1 = await pressed();
  const rate16 = fast.moved / fast.wall_s, rate1 = slow.moved / slow.wall_s;
  const wordsOk = shown.join(' ') === '1× 2× 4× 8× 16×' && !shown.some((s) => s.includes('½'));
  step(`28 speed buttons 1×…16×, 16× plays far faster than 1×, 1× about a second a second (${tag})`,
    wordsOk && atOpen.join() === '1×' && after16.join() === '16×' && after1.join() === '1×'
      && slow.moved > 0 && rate1 <= 1.2 && fast.moved >= 4 * slow.moved && fast.moved <= 17,
    `buttons ${shown.join(' ')}; pressed at open ${atOpen}, after 16× ${after16}, after 1× ${after1}; 16×: ${fast.moved.toFixed(2)} s in ${fast.wall_s.toFixed(2)} s wall (${rate16.toFixed(1)}/s); 1×: ${slow.moved.toFixed(2)} s in ${slow.wall_s.toFixed(2)} s wall (${rate1.toFixed(2)}/s, want ≤ 1.2); 16× over 1×: ${(fast.moved / slow.moved).toFixed(1)} (want ≥ 4, and 16× ≤ 17 s)`);
}

/**
 * Check 29: playback opens 10 s before the first action, not at the start of the whole run-in. At
 * open the clock's start and the playhead are `moments.range.t0_s` (to 0.01 s) and its end is the
 * window's; the fixture's range really is narrower than the whole run-in (else the check proves
 * nothing). Ticking Show › Whole run-in with the mouse moves the start to the whole run-in's
 * (`moments.t0`, the library's window) and leaves the playhead where it was; unticking it puts the
 * start back, the playhead still where it was. The menu stays open through both choices. Run on the
 * page as it opens, before anything has moved the playhead.
 *
 * Proven red 2026-11-14 by one temporary edit to PlaybackView.tsx, the range handed to the scene
 * taken from `built.timing.window` instead of `playRange(…)` (the playback opens at the start of the whole run-in):
 *   STEP FAIL 29 playback opens 10 s before the first action; Show › Whole run-in widens the time bar and back (1400x900) — range -50.15…40.00 (first action -40.15), whole run-in -151.15…40.00; at open start -151.15, t -151.15, end 40.00; ticked: start -151.15, t -151.15, shown true; unticked: start -50.15, t -50.15; …
 */
async function checkRange(page, tag) {
  const m = await pbEval(page, () => __pb.moments);
  const close = (a, b) => Math.abs(a - b) <= 0.01;
  const snap = () => pbEval(page, () => __pb.snapshot());
  const atOpen = await snap();
  const narrower = m.range.t0_s > m.t0 + 1;
  const openOk = close(atOpen.start, m.range.t0_s) && close(atOpen.t, atOpen.start) && close(atOpen.end, m.range.t1_s);

  await page.getByRole('button', { name: 'Show ▾' }).click();
  const whole = page.getByRole('checkbox', { name: /Whole run-in/ });
  const boxOnShow = (await whole.count()) === 1 && (await whole.isChecked()) === false;
  await whole.click();
  const on = await snap();
  const shown = await pbEval(page, () => __pb.show());
  const stillOpen = (await page.locator('#pb-show').count()) === 1;
  const onOk = close(on.start, m.t0) && close(on.end, m.t1) && close(on.t, atOpen.t) && shown.wholeRunIn === true;
  await whole.click();
  const off = await snap();
  const offOk = close(off.start, m.range.t0_s) && close(off.t, atOpen.t) && (await pbEval(page, () => __pb.show())).wholeRunIn === false;
  await page.getByRole('button', { name: 'Show ▾' }).click(); // closes it again
  const closed = (await page.locator('#pb-show').count()) === 0;
  await shot(page, `${tag}-29-range`);

  const f = (v) => v.toFixed(2);
  step(`29 playback opens 10 s before the first action; Show › Whole run-in widens the time bar and back (${tag})`,
    narrower && openOk && boxOnShow && onOk && offOk && stillOpen && closed,
    `range ${f(m.range.t0_s)}…${f(m.range.t1_s)} (first action ${f(m.firstAction)}), whole run-in ${f(m.t0)}…${f(m.t1)}; at open start ${f(atOpen.start)}, t ${f(atOpen.t)}, end ${f(atOpen.end)}; ticked: start ${f(on.start)}, t ${f(on.t)}, shown ${JSON.stringify(shown?.wholeRunIn)}; unticked: start ${f(off.start)}, t ${f(off.t)}; menu stayed open ${stillOpen}, closed by the button ${closed}`);
}

/** The canvas's box on the page, CSS pixels. */
const canvasBox = (page) => page.$eval('[role="dialog"] canvas', (c) => {
  const r = c.getBoundingClientRect();
  return { l: r.left, t: r.top, w: r.width, h: r.height };
});
/** The camera buttons shown pressed (the speed buttons are pressed too, so they are left out by name). */
const pressedCamera = (page) => page.$$eval('[role="dialog"] button[aria-pressed="true"]', (els) =>
  els.map((e) => (e.textContent || '').trim()).filter((s) => /^(Orbit|Top-down|Chase #\d+|From target)$/.test(s)));
/** How far a page point is from the canvas's middle, as fractions of its width and height. */
const offCentre = (p, cv) => (p ? [(p[0] - (cv.l + cv.w / 2)) / cv.w, (p[1] - (cv.t + cv.h / 2)) / cv.h] : [NaN, NaN]);

/**
 * Check 21: playback opens riding behind the jet. With nothing pressed, at open: the playhead at the
 * start of the default range (±0.05 s), "Chase #1" shown pressed, and the arrow within 3% of the
 * canvas's middle (the chase camera looks at the jet) with at least ARROW_MIN_CHASE jet-coloured
 * pixels within ARROW_PATCH px of it. Run first, on the page as it opens.
 *
 * ARROW_MIN_CHASE: the arrow is at its real size in Chase (about 418 m off, 17° up), not at the 28 px
 * Home size ARROW_MIN was measured for. First measured 2026-11-14 while the path and trail were the
 * jet's cyan too: 138 px at 1400×900 and 111 px at 1024×768, the lines alone 59 / 59 px, floor 85.
 * Measured again the same day once they wore the planner's colours: 122 and 86 px, and with the
 * arrow shrunk to nothing (jetLayer.ts afterCamera, scale × 1e-6) 0 / 0 px, so the count is the
 * arrow's alone. The floor came down to 60, between 0 and 86 with room for the software renderer;
 * that mutation turns it red:
 *   STEP FAIL 21 opens in Chase behind #1 at the start of the time bar (1400x900) — t -50.15 (range start -50.15); pressed ["Chase #1"]; arrow at 700,391, -0.0% / 0.0% off the middle, 0 px (need 60)
 *
 * Proven red 2026-11-14 by one temporary edit to PlaybackView.tsx, the camera's opening mode 'orbit'
 * in place of openingMode(…) (playback opens at Home):
 *   STEP FAIL 21 opens in Chase behind #1 at the start of the time bar (1400x900) — t -50.15 (range start -50.15); pressed ["Orbit"]; arrow at 209,563, -35.0% / 24.9% off the middle, 171 px (need 85)
 */
const ARROW_MIN_CHASE = 60;
async function checkOpening(page, tag) {
  const m = await pbEval(page, () => __pb.moments);
  const snap = await pbEval(page, () => __pb.snapshot());
  const pressed = await pressedCamera(page);
  await settle(page);
  const p = await pbEval(page, () => __pb.project(0, 'jet'));
  const cv = await canvasBox(page);
  const img = await shot(page, `${tag}-21-opens-in-chase`);
  const n = p ? patch(img, p.map(Math.round), ARROW_PATCH).filter(jetLike).length : 0;
  const [dx, dy] = offCentre(p, cv);
  step(`21 opens in Chase behind #1 at the start of the time bar (${tag})`,
    Math.abs(snap.t - m.range.t0_s) <= 0.05 && pressed.join() === 'Chase #1' && Math.abs(dx) <= 0.03 && Math.abs(dy) <= 0.03 && n >= ARROW_MIN_CHASE,
    `t ${snap.t.toFixed(2)} (range start ${m.range.t0_s.toFixed(2)}); pressed ${JSON.stringify(pressed)}; arrow at ${p ? p.map(Math.round) : 'none'}, ${(dx * 100).toFixed(1)}% / ${(dy * 100).toFixed(1)}% off the middle, ${n} px (need ${ARROW_MIN_CHASE})`);
}

/**
 * Check 22: Home shows the attack. On the default range (10 s before the first action), Home view:
 * the jet at its first action and at its release, and the target ring, all inside the canvas with
 * a 5% margin, and the pull-up to the release at least `minSpan` px across (250 at 1400×900, 180 at
 * 1024×768).
 *
 * Proven red 2026-11-14 by one temporary edit to scene/createScene.ts, the Home box built on the
 * whole window (`homeBox(source, source.window)`, the framing of the old box round every path):
 *   STEP FAIL 22 Home frames the attack: … ≥ 250 px (1400x900) — canvas [0,45,1400,737]; first action (877,349), release (1017,307), target (1022,309); pull-up to release 128 px
 *   STEP FAIL 22 … ≥ 180 px (1024x768) — …; pull-up to release 97 px
 * (green: 459 px and 343 px)
 */
async function checkHomeFrame(page, tag, minSpan) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.goHome(); });
  const m = await pbEval(page, () => __pb.moments);
  const jetAt = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 100);
    return pbEval(page, () => __pb.project(0, 'jet'));
  };
  const first = await jetAt(m.firstAction);
  const pop = await jetAt(m.pullUp);
  const rel = await jetAt(m.release);
  const tgt = await pbEval(page, () => __pb.project(0, 'target'));
  await shot(page, `${tag}-22-home`);
  const cv = await canvasBox(page);
  const inside = (q) => !!q && q[0] >= cv.l + 0.05 * cv.w && q[0] <= cv.l + 0.95 * cv.w && q[1] >= cv.t + 0.05 * cv.h && q[1] <= cv.t + 0.95 * cv.h;
  const span = pop && rel ? Math.hypot(pop[0] - rel[0], pop[1] - rel[1]) : 0;
  const fmt = (q) => (q ? `(${q.map(Math.round)})` : 'none');
  step(`22 Home frames the attack: first action, release and target inside, pull-up to release ≥ ${minSpan} px (${tag})`,
    inside(first) && inside(rel) && inside(tgt) && span >= minSpan,
    `canvas [${[cv.l, cv.t, cv.l + cv.w, cv.t + cv.h].map(Math.round)}]; first action ${fmt(first)}, release ${fmt(rel)}, target ${fmt(tgt)}; pull-up to release ${span.toFixed(0)} px`);
}

/**
 * Check 23: the planner's colour code in 3D. Home on the default range, paused 3 s after the pull-up:
 * along the climb (the projected pull-up → pull-down stretch, 20 px either side of its middle, 3 px
 * either side of the line) the pixels are the planner's climb yellow; along the route the same way
 * (round the middle of the stretch between the time bar's start and the first action, the line laid
 * through the jet's points 2 s either side) they are the route blue; and at both hardly any are the
 * jet's own cyan, which every line was before. The jet's points come from `__pb.project(0, 'jet')`
 * at each moment, which lies on the drawn path (the path is the same display track, sampled), with
 * the camera standing still at Home in between.
 *
 * Minimums: measured 2026-11-14 on the first green run, 55 yellow and 68 blue px at 1400×900, 54 and
 * 68 at 1024×768, 0 cyan at both. The 41 px window spans two whole periods of the route's 10 / 10
 * dash, so the blue count does not ride on where the dashes fall. CLIMB_MIN and ROUTE_MIN sit at
 * about half, room for the software renderer. The predicates match neither drape colour, its
 * hillshade, nor the navy background (the cyan counts of 0 and the drape checks run beside them).
 *
 * Proven red 2026-11-14 by one temporary edit to scene/jetLayer.ts, wideLine's `vertexColors: false`
 * (every coloured line drawn in the material's white):
 *   STEP FAIL 23 the planner's colours in 3D: yellow climb, blue route, no cyan lines (1400x900) — climb (482,498)→(777,418): 0 yellow px (need 25), 0 cyan; route at (311,534): 0 blue px (need 30), 0 cyan (≤ 5 each)
 *   STEP FAIL 23 … (1024x768) — climb (350,405)→(569,345): 0 yellow px (need 25), 0 cyan; route at (223,431): 0 blue px (need 30), 0 cyan (≤ 5 each)
 * Since the 2D overlay carries the jet's label and the planner's words (2026-11-14), the label's plate
 * lay over the climb (0 yellow px), so the overlay is hidden for the shot: the check is the 3D's lines.
 * Green with it hidden: 54 yellow and 52 blue px at 1400×900, 53 and 55 at 1024×768. Proven red again
 * by the `vertexColors: false` mutation:
 *   STEP FAIL 23 … (1400x900) — climb (482,504)→(777,423): 0 yellow px (need 25), 0 cyan; route at (310,539): 0 blue px (need 30), 0 cyan (≤ 5 each)
 */
const climbLike = (p) => p[0] > 200 && p[1] > 150 && p[2] < 90;
const routeLike = (p) => p[2] > 200 && p[2] > p[0] + 80 && p[2] > p[1] + 30;
const CLIMB_MIN = 25;
const ROUTE_MIN = 30;
/** Pixels of `img` within `across` px of the line through `a` and `b`, at most `along` px from `mid` along it, that pass `test`. */
function alongLine(img, a, b, mid, along, across, test) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(L > 0)) return 0;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const r = Math.ceil(along + across);
  let n = 0;
  for (let y = Math.round(mid[1]) - r; y <= Math.round(mid[1]) + r; y++) for (let x = Math.round(mid[0]) - r; x <= Math.round(mid[0]) + r; x++) {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    const dx = x - mid[0], dy = y - mid[1];
    if (Math.abs(dx * ux + dy * uy) <= along && Math.abs(dx * uy - dy * ux) <= across && test(img.at(x, y))) n++;
  }
  return n;
}
async function checkColourCode(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.goHome(); });
  const m = await pbEval(page, () => __pb.moments);
  const pdp = m.events.find((e) => e.kind === 'pullDown')?.t_s;
  const jetAt = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 100);
    return pbEval(page, () => __pb.project(0, 'jet'));
  };
  const pop = await jetAt(m.pullUp);
  const down = pdp === undefined ? null : await jetAt(pdp);
  const routeMid = (m.range.t0_s + m.firstAction) / 2;
  const r0 = await jetAt(routeMid - 2), rm = await jetAt(routeMid), r1 = await jetAt(routeMid + 2);
  await pbEval(page, (tt) => __pb.seek(tt), m.pullUp + 3);
  await settle(page, 300);
  await overlay(page, false);
  let img;
  try {
    img = await shot(page, `${tag}-23-colour-code`);
  } finally {
    await overlay(page, true);
  }
  const climbMid = pop && down ? [(pop[0] + down[0]) / 2, (pop[1] + down[1]) / 2] : null;
  const count = (a, b, mid, test) => (a && b && mid ? alongLine(img, a, b, mid, 20, 3, test) : 0);
  const climb = count(pop, down, climbMid, climbLike), climbJet = count(pop, down, climbMid, jetLike);
  const route = count(r0, r1, rm, routeLike), routeJet = count(r0, r1, rm, jetLike);
  const fmt = (q) => (q ? `(${q.map(Math.round)})` : 'none');
  step(`23 the planner's colours in 3D: yellow climb, blue route, no cyan lines (${tag})`,
    climb >= CLIMB_MIN && route >= ROUTE_MIN && climbJet <= 5 && routeJet <= 5,
    `climb ${fmt(pop)}→${fmt(down)}: ${climb} yellow px (need ${CLIMB_MIN}), ${climbJet} cyan; route at ${fmt(rm)}: ${route} blue px (need ${ROUTE_MIN}), ${routeJet} cyan (≤ 5 each)`);
}

/**
 * Check 24: the planner's red target, standing up. Home on the default range, paused at its start:
 * within 14 px of where the scene projects the top of the target's post (`project(0, 'targetMark')`)
 * at least TGT_MIN pixels are the planner's TGT red (the disc, 12 px across its radius, filled red);
 * the overlay drew its disc there (its own record within 1 px of that point) and its tag reads
 * "TGT1 · #1" (the waypoint's name, then the seat). The predicate matches neither drape colour, its
 * hillshade, nor the navy background; the ring and the post are red too, but the ring lies about 40 px
 * lower on screen and the post runs down from under the disc.
 *
 * Measured 2026-11-14 on the first green run: 369 red px at 1400×900, 370 at 1024×768. Proven red the
 * same day by one temporary edit to scene/labelLayer.ts, the disc filled in the jet's seat colour
 * (`disc(v.x, v.y, r, '#22d3ee', …)`, JET_COLORS[0]) instead of MARKER_COLOR.TGT:
 *   STEP FAIL 24 the planner's red TGT disc on its post, tagged with the target and its seat (1400x900) — disc at 955,321: 0 red px within 14 px (need 120); overlay 1 target(s), first "TGT1 · #1" 0.00 px from the projected point
 *   STEP FAIL 24 … (1024x768) — disc at 705,256: 0 red px within 14 px (need 120); …
 */
const redLike = (p) => p[0] > 180 && p[1] < 100 && p[2] < 100;
const TGT_MIN = 120;
async function checkTargetMark(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.goHome(); __pb.seek(__pb.moments.range.t0_s); });
  await settle(page, 300);
  const p = await pbEval(page, () => __pb.project(0, 'targetMark'));
  const labels = await pbEval(page, () => __pb.debugLabels());
  const cv = await canvasBox(page);
  const img = await shot(page, `${tag}-24-target-mark`);
  let n = 0;
  if (p) {
    const [cx, cy] = p.map(Math.round), R = 14;
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height || Math.hypot(x - p[0], y - p[1]) > R) continue;
      if (redLike(img.at(x, y))) n++;
    }
  }
  const t0 = labels && labels.targets[0];
  const drawnAt = t0 && p ? Math.hypot(cv.l + t0.x - p[0], cv.t + t0.y - p[1]) : Infinity;
  step(`24 the planner's red TGT disc on its post, tagged with the target and its seat (${tag})`,
    n >= TGT_MIN && !!t0 && t0.tag === 'TGT1 · #1' && drawnAt <= 1 && labels.targets.length === 1,
    `disc at ${p ? p.map(Math.round) : 'none'}: ${n} red px within 14 px (need ${TGT_MIN}); overlay ${labels ? labels.targets.length : 'none'} target(s), first ${t0 ? `"${t0.tag}" ${drawnAt.toFixed(2)} px from the projected point` : 'none'}`);

  // 24b: at the release the jet is right beside its target on screen (Home), so its label takes the
  // side of the arrow that leaves the target's disc and tag uncovered.
  // Proven red 2026-11-15 by one temporary edit to src/lib/playbackScene/labels.ts (placeLabels ignoring
  // the boxes, `const blocked = 0`):
  //   STEP FAIL 24b at the release the jet's label leaves the target's disc and tag uncovered (1400x900) — label 143×32 at 932,267; target box 95×30 at 940,261; 2270 px² of it covered
  //   STEP FAIL 24b … (1024x768) — label 143×32 at 689,202; target box 95×30 at 690,196; 2256 px² of it covered
  await pbEval(page, () => __pb.seek(__pb.moments.release));
  await settle(page, 300);
  const at = await pbEval(page, () => __pb.debugLabels());
  await shot(page, `${tag}-24b-label-off-target`);
  const jb = at && at.jets[0], tb = at && at.targets[0] && at.targets[0].box;
  const covered = jb && tb ? Math.max(0, Math.min(jb.x + jb.w, tb[0] + tb[2]) - Math.max(jb.x, tb[0])) * Math.max(0, Math.min(jb.y + jb.h, tb[1] + tb[3]) - Math.max(jb.y, tb[1])) : NaN;
  step(`24b at the release the jet's label leaves the target's disc and tag uncovered (${tag})`, covered === 0,
    jb && tb ? `label ${Math.round(jb.w)}×${Math.round(jb.h)} at ${Math.round(jb.x)},${Math.round(jb.y)}; target box ${Math.round(tb[2])}×${Math.round(tb[3])} at ${Math.round(tb[0])},${Math.round(tb[1])}; ${Math.round(covered)} px² of it covered` : 'no jet label or no target on the overlay');
}

/**
 * Check 25: the planner's words at the action points come and go with the jet, in real seconds. Home on
 * the default range, paused, 1×, 0.7 s of wall time after each seek (the fade takes 0.5 s), then until
 * the scene stops drawing (the software renderer's frames are slow, and each fade step is capped at a
 * 0.1 s frame; a first run waiting 0.7 s alone found the pull-up's plate still at alpha 0.15): 4 s before
 * the pull-up (POP) its callout is not up; 1 s before, it is placed, fully shown, with the planner's
 * own lines (deep-equal to the marker's), and at least half its plate is the plate's white; 3 s after,
 * gone. At 16×, 10 s of strike time before the pull-up it is up already (the window is in real seconds).
 * Paused at the pull-up for 2 s of wall time it stays fully shown. Show › Action points › Off: no discs
 * and no callouts; Always: every point's callout (each marker, the IP, the egress label) is there, placed
 * or dropped for want of room. The Show menu's own buttons make the last two choices.
 *
 * Measured 2026-11-14 on the first green run: the plate 70% white at 1400×900, 73% at 1024×768.
 * Proven red the same day by two temporary edits, one run each. src/lib/playbackScene/callouts.ts
 * calloutAlpha in strike seconds (`/ s` dropped):
 *   STEP FAIL 25 the planner's words at the pull-up come and go with the jet in real seconds; Off and Always (1400x900) — POP at -36.85: −4 s not up; −1 s placed at alpha 1.00, …; +3 s not up; 16× −10 s not up; paused at it 2 s placed at alpha 1.00; …
 *   STEP FAIL 25 … (1024x768) — …; 16× −10 s not up; …
 * scene/labelLayer.ts taking each callout down after 2 s of wall time on screen (an age summed from
 * ctx.dt while its target is above 0, the frames kept coming while any is up), an alpha off the wall
 * clock instead of the strike clock:
 *   STEP FAIL 25 … (1400x900) — POP at -36.85: −4 s not up; −1 s not up, lines null vs […], plate 0% white; +3 s not up; 16× −10 s not up; paused at it 2 s not up; …; Always (always): 0 up, missing ["h-attack:AP", …]
 *   STEP FAIL 25 … (1024x768) — … (the same)
 */
const plateLike = (p) => p[0] > 245 && p[1] > 245 && p[2] > 245;
async function checkCallouts(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.setSpeed(1); __pb.setActionPoints('coming'); __pb.goHome(); });
  const m = await pbEval(page, () => __pb.moments);
  const pop = m.markers.find((k) => k.kind === 'POP');
  const at = async (t, wait = 700) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settleIdle(page, wait);
    return pbEval(page, () => __pb.debugLabels());
  };
  const popOf = (labels) => labels && labels.callouts.find((c) => c.key === pop.key);
  const before4 = popOf(await at(pop.t_s - 4));
  const before1Labels = await at(pop.t_s - 1);
  const before1 = popOf(before1Labels);
  const cv = await canvasBox(page);
  const img = await shot(page, `${tag}-25-callout`);
  let white = 0, all = 0;
  if (before1 && before1.placed) {
    for (let y = Math.ceil(cv.t + before1.y); y < cv.t + before1.y + before1.h - 0.5; y++) for (let x = Math.ceil(cv.l + before1.x); x < cv.l + before1.x + before1.w - 0.5; x++) {
      all++;
      if (plateLike(img.at(x, y))) white++;
    }
  }
  const after3 = popOf(await at(pop.t_s + 3));
  await pbEval(page, () => __pb.setSpeed(16));
  const fast = popOf(await at(pop.t_s - 10));
  await pbEval(page, () => __pb.setSpeed(1));
  const held = popOf(await at(pop.t_s, 2000));

  await page.getByRole('button', { name: 'Show ▾' }).click();
  await page.getByRole('button', { name: 'Off', exact: true }).click();
  await settleIdle(page, 700);
  const off = await pbEval(page, () => __pb.debugLabels());
  await page.getByRole('button', { name: 'Always', exact: true }).click();
  await settleIdle(page, 700);
  const always = await pbEval(page, () => __pb.debugLabels());
  const shownAlways = await pbEval(page, () => __pb.show().actionPoints);
  await page.getByRole('button', { name: 'As they come', exact: true }).click();
  await page.getByRole('button', { name: 'Show ▾' }).click(); // shut it again
  const wantKeys = [...m.markers.map((k) => k.key), `${pop.key.split(':')[0]}:ip`, `${pop.key.split(':')[0]}:egress`];
  const missing = wantKeys.filter((k) => !always.callouts.some((c) => c.key === k && c.alpha === 1 && typeof c.placed === 'boolean'));

  const share = all ? white / all : 0;
  const fmt = (c) => (c ? `${c.placed ? 'placed' : 'dropped'} at alpha ${c.alpha.toFixed(2)}` : 'not up');
  step(`25 the planner's words at the pull-up come and go with the jet in real seconds; Off and Always (${tag})`,
    !before4 && !!before1 && before1.placed && before1.alpha === 1 && JSON.stringify(before1.lines) === JSON.stringify(pop.lines) && share >= 0.5 &&
      !after3 && !!fast && fast.placed && !!held && held.alpha === 1 && held.placed &&
      off.markers.length === 0 && off.callouts.length === 0 && shownAlways === 'always' && missing.length === 0,
    `POP at ${pop.t_s.toFixed(2)}: −4 s ${fmt(before4)}; −1 s ${fmt(before1)}, lines ${JSON.stringify(before1 ? before1.lines : null)} vs ${JSON.stringify(pop.lines)}, plate ${(share * 100).toFixed(0)}% white; +3 s ${fmt(after3)}; ` +
    `16× −10 s ${fmt(fast)}; paused at it 2 s ${fmt(held)}; Off: ${off.markers.length} discs, ${off.callouts.length} callouts; Always (${shownAlways}): ${always.callouts.length} up, missing ${JSON.stringify(missing)}`);
}

/**
 * Check 11 (one jet): the jet's label. Home on the default range, paused 5 s into it: one label, its
 * first line "#1 Viper 1-1", its second the altitude and speed ("…ft AGL · … KTAS"), its plate inside
 * the canvas; Show › Labels unticked, the label is one line (seat and callsign) and shorter; ticked
 * again, two lines.
 *
 * Proven red 2026-11-14 by one temporary edit to scene/labelLayer.ts, the second line drawn whatever
 * Labels says (`ctx.labels || true`):
 *   STEP FAIL 11 the jet's label: seat, callsign, altitude and speed; Labels off leaves one line (1400x900) — Labels on: 1 label(s), ["#1 Viper 1-1","500ft AGL · 480 KTAS"] 133×32 at 324,448 (inside the canvas true); off (false): ["#1 Viper 1-1","500ft AGL · 480 KTAS"] 133×32 at 324,448; …
 *   STEP FAIL 11 … (1024x768) — …; off (false): ["#1 Viper 1-1","500ft AGL · 480 KTAS"] 133×32 at 238,337; …
 */
async function checkJetLabels(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.goHome(); __pb.seek(__pb.snapshot().start + 5); });
  await settle(page, 300);
  const on = await pbEval(page, () => __pb.debugLabels());
  const cv = await canvasBox(page);
  await shot(page, `${tag}-11-jet-label`);
  await page.getByRole('button', { name: 'Show ▾' }).click();
  const box = page.getByRole('checkbox', { name: /^Labels/ });
  await box.click();
  await settle(page, 300);
  const off = await pbEval(page, () => __pb.debugLabels());
  const offShown = await pbEval(page, () => __pb.show().labels);
  await box.click();
  await settle(page, 300);
  const back = await pbEval(page, () => __pb.debugLabels());
  await page.getByRole('button', { name: 'Show ▾' }).click(); // shut it again
  const j = on.jets[0], jo = off.jets[0], jb = back.jets[0];
  const inside = j && j.x >= 0 && j.y >= 0 && j.x + j.w <= cv.w + 0.5 && j.y + j.h <= cv.h + 0.5;
  const fmt = (x) => (x ? `${JSON.stringify(x.lines)} ${Math.round(x.w)}×${Math.round(x.h)} at ${Math.round(x.x)},${Math.round(x.y)}` : 'none');
  step(`11 the jet's label: seat, callsign, altitude and speed; Labels off leaves one line (${tag})`,
    on.jets.length === 1 && !!j && j.lines[0] === '#1 Viper 1-1' && j.lines.length === 2 && /^[\d,]+ft AGL · \d+ KTAS$/.test(j.lines[1]) && inside &&
      off.jets.length === 1 && !!jo && jo.lines.length === 1 && jo.lines[0] === '#1 Viper 1-1' && jo.h < j.h && offShown === false &&
      back.jets.length === 1 && !!jb && jb.lines.length === 2,
    `Labels on: ${on.jets.length} label(s), ${fmt(j)} (inside the canvas ${!!inside}); off (${offShown}): ${fmt(jo)}; on again: ${fmt(jb)}`);
}

/**
 * Check 27: the wheel zooms toward the cursor. Orbit at Home, the mouse on the target ring, five
 * notches in (deltaY −100 each): the camera's distance to the point it turns round drops by at least
 * 35% (0.95^(2·5) = 0.599 at zoom speed 2, so about 40% is expected), and the target stays under the
 * cursor (its screen point moves at most 30 px). Not the distance to the target itself: it lies beyond
 * the orbit point and drops less.
 *
 * Proven red 2026-11-14 by one temporary edit to src/lib/playbackScene/cameraMath.ts, orbit's
 * `zoomToCursor: true` → `false` (the wheel zooms toward the middle of the view):
 *   STEP FAIL 27 the wheel zooms toward the cursor: … (1400x900) — orbit distance 11.04 → 6.61 km (40.1% closer, want ≥ 35%); target 946,352 → 1067,333 (122.4 px, want ≤ 30)
 * Measured green the same day: 36.6% closer at 1400×900 and 36.9% at 1024×768 (the cursor zoom moves
 * the orbit point onto the ground under the cursor, so the distance to it drops a little less than
 * the 40.1% the radius alone gives), target moved 0.5 / 0.3 px. The drop depends on how far off the
 * middle the cursor is: with Home on the whole window (the target far right) it was 33.3% / 33.9%,
 * under the 35% floor, so this check holds only for Home on the default range, as it is run.
 */
async function checkWheel(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.goHome(); });
  await settle(page);
  const dist = (c) => Math.hypot(c.x - c.target.x, c.y - c.target.y, c.z - c.target.z);
  const t0 = await pbEval(page, () => __pb.project(0, 'target'));
  const c0 = await pbEval(page, () => __pb.camera());
  let t1 = null, c1 = c0;
  if (t0) {
    await page.mouse.move(t0[0], t0[1]);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(80);
    }
    await settle(page);
    t1 = await pbEval(page, () => __pb.project(0, 'target'));
    c1 = await pbEval(page, () => __pb.camera());
  }
  await shot(page, `${tag}-27-wheel`);
  const drop = 1 - dist(c1) / dist(c0);
  const moved = t0 && t1 ? Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) : Infinity;
  step(`27 the wheel zooms toward the cursor: 5 notches on the target, 35% closer, target stays put (${tag})`,
    drop >= 0.35 && moved <= 30,
    `orbit distance ${(dist(c0) / 1000).toFixed(2)} → ${(dist(c1) / 1000).toFixed(2)} km (${(drop * 100).toFixed(1)}% closer, want ≥ 35%); target ${t0 ? t0.map(Math.round) : 'none'} → ${t1 ? t1.map(Math.round) : 'none'} (${moved.toFixed(1)} px, want ≤ 30)`);
  await pbEval(page, () => __pb.goHome());
}

/**
 * Checks 15a and 15c, one jet. 15a: Chase #1 pressed, a second of play at 4× from the start of the time
 * bar: the arrow stays within 15% of the canvas's middle (the camera rides with the jet). At 4×, not
 * 1×: the software renderer's second at 1× moves the jet about 160 m, and a camera left behind by that
 * much still has the arrow within about 10% of the middle, so the check could not fail. 15c: From target
 * pressed: #1's arrow is on screen (its point projects inside the canvas), looked at from its target.
 * The jet-coloured pixels round it are printed, not tested: there the jet is about 10 km off, low by
 * the horizon, and the count was the same with the arrow shrunk to nothing (36 / 32 px against
 * 33 / 32), so it is the path's, and a pixel floor could not fail. (With the path in the planner's
 * colours it reads 4 / 0 px: the arrow, end-on and 10 km off, is too small to count on.)
 *
 * 15a proven red 2026-11-14 by one temporary edit to scene/cameraRig.ts, the chase step (carry along,
 * swing round, re-aim) skipped each frame, so the camera stays where Chase put it:
 *   STEP FAIL 15a Chase #1: after a second of play the arrow stays near the middle (1400x900) — pressed true; played 2.47 s; arrow at 976,254, 19.7% / -19.8% off the middle (want ≤ 15%)
 *   STEP FAIL 15a … (1024x768) — pressed true; played 2.90 s; arrow at 751,206, 23.4% / -21.3% off the middle (want ≤ 15%)
 * 15c proven red 2026-11-14 by one temporary edit to scene/cameraRig.ts, placeTarget's
 * `this.camera.lookAt(follow.jet)` taken out (the camera keeps the last mode's direction):
 *   STEP FAIL 15c From target: #1's arrow on screen (1400x900) — pressed true; arrow at none in canvas [0,45,1400,737]: on screen false; 0 jet-coloured px round it (printed only)
 */
async function checkCameras(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.setSpeed(4); __pb.seek(__pb.snapshot().start); });
  await page.getByRole('button', { name: 'Chase #1', exact: true }).click();
  const chasePressed = (await pressedCamera(page)).join() === 'Chase #1';
  const played = await pbEval(page, async () => {
    const t0 = __pb.snapshot().t;
    __pb.play();
    await new Promise((r) => setTimeout(r, 1000));
    __pb.pause();
    return __pb.snapshot().t - t0;
  });
  await pbEval(page, () => __pb.setSpeed(1));
  await settle(page);
  const cv = await canvasBox(page);
  const p = await pbEval(page, () => __pb.project(0, 'jet'));
  await shot(page, `${tag}-15a-chase`);
  const [dx, dy] = offCentre(p, cv);
  step(`15a Chase #1: after a second of play the arrow stays near the middle (${tag})`,
    chasePressed && played > 0 && Math.abs(dx) <= 0.15 && Math.abs(dy) <= 0.15,
    `pressed ${chasePressed}; played ${played.toFixed(2)} s; arrow at ${p ? p.map(Math.round) : 'none'}, ${(dx * 100).toFixed(1)}% / ${(dy * 100).toFixed(1)}% off the middle (want ≤ 15%)`);

  await page.getByRole('button', { name: 'From target', exact: true }).click();
  await settle(page, 300);
  const q = await pbEval(page, () => __pb.project(0, 'jet'));
  const img = await shot(page, `${tag}-15c-from-target`);
  const onScreen = !!q && q[0] >= cv.l && q[0] <= cv.l + cv.w && q[1] >= cv.t && q[1] <= cv.t + cv.h;
  const n = onScreen ? patch(img, q.map(Math.round), ARROW_PATCH).filter(jetLike).length : 0;
  const targetPressed = (await pressedCamera(page)).join() === 'From target';
  step(`15c From target: #1's arrow on screen (${tag})`, targetPressed && onScreen,
    `pressed ${targetPressed}; arrow at ${q ? q.map(Math.round) : 'none'} in canvas [${[cv.l, cv.t, cv.l + cv.w, cv.t + cv.h].map(Math.round)}]: on screen ${onScreen}; ${n} jet-coloured px round it (printed only)`);
  await pbEval(page, () => __pb.goHome());
}

/**
 * Check 17 (one jet): pressing a camera button leaves Space to play and pause, and Escape still closes
 * playback (never the editor). Playback is closed and opened first, so the keyboard focus is where
 * opening puts it; it is left open again at the end.
 *
 * Proven red 2026-11-14 by one temporary edit to ViewToolbar.tsx, the camera buttons'
 * `onMouseDown={keepFocus}` taken out (the click focuses the button, and Space presses it again):
 *   STEP FAIL 17 after Chase is clicked, Space plays and pauses and Escape closes playback, not the editor — Space played false, paused true; Escape closed true; editor Escapes 0 → 0
 */
async function checkChaseKeys(page) {
  const esc = async () => (await pbEval(page, () => __pb.counters)).editorEscapes;
  await page.keyboard.press('Escape');
  await dialogGone(page);
  await page.click('[data-testid="opener"]');
  await page.waitForSelector('[role="dialog"]');
  await waitReady(page);
  const e0 = await esc();
  await pbEval(page, () => __pb.pause());
  await page.getByRole('button', { name: 'Chase #1', exact: true }).click();
  await page.keyboard.press(' ');
  const playing = (await pbEval(page, () => __pb.snapshot())).playing;
  await page.keyboard.press(' ');
  const paused = !(await pbEval(page, () => __pb.snapshot())).playing;
  await page.keyboard.press('Escape');
  const closed = await dialogGone(page).then(() => true, () => false);
  const e1 = await esc();
  if (!closed) await pbEval(page, () => __pb.close());
  await page.click('[data-testid="opener"]');
  await page.waitForSelector('[role="dialog"]');
  await waitReady(page);
  step('17 after Chase is clicked, Space plays and pauses and Escape closes playback, not the editor', playing && paused && closed && e1 === e0,
    `Space played ${playing}, paused ${paused}; Escape closed ${closed}; editor Escapes ${e0} → ${e1}`);
}

/**
 * Check 30: Escape belongs to the Show panel while it is open. Opened with the mouse: Escape closes
 * the panel and leaves playback open and the editor's own Escape untouched; the next Escape closes
 * playback (and still never reaches the editor). A mouse open leaves the keyboard focus where it was,
 * so Space still plays and pauses. Opened with the keyboard (Tab to Show, Enter): focus moves into
 * the panel, and Escape closes it with focus back on the Show button. Playback is closed and opened
 * again in the middle of the check; it is left open, panel shut.
 *
 * Proven red 2026-11-14 by one temporary edit to PlaybackOverlay.tsx, the `data-esc-close` branch taken out
 * (Escape closes playback with the panel open, and the editor's Escape fires once playback is shut):
 *   STEP FAIL 30 Escape closes the Show panel first and playback next, never the editor; … — mouse: opened true, Space played true then paused true; Escape → panel gone true, playback still open false, editor Escapes 0 → 0; Escape → playback closed true, editor Escapes → 1; keyboard: Tab reached Show true, Enter opened true, focus inside true; Escape → panel gone true, focus on Show false, playback still open false, editor Escapes → 1
 * (The checks after it then find no playback and stop: the run ends with "STEP FAIL run — TypeError".)
 *
 * It also caught a real fault on its first run: the panel closed through a custom event, which React
 * does not treat as urgent, so on a slow frame the panel was still on screen when the next Escape
 * arrived and that one shut the panel again instead of leaving playback. ShowMenu now shuts it
 * with flushSync, before the Escape returns.
 *
 * The last part (opened from the keyboard, shut with the mouse, focus ends on the Show button) was
 * proven red 2026-11-15 with ShowMenu's two "hand the focus to the button" lines taken out: the focus
 * was left on the vanished panel, and the next Enter then opened nothing:
 *   STEP FAIL 30 … — … keyboard open then mouse on Show: opened true, shut true, focus on Show false; keyboard open then mouse on 1×: opened false, shut true, focus on Show false
 */
async function checkShowKeys(page) {
  const c = () => pbEval(page, () => ({ ...__pb.counters }));
  const panelOpen = async () => (await page.locator('#pb-show').count()) === 1;
  const dialogOpen = async () => (await page.locator('[role="dialog"]').count()) === 1;
  const playing = async () => (await pbEval(page, () => __pb.snapshot())).playing;

  const e0 = (await c()).editorEscapes;
  await pbEval(page, () => { __pb.pause(); __pb.seek(__pb.snapshot().start); });
  await page.getByRole('button', { name: 'Show ▾' }).click();
  const openByMouse = await panelOpen();
  await page.keyboard.press(' ');
  const spacePlays = await playing();
  await page.keyboard.press(' ');
  const spacePauses = !(await playing());
  await page.keyboard.press('Escape');
  const panelGoneFirst = !(await panelOpen());
  const dialogStays = await dialogOpen();
  const e1 = (await c()).editorEscapes;
  await page.keyboard.press('Escape');
  const closedSecond = await dialogGone(page).then(() => true, () => false);
  const e2 = (await c()).editorEscapes;
  if (!closedSecond) {
    // A failed check must still leave the page usable for the checks after it.
    await pbEval(page, () => __pb.close());
    await dialogGone(page);
  }

  await page.click('[data-testid="opener"]');
  await page.waitForSelector('[role="dialog"]');
  await waitReady(page);
  // Tab to the Show button the way a keyboard user gets there.
  let onShow = false;
  for (let i = 0; i < 40 && !onShow; i++) {
    await page.keyboard.press('Tab');
    onShow = await pbEval(page, () => document.activeElement?.getAttribute('aria-controls') === 'pb-show');
  }
  await page.keyboard.press('Enter');
  const openByKey = await panelOpen();
  const focusIn = await pbEval(page, () => !!document.querySelector('#pb-show')?.contains(document.activeElement));
  await page.keyboard.press('Escape');
  const panelGoneSecond = !(await panelOpen());
  const focusOnShow = await pbEval(page, () => document.activeElement?.getAttribute('aria-controls') === 'pb-show');
  const dialogStaysSecond = await dialogOpen();
  const e3 = (await c()).editorEscapes;

  // Opened from the keyboard, shut with the mouse (which leaves focus where it was): the focus must
  // end on the Show button, not on the panel that has just gone. Once by the Show button itself,
  // once by a press outside the panel (a speed button).
  const focusOnShowNow = () => pbEval(page, () => document.activeElement?.getAttribute('aria-controls') === 'pb-show');
  await page.keyboard.press('Enter');
  const reopened = await panelOpen();
  await page.getByRole('button', { name: 'Show ▾' }).click();
  const shutByButton = !(await panelOpen());
  const focusAfterButton = await focusOnShowNow();
  await page.keyboard.press('Enter');
  const reopenedAgain = await panelOpen();
  await page.getByRole('button', { name: '1×', exact: true }).click();
  const shutByOutside = !(await panelOpen());
  const focusAfterOutside = await focusOnShowNow();

  step('30 Escape closes the Show panel first and playback next, never the editor; Space plays after a mouse open; Tab, Enter and Escape work by keyboard; a mouse close keeps the focus',
    openByMouse && spacePlays && spacePauses && panelGoneFirst && dialogStays && e1 === e0 && closedSecond && e2 === e0 && openByKey && onShow && focusIn && panelGoneSecond && focusOnShow && dialogStaysSecond && e3 === e0
      && reopened && shutByButton && focusAfterButton && reopenedAgain && shutByOutside && focusAfterOutside,
    `mouse: opened ${openByMouse}, Space played ${spacePlays} then paused ${spacePauses}; Escape → panel gone ${panelGoneFirst}, playback still open ${dialogStays}, editor Escapes ${e0} → ${e1}; Escape → playback closed ${closedSecond}, editor Escapes → ${e2}; keyboard: Tab reached Show ${onShow}, Enter opened ${openByKey}, focus inside ${focusIn}; Escape → panel gone ${panelGoneSecond}, focus on Show ${focusOnShow}, playback still open ${dialogStaysSecond}, editor Escapes → ${e3}; keyboard open then mouse on Show: opened ${reopened}, shut ${shutByButton}, focus on Show ${focusAfterButton}; keyboard open then mouse on 1×: opened ${reopenedAgain}, shut ${shutByOutside}, focus on Show ${focusAfterOutside}`);
}

/**
 * Check 31: with the Show panel open the view's own buttons fit. The panel lies inside the picture;
 * the toolbar (the four cameras, Home view and Show) lies inside it too and clear of the title plate
 * (to its right); the dev frame-time box (bottom right, shown here because the checks run on the dev server; the check
 * plays a second first so there is a frame time to show) does not touch them; and every button on
 * the page lies inside the window. Run at both sizes; 1024×768 is the tight one.
 *
 * Proven red 2026-11-14, one temporary edit each, all three clauses:
 * the frame-time box back at `top-2 right-3` in PlaybackView.tsx (it lands on the buttons):
 *   STEP FAIL 31 Show open: panel inside the picture, buttons clear of the title and of the frame-time box (1024x768) — canvas [0,45,1024,605], panel [724,85,1012,151], buttons [868,53,1012,79], title [12,53,107,77], frame-time [787,53,1012,73]
 * the toolbar's row `justify-start pl-3` in place of `justify-end pr-3` in ViewToolbar.tsx (the buttons land on the title):
 *   STEP FAIL 31 … (1024x768) — canvas [0,45,1024,605], panel [724,85,1012,151], buttons [12,53,156,79], title [12,53,107,77], frame-time [787,577,1012,597]
 * `right-[-60px]` in place of `right-3` in MENU_PANEL, ui.ts (the panel runs past the picture):
 *   STEP FAIL 31 … (1024x768) — canvas [0,45,1024,605], panel [796,85,1084,151], buttons [868,53,1012,79], title [12,53,107,77], frame-time [787,577,1012,597]
 * (Taking `max-h-[…]` out of MENU_PANEL cannot fail this check yet: the panel holds one choice and
 * is short. It becomes a proof once the panel holds enough to need scrolling.)
 * With the camera buttons in the toolbar, the second proof again (2026-11-14, `justify-start pl-3`):
 *   STEP FAIL 31 … (1024x768) — canvas [0,45,1024,605], panel [724,85,1012,151], buttons [12,53,449,79], title [12,53,107,77], frame-time [787,577,1012,597]
 * (green at 1024×768: buttons [575,53,1012,79], 468 px clear of the title's right edge.)
 */
async function checkToolbarFit(page, tag, w, h) {
  await pbEval(page, async () => {
    __pb.pause();
    __pb.seek(__pb.snapshot().start);
    __pb.play();
    await new Promise((r) => setTimeout(r, 1200));
    __pb.pause();
  });
  await page.waitForTimeout(700); // the readout polls twice a second
  await page.getByRole('button', { name: 'Show ▾' }).click();
  await settle(page);
  await shot(page, `${tag}-31-show-open`);
  const r = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const box = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom };
    };
    const buttons = [...dialog.querySelectorAll('button')];
    const byText = (s) => buttons.find((b) => (b.textContent || '').trim() === s);
    const frame = [...dialog.querySelectorAll('div')].find((d) => d.children.length === 0 && /^dev: /.test((d.textContent || '').trim()));
    // The toolbar's buttons: the four cameras, Home view and Show.
    const toolbar = ['Orbit', 'Top-down', 'From target', 'Home view', 'Show ▾'].map(byText)
      .concat(buttons.filter((b) => /^Chase #\d+$/.test((b.textContent || '').trim())));
    return {
      canvas: box(dialog.querySelector('canvas')),
      panel: box(dialog.querySelector('#pb-show')),
      toolbar: toolbar.map(box),
      title: box(dialog.querySelector('[class*="max-w-"]')),
      frame: box(frame),
      buttons: buttons.map((b) => ({ name: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 24), ...box(b) })),
    };
  });
  await page.getByRole('button', { name: 'Show ▾' }).click(); // shut again
  const inside = (a, o) => a && o && a.l >= o.l - 0.5 && a.t >= o.t - 0.5 && a.r <= o.r + 0.5 && a.b <= o.b + 0.5;
  const touch = (a, o) => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t;
  const found = r.canvas && r.panel && r.toolbar.length === 6 && r.toolbar.every(Boolean) && r.title && r.frame;
  const tool = found
    ? { l: Math.min(...r.toolbar.map((b) => b.l)), t: Math.min(...r.toolbar.map((b) => b.t)), r: Math.max(...r.toolbar.map((b) => b.r)), b: Math.max(...r.toolbar.map((b) => b.b)) }
    : null;
  const outside = r.buttons.filter((b) => b.l < 0 || b.t < 0 || b.r > w + 0.5 || b.b > h + 0.5);
  const ok = !!found && inside(r.panel, r.canvas) && inside(tool, r.canvas) && r.title.r < tool.l && !touch(r.frame, tool) && outside.length === 0;
  const fmt = (b) => (b ? `[${[b.l, b.t, b.r, b.b].map(Math.round)}]` : 'missing');
  step(`31 Show open: panel inside the picture, buttons clear of the title and of the frame-time box (${tag})`, ok,
    `canvas ${fmt(r.canvas)}, panel ${fmt(r.panel)}, buttons ${tool ? fmt(tool) : 'missing'}, title ${fmt(r.title)}, frame-time ${fmt(r.frame)}${outside.length ? `; outside the window: ${outside.map((b) => b.name).join(', ')}` : ''}`);
}

/** Lose the WebGL context, give it back, and wait for the rebuilt scene: true when it came back. */
async function loseAndRestore(page) {
  const before = await pbEval(page, () => __pb.stats().sceneCreates);
  const lostOk = await pbEval(page, () => __pb.loseContext());
  await page.waitForTimeout(400);
  const note = await page.locator('[role="dialog"]').innerText();
  const restoring = /interrupted by the graphics driver/.test(note);
  await pbEval(page, () => __pb.restoreContext());
  let remounted = true;
  try {
    await page.waitForFunction((b) => __pb.stats().sceneCreates > b && __pb.ready, before, { timeout: 20000, polling: 100 });
  } catch {
    remounted = false;
  }
  const after = await pbEval(page, () => __pb.stats().sceneCreates);
  return { lostOk, restoring, remounted, before, after };
}

/**
 * Check 5: a lost WebGL context is rebuilt when it comes back, and the jet is drawn again (5a, 5b).
 * 5c: the rebuilt scene keeps the camera mode, Show › Whole run-in and the time bar's range: with
 * Top-down pressed and Whole run-in on, after a loss and a rebuild Top-down is still pressed and the
 * camera still looks straight down (its point within 1% of its height to one side), Whole run-in is
 * still on, and the time bar starts and ends where it did.
 *
 * 5c proven red 2026-11-14 by one temporary edit to PlaybackView.tsx, the camera handed to the scene
 * made once at open (`useMemo(() => ({ mode, jet: WATCHED_JET }), [])`: a rebuild opens in Chase again):
 *   STEP FAIL 5c after a rebuild: the camera mode, Whole run-in and the time bar are kept — rebuilt true (sceneCreates 10 → 12); pressed ["Top-down"] → ["Chase #1"]; camera lean 3.3333 of its height; Whole run-in true → true; time bar -151.15…40.00 → -151.15…40.00
 * (5b goes red with it: its rebuild opened in Chase instead of at Home.)
 */
async function checkContextLoss(page, tag) {
  const a = await loseAndRestore(page);
  step('5a context loss: "restoring" shown, then the scene rebuilt', a.lostOk && a.restoring && a.remounted, `lose ${a.lostOk}, note shown ${a.restoring}, sceneCreates ${a.before} → ${a.after}`);
  if (!a.remounted) return;
  await checkJet(page, `${tag}-rebuilt`, '5b after the rebuild, the jet arrow on screen');

  await pbEval(page, () => __pb.setRange(true));
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  await settle(page);
  const was = await pbEval(page, () => ({ snap: __pb.snapshot(), whole: __pb.show().wholeRunIn }));
  const wasPressed = await pressedCamera(page);
  const b = await loseAndRestore(page);
  await settle(page);
  const now = await pbEval(page, () => ({ snap: __pb.snapshot(), whole: __pb.show().wholeRunIn, cam: __pb.camera() }));
  const nowPressed = await pressedCamera(page);
  const c = now.cam;
  const lean = c ? Math.hypot(c.x - c.target.x, c.z - c.target.z) / Math.max(1e-9, c.y - c.target.y) : Infinity;
  const same = (x, y) => Math.abs(x - y) <= 0.01;
  step('5c after a rebuild: the camera mode, Whole run-in and the time bar are kept',
    b.remounted && wasPressed.join() === 'Top-down' && nowPressed.join() === 'Top-down' && lean < 0.01 && was.whole === true && now.whole === true &&
      same(now.snap.start, was.snap.start) && same(now.snap.end, was.snap.end),
    `rebuilt ${b.remounted} (sceneCreates ${b.before} → ${b.after}); pressed ${JSON.stringify(wasPressed)} → ${JSON.stringify(nowPressed)}; camera lean ${lean.toFixed(4)} of its height; Whole run-in ${was.whole} → ${now.whole}; time bar ${was.snap.start.toFixed(2)}…${was.snap.end.toFixed(2)} → ${now.snap.start.toFixed(2)}…${now.snap.end.toFixed(2)}`);
  await pbEval(page, () => __pb.goHome());
}

/**
 * Check 9: focus, Escape, Space, Tab and clicks stay inside playback. (9e's "Home view" is the
 * button in the toolbar over the picture, beside Show.)
 */
async function checkOverlay(page) {
  const c = () => pbEval(page, () => ({ ...__pb.counters }));
  const inside = () => pbEval(page, () => {
    const d = document.querySelector('[role="dialog"]');
    return !!d && d.contains(document.activeElement);
  });

  // Escape closes playback and nothing else (the fake editor's Escape listener must not fire).
  const e0 = (await c()).editorEscapes;
  await page.keyboard.press('Escape');
  await dialogGone(page);
  const e1 = (await c()).editorEscapes;
  await page.keyboard.press('Escape'); // with playback closed, the editor's listener does fire: proves it listens
  const e2 = (await c()).editorEscapes;
  step('9a Escape closes playback and nothing else', e1 === e0 && e2 === e0 + 1, `editor Escapes ${e0} → ${e1} with playback open, → ${e2} once closed`);

  // Opening takes focus into the overlay; closing gives it back to the opener.
  await page.click('[data-testid="opener"]');
  await page.waitForSelector('[role="dialog"]');
  const focusedIn = await inside();
  await waitReady(page);
  await page.keyboard.press('Escape');
  await dialogGone(page);
  const backToOpener = await pbEval(page, () => document.activeElement?.getAttribute('data-testid') === 'opener');
  step('9b focus moves into playback on open and back to the opener on close', focusedIn && backToOpener, `in ${focusedIn}, back ${backToOpener}`);

  // Space plays and pauses; it does not press the button that had focus before playback opened.
  await page.focus('[data-testid="sentinel"]');
  const s0 = (await c()).sentinel;
  await pbEval(page, () => __pb.open());
  await page.waitForSelector('[role="dialog"]');
  await waitReady(page);
  await pbEval(page, () => { __pb.pause(); __pb.seek(__pb.moments.t0); });
  await page.keyboard.press(' ');
  const p1 = (await pbEval(page, () => __pb.snapshot())).playing;
  await page.keyboard.press(' ');
  const p2 = (await pbEval(page, () => __pb.snapshot())).playing;
  const s1 = (await c()).sentinel;
  step('9c Space toggles play and does not press the button underneath', p1 === true && p2 === false && s1 === s0, `playing ${p1} then ${p2}; sentinel presses ${s0} → ${s1}`);

  // Tab and Shift+Tab never leave playback.
  let stayed = true;
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(i < 20 ? 'Tab' : 'Shift+Tab');
    stayed = stayed && (await inside());
    seen.add(await pbEval(page, () => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 12) || document.activeElement?.tagName));
  }
  step('9d Tab never leaves playback', stayed && seen.size > 3, `20 Tab + 10 Shift+Tab, all inside: ${stayed}; ${seen.size} different stops`);

  // Clicks inside playback never reach the ancestor's onClick.
  const a0 = (await c()).ancestorClicks;
  // The first canvas is the 3D one; the labels' overlay canvas lies over it and lets clicks through.
  const cv = await page.locator('[role="dialog"] canvas').first().boundingBox();
  await page.mouse.click(cv.x + cv.width / 2, cv.y + cv.height / 2);
  await page.getByRole('button', { name: 'Home view' }).click();
  await page.getByRole('button', { name: '2×' }).click();
  await page.getByRole('button', { name: '1×' }).click();
  const a1 = (await c()).ancestorClicks;
  await page.keyboard.press('Escape');
  await dialogGone(page);
  await page.click('[data-testid="editor-heading"]');
  const a2 = (await c()).ancestorClicks;
  step('9e clicks inside playback do not reach the editor underneath', a1 === a0 && a2 === a0 + 1, `ancestor clicks ${a0} → ${a1} after 4 clicks in playback, → ${a2} after one on the editor`);
}

/**
 * Check 4: open and close 20 times: every close frees every geometry and texture.
 *
 * Proven red 2026-11-14 (terrainLayer.ts, one geometry made without `bag.add`):
 *   STEP FAIL 4 open and close 20 times, nothing left behind — leaks #1: {"geometries":1,"textures":0}; #2: {"geometries":1,"textures":0}; …
 */
async function checkOpenClose(page, label = '4 open and close 20 times, nothing left behind') {
  const leaks = [];
  for (let i = 0; i < 20; i++) {
    await page.click('[data-testid="opener"]');
    await waitReady(page, 30000);
    await page.keyboard.press('Escape');
    await dialogGone(page);
    const leak = await pbEval(page, () => __pb.lastLeak);
    if (!leak || leak.geometries !== 0 || leak.textures !== 0) leaks.push(`#${i + 1}: ${JSON.stringify(leak)}`);
  }
  const counts = await pbEval(page, () => __pb.stats());
  step(label, leaks.length === 0 && counts.liveScenes === 0,
    `${leaks.length ? `leaks ${leaks.join('; ')}` : 'every close {geometries 0, textures 0}'}; scenes created ${counts.sceneCreates}, alive ${counts.liveScenes}`);
}

// ── The strike: every jet drawn (the four-ship, the skip variant, a late wingman).

// Each seat's colour as the arrows wear it (JET_COLORS: cyan, magenta, lime, amber), one test per seat.
// None matches a drape colour or the navy background (the drape checks run beside them). The planner's
// colours can: the egress green passes limeLike, and the climb yellow and the pull-down orange pass
// amberLike, so each count is taken right round an arrow and its floor sits above what the lines
// there give without the arrow (measured below).
const magentaLike = (p) => p[0] > p[1] + 60 && p[2] > p[1] + 60;
const limeLike = (p) => p[1] > p[2] + 100 && p[1] > p[0] + 30;
const amberLike = (p) => p[0] > p[2] + 120 && p[1] > p[2] + 80 && p[0] >= p[1];
const SEAT_LIKE = [jetLike, magentaLike, limeLike, amberLike];

/**
 * Home on the default range, paused at the moment every flown jet is in the picture and the arrows are
 * farthest apart (the smallest gap between two of them as large as it gets, every arrow 30 px inside the
 * canvas), searched every 2 s. Returns that time and the gap. The search projects the jets' positions
 * from the source through the camera standing still at Home, and seeks once, at the end: a seek and a
 * draw per candidate cost the software renderer seconds.
 */
async function spreadMoment(page) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.goHome(); });
  await settle(page);
  return pbEval(page, () => {
    const src = __pb.source(), n = __pb.moments.jets.length, snap = __pb.snapshot();
    const c = document.querySelector('[role="dialog"] canvas').getBoundingClientRect();
    let from = snap.start, to = snap.end;
    for (let k = 0; k < n; k++) {
      from = Math.max(from, src.visibleFromOf(k));
      to = Math.min(to, src.hideOf(k));
    }
    const pose = {};
    let best = null, gap = -1;
    for (let t = from + 1; t <= to - 1; t += 2) {
      const ps = [];
      for (let k = 0; k < n; k++) {
        src.jetAt(k, t, pose);
        ps.push(pose.visible ? __pb.projectPoint(pose.x, -pose.z, pose.y) : null);
      }
      if (ps.some((p) => !p || p[0] < c.left + 30 || p[0] > c.right - 30 || p[1] < c.top + 30 || p[1] > c.bottom - 30)) continue;
      let d = Infinity;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) d = Math.min(d, Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]));
      if (d > gap) { gap = d; best = t; }
    }
    if (best !== null) __pb.seek(best);
    return { t: best, gap };
  });
}

/**
 * Check 10: every jet of the four-ship is drawn, each in its own seat's colour. At the spread moment
 * (above), with the 2D overlay hidden (the labels and discs lie over the arrows), within ARROW_PATCH px
 * of where the scene puts each jet's arrow (`project(k)`) at least SEAT_MIN pixels pass that seat's
 * colour test: cyan #1, magenta #2, lime #3, amber #4.
 *
 * SEAT_MIN: measured 2026-11-15. Green: 188 / 112 / 145 / 131 px (#1…#4) at 1400×900, 185 / 111 / 145 /
 * 134 at 1024×768, and #3 on the skip variant (check 20) 161. With every arrow shrunk to nothing
 * (jetLayer.ts afterCamera, the arrow's scale × 1e-6) the lines alone give 0 / 34 / 37 / 23 and 0 / 34 /
 * 32 / 25 (the other jets' trails run into their arrows in the seat colour), and 24 on the skip variant.
 * The floor of 70 sits between, with room for the software renderer, so the count is the arrow's.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/jetLayer.ts, every jet coloured as seat 0
 * (`jetColor(0)` for `jetColor(src.seatOf(jet))`; run again the same day after the layer lost its
 * colour option, the same lines):
 *   STEP FAIL 10 every jet of the four-ship drawn, each in its seat's colour (1400x900-strike4) — 4 jets; t -1.2 (arrows 89 px apart at the closest); #1 at 872,354: 188 px; #2 at 784,341: 0 px; #3 at 704,387: 0 px; #4 at 623,439: 0 px (need 70)
 *   STEP FAIL 10 … (1024x768-strike4) — …; #1 at 641,293: 185 px; #2 at 575,283: 0 px; #3 at 515,318: 0 px; #4 at 454,357: 0 px (need 70)
 * and by the arrow-shrink edit above (at a floor of 40 then: #2 34, #3 37, #4 23 px, red).
 */
const SEAT_MIN = 70;
async function checkFourArrows(page, tag) {
  const spread = await spreadMoment(page);
  await settle(page, 300);
  const n = await pbEval(page, () => __pb.moments.jets.length);
  await overlay(page, false);
  let img;
  try {
    img = await shot(page, `${tag}-10-four-arrows`);
  } finally {
    await overlay(page, true);
  }
  const parts = [];
  let ok = n === 4 && spread.t !== null;
  for (let k = 0; k < n; k++) {
    const p = await pbEval(page, (j) => __pb.project(j, 'jet'), k);
    const seat = await pbEval(page, (j) => __pb.moments.jets[j].seat, k);
    const c = p ? patch(img, p.map(Math.round), ARROW_PATCH).filter(SEAT_LIKE[seat]).length : 0;
    ok = ok && c >= SEAT_MIN;
    parts.push(`#${seat + 1} at ${p ? p.map(Math.round) : 'none'}: ${c} px`);
  }
  step(`10 every jet of the four-ship drawn, each in its seat's colour (${tag})`, ok,
    `${n} jets; t ${spread.t === null ? 'none' : spread.t.toFixed(1)} (arrows ${spread.gap.toFixed(0)} px apart at the closest); ${parts.join('; ')} (need ${SEAT_MIN})`);
}

/**
 * Check 11 (four jets): every jet's label. At the spread moment: four labels, none overlapping, their
 * first lines "#1 Viper 1-1" … "#4 Viper 1-4" (one each), each with its altitude and speed; Show ›
 * Labels unticked, four one-line labels; ticked again, two lines each.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/createScene.ts, the label layer given only the
 * first jet layer (`jets: jets.slice(0, 1)`):
 *   STEP FAIL 11 four jets' labels: one each, none overlapping; Labels off leaves one line each (1400x900-strike4) — on: 1 labels [#1 Viper 1-1], lines 2, overlapping false; off: 1 labels, lines 1; on again: lines 2
 *   STEP FAIL 11 … (1024x768-strike4) — the same
 */
async function checkFourLabels(page, tag) {
  await spreadMoment(page);
  await settle(page, 300);
  const on = await pbEval(page, () => __pb.debugLabels());
  await shot(page, `${tag}-11-four-labels`);
  await page.getByRole('button', { name: 'Show ▾' }).click();
  const box = page.getByRole('checkbox', { name: /^Labels/ });
  await box.click();
  await settle(page, 300);
  const off = await pbEval(page, () => __pb.debugLabels());
  await box.click();
  await settle(page, 300);
  const back = await pbEval(page, () => __pb.debugLabels());
  await page.getByRole('button', { name: 'Show ▾' }).click(); // shut it again
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const overlaps = (ls) => ls.some((a, i) => ls.some((b, j) => j > i && overlap(a, b)));
  const firsts = (ls) => ls.map((l) => l.lines[0]).sort().join(' | ');
  const want = '#1 Viper 1-1 | #2 Viper 1-2 | #3 Viper 1-3 | #4 Viper 1-4';
  step(`11 four jets' labels: one each, none overlapping; Labels off leaves one line each (${tag})`,
    on.jets.length === 4 && firsts(on.jets) === want && on.jets.every((l) => l.lines.length === 2) && !overlaps(on.jets) &&
      off.jets.length === 4 && off.jets.every((l) => l.lines.length === 1) && firsts(off.jets) === want &&
      back.jets.length === 4 && back.jets.every((l) => l.lines.length === 2),
    `on: ${on.jets.length} labels [${firsts(on.jets)}], lines ${on.jets.map((l) => l.lines.length).join('/')}, overlapping ${overlaps(on.jets)}; off: ${off.jets.length} labels, lines ${off.jets.map((l) => l.lines.length).join('/')}; on again: lines ${back.jets.map((l) => l.lines.length).join('/')}`);
}

/**
 * Check 15b: Top-down is north up over the whole strike: #3's target (TGT2, 2 nm on 160° from TGT1) is
 * right of and below #1's on screen, both inside the canvas.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/createScene.ts, project's target looked up for
 * the default jet whatever jet is asked (`source.targetIndexOf(jet)` for `source.targetIndexOf(j)`):
 *   STEP FAIL 15b Top-down: #3's target (TGT2) right of and below #1's (1400x900-strike4) — pressed true; #1's target at 495,509, #3's at 495,509
 *   STEP FAIL 15b … (1024x768-strike4) — pressed true; #1's target at 361,408, #3's at 361,408
 * (green: #3's at 539,631 and 394,497.)
 */
async function checkTopDownTargets(page, tag) {
  await pbEval(page, () => __pb.pause());
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  await settle(page, 300);
  const t1 = await pbEval(page, () => __pb.project(0, 'target'));
  const t3 = await pbEval(page, () => __pb.project(2, 'target'));
  const cv = await canvasBox(page);
  await shot(page, `${tag}-15b-top-down`);
  const inside = (q) => !!q && q[0] >= cv.l && q[0] <= cv.l + cv.w && q[1] >= cv.t && q[1] <= cv.t + cv.h;
  const pressed = (await pressedCamera(page)).join() === 'Top-down';
  step(`15b Top-down: #3's target (TGT2) right of and below #1's (${tag})`,
    pressed && inside(t1) && inside(t3) && t3[0] > t1[0] + 5 && t3[1] > t1[1] + 5,
    `pressed ${pressed}; #1's target at ${t1 ? t1.map(Math.round) : 'none'}, #3's at ${t3 ? t3.map(Math.round) : 'none'}`);
  await pbEval(page, () => __pb.goHome());
}

/**
 * Check 10b: Show › Attack colours moves the planner's colour code. The four-ship watching #1, Top-down,
 * paused at the start of the time bar (no arrow or trail on #2's climb yet), the choice made on the real
 * menu so the view's hand-over to the scene is part of what is tested:
 * - Watched jet (as it opens): #1's discs are full size (DISC_R), every other jet's are small
 *   (DISC_OTHER_R); #2's climb, between its pull-up and pull-down discs, is #2's magenta, not the
 *   climb's yellow.
 * - All jets: every disc full size; the same stretch is the climb's yellow, with no magenta left.
 * - Watched jet again: the small discs are back.
 * The 2D overlay is hidden for the two shots (the discs lie over the lines).
 *
 * OTHER_CLIMB_MIN: measured 2026-11-15 on the first green run. Along 41 px of #2's climb: 41 magenta
 * and 0 yellow px with Watched jet, 0 magenta and 65 yellow with All jets at 1400×900; 39 and 0, then
 * 0 and 64, at 1024×768 (the other jets' line is thinner, so fewer pixels). The floor sits at about
 * half of the smaller count, room for the software renderer. Neither test matches a drape colour, its
 * hillshade or the navy background.
 *
 * Proven red 2026-11-15, each by one temporary edit:
 * - PlaybackView.tsx, the choice never handed to the scene (`scene?.setAttackColours(…)` taken out):
 *     STEP FAIL 10b Show › Attack colours: the colour code and the full-size discs on the watched jet, or on every jet (1400x900-strike4) — #2's climb (745,422)→(657,519); Watched jet: #1's discs 10 px, the others' 12 at 7 px, climb 41 magenta and 0 yellow px; All jets: #1's 10 px, the others' 12 at 7 px, climb 41 magenta and 0 yellow px (need 20 of the one, ≤ 5 of the other); Watched jet again: the others' 12 at 7 px
 *     STEP FAIL 10b … (1024x768-strike4) — …; All jets: #1's 10 px, the others' 12 at 7 px, climb 39 magenta and 0 yellow px …
 * - scene/jetLayer.ts, the lines deaf to the choice (`wantCoded` without `ctx.attackColours === 'all'`):
 *   the discs change and the lines do not, so the pixel half fails on its own:
 *     STEP FAIL 10b … (1400x900-strike4) — …; All jets: #1's 10 px, the others' 13 at 10 px, climb 41 magenta and 0 yellow px …
 *     STEP FAIL 10b … (1024x768-strike4) — …; All jets: #1's 10 px, the others' 13 at 10 px, climb 39 magenta and 0 yellow px …
 * - scene/labelLayer.ts, the discs deaf to the choice (`isCoded` without `mode === 'all'`): the lines
 *   change and the discs do not, so the disc half fails on its own:
 *     STEP FAIL 10b … (1400x900-strike4) — …; All jets: #1's 10 px, the others' 12 at 7 px, climb 0 magenta and 65 yellow px …
 *     STEP FAIL 10b … (1024x768-strike4) — …; All jets: #1's 10 px, the others' 12 at 7 px, climb 0 magenta and 64 yellow px …
 */
const DISC_R = 10, DISC_OTHER_R = 7; // MARKER_R_PX and MARKER_OTHER_R_PX in sceneStyle.ts
const OTHER_CLIMB_MIN = 20;
async function checkAttackColours(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.goHome(); __pb.seek(__pb.snapshot().start); });
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  await settle(page, 300);
  const climb = await pbEval(page, () => {
    const ms = __pb.source().markers(1);
    const at = (kind) => {
      const m = ms.find((q) => q.kind === kind);
      return m ? __pb.projectPoint(m.x, -m.z, m.y) : null;
    };
    return { pop: at('POP'), pdp: at('PDP') };
  });
  const mid = climb.pop && climb.pdp ? [(climb.pop[0] + climb.pdp[0]) / 2, (climb.pop[1] + climb.pdp[1]) / 2] : null;
  const choose = async (name) => {
    await page.getByRole('button', { name: 'Show ▾' }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Show ▾' }).click(); // shut it again: the panel lies over the picture
    await settle(page, 300);
  };
  const discs = () => pbEval(page, () => {
    const s = __pb.source();
    const mine = new Set(s.markers(0).map((m) => m.key));
    for (const p of s.labelPoints(0)) if (p.kind === 'ip') mine.add(p.key);
    const ms = __pb.debugLabels().markers;
    const radii = (list) => [...new Set(list.map((m) => m.r))].sort((a, b) => a - b).join('/') || 'none';
    const others = ms.filter((m) => !mine.has(m.key));
    return { watched: radii(ms.filter((m) => mine.has(m.key))), others: radii(others), nOthers: others.length };
  });
  const lines = async (name) => {
    await overlay(page, false);
    let img;
    try {
      img = await shot(page, `${tag}-10b-colours-${name}`);
    } finally {
      await overlay(page, true);
    }
    const n = (test) => (mid ? alongLine(img, climb.pop, climb.pdp, mid, 20, 3, test) : 0);
    return { seat: n(magentaLike), climb: n(climbLike) };
  };
  const w = { ...(await discs()), ...(await lines('watched')) };
  await choose('All jets');
  const a = { ...(await discs()), ...(await lines('all')) };
  await choose('Watched jet');
  const b = await discs();
  const fmt = (q) => (q ? `(${q.map(Math.round)})` : 'none');
  step(`10b Show › Attack colours: the colour code and the full-size discs on the watched jet, or on every jet (${tag})`,
    w.watched === `${DISC_R}` && w.others === `${DISC_OTHER_R}` && w.nOthers >= 3 && w.seat >= OTHER_CLIMB_MIN && w.climb <= 5 &&
      a.watched === `${DISC_R}` && a.others === `${DISC_R}` && a.nOthers >= w.nOthers && a.climb >= OTHER_CLIMB_MIN && a.seat <= 5 &&
      b.watched === `${DISC_R}` && b.others === `${DISC_OTHER_R}` && b.nOthers === w.nOthers,
    `#2's climb ${fmt(climb.pop)}→${fmt(climb.pdp)}; Watched jet: #1's discs ${w.watched} px, the others' ${w.nOthers} at ${w.others} px, climb ${w.seat} magenta and ${w.climb} yellow px; ` +
      `All jets: #1's ${a.watched} px, the others' ${a.nOthers} at ${a.others} px, climb ${a.seat} magenta and ${a.climb} yellow px (need ${OTHER_CLIMB_MIN} of the one, ≤ 5 of the other); ` +
      `Watched jet again: the others' ${b.nOthers} at ${b.others} px`);
  await pbEval(page, () => __pb.goHome());
}

// ── Moving a time over target on its lane (the four-ship): the handle on each diamond, the box, Reset.

/** Seat `n`'s (1-based) handle on its lane. */
const handleOf = (page, n) => page.locator(`[role="dialog"] [role="slider"][aria-label="#${n} time over target"]`);
/** Seat `n`'s box in its times cell. */
const boxOf = (page, n) => page.getByRole('spinbutton', { name: `#${n} time over target, seconds after T`, exact: true });
/** Seat `n`'s (1-based) lane axis box, page pixels. */
const laneAxisOf = (page, n) => page.locator(`[role="dialog"] [data-lane="${n - 1}"] [data-lane-axis]`).boundingBox();
/** The session's time over target of seat `n` (1-based), strike time. */
const totOf = (page, n) => pbEval(page, (i) => { const s = __pb.session(); return s.delays_s[s.memberIds[i]]; }, n - 1);
/** How many of the lanes' warning marks are showing, and on which seats (1-based). */
const warnSeats = (page) => page.$$eval('[role="dialog"] [data-readout]', (els) =>
  els.map((e) => ({ seat: Number(e.getAttribute('data-readout')) + 1, on: !!e.querySelector('[data-conflict-mark]') })).filter((x) => x.on).map((x) => x.seat));

/**
 * Take hold of seat `n`'s handle and move it along its lane to strike time `t` (the lane's scale as it is
 * when the hold begins, which is the clock's range). With `hold`, the pointer is left down: the caller lets
 * go with page.mouse.up(). Returns where the handle was taken.
 */
async function dragHandle(page, n, t, { hold = false, steps = 4 } = {}) {
  const h = await handleOf(page, n).boundingBox();
  const axis = await laneAxisOf(page, n);
  const snap = await pbEval(page, () => __pb.snapshot());
  const f = Math.min(Math.max((t - snap.start) / (snap.end - snap.start), 0), 1);
  const x = axis.x + axis.width * f;
  const cy = h.y + h.height / 2;
  await page.mouse.move(h.x + h.width / 2, cy);
  await page.mouse.down();
  await page.mouse.move(x, cy, { steps });
  if (!hold) await page.mouse.up();
  return { from: [h.x + h.width / 2, cy], to: [x, cy] };
}

/**
 * Check 12 (re-times): moving a time over target swaps the source in the live scene, never rebuilds it. On
 * the four-ship: #1 has a plain diamond and #2, #3 and #4 each a handle (three sliders); paused at #2's first
 * action, #2's handle dragged 20 s later (10 s → 30 s) moves its arrow on screen (at least 20 px) while the
 * clock stands still, its times cell reads "TOT T+0:30" with 30 in its box and Reset is on; then 30 more
 * drags of #2 in a row; then Reset, and #2's arrow is where it was (1 px), its cell reads 10 again and Reset is
 * greyed. Through it all the scene is never created again and no tile is asked for again.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/createScene.ts, setSource returning at once (the
 * scene keeps drawing the old timing; 34 and 5c go red with it):
 *   STEP FAIL 12 moving a time over target swaps the source in the live scene: … (1400x900-strike4) — sliders 3 (#2 time over target, #3 time over target, #4 time over target), seat #1's plain diamond 1; Reset on at the start false; #2 +20 s: arrow moved 0.0 px (want ≥ 20), clock still true, time 30, cell "TOT T+0:30\ns\n⚠\npush IP T-1:33", box 30, Reset on true; after 30 drags and Reset: 0.00 px from where it was (want ≤ 1), time 10, cell "TOT T+0:10\ns\n⚠\npush IP T-1:53", box 10, Reset on false; sceneCreates 2 → 2; tile requests 175 → 175
 * (green: arrow moved 145.0 px, back 0.00 px.)
 *
 * The thirty drags end on the plan's own 10 s (the last of them lands there), where Reset is greyed (a time
 * dragged away and back is clean) and Playwright will not click it; one more drag, to 20 s, comes first.
 */
async function checkRetimes(page, tag) {
  const before = await pbEval(page, () => ({ creates: __pb.stats().sceneCreates, tiles: __pb.tileRequests() }));
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.goHome(); __pb.seek(__pb.moments.jets[1].firstAction); });
  await settle(page);
  const sliders = await page.$$eval('[role="dialog"] [role="slider"]', (els) => els.map((e) => e.getAttribute('aria-label')));
  const plainDiamonds = await page.$$eval('[role="dialog"] [data-lane="0"] [data-impact]', (els) => els.filter((e) => !e.closest('[role="slider"]')).length);
  const p0 = await pbEval(page, () => __pb.project(1, 'jet'));
  const readout = (n) => page.locator(`[role="dialog"] [data-readout="${n - 1}"]`).innerText();
  const resetOn = async () => (await page.locator('[role="dialog"] [data-reset]').getAttribute('aria-disabled')) === 'false';
  const off0 = await resetOn();
  await dragHandle(page, 2, 30);
  await settle(page);
  const p1 = await pbEval(page, () => __pb.project(1, 'jet'));
  const t1 = await pbEval(page, () => __pb.snapshot().t);
  const later = { tot: await totOf(page, 2), text: await readout(2), box: await boxOf(page, 2).inputValue(), reset: await resetOn() };
  for (let i = 0; i < 30; i++) {
    await dragHandle(page, 2, 10 + ((i * 7) % 11) * 4 - 20);
    if (i % 10 === 9) await settle(page, 50);
  }
  // The thirty land on the plan's own 10 s at the last (a time dragged away and back is clean, and Reset is greyed): one more, away from it.
  await dragHandle(page, 2, 20);
  await settle(page);
  await shot(page, `${tag}-12-drags`);
  await page.locator('[role="dialog"] [data-reset]').click();
  await settle(page);
  const p2 = await pbEval(page, () => __pb.project(1, 'jet'));
  const t2 = await pbEval(page, () => __pb.snapshot().t);
  const back = { tot: await totOf(page, 2), text: await readout(2), box: await boxOf(page, 2).inputValue(), reset: await resetOn() };
  const after = await pbEval(page, () => ({ creates: __pb.stats().sceneCreates, tiles: __pb.tileRequests() }));
  const d = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN);
  const moved = d(p0, p1), home = d(p0, p2);
  const sameClock = Math.abs(t2 - t1) < 1e-9;
  step(`12 moving a time over target swaps the source in the live scene: #2's handle moves it, 30 more drags, Reset puts it back, no new scene, no new tiles (${tag})`,
    sliders.join() === '#2 time over target,#3 time over target,#4 time over target' && plainDiamonds === 1 && !off0 &&
      moved >= 20 && sameClock && later.tot === 30 && /T\+0:30/.test(later.text) && later.box === '30' && later.reset &&
      home <= 1 && back.tot === 10 && /T\+0:10/.test(back.text) && back.box === '10' && !back.reset &&
      after.creates === before.creates && after.tiles === before.tiles,
    `sliders ${sliders.length} (${sliders.join(', ')}), seat #1's plain diamond ${plainDiamonds}; Reset on at the start ${off0}; #2 +20 s: arrow moved ${moved.toFixed(1)} px (want ≥ 20), clock still ${sameClock}, time ${later.tot}, cell ${JSON.stringify(later.text)}, box ${later.box}, Reset on ${later.reset}; ` +
      `after 30 drags and Reset: ${home.toFixed(2)} px from where it was (want ≤ 1), time ${back.tot}, cell ${JSON.stringify(back.text)}, box ${back.box}, Reset on ${back.reset}; sceneCreates ${before.creates} → ${after.creates}; tile requests ${before.tiles} → ${after.tiles}`);
}

/**
 * Check 34 (the drag part): while a handle is held the time bar and the lanes keep their scale, and when it
 * is let go both re-fit. On the four-ship at the default range, paused: #2's handle taken and moved to the
 * left end of its lane (60 s earlier, 10 s → -50 s), held: the clock's range is exactly as it was, the session
 * is dragging and #2's time is -50; let go: the range starts 10 s before the earliest first action (worked out
 * from the scene's own source) and ends where it did. Also on that: the warning marks are on all four seats
 * at the plan's times (each is in a frag conflict) and on #3 and #4 alone once #2 is clear of #1; each of
 * #2, #3 and #4's lanes shows stripes of its danger zones inside its axis, seat #1's none. The times are put
 * back with Reset.
 *
 * Measured green 2026-11-15: the range -50.15…80.00 held while #2's handle is held at -50 s, -100.15…80.00
 * once it is let go (#2's first action is then -90.15 s); marks on seats 1,2,3,4 then 3,4; three stripes on
 * each of #2, #3 and #4's lanes.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, an effect that sets the clock's range every
 * time the range changes (`useEffect(() => { sceneRef.current?.setRange(live); }, [live]);`): the bar then
 * moves under the handle while it is held:
 *   STEP FAIL 34 the time bar keeps its scale while a handle is held and re-fits when it is let go; … (1400x900-strike4) — held at -50 s (time -50, dragging true): range -100.15…80.00 vs -50.15…80.00 before (kept false); let go: -100.15…80.00, want -100.15…80.00 (re-fit true, dragging false); warning marks on seats 1,2,3,4 then 3,4 (want 1,2,3,4 then 3,4); stripes per lane #1: 0, #2: 3, #3: 3, #4: 3
 * (The same run with setSource returning at once, check 12's proof, also fails 34: the range is never re-fit, "let go: -50.15…80.00, want -50.15…80.00 (re-fit false".)
 */
async function checkDragRange(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  const start = await pbEval(page, () => __pb.snapshot());
  const marksBefore = await warnSeats(page);
  const zones = await page.$$eval('[role="dialog"] [data-lane]', (lanes) => lanes.map((l) => {
    const axis = l.querySelector('[data-lane-axis]').getBoundingClientRect();
    const z = [...l.querySelectorAll('[data-zone]')].map((e) => e.getBoundingClientRect());
    return { seat: Number(l.getAttribute('data-lane')), n: z.length, inside: z.every((b) => b.width > 0 && b.left >= axis.left - 1 && b.right <= axis.right + 1) };
  }));
  await dragHandle(page, 2, start.start, { hold: true, steps: 6 });
  await settle(page, 400);
  const during = await pbEval(page, () => ({ snap: __pb.snapshot(), dragging: __pb.session().dragging }));
  const heldTot = await totOf(page, 2);
  await shot(page, `${tag}-34-held`);
  await page.mouse.up();
  await settle(page, 600);
  const after = await pbEval(page, () => {
    const s = __pb.source();
    let first = Infinity;
    for (let k = 0; k < s.jetCount; k++) first = Math.min(first, s.firstActionOf(k));
    return { snap: __pb.snapshot(), dragging: __pb.session().dragging, want: first - 10 };
  });
  const marksAfter = await warnSeats(page);
  await shot(page, `${tag}-34-let-go`);
  await page.locator('[role="dialog"] [data-reset]').click();
  await settle(page);
  const kept = Math.abs(during.snap.start - start.start) < 1e-9 && Math.abs(during.snap.end - start.end) < 1e-9;
  const refit = Math.abs(after.snap.start - after.want) < 1e-6 && Math.abs(after.snap.end - start.end) < 1e-9 && after.snap.start < start.start - 40;
  const zonesOk = zones.length === 4 && zones[0].n === 0 && zones.slice(1).every((z) => z.n >= 1 && z.inside);
  step(`34 the time bar keeps its scale while a handle is held and re-fits when it is let go; warning marks follow the times; stripes of the danger zones on the lanes (${tag})`,
    kept && during.dragging && heldTot === -50 && !after.dragging && refit && marksBefore.join() === '1,2,3,4' && marksAfter.join() === '3,4' && zonesOk,
    `held at -50 s (time ${heldTot}, dragging ${during.dragging}): range ${during.snap.start.toFixed(2)}…${during.snap.end.toFixed(2)} vs ${start.start.toFixed(2)}…${start.end.toFixed(2)} before (kept ${kept}); let go: ${after.snap.start.toFixed(2)}…${after.snap.end.toFixed(2)}, want ${after.want.toFixed(2)}…${start.end.toFixed(2)} (re-fit ${refit}, dragging ${after.dragging}); ` +
      `warning marks on seats ${marksBefore.join(',')} then ${marksAfter.join(',')} (want 1,2,3,4 then 3,4); stripes per lane ${zones.map((z) => `#${z.seat + 1}: ${z.n}${z.inside ? '' : ' (outside the lane)'}`).join(', ')}`);
}

/**
 * Check 5c (the times): the rebuilt scene keeps the times over target. On the four-ship #2's time is typed
 * into its box (25, Enter), the graphics context is lost and given back, and after the rebuild the session
 * still has 25, the scene's own source is the re-timed one (#2's impact at 25), the box reads 25, Reset is on,
 * and the time bar starts and ends where it did. The times are put back with Reset.
 *
 * Proven red 2026-11-15 by two temporary edits to PlaybackView.tsx, the rebuilt scene made with the source the
 * playback opened with and the times not handed over afterwards (`source={source}` → `source={built.source}` in
 * the SceneHost's props, and the setSource effect's `[scene, source]` → `[source]`). Either edit alone leaves it
 * green: the scene is told its source twice, when it is made and again when it is up, and the check holds that
 * at least one of the two is kept:
 *   STEP FAIL 5c after a rebuild: the times over target are kept (1400x900-strike4) — rebuilt true (sceneCreates 2 → 4); #2's time 25 → 25; its impact in the scene's source 25 → 10; box 25; Reset on true; time bar -50.15…80.00 → -50.15…80.00
 * (The same run with setSource returning at once, check 12's proof, gives "its impact in the scene's source 10 → 25".)
 */
async function checkDelaysKept(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); });
  await boxOf(page, 2).click();
  await boxOf(page, 2).fill('25');
  await page.keyboard.press('Enter');
  await settle(page, 400);
  const read = () => pbEval(page, () => ({ snap: __pb.snapshot(), impact: __pb.source().impactOf(1) }));
  const was = { ...(await read()), tot: await totOf(page, 2) };
  const b = await loseAndRestore(page);
  await settle(page);
  const now = { ...(await read()), tot: await totOf(page, 2), box: await boxOf(page, 2).inputValue(), reset: (await page.locator('[role="dialog"] [data-reset]').getAttribute('aria-disabled')) === 'false' };
  const same = (x, y) => Math.abs(x - y) <= 0.01;
  step(`5c after a rebuild: the times over target are kept (${tag})`,
    b.remounted && was.tot === 25 && was.impact === 25 && now.tot === 25 && now.impact === 25 && now.box === '25' && now.reset && same(now.snap.start, was.snap.start) && same(now.snap.end, was.snap.end),
    `rebuilt ${b.remounted} (sceneCreates ${b.before} → ${b.after}); #2's time ${was.tot} → ${now.tot}; its impact in the scene's source ${was.impact} → ${now.impact}; box ${now.box}; Reset on ${now.reset}; time bar ${was.snap.start.toFixed(2)}…${was.snap.end.toFixed(2)} → ${now.snap.start.toFixed(2)}…${now.snap.end.toFixed(2)}`);
  await page.locator('[role="dialog"] [data-reset]').click();
  await settle(page);
}

/**
 * Check 17 (the handle and the box): the keyboard stays with playback. On the four-ship: #2's handle focused,
 * Space plays and pauses (a handle is not a control that wants Space); → adds a second to #2's time (10 → 11),
 * Shift+← takes five off (6), Page Up adds five (11), ↓ a second off (10), and Home and End do nothing; with
 * 25 typed into #2's box and Reset then pressed with the mouse (which leaves the focus in the box), the box
 * reads the 10 Reset put back, not the 25 left behind; then
 * with #2's box clicked into, Escape leaves the box and not playback (playback still open, the box not
 * focused, the editor's Escape untouched) and Space then plays and pauses; typing 25 in the box and pressing
 * Enter lets go of it (focus on playback, time 25) and Space plays and pauses again; and one more Escape
 * closes playback, still without reaching the editor. Playback is opened again for the checks after.
 *
 * Proven red 2026-11-15, each by one temporary edit:
 * - PlaybackOverlay.tsx, the number box's branch of the Escape handler taken out: Escape with the box
 *   focused closes playback, and what is left of the check is skipped:
 *   STEP FAIL 17 the handle and the box keep the keyboard: … (1400x900-strike4) — handle focused true, Space played and paused true; times after → Shift+← PgUp ↓ Home End: 11, 6, 11, 10, 10, 10 (want 11, 6, 11, 10, 10, 10); box focused true; Escape → playback still open false, box still focused false, editor Escapes 0 → 0, Space false; typed 25 and Enter → focus on none, time NaN, Space false; Escape → closed false, editor Escapes → 0
 * - ui.ts, `leaveBox` without its second line (the focus goes to the page behind, not to playback), so Enter
 *   leaves the box and Space then does nothing:
 *   STEP FAIL 17 … (1400x900-strike4) — …; Escape → playback still open true, box still focused false, editor Escapes 0 → 0, Space true; typed 25 and Enter → focus on BODY, time 25, Space false; Escape → closed true, editor Escapes → 0
 * - PlaybackOverlay.tsx, the key's skip list taking a slider too (`[role="slider"]` added to it): Space on the handle
 *   does nothing:
 *   STEP FAIL 17 … (1400x900-strike4) — handle focused true, Space played and paused false; times after → …: 11, 6, 11, 10, 10, 10 (want 11, 6, 11, 10, 10, 10); …
 * (Those three lines were recorded before the Reset clause was added to the message; the edits they name are
 * to code that clause does not touch.)
 * - JetLanes.tsx, the box showing its typed text whatever the session's time (`typed.at_s === info.tot_s`
 *   dropped from TimeBox's `text`): after Reset the box still reads what was typed:
 *   STEP FAIL 17 … (1400x900-strike4) — …; 25 typed (time 25) then Reset by mouse: time 10, box 25 (want 10), box still focused true; box focused true; Escape → playback still open true, …
 * (green: "time 10, box 10 (want 10), box still focused true".)
 */
async function checkDiamondKeys(page, tag) {
  const esc = async () => (await pbEval(page, () => __pb.counters)).editorEscapes;
  const e0 = await esc();
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); });
  const playing = () => pbEval(page, () => __pb.snapshot().playing);
  const spacePlays = async () => {
    await page.keyboard.press(' ');
    const on = await playing();
    await page.keyboard.press(' ');
    return on && !(await playing());
  };
  const focusRole = () => page.evaluate(() => (document.activeElement ? document.activeElement.getAttribute('role') || document.activeElement.tagName : 'none'));
  await handleOf(page, 2).focus();
  const onHandle = (await focusRole()) === 'slider';
  const spaceOnHandle = await spacePlays();
  const times = [];
  for (const key of ['ArrowRight', 'Shift+ArrowLeft', 'PageUp', 'ArrowDown', 'Home', 'End']) {
    await page.keyboard.press(key);
    times.push(await totOf(page, 2));
  }
  const keysOk = times.join() === '11,6,11,10,10,10';
  // Reset pressed with the mouse while a time is being typed: the focus stays in the box, and the box must show the time Reset put back.
  await boxOf(page, 2).click();
  await boxOf(page, 2).fill('25');
  const typedTot = await totOf(page, 2);
  await page.locator('[role="dialog"] [data-reset]').click();
  const afterReset = {
    box: await boxOf(page, 2).inputValue(), tot: await totOf(page, 2),
    focused: await page.evaluate(() => !!document.activeElement && document.activeElement.type === 'number'),
  };
  const resetOk = typedTot === 25 && afterReset.tot === 10 && afterReset.box === '10' && afterReset.focused;
  await boxOf(page, 2).click();
  const inBox =await page.evaluate(() => document.activeElement && document.activeElement.type === 'number');
  await page.keyboard.press('Escape');
  const stillOpen = (await page.$('[role="dialog"]')) !== null;
  const boxFocused = await page.evaluate(() => !!document.activeElement && document.activeElement.type === 'number');
  const e1 = await esc();
  // If that Escape closed playback there is nothing left to type into: the rest is skipped, and the check fails on what was seen.
  let spaceAfterEsc = false, spaceAfterEnter = false, closed = false;
  let afterEnter = { focus: 'none', tot: NaN };
  if (stillOpen) {
    spaceAfterEsc = await spacePlays();
    await boxOf(page, 2).click();
    await boxOf(page, 2).fill('25');
    await page.keyboard.press('Enter');
    afterEnter = { focus: await focusRole(), tot: await totOf(page, 2) };
    spaceAfterEnter = await spacePlays();
    await page.keyboard.press('Escape');
    closed = await dialogGone(page).then(() => true, () => false);
    if (!closed) await pbEval(page, () => __pb.close());
  }
  const e2 = await esc();
  await page.click('[data-testid="opener"]');
  await page.waitForSelector('[role="dialog"]');
  await waitReady(page);
  step(`17 the handle and the box keep the keyboard: Space from the handle, its keys, Escape and Enter leave the box, then Escape closes playback, never the editor (${tag})`,
    onHandle && spaceOnHandle && keysOk && resetOk && inBox && stillOpen && !boxFocused && e1 === e0 && spaceAfterEsc && afterEnter.focus === 'dialog' && afterEnter.tot === 25 && spaceAfterEnter && closed && e2 === e0,
    `handle focused ${onHandle}, Space played and paused ${spaceOnHandle}; times after → Shift+← PgUp ↓ Home End: ${times.join(', ')} (want 11, 6, 11, 10, 10, 10); ` +
      `25 typed (time ${typedTot}) then Reset by mouse: time ${afterReset.tot}, box ${afterReset.box} (want 10), box still focused ${afterReset.focused}; box focused ${inBox}; Escape → playback still open ${stillOpen}, box still focused ${boxFocused}, editor Escapes ${e0} → ${e1}, Space ${spaceAfterEsc}; typed 25 and Enter → focus on ${afterEnter.focus}, time ${afterEnter.tot}, Space ${spaceAfterEnter}; Escape → closed ${closed}, editor Escapes → ${e2}`);
}

/**
 * Check 20: a skipped jet is not drawn and keeps its place. On the skip variant (#2's target missing):
 * two jets flown, labelled #1 and #3, no third arrow; at the spread moment #3's arrow is lime (seat 2's
 * colour), at least SEAT_MIN px round it with the overlay hidden.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/jetLayer.ts, the colour taken from the playback
 * index instead of the seat (`jetColor(jet)` for `jetColor(src.seatOf(jet))`: #3 flies as jet 1, so
 * magenta; run again the same day after the layer lost its colour option, the same line):
 *   STEP FAIL 20 a skipped #2 is not drawn; #3 flies in #3's lime (1400x900-skip) — flown #1 #3; labels #1 #3; a third arrow none; t -49.2; #3 at 174,538: 0 lime px (need 70)
 * (green: 161 lime px; the lines alone, arrow shrunk, 24.)
 */
async function checkSkipped(page, tag) {
  const spread = await spreadMoment(page);
  await settle(page, 300);
  const labels = await pbEval(page, () => __pb.debugLabels());
  const jets = await pbEval(page, () => __pb.moments.jets.map((j) => j.label));
  const third = await pbEval(page, () => __pb.project(2, 'jet'));
  const p = await pbEval(page, () => __pb.project(1, 'jet'));
  await overlay(page, false);
  let img;
  try {
    img = await shot(page, `${tag}-20-skipped`);
  } finally {
    await overlay(page, true);
  }
  const lime = p ? patch(img, p.map(Math.round), ARROW_PATCH).filter(limeLike).length : 0;
  const firsts = labels.jets.map((l) => l.lines[0].split(' ')[0]).sort().join(' ');
  step(`20 a skipped #2 is not drawn; #3 flies in #3's lime (${tag})`,
    jets.join(' ') === '#1 #3' && firsts === '#1 #3' && third === null && lime >= SEAT_MIN,
    `flown ${jets.join(' ')}; labels ${firsts}; a third arrow ${third ? 'yes' : 'none'}; t ${spread.t === null ? 'none' : spread.t.toFixed(1)}; #3 at ${p ? p.map(Math.round) : 'none'}: ${lime} lime px (need ${SEAT_MIN})`);
}

/**
 * Check 35: the cameras follow the watched jet by its playback index, not its seat. On the skip variant
 * opened watching #3 (seat 2, flown as jet 1): Chase #3 pressed, a second of play at 1× from the start
 * of the time bar, and #3's arrow is within 15% of the canvas's middle.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, the seat handed to the scene where
 * its jet belongs (`watched` for `watchedJet` in the camera prop, setCamera and SceneHost's `jet`; the
 * scene takes the out-of-range 2 as no jet and follows #1):
 *   STEP FAIL 35 Chase #3 on the skip variant follows #3 (seat 2, jet 1) (1400x900-skip) — button true; watched seat 2; played 0.62 s; #3's arrow at none, NaN% / NaN% off the middle (want ≤ 15%)
 * (green: #3's arrow 0.0% / 0.0% off the middle.)
 */
async function checkChaseBySeat(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.setSpeed(1); __pb.seek(__pb.snapshot().start); });
  const button = page.getByRole('button', { name: 'Chase #3', exact: true });
  const there = (await button.count()) === 1;
  if (there) await button.click();
  const played = await pbEval(page, async () => {
    const t0 = __pb.snapshot().t;
    __pb.play();
    await new Promise((r) => setTimeout(r, 1000));
    __pb.pause();
    return __pb.snapshot().t - t0;
  });
  await settle(page);
  const cv = await canvasBox(page);
  const p = await pbEval(page, () => __pb.project(1, 'jet'));
  await shot(page, `${tag}-35-chase-by-seat`);
  const [dx, dy] = offCentre(p, cv);
  step(`35 Chase #3 on the skip variant follows #3 (seat 2, jet 1) (${tag})`,
    there && (await pressedCamera(page)).join() === 'Chase #3' && played > 0 && Math.abs(dx) <= 0.15 && Math.abs(dy) <= 0.15,
    `button ${there}; watched seat ${await pbEval(page, () => __pb.watched())}; played ${played.toFixed(2)} s; #3's arrow at ${p ? p.map(Math.round) : 'none'}, ${(dx * 100).toFixed(1)}% / ${(dy * 100).toFixed(1)}% off the middle (want ≤ 15%)`);
}

/**
 * Check 21b: a watched jet that is not in the picture when the time bar starts opens at Home. The
 * four-ship with #2 at 300 s, opened watching #2: Orbit pressed (not Chase #2), no "isn't in the
 * picture" chip, and the view still watching #2 (seat 1). Run on the page as it opens.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, the opening mode 'chase' whatever
 * openingMode says:
 *   STEP FAIL 21b watching a jet not yet in the picture opens at Home, still watching it (1400x900-late) — pressed ["Chase #2"]; "isn't in the picture" chip true; watched seat 1
 */
async function checkLateOpening(page, tag) {
  await settle(page);
  const pressed = await pressedCamera(page);
  const chip = await page.locator('[role="dialog"]').innerText().then((s) => /isn't in the picture/.test(s));
  const watched = await pbEval(page, () => __pb.watched());
  await shot(page, `${tag}-21b-late-opening`);
  step(`21b watching a jet not yet in the picture opens at Home, still watching it (${tag})`,
    pressed.join() === 'Orbit' && !chip && watched === 1,
    `pressed ${JSON.stringify(pressed)}; "isn't in the picture" chip ${chip}; watched seat ${watched}`);
}

/**
 * Check 19 (four lanes): every lane shares the time bar's axis. On the four-ship at the default range,
 * with the playhead at each time over target in turn (#1 at 0 s, #2 at 10 s, #3 and #4 together at 40 s),
 * the white line in every one of the four lanes is within 3 px of the scrubber's thumb (worked out from the
 * input's box and the clock's place, the way a 16 px thumb moves), and so is the diamond of each seat whose
 * time it is.
 *
 * Measured green 2026-11-15 at both sizes: every line 0.5 px from the thumb, every diamond 0.0 px.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, every lane given the lead's marks
 * (`marks: marks[seat]` → `marks: marks[0]` in the lanes' memo: each diamond sits at #1's time over target,
 * so #2, #3 and #4 are off the thumb at their own):
 *   STEP FAIL 19 four lanes: … (1400x900-strike4) — at 0 s (thumb 580.6): #1 line 0.5, diamond 0.0; #2 line 0.5; #3 line 0.5; #4 line 0.5 | at 10 s (thumb 657.2): #1 line 0.5; #2 line 0.5, diamond 76.7; #3 line 0.5; #4 line 0.5 | at 40 s (thumb 887.3): #1 line 0.5; #2 line 0.5; #3 line 0.5, diamond 306.7; #4 line 0.5, diamond 306.7
 *
 * It also holds that, in a strike of more than one jet, every lane's times cell says what its figures are
 * ("times est., relative to the lead's TOT", the editor's own line). Proven red 2026-11-15 by one temporary edit
 * to JetLanes.tsx, the condition turned round (`lanes.length >= 2 ? READOUT_TITLE : undefined` → `lanes.length >= 2
 * ? undefined : READOUT_TITLE`: the four-ship's cells lose the title, a strike of one's gain it):
 *   STEP FAIL 19 four lanes: … (1400x900-strike4) — …; times cells' titles [null] on 4 cells (want "times est., relative to the lead's TOT" on 4)
 */
async function checkLaneTimeFour(page, tag) {
  const wasWhole = await pbEval(page, () => __pb.show().wholeRunIn);
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); });
  const jets = await pbEval(page, () => __pb.moments.jets);
  const input = await page.locator('[role="dialog"] input[type="range"]').boundingBox();
  const parts = [];
  let ok = true;
  const times = [...new Set(jets.map((j) => j.impact))].sort((a, b) => a - b);
  for (const t of times) {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 150);
    const snap = await pbEval(page, () => __pb.snapshot());
    const lanes = await pbEval(page, () => __pb.lanes());
    const f = (snap.t - snap.start) / (snap.end - snap.start);
    const thumb = input.x + 8 + (input.width - 16) * f;
    const mine = jets.filter((j) => j.impact === t).map((j) => j.seat);
    const bits = lanes.map((l) => {
      const nowX = l.now ? (l.now.l + l.now.r) / 2 : NaN;
      const dNow = Math.abs(nowX - thumb);
      let s = `#${l.seat + 1} line ${dNow.toFixed(1)}`;
      ok = ok && dNow <= 3;
      if (mine.includes(l.seat)) {
        const dx = l.impact ? Math.abs((l.impact.l + l.impact.r) / 2 - thumb) : NaN;
        ok = ok && dx <= 3;
        s += `, diamond ${dx.toFixed(1)}`;
      }
      return s;
    });
    ok = ok && lanes.length === jets.length && lanes.length === 4;
    parts.push(`at ${t.toFixed(0)} s (thumb ${thumb.toFixed(1)}): ${bits.join('; ')}`);
  }
  // In a strike of more than one jet every lane's times cell says what its figures are, in the editor's words.
  const titles = await page.$$eval('[role="dialog"] [data-readout]', (els) => els.map((e) => e.getAttribute('title')));
  const wantTitle = "times est., relative to the lead's TOT";
  ok = ok && titles.length === 4 && titles.every((t) => t === wantTitle);
  parts.push(`times cells' titles ${JSON.stringify([...new Set(titles)])} on ${titles.length} cells (want ${JSON.stringify(wantTitle)} on 4)`);
  step(`19 four lanes: every lane's clock line and each jet's time over target sit on the scrubber's thumb, every times cell titled (${tag})`, ok, parts.join(' | '));
  await pbEval(page, (whole) => __pb.setRange(whole), wasWhole);
}

/**
 * Check 13 (stripes): the time bar carries the frag conflicts. On the four-ship (#2 over the target inside
 * #1's frag from 10 s to 30 s, #4 inside #3's from 40 s to 70 s) there is one stripe element for each
 * conflict the plan has, its edges within 3 px of the thumb's place at the conflict's start and end, and
 * along its middle there are both amber pixels (the stripes, amber over the panel) and panel pixels
 * between them.
 *
 * Measured green 2026-11-15: both stripes' edges 0.0 px off, 66 / 101 amber and 85 / 127 panel pixels along
 * them at 1400×900, 39 / 63 and 55 / 79 at 1024×768 (the floors of 4 and 4 sit well under, with room for the
 * software renderer).
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, no conflicts handed to the time bar
 * (`conflicts={conflicts}` → `conflicts={[]}`: no stripe at all):
 *   STEP FAIL 13 the time bar's stripes mark each frag conflict: one for each, on its own times, striped (1400x900-strike4) — 0 stripes for 2 conflicts
 */
async function checkConflictHatch(page, tag) {
  const wasWhole = await pbEval(page, () => __pb.show().wholeRunIn);
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); });
  await settle(page, 300);
  const img = await shot(page, `${tag}-13-stripes`);
  const snap = await pbEval(page, () => __pb.snapshot());
  const want = await pbEval(page, () => __pb.moments.conflicts);
  const input = await page.locator('[role="dialog"] input[type="range"]').boundingBox();
  const stripes = await page.$$eval('[role="dialog"] [data-conflict]', (els) => els.map((e) => {
    const b = e.getBoundingClientRect();
    return { l: b.left, r: b.right, t: b.top, b: b.bottom };
  }));
  const at = (t) => input.x + 8 + (input.width - 16) * ((Math.min(Math.max(t, snap.start), snap.end) - snap.start) / (snap.end - snap.start));
  const amberOnPanel = (p) => p[0] > 100 && p[1] > 90 && p[0] > p[2] + 40;
  const parts = [];
  let ok = want.length > 0 && stripes.length === want.length;
  stripes.forEach((s, i) => {
    const w = want[i];
    if (!w) return;
    const dl = Math.abs(s.l - at(w.t0_s)), dr = Math.abs(s.r - at(w.t1_s));
    const y = (s.t + s.b) / 2;
    let amber = 0, panel = 0;
    for (let x = Math.ceil(s.l) + 1; x < s.r - 1; x++) {
      const p = img.at(x, y);
      if (amberOnPanel(p)) amber++;
      else if (near(p, hex('#16213e'), 3)) panel++;
    }
    ok = ok && dl <= 3 && dr <= 3 && amber >= 4 && panel >= 4;
    parts.push(`${w.second} inside ${w.first}'s frag ${w.t0_s.toFixed(0)}…${w.t1_s.toFixed(0)} s: edges ${dl.toFixed(1)} / ${dr.toFixed(1)} px off, ${amber} amber and ${panel} panel pixels along it`);
  });
  step(`13 the time bar's stripes mark each frag conflict: one for each, on its own times, striped (${tag})`, ok,
    `${stripes.length} stripes for ${want.length} conflicts${parts.length ? `; ${parts.join('; ')}` : ''}`);
  await pbEval(page, (whole) => __pb.setRange(whole), wasWhole);
}

/**
 * Check 36: the seat buttons move the watch. On the four-ship at Home, paused at the start of the time bar:
 * - opened as it is: #1's button pressed alone, the time bar's own band spanning #1's lane band (3 px), #1's
 *   action-point discs full size and the others' small;
 * - #3's button pressed: it alone is pressed, the view watches seat 3, "Chase #3" is the toolbar's camera
 *   button, the time bar's band spans #3's lane band (and no longer #1's), #3's discs are full size and #1's
 *   small (so the colour code moved with it), and the press did not take the keyboard focus (Space still plays
 *   and pauses);
 * - in Chase, with both jets in the picture, the camera looks at #3's jet (3 m), and pressing #1's button
 *   moves it to #1's jet (3 m).
 * The camera is put back to Orbit at Home watching #1, for the checks after.
 *
 * Measured green 2026-11-15 at both sizes: the band 0.0 px off the lane it follows, 306.7 / 191.2 px off the
 * other jet's (#3's band is 40 s later), the camera 0.0 m from the jet it follows.
 *
 * Proven red 2026-11-15, each by one temporary edit:
 * - PlaybackView.tsx, the scene never told of the new watch (`if (s) s.setCamera(s.cameraMode(), jet);` taken
 *   out of `watchSeat`): the buttons and the time bar's band move, the discs and the chase camera do not
 *   (Chase #3 still follows #3, as that button names the jet itself, but pressing #1 leaves it there):
 *   STEP FAIL 36 the seat buttons move the watch: … (1400x900-strike4) — as opened: pressed #1, band 0.0 px off #1's lane and 306.7 off #3's, discs #1 10 (5), #3 7 (5); #3 pressed: pressed #3, watched seat 3, Chase #3 button true, band 0.0 px off #3's lane and 306.7 off #1's, discs #1 10, #3 7 (5), focus kept true, Space played true then paused true; Chase at -20.9 s: looking 0.0 m from #3 (watching #3), then 4605.8 m from #1 once #1 is pressed
 * - JetLanes.tsx, the seat button's `onMouseDown={keepFocus}` taken out: the focus lands on the button and
 *   Space presses it instead of playing:
 *   STEP FAIL 36 … (1400x900-strike4) — …; #3 pressed: pressed #3, watched seat 3, Chase #3 button true, band 0.0 px off #3's lane and 306.7 off #1's, discs #1 7, #3 10 (5), focus kept false, Space played false then paused true; Chase at -20.9 s: looking 0.0 m from #3 (watching #3), then 0.0 m from #1 once #1 is pressed
 */
async function checkWatchSeat(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.setSpeed(1); __pb.goHome(); __pb.seek(__pb.snapshot().start); });
  await page.evaluate(() => document.querySelector('[role="dialog"]').focus());
  await settle(page, 300);
  const pressedSeats = async () => (await pbEval(page, () => __pb.seats())).filter((s) => s.pressed).map((s) => s.seat + 1).join();
  const scrubEdges = () => page.$$eval('[role="dialog"] [data-scrub-band]', (els) => {
    const b = els.map((e) => e.getBoundingClientRect());
    return b.length ? [Math.min(...b.map((x) => x.left)), Math.max(...b.map((x) => x.right))] : [NaN, NaN];
  });
  const laneEdges = (seat) => pbEval(page, (s) => {
    const l = __pb.lanes().find((q) => q.seat === s);
    const b = l ? l.bands : [];
    return b.length ? [Math.min(...b.map((x) => x.box.l)), Math.max(...b.map((x) => x.box.r))] : [NaN, NaN];
  }, seat);
  const off = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  const discs = (jet) => pbEval(page, (k) => {
    const mine = new Set(__pb.source().markers(k).map((m) => m.key));
    const ms = __pb.debugLabels().markers.filter((m) => mine.has(m.key));
    return { n: ms.length, r: [...new Set(ms.map((m) => m.r))].sort((a, b) => a - b).join('/') || 'none' };
  }, jet);
  const parts = [];
  let ok = true;

  const first = { seats: await pressedSeats(), scrub: await scrubEdges(), lane0: await laneEdges(0), lane2: await laneEdges(2), d0: await discs(0), d2: await discs(2) };
  const firstOk = first.seats === '1' && off(first.scrub, first.lane0) <= 3 && off(first.scrub, first.lane2) > 3 && first.d0.n >= 3 && first.d0.r === `${DISC_R}` && first.d2.n >= 3 && first.d2.r === `${DISC_OTHER_R}`;
  ok = ok && firstOk;
  parts.push(`as opened: pressed #${first.seats}, band ${off(first.scrub, first.lane0).toFixed(1)} px off #1's lane and ${off(first.scrub, first.lane2).toFixed(1)} off #3's, discs #1 ${first.d0.r} (${first.d0.n}), #3 ${first.d2.r} (${first.d2.n})`);

  await page.getByRole('button', { name: 'Watch #3 Viper 1-3', exact: true }).click();
  await settle(page, 300);
  const second = {
    seats: await pressedSeats(), watched: await pbEval(page, () => __pb.watched()), chase3: (await page.getByRole('button', { name: 'Chase #3', exact: true }).count()) === 1,
    scrub: await scrubEdges(), lane0: await laneEdges(0), lane2: await laneEdges(2), d0: await discs(0), d2: await discs(2),
    focusOnPlayback: await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role') === 'dialog'),
  };
  await page.keyboard.press(' ');
  const played = await pbEval(page, () => __pb.snapshot().playing);
  await page.keyboard.press(' ');
  const paused = !(await pbEval(page, () => __pb.snapshot().playing));
  await pbEval(page, () => { __pb.pause(); __pb.seek(__pb.snapshot().start); });
  const secondOk = second.seats === '3' && second.watched === 2 && second.chase3 && off(second.scrub, second.lane2) <= 3 && off(second.scrub, second.lane0) > 3 &&
    second.d0.r === `${DISC_OTHER_R}` && second.d2.r === `${DISC_R}` && second.d2.n >= 3 && second.focusOnPlayback && played && paused;
  ok = ok && secondOk;
  parts.push(`#3 pressed: pressed #${second.seats}, watched seat ${second.watched === null ? 'none' : second.watched + 1}, Chase #3 button ${second.chase3}, band ${off(second.scrub, second.lane2).toFixed(1)} px off #3's lane and ${off(second.scrub, second.lane0).toFixed(1)} off #1's, discs #1 ${second.d0.r}, #3 ${second.d2.r} (${second.d2.n}), focus kept ${second.focusOnPlayback}, Space played ${played} then paused ${paused}`);

  // Chase follows the watched jet: both jets are in the picture a few seconds into #3's run.
  await page.getByRole('button', { name: 'Chase #3', exact: true }).click();
  const t = await pbEval(page, () => {
    const j = __pb.moments.jets;
    const at = Math.max(j[0].firstAction, j[2].firstAction) + 3;
    __pb.seek(at);
    return at;
  });
  await settle(page, 400);
  const lookingAt = (jet) => pbEval(page, (k) => {
    const p = {};
    __pb.source().jetAt(k, __pb.snapshot().t, p);
    const c = __pb.camera().target;
    return { visible: p.visible, d: Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) };
  }, jet);
  const on3 = await lookingAt(2);
  await page.getByRole('button', { name: 'Watch #1 Viper 1-1', exact: true }).click();
  await settle(page, 400);
  const on1 = await lookingAt(0);
  const thirdOk = on3.visible && on1.visible && on3.d <= 3 && on1.d <= 3;
  ok = ok && thirdOk;
  parts.push(`Chase at ${t.toFixed(1)} s: looking ${on3.d.toFixed(1)} m from #3 (watching #3), then ${on1.d.toFixed(1)} m from #1 once #1 is pressed`);

  await pbEval(page, () => { __pb.goHome(); __pb.seek(__pb.snapshot().start); });
  step(`36 the seat buttons move the watch: the pressed button, the time bar's band, the colour code and the chase camera follow it (${tag})`, ok, parts.join('; '));
}

/**
 * Check 14 (Apply from the editor): on the four-ship handed over as the attack editor hands one over (the page's
 * door=editor), with the theater note (the page whose small print is the longest, four lanes and all) and the
 * editor's way of writing the sliders replaced by a recorder. The attack list's Apply is the next check.
 * - As opened, nothing changed: "Apply to strike" is there and greyed (aria-disabled), pressing it writes nothing
 *   and shows no status line.
 * - #2's time typed as 25 (+15 s): Apply and Reset come on. Apply: the recorder holds one list, 0, 25, 40, 40 (each
 *   time less the lead's, in the editor's order); the session holds 25 as both its plan and its time; Apply and
 *   Reset are greyed again; the line under the footer says "Applied to the strike in the editor. Save the strike to
 *   keep it; Cancel throws it away." and the next sentence, is one row tall, and its tooltip is the whole text; the
 *   playhead and the time bar are where they were (the lead's time is 0, so the strike's clock moves by nothing);
 *   the press left the keyboard with playback (Space plays and pauses); the canvas still has its room (the same
 *   floors as 7b) and the line is inside the window.
 * - #2 typed as 30: the line is gone, Apply and Reset on; Reset: #2 is 25 again (the times just applied, not the 10
 *   playback opened with), the line still gone.
 * - #3 typed as 5 (ahead of #2's 25), then Apply: the recorder's second list is 0, 25, 5, 40; the session's status
 *   names the two jets the cards will number the other way round ("#3 Viper 1-3 as #2", "#2 Viper 1-2 as #3"), the line
 *   says so ("When you save, the cards will number jets in their order over the target: … Playback keeps the numbers
 *   it opened with.") in the same one row, and the canvas has its room again.
 * No page errors through it.
 *
 * Measured green 2026-11-15: the line is 16 px tall; the canvas 1400x576 and 1024x428 with it (floors 560 and 420;
 * without it, as 7b measures, 1400x592 and 1024x444: the line costs 16 px and leaves 8 at 1024).
 *
 * Proven red 2026-11-15, each by one temporary edit (the text is the part of the step's message that changes):
 * - PlaybackView.tsx, `apply.write(offsets);` taken out (nothing reaches the editor's sliders):
 *   STEP FAIL 14 … (1400x900-strike4) — …; pressed: written [], session plan 25 and time 25, …; still written []; #3 at 5: written [], renumbered ["#3 Viper 1-3 as #2","#2 Viper 1-2 as #3"], …
 * - PlaybackView.tsx, the `act({ type: 'applied', … })` call made `void ({ … })` (the session never told):
 *   STEP FAIL 14 … — …; pressed: written [[0,25,40,40]], session plan 10 and time 25, status null/null, Apply on true, Reset on true, box 25, line none; …; Reset: #2 at 10 (want 25, the applied time), box 10, …; #3 at 5: written [[0,25,40,40],[0,10,5,40]], renumbered null, line none; …
 * - PlaybackView.tsx, the `renumbered:` of that call given `[]` (the jets the cards number differently left unsaid):
 *   STEP FAIL 14 … — …; #3 at 5: written [[0,25,40,40],[0,25,5,40]], renumbered [], line ends "…p tab spaces the jets evenly again and replaces these times." 16 px tall; …
 * - DelayFooter.tsx, the Apply button's `onMouseDown={keepFocus}` taken out (the press takes the keyboard from playback):
 *   STEP FAIL 14 … — …; focus kept false, Space false/true; …
 * - DelayFooter.tsx, the region for a screen reader made to appear only with its words (`{apply && (` →
 *   `{apply && status && status.length > 0 && (`), as it was first built; the region must be there, empty and of
 *   no height, before there is anything to say, or a screen reader may never read the line out:
 *   STEP FAIL 14 … (1400x900-strike4-editor) — as opened: "Apply to strike", greyed true, pressed: nothing written [], line none, 0 region for a screen reader, empty, 0 px tall (want 1, empty, 0); …
 *   (red at 1024x768 too; green: "1 region for a screen reader, empty, 0 px tall".)
 * - ui.ts, FOOTER_STATUS 'h-4' → 'h-12' (a status line three rows tall):
 *   STEP FAIL 14 … (1400x900-strike4) — …; line "Applied to the strike in the editor. Save the strike to keep…" 48 px tall, …; canvas 1400x544 (want ≥ 1350x560); …
 *   STEP FAIL 14 … (1024x768-strike4) — …; canvas 1024x396 (want ≥ 1000x420); …
 *
 * What the check cannot see: in the editor the lead's time is always 0, so an Apply moves the strike's clock by
 * nothing and the playhead and the bar stay where they were. That the scene is handed the shift with the new
 * source was seen once with applyShift forced to 10 (not kept): "playhead -30.15 → -40.15, bar -50.15…80.00 →
 * -60.15…70.00". The attack list's Apply, whose shift is not 0, is where a check can hold it: check 34's second half.
 */
async function checkApply(page, tag, w, h, problems) {
  const apply = page.locator('[role="dialog"] [data-apply]');
  const reset = page.locator('[role="dialog"] [data-reset]');
  const on = async (loc) => (await loc.getAttribute('aria-disabled')) === 'false';
  const row = () => page.locator('[role="dialog"] [data-apply-status]');
  const rowOf = async () => ((await row().count()) ? row().evaluate((e) => ({ text: e.textContent, title: e.getAttribute('title'), h: e.getBoundingClientRect().height, bottom: e.getBoundingClientRect().bottom, inLive: !!e.closest('[role="status"]') })) : null);
  const typeTime = async (n, v) => {
    await boxOf(page, n).click();
    await boxOf(page, n).fill(String(v));
    await page.keyboard.press('Enter');
    await settle(page, 300);
  };
  const [fw, fh] = LAYOUT_FLOOR[w];
  const canvasOk = async () => {
    const [cw, ch] = await page.$eval('[role="dialog"] canvas', (c) => [c.clientWidth, c.clientHeight]);
    return { ok: cw >= fw && ch >= fh, text: `${cw}x${ch} (want ≥ ${fw}x${fh})` };
  };
  const applied = () => pbEval(page, () => JSON.stringify(__pb.applied));
  const sess = () => pbEval(page, () => { const s = __pb.session(); const id = s.memberIds[1]; return { plan: s.plan_s[id], now: s.delays_s[id], renumbered: s.status ? s.status.renumbered : null, to: s.status ? s.status.to : null }; });
  // The region a screen reader listens to: how many there are, what is in it, how tall it is.
  const liveOf = () => page.$$eval('[role="dialog"] [role="status"]', (els) => ({ n: els.length, text: els.map((e) => e.textContent).join('|'), h: els.reduce((s, e) => s + e.getBoundingClientRect().height, 0) }));
  const parts = [];
  let ok = true;
  const note = (good, text) => { ok = ok && good; parts.push(text); };

  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start + 20); });
  await page.evaluate(() => document.querySelector('[role="dialog"]').focus());
  await settle(page, 300);
  // As opened.
  const label = await apply.innerText();
  const title = await apply.getAttribute('title');
  const offAtOpen = !(await on(apply));
  // Playwright will not click what is aria-disabled: force it, as a finger or a stray key would.
  await apply.click({ force: true });
  await settle(page, 150);
  const idle = { applied: await applied(), row: await rowOf(), live: await liveOf() };
  const liveWaiting = idle.live.n === 1 && idle.live.text === '' && idle.live.h === 0;
  note(label === 'Apply to strike' && /^Write these times into the strike you're editing/.test(title) && offAtOpen && idle.applied === '[]' && idle.row === null && liveWaiting,
    `as opened: "${label}", greyed ${offAtOpen}, pressed: nothing written ${idle.applied}, line ${idle.row === null ? 'none' : 'showing'}, ` +
      `${idle.live.n} region for a screen reader, ${idle.live.text === '' ? 'empty' : 'not empty'}, ${idle.live.h} px tall (want 1, empty, 0)`);

  // +15 s on #2, then Apply.
  await typeTime(2, 25);
  const ready = { apply: await on(apply), reset: await on(reset), dirty: (await page.locator('[role="dialog"] [data-footer-dirty]').count()) === 1 };
  const snap0 = await pbEval(page, () => __pb.snapshot());
  await apply.click();
  await settle(page, 400);
  const snap1 = await pbEval(page, () => __pb.snapshot());
  const first = { applied: await applied(), s: await sess(), apply: await on(apply), reset: await on(reset), row: await rowOf(), box: await boxOf(page, 2).inputValue() };
  const focusOnPlayback = await page.evaluate(() => !!document.activeElement && document.activeElement.getAttribute('role') === 'dialog');
  await page.keyboard.press(' ');
  const played = await pbEval(page, () => __pb.snapshot().playing);
  await page.keyboard.press(' ');
  const paused = !(await pbEval(page, () => __pb.snapshot().playing));
  await pbEval(page, () => { __pb.pause(); __pb.seek(__pb.snapshot().start + 20); });
  const room1 = await canvasOk();
  await shot(page, `${tag}-14-applied`);
  const sentence = 'Applied to the strike in the editor. Save the strike to keep it; Cancel throws it away.';
  const stayed = Math.abs(snap1.t - snap0.t) < 0.01 && Math.abs(snap1.start - snap0.start) < 1e-6 && Math.abs(snap1.end - snap0.end) < 1e-6;
  note(ready.apply && ready.reset && ready.dirty && first.applied === '[[0,25,40,40]]' && first.s.plan === 25 && first.s.now === 25 && first.s.to === 'editor' && first.s.renumbered.length === 0 &&
      !first.apply && !first.reset && first.box === '25' && !!first.row && first.row.text.startsWith(sentence) && /Moving “Spacing over the target”/.test(first.row.text) && first.row.title === first.row.text &&
      first.row.inLive && first.row.h <= 17 && first.row.bottom <= h && stayed && focusOnPlayback && played && paused && room1.ok,
    `#2 at 25: Apply on ${ready.apply}, Reset on ${ready.reset}, "changed" note ${ready.dirty}; pressed: written ${first.applied}, session plan ${first.s.plan} and time ${first.s.now}, status ${first.s.to}/${JSON.stringify(first.s.renumbered)}, Apply on ${first.apply}, Reset on ${first.reset}, box ${first.box}, ` +
      `line ${first.row ? `"${first.row.text.slice(0, 60)}…" ${first.row.h.toFixed(0)} px tall, tooltip ${first.row.title === first.row.text ? 'the whole text' : 'not the whole text'}, bottom ${first.row.bottom.toFixed(0)}, in the screen reader's region ${first.row.inLive}` : 'none'}; playhead ${snap0.t.toFixed(2)} → ${snap1.t.toFixed(2)}, bar ${snap0.start.toFixed(2)}…${snap0.end.toFixed(2)} → ${snap1.start.toFixed(2)}…${snap1.end.toFixed(2)}; focus kept ${focusOnPlayback}, Space ${played}/${paused}; canvas ${room1.text}`);

  // Change again; Reset goes back to the applied times.
  await typeTime(2, 30);
  const changed = { row: await rowOf(), apply: await on(apply), reset: await on(reset) };
  await reset.click();
  await settle(page, 300);
  const back = { now: (await sess()).now, box: await boxOf(page, 2).inputValue(), row: await rowOf(), apply: await on(apply), reset: await on(reset), written: await applied() };
  note(changed.row === null && changed.apply && changed.reset && back.now === 25 && back.box === '25' && back.row === null && !back.apply && !back.reset && back.written === '[[0,25,40,40]]',
    `#2 at 30: line ${changed.row === null ? 'gone' : 'still showing'}, Apply on ${changed.apply}, Reset on ${changed.reset}; Reset: #2 at ${back.now} (want 25, the applied time), box ${back.box}, line ${back.row === null ? 'gone' : 'showing'}, Apply on ${back.apply}, Reset on ${back.reset}, still written ${back.written}`);

  // #3 ahead of #2: the cards will number them the other way round.
  await typeTime(3, 5);
  await apply.click();
  await settle(page, 400);
  const second = { applied: await applied(), s: await sess(), row: await rowOf() };
  const room2 = await canvasOk();
  await shot(page, `${tag}-14-renumbered`);
  const want = ['#3 Viper 1-3 as #2', '#2 Viper 1-2 as #3'];
  const said = `When you save, the cards will number jets in their order over the target: ${want[0]} and ${want[1]}. Playback keeps the numbers it opened with.`;
  note(second.applied === '[[0,25,40,40],[0,25,5,40]]' && JSON.stringify(second.s.renumbered) === JSON.stringify(want) && !!second.row && second.row.text.endsWith(said) && second.row.h <= 17 && second.row.bottom <= h && room2.ok,
    `#3 at 5: written ${second.applied}, renumbered ${JSON.stringify(second.s.renumbered)}, line ${second.row ? `ends "…${second.row.text.slice(-60)}" ${second.row.h.toFixed(0)} px tall` : 'none'}; canvas ${room2.text}`);

  note(problems.length === 0, `page errors ${problems.length ? problems.slice(0, 4).join(' | ') : 'none'}`);
  step(`14 Apply to strike writes the times to the editor's sliders, says so in one line, Reset then goes back to the applied times, and names the jets the cards will number differently (${tag})`, ok, parts.join('; '));
}

/**
 * Check 14 (Apply from the attack list): on the four-ship handed over as the attack list hands a saved strike over
 * (the plan as saved and the strike to play; the view builds the jets, and works out for itself what the cards go by
 * when two jets share a time), with the theater note, and the plan's own store replaced by a recorder.
 * - As opened, nothing changed: "Apply to plan" is there and greyed, with its tooltip, pressing it writes nothing and
 *   shows no status line.
 * - #2's time typed as 25 (+15 s): Apply and Reset come on. Apply: the recorder holds one record, each attack's time
 *   by its id, 0, 25, 40, 40 (each less the earliest); the session holds 25 as both its plan and its time; Apply and Reset
 *   are greyed again; the line under the footer is the one sentence "Applied to the plan: the cards now use these times.
 *   To take it back, close playback and press Undo (⌘Z / Ctrl+Z), once for each Apply.", one row tall, its tooltip the
 *   whole text; the playhead and the bar stay (the earliest is 0, so the strike's clock moves by nothing); Space still
 *   plays and pauses; the canvas keeps its room (the floors of 7b).
 * - #2 typed as 30: the line is gone, Apply and Reset on; Reset: #2 is 25 again (the times just applied), the line gone.
 * - #3 typed as 5 (ahead of #2's 25), then Apply: the recorder's second record is 0, 25, 5, 40; the session's status names
 *   the two jets the cards will number the other way round, the line says so ("The cards number jets in their order
 *   over the target, so they now have #3 Viper 1-3 as #2 and #2 Viper 1-2 as #3. Playback keeps the numbers it opened
 *   with."), still one row, and the canvas has its room.
 * No page errors through it.
 *
 * Measured green 2026-11-15: the line is 16 px tall; the canvas 1400x576 and 1024x428 with it (floors 560 and 420).
 *
 * Proven red 2026-11-15, each by one temporary edit (the text is the part of the step's message that changes):
 * - PlaybackView.tsx, the plan's `apply.write(written);` taken out (nothing reaches the plan; 34 goes red with it):
 *   STEP FAIL 14 Apply to plan … (1400x900-strike4) — …; pressed: written [], session plan 25 and time 25, …; still written []; #3 at 5: written [], renumbered ["#3 Viper 1-3 as #2","#2 Viper 1-2 as #3"], …
 * - PlaybackView.tsx, the `act({ type: 'applied', … })` call made `void ({ … })` (the session never told; 34 and the editor's 14 go red with it):
 *   STEP FAIL 14 Apply to plan … — …; pressed: written [{"h-strike4-1":0,"h-strike4-2":25,…}], session plan 10 and time 25, status null/null, Apply on true, Reset on true, box 25, line none; …; Reset: #2 at 10 (want 25, the applied time), box 10, …; #3 at 5: written [{…},{"h-strike4-1":0,"h-strike4-2":10,"h-strike4-3":5,…}], renumbered null, line none; …
 * - PlaybackView.tsx, buildView's `tie: launch.tie ?? (from && cardTie(…))` made `tie: launch.tie` (the list's jets have nothing to break a tie by, so none is said to be renumbered; only this check, the editor brings its own tie):
 *   STEP FAIL 14 Apply to plan … (1400x900-strike4) — …; #3 at 5: written [{…},{"h-strike4-1":0,"h-strike4-2":25,"h-strike4-3":5,"h-strike4-4":40}], renumbered [], line ends "… playback and press Undo (⌘Z / Ctrl+Z), once for each Apply." 16 px tall; …
 * - ui.ts, FOOTER_STATUS 'h-4' → 'h-12' (a status line three rows tall):
 *   STEP FAIL 14 Apply to plan … (1400x900-strike4) — …; line "Applied to the plan: the cards now use these times. To take …" 48 px tall, …; canvas 1400x544 (want ≥ 1350x560); …
 *   STEP FAIL 14 Apply to plan … (1024x768-strike4) — …; canvas 1024x396 (want ≥ 1000x420); …
 */
async function checkApplyPlan(page, tag, w, h, problems) {
  const apply = page.locator('[role="dialog"] [data-apply]');
  const reset = page.locator('[role="dialog"] [data-reset]');
  const on = async (loc) => (await loc.getAttribute('aria-disabled')) === 'false';
  const row = () => page.locator('[role="dialog"] [data-apply-status]');
  const rowOf = async () => ((await row().count()) ? row().evaluate((e) => ({ text: e.textContent, title: e.getAttribute('title'), h: e.getBoundingClientRect().height, bottom: e.getBoundingClientRect().bottom, inLive: !!e.closest('[role="status"]') })) : null);
  const typeTime = async (n, v) => {
    await boxOf(page, n).click();
    await boxOf(page, n).fill(String(v));
    await page.keyboard.press('Enter');
    await settle(page, 300);
  };
  const [fw, fh] = LAYOUT_FLOOR[w];
  const canvasOk = async () => {
    const [cw, ch] = await page.$eval('[role="dialog"] canvas', (c) => [c.clientWidth, c.clientHeight]);
    return { ok: cw >= fw && ch >= fh, text: `${cw}x${ch} (want ≥ ${fw}x${fh})` };
  };
  // The attack ids in seat order, and what a record of times looks like when the page writes it.
  const ids = await pbEval(page, () => __pb.session().memberIds);
  const rec = (...t) => JSON.stringify(Object.fromEntries(ids.map((id, i) => [id, t[i]])));
  const applied = () => pbEval(page, () => JSON.stringify(__pb.applied));
  const sess = () => pbEval(page, () => { const s = __pb.session(); const id = s.memberIds[1]; return { plan: s.plan_s[id], now: s.delays_s[id], renumbered: s.status ? s.status.renumbered : null, to: s.status ? s.status.to : null }; });
  const parts = [];
  let ok = true;
  const note = (good, text) => { ok = ok && good; parts.push(text); };

  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start + 20); });
  await page.evaluate(() => document.querySelector('[role="dialog"]').focus());
  await settle(page, 300);
  // As opened.
  const label = await apply.innerText();
  const title = await apply.getAttribute('title');
  const offAtOpen = !(await on(apply));
  await apply.click({ force: true }); // Playwright will not click what is aria-disabled: force it, as a finger or a stray key would
  await settle(page, 150);
  const idle = { applied: await applied(), row: await rowOf() };
  note(label === 'Apply to plan' && title === 'Write these times into the plan and the cards.' && offAtOpen && idle.applied === '[]' && idle.row === null,
    `as opened: "${label}", greyed ${offAtOpen}, pressed: nothing written ${idle.applied}, line ${idle.row === null ? 'none' : 'showing'}`);

  // +15 s on #2, then Apply.
  await typeTime(2, 25);
  const ready = { apply: await on(apply), reset: await on(reset), dirty: (await page.locator('[role="dialog"] [data-footer-dirty]').count()) === 1 };
  const snap0 = await pbEval(page, () => __pb.snapshot());
  await apply.click();
  await settle(page, 400);
  const snap1 = await pbEval(page, () => __pb.snapshot());
  const first = { applied: await applied(), s: await sess(), apply: await on(apply), reset: await on(reset), row: await rowOf(), box: await boxOf(page, 2).inputValue() };
  const focusOnPlayback = await page.evaluate(() => !!document.activeElement && document.activeElement.getAttribute('role') === 'dialog');
  await page.keyboard.press(' ');
  const played = await pbEval(page, () => __pb.snapshot().playing);
  await page.keyboard.press(' ');
  const paused = !(await pbEval(page, () => __pb.snapshot().playing));
  await pbEval(page, () => { __pb.pause(); __pb.seek(__pb.snapshot().start + 20); });
  const room1 = await canvasOk();
  await shot(page, `${tag}-14-plan-applied`);
  const sentence = 'Applied to the plan: the cards now use these times. To take it back, close playback and press Undo (⌘Z / Ctrl+Z), once for each Apply.';
  const stayed = Math.abs(snap1.t - snap0.t) < 0.01 && Math.abs(snap1.start - snap0.start) < 1e-6 && Math.abs(snap1.end - snap0.end) < 1e-6;
  note(ready.apply && ready.reset && ready.dirty && first.applied === `[${rec(0, 25, 40, 40)}]` && first.s.plan === 25 && first.s.now === 25 && first.s.to === 'mission' && first.s.renumbered.length === 0 &&
      !first.apply && !first.reset && first.box === '25' && !!first.row && first.row.text === sentence && first.row.title === first.row.text &&
      first.row.h <= 17 && first.row.bottom <= h && stayed && focusOnPlayback && played && paused && room1.ok,
    `#2 at 25: Apply on ${ready.apply}, Reset on ${ready.reset}, "changed" note ${ready.dirty}; pressed: written ${first.applied}, session plan ${first.s.plan} and time ${first.s.now}, status ${first.s.to}/${JSON.stringify(first.s.renumbered)}, Apply on ${first.apply}, Reset on ${first.reset}, box ${first.box}, ` +
      `line ${first.row ? `"${first.row.text.slice(0, 60)}…" ${first.row.h.toFixed(0)} px tall, tooltip ${first.row.title === first.row.text ? 'the whole text' : 'not the whole text'}, bottom ${first.row.bottom.toFixed(0)}, in the screen reader's region ${first.row.inLive}` : 'none'}; playhead ${snap0.t.toFixed(2)} → ${snap1.t.toFixed(2)}, bar ${snap0.start.toFixed(2)}…${snap0.end.toFixed(2)} → ${snap1.start.toFixed(2)}…${snap1.end.toFixed(2)}; focus kept ${focusOnPlayback}, Space ${played}/${paused}; canvas ${room1.text}`);

  // Change again; Reset goes back to the applied times.
  await typeTime(2, 30);
  const changed = { row: await rowOf(), apply: await on(apply), reset: await on(reset) };
  await reset.click();
  await settle(page, 300);
  const back = { now: (await sess()).now, box: await boxOf(page, 2).inputValue(), row: await rowOf(), apply: await on(apply), reset: await on(reset), written: await applied() };
  note(changed.row === null && changed.apply && changed.reset && back.now === 25 && back.box === '25' && back.row === null && !back.apply && !back.reset && back.written === `[${rec(0, 25, 40, 40)}]`,
    `#2 at 30: line ${changed.row === null ? 'gone' : 'still showing'}, Apply on ${changed.apply}, Reset on ${changed.reset}; Reset: #2 at ${back.now} (want 25, the applied time), box ${back.box}, line ${back.row === null ? 'gone' : 'showing'}, Apply on ${back.apply}, Reset on ${back.reset}, still written ${back.written}`);

  // #3 ahead of #2: the cards will number them the other way round.
  await typeTime(3, 5);
  await apply.click();
  await settle(page, 400);
  const second = { applied: await applied(), s: await sess(), row: await rowOf() };
  const room2 = await canvasOk();
  await shot(page, `${tag}-14-plan-renumbered`);
  const want = ['#3 Viper 1-3 as #2', '#2 Viper 1-2 as #3'];
  const said = `The cards number jets in their order over the target, so they now have ${want[0]} and ${want[1]}. Playback keeps the numbers it opened with.`;
  note(second.applied === `[${rec(0, 25, 40, 40)},${rec(0, 25, 5, 40)}]` && JSON.stringify(second.s.renumbered) === JSON.stringify(want) && !!second.row && second.row.text === `${sentence} ${said}` && second.row.h <= 17 && second.row.bottom <= h && room2.ok,
    `#3 at 5: written ${second.applied}, renumbered ${JSON.stringify(second.s.renumbered)}, line ${second.row ? `ends "…${second.row.text.slice(-60)}" ${second.row.h.toFixed(0)} px tall` : 'none'}; canvas ${room2.text}`);

  note(problems.length === 0, `page errors ${problems.length ? problems.slice(0, 4).join(' | ') : 'none'}`);
  step(`14 Apply to plan writes the times into the plan by attack, says so in one line, Reset then goes back to the applied times, and names the jets the cards will number differently (${tag})`, ok, parts.join('; '));
}

/**
 * Check 34 (the list's Apply moves the strike's clock): on the four-ship handed over as the attack list hands one
 * over, at the default range, paused 2 s into the bar (nearer its start than the clock moves, see below). #2's time
 * typed as -5 (15 s ahead of #1's 0, so it leads), then Apply to plan. The plan counts from whoever is first over the
 * target, so each time is written less -5: the recorder holds 5, 0, 45, 45, and the strike's clock moves by -5 s. The
 * playhead is on the same moment of the strike (it reads 5 s more than it did: t = old t - shift, 0.01), the time bar
 * has moved with it (start and end 5 s on), the session holds 5, 0, 45, 45 as its plan and its times, #2's box says 0
 * and #1's held time says T+0:05.
 *
 * Why 2 s in: the new bar starts 5 s later than the old one. A playhead more than 5 s into the old bar is inside the
 * new bar too, so a writer that clamps the playhead into the new bar before the shift arrives (a third writer of the
 * range) leaves it alone, and the check could not tell that from a shift that arrived correctly. Parked at 30 s in it
 * stayed green under that very edit; 2 s in, the clamp moves it and the shift then carries it on from the wrong place.
 *
 * Measured green 2026-11-15, parked 2 s in: playhead -53.15 → -48.15, bar -55.15…80.00 → -50.15…85.00, exact to the
 * digits shown.
 *
 * Proven red 2026-11-15, each by one temporary edit to PlaybackView.tsx:
 * - an effect `useEffect(() => { sceneRef.current?.setRange(live); }, [live]);` added just before the setSource effect
 *   (the range set whenever it changes: it clamps the playhead into the new bar before the shift reaches the scene):
 *   STEP FAIL 34 the list's Apply moves the strike's clock: … (1400x900-strike4) — #2 at -5, Apply: written [{"h-strike4-1":5,"h-strike4-2":0,"h-strike4-3":45,"h-strike4-4":45}]; playhead -53.15 → -45.15 (want -48.15, off by 3.0e+0), bar -55.15…80.00 → -50.15…85.00 (off by 0.0e+0, 0.0e+0); …
 *   (the drag half of 34 goes red with it too: "held at -50 s … range -100.15…80.00 vs -50.15…80.00 before (kept false)")
 * - the setSource effect's `const shift_s = pendingShift.current;` made `const shift_s = 0;` (the scene is not told how far
 *   the strike's clock moved: the bar goes with the new times, and the playhead is clamped into it where it stood):
 *   STEP FAIL 34 the list's Apply moves the strike's clock: … — …; playhead -53.15 → -50.15 (want -48.15, off by -2.0e+0), bar -55.15…80.00 → -50.15…85.00 (off by 0.0e+0, 0.0e+0); session plan 5,0,45,45 times 5,0,45,45; …
 * - the `act({ type: 'applied', … })` call made `void ({ … })` (the session never told, so the plan does not move either):
 *   STEP FAIL 34 … — …; playhead -53.15 → -53.15 (want -48.15, off by -5.0e+0), bar -55.15…80.00 → -55.15…80.00 (off by -5.0e+0, -5.0e+0); session plan 0,10,40,40 times 0,-5,40,40; #2's box -5; …
 */
async function checkApplyShift(page, tag) {
  const ids = await pbEval(page, () => __pb.session().memberIds);
  const rec = (...t) => JSON.stringify(Object.fromEntries(ids.map((id, i) => [id, t[i]])));
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); });
  await page.evaluate(() => document.querySelector('[role="dialog"]').focus());
  await boxOf(page, 2).click();
  await boxOf(page, 2).fill('-5');
  await page.keyboard.press('Enter');
  await settle(page, 400);
  // 2 s into the bar, nearer its start than the clock moves (5 s): a playhead further in is inside the old bar and
  // the new one alike, so clamping it into the new bar before the shift (a third writer of the range) changes nothing
  // and could not be told from a shift that arrived correctly.
  await pbEval(page, () => { __pb.seek(__pb.snapshot().start + 2); });
  await settle(page, 300);
  const before = await pbEval(page, () => __pb.snapshot());
  await page.locator('[role="dialog"] [data-apply]').click();
  await settle(page, 500);
  const after = await pbEval(page, () => __pb.snapshot());
  const s = await pbEval(page, () => { const x = __pb.session(); return { plan: x.memberIds.map((id) => x.plan_s[id]), now: x.memberIds.map((id) => x.delays_s[id]), written: JSON.stringify(__pb.applied) }; });
  const box2 = await boxOf(page, 2).inputValue();
  const cell1 = await page.locator('[role="dialog"] [data-readout="0"]').innerText();
  const shift = -5;
  const dt = after.t - (before.t - shift), ds = after.start - (before.start - shift), de = after.end - (before.end - shift);
  step(`34 the list's Apply moves the strike's clock: the playhead stays on the same moment and the time bar goes with it (${tag})`,
    Math.abs(dt) < 0.01 && Math.abs(ds) < 1e-6 && Math.abs(de) < 1e-6 && s.written === `[${rec(5, 0, 45, 45)}]` && s.plan.join() === '5,0,45,45' && s.now.join() === '5,0,45,45' && box2 === '0' && /T\+0:05/.test(cell1),
    `#2 at -5, Apply: written ${s.written}; playhead ${before.t.toFixed(2)} → ${after.t.toFixed(2)} (want ${(before.t - shift).toFixed(2)}, off by ${dt.toExponential(1)}), bar ${before.start.toFixed(2)}…${before.end.toFixed(2)} → ${after.start.toFixed(2)}…${after.end.toFixed(2)} (off by ${ds.toExponential(1)}, ${de.toExponential(1)}); ` +
      `session plan ${s.plan.join()} times ${s.now.join()}; #2's box ${box2}; #1's cell ${JSON.stringify(cell1)}`);
}

/**
 * Check 38 (a lone attack played from the attack list): the pop-up handed over as the list hands over one attack's row (the
 * plan as saved, with the attack in it as the planner's third, and the attack to play). The view builds the jet from the plan:
 * the title plate says "Viper 1-1 · attack #3" (the callsign and the attack's own number, so the 3 does not read as a second
 * seat number), there is one lane and no Apply (a lone attack has no times to move: "One jet: nothing to space."), the playback
 * is watching its one jet, and it opens at the start of its time bar.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, buildView's `const title = launch.title ?? (lone ? … : input.name);`
 * made `const title = launch.title ?? input.name;` (the library's own name, "Viper 1-1 #3", which reads like a seat):
 *   STEP FAIL 38 a lone attack played from the attack list … (1400x900-one-list) — title "Viper 1-1 #3" (want "Viper 1-1 · attack #3"); …
 */
async function checkLoneFromList(page, tag, problems) {
  const want = 'Viper 1-1 · attack #3';
  const plate = await page.$$eval('[role="dialog"] div.truncate', (els) => els.map((e) => e.textContent).filter((t) => /^Viper 1-1/.test(t || '')));
  const s = await pbEval(page, () => { const x = __pb.session(); return { ids: x.memberIds, watched: x.watched }; });
  const snap = await pbEval(page, () => __pb.snapshot());
  const range = await pbEval(page, () => __pb.moments.range);
  const lanes = await page.locator('[role="dialog"] [data-lane]').count();
  const applyButtons = await page.locator('[role="dialog"] [data-apply]').count();
  const single = await page.locator('[role="dialog"] [data-footer-single]').count();
  step(`38 a lone attack played from the attack list: titled by callsign and attack number, one lane, no Apply (${tag})`,
    plate.length === 1 && plate[0] === want && s.ids.join() === 'h-attack' && s.watched === 0 && lanes === 1 && applyButtons === 0 && single === 1 && Math.abs(snap.t - range.t0_s) < 0.05 && problems.length === 0,
    `title ${plate.length === 1 ? JSON.stringify(plate[0]) : `${plate.length} plates`} (want ${JSON.stringify(want)}); members ${s.ids.join()}, watching seat ${s.watched}; ${lanes} lane, Apply buttons ${applyButtons}, "nothing to space" note ${single}; time ${snap.t.toFixed(2)} at the bar's start ${range.t0_s.toFixed(2)}; page errors ${problems.length ? problems.slice(0, 3).join(' | ') : 'none'}`);
}

/**
 * Check 39 (a strike that is no longer in the plan, played from the attack list): the four-ship handed over as the list
 * hands one over, but naming a strike the plan does not hold (as if it had been taken out after Play was pressed).
 * Playback opens on its "Nothing to play" screen, which says "This strike or attack is no longer in the plan." and that
 * the plan is unchanged; it draws no 3D, no lanes and no Apply, and its Close button shuts it. No page errors.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, buildView's `message: from ? 'This strike or attack is no
 * longer in the plan.' : 'Nothing could be built from this plan yet.'` made the second sentence alone (what a launch with no
 * plan in it says):
 *   STEP FAIL 39 a strike no longer in the plan, played from the attack list: says so, draws nothing, and closes (1400x900-strike4) — heading "Nothing to play", says it is gone false ("Nothing to play Nothing could be built from this plan yet. Your plan is unchanged, and the map and side view still show the attack"…); canvases 0, lanes 0, Apply buttons 0; closed; page errors none
 */
async function checkGoneFromList(browser, base) {
  const { context, page, problems } = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4&gone=1`, 1400, 900, false);
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('h3').first().waitFor({ timeout: 30000 });
  const heading = await dialog.locator('h3').first().innerText();
  const text = (await dialog.innerText()).replace(/\s+/g, ' ');
  const gone = text.includes('This strike or attack is no longer in the plan. Your plan is unchanged');
  const drawn = { canvases: await dialog.locator('canvas').count(), lanes: await dialog.locator('[data-lane]').count(), apply: await dialog.locator('[data-apply]').count() };
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await dialogGone(page);
  step('39 a strike no longer in the plan, played from the attack list: says so, draws nothing, and closes (1400x900-strike4)',
    heading === 'Nothing to play' && gone && drawn.canvases === 0 && drawn.lanes === 0 && drawn.apply === 0 && problems.length === 0,
    `heading ${JSON.stringify(heading)}, says it is gone ${gone} (${JSON.stringify(text.slice(text.indexOf('Nothing to play'), text.indexOf('Nothing to play') + 130))}…); canvases ${drawn.canvases}, lanes ${drawn.lanes}, Apply buttons ${drawn.apply}; closed; page errors ${problems.length ? problems.slice(0, 3).join(' | ') : 'none'}`);
  await context.close();
}

async function runStrikeChecks(browser, base) {
  for (const [w, h] of [[1400, 900], [1024, 768]]) {
    const tag = `${w}x${h}`;
    const { context, page, problems } = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4`, w, h);
    step(`ready, four-ship (${tag})`, true, JSON.stringify(await pbEval(page, () => __pb.terrain())));
    await checkFourArrows(page, `${tag}-strike4`);
    await checkFourLabels(page, `${tag}-strike4`);
    await checkTopDownTargets(page, `${tag}-strike4`);
    await checkAttackColours(page, `${tag}-strike4`);
    await checkLaneTimeFour(page, `${tag}-strike4`);
    await checkConflictHatch(page, `${tag}-strike4`);
    await checkWatchSeat(page, `${tag}-strike4`);
    if (w === 1400) {
      await checkRetimes(page, `${tag}-strike4`);
      await checkDragRange(page, `${tag}-strike4`);
      await checkDelaysKept(page, `${tag}-strike4`);
      // 17 on the four-ship closes playback and opens it again (a fresh session); the Escape below shuts it for
      // the open-and-close check.
      await checkDiamondKeys(page, `${tag}-strike4`);
      await page.keyboard.press('Escape'); // the open-and-close check starts with playback shut
      await dialogGone(page);
      // 4b: check 4 on the four-ship, so every jet layer's GPU objects are freed, not only the lead's.
      // Proven red 2026-11-15 by one temporary edit to scene/createScene.ts, the jet layers after the
      // first made with a bag of their own that nothing frees (`bag: k === 0 ? bag : new DisposeBag()`;
      // the lone pop-up's one layer still goes in the shared bag, so check 4 alone could not see it):
      //   STEP FAIL 4b open and close the four-ship 20 times, nothing left behind (1400x900) — leaks #1: {"geometries":18,"textures":0}; #2: {"geometries":18,"textures":0}; …
      await checkOpenClose(page, `4b open and close the four-ship 20 times, nothing left behind (${tag})`);
    }
    // #3 and #4 share a time over target: nothing on the page may complain about it.
    // Check 8 on the strike fixtures (here, and the late wingman and the skip variant below), proven
    // red 2026-11-15 by one temporary edit to scene/jetLayer.ts, a layer for seat #3 or later writing
    // to the console as it is made (`if (src.seatOf(jet) >= 2) console.error('mutation: a wingman layer complains')`):
    //   STEP FAIL 8 no page errors, four-ship (1400x900) — console error: mutation: a wingman layer complains | …
    //   STEP FAIL 8 no page errors, four-ship (1024x768) — …
    //   STEP FAIL 8 no page errors, late wingman (1400x900) — …
    //   STEP FAIL 8 no page errors, skip variant (1400x900) — …
    step(`8 no page errors, four-ship (${tag})`, problems.length === 0, problems.length ? problems.slice(0, 8).join(' | ') : 'none');
    await context.close();
    // 7b on the four-ship with its theater note: four lanes and the warnings line under the picture, the
    // tightest the rows get (a page of its own: the note takes a row from the pictures the checks above measure).
    const lay = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4&notes=1`, w, h);
    await checkLayout(lay.page, `${tag}-strike4`, w, h, 4);
    // 14 on the same page, the attack list's way: it changes the times, and wants the tightest rows under the picture.
    await checkApplyPlan(lay.page, `${tag}-strike4`, w, h, lay.problems);
    await lay.context.close();
    // 14 again on a page of its own, the attack editor's way (the same four jets handed over as the editor hands them over).
    const ed = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4&notes=1&door=editor`, w, h);
    await checkApply(ed.page, `${tag}-strike4-editor`, w, h, ed.problems);
    await ed.context.close();
    if (w === 1400) {
      // 34's second half: a list Apply whose clock shift is not 0.
      const sh = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4`, w, h);
      await checkApplyShift(sh.page, `${tag}-strike4`);
      await sh.context.close();
    }
  }
  {
    const tag = '1400x900';
    const late = await openPage(browser, `${base}?tiles=synthetic&fixture=late`, 1400, 900);
    await checkLateOpening(late.page, `${tag}-late`);
    step(`8 no page errors, late wingman (${tag})`, late.problems.length === 0, late.problems.length ? late.problems.slice(0, 8).join(' | ') : 'none');
    await late.context.close();
    const s = await openPage(browser, `${base}?tiles=synthetic&fixture=skip`, 1400, 900);
    await checkSkipped(s.page, `${tag}-skip`);
    step(`8 no page errors, skip variant (${tag})`, s.problems.length === 0, s.problems.length ? s.problems.slice(0, 8).join(' | ') : 'none');
    await s.context.close();
    const s3 = await openPage(browser, `${base}?tiles=synthetic&fixture=skip&watch=3`, 1400, 900);
    await checkChaseBySeat(s3.page, `${tag}-skip`);
    await s3.context.close();
    const lone = await openPage(browser, `${base}?tiles=synthetic&fixture=one&door=list`, 1400, 900);
    await checkLoneFromList(lone.page, `${tag}-one-list`, lone.problems);
    await lone.context.close();
    await checkGoneFromList(browser, base);
  }
}

async function runChecks(browser, base) {
  for (const [w, h] of [[1400, 900], [1024, 768]]) {
    const tag = `${w}x${h}`;
    const { context, page, problems } = await openPage(browser, `${base}?tiles=synthetic&notes=1`, w, h);
    step(`ready (${tag})`, true, JSON.stringify(await pbEval(page, () => __pb.terrain())));
    // First, on the page as it opens: 21 reads the camera and 29 the range before anything moves the
    // playhead, and 30 and 17 need the keyboard focus where playback left it (a scrub, later, puts it
    // on the scrubber).
    await checkOpening(page, tag);
    await checkRange(page, tag);
    if (w === 1400) {
      await checkShowKeys(page);
      await checkChaseKeys(page);
    }
    await checkHomeFrame(page, tag, w === 1400 ? 250 : 180);
    await checkColourCode(page, tag);
    await checkTargetMark(page, tag);
    await checkCallouts(page, tag);
    await checkJetLabels(page, tag);
    await checkWheel(page, tag);
    await checkCameras(page, tag);
    await checkColours(page, tag);
    await checkJet(page, tag);
    await checkReal(page, tag);
    await checkFit(page, tag, w, h);
    await checkLayout(page, tag, w, h);
    await checkToolbarFit(page, tag, w, h);
    await checkLaneTime(page, tag);
    if (w === 1400) await checkLaneColours(page, tag);
    if (w === 1400) {
      await checkScrub(page);
      await checkSpaceAfterScrub(page);
      await checkSpeeds(page, tag);
      await checkContextLoss(page, tag);
      await checkOverlay(page);
      await checkOpenClose(page);
    }
    step(`8 no page errors (${tag})`, problems.length === 0, problems.length ? problems.slice(0, 8).join(' | ') : 'none');
    await context.close();
  }
}

async function runLive(browser, base) {
  const { context, page, problems } = await openPage(browser, `${base}?tiles=live`, 1400, 900);
  await waitReady(page, 90000);
  console.log(`STEP live terrain: ${JSON.stringify(await pbEval(page, () => __pb.terrain()))}`);
  await settle(page, 1500);
  await page.screenshot({ path: shotPath('live-01-home') });
  // A low view: drag up to bring the camera down toward the horizon, then wheel in.
  const cv = await page.locator('[role="dialog"] canvas').first().boundingBox();
  const cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 260, { steps: 25 });
  await page.mouse.up();
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(150);
  }
  await settle(page, 2000);
  await page.screenshot({ path: shotPath('live-02-low-oblique') });
  await pbEval(page, () => { __pb.goHome(); __pb.seek((__pb.moments.pullUp + __pb.moments.release) / 2); });
  await settle(page, 1500);
  await page.screenshot({ path: shotPath('live-03-mid-popup') });
  console.log(`STEP live screenshots written; page problems: ${problems.length ? problems.join(' | ') : 'none'}`);
  await context.close();
}

(async () => {
  let server, browser;
  try {
    const { createServer } = await import('vite');
    const port = await freePort();
    server = await createServer({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      logLevel: 'error',
      clearScreen: false,
      server: { port, strictPort: true, host: '127.0.0.1', hmr: false, open: false },
      // Crawl the harness up front, so the first page load does not trigger a dependency reload.
      optimizeDeps: { entries: ['playback-harness.html'] },
    });
    await server.listen();
    const base = `http://127.0.0.1:${port}/playback-harness.html`;
    console.log(`STEP dev server on ${base}; Chromium flags: ${GL_FLAGS.join(' ')}`);
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: GL_FLAGS });
    if (live) await runLive(browser, base);
    else {
      await runChecks(browser, base);
      await runStrikeChecks(browser, base);
    }
  } catch (e) {
    step('run', false, (e && e.stack) || String(e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
  console.log(failures.length ? `FAILED: ${failures.join(', ')}` : 'ALL PASSED');
  process.exit(failures.length ? 1 : 0);
})();
