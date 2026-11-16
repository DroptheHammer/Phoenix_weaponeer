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
  // A click that builds a scene, or a screenshot, on the software renderer can take longer than the
  // driver's own 30 s when the machine is busy with other work, and the whole run then dies on a step
  // that measures nothing. The waits that do measure something name their own limits.
  page.setDefaultTimeout(120000);
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
 * Green with it hidden: 172 / 138 / 130 px at 1400×900, 171 / 138 / 127 at 1024×768. Measured again
 * 2026-11-15 once the arrow had its tall fin, raised wings and darker underside: 169 / 135 / 124 at
 * 1400×900 and 168 / 134 / 123 at 1024×768 (a few pixels fewer, not more: the darker underside still
 * passes jetLike, the fin adds little seen from this far, and the raised wings foreshorten the top),
 * so the floor stays 90. Proven red again by the arrow-shrink mutation:
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
 * Check 60: the arrow in the scene is rolled as the pose says. Paused, seek to five moments along the
 * lone pop-up (strike time, from the lead's action points): AP + 0.3 s (in the check turn), POP + 2 s (the
 * pull-up), midway between PDP and TRK (over the top of the pull-down), REL − 1 s, and REL + 7 s (in the
 * egress arc; not REL + 4, which sits beside where an unclipped roll would swing). At each, the arrow is
 * drawn, the roll its mesh really has (`__pb.arrow().bank_deg`, read off the mesh's quaternion) is the
 * pose's (`pose_bank_deg`) to within 0.5° with the sign, compared modulo 360° (the pose's roll is not
 * wrapped, the mesh's is), and the pose's roll is where the plan puts it: 60° to 80° right in the check
 * turn, within 1° of level in the pull-up and 1 s before the release (wings level there), 120° or more
 * to the left over the top, and 80° to 110° right in the egress arc.
 *
 * Measured 2026-11-15 on the first green run, at both window sizes: the pose's roll 70.0°, 0.0°, −151.0°,
 * 0.0°, 98.3° at the five moments, the mesh's the same, off by 0.00° each time.
 *
 * Proven red (2026-11-15) by one temporary edit to scene/jetLayer.ts placeArrow, the roll's sign flipped
 * (`qRoll.setFromAxisAngle(Z_AXIS, -pose.bank_deg * D2R)` → `(Z_AXIS, pose.bank_deg * D2R)`): the mesh
 * rolls the other way, so the check fails on its own (check 61 stays green: an arrow over the top shows
 * its underside either way, 131 solid px there):
 *   STEP FAIL 60 the arrow is rolled as the pose says: … (1400x900) — check turn t=-39.9: drawn, pose 70.0° (want 60…80°), mesh -70.0°, off by -140.07°; pull-up t=-34.8: drawn, pose 0.0° (want ±1°), mesh -0.0°, off by -0.04°; over the top t=-17.5: drawn, pose -151.0° (want ≤ −120°), mesh 151.0°, off by -58.01°; … egress arc t=-1.5: drawn, pose 98.3° (want 80…110°), mesh -98.3°, off by 163.48° (mesh within 0.5° of the pose)
 * and by the roll dropped in the scene (`(Z_AXIS, 0)`), which fails 60 and 61 both:
 *   STEP FAIL 60 the arrow is rolled as the pose says: … (1400x900) — check turn t=-39.9: drawn, pose 70.0° (want 60…80°), mesh 0.0°, off by -70.03°; …; over the top t=-17.5: drawn, pose -151.0° (want ≤ −120°), mesh -0.0°, off by 150.99°; …; egress arc t=-1.5: drawn, pose 98.3° (want 80…110°), mesh 0.0°, off by -98.26° (mesh within 0.5° of the pose)
 *   (and the same at 1024x768)
 */
const ROLL_TOLERANCE_DEG = 0.5;
const wrap360 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
async function checkArrowRoll(page, tag) {
  await pbEval(page, () => __pb.pause());
  const ms = await pbEval(page, () => __pb.source().markers(0).map((m) => ({ kind: m.kind, t: m.t_s })));
  const at = (kind) => ms.find((m) => m.kind === kind)?.t;
  const [ap, pop, pdp, trk, rel] = ['AP', 'POP', 'PDP', 'TRK', 'REL'].map(at);
  const moments = [
    { name: 'check turn', t: ap + 0.3, want: (r) => r >= 60 && r <= 80, words: '60…80°' },
    { name: 'pull-up', t: pop + 2, want: (r) => Math.abs(r) <= 1, words: '±1°' },
    { name: 'over the top', t: (pdp + trk) / 2, want: (r) => r <= -120, words: '≤ −120°' },
    { name: 'before release', t: rel - 1, want: (r) => Math.abs(r) <= 1, words: '±1°' },
    { name: 'egress arc', t: rel + 7, want: (r) => r >= 80 && r <= 110, words: '80…110°' },
  ];
  const parts = [];
  let ok = [ap, pop, pdp, trk, rel].every((t) => Number.isFinite(t));
  for (const m of moments) {
    await pbEval(page, (t) => __pb.seek(t), m.t);
    await settle(page);
    const a = await pbEval(page, () => __pb.arrow());
    const diff = a ? wrap360(a.bank_deg - a.pose_bank_deg) : NaN;
    const good = !!a && a.visible && Math.abs(diff) <= ROLL_TOLERANCE_DEG && m.want(a.pose_bank_deg);
    ok = ok && good;
    parts.push(`${m.name} t=${m.t.toFixed(1)}: ${a ? `${a.visible ? 'drawn' : 'NOT drawn'}, pose ${a.pose_bank_deg.toFixed(1)}° (want ${m.words}), mesh ${a.bank_deg.toFixed(1)}°, off by ${diff.toFixed(2)}°` : 'no arrow'}`);
  }
  step(`60 the arrow is rolled as the pose says: check turn, pull-up, over the top, before release, egress arc (${tag})`, ok, `${parts.join('; ')} (mesh within ${ROLL_TOLERANCE_DEG}° of the pose)`);
}

/**
 * Check 61: the roll is visible in pixels. Top-down, the 2D overlay hidden (the discs and plates lie over
 * the arrow; try/finally, as checks 2, 5b and 23), count the SOLID underside pixels in the square 12 px
 * each way round the arrow: a pixel counts when it and its eight neighbours all pass `undersideLike`, the colour seat #1's
 * underside is drawn in (shade 0.40 of #22d3ee, (19, 140, 158); the top, the fin, the planner's line
 * colours, the drape and the background all fail it). The solid-block rule keeps the anti-aliased edge of
 * the lit top over the dark casing, a blend that can pass the colour test alone, out of the count: an
 * edge is one pixel wide and cannot fill a 3 × 3 block. Over the top of the pop-up's pull-down (midway
 * between PDP and TRK, the roll about −151°, the arrow all but upside down) the arrow shows its underside
 * to a camera above it: at least UNDERSIDE_MIN solid pixels. In the straight climb 8 s after POP (wings
 * level) it shows only its top: at most UNDERSIDE_MAX.
 *
 * UNDERSIDE_MIN and UNDERSIDE_MAX: measured 2026-11-15 on the first green run. Over the top, 109 solid
 * underside px at 1400×900 and 106 at 1024×768; in the straight climb 0 at both. The minimum is half of the
 * smaller count (53), the maximum is 2 (the climb reads 0; an edge cannot fill a 3 × 3 block).
 *
 * Proven red (2026-11-15) by one temporary edit to src/lib/playbackScene/arrowShape.ts, the underside
 * given no shade of its own (`ARROW_UNDER_SHADE = 0.4` → `1.0`; check 60 stays green):
 *   STEP FAIL 61 the roll shows in pixels: Top-down, the underside over the top of the pull-down, none in the straight climb (1400x900) — over the top t=-17.5 (roll -151°) at 276,500: 0 solid underside px (need ≥ 53); straight climb t=-28.8 (roll 0.0°): 0 (need ≤ 2)
 *   STEP FAIL 61 … (1024x768) — over the top t=-17.5 (roll -151°) at 202,395: 0 solid underside px (need ≥ 53); …
 * and by the roll dropped in the scene (check 60's second edit), which turns the same arm red:
 *   STEP FAIL 61 … (1400x900) — over the top t=-17.5 (roll -151°) at 276,500: 0 solid underside px (need ≥ 53); straight climb t=-28.8 (roll 0.0°): 0 (need ≤ 2)
 * (geo-check AR1 turns red under the same shade edit too, by its shade arm.)
 */
const UNDERSIDE_PATCH = 12;
const UNDERSIDE_MIN = 53;
const UNDERSIDE_MAX = 2;
const undersideLike = (p) => p[0] < 60 && p[1] > 125 && p[1] < 160 && p[2] > 140 && p[2] < 180;
function solidUnderside(img, [cx, cy], r) {
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 1 || y < 1 || x >= img.width - 1 || y >= img.height - 1) continue;
    let solid = true;
    for (let dy = -1; dy <= 1 && solid; dy++) for (let dx = -1; dx <= 1; dx++) if (!undersideLike(img.at(x + dx, y + dy))) { solid = false; break; }
    if (solid) n++;
  }
  return n;
}
async function checkArrowUnderside(page, tag) {
  await pbEval(page, () => __pb.pause());
  const ms = await pbEval(page, () => __pb.source().markers(0).map((m) => ({ kind: m.kind, t: m.t_s })));
  const at = (kind) => ms.find((m) => m.kind === kind)?.t;
  const apexT = (at('PDP') + at('TRK')) / 2, climbT = at('POP') + 8;
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  const count = async (name, t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
    const p = await pbEval(page, () => __pb.project(0, 'jet'));
    const roll = await pbEval(page, () => { const a = __pb.arrow(); return a ? a.pose_bank_deg : NaN; });
    await overlay(page, false);
    let img;
    try {
      img = await shot(page, `${tag}-61-underside-${name}`);
    } finally {
      await overlay(page, true);
    }
    return { p, roll, n: p ? solidUnderside(img, p.map(Math.round), UNDERSIDE_PATCH) : 0 };
  };
  const apex = await count('apex', apexT);
  const climb = await count('climb', climbT);
  step(`61 the roll shows in pixels: Top-down, the underside over the top of the pull-down, none in the straight climb (${tag})`,
    apex.n >= UNDERSIDE_MIN && climb.n <= UNDERSIDE_MAX,
    `over the top t=${apexT.toFixed(1)} (roll ${apex.roll.toFixed(0)}°) at ${apex.p ? apex.p.map(Math.round) : 'none'}: ${apex.n} solid underside px (need ≥ ${UNDERSIDE_MIN}); straight climb t=${climbT.toFixed(1)} (roll ${climb.roll.toFixed(1)}°): ${climb.n} (need ≤ ${UNDERSIDE_MAX})`);
  await pbEval(page, () => __pb.goHome());
}

/**
 * Check 51: the bomb is found on its own fall line. The 2D overlay hidden (the ring would carry it: this is the 3D's
 * own bomb, in try/finally as checks 2, 5b and 23), the lone pop-up on flat ground, paused.
 * - Top-down, 4 s after the release: at least BOMB_WHITE_MIN white-ish pixels (every channel over 200: the bomb's
 *   outline, which the planner's red, the casing and the drape never are) within 12 px of the bomb; and fewer than 3
 *   within 12 px of where the bomb was 3 s earlier (48 px away, on the same dashed line, so the line alone does not
 *   pass).
 * - Home (Orbit), the same screen point read 4 s after the release (the bomb is there, seen end-on) has at least
 *   BOMB_WHITE_MIN_HOME; the control is that same screen point 1 s before the release (no bomb yet; the bomb moves
 *   only about 28 px over its whole fall at Home, so no earlier position on the fall is far enough from it) and
 *   has fewer than 3.
 *
 * BOMB_WHITE_MIN and BOMB_WHITE_MIN_HOME: measured 2026-11-15 on the first green run, set at 60% of the smaller count.
 * Top-down 4 s after the release: 50 white px at 1400×900 and 47 at 1024×768 (the control 3 s earlier on the same line: 0 at
 * both), so 28. Home, the bomb seen end-on: 22 and 21 (the control before the release: 0), and 38 and 34 for the watched #2's own
 * bomb on the four-ship at Home (check 52), so 12 (60% of 21; the white outline's rim round a 5 px tail is all there is to see).
 *
 * Proven red 2026-11-15 by one temporary edit to scene/jetLayer.ts, `bomb.add(hull)` deleted (the bomb without its outline; geo-check
 * stays green):
 *   STEP FAIL 51 the bomb is found on its own fall line, overlay hidden: Top-down and Home (1400x900) — Top-down 4 s after the release: bomb at 400,484: 0 white px (need 28); 3 s earlier on its line at 424,437: 0 (need under 3); Home: bomb at 932,343: 0 white px (need 12), the same point 1 s before the release: 0 (need under 3)
 *   STEP FAIL 51 … (1024x768) — Top-down …: bomb at 290,392: 0 white px (need 28); …; Home: bomb at 687,287: 0 white px (need 12), …
 * (check 52 goes red with it by its watched-jet arm: #2's own bomb 0 white px, need 12; geo-check stays green.)
 */
const whiteLike = (p) => p[0] > 200 && p[1] > 200 && p[2] > 200;
const whiteIn = (img, [x, y], r) => patch(img, [Math.round(x), Math.round(y)], r).filter(whiteLike).length;
const BOMB_WHITE_MIN = 28;
const BOMB_WHITE_MIN_HOME = 12;
const BOMB_PATCH = 12;
async function checkBombSeen(page, tag) {
  const rel = await pbEval(page, () => __pb.moments.jets[0].release);
  // The time bar and the ground as the step found them are put back at the end: the checks after it (3a's hill) are laid out for them.
  const was = await pbEval(page, () => ({ whole: __pb.show().wholeRunIn, ground: __pb.terrain().ground }));
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); });
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
  };
  const out = {};
  await overlay(page, false);
  try {
    await page.getByRole('button', { name: 'Top-down', exact: true }).click();
    await at(rel + 4);
    const p = await pbEval(page, () => __pb.project(0, 'bomb'));
    const earlier = await pbEval(page, (t) => {
      const b = __pb.source().bombAt(0, t, {});
      return __pb.projectPoint(b.x, -b.z, b.y);
    }, rel + 1);
    const img = await shot(page, `${tag}-51-bomb-topdown`);
    out.top = { p, earlier, n: p ? whiteIn(img, p, BOMB_PATCH) : 0, control: earlier ? whiteIn(img, earlier, BOMB_PATCH) : -1 };
    await pbEval(page, () => __pb.goHome());
    await at(rel + 4);
    const home = await pbEval(page, () => __pb.project(0, 'bomb'));
    const imgHome = await shot(page, `${tag}-51-bomb-home`);
    await at(rel - 1);
    const imgBefore = await shot(page, `${tag}-51-bomb-home-before`);
    out.home = { p: home, n: home ? whiteIn(imgHome, home, BOMB_PATCH) : 0, control: home ? whiteIn(imgBefore, home, BOMB_PATCH) : -1 };
  } finally {
    await overlay(page, true);
    await pbEval(page, (w) => { __pb.setRange(w.whole); __pb.setGround(w.ground); __pb.goHome(); }, was);
  }
  const fmt = (q) => (q ? `${Math.round(q[0])},${Math.round(q[1])}` : 'none');
  step(`51 the bomb is found on its own fall line, overlay hidden: Top-down and Home (${tag})`,
    !!out.top.p && !!out.top.earlier && out.top.n >= BOMB_WHITE_MIN && out.top.control >= 0 && out.top.control < 3 &&
      !!out.home.p && out.home.n >= BOMB_WHITE_MIN_HOME && out.home.control >= 0 && out.home.control < 3,
    `Top-down 4 s after the release: bomb at ${fmt(out.top.p)}: ${out.top.n} white px (need ${BOMB_WHITE_MIN}); 3 s earlier on its line at ${fmt(out.top.earlier)}: ${out.top.control} (need under 3); ` +
      `Home: bomb at ${fmt(out.home.p)}: ${out.home.n} white px (need ${BOMB_WHITE_MIN_HOME}), the same point 1 s before the release: ${out.home.control} (need under 3)`);
}

/**
 * Check 51b: the ring round the falling bomb, on the real overlay and the real Show panel. The lone pop-up on flat ground,
 * paused, Top-down.
 * - 4 s after the release: the overlay's bombs list (`debugLabels().bombs`) has exactly one entry, within 1 px of the bomb
 *   the scene projects, with r 11 and alpha 1; at least 18 of 24 points on the circle of that radius have a white-ish pixel
 *   within 1.5 px (the ring's white line is really on the screen).
 * - 0.05 s after the release the radius is the pulse's, 11 × 1.81 = 19.9 (to 0.5); 0.5 s before it and 0.3 s after the
 *   impact there is no ring.
 * - On the real Show panel: Show ▾ opened, its Impact box (a native checkbox, found by its label) ticked off by a mouse
 *   click, and the list is empty 4 s after the release; then Tab from the Show button reaches the box and Space ticks it on,
 *   and there is one entry again.
 *
 * Measured 2026-11-15 at both sizes: the ring 0.00 px off the bomb and 24 of 24 ring points white, r 19.9 at 0.05 s, 7 Tabs from the
 * Show button to the box.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/labelLayer.ts, `ctx.impact ? o.jets[k].bombPosition() : undefined` → `!ctx.impact ? …`
 * (the rings drawn exactly when Impact is off; geo-check stays green, 51 stays green):
 *   STEP FAIL 51b the ring round the falling bomb on the overlay: … (1400x900) — 4 s after the release: 0 rings; 0.05 s after: r none (want 19.9 ± 0.5); 0.5 s before the release 0 rings, 0.3 s after the impact 0; Show panel: a native checkbox, ticked true; clicked off: 1 rings, impact false; Tab reached it true (7 Tabs), Space on: 0 ring, impact true
 *   STEP FAIL 51b … (1024x768) — the same
 * (check 52 goes red with it too, by its ring arms: no ring at -4.5.)
 */
async function checkBombRing(page, tag) {
  const rel = await pbEval(page, () => __pb.moments.jets[0].release);
  const imp = await pbEval(page, () => __pb.moments.jets[0].impact);
  const was = await pbEval(page, () => ({ whole: __pb.show().wholeRunIn, ground: __pb.terrain().ground }));
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); __pb.act({ type: 'show', a: { type: 'impact', on: true } }); });
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
  };
  const bombs = () => pbEval(page, () => __pb.debugLabels().bombs);
  const cv = await canvasBox(page);
  const parts = [];
  let ok = true;

  await at(rel + 4);
  const proj = await pbEval(page, () => __pb.project(0, 'bomb'));
  const list = await bombs();
  const img = await shot(page, `${tag}-51b-ring`);
  const b = list[0];
  const off = b && proj ? Math.hypot(b.x + cv.l - proj[0], b.y + cv.t - proj[1]) : NaN;
  let onRing = 0;
  if (b) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI, x = b.x + cv.l + b.r * Math.cos(a), y = b.y + cv.t + b.r * Math.sin(a);
      if (whiteIn(img, [x, y], 1) > 0) onRing++;
    }
  }
  const ringOk = list.length === 1 && b.jet === 0 && off <= 1 && b.r === 11 && b.alpha === 1 && onRing >= 18;
  ok = ok && ringOk;
  parts.push(`4 s after the release: ${list.length} ring${list.length === 1 ? '' : 's'}${b ? ` (jet ${b.jet}, r ${b.r}, alpha ${b.alpha}, ${off.toFixed(2)} px off the bomb, ${onRing} of 24 ring points white)` : ''}`);

  await at(rel + 0.05);
  const pulse = await bombs();
  const pulseOk = pulse.length === 1 && Math.abs(pulse[0].r - 11 * 1.81) <= 0.5;
  ok = ok && pulseOk;
  parts.push(`0.05 s after: r ${pulse[0] ? pulse[0].r.toFixed(1) : 'none'} (want 19.9 ± 0.5)`);

  await at(rel - 0.5);
  const before = await bombs();
  await at(imp + 0.3);
  const after = await bombs();
  ok = ok && before.length === 0 && after.length === 0;
  parts.push(`0.5 s before the release ${before.length} rings, 0.3 s after the impact ${after.length}`);

  // The real Show panel.
  await at(rel + 4);
  await page.getByRole('button', { name: 'Show ▾' }).click();
  const box = page.getByRole('checkbox', { name: /^Impact/ });
  const native = (await box.count()) === 1 && (await box.evaluate((e) => e.tagName === 'INPUT' && e.type === 'checkbox' && e.checked));
  await box.click();
  await settle(page, 300);
  const offList = await bombs();
  const offState = await pbEval(page, () => __pb.show().impact);
  // Tab from the Show button until the box has the focus (the panel follows the button in the page).
  await page.getByRole('button', { name: 'Show ▾' }).focus();
  let reached = false, tabs = 0;
  for (; tabs < 14 && !reached; tabs++) {
    await page.keyboard.press('Tab');
    reached = await pbEval(page, () => { const a = document.activeElement; return !!a && a.tagName === 'INPUT' && /^Impact/.test((a.closest('label')?.textContent || '').trim()); });
  }
  await page.keyboard.press(' ');
  await settle(page, 300);
  const onList = await bombs();
  const onState = await pbEval(page, () => __pb.show().impact);
  await page.getByRole('button', { name: 'Show ▾' }).click(); // shut it again
  const panelOk = native && offList.length === 0 && offState === false && reached && onList.length === 1 && onState === true;
  ok = ok && panelOk;
  parts.push(`Show panel: a native checkbox, ticked ${native}; clicked off: ${offList.length} rings, impact ${offState}; Tab reached it ${reached} (${tabs} Tabs), Space on: ${onList.length} ring, impact ${onState}`);

  await pbEval(page, (w) => { __pb.setRange(w.whole); __pb.setGround(w.ground); __pb.goHome(); }, was);
  step(`51b the ring round the falling bomb on the overlay: found, 11 px, pulsing at the release, gone before and after, switched by the real Impact box (${tag})`, ok, parts.join('; '));
}

// ── The bomb's trace (checks 63 and 63b). The fall's line on screen is read off the scene's own sampled points
// (the fall is a curve, and in Top-down a curve on a vertical plane is not quite a chord of its ends), each
// point through the live camera, and walked a pixel at a time: at each spot the pixel itself and the two a
// pixel to either side of the line (a 1.5 px line is hardly more than one pixel wide, and the polyline and the
// drawn line are not the same to the pixel). A solid line then gives red at nearly every spot, the planner's dashed
// bomb line (4 on, 6 off) at about 40%.
const TRACE_STEP_PX = 1;
const TRACE_CLEAR_PX = 12;
const TRACE_CLEAR_TARGET_PX = 12;
const TRACE_SOLID_MIN = 0.9;
const TRACE_DASH_MIN = 0.2;
const TRACE_DASH_MAX = 0.7;
const TRACE_GROUP_MIN = 10;
/** The release point the page gives lies this close to the fall's own first point, px (the two go through the same camera). */
const TRACE_RELEASE_PX = 1;
/** Spots every `step` px along a polyline of screen points, each with its arc length, its direction and the polyline's arc lengths at its vertices. */
function alongPolyline(poly, step) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const total = cum[cum.length - 1];
  const spots = [];
  let seg = 1;
  for (let s = step / 2; s < total; s += step) {
    while (seg < cum.length - 1 && cum[seg] < s) seg++;
    const len = cum[seg] - cum[seg - 1] || 1, f = (s - cum[seg - 1]) / len;
    const dx = poly[seg][0] - poly[seg - 1][0], dy = poly[seg][1] - poly[seg - 1][1], d = Math.hypot(dx, dy) || 1;
    spots.push({ s, x: poly[seg - 1][0] + f * dx, y: poly[seg - 1][1] + f * dy, ux: dx / d, uy: dy / d });
  }
  return { spots, cum, total };
}
/** Arc length along the polyline of the point on it nearest `p`. */
function arcOf(poly, cum, p) {
  let best = Infinity, arc = 0;
  for (let i = 1; i < poly.length; i++) {
    const ax = poly[i - 1][0], ay = poly[i - 1][1], dx = poly[i][0] - ax, dy = poly[i][1] - ay, l2 = dx * dx + dy * dy;
    const f = l2 > 0 ? Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
    const d = Math.hypot(ax + f * dx - p[0], ay + f * dy - p[1]);
    if (d < best) {
      best = d;
      arc = cum[i - 1] + f * Math.sqrt(l2);
    }
  }
  return arc;
}
/** Whether a spot of the line passes `test`: the pixel there, or one a pixel to either side of the line. */
const spotHas = (img, sp, test) => [-1, 0, 1].some((k) => test(img.at(Math.round(sp.x - k * sp.uy), Math.round(sp.y + k * sp.ux))));
/**
 * The spots of the fall's line that pass `test`, by side of the bomb: `behind` (the release's side), `ahead` (the
 * target's) and, with no bomb in the picture, `all`. A spot within `clear.release` px of the release point, `clear.bomb`
 * of the bomb or `clear.target` of the target (their own red, and the bomb's body) is left out.
 */
function traceSpots(img, poly, bomb, test, clear = { release: TRACE_CLEAR_PX, bomb: TRACE_CLEAR_PX, target: TRACE_CLEAR_TARGET_PX }) {
  const { spots, cum } = alongPolyline(poly, TRACE_STEP_PX);
  const rel = poly[0], tgt = poly[poly.length - 1];
  const sBomb = bomb ? arcOf(poly, cum, bomb) : Infinity;
  const g = { behind: { n: 0, hit: 0 }, ahead: { n: 0, hit: 0 }, all: { n: 0, hit: 0 } };
  for (const sp of spots) {
    if (Math.hypot(sp.x - rel[0], sp.y - rel[1]) < clear.release || Math.hypot(sp.x - tgt[0], sp.y - tgt[1]) < clear.target) continue;
    if (bomb && Math.hypot(sp.x - bomb[0], sp.y - bomb[1]) < clear.bomb) continue;
    const grp = !bomb ? g.all : sp.s < sBomb ? g.behind : g.ahead;
    grp.n++;
    if (spotHas(img, sp, test)) grp.hit++;
  }
  return g;
}
/** The fall of jet `jet` as the page draws it now: its points on screen, the bomb, and the layer's own count of the trace. */
const fallOnScreen = (page, jet) => pbEval(page, (k) => {
  const pts = __pb.source().plannedBomb(k);
  const poly = [];
  for (let i = 0; i + 2 < pts.length; i += 3) poly.push(__pb.projectPoint(pts[i], -pts[i + 2], pts[i + 1]));
  return { poly, bomb: __pb.project(k, 'bomb'), release: __pb.project(k, 'release'), trace: __pb.trace(k) };
}, jet);
/** How far the release point the page gives (`project(jet, 'release')`) is from the fall's own first point, px. */
const releaseOff = (f) => (f.release && f.poly[0] ? Math.hypot(f.release[0] - f.poly[0][0], f.release[1] - f.poly[0][1]) : NaN);

/**
 * Check 63: the bomb leaves a solid trace behind it and keeps it. The lone pop-up on flat ground, Top-down, the
 * overlay hidden, paused at 1×. The fall's line is walked as described above (a spot is red if the script's
 * own redLike test passes at it); the layer's own count (`__pb.trace(0)`: the fall's points, and how many the
 * trace reaches) is read at the same time.
 * - 60% of the way down the fall: at least 90% of the spots between the release and the bomb are red (the solid
 *   trace) and between 20% and 70% of those between the bomb and the target (the planner's dashed fall line).
 * - 1 s before the release: no trace (`drawn` 0) and the whole line is the dashed one (20% to 70%).
 * - 5 s after the impact: the whole line is solid (at least 90%) and the trace reaches every point (`drawn` is `points`).
 * - Seek back to 1 s before the release: dashed again, `drawn` 0 (the trace is a function of the clock's time).
 * A group needs at least TRACE_GROUP_MIN spots to count. The spots are every pixel of the line's length rather than 40
 * of them: the part of the dashed line between the bomb and the target is only 14 to 26 px long once the 12 px round the
 * bomb and the target are left out, and 40 spots over the whole line would leave a handful there.
 *
 * Measured 2026-11-15 on the first green run: 1400×900, behind the bomb 100% of 65 spots red, ahead of it 58% of 26, the
 * whole line 44% of 115 before the release and again after the seek back, 100% of 115 after the impact; 1024×768, 100% of
 * 42, 57% of 14, 43% of 80, 100% of 80. The thresholds are the ones written above (a solid line is at 100%, the dashed one
 * between 40% and 60%).
 *
 * Proven red 2026-11-15 by two temporary edits, one run each:
 * (a) scene/jetLayer.ts, the trace's two meshes made invisible when they are made (`traceCasing.visible = traceLine.visible = false`):
 *   STEP FAIL 63 the bomb's trace: … Top-down (1400x900) — 60% down: behind the bomb 43% of 65 red (need 90%), ahead 58% of 26 (need 20-70%), trace 21 of 35 points; 1 s before the release: 44% of 115 (need 20-70%), trace 0 (need 0); 5 s after the impact: 44% of 115 (need 90%), trace 35 of 35; seek back: 44% of 115, trace 0
 *   (the 1024×768 run of this edit timed out on a screenshot, the machine being busy; a later run of it went red there too: 43% of 42 behind the bomb)
 * (b) src/lib/playbackScene/source.ts, bombFlown returning every point at every time:
 *   STEP FAIL 63 the bomb's trace: … Top-down (1400x900) — 60% down: behind the bomb 100% of 65 red (need 90%), ahead 100% of 26 (need 20-70%), trace 35 of 35 points; 1 s before the release: 100% of 115 (need 20-70%), trace 35 (need 0); 5 s after the impact: 100% of 115 (need 90%), trace 35 of 35; seek back: 100% of 115, trace 35
 *   STEP FAIL 63 … (1024x768) — … ahead 100% of 14; 1 s before the release: 100% of 80, trace 35 (need 0); …
 * (geo-check BT1 goes red with (b) too: 0 points before the release is one of its readings.)
 *
 * The check also reads `__pb.project(0, 'release')` at each of the four moments: it must lie within TRACE_RELEASE_PX of the
 * fall's own first point (0.00 px on the green run, both sizes). Proven red 2026-11-15 by one temporary edit to
 * scene/createScene.ts, the release point taken from the fall's second point (`probe.set(pts[0], pts[1], pts[2])` →
 * `probe.set(pts[3], pts[4], pts[5])`), with every other reading of the check still green:
 *   STEP FAIL 63 the bomb's trace: … Top-down (1400x900) — … the release point the page gives is more than 1 px, or missing, from the fall's first point (need 1)
 *   STEP FAIL 63 … (1024x768) — … the release point the page gives is more than 1 px, or missing, from the fall's first point (need 1)
 */
async function checkBombTrace(page, tag) {
  const m = await pbEval(page, () => ({ rel: __pb.moments.jets[0].release, imp: __pb.moments.jets[0].impact }));
  // The step before put the time bar back with a session action, and the handle reads the session as the view last rendered
  // it: a read straight after it can still see the old choice, and putting that back would leave the next checks (3a, 5b) on the wrong range.
  await settle(page, 300);
  const was = await pbEval(page, () => ({ whole: __pb.show().wholeRunIn, ground: __pb.terrain().ground }));
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); });
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
  };
  const phases = {};
  await overlay(page, false);
  try {
    await page.getByRole('button', { name: 'Top-down', exact: true }).click();
    for (const [name, t] of [['mid', m.rel + 0.6 * (m.imp - m.rel)], ['before', m.rel - 1], ['after', m.imp + 5], ['back', m.rel - 1]]) {
      await at(t);
      const f = await fallOnScreen(page, 0);
      const img = await shot(page, `${tag}-63-trace-${name}`);
      const whole = f.poly.length > 1 && f.poly.every(Boolean);
      phases[name] = { whole, trace: f.trace, hasBomb: !!f.bomb, relOff: releaseOff(f), g: whole ? traceSpots(img, f.poly, f.bomb, redLike) : null };
    }
  } finally {
    await overlay(page, true);
    await pbEval(page, (w) => { __pb.setRange(w.whole); __pb.setGround(w.ground); __pb.goHome(); }, was);
  }
  const pct = (x) => (x && x.n ? `${Math.round((100 * x.hit) / x.n)}% of ${x.n}` : 'no spots');
  const frac = (x) => (x && x.n >= TRACE_GROUP_MIN ? x.hit / x.n : NaN);
  const solid = (x) => frac(x) >= TRACE_SOLID_MIN;
  const dashed = (x) => frac(x) >= TRACE_DASH_MIN && frac(x) <= TRACE_DASH_MAX;
  const P = phases;
  const mid = P.mid.g, before = P.before.g, after = P.after.g, back = P.back.g;
  const okMid = P.mid.whole && P.mid.hasBomb && solid(mid.behind) && dashed(mid.ahead) && P.mid.trace.drawn > 0 && P.mid.trace.drawn < P.mid.trace.points;
  const okBefore = P.before.whole && !P.before.hasBomb && dashed(before.all) && P.before.trace.drawn === 0;
  const okAfter = P.after.whole && !P.after.hasBomb && solid(after.all) && P.after.trace.points > 1 && P.after.trace.drawn === P.after.trace.points;
  const okBack = P.back.whole && dashed(back.all) && P.back.trace.drawn === 0;
  // The release point the page gives is the fall's first point, before, during and after the fall (a NaN fails).
  const relOff = Math.max(...['mid', 'before', 'after', 'back'].map((k) => (P[k].relOff <= TRACE_RELEASE_PX ? P[k].relOff : Infinity)));
  step(`63 the bomb's trace: solid from the release to the bomb, dashed ahead, none before the release, the whole fall after the impact, gone again on a seek back, Top-down (${tag})`,
    okMid && okBefore && okAfter && okBack && relOff <= TRACE_RELEASE_PX,
    `60% down: behind the bomb ${pct(mid && mid.behind)} red (need ${TRACE_SOLID_MIN * 100}%), ahead ${pct(mid && mid.ahead)} (need ${TRACE_DASH_MIN * 100}-${TRACE_DASH_MAX * 100}%), trace ${P.mid.trace.drawn} of ${P.mid.trace.points} points; ` +
      `1 s before the release: ${pct(before && before.all)} (need ${TRACE_DASH_MIN * 100}-${TRACE_DASH_MAX * 100}%), trace ${P.before.trace.drawn} (need 0); ` +
      `5 s after the impact: ${pct(after && after.all)} (need ${TRACE_SOLID_MIN * 100}%), trace ${P.after.trace.drawn} of ${P.after.trace.points}; ` +
      `seek back: ${pct(back && back.all)}, trace ${P.back.trace.drawn}; ` +
      `the release point the page gives is ${Number.isFinite(relOff) ? `${relOff.toFixed(2)} px` : 'more than 1 px, or missing,'} from the fall's first point (need ${TRACE_RELEASE_PX})`);
}

/**
 * Check 63b: a jet that is not watched leaves a trace in its own bomb shade, and none beyond its bomb. The four-ship
 * opened watching #2, so #1's bomb is one of the others' (as in 52); Top-down, flat ground, the overlay hidden, paused
 * at 1× half way down #1's fall. The fall's line is walked as in 63; a spot has the shade if a pixel there is within 3
 * levels of #1's bomb colour (#1ebfd8, the cyan seat colour shaded 0.8 in linear light, as geo-check BM5 holds; the
 * others' path is 8 levels away in green and is not counted). Between the release and the bomb at least
 * TRACE_OTHER_MIN spots have it; between the bomb and the target at most 2. The bomb's body is kept clear (9 px:
 * the others' bomb is the same shade); the release point and the target, whose own colours are not that shade, only
 * a few px, because the four-ship's fall is short on screen (64 px at 1400×900, 48 at 1024×768).
 *
 * TRACE_OTHER_MIN: measured 2026-11-15 on the first green run: 13 of 20 spots in the shade between the release and the bomb
 * at 1400×900 and 5 of 12 at 1024×768 (a 1.5 px line leaves few pixels that are entirely its own colour), none of 16 and
 * none of 8 between the bomb and the target; set at 60% of the smaller count, 3.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/jetLayer.ts wear(), the trace left out of the other jets' look
 * (`traceCasing.visible = on;` → `traceCasing.visible = traceLine.visible = on;`, so the line is hidden for a jet that is not watched):
 *   STEP FAIL 63b a jet that is not watched leaves its trace in its own bomb shade, and none beyond its bomb (1400x900-strike4-watch2) — times and colours as the check expects; release to bomb: 0 of 20 spots in #1's bomb shade (need 3), bomb to target: 0 of 16 (need at most 2); trace 17 of 35 points (35 on screen)
 *   STEP FAIL 63b … (1024x768-strike4-watch2) — … release to bomb: 0 of 12 spots in #1's bomb shade (need 3), bomb to target: 0 of 8 (need at most 2); …
 */
const TRACE_OTHER_CLEAR_BOMB_PX = 9;
const TRACE_OTHER_CLEAR_RELEASE_PX = 3;
const TRACE_OTHER_CLEAR_TARGET_PX = 4;
const TRACE_OTHER_MIN = 3;
async function checkBombTraceOthers(page, tag) {
  const m = await pbEval(page, () => __pb.moments.jets.map((j) => ({ release: j.release, impact: j.impact })));
  const seatColour = await pbEval(page, () => __pb.colours.jets[0]);
  const T = m[0].release + 0.5 * (m[0].impact - m[0].release);
  const setup = m[1].release > T && seatColour === '#22d3ee';
  const shade = hex('#1ebfd8');
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); });
  let f, g = null, n = 0;
  await overlay(page, false);
  try {
    await page.getByRole('button', { name: 'Top-down', exact: true }).click();
    await pbEval(page, (t) => __pb.seek(t), T);
    await settle(page, 300);
    f = await fallOnScreen(page, 0);
    const img = await shot(page, `${tag}-63b-trace-other`);
    if (f.poly.length > 1 && f.poly.every(Boolean) && f.bomb) {
      g = traceSpots(img, f.poly, f.bomb, (p) => near(p, shade, 3), { release: TRACE_OTHER_CLEAR_RELEASE_PX, bomb: TRACE_OTHER_CLEAR_BOMB_PX, target: TRACE_OTHER_CLEAR_TARGET_PX });
      n = f.poly.length;
    }
  } finally {
    await overlay(page, true);
    await pbEval(page, () => __pb.goHome());
  }
  step(`63b a jet that is not watched leaves its trace in its own bomb shade, and none beyond its bomb (${tag})`,
    setup && !!g && g.behind.n >= TRACE_GROUP_MIN && g.behind.hit >= TRACE_OTHER_MIN && g.ahead.hit <= 2 && f.trace.drawn > 0 && f.trace.drawn < f.trace.points,
    `${setup ? 'times and colours as the check expects' : `not as the check expects (seat colour ${seatColour}, #2 released ${m[1].release.toFixed(1)}, check at ${T.toFixed(1)})`}; ` +
      (g ? `release to bomb: ${g.behind.hit} of ${g.behind.n} spots in #1's bomb shade (need ${TRACE_OTHER_MIN}), bomb to target: ${g.ahead.hit} of ${g.ahead.n} (need at most 2); trace ${f.trace.drawn} of ${f.trace.points} points (${n} on screen)` : 'the fall or the bomb is not on screen'));
}

// ── The flash where a bomb lands (checks 53, 53b, 54, 55, 56 and 59). The flash is read off the 3D's own pixels with the
// overlay hidden, against a picture of the same moment with Show › Impact off (`act`), so only the effect differs: the
// bomb's trace, finished at the impact and lying on the target (and in Home its whole fall is within 30 px of it), the
// jet's trail and the arrow are in both. (A picture from before the release would not do: it has the dashed fall line
// where the trace now lies, and the two differ by more than these limits.) A pixel differs if one of its channels is more
// than FLASH_DIFF levels apart.
const FLASH_DISC_PX = 30;
const FLASH_DIFF = 40;
const FLASH_MIN = 1300;
/** Pixels between `r0` and `r1` px of a page point whose colours differ between two pictures by more than FLASH_DIFF in a channel. */
function differing(a, b, [cx, cy], r0, r1) {
  let n = 0;
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < r0 || d > r1 || x < 0 || y < 0 || x >= a.width || y >= a.height) continue;
    const p = a.at(x, y), q = b.at(x, y);
    if (Math.abs(p[0] - q[0]) > FLASH_DIFF || Math.abs(p[1] - q[1]) > FLASH_DIFF || Math.abs(p[2] - q[2]) > FLASH_DIFF) n++;
  }
  return n;
}
/** Jet `k`'s impact effect as the layers drew it on the last frame (`__pb.effects()`), or null. */
const impactFx = (page, k) => pbEval(page, (j) => {
  const e = __pb.effects();
  return e && e.jets[j] ? e.jets[j].impact : null;
}, k);
/**
 * Show › Impact through the session, as the menu sets it, then wait until jet `k`'s flash is drawn as `want` says. False
 * when it never was (a switch that does not reach the flash): the check then fails on its own readings, not on the wait.
 */
async function impactSwitch(page, on, k, want) {
  await pbEval(page, (o) => __pb.act({ type: 'show', a: { type: 'impact', on: o } }), on);
  const reached = await page.waitForFunction(([j, w]) => { const e = __pb.effects(); return !!e && !!e.jets[j] && e.jets[j].impact.flashShown === w; }, [k, want], { timeout: 15000, polling: 100 })
    .then(() => true, () => false);
  await settle(page, 300);
  return reached;
}
/**
 * The flash of jet `k` at the clock's time now: what the layer drew, where the burst is on the page, and the pixels that
 * differ from the same moment with Show › Impact off, within FLASH_DISC_PX of the burst (or of `at`, when the burst is not
 * shown). Impact is on before and after.
 */
async function flashPicture(page, k, name, at, r0 = 0) {
  const e = await impactFx(page, k);
  const p = (await pbEval(page, (j) => __pb.project(j, 'impact'), k)) || at;
  const on = await shot(page, `${name}-on`);
  const switched = await impactSwitch(page, false, k, false);
  const off = await shot(page, `${name}-off`);
  await impactSwitch(page, true, k, !!(e && e.flashShown));
  // A switch that did not take the flash away leaves nothing to compare with.
  return { e, p, n: p && switched ? differing(on, off, p, r0, FLASH_DISC_PX) : -1 };
}
const fmtPt = (q) => (q ? `${Math.round(q[0])},${Math.round(q[1])}` : 'none');
const fmtFx = (e) => (e ? `size ${e.flash.toFixed(2)}, strength ${e.flashAlpha.toFixed(2)}, shown ${e.flashShown}` : 'no effect');

/**
 * Check 53: a flash where the bomb lands, at the time over target. The lone pop-up, Orbit at Home, flat ground, 1×, paused,
 * the overlay hidden. Pictures against the same moment with Impact off, as described above.
 * - 0.05 s before the impact: no flash drawn.
 * - 0.3 s after: the flash at full strength and at least 0.9 of its size, and at least FLASH_MIN pixels within 30 px of the
 *   burst (`project(0, 'impact')`) differ.
 * - 1.5 s after: no flash drawn, and fewer than 20 pixels differ between 14 and 30 px from where it was.
 * - 6 s after: no flash and no ring drawn, and fewer than 5 pixels differ within 30 px.
 *
 * FLASH_MIN: measured 2026-11-15 on the first green run: 2,197 px at 1400×900, 2,280 at 1024×768 (and 2,306 for 55's #3,
 * 2,197 and 2,280 again at 16× in 53b); set at 60% of the smallest, 1,300. Fewer than 20 and 5 were 0 and 0.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/impactLayer.ts, `flash.visible = phase.flashAlpha > 0 && phase.flash > 0`
 * → `flash.visible = true` (the flash's meshes drawn at every moment; at strength 0 they paint nothing, so it is the layer's
 * own `flashShown` that goes red; 53b goes red with it):
 *   STEP FAIL 53 a flash where the bomb lands at the time over target, gone by 1.5 s, Home at 1× (1400x900) — 0.05 s before: size 0.00, strength 0.00, shown true; 0.3 s after: size 1.00, strength 1.00, shown true, 2197 px differ within 30 px of 945,347 (need 1300); 1.5 s after: size 1.00, strength 0.00, shown true, 0 px differ 14-30 px out (need under 20); 6 s after: size 1.00, strength 0.00, shown true, ring shown false, 0 px differ (need under 5)
 */
async function checkFlash(page, tag) {
  const imp = await pbEval(page, () => __pb.moments.jets[0].impact);
  const was = await pbEval(page, () => ({ whole: __pb.show().wholeRunIn, ground: __pb.terrain().ground }));
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); __pb.goHome(); __pb.act({ type: 'show', a: { type: 'impact', on: true } }); });
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
  };
  let before, full, late, gone;
  await overlay(page, false);
  try {
    await at(imp - 0.05);
    before = await impactFx(page, 0);
    await at(imp + 0.3);
    full = await flashPicture(page, 0, `${tag}-53-flash`);
    await at(imp + 1.5);
    late = await flashPicture(page, 0, `${tag}-53-flash-late`, full.p, 14);
    await at(imp + 6);
    gone = await flashPicture(page, 0, `${tag}-53-flash-gone`, full.p);
  } finally {
    await overlay(page, true);
    await pbEval(page, (w) => { __pb.setRange(w.whole); __pb.setGround(w.ground); __pb.goHome(); }, was);
  }
  const okBefore = !!before && !before.flashShown;
  const okFull = !!full.e && full.e.flashShown && full.e.flashAlpha === 1 && full.e.flash >= 0.9 && full.n >= FLASH_MIN;
  const okLate = !!late.e && !late.e.flashShown && late.n >= 0 && late.n < 20;
  const okGone = !!gone.e && !gone.e.flashShown && !gone.e.ringShown && gone.n >= 0 && gone.n < 5;
  step(`53 a flash where the bomb lands at the time over target, gone by 1.5 s, Home at 1× (${tag})`, okBefore && okFull && okLate && okGone,
    `0.05 s before: ${fmtFx(before)}; 0.3 s after: ${fmtFx(full.e)}, ${full.n} px differ within 30 px of ${fmtPt(full.p)} (need ${FLASH_MIN}); ` +
      `1.5 s after: ${fmtFx(late.e)}, ${late.n} px differ 14-30 px out (need under 20); 6 s after: ${fmtFx(gone.e)}, ring shown ${gone.e ? gone.e.ringShown : 'none'}, ${gone.n} px differ (need under 5)`);
}

/**
 * Check 56: the Impact switch reaches the flash. The lone pop-up 0.3 s after the impact at 1×, paused: Show › Impact off
 * through the session (`act`, the menu's own path) and the flash is not drawn and the page gives no burst point; on again
 * and it is drawn.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/impactLayer.ts, `group.visible = ctx.impact && flash.visible` →
 * `group.visible = flash.visible` (53 and 53b go red with it: their pictures with Impact off are taken through the switch):
 *   STEP FAIL 56 Show › Impact turns the flash off and on again (1400x900) — on: size 1.00, strength 1.00, shown true; off: size 1.00, strength 1.00, shown true, burst point 945,347; on again: size 1.00, strength 1.00, shown true
 */
async function checkFlashSwitch(page, tag) {
  const imp = await pbEval(page, () => __pb.moments.jets[0].impact);
  await pbEval(page, (t) => { __pb.pause(); __pb.setSpeed(1); __pb.seek(t); __pb.act({ type: 'show', a: { type: 'impact', on: true } }); }, imp + 0.3);
  await settle(page, 300);
  const on0 = await impactFx(page, 0);
  await pbEval(page, () => __pb.act({ type: 'show', a: { type: 'impact', on: false } }));
  await page.waitForFunction(() => __pb.show() && __pb.show().impact === false, null, { timeout: 15000, polling: 100 });
  await settle(page, 500);
  const off = await impactFx(page, 0);
  const offPoint = await pbEval(page, () => __pb.project(0, 'impact'));
  await pbEval(page, () => __pb.act({ type: 'show', a: { type: 'impact', on: true } }));
  await page.waitForFunction(() => __pb.show() && __pb.show().impact === true, null, { timeout: 15000, polling: 100 });
  await settle(page, 500);
  const on1 = await impactFx(page, 0);
  step(`56 Show › Impact turns the flash off and on again (${tag})`,
    !!on0 && on0.flashShown && !!off && !off.flashShown && offPoint === null && !!on1 && on1.flashShown,
    `on: ${fmtFx(on0)}; off: ${fmtFx(off)}, burst point ${fmtPt(offPoint)}; on again: ${fmtFx(on1)}`);
}

/**
 * Check 53b: the flash is timed in real seconds, so it shows at 16×. The lone pop-up at 16×, Orbit at Home, flat ground,
 * paused, the overlay hidden: 4.8 s after the impact (0.3 real s) the flash is drawn and at least FLASH_MIN pixels differ
 * from the same moment with Impact off; 24 s after (1.5 real s) it is not drawn.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/impactLayer.ts, `impactPhase(ctx.t - impactT, ctx.speed, phase)` →
 * `impactPhase(ctx.t - impactT, 1, phase)` (geo-check stays green; 54 and 59, which also run at 16×, go red with it):
 *   STEP FAIL 53b the flash at 16×: shown 0.3 real s after the impact, gone 1.5 real s after (1400x900) — 4.8 s after: size 1.00, strength 0.00, shown false, -1 px differ within 30 px of none (need 1300); 24 s after: size 1.00, strength 0.00, shown false
 */
async function checkFlashFast(page, tag) {
  const imp = await pbEval(page, () => __pb.moments.jets[0].impact);
  const was = await pbEval(page, () => ({ whole: __pb.show().wholeRunIn, ground: __pb.terrain().ground }));
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(16); __pb.setRange(false); __pb.setGround('flat'); __pb.goHome(); __pb.act({ type: 'show', a: { type: 'impact', on: true } }); });
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
  };
  let early, late;
  await overlay(page, false);
  try {
    await at(imp + 4.8);
    early = await flashPicture(page, 0, `${tag}-53b-flash-16x`);
    await at(imp + 24);
    late = await impactFx(page, 0);
  } finally {
    await overlay(page, true);
    await pbEval(page, (w) => { __pb.setSpeed(1); __pb.setRange(w.whole); __pb.setGround(w.ground); __pb.goHome(); }, was);
  }
  step(`53b the flash at 16×: shown 0.3 real s after the impact, gone 1.5 real s after (${tag})`,
    !!early.e && early.e.flashShown && early.n >= FLASH_MIN && !!late && !late.flashShown,
    `4.8 s after: ${fmtFx(early.e)}, ${early.n} px differ within 30 px of ${fmtPt(early.p)} (need ${FLASH_MIN}); 24 s after: ${fmtFx(late)}`);
}

/**
 * Check 53b, the four-ship's part: at 16×, 58.6 s after #1's impact (3.66 real s) nothing of #1's impact is drawn and both
 * strengths are 0. (The size and the radius share stay at 1 once grown, so it is the two strengths and what is drawn that
 * are read, not all four numbers.)
 *
 * The edit that reddens the lone pop-up's part leaves this one green (both strengths are 0 at 58.6 s either way). Proven red
 * 2026-11-15 by one temporary edit to scene/impactLayer.ts, each jet timed by the last jet's impact (`src.impactOf(jet)` →
 * `src.impactOf(src.jetCount - 1)`: #1's flash then at #4's 40 s; on the lone pop-up it changes nothing):
 *   STEP FAIL 53b at 16×, 3.66 real s after #1's impact nothing of it is drawn (1400x900-strike4) — at 58.6 s: strengths 0.04999999999999982 / 1, flash shown true, ring shown false
 */
async function checkFlashFastFour(page, tag) {
  const imp = await pbEval(page, () => __pb.moments.jets[0].impact);
  await pbEval(page, (t) => { __pb.pause(); __pb.setSpeed(16); __pb.seek(t); }, imp + 58.6);
  await settle(page, 300);
  const e = await impactFx(page, 0);
  const t = await pbEval(page, () => __pb.snapshot().t);
  await pbEval(page, () => __pb.setSpeed(1));
  step(`53b at 16×, 3.66 real s after #1's impact nothing of it is drawn (${tag})`,
    !!e && Math.abs(t - (imp + 58.6)) < 1e-6 && e.flashAlpha === 0 && e.ringAlpha === 0 && !e.flashShown && !e.ringShown,
    `at ${t.toFixed(1)} s: ${e ? `strengths ${e.flashAlpha} / ${e.ringAlpha}, flash shown ${e.flashShown}, ring shown ${e.ringShown}` : 'no effect'}`);
}

/**
 * Check 54: the flash is a function of the clock alone. The lone pop-up, Orbit at Home, flat ground, paused, the overlay
 * hidden: picture A 0.4 s after the impact at 1×; seek 30 s before the impact and back; picture B. At least 99.9% of the
 * canvas's pixels (the dev frame-time readout left out: it changes as frames are drawn) are within 2 levels of A in every
 * channel, the flash is drawn in both, and the layer drew both with the very same numbers (its age and phase, from
 * `effects()`). The same at 16×, 6.4 s after the impact (0.4 real s).
 *
 * Measured 2026-11-15 on the first green run: 100.000% and 99.988% at 1400×900, 100.000% and 100.000% at 1024×768.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/impactLayer.ts, a module-level `let mutAge = 0` and
 * `impactPhase(ctx.t - impactT, …)` → `impactPhase(mutAge += ctx.dt, …)` (the flash's age kept from frame to frame; 53, 53b and
 * 56 go red with it). The pictures alone stayed within 2 levels (the paused clock draws few frames, so the kept age hardly
 * moves between A and B), which is why the numbers the layer drew with are compared too:
 *   STEP FAIL 54 the flash after a seek away and back is the same picture, at 1× and 16× (1400x900) — 1×: 99.988% of the canvas within 2 levels (need 99.9%), flash shown both times false, drawn with the same numbers false (…); 16×: 99.988% of the canvas within 2 levels (need 99.9%), flash shown both times true, drawn with the same numbers false (…)
 */
async function checkFlashPure(page, tag) {
  const imp = await pbEval(page, () => __pb.moments.jets[0].impact);
  const was = await pbEval(page, () => ({ whole: __pb.show().wholeRunIn, ground: __pb.terrain().ground }));
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); __pb.goHome(); __pb.act({ type: 'show', a: { type: 'impact', on: true } }); });
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
  };
  const cv = await canvasBox(page);
  const readout = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="dialog"] div')].find((d) => /^dev:/.test((d.textContent || '').trim()) && d.children.length === 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: r.left - 2, t: r.top - 2, r: r.right + 2, b: r.bottom + 2 };
  });
  const same = (a, b) => {
    let n = 0, ok = 0;
    for (let y = Math.ceil(cv.t); y < Math.floor(cv.t + cv.h); y++) for (let x = Math.ceil(cv.l); x < Math.floor(cv.l + cv.w); x++) {
      if (readout && x >= readout.l && x <= readout.r && y >= readout.t && y <= readout.b) continue;
      n++;
      const p = a.at(x, y), q = b.at(x, y);
      if (Math.abs(p[0] - q[0]) <= 2 && Math.abs(p[1] - q[1]) <= 2 && Math.abs(p[2] - q[2]) <= 2) ok++;
    }
    return n ? ok / n : 0;
  };
  const rows = [];
  await overlay(page, false);
  try {
    for (const [speed, age] of [[1, 0.4], [16, 6.4]]) {
      await pbEval(page, (s) => __pb.setSpeed(s), speed);
      await at(imp + age);
      const shownA = await impactFx(page, 0);
      const a = await shot(page, `${tag}-54-pure-${speed}x-a`);
      await at(imp - 30);
      await at(imp + age);
      const shownB = await impactFx(page, 0);
      const b = await shot(page, `${tag}-54-pure-${speed}x-b`);
      const keys = ['age_s', 'flash', 'flashAlpha', 'ring', 'ringAlpha'];
      const sameNumbers = !!shownA && !!shownB && keys.every((key) => shownA[key] === shownB[key]);
      rows.push({ speed, share: same(a, b), shown: !!shownA && shownA.flashShown && !!shownB && shownB.flashShown, sameNumbers, a: shownA, b: shownB });
    }
  } finally {
    await overlay(page, true);
    await pbEval(page, (w) => { __pb.setSpeed(1); __pb.setRange(w.whole); __pb.setGround(w.ground); __pb.goHome(); }, was);
  }
  step(`54 the flash after a seek away and back is the same picture, at 1× and 16× (${tag})`,
    rows.length === 2 && rows.every((r) => r.shown && r.sameNumbers && r.share >= 0.999),
    rows.map((r) => `${r.speed}×: ${(100 * r.share).toFixed(3)}% of the canvas within 2 levels (need 99.9%), flash shown both times ${r.shown}, ` +
      `drawn with the same numbers ${r.sameNumbers}${r.sameNumbers ? '' : ` (${r.a ? fmtFx(r.a) : 'none'} vs ${r.b ? fmtFx(r.b) : 'none'})`}`).join('; ') + (readout ? '' : '; no dev readout found'));
}

/**
 * Check 55: a skipped member has no flash, and the jets that fly have one each. The skip variant (#2 skipped; #1 lands at 0,
 * #3 at 40), Orbit at Home, flat ground, 1×, paused, the overlay hidden: 0.3 s after #2's time over target the page reports
 * two effects, none for seat 1, and none drawn; 0.3 s after #3's, its entry (seat 2) draws the flash and the pixel test of 53
 * passes at its burst.
 *
 * Proven red 2026-11-15 by one temporary edit to scene/createScene.ts, `impacts = jets.map(…)` → `impacts = [...jets,
 * jets[0]].map(…)` (three effects for two jets; 59 goes red with it, five flashes for four jets):
 *   STEP FAIL 55 a skipped #2 has no flash; #3 has its own at its time over target (1400x900-skip) — 0.3 s after #2's time (10): 3 effects, seats 0 2 0, drawn false false false; 0.3 s after #3's (40.0): seat 2, size 1.00, strength 1.00, shown true, 2306 px differ within 30 px of 836,317 (need 1300)
 */
async function checkFlashSkipped(page, tag) {
  const m = await pbEval(page, () => {
    const s = __pb.session();
    return { t2: s.delays_s[s.memberIds[1]], t3: __pb.moments.jets[1].impact, seat3: __pb.moments.jets[1].seat };
  });
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); __pb.goHome(); __pb.act({ type: 'show', a: { type: 'impact', on: true } }); });
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
  };
  let atTwo, three;
  await overlay(page, false);
  try {
    await at(m.t2 + 0.3);
    atTwo = await pbEval(page, () => __pb.effects());
    await at(m.t3 + 0.3);
    three = await flashPicture(page, 1, `${tag}-55-flash-third`);
  } finally {
    await overlay(page, true);
    await pbEval(page, () => __pb.goHome());
  }
  const jets = atTwo ? atTwo.jets : [];
  const entry3 = await pbEval(page, () => __pb.effects().jets[1]);
  step(`55 a skipped #2 has no flash; #3 has its own at its time over target (${tag})`,
    jets.length === 2 && jets.every((j) => j.seat !== 1 && !j.impact.flashShown) && !!entry3 && entry3.seat === 2 && m.seat3 === 2 &&
      !!three.e && three.e.flashShown && three.n >= FLASH_MIN,
    `0.3 s after #2's time (${m.t2}): ${jets.length} effects, seats ${jets.map((j) => j.seat).join(' ')}, drawn ${jets.map((j) => j.impact.flashShown).join(' ')}; ` +
      `0.3 s after #3's (${m.t3.toFixed(1)}): seat ${entry3 ? entry3.seat : 'none'}, ${fmtFx(three.e)}, ${three.n} px differ within 30 px of ${fmtPt(three.p)} (need ${FLASH_MIN})`);
}

/**
 * Check 59: what four flashes cost the graphics card, and that nothing is made frame by frame. The four-ship with its times
 * set to 0, 2, 4 and 6 s through the session, at 16×: played through the whole time bar twice, the geometries and textures
 * the card holds are the same before and after the second pass (the card counts a geometry when it is first drawn, so the
 * first pass is what draws every bomb and flash once); at 6.3 s all four flashes are drawn, and the draw calls and triangles with
 * Impact on, less the same moment with Impact off (so the bombs and the lines cancel), are within 80% to 110% of two calls
 * and 48 triangles for each flash drawn (a scorch fan and a core fan of 24 triangles each).
 *
 * Measured 2026-11-15 on the first green run: +8 calls and +192 triangles exactly (calls 42 → 50); 52 geometries and 1 texture
 * before and after the second pass. (A first try compared before and after one pass: 40 → 52, the bombs and flashes being
 * drawn for the first time.)
 *
 * Proven red 2026-11-15 by one temporary edit to scene/impactLayer.ts, the core's geometry made again in afterCamera each
 * frame (`core.geometry = flashGeometry(…)`) instead of once:
 *   STEP FAIL 59 four flashes cost two draw calls and 48 triangles each, and nothing is made frame by frame at 16× (1400x900-strike4) — played -69.9 to 46.0 s twice (the end 46.0): geometries 100 → 148, textures 1 → 1 over the second pass; at 6.3 s 4 flashes drawn: calls 42 → 50 (+8, want 8), triangles 537554 → 537746 (+192, want 192)
 */
async function checkFlashCost(page, tag) {
  const ids = await pbEval(page, () => __pb.session().memberIds);
  const delays = [0, 2, 4, 6];
  for (let i = 0; i < ids.length; i++) await pbEval(page, (a) => __pb.act({ type: 'delay', id: a.id, value_s: a.v }), { id: ids[i], v: delays[i] });
  await page.waitForFunction((d) => { const s = __pb.source(); return !!s && d.every((v, k) => s.impactOf(k) === v); }, delays, { timeout: 30000, polling: 200 });
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(16); __pb.act({ type: 'show', a: { type: 'impact', on: true } }); });
  const span = await pbEval(page, () => { const s = __pb.snapshot(); return { start: s.start, end: s.end }; });
  // The graphics card counts a geometry the first time it is drawn (a bomb at its release, a flash at its impact), so the
  // first pass draws everything once and the second is the one compared.
  const runThrough = async () => {
    await pbEval(page, () => __pb.seek(__pb.snapshot().start));
    await settle(page, 300);
    await pbEval(page, () => __pb.play());
    await page.waitForFunction(() => !__pb.snapshot().playing, null, { timeout: 240000, polling: 250 });
    await settle(page, 300);
    return { t: await pbEval(page, () => __pb.snapshot().t), info: await pbEval(page, () => __pb.renderInfo()) };
  };
  const first = await runThrough();
  const before = first.info;
  const second = await runThrough();
  const ran = second.t, after = second.info;
  await pbEval(page, () => __pb.seek(6.3));
  await settle(page, 300);
  const fx = await pbEval(page, () => __pb.effects());
  const shown = fx ? fx.jets.filter((j) => j.impact.flashShown).length : 0;
  const on = await pbEval(page, () => __pb.renderInfo());
  await pbEval(page, () => __pb.act({ type: 'show', a: { type: 'impact', on: false } }));
  const switched = await page.waitForFunction(() => __pb.effects().jets.every((j) => !j.impact.flashShown), null, { timeout: 15000, polling: 100 })
    .then(() => true, () => false);
  await settle(page, 300);
  const off = await pbEval(page, () => __pb.renderInfo());
  await pbEval(page, () => { __pb.act({ type: 'show', a: { type: 'impact', on: true } }); __pb.setSpeed(1); });
  const dCalls = on.calls - off.calls, dTris = on.triangles - off.triangles;
  const wantCalls = 2 * shown, wantTris = 48 * shown;
  const within = (d, want) => d >= 0.8 * want && d <= 1.1 * want;
  step(`59 four flashes cost two draw calls and 48 triangles each, and nothing is made frame by frame at 16× (${tag})`,
    shown === 4 && fx.jets.length === 4 && switched && within(dCalls, wantCalls) && within(dTris, wantTris) && Math.abs(ran - span.end) < 1e-6 && Math.abs(first.t - span.end) < 1e-6 &&
      after.geometries === before.geometries && after.textures === before.textures,
    `played ${span.start.toFixed(1)} to ${ran.toFixed(1)} s twice (the end ${span.end.toFixed(1)}): geometries ${before.geometries} → ${after.geometries}, textures ${before.textures} → ${after.textures} over the second pass; ` +
      `at 6.3 s ${shown} flashes drawn${switched ? '' : ' (Impact off did not take them away)'}: calls ${off.calls} → ${on.calls} (+${dCalls}, want ${wantCalls}), triangles ${off.triangles} → ${on.triangles} (+${dTris}, want ${wantTris})`);
}

// ── Chase watching the bomb land (checks 57 and 5d). Positions are read through the scene's own camera (`project`,
// `projectPoint`), and how far the look was turned off `__pb.cameraAim()`, the weight the camera used on the last frame.
/** A page point inside the canvas, at least 4% of its width and height in from every edge. */
const insideMargin = (p, cv) => !!p && p[0] >= cv.l + 0.04 * cv.w && p[0] <= cv.l + 0.96 * cv.w && p[1] >= cv.t + 0.04 * cv.h && p[1] <= cv.t + 0.96 * cv.h;
/** Jet `k`'s target point on the page through the camera now (the source's point, three.js axes, turned into east, north, up). */
const targetOnPage = (page, k) => pbEval(page, (j) => {
  const t = __pb.source().targetOf(j);
  return __pb.projectPoint(t.x, -t.z, t.y);
}, k);
/** Show › Watch the bomb land, ticked on or off by a mouse click on its box on the real Show panel; the panel shut again after. */
async function bombCamBox(page, on) {
  await page.getByRole('button', { name: 'Show ▾' }).click();
  const box = page.getByRole('checkbox', { name: /^Watch the bomb land/ });
  const native = (await box.count()) === 1 && (await box.evaluate((e) => e.tagName === 'INPUT' && e.type === 'checkbox'));
  if (native && (await box.isChecked()) !== on) await box.click();
  await page.getByRole('button', { name: 'Show ▾' }).click();
  const reached = await page.waitForFunction((o) => !!__pb.show() && __pb.show().bombCam === o, on, { timeout: 15000, polling: 100 }).then(() => true, () => false);
  return native && reached;
}

/**
 * Check 57: Chase watches the bomb land. The lone pop-up, flat ground, 1×, paused; Chase #1 pressed at the start of the time
 * bar (where it starts when playback opens), then each moment sought and waited on until the scene stops drawing.
 * - 1 s before the release the look is not turned (weight 0).
 * - 1, 3, 5 and 7 s after the release the bomb (`project(0, 'bomb')`) is inside the canvas with a 4% margin, and at 3 s the
 *   look is turned all the way (weight ≥ 0.95) and the 2D overlay's ring round the bomb is drawn within 1 px of it (the
 *   overlay is laid out through the turned camera, not the one still looking at the jet).
 * - 1 and 2 s after the impact the target (the landing) is inside the same margin.
 * - Purity: from 3 s after the release, sought 30 s before the release and back again: the same weight, the bomb within
 *   1 px of where it was, the camera within 1 m (the turn is the clock's, nothing eased).
 * - Show › Watch the bomb land unticked on the real panel: 3 s after the release the look is not turned and the bomb is
 *   outside the margin (Chase stays on the jet, which leaves the bomb behind); ticked again afterwards.
 * - From target: the look is never turned, from the release to the impact (weight 0 throughout).
 * At 1400×900 and 1024×768.
 *
 * Measured 2026-11-15 at both sizes: the bomb and the landing dead centre (700,386 and 512,320), weight 1.000 at 3 s, the
 * ring 0.00 px off the bomb, 0.00 px and 0.00 m after the seek away and back; with the box unticked the bomb is below the
 * canvas at 3 s (464,999 and 322,814).
 *
 * Proven red 2026-11-15 by one temporary edit to scene/createScene.ts, fillAim's weight `bombCam && rig.mode === 'chase' &&
 * … ? aimWeight(…) : 0` → `0` (geo-check stays green):
 *   STEP FAIL 57 Chase watches the bomb fall and land, … (1400x900) — Chase pressed true; 1 s before the release: weight 0; after the release: +1 s 664,503 in, +3 s 464,999 OUT, +5 s 184,1385 OUT, +7 s -267,1911 OUT; weight at +3 s 0.000 (want ≥ 0.95), the overlay's ring none px off the bomb (want ≤ 1); the landing: +1 s -3747,6897 OUT, +2 s none OUT; …
 * and by one temporary edit to scene/cameraRig.ts, lookAtFollow's `cam.updateMatrixWorld();` taken out (the overlay laid
 * out through the camera as the controls left it, looking at the jet):
 *   STEP FAIL 57 … (1400x900) — …; after the release: +1 s 700,386 in, +3 s 700,386 in, +5 s 700,386 in, +7 s 700,386 in; weight at +3 s 1.000 (want ≥ 0.95), the overlay's ring none px off the bomb (want ≤ 1); …
 * and by fillAim's `rig.mode === 'chase' &&` taken out (the weight filled in every camera):
 *   STEP FAIL 57 … (1400x900) — …; From target pressed true: weights through the fall 0 1 1 1 1 1 1 1 1 1
 */
async function checkBombCam(page, tag) {
  const { rel, imp } = await pbEval(page, () => ({ rel: __pb.moments.jets[0].release, imp: __pb.moments.jets[0].impact }));
  const was = await pbEval(page, () => ({ whole: __pb.show().wholeRunIn, ground: __pb.terrain().ground }));
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  const boxOn = await bombCamBox(page, true);
  await page.getByRole('button', { name: 'Chase #1', exact: true }).click();
  const chasePressed = (await pressedCamera(page)).join() === 'Chase #1';
  const cv = await canvasBox(page);
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settleIdle(page, 300);
  };
  const weight = async () => { const a = await pbEval(page, () => __pb.cameraAim()); return a ? a.weight : NaN; };
  const parts = [];
  let ok = chasePressed && boxOn;

  await at(rel - 1);
  const w0 = await weight();
  ok = ok && w0 === 0;
  parts.push(`Chase pressed ${chasePressed}; 1 s before the release: weight ${w0}`);

  const falls = [];
  let w3 = NaN, ringOff = NaN;
  for (const dt of [1, 3, 5, 7]) {
    await at(rel + dt);
    const p = await pbEval(page, () => __pb.project(0, 'bomb'));
    if (dt === 3) {
      w3 = await weight();
      const ring = (await pbEval(page, () => __pb.debugLabels().bombs)).find((b) => b.jet === 0);
      ringOff = ring && p ? Math.hypot(ring.x + cv.l - p[0], ring.y + cv.t - p[1]) : NaN;
      await shot(page, `${tag}-57-chase-bomb`);
    }
    falls.push({ dt, p, inside: insideMargin(p, cv) });
  }
  ok = ok && falls.every((f) => f.inside) && w3 >= 0.95 && ringOff <= 1;
  parts.push(`after the release: ${falls.map((f) => `+${f.dt} s ${fmtPt(f.p)} ${f.inside ? 'in' : 'OUT'}`).join(', ')}; weight at +3 s ${w3.toFixed(3)} (want ≥ 0.95), ` +
    `the overlay's ring ${Number.isFinite(ringOff) ? ringOff.toFixed(2) : 'none'} px off the bomb (want ≤ 1)`);

  const lands = [];
  for (const dt of [1, 2]) {
    await at(imp + dt);
    const p = await targetOnPage(page, 0);
    if (dt === 1) await shot(page, `${tag}-57-chase-landing`);
    lands.push({ dt, p, inside: insideMargin(p, cv) });
  }
  ok = ok && lands.every((f) => f.inside);
  parts.push(`the landing: ${lands.map((f) => `+${f.dt} s ${fmtPt(f.p)} ${f.inside ? 'in' : 'OUT'}`).join(', ')}`);

  // Purity: away and back.
  await at(rel + 3);
  const a = { w: await weight(), p: await pbEval(page, () => __pb.project(0, 'bomb')), cam: await pbEval(page, () => __pb.camera()) };
  await at(rel - 30);
  await at(rel + 3);
  const b = { w: await weight(), p: await pbEval(page, () => __pb.project(0, 'bomb')), cam: await pbEval(page, () => __pb.camera()) };
  const dp = a.p && b.p ? Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) : NaN;
  const dc = a.cam && b.cam ? Math.hypot(a.cam.x - b.cam.x, a.cam.y - b.cam.y, a.cam.z - b.cam.z) : NaN;
  ok = ok && a.w === b.w && dp <= 1 && dc <= 1;
  parts.push(`away and back: weight ${a.w} → ${b.w}, bomb ${dp.toFixed(2)} px, camera ${dc.toFixed(2)} m`);

  // The real box off: Chase stays on the jet.
  const boxOff = await bombCamBox(page, false);
  await at(rel + 3);
  const offW = await weight();
  const offP = await pbEval(page, () => __pb.project(0, 'bomb'));
  await shot(page, `${tag}-57-chase-off`);
  const boxBack = await bombCamBox(page, true);
  ok = ok && boxOff && offW === 0 && !insideMargin(offP, cv) && boxBack;
  parts.push(`Watch the bomb land unticked ${boxOff}: weight ${offW}, bomb ${fmtPt(offP)} ${insideMargin(offP, cv) ? 'in (want out)' : 'out'}; ticked again ${boxBack}`);

  // From target: never turned.
  await page.getByRole('button', { name: 'From target', exact: true }).click();
  const targetW = [];
  for (let t = rel; t < imp; t += 1) {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 150);
    targetW.push(await weight());
  }
  await pbEval(page, (tt) => __pb.seek(tt), imp - 0.05);
  await settle(page, 150);
  targetW.push(await weight());
  const targetPressed = (await pressedCamera(page)).join() === 'From target';
  ok = ok && targetPressed && targetW.every((w) => w === 0);
  parts.push(`From target pressed ${targetPressed}: weights through the fall ${targetW.join(' ')}`);

  await pbEval(page, (w) => { __pb.setRange(w.whole); __pb.setGround(w.ground); __pb.goHome(); }, was);
  step(`57 Chase watches the bomb fall and land, holds, and leaves it with Watch the bomb land off; From target never turns (${tag})`, ok, parts.join('; '));
}

/**
 * Check 5d: a rebuilt scene keeps Show › Impact and Show › Watch the bomb land as they were chosen. The lone pop-up, 1×,
 * paused, Chase #1: both switched off through the session (`act`), the context lost and given back, and in the rebuilt
 * scene (still in Chase) 3 s after the release the look is not turned and 0.3 s after the impact no flash is drawn; both
 * switched on again, the rebuilt scene turns the look (weight ≥ 0.95) and draws the flash (so it was the choices that held).
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, the `scene?.setImpact(show.impact)` effect's deps
 * `[scene, show.impact]` → `[show.impact]` (a rebuilt scene is not told, and opens with Impact on):
 *   STEP FAIL 5d after a rebuild: Show › Impact and Watch the bomb land are kept as chosen (1400x900) — both off: weight 0, flash false; rebuilt true (sceneCreates 6 → 8), pressed ["Chase #1"], choices impact false / watch false: weight 0, flash true; both on again: weight 1, flash true
 * and the same for `scene?.setBombCam(show.bombCam)`, `[scene, show.bombCam]` → `[show.bombCam]`:
 *   STEP FAIL 5d … — both off: weight 0, flash false; rebuilt true (sceneCreates 6 → 8), pressed ["Chase #1"], choices impact false / watch false: weight 1, flash false; both on again: weight 1, flash true
 */
async function checkShowKept(page, tag) {
  const { rel, imp } = await pbEval(page, () => ({ rel: __pb.moments.jets[0].release, imp: __pb.moments.jets[0].impact }));
  const was = await pbEval(page, () => __pb.show().wholeRunIn);
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  await page.getByRole('button', { name: 'Chase #1', exact: true }).click();
  await pbEval(page, () => {
    __pb.act({ type: 'show', a: { type: 'impact', on: false } });
    __pb.act({ type: 'show', a: { type: 'bombCam', on: false } });
  });
  await page.waitForFunction(() => !!__pb.show() && !__pb.show().impact && !__pb.show().bombCam, null, { timeout: 15000, polling: 100 });
  const read = async () => {
    await pbEval(page, (t) => __pb.seek(t), rel + 3);
    await settleIdle(page, 300);
    const a = await pbEval(page, () => __pb.cameraAim());
    await pbEval(page, (t) => __pb.seek(t), imp + 0.3);
    await settle(page, 300);
    const e = await impactFx(page, 0);
    return { w: a ? a.weight : NaN, flash: !!e && e.flashShown };
  };
  const before = await read();
  const r = await loseAndRestore(page);
  await settle(page, 300);
  const pressed = await pressedCamera(page);
  const kept = await pbEval(page, () => ({ impact: __pb.show().impact, bombCam: __pb.show().bombCam }));
  const after = r.remounted ? await read() : { w: NaN, flash: true };
  await pbEval(page, () => {
    __pb.act({ type: 'show', a: { type: 'impact', on: true } });
    __pb.act({ type: 'show', a: { type: 'bombCam', on: true } });
  });
  await page.waitForFunction(() => !!__pb.show() && __pb.show().impact && __pb.show().bombCam, null, { timeout: 15000, polling: 100 });
  const back = r.remounted ? await read() : { w: NaN, flash: false };
  await pbEval(page, (w) => { __pb.setRange(w); __pb.goHome(); }, was);
  step(`5d after a rebuild: Show › Impact and Watch the bomb land are kept as chosen (${tag})`,
    before.w === 0 && !before.flash && r.remounted && pressed.join() === 'Chase #1' && kept.impact === false && kept.bombCam === false &&
      after.w === 0 && !after.flash && back.w >= 0.95 && back.flash,
    `both off: weight ${before.w}, flash ${before.flash}; rebuilt ${r.remounted} (sceneCreates ${r.before} → ${r.after}), pressed ${JSON.stringify(pressed)}, ` +
      `choices impact ${kept.impact} / watch ${kept.bombCam}: weight ${after.w}, flash ${after.flash}; both on again: weight ${back.w}, flash ${back.flash}`);
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
 * arrow's alone. The floor came down to 60, between 0 and 86 with room for the software renderer.
 * Measured again 2026-11-15 with the tall fin, raised wings and darker underside: 123 and 86 px, so the
 * floor stays 60. That mutation turns it red:
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
 * 134 at 1024×768, and #3 on the skip variant (check 20) 161 (again 2026-11-15, with the tall fin and
 * raised wings: 159 / 117 / 157 / 128 and 162 / 114 / 150 / 133, and 164 on the skip variant; the
 * floor stays 70). With every arrow shrunk to nothing
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
 * hillshade or the navy background. Re-run 2026-11-15 after the arrow took its fin and raised wings: no
 * arrow lies on that stretch (the clock is at the start of the range), the count is the line's alone and
 * the arrow's shape cannot move it: 37 magenta and 0 yellow, then 0 and 62 at 1400×900; 43 and 0, then 0
 * and 67 at 1024×768 (the stretch is a different one since the range moved, as is the discs' count).
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

/**
 * Check 52: on the four-ship watching #2, the other jets' bombs are smaller-ringed, fainter and have a dark outline.
 * Home, flat ground, paused at -4.5 s (#1's bomb is falling, #2's is not yet released).
 * - The overlay's bombs list has one ring, jet 0's, 10 px with alpha 0.75 (a jet that does not wear the planner's colour code).
 * - With the overlay hidden, fewer than 3 white-ish pixels within 10 px of #1's bomb (its outline is dark), while the watched #2's own bomb,
 *   4 s after its release, shows at least BOMB_WHITE_MIN_HOME.
 * - Show › Attack colours › All jets (through the session's own `act`): #1's ring is 11 px, alpha 1; back to Watched jet: 10 px again; and
 *   pressing #1's seat button (the real watch): 11 px, alpha 1. (`act` of a watch moves the session only; the seat button also moves
 *   the scene, which is what is being tested.)
 *
 * Measured 2026-11-15: #1's bomb 0 white px within 10 px at both sizes; #2's own 38 (1400×900) and 34 (1024×768).
 *
 * Proven red 2026-11-15 by one temporary edit to scene/jetLayer.ts `wear()`: `hullMat.color.copy(on ? hullWhite : hullDark)` →
 * `hullMat.color.copy(hullWhite)` (every jet's outline white; BM2, BM5, 51 and 51b stay green):
 *   STEP FAIL 52 the other jets' bombs: … (1400x900-strike4-watch2) — times as the check expects; at -4.5: jet 0 r 10 alpha 0.75; #1's bomb at 836,321: 11 white px (need under 3); #2's own bomb at 819,307: 38 (need 12); All jets: jet 0 r 11 alpha 1; Watched jet: jet 0 r 10 alpha 0.75; #1's seat button: jet 0 r 11 alpha 1
 *   STEP FAIL 52 … (1024x768-strike4-watch2) — … #1's bomb at 616,262: 8 white px (need under 3); #2's own bomb at 603,251: 34 (need 12); …
 * The ring half of 52 (the colour code and the watch changing the ring's size) goes red with 51b's labelLayer edit above.
 */
const OTHER_PATCH = 10;
async function checkBombOthers(page, tag) {
  const T = -4.5;
  const m = await pbEval(page, () => __pb.moments.jets.map((j) => ({ release: j.release, impact: j.impact })));
  const setup = m[0].release < T && T < m[0].impact && m[1].release > T;
  await pbEval(page, () => { __pb.pause(); __pb.setSpeed(1); __pb.setRange(false); __pb.setGround('flat'); __pb.goHome(); });
  const at = async (t) => {
    await pbEval(page, (tt) => __pb.seek(tt), t);
    await settle(page, 300);
  };
  const bombs = () => pbEval(page, () => __pb.debugLabels().bombs);
  const fmt = (l) => (l.length ? l.map((b) => `jet ${b.jet} r ${b.r} alpha ${b.alpha}`).join(', ') : 'none');
  await at(T);
  const first = await bombs();
  const p0 = await pbEval(page, () => __pb.project(0, 'bomb'));
  let n0 = -1, n1 = -1, p1 = null;
  await overlay(page, false);
  try {
    const img = await shot(page, `${tag}-52-bomb-other`);
    n0 = p0 ? whiteIn(img, p0, OTHER_PATCH) : -1;
    await at(m[1].release + 4);
    p1 = await pbEval(page, () => __pb.project(1, 'bomb'));
    const img1 = await shot(page, `${tag}-52-bomb-watched`);
    n1 = p1 ? whiteIn(img1, p1, OTHER_PATCH) : -1;
  } finally {
    await overlay(page, true);
  }
  await at(T);
  await pbEval(page, () => __pb.act({ type: 'show', a: { type: 'attackColours', value: 'all' } }));
  await settle(page, 300);
  const all = await bombs();
  await pbEval(page, () => __pb.act({ type: 'show', a: { type: 'attackColours', value: 'watched' } }));
  await settle(page, 300);
  const back = await bombs();
  await page.getByRole('button', { name: 'Watch #1 Viper 1-1', exact: true }).click();
  await settle(page, 300);
  const seat1 = await bombs();
  await page.getByRole('button', { name: 'Watch #2 Viper 1-2', exact: true }).click(); // as it opened
  await settle(page, 300);
  const only = (l, r, a) => l.length === 1 && l[0].jet === 0 && l[0].r === r && l[0].alpha === a;
  step(`52 the other jets' bombs: a 10 px ring at 0.75, a dark outline; the colour code and the watch change them (${tag})`,
    setup && only(first, 10, 0.75) && !!p0 && n0 >= 0 && n0 < 3 && !!p1 && n1 >= BOMB_WHITE_MIN_HOME &&
      only(all, 11, 1) && only(back, 10, 0.75) && only(seat1, 11, 1),
    `${setup ? 'times as the check expects' : `times are not as the check expects (#1 ${m[0].release.toFixed(1)}…${m[0].impact.toFixed(1)}, #2 released ${m[1].release.toFixed(1)})`}; at ${T}: ${fmt(first)}; ` +
      `#1's bomb at ${p0 ? Math.round(p0[0]) + ',' + Math.round(p0[1]) : 'none'}: ${n0} white px (need under 3); #2's own bomb at ${p1 ? Math.round(p1[0]) + ',' + Math.round(p1[1]) : 'none'}: ${n1} (need ${BOMB_WHITE_MIN_HOME}); ` +
      `All jets: ${fmt(all)}; Watched jet: ${fmt(back)}; #1's seat button: ${fmt(seat1)}`);
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

/** Each lane's stripes: how many `[data-zone]` it shows, and whether every one lies inside its axis box (lanes in seat order). */
const laneZones = (page) => page.$$eval('[role="dialog"] [data-lane]', (lanes) => lanes.map((l) => {
  const axis = l.querySelector('[data-lane-axis]').getBoundingClientRect();
  const z = [...l.querySelectorAll('[data-zone]')].map((e) => e.getBoundingClientRect());
  return { seat: Number(l.getAttribute('data-lane')), n: z.length, inside: z.every((b) => b.width > 0 && b.left >= axis.left - 1 && b.right <= axis.right + 1) };
}));
/** How many frag stripes the time bar itself carries. */
const barStripes = (page) => page.locator('[role="dialog"] [data-conflict]').count();
/** What has the keyboard focus, by its accessible name (or its tag). */
const focusName = (page) => page.evaluate(() => (document.activeElement ? document.activeElement.getAttribute('aria-label') || document.activeElement.tagName : 'none'));
/** Seat `seat` (1-based) alone shows stripes, all inside its lane; with `seat` 0, none do. */
const zonesOnly = (zs, seat) => zs.length === 4 && zs.every((z) => (z.seat === seat - 1 ? z.n >= 1 && z.inside : z.n === 0));
/** "#1: 0, #2: 3, …", with a note on a stripe outside its lane. */
const zonesText = (zs) => zs.map((z) => `#${z.seat + 1}: ${z.n}${z.inside ? '' : ' (outside the lane)'}`).join(', ');

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
 * at the plan's times (each is in a frag conflict) and on #3 and #4 alone once #2 is clear of #1. The times
 * are put back with Reset.
 *
 * The lanes' stripes (the stripes arm): a lane shows its danger zones only while that jet's time is being set.
 * At rest no lane has a `[data-zone]`; with #2's diamond held lane #2's zones lie inside its axis and #1, #3
 * and #4 have none; let go (the diamond keeps the focus the mouse gave it, which is not the keyboard's): none
 * again; an arrow key pressed on that same diamond (the focus does not change, so no focus event says the
 * keyboard has it): #2's time moves a second and lane #2 has its zones, the others none; a Tab onto #3's
 * diamond: lane #3 has its zones and the others none; #3's diamond pressed with the mouse where it stands and
 * let go (it keeps the focus the Tab gave it): none, and its time unchanged; #4's number box clicked into:
 * lane #4 has its zones and the others none; Enter lets go of the box: none. The time bar's own stripes
 * (`[data-conflict]`) are there at every one of those moments.
 *
 * Measured green 2026-11-15: the range -50.15…80.00 held while #2's handle is held at -50 s, -100.15…80.00
 * once it is let go (#2's first action is then -90.15 s); marks on seats 1,2,3,4 then 3,4.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, an effect that sets the clock's range every
 * time the range changes (`useEffect(() => { sceneRef.current?.setRange(live); }, [live]);`): the bar then
 * moves under the handle while it is held:
 *   STEP FAIL 34 the time bar keeps its scale while a handle is held and re-fits when it is let go; … (1400x900-strike4) — held at -50 s (time -50, dragging true): range -100.15…80.00 vs -50.15…80.00 before (kept false); let go: -100.15…80.00, want -100.15…80.00 (re-fit true, dragging false); warning marks on seats 1,2,3,4 then 3,4 (want 1,2,3,4 then 3,4); stripes per lane #1: 0, #2: 3, #3: 3, #4: 3
 * (The same run with setSource returning at once, check 12's proof, also fails 34: the range is never re-fit, "let go: -50.15…80.00, want -50.15…80.00 (re-fit false".)
 *
 * The stripes arm, measured green 2026-11-15: three stripes on the one lane that is being set (#2 held, #3 by
 * its Tab (three presses from #2's diamond), #4 by its box) and none anywhere else, the time bar's own stripes
 * 2 at rest and 1 at each of the other moments. Proven red the same day, each by one temporary edit to JetLanes.tsx
 * (the detail then reads, in each case, as quoted here from "at rest" on):
 * - the rule's result ignored (`zonesShown && info.zones.map` → `info.zones.map`): every lane shows its stripes
 *   all the time:
 *   STEP FAIL 34 … (1400x900-strike4) — …; stripes per lane (the time bar's own in brackets) — at rest #1: 0, #2: 3, #3: 3, #4: 3 [2] (want none); #2 held #1: 0, #2: 3, #3: 3, #4: 3 [1] (want #2 only); let go #1: 0, #2: 3, #3: 3, #4: 3 [1], focus on "#2 time over target" (want none, #2's diamond); Tab onto #3 …
 * - the stripes never drawn (`zonesShown && false && info.zones.map`): the held arm and every one after it:
 *   STEP FAIL 34 … — …; at rest #1: 0, #2: 0, #3: 0, #4: 0 [2] (want none); #2 held #1: 0, #2: 0, #3: 0, #4: 0 [1] (want #2 only); …
 * - the diamond's focus taken as the keyboard's whatever gave it (`onFocus={(e) => onKeyboardFocus(keyboardFocused(e.currentTarget))}`
 *   → `onFocus={() => onKeyboardFocus(true)}`): the focus the mouse left on #2's diamond keeps its stripes, at rest
 *   and after the let-go:
 *   STEP FAIL 34 … — …; at rest #1: 0, #2: 3, #3: 0, #4: 0 [2] (want none); #2 held …; let go #1: 0, #2: 3, #3: 0, #4: 0 [1], focus on "#2 time over target" (want none, #2's diamond); …
 * - the number box's focus not handed to the lane (`onBoxFocus={setBoxFocus}` left off the lane's Readout):
 *   STEP FAIL 34 … — …; Tab onto #3 (3 presses, focus on "#3 time over target") #1: 0, #2: 0, #3: 3, #4: 0 [1] (want #3 only); #4's box clicked, focus on "#4 time over target, seconds after T" #1: 0, #2: 0, #3: 0, #4: 0 [1] (want #4 only); …
 *
 * The arrow-key arm and the press arm, measured green 2026-11-15 (the arrow key moves #2's time -50 → -49 and lane #2
 * shows three stripes; the press leaves #3's time at 40 and its lane clean). Each proven red the same day by one
 * temporary edit to the diamond's handlers in JetLanes.tsx:
 * - the arrow key not telling the lane the keyboard has the diamond (the `onKeyboardFocus(true);` before the
 *   `onDelay` in `onKeyDown` left out): the time moves and the lane stays clean:
 *   STEP FAIL 34 … — …; ArrowRight there, #2's time -50 → -49 (want +1), focus on "#2 time over target" #1: 0, #2: 0, #3: 0, #4: 0 [1] (want #2 only); …
 * - the mouse press not ending the keyboard's claim (the `onKeyboardFocus(false);` before `onDrag(true)` in
 *   `onPointerDown` left out): the Tab-focused diamond keeps its stripes after a press:
 *   STEP FAIL 34 … — …; #3 pressed with the mouse where it stands, its time 40 → 40 (want unchanged), focus on "#3 time over target" #1: 0, #2: 0, #3: 3, #4: 0 [1] (want none, #3's diamond); …
 */
async function checkDragRange(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  const start = await pbEval(page, () => __pb.snapshot());
  const marksBefore = await warnSeats(page);
  // The stripes arm. At rest none (whatever has the focus: after the checks before, the mouse left it on a handle).
  const zRest = await laneZones(page);
  const barRest = await barStripes(page);
  await dragHandle(page, 2, start.start, { hold: true, steps: 6 });
  await settle(page, 400);
  const during = await pbEval(page, () => ({ snap: __pb.snapshot(), dragging: __pb.session().dragging }));
  const heldTot = await totOf(page, 2);
  const zHeld = await laneZones(page);
  const barHeld = await barStripes(page);
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
  // Let go: the mouse gave #2's diamond the focus and it keeps it, but that is not the keyboard's focus.
  const zLetGo = await laneZones(page);
  const barLetGo = await barStripes(page);
  const focusLetGo = await focusName(page);
  const totLetGo = await totOf(page, 2);
  await shot(page, `${tag}-34-let-go`);
  // An arrow key on that same diamond (the mouse's focus is on it, and no new focus event comes): the keyboard is
  // setting #2's time now, so its stripes show and no other lane's do.
  await page.keyboard.press('ArrowRight');
  await settle(page, 250);
  const totArrow = await totOf(page, 2);
  const focusArrow = await focusName(page);
  const zArrow = await laneZones(page);
  const barArrow = await barStripes(page);
  // A Tab onto #3's diamond (from #2's: its box, #3's seat button, then the diamond).
  let tabs = 0;
  while ((await focusName(page)) !== '#3 time over target' && tabs < 8) {
    await page.keyboard.press('Tab');
    tabs++;
  }
  await settle(page, 250);
  const focusTab = await focusName(page);
  const zTab = await laneZones(page);
  const barTab = await barStripes(page);
  const totTab = await totOf(page, 3);
  // #3's diamond pressed with the mouse where it stands and let go: it keeps the focus and no focus event says the
  // mouse has it, but the press ends the keyboard's claim, so its stripes go.
  const hb = await handleOf(page, 3).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await settle(page, 250);
  const totPress = await totOf(page, 3);
  const focusPress = await focusName(page);
  const zPress = await laneZones(page);
  const barPress = await barStripes(page);
  // #4's number box, clicked into, then let go with Enter.
  await boxOf(page, 4).click();
  await settle(page, 250);
  const focusBox = await focusName(page);
  const zBox = await laneZones(page);
  const barBox = await barStripes(page);
  await page.keyboard.press('Enter');
  await settle(page, 250);
  const focusOut = await focusName(page);
  const zOut = await laneZones(page);
  const barOut = await barStripes(page);
  await page.locator('[role="dialog"] [data-reset]').click();
  await settle(page);
  const kept = Math.abs(during.snap.start - start.start) < 1e-9 && Math.abs(during.snap.end - start.end) < 1e-9;
  const refit = Math.abs(after.snap.start - after.want) < 1e-6 && Math.abs(after.snap.end - start.end) < 1e-9 && after.snap.start < start.start - 40;
  const arms = [
    ['at rest', zonesOnly(zRest, 0), barRest], ['#2 held', zonesOnly(zHeld, 2), barHeld],
    ['let go, diamond still focused', zonesOnly(zLetGo, 0) && focusLetGo === '#2 time over target', barLetGo],
    ['an arrow key on that diamond', zonesOnly(zArrow, 2) && focusArrow === '#2 time over target' && totArrow === totLetGo + 1, barArrow],
    ['Tab onto #3', zonesOnly(zTab, 3) && focusTab === '#3 time over target', barTab],
    ['#3 pressed with the mouse where it stands', zonesOnly(zPress, 0) && focusPress === '#3 time over target' && totPress === totTab, barPress],
    ['#4 box focused', zonesOnly(zBox, 4) && focusBox === '#4 time over target, seconds after T', barBox], ['#4 box let go', zonesOnly(zOut, 0) && focusOut !== '#4 time over target, seconds after T', barOut],
  ];
  const stripesOk = arms.every(([, ok, bar]) => ok && bar >= 1);
  step(`34 the time bar keeps its scale while a handle is held and re-fits when it is let go; warning marks follow the times; stripes of the danger zones on the lanes (${tag})`,
    kept && during.dragging && heldTot === -50 && !after.dragging && refit && marksBefore.join() === '1,2,3,4' && marksAfter.join() === '3,4' && stripesOk,
    `held at -50 s (time ${heldTot}, dragging ${during.dragging}): range ${during.snap.start.toFixed(2)}…${during.snap.end.toFixed(2)} vs ${start.start.toFixed(2)}…${start.end.toFixed(2)} before (kept ${kept}); let go: ${after.snap.start.toFixed(2)}…${after.snap.end.toFixed(2)}, want ${after.want.toFixed(2)}…${start.end.toFixed(2)} (re-fit ${refit}, dragging ${after.dragging}); ` +
      `warning marks on seats ${marksBefore.join(',')} then ${marksAfter.join(',')} (want 1,2,3,4 then 3,4); ` +
      `stripes per lane (the time bar's own in brackets) — at rest ${zonesText(zRest)} [${barRest}] (want none); #2 held ${zonesText(zHeld)} [${barHeld}] (want #2 only); ` +
      `let go ${zonesText(zLetGo)} [${barLetGo}], focus on "${focusLetGo}" (want none, #2's diamond); ` +
      `ArrowRight there, #2's time ${totLetGo} → ${totArrow} (want +1), focus on "${focusArrow}" ${zonesText(zArrow)} [${barArrow}] (want #2 only); ` +
      `Tab onto #3 (${tabs} presses, focus on "${focusTab}") ${zonesText(zTab)} [${barTab}] (want #3 only); ` +
      `#3 pressed with the mouse where it stands, its time ${totTab} → ${totPress} (want unchanged), focus on "${focusPress}" ${zonesText(zPress)} [${barPress}] (want none, #3's diamond); ` +
      `#4's box clicked, focus on "${focusBox}" ${zonesText(zBox)} [${barBox}] (want #4 only); Enter, focus on "${focusOut}" ${zonesText(zOut)} [${barOut}] (want none)`);
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
 *
 * The key's arm (the swatch before the footer's warning), measured green 2026-11-15 at both sizes: one swatch,
 * 14.0 × 10.0 px, a 2 px corner, first in the line and next to the warning, the very background of the bar's
 * stripes, the line overflowing by 0 px. Proven red the same day by one temporary edit to PlaybackView.tsx, the
 * swatch never drawn (`stripes={barStriped}` → `stripes={false}`):
 *   STEP FAIL 13 the footer's first line opens with a swatch of the time bar's stripes, before the warning, worded as the stripes (1400x900-strike4) — 0 swatches (want 1)
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
  // The key arm: the bar has stripes, so the footer's first line opens with one swatch of them, before the
  // warning, in the very background the bar's stripes have, 14 × 10 px with rounded corners, hidden from a
  // screen reader, and with the words of the sentence for its tooltip; and nothing at the line's right end
  // was pushed out of it.
  const key = await page.$$eval('[role="dialog"] [data-hatch-key]', (els) => els.map((e) => {
    const b = e.getBoundingClientRect();
    const line = e.parentElement;
    const warn = line.querySelector('[data-footer-warning]');
    return {
      w: b.width, h: b.height, right: b.right, bg: getComputedStyle(e).backgroundImage, radius: getComputedStyle(e).borderTopLeftRadius,
      title: e.getAttribute('title'), hidden: e.getAttribute('aria-hidden'), first: line.firstElementChild === e,
      before: !!warn && e.nextElementSibling === warn && b.right <= warn.getBoundingClientRect().left + 0.5, spill: line.scrollWidth - line.clientWidth,
    };
  }));
  const barBg = await page.locator('[role="dialog"] [data-conflict]').first().evaluate((e) => getComputedStyle(e).backgroundImage);
  const wantTitle = "Striped: a jet is over the target inside another jet's frag (est.)";
  const k = key[0];
  const keyOk = key.length === 1 && !!k && k.first && k.before && k.hidden === 'true' && k.title === wantTitle &&
    Math.abs(k.w - 14) <= 0.5 && Math.abs(k.h - 10) <= 0.5 && parseFloat(k.radius) > 0 &&
    /repeating-linear-gradient/.test(k.bg) && k.bg === barBg && k.spill <= 1;
  step(`13 the footer's first line opens with a swatch of the time bar's stripes, before the warning, worded as the stripes (${tag})`, keyOk,
    key.length === 1
      ? `${key.length} swatch, ${k.w.toFixed(1)} × ${k.h.toFixed(1)} px, corner ${k.radius}, first in the line ${k.first}, just before the warning ${k.before}, aria-hidden ${k.hidden}, title ${JSON.stringify(k.title)} (want ${JSON.stringify(wantTitle)}), background the bar's own ${k.bg === barBg} (${k.bg.slice(0, 60)}…), line overflows by ${k.spill} px`
      : `${key.length} swatches (want 1)`);
  await pbEval(page, (whole) => __pb.setRange(whole), wasWhole);
}

/**
 * Check 13 (the key's other arm): with no stripes on the time bar there is no swatch. On the lone pop-up
 * (a strike of one jet has no conflict, so the bar has no stripes) the footer's line has none, and the bar
 * really has none, so the arm is about the swatch following the bar and not about the page.
 *
 * Proven red 2026-11-15 by one temporary edit to PlaybackView.tsx, the swatch drawn always, not only when the bar
 * has stripes (`stripes={barStriped}` → `stripes`):
 *   STEP FAIL 13 the footer has no swatch of stripes when the time bar has none: a lone jet (1400x900) — 1 swatches (want 0), 0 stripes on the time bar (want 0), 2 footer line parts
 */
async function checkNoHatchKeyLone(page, tag) {
  const keys = await page.locator('[role="dialog"] [data-hatch-key]').count();
  const bar = await page.locator('[role="dialog"] [data-conflict]').count();
  const footer = await page.locator('[role="dialog"] [data-footer-ok], [role="dialog"] [data-footer-warning], [role="dialog"] [data-footer-single]').count();
  step(`13 the footer has no swatch of stripes when the time bar has none: a lone jet (${tag})`, keys === 0 && bar === 0 && footer >= 1,
    `${keys} swatches (want 0), ${bar} stripes on the time bar (want 0), ${footer} footer line parts`);
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

// ── The frag warning's chrome follows the rule the strike is warned by: blast distance or spacing in time.

/**
 * What the footer's first line says, as drawn: the all-clear (its text and tooltip), each warning (its text and
 * tooltip), the "(+n more)" button, and how many swatches of the time bar's stripes open the line.
 */
const footerState = (page) => page.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const ok = dlg.querySelector('[data-footer-ok]');
  const more = [...dlg.querySelectorAll('button')].find((b) => /^\(\+\d+ more\)$/.test((b.textContent || '').trim()));
  return {
    ok: ok ? { text: (ok.textContent || '').trim(), title: ok.getAttribute('title') } : null,
    warns: [...dlg.querySelectorAll('[data-footer-warning]')].map((w) => ({ text: (w.textContent || '').trim(), title: w.getAttribute('title') })),
    more: more ? (more.textContent || '').trim() : null,
    keys: dlg.querySelectorAll('[data-hatch-key]').length,
  };
});
/** The time bar's stripes as drawn: each one's left and right edge, width and background, page pixels. */
const barStripeBoxes = (page) => page.$$eval('[role="dialog"] [data-conflict]', (els) => els.map((e) => {
  const b = e.getBoundingClientRect();
  return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, bg: getComputedStyle(e).backgroundImage };
}));
/** Every lane's stripes as drawn (lanes in seat order): each one's key and box, page pixels. */
const laneZoneBoxes = (page) => page.$$eval('[role="dialog"] [data-lane]', (lanes) => lanes.map((l) => ({
  seat: Number(l.getAttribute('data-lane')),
  zones: [...l.querySelectorAll('[data-zone]')].map((e) => {
    const b = e.getBoundingClientRect();
    return { key: e.getAttribute('data-zone'), l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width };
  }),
})));
/** The tooltip on seat `n`'s diamond. */
const handleTitleOf = (page, n) => handleOf(page, n).getAttribute('title');

const WANT_OK_BURST = '✓ No blast or cone warnings at these times.';
const WANT_OK_BURST_TITLE = "Checked: every jet's distance from every other jet's bomb at the moment it goes off (est.). Distance only: hills in the way are not counted.";
const WANT_KEY_BURST = "Striped: a jet is inside another jet's blast radius when a bomb goes off (est.)";
const WANT_STRIPES_BURST = "Stripes: times that would put it inside another jet's blast radius, or another jet inside its.";
const WANT_HANDLE_PLAIN = "Drag to change #2's time over target (←/→ 1 s, Shift+←/→ 5 s)";

/**
 * Check 70 (the four-ship, warned by blast radius): on the four-ship saved with the blast rule (every bomb a Mk-82,
 * which the harness gives its 250 ft radius), nothing is inside any bomb's radius when it goes off, so the footer is
 * the blast rule's all-clear word for word, with its tooltip, and there is no warning, no "(+n more)", no stripe on
 * the time bar and no swatch; with #2's diamond held no lane has a stripe and the diamond's tooltip does not say
 * what stripes are (it has none to show). The page says it plays by 'burst' and gives no conflict and no zone. (The
 * chip over the picture does not exist yet, so there is none to look for.)
 *
 * Measured green 2026-11-16 at both sizes: the all-clear alone with its tooltip, 0 conflicts, 0 zones, 0 swatches, 0 stripes on
 * the bar, 0 on any lane while #2's diamond was held at the start of the bar (the Mk-82's 250 ft radius is far from every
 * other jet at every burst).
 *
 * Proven red 2026-11-16 by one temporary edit to src/lib/playback/timing.ts, retime reading the spacing rule whatever
 * the playback's rule is (`const burst = pb.fragRule === 'burst' ? burstReadout(pb, delays) : undefined;` →
 * `const burst = pb.fragRule === 'burst' && false ? burstReadout(pb, delays) : undefined;` and `strikeReadout(rj, pb.fragRule)` →
 * `strikeReadout(rj, 'time')`):
 *   STEP FAIL 70 the four-ship warned by blast radius is clean: … (1400x900-strike4) — rule burst; 2 conflicts, 0 zones; footer no all-clear (want "✓ No blast or cone warnings at these times."); 1 warnings (want 0), more "(+1 more)", swatches 1 (want 0), 2 stripes on the bar (want 0); #2 held: 0 lane stripes (want 0), diamond "Drag to change #2's time over target (←/→ 1 s, Shift+←/→ 5 s)"
 * (71 goes red with it: "⚠ #2 is over the target 12 s after #1, inside #1's ~35 s of frag (est.)".)
 */
async function checkFragBurstFour(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  await shot(page, `${tag}-70-burst`);
  const rule = await pbEval(page, () => __pb.moments.rule);
  const conflicts = await pbEval(page, () => __pb.moments.conflicts.length);
  const zones = await pbEval(page, () => __pb.moments.zones.length);
  const f = await footerState(page);
  const bar = (await barStripeBoxes(page)).length;
  const snap = await pbEval(page, () => __pb.snapshot());
  // #2's diamond held: its lane has no stripe to show, and its tooltip does not say what stripes are.
  await dragHandle(page, 2, snap.start, { hold: true, steps: 6 });
  await settle(page, 300);
  const held = await laneZoneBoxes(page);
  const title = await handleTitleOf(page, 2);
  await page.mouse.up();
  await settle(page, 300);
  await page.locator('[role="dialog"] [data-reset]').click();
  await settle(page);
  const heldZones = held.reduce((n, l) => n + l.zones.length, 0);
  const ok = rule === 'burst' && conflicts === 0 && zones === 0 && !!f.ok && f.ok.text === WANT_OK_BURST && f.ok.title === WANT_OK_BURST_TITLE &&
    f.warns.length === 0 && f.more === null && f.keys === 0 && bar === 0 && heldZones === 0 && title === WANT_HANDLE_PLAIN;
  step(`70 the four-ship warned by blast radius is clean: the footer is the blast rule's all-clear, no warning, no swatch, no stripe on the bar or the lanes (${tag})`, ok,
    `rule ${rule}; ${conflicts} conflicts, ${zones} zones; footer ${f.ok ? `${JSON.stringify(f.ok.text)} title ${JSON.stringify(f.ok.title)}` : 'no all-clear'} (want ${JSON.stringify(WANT_OK_BURST)}); ${f.warns.length} warnings (want 0), more ${JSON.stringify(f.more)}, swatches ${f.keys} (want 0), ${bar} stripes on the bar (want 0); #2 held: ${heldZones} lane stripes (want 0), diamond ${JSON.stringify(title)}`);
}

/**
 * Check 70b (the four-ship, warned by spacing in time): on the same four-ship saved with the spacing rule the old picture
 * is there word for word: the footer's warning is "#2 is over the target 10 s after #1, inside #1's ~30 s of frag (est.)"
 * with "(+1 more)", the time bar carries the two stripes (each as wide as its own span: no narrowest width), the footer opens with
 * the swatch whose tooltip is the spacing rule's words, and there is no all-clear. This is checks 13 and 34's picture, which
 * now name the rule they run on.
 *
 * Measured green 2026-11-16: the warning and "(+1 more)", two stripes of 153.4 px and 230.0 px at 1400×900 (exactly their spans), one
 * swatch, the diamond's sentence.
 *
 * Proven red 2026-11-16 by one temporary edit to src/lib/playback/timing.ts, retime always reading the blast rule (`const burst =
 * pb.fragRule === 'burst' ? burstReadout(pb, delays) : undefined;` → `const burst = burstReadout(pb, delays);` and
 * `strikeReadout(rj, pb.fragRule)` → `strikeReadout(rj, 'burst')`):
 *   STEP FAIL 70b the four-ship warned by spacing in time keeps its old picture: … (1400x900-strike4) — rule time; footer no warning (want "⚠ #2 is over the target 10 s after #1, inside #1's ~30 s of frag (est.)"), more null, all-clear shown, swatches 0 titled null; 0 stripes  for 0 conflicts (spans ; each within 1.5 px true); #2's diamond "Drag to change #2's time over target (←/→ 1 s, Shift+←/→ 5 s) Stripes: times that would put it inside another jet's frag."
 * (13 goes red with it: "0 stripes for 0 conflicts"; the footer's key arm of 13 then waits out its 120 s limit.)
 */
async function checkFragTimeFour(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  const rule = await pbEval(page, () => __pb.moments.rule);
  const f = await footerState(page);
  const stripes = await barStripeBoxes(page);
  const snap = await pbEval(page, () => __pb.snapshot());
  const conflicts = await pbEval(page, () => __pb.moments.conflicts);
  const bar = await page.locator('[role="dialog"] input[type="range"]').boundingBox();
  const perSecond = (bar.width - 16) / (snap.end - snap.start);
  // Each stripe is its own span exactly (the spacing rule's bands have no narrowest width).
  const spanOk = stripes.length === conflicts.length && stripes.every((s, i) => Math.abs(s.w - (conflicts[i].t1_s - conflicts[i].t0_s) * perSecond) <= 1.5);
  const wantWarn = "#2 is over the target 10 s after #1, inside #1's ~30 s of frag (est.)";
  const wantKey = "Striped: a jet is over the target inside another jet's frag (est.)";
  const k = await page.locator('[role="dialog"] [data-hatch-key]').first().getAttribute('title').catch(() => null);
  // #2's lane has stripes to show, so its diamond's tooltip says what they are, in the spacing rule's words.
  const title = await handleTitleOf(page, 2);
  const wantTitle = `${WANT_HANDLE_PLAIN} Stripes: times that would put it inside another jet's frag.`;
  const ok = rule === 'time' && f.ok === null && f.warns.length === 1 && f.warns[0].text === `⚠ ${wantWarn}` && f.warns[0].title === wantWarn &&
    f.more === '(+1 more)' && f.keys === 1 && k === wantKey && stripes.length >= 1 && spanOk && title === wantTitle;
  step(`70b the four-ship warned by spacing in time keeps its old picture: the warning and (+1 more), the stripes as wide as their spans, the swatch and the diamond's sentence (${tag})`, ok,
    `rule ${rule}; footer ${f.warns.length ? JSON.stringify(f.warns[0].text) : 'no warning'} (want ${JSON.stringify(`⚠ ${wantWarn}`)}), more ${JSON.stringify(f.more)}, all-clear ${f.ok ? 'shown' : 'not shown'}, swatches ${f.keys} titled ${JSON.stringify(k)}; ${stripes.length} stripes ${stripes.map((s) => `${s.w.toFixed(1)} px`).join(' / ')} for ${conflicts.length} conflicts (spans ${conflicts.map((c) => `${((c.t1_s - c.t0_s) * perSecond).toFixed(1)} px`).join(' / ')}; each within 1.5 px ${spanOk}); #2's diamond ${JSON.stringify(title)}`);
}

/** The ridge pair's #2 time over target is typed into its box and the footer, bar and lane are read. */
async function typeRidgeTime(page, text) {
  await boxOf(page, 2).click();
  await boxOf(page, 2).fill(text);
  await settle(page, 400);
}

/**
 * Check 71 (the ridge pair, warned by blast radius): the one place the blast rule warns. #1 dives on a ridge target and
 * #2 on the flat TGT1, Mk-84s (the harness gives them their 360 ft radius), #2 over its target 11.9 s after #1, so
 * #2's own track passes about 130 ft from #1's burst.
 * - Opened: the footer's warning is exactly "⚠ #2 is 130 ft from #1's bomb when it goes off, inside its 360 ft blast
 *   radius (est.)", with no "(+n more)"; the time bar has one stripe, at least 6 px wide, striped, centred within 2 px
 *   of the place on the bar of 0.5 s after #1's time over target (the stripe covers the second from the burst) and
 *   with amber pixels in it; the swatch opens the footer line with the blast rule's tooltip;
 * - #2's time typed as 11.0 s (before the window): the footer is the all-clear and the bar has no stripe and the line
 *   no swatch; as 11.46 s (just inside): "350 ft", never "360"; as 12.3 s: "320 ft"; as 12.4 s (just after the window):
 *   the all-clear again;
 * - Reset puts the plan's 11.9 s back, and the 130 ft line with it.
 * The window and the distances are what the rule gives for this plan on the ballistic dive (the library says
 * 11.4593 to 12.3429 s for #2; 130.4 ft at 11.9 s), measured in the library on the code as it is.
 *
 * Measured green 2026-11-16: at 1400×900 the bar's stripe is 9.1 px wide (its own span), centre 0.02 px from the half second, 16 amber
 * pixels; at 1024×768 it is 6.0 px (its span alone is 5.7: the narrowest width binds), centre 0.01 px, 10 amber pixels. The footer
 * lines are the words above at 11.9, 11.46 and 12.3 s and the all-clear at 11.0 and 12.4 s, at both sizes; Reset brings the 130 ft line back.
 * (The bar's threshold is 5.99 px, not 6: the stripe's own span at 1024×768 is 5.7 px, so only a drawn minimum can pass it.)
 *
 * Proven red 2026-11-16 by one temporary edit to src/lib/playback/fragWords.ts, the warning's "blast radius" → "frag radius"
 * (burstSentence):
 *   STEP FAIL 71 the ridge pair warned by blast radius: … (1400x900-ridge) — rule burst; opened: footer "⚠ #2 is 130 ft from #1's bomb when it goes off, inside its 360 ft frag radius (est.)" (want "⚠ #2 is 130 ft from #1's bomb when it goes off, inside its 360 ft blast radius (est.)"), more null, swatch 1 first true titled "Striped: a jet is inside another jet's blast radius when a bomb goes off (est.)"; 1 stripes for 1 conflicts: 9.1 px wide (want ≥ 6), …
 * and by bandBox's narrowest width taken out (lanes.ts: `max(${w}%, ${minPx}px)` → `${w}%`; red at 1024×768 only, where the span is shorter than 6 px):
 *   STEP FAIL 71 the ridge pair warned by blast radius: … (1024x768-ridge) — …; 1 stripes for 1 conflicts: 5.7 px wide (want ≥ 6), centre 0.17 px from 0.5 s after #1's time (want ≤ 2), 10 amber pixels, …
 */
async function checkFragRidge(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  const snap = await pbEval(page, () => __pb.snapshot());
  const input = await page.locator('[role="dialog"] input[type="range"]').boundingBox();
  const at = (t) => input.x + 8 + (input.width - 16) * ((Math.min(Math.max(t, snap.start), snap.end) - snap.start) / (snap.end - snap.start));
  const want = await pbEval(page, () => __pb.moments.conflicts);
  const rule = await pbEval(page, () => __pb.moments.rule);
  const img = await shot(page, `${tag}-71-ridge`);
  const f0 = await footerState(page);
  const s0 = await barStripeBoxes(page);
  const wantWarn = "#2 is 130 ft from #1's bomb when it goes off, inside its 360 ft blast radius (est.)";
  const keyTitle = await page.locator('[role="dialog"] [data-hatch-key]').first().getAttribute('title').catch(() => null);
  const keyFirst = await page.locator('[role="dialog"] [data-hatch-key]').first().evaluate((e) => e.parentElement.firstElementChild === e).catch(() => false);
  // The stripe: wide enough to see, centred on the half second after the burst, drawn in amber pixels.
  const st = s0[0];
  const centre = st ? (st.l + st.r) / 2 : NaN;
  const dCentre = Math.abs(centre - at((want[0]?.t0_s ?? NaN) + 0.5));
  let amber = 0;
  if (st) for (let y = Math.ceil(st.t); y < st.b; y++) for (let x = Math.ceil(st.l); x < st.r; x++) if (img.at(x, y)[0] > 100 && img.at(x, y)[1] > 90 && img.at(x, y)[0] > img.at(x, y)[2] + 40) amber++;
  const openedOk = rule === 'burst' && f0.ok === null && f0.warns.length === 1 && f0.warns[0].text === `⚠ ${wantWarn}` && f0.warns[0].title === wantWarn && f0.more === null &&
    f0.keys === 1 && keyFirst && keyTitle === WANT_KEY_BURST && s0.length === 1 && want.length === 1 && st.w >= 5.99 && dCentre <= 2 && /repeating-linear-gradient/.test(st.bg) && amber >= 1;
  // Moving #2's time through its box: clear before the window, the edges of it, clear after.
  const read = async (text) => {
    await typeRidgeTime(page, text);
    return { f: await footerState(page), bar: (await barStripeBoxes(page)).length };
  };
  const a = await read('11');
  const b = await read('11.46');
  const c = await read('12.3');
  const d = await read('12.4');
  await page.keyboard.press('Enter');
  const clearOk = (r) => !!r.f.ok && r.f.ok.text === WANT_OK_BURST && r.f.ok.title === WANT_OK_BURST_TITLE && r.f.warns.length === 0 && r.bar === 0 && r.f.keys === 0;
  const warnOk = (r, ft) => r.f.ok === null && r.f.warns.length === 1 && r.f.warns[0].text === `⚠ #2 is ${ft} ft from #1's bomb when it goes off, inside its 360 ft blast radius (est.)` && r.bar === 1 && r.f.keys === 1;
  await shot(page, `${tag}-71-ridge-12-3`);
  await page.locator('[role="dialog"] [data-reset]').click();
  await settle(page, 400);
  const back = { f: await footerState(page), tot: await totOf(page, 2) };
  const movesOk = clearOk(a) && warnOk(b, 350) && warnOk(c, 320) && clearOk(d) && back.tot === 11.9 && back.f.warns.length === 1 && back.f.warns[0].text === `⚠ ${wantWarn}`;
  const say = (r) => (r.f.ok ? `all-clear ${JSON.stringify(r.f.ok.text)}` : `${JSON.stringify(r.f.warns.map((w) => w.text))}`) + ` / ${r.bar} stripes, ${r.f.keys} swatches`;
  step(`71 the ridge pair warned by blast radius: "#2 is 130 ft from #1's bomb when it goes off, inside its 360 ft blast radius (est.)", one stripe on the bar at the burst, clear at 11.0 and 12.4 s, 350 ft at 11.46, 320 ft at 12.3 (${tag})`,
    openedOk && movesOk,
    `rule ${rule}; opened: footer ${f0.warns.length ? JSON.stringify(f0.warns[0].text) : 'no warning'} (want ${JSON.stringify(`⚠ ${wantWarn}`)}), more ${JSON.stringify(f0.more)}, swatch ${f0.keys} first ${keyFirst} titled ${JSON.stringify(keyTitle)}; ` +
      `${s0.length} stripes for ${want.length} conflicts: ${st ? `${st.w.toFixed(1)} px wide (want ≥ 6), centre ${dCentre.toFixed(2)} px from 0.5 s after #1's time (want ≤ 2), ${amber} amber pixels, background ${st.bg.slice(0, 40)}…` : 'none'}; ` +
      `11.0 s: ${say(a)}; 11.46 s: ${say(b)}; 12.3 s: ${say(c)}; 12.4 s: ${say(d)}; Reset: #2 at ${back.tot}, ${back.f.warns.length ? JSON.stringify(back.f.warns[0].text) : 'no warning'}`);
}

/**
 * Check 71b (the ridge pair's lane): with #2's diamond held (moved away to 20 s), lane #2 has one stripe, the times over
 * target at which #2 would be inside #1's blast radius: it is the library's own zone (11.4593 to 12.3429 s on this plan: 0.88 s),
 * centred on that zone within 1 px, never narrower than 6 px (the zone alone is 5.0 px at 1024×768, so there it is drawn
 * wider, from its own centre), carries the zone's key ("…:victim:0") and has amber pixels in its pads above and below the
 * band; lane #1 (held still) has none; let go: none again. The diamond's tooltip has the blast rule's sentence about
 * what the stripes are, at rest and held, because the lane has stripes to show (the tooltip is where they can be asked
 * about at rest).
 *
 * Measured green 2026-11-16: the library's zone is 11.4593 to 12.3429 s; the stripe is 8.1 px wide at 1400×900 (its own span, 8.1),
 * centre 0.02 px off the zone's, 30 amber pixels in its pads, and 6.0 px at 1024×768 (its span is 5.0), centre 0.01 px, 25 amber
 * pixels; none at rest on either lane, none on lane #1, none after the let-go.
 *
 * Proven red 2026-11-16 by one temporary edit to src/lib/playbackScene/lanes.ts, zoneBands's `t0_s: z.from_s` → `t0_s: z.to_s`
 * (a zone that starts where it ends is not drawn):
 *   STEP FAIL 71b the ridge pair's lane: … (1400x900-ridge) — library zones [{"role":"victim","from":11.4593,"to":12.3429}] (want one victim zone 11.4593 to 12.3429 ±0.005); at rest 0/0 stripes (want 0/0); held: #1 0, #2 0 (none); let go 0/0 (want 0/0); diamond at rest "Drag to change #2's time over target (←/→ 1 s, Shift+←/→ 5 s) Stripes: …", held "…"
 * and by bandBox's narrowest width taken out (red at 1024×768, where the span is 5.0 px):
 *   STEP FAIL 71b the ridge pair's lane: … (1024x768-ridge) — …; held: #1 0, #2 1 5.0 px wide (true 5.0, want ≥ 6), centre 0.49 px off the zone's (want ≤ 1), key h-ridge-1:victim:0, 22 amber pixels in its pads; …
 */
async function checkFragRidgeLane(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setRange(false); __pb.seek(__pb.snapshot().start); });
  await settle(page, 300);
  const snap = await pbEval(page, () => __pb.snapshot());
  const lib = await pbEval(page, () => __pb.moments.zones.filter((z) => z.jet === 1));
  const rest = await laneZoneBoxes(page);
  const axis = await laneAxisOf(page, 2);
  const titleRest = await handleTitleOf(page, 2);
  await dragHandle(page, 2, 20, { hold: true, steps: 6 });
  await settle(page, 400);
  const held = await laneZoneBoxes(page);
  const titleHeld = await handleTitleOf(page, 2);
  const img = await shot(page, `${tag}-71b-held`);
  await page.mouse.up();
  await settle(page, 400);
  const letGo = await laneZoneBoxes(page);
  await page.locator('[role="dialog"] [data-reset]').click();
  await settle(page);
  const f = (t) => (t - snap.start) / (snap.end - snap.start);
  const z = held[1] && held[1].zones[0];
  const zl = lib[0];
  const centreWant = zl ? axis.x + axis.width * f((zl.from_s + zl.to_s) / 2) : NaN;
  const dCentre = z ? Math.abs((z.l + z.r) / 2 - centreWant) : NaN;
  const trueW = zl ? axis.width * (zl.to_s - zl.from_s) / (snap.end - snap.start) : NaN;
  let amber = 0;
  if (z) for (const [y0, y1] of [[z.t, z.t + 3], [z.b - 3, z.b]]) for (let y = Math.ceil(y0); y < y1; y++) for (let x = Math.ceil(z.l); x < z.r; x++) {
    const p = img.at(x, y);
    if (p[0] > 100 && p[1] > 90 && p[0] > p[2] + 40) amber++;
  }
  const none = (zs) => zs.every((l) => l.zones.length === 0);
  const libOk = lib.length === 1 && lib[0].role === 'victim' && Math.abs(lib[0].from_s - 11.4593) <= 0.005 && Math.abs(lib[0].to_s - 12.3429) <= 0.005;
  const ok = libOk && none(rest) && held.length === 2 && held[0].zones.length === 0 && held[1].zones.length === 1 && dCentre <= 1 && z.w >= 5.99 && z.w >= trueW - 1 &&
    /:victim:0$/.test(z.key) && amber >= 1 && none(letGo) && titleRest === `${WANT_HANDLE_PLAIN} ${WANT_STRIPES_BURST}` && titleHeld === titleRest;
  step(`71b the ridge pair's lane: #2's stripe is the library's zone (11.46 to 12.34 s), centred within 1 px, at least 6 px wide, only while its diamond is held (${tag})`, ok,
    `library zones ${JSON.stringify(lib.map((q) => ({ role: q.role, from: +q.from_s.toFixed(4), to: +q.to_s.toFixed(4) })))} (want one victim zone 11.4593 to 12.3429 ±0.005); at rest ${rest.map((l) => l.zones.length).join('/')} stripes (want 0/0); held: #1 ${held[0] ? held[0].zones.length : '?'}, #2 ${held[1] ? held[1].zones.length : '?'} ` +
      `${z ? `${z.w.toFixed(1)} px wide (true ${trueW.toFixed(1)}, want ≥ 6), centre ${dCentre.toFixed(2)} px off the zone's (want ≤ 1), key ${z.key}, ${amber} amber pixels in its pads` : '(none)'}; let go ${letGo.map((l) => l.zones.length).join('/')} (want 0/0); diamond at rest ${JSON.stringify(titleRest)}, held ${JSON.stringify(titleHeld)}`);
}

async function runFragChecks(browser, base) {
  for (const [w, h] of [[1400, 900], [1024, 768]]) {
    const tag = `${w}x${h}`;
    const q = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4&rule=burst`, w, h);
    await checkFragBurstFour(q.page, `${tag}-strike4`);
    step(`8 no page errors, four-ship by blast radius (${tag})`, q.problems.length === 0, q.problems.length ? q.problems.slice(0, 8).join(' | ') : 'none');
    await q.context.close();
    const r = await openPage(browser, `${base}?tiles=synthetic&fixture=ridge&rule=burst`, w, h);
    step(`ready, ridge pair (${tag})`, true, JSON.stringify(await pbEval(r.page, () => __pb.terrain())));
    await checkFragRidge(r.page, `${tag}-ridge`);
    await checkFragRidgeLane(r.page, `${tag}-ridge`);
    step(`8 no page errors, ridge pair (${tag})`, r.problems.length === 0, r.problems.length ? r.problems.slice(0, 8).join(' | ') : 'none');
    await r.context.close();
  }
}

async function runStrikeChecks(browser, base) {
  for (const [w, h] of [[1400, 900], [1024, 768]]) {
    const tag = `${w}x${h}`;
    // On the spacing rule by name, so these checks (12, 13, 34 and the ones that follow) keep their picture whatever the app's default is.
    const { context, page, problems } = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4&rule=time`, w, h);
    step(`ready, four-ship (${tag})`, true, JSON.stringify(await pbEval(page, () => __pb.terrain())));
    await checkFourArrows(page, `${tag}-strike4`);
    await checkFourLabels(page, `${tag}-strike4`);
    await checkTopDownTargets(page, `${tag}-strike4`);
    await checkAttackColours(page, `${tag}-strike4`);
    await checkLaneTimeFour(page, `${tag}-strike4`);
    await checkConflictHatch(page, `${tag}-strike4`);
    await checkFragTimeFour(page, `${tag}-strike4`);
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
    // 52 on a page of its own: the four-ship opened watching #2, so #1's bomb is one of the others'.
    const bo = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4&watch=2`, w, h);
    await checkBombOthers(bo.page, `${tag}-strike4-watch2`);
    await checkBombTraceOthers(bo.page, `${tag}-strike4-watch2`);
    step(`8 no page errors, four-ship watching #2 (${tag})`, bo.problems.length === 0, bo.problems.length ? bo.problems.slice(0, 8).join(' | ') : 'none');
    await bo.context.close();
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
    // 53b's four-ship part and 59 on a page of their own: 59 moves every time over target.
    const fx = await openPage(browser, `${base}?tiles=synthetic&fixture=strike4`, 1400, 900);
    await checkFlashFastFour(fx.page, `${tag}-strike4`);
    await checkFlashCost(fx.page, `${tag}-strike4`);
    step(`8 no page errors, four-ship flashes (${tag})`, fx.problems.length === 0, fx.problems.length ? fx.problems.slice(0, 8).join(' | ') : 'none');
    await fx.context.close();
    const s = await openPage(browser, `${base}?tiles=synthetic&fixture=skip`, 1400, 900);
    await checkSkipped(s.page, `${tag}-skip`);
    await checkFlashSkipped(s.page, `${tag}-skip`);
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
    await checkArrowRoll(page, tag);
    await checkArrowUnderside(page, tag);
    await checkBombSeen(page, tag);
    await checkBombRing(page, tag);
    await checkBombTrace(page, tag);
    await checkFlash(page, tag);
    await checkFlashSwitch(page, tag);
    await checkFlashFast(page, tag);
    await checkFlashPure(page, tag);
    await checkBombCam(page, tag);
    await checkReal(page, tag);
    await checkFit(page, tag, w, h);
    await checkLayout(page, tag, w, h);
    await checkToolbarFit(page, tag, w, h);
    await checkLaneTime(page, tag);
    await checkNoHatchKeyLone(page, tag);
    if (w === 1400) await checkLaneColours(page, tag);
    if (w === 1400) {
      await checkScrub(page);
      await checkSpaceAfterScrub(page);
      await checkSpeeds(page, tag);
      await checkContextLoss(page, tag);
      await checkShowKept(page, tag);
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
      await runFragChecks(browser, base);
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
