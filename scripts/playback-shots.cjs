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
// does (it is the jet's colour too); the path and the trail did until they took the planner's
// colours: see check 2 for how it allowed for them.
const jetLike = (p) => p[2] > p[0] + 80 && p[1] > p[0] + 80 && Math.abs(p[1] - p[2]) < 70;

// ── Page helpers.
async function openPage(browser, url, w, h) {
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
  await waitReady(page);
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
  for (const [name, t] of [['start', m.t0], ['run-in', (m.t0 + m.pullUp) / 2], ['pull-up', m.pullUp]]) {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page);
    const p = await pbEval(page, () => __pb.project(0, 'jet'));
    const img = await shot(page, `${tag}-02-jet-${name}`);
    const n = p ? patch(img, p.map(Math.round), ARROW_PATCH).filter(jetLike).length : 0;
    ok = ok && n >= ARROW_MIN;
    parts.push(`${name} t=${t.toFixed(1)} at ${p ? p.map(Math.round) : 'none'}: ${n} px`);
  }
  step(`${label} (${tag})`, ok, `${parts.join('; ')} (need ${ARROW_MIN})`);
}

/**
 * Check 3: real ground: the hill's sunward (north-west) flank is brighter; the bomb's last sample sits on the ring.
 *
 * 3b proven red 2026-11-14 (jetLayer.ts placeRing, the ring's centre moved 600 m east: `ringCentre.set(t.x + 600, …)`):
 *   STEP FAIL 3b bomb's last sample at the target ring (1400x900) — on screen 10.8 px apart 0.05 s before impact; in the world 0.29 m apart 1 ms before impact; target at height 0.00 m
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
 * Proven red 2026-11-14 by one temporary edit to StatusNotes.tsx, the credits row's wrapper
 * `flex flex-wrap items-start gap-x-3 text-gray-500` taken back to a plain `text-gray-500` block (the
 * credits and the summary on two rows; the canvas 16 px shorter):
 *   STEP FAIL 7b canvas at least 1350x560 with the lane and every control inside 1400x900; … (1400x900) — canvas 1400x686 (want ≥ 1350x560); 1 lane; 20 controls; credits at 860, sources at 876 (left 16) (one row false); software line a chip on the picture
 *   STEP FAIL 7b … (1024x768) — canvas 1024x554 (want ≥ 1000x420); 1 lane; 20 controls; credits at 728, sources at 744 (left 16) (one row false); …
 */
const LAYOUT_FLOOR = { 1024: [1000, 420], 1400: [1350, 560] };
async function checkLayout(page, tag, w, h) {
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
  step(`7b canvas at least ${fw}x${fh} with the lane and every control inside ${w}x${h}; credits and sources on one row; the software line on the picture (${tag})`,
    r.lanes === 1 && r.controls.length > 0 && outside.length === 0 && cw >= fw && ch >= fh && oneRow && chipOnPicture,
    `canvas ${Math.round(cw)}x${Math.round(ch)} (want ≥ ${fw}x${fh}); ${r.lanes} lane; ${r.controls.length} controls${outside.length ? `, outside: ${outside.map((b) => b.name).join(', ')}` : ''}; credits at ${r.credits ? Math.round(r.credits.t) : 'none'}, sources at ${r.sources ? `${Math.round(r.sources.t)} (left ${Math.round(r.sources.l)})` : 'none'} (one row ${oneRow}); software line ${r.softChip ? 'a chip on the picture' : 'not shown'}${r.softRow ? ', and also a row under it' : ''}`);
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
  const img = await shot(page, `${tag}-23-colour-code`);
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
  const cv = await page.locator('[role="dialog"] canvas').boundingBox();
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
async function checkOpenClose(page) {
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
  step('4 open and close 20 times, nothing left behind', leaks.length === 0 && counts.liveScenes === 0,
    `${leaks.length ? `leaks ${leaks.join('; ')}` : 'every close {geometries 0, textures 0}'}; scenes created ${counts.sceneCreates}, alive ${counts.liveScenes}`);
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
  const cv = await page.locator('[role="dialog"] canvas').boundingBox();
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
    else await runChecks(browser, base);
  } catch (e) {
    step('run', false, (e && e.stack) || String(e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }
  console.log(failures.length ? `FAILED: ${failures.join(', ')}` : 'ALL PASSED');
  process.exit(failures.length ? 1 : 0);
})();
