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
// whatever the shade. Neither drape colour nor the navy background passes this. The path, the
// trail and the target ring do (they are the jet's colour too): see check 2 for how it allows for them.
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
 * left-right mirror.
 *
 * Proven red 2026-11-14, each by one temporary edit to scene/terrainLayer.ts:
 * `texture.colorSpace = SRGBColorSpace` removed (the colours wash out; 3a goes red with it):
 *   STEP FAIL 1 drape colours exact on flat ground (1400x900) — west at (1095,280): median 229,219,196 vs 200,180,140, 0% within 3; north at (1188,373): median 219,208,229 vs 180,160,200, 0% within 3; east at (686,295): median 192,212,179 vs 134,168,115, 0% within 3
 * `texture.flipY = false` added (the drape upside down):
 *   STEP FAIL 1 drape colours exact on flat ground (1400x900) — west at (1095,280): median 180,160,200 vs 200,180,140, 0% within 3; north at (1188,373): median 180,160,200 vs 180,160,200, 100% within 3; east …, 100% within 3
 */
async function checkColours(page, tag) {
  await pbEval(page, () => { __pb.pause(); __pb.setGround('flat'); __pb.goHome(); __pb.seek(__pb.moments.t0); });
  await settle(page, 400);
  const img = await shot(page, `${tag}-01-flat-home`);
  const { samples, colours } = await pbEval(page, () => ({ samples: __pb.samples, colours: __pb.colours }));
  const parts = [];
  let ok = true;
  for (const side of ['west', 'north', 'east']) {
    const p = await pbEval(page, ([e, n]) => __pb.projectWorld(e, n, 0), samples[side]);
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
 * (The first version of this check counted within 20 px, needed 30, and included the release
 * moment beside the ring: with the arrow gone it still passed, on 35 / 99 / 211 px of lines and ring.)
 */
const ARROW_PATCH = 10;
const ARROW_MIN = 90;
async function checkJet(page, tag, label = '2 jet arrow on screen') {
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
    const at = (e, n) => __pb.projectWorld(e, n, h.heightAt(e, n));
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

/** Check 5: a lost WebGL context is rebuilt when it comes back, and the jet is drawn again. */
async function checkContextLoss(page, tag) {
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
  step('5a context loss: "restoring" shown, then the scene rebuilt', lostOk && restoring && remounted, `lose ${lostOk}, note shown ${restoring}, sceneCreates ${before} → ${after}`);
  if (remounted) await checkJet(page, `${tag}-rebuilt`, '5b after the rebuild, the jet arrow on screen');
}

/** Check 9: focus, Escape, Space, Tab and clicks stay inside playback. */
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
    await checkColours(page, tag);
    await checkJet(page, tag);
    await checkReal(page, tag);
    await checkFit(page, tag, w, h);
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
