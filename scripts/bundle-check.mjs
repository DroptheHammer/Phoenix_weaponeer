// Strike playback must load only when the user presses Play, and must never
// reach the phone at all. This checks a finished build for that, and for how
// heavy what loads at start-up has become. Exits 1 with the reason.
//
//   node scripts/bundle-check.mjs dist             desktop: three.js and the playback
//                                                  library are in a lazy chunk, not in what
//                                                  loads at start, and start-up JS is under
//                                                  its byte ceiling
//   node scripts/bundle-check.mjs dist-web --none  web: neither is anywhere; the sizes are
//                                                  printed for the record and not capped
//
// On both, the screens that load when they open (LAZY_MARKERS, the Flight overview) are in the
// build but not in what loads at start.
//
// Run at the end of `npm run build` and `npm run build:web`.
//
// The ceiling is in scripts/bundle-budget.json: `baselineBytes` is the start-up
// JS of the last build someone reviewed, `eagerMaxBytes` is the most the build
// may reach (it started at the baseline plus 1,536; the Play buttons and what
// they hand over, in the planner's lists and editor, took it to plus 3,072;
// the dive's aim-off, which is planner code, took it to plus 4,096; the card's
// label placement, planner code again, took it to plus 5,120). The redesigned
// shell is start-up code by nature (every screen draws its dialogs, icons,
// header and rail at once), so from there the ceiling follows it part by
// part: set ahead of a part to what that part was measured to need, and
// brought back down to the built figure plus 512 once the part is in.
// Growth over 1,024 bytes is printed as a warning: it is worth a second look
// in review. Raising the file is a change of its own, reviewed on its own,
// never folded into the change that needed it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ?? 'dist';
const none = process.argv.includes('--none');
const BUDGET_FILE = join(dirname(fileURLToPath(import.meta.url)), 'bundle-budget.json');
/** Start-up growth that gets a warning in the output (and a look in review). */
const GROWTH_WARN_BYTES = 1024;

// Strings three.js ships verbatim, chosen by reading a real build (three
// 0.187): a line of its GLSL shader code, which minifiers leave alone, and the
// prefix of its renderer's console messages. Either one in a file means three
// is in it. Re-check them after upgrading three: if a build of the desktop app
// reports "no playback chunk found", the markers have gone stale.
const MARKERS = ['vec3 transformed = vec3( position );', 'THREE.WebGLRenderer'];

// The playback library and scene (src/lib/playback, src/lib/playbackScene) hold
// no three.js, so they could be pulled into start-up, or onto the phone, by one
// eager import without the markers above noticing. Each string here is one that
// only they carry: a warning the library words, the elevation credit the
// scene prints, and the blast warning's words (the strike editor shows them
// too, through a panel that must load lazily). (The map credit is no marker:
// the card's basemap prints it too.)
// If a build reports one as "in no lazy chunk", the string was reworded, or the
// library has gone from the build: look before editing this list.
const LIBRARY_MARKERS = ['No jet in this strike can be played.', 'Mapzen (AWS Open Data)', 'when it goes off, inside its'];

// Screens that load only when they open, on both builds: each string is words only that screen
// carries. The Flight overview's threat block caption is in overviewWords.ts, which only the
// overview's own files import; one eager import of the overview (or of those words) would pull
// all of it into start-up. Each must be in the build (the phone's offline copy included), in a
// file that does not load at start.
const LAZY_MARKERS = ['as the kneeboard card orders them'];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const text = (path) => readFileSync(path).toString('latin1');
const hasThree = (path) => {
  const t = text(path);
  return MARKERS.some((m) => t.includes(m));
};
const bytes = (v) => v.toLocaleString('en-US');
const sizeOf = (paths) => paths.reduce((sum, p) => sum + statSync(p).size, 0);

const fail = (message) => {
  console.error(`Bundle check FAILED for ${root}: ${message}`);
  process.exit(1);
};

const assets = join(root, 'assets');
const scripts = readdirSync(assets).filter((f) => f.endsWith('.js'));

// What loads at start: the scripts index.html names (the entry and any
// modulepreload), then everything they import statically, followed through.
// `import("./x.js")` is a lazy load and is not followed.
const html = readFileSync(join(root, 'index.html'), 'utf8');
const eager = new Set(scripts.filter((f) => html.includes(f)));
if (eager.size === 0) fail('index.html names no script in assets/');
const queue = [...eager];
while (queue.length) {
  const code = readFileSync(join(assets, queue.pop()), 'utf8');
  for (const m of code.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)) {
    if (!eager.has(m[1]) && scripts.includes(m[1])) {
      eager.add(m[1]);
      queue.push(m[1]);
    }
  }
}
const eagerPaths = [...eager].map((f) => join(assets, f));
const eagerBytes = sizeOf(eagerPaths);
// The stylesheets index.html links: what the page needs before it can draw.
const cssPaths = readdirSync(assets).filter((f) => f.endsWith('.css') && html.includes(f)).map((f) => join(assets, f));
const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
console.log(`Start-up CSS in ${root}: ${bytes(sizeOf(cssPaths))} bytes in ${count(cssPaths.length, 'file')}.`);

for (const marker of LAZY_MARKERS) {
  const atStart = [...eager].filter((f) => text(join(assets, f)).includes(marker));
  const later = scripts.filter((f) => !eager.has(f) && text(join(assets, f)).includes(marker));
  // Proven able to fail: with App.tsx importing the overview eagerly (`import { FlightOverview as EagerOverview } from
  // "./components/landing/FlightOverview";` in place of its lazy()), on both builds,
  // "Bundle check FAILED for dist: a screen that should load when it opens loads at start-up, in index-<hash>.js (it carries "as the kneeboard card orders them"). ..."
  // and the same for dist-web.
  if (atStart.length) fail(`a screen that should load when it opens loads at start-up, in ${atStart.join(', ')} (it carries "${marker}"). Only a lazy import() may reach it.`);
  // Proven able to fail: with the marker written 'as the kneeboard card orders them x', on both builds,
  // "Bundle check FAILED for dist: "as the kneeboard card orders them x" is in no lazy chunk: has the screen's wording changed, or has it left the build? ..."
  if (later.length === 0) fail(`"${marker}" is in no lazy chunk: has the screen's wording changed, or has it left the build? Fix LAZY_MARKERS at the top of this script.`);
}

if (none) {
  const allJs = scripts.map((f) => join(assets, f));
  console.log(`Web JS in ${root}: ${bytes(sizeOf(allJs))} bytes in ${count(allJs.length, 'file')}, ${bytes(eagerBytes)} of them at start-up. Not capped.`);
  const bad = [...files(root)].filter(hasThree).map((p) => relative(root, p));
  // Proven able to fail: with the web alias pointed at entry.desktop.tsx,
  // "Bundle check FAILED for dist-web: three.js is in the web build: assets/PlaybackView-<hash>.js"
  if (bad.length) fail(`three.js is in the web build: ${bad.join(', ')}`);
  for (const marker of LIBRARY_MARKERS) {
    const found = [...files(root)].filter((p) => text(p).includes(marker)).map((p) => relative(root, p));
    // Proven able to fail: with `import { ELEVATION_CREDIT } from "./lib/playbackScene"; console.log(ELEVATION_CREDIT);` in App.tsx,
    // "Bundle check FAILED for dist-web: the playback library is in the web build (it carries "Mapzen (AWS Open Data)"): assets/index-<hash>.js"
    // and with `import { buildStrikePlayback } from "./lib/playback"; console.log(buildStrikePlayback);` the same for "No jet in this strike can be played."
    if (found.length) fail(`the playback library is in the web build (it carries "${marker}"): ${found.join(', ')}`);
  }
  console.log(`Bundle check passed for ${root}: no three.js, no playback library.`);
} else {
  const budget = (() => {
    try {
      return JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
    } catch (e) {
      return fail(`scripts/bundle-budget.json cannot be read (${e.code ?? e.message})`);
    }
  })();
  const sane = (v) => Number.isInteger(v) && v > 0;
  // Proven able to fail: with the file missing, "Bundle check FAILED for dist: scripts/bundle-budget.json cannot be read (ENOENT)";
  // with eagerMaxBytes written as "big", "Bundle check FAILED for dist: scripts/bundle-budget.json must be { "baselineBytes": n, "eagerMaxBytes": n } with whole, positive numbers and ..."
  // A file that parses to something other than an object (the word null, a number) is malformed too, not a crash.
  if (budget === null || typeof budget !== 'object' || !sane(budget.baselineBytes) || !sane(budget.eagerMaxBytes) || budget.eagerMaxBytes < budget.baselineBytes) {
    fail('scripts/bundle-budget.json must be { "baselineBytes": n, "eagerMaxBytes": n } with whole, positive numbers and the ceiling at or above the baseline');
  }
  const growth = eagerBytes - budget.baselineBytes;
  console.log(
    `Start-up JS in ${root}: ${bytes(eagerBytes)} bytes in ${count(eager.size, 'file')}; baseline ${bytes(budget.baselineBytes)}, ` +
      `${growth >= 0 ? '+' : '−'}${bytes(Math.abs(growth))}; ceiling ${bytes(budget.eagerMaxBytes)}.`,
  );

  const bad = [...eager].filter((f) => hasThree(join(assets, f)));
  // Proven able to fail: with `import * as THREE from 'three'` used in App.tsx,
  // "Bundle check FAILED for dist: three.js loads at start-up, in index-<hash>.js. ..."
  // (A bare `import 'three'` is dropped by tree-shaking, so it rightly passes.)
  if (bad.length) fail(`three.js loads at start-up, in ${bad.join(', ')}. Only a lazy import() may reach it.`);
  const lazy = scripts.filter((f) => !eager.has(f) && hasThree(join(assets, f)));
  if (lazy.length === 0) fail('no playback chunk found: is the lazy import gone, or have the markers above gone stale?');

  const lazyScripts = scripts.filter((f) => !eager.has(f));
  const carriers = {};
  for (const marker of LIBRARY_MARKERS) {
    const atStart = [...eager].filter((f) => text(join(assets, f)).includes(marker));
    // Proven able to fail: with `import { ELEVATION_CREDIT } from "./lib/playbackScene"; console.log(ELEVATION_CREDIT);` in App.tsx,
    // "Bundle check FAILED for dist: the playback library loads at start-up, in index-<hash>.js (it carries "Mapzen (AWS Open Data)"). Only a lazy import() may reach it."
    // and with `import { buildStrikePlayback } from "./lib/playback"; console.log(buildStrikePlayback);` the same for "No jet in this strike can be played."
    // and with src/lib/strike.ts importing burstSentence from ./playback/fragWords and keeping it on globalThis,
    // "Bundle check FAILED for dist: the playback library loads at start-up, in index-<hash>.js (it carries "when it goes off, inside its"). ..."
    if (atStart.length) fail(`the playback library loads at start-up, in ${atStart.join(', ')} (it carries "${marker}"). Only a lazy import() may reach it.`);
    carriers[marker] = lazyScripts.filter((f) => text(join(assets, f)).includes(marker));
    // Proven able to fail: with the marker in LIBRARY_MARKERS changed to 'Mapzen (AWS Open Data) x',
    // "Bundle check FAILED for dist: "Mapzen (AWS Open Data) x" is in no lazy chunk: has the string been reworded, or has the playback library left the build? Fix the marker list at the top of this script."
    if (carriers[marker].length === 0) fail(`"${marker}" is in no lazy chunk: has the string been reworded, or has the playback library left the build? Fix the marker list at the top of this script.`);
  }

  // Proven able to fail: with eagerMaxBytes set to 629928 (one under the build; baselineBytes lowered to 629000 so the file stays sane),
  // "Bundle check FAILED for dist: start-up JS is 629,929 bytes, over the ceiling of 629,928 in scripts/bundle-budget.json. Move the new code behind a lazy import(); ..."
  // and at exactly 629929 it passes. With a 3,500-character string logged from App.tsx (a real +3,536 bytes), the same message at 633,465 over 631,465.
  // The same +3,536 build under a ceiling of 640,000 passes and prints the over-1,024 warning below.
  if (eagerBytes > budget.eagerMaxBytes) {
    fail(`start-up JS is ${bytes(eagerBytes)} bytes, over the ceiling of ${bytes(budget.eagerMaxBytes)} in scripts/bundle-budget.json. Move the new code behind a lazy import(); raising the ceiling is a change of its own, reviewed on its own.`);
  }
  if (growth > GROWTH_WARN_BYTES) {
    console.warn(`Warning: start-up JS grew ${bytes(growth)} bytes over the baseline, past ${bytes(GROWTH_WARN_BYTES)}. Worth a look in review.`);
  }
  console.log(`Bundle check passed for ${root}: three.js only in ${lazy.join(', ')}; the playback library only in ${[...new Set(Object.values(carriers).flat())].join(', ')}.`);
}
