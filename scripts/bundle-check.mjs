// three.js (the 3D library behind strike playback) must load only when the
// user presses Play, and must never reach the phone at all. This checks a
// finished build for both. Exits 1 with the reason.
//
//   node scripts/bundle-check.mjs dist             desktop: three is in a lazy
//                                                  chunk, not in what loads at start
//   node scripts/bundle-check.mjs dist-web --none  web: three is nowhere
//
// Run at the end of `npm run build` and `npm run build:web`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'dist';
const none = process.argv.includes('--none');

// Strings three.js ships verbatim, chosen by reading a real build (three
// 0.187): a line of its GLSL shader code, which minifiers leave alone, and the
// prefix of its renderer's console messages. Either one in a file means three
// is in it. Re-check them after upgrading three: if a build of the desktop app
// reports "no playback chunk found", the markers have gone stale.
const MARKERS = ['vec3 transformed = vec3( position );', 'THREE.WebGLRenderer'];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const hasThree = (path) => {
  const text = readFileSync(path).toString('latin1');
  return MARKERS.some((m) => text.includes(m));
};

const fail = (message) => {
  console.error(`Bundle check FAILED for ${root}: ${message}`);
  process.exit(1);
};

if (none) {
  const bad = [...files(root)].filter(hasThree).map((p) => relative(root, p));
  // Proven able to fail: with the web alias pointed at entry.desktop.tsx,
  // "Bundle check FAILED for dist-web: three.js is in the web build: assets/PlaybackView-<hash>.js"
  if (bad.length) fail(`three.js is in the web build: ${bad.join(', ')}`);
  console.log(`Bundle check passed for ${root}: no three.js.`);
} else {
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
    const text = readFileSync(join(assets, queue.pop()), 'utf8');
    for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)) {
      if (!eager.has(m[1]) && scripts.includes(m[1])) {
        eager.add(m[1]);
        queue.push(m[1]);
      }
    }
  }

  const bad = [...eager].filter((f) => hasThree(join(assets, f)));
  // Proven able to fail: with `import * as THREE from 'three'` used in App.tsx,
  // "Bundle check FAILED for dist: three.js loads at start-up, in index-<hash>.js. ..."
  // (A bare `import 'three'` is dropped by tree-shaking, so it rightly passes.)
  if (bad.length) fail(`three.js loads at start-up, in ${bad.join(', ')}. Only a lazy import() may reach it.`);
  const lazy = scripts.filter((f) => !eager.has(f) && hasThree(join(assets, f)));
  if (lazy.length === 0) fail('no playback chunk found: is the lazy import gone, or have the markers above gone stale?');
  console.log(`Bundle check passed for ${root}: three.js only in ${lazy.join(', ')}.`);
}
