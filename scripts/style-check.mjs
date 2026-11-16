// Checks a finished build for what the design foundation promises, and prints the numbers
// it is held to. Exits 1 with every reason.
//
//   node scripts/style-check.mjs dist              the desktop build
//   node scripts/style-check.mjs dist-web --web    the web build (adds the phone's offline cache)
//
// Run at the end of `npm run build` and `npm run build:web`, after bundle-check, which the release
// and Pages workflows run. Start-up JavaScript is bundle-check's (scripts/bundle-budget.json), not this
// script's. The CSS and offline-cache ceilings are in scripts/style-budget.json, under the same rule as
// bundle-budget.json: raising one is a change of its own, reviewed on its own, never folded into the
// change that needed it.
//
// Each check was seen failing under one change, on a copy of the build (the first three on the real files):
//   scripts/style-budget.json taken away     -> "scripts/style-budget.json: ENOENT: no such file or directory ..."
//   cssMaxBytes one under the build          -> "CSS is 56117 bytes, over the ceiling of 56116 in scripts/style-budget.json ..."
//   precacheMaxBytes one under the web build -> "offline cache is 1655814 bytes, over the ceiling of 1655813 in scripts/style-budget.json"
//   a font-host <link> added to index.html   -> "index.html names a font host (fonts.googleapis.com)" and "... loads a remote file: ..."
//   an @import url(...) put in front of CSS  -> "... names a font host", "... still has an @import", "... loads a remote file: ..."
//   the web build with woff2 out of the glob -> "sw.js does not precache assets/figtree-...woff2: the phone would fall back to system fonts offline" (x3)
//   a font file deleted                      -> "... points at /assets/jetbrains-mono-...woff2, which is not in the build"; "expected 3 font files, found 2"; "font bytes 30436 outside 60000..71000"
//   font-licenses.txt removed                -> "font-licenses.txt is missing from the build"
//   'self' out of font-src (a copy of tauri.conf.json) -> "tauri.conf.json font-src lacks 'self': bundled fonts would be blocked"
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? 'dist');
const web = process.argv.includes('--web');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BUDGET = (() => {
  try {
    const b = JSON.parse(readFileSync(join(repo, 'scripts/style-budget.json'), 'utf8'));
    if (!Number.isInteger(b?.cssMaxBytes) || !Number.isInteger(b?.precacheMaxBytes) || b.cssMaxBytes <= 0 || b.precacheMaxBytes <= 0) throw new Error('needs whole, positive cssMaxBytes and precacheMaxBytes');
    return b;
  } catch (e) {
    console.error(`Style check FAILED for ${root}: scripts/style-budget.json: ${e.message}`);
    process.exit(1);
  }
})();
// Not budgets: what proves the three font files are the ones meant (70,840 B; the two latin files alone are 60,560).
const FONT_BYTES = { min: 60000, max: 71000 };
const FAMILIES = ['Figtree Variable', 'JetBrains Mono Variable'];
const FONT_FILES = ['figtree-latin-ext-wght-normal', 'figtree-latin-wght-normal', 'jetbrains-mono-latin-wght-normal'];
const FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.bunny\.net|use\.typekit\.net|fonts\.adobe\.com/i;

const problems = [];
const bad = (message) => problems.push(message);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}
const all = [...files(root)];
const rel = (p) => relative(root, p);
const ext = (p) => p.slice(p.lastIndexOf('.'));
const text = (p) => readFileSync(p, 'utf8');
const size = (p) => statSync(p).size;

// 1. No font host anywhere in the output.
for (const p of all.filter((f) => ['.css', '.html', '.js'].includes(ext(f)))) {
  const hit = FONT_HOSTS.exec(text(p));
  if (hit) bad(`${rel(p)} names a font host (${hit[0]})`);
}

// 2. CSS: nothing remote, and every url() lands on a file that is in the build.
const cssFiles = all.filter((f) => ext(f) === '.css');
let cssAll = '';
for (const p of cssFiles) {
  const css = text(p);
  cssAll += css;
  if (/@import/i.test(css)) bad(`${rel(p)} still has an @import`);
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const url = m[2];
    if (url.startsWith('data:')) continue;
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /^[a-z][a-z0-9+.-]*:/i.test(url)) bad(`${rel(p)} loads a remote file: ${url.slice(0, 80)}`);
    else if (!existsSync(url.startsWith('/') ? resolve(root, '.' + url.split(/[?#]/)[0]) : resolve(dirname(p), url.split(/[?#]/)[0]))) bad(`${rel(p)} points at ${url}, which is not in the build`);
  }
}

// 3. HTML: no remote link, script, image or preconnect.
for (const p of all.filter((f) => ext(f) === '.html')) {
  for (const m of text(p).matchAll(/<(?:link|script|img|source)\b[^>]*\b(?:href|src)\s*=\s*["'](?:https?:)?\/\/[^"']+/gi)) bad(`${rel(p)} loads a remote file: ${m[0].slice(0, 100)}`);
  if (/rel\s*=\s*["'](?:preconnect|dns-prefetch)/i.test(text(p))) bad(`${rel(p)} opens a connection to another host (preconnect)`);
}

// 4. The fonts: exactly the three files, their @font-face families, and their weight.
const woff2 = all.filter((f) => ext(f) === '.woff2');
const fontBytes = woff2.reduce((n, f) => n + size(f), 0);
for (const stem of FONT_FILES) if (!woff2.some((f) => rel(f).split(/[\\/]/).pop().startsWith(stem))) bad(`font file ${stem} is not in the build`);
if (woff2.length !== FONT_FILES.length) bad(`expected ${FONT_FILES.length} font files, found ${woff2.length}: ${woff2.map(rel).join(', ')}`);
if (fontBytes > FONT_BYTES.max || fontBytes < FONT_BYTES.min) bad(`font bytes ${fontBytes} outside ${FONT_BYTES.min}..${FONT_BYTES.max}`);
const families = new Set([...cssAll.matchAll(/@font-face\s*\{[^}]*font-family:\s*['"]?([^;'"}]+)['"]?/g)].map((m) => m[1].trim()));
for (const f of FAMILIES) if (!families.has(f)) bad(`no @font-face for "${f}" in the built CSS`);
for (const f of families) if (!FAMILIES.includes(f)) bad(`unexpected @font-face family "${f}"`);

// 5. The licence notices travel with the fonts.
const licence = join(root, 'font-licenses.txt');
if (!existsSync(licence)) bad('font-licenses.txt is missing from the build');
else {
  const t = text(licence);
  for (const need of ['Figtree Project Authors', 'JetBrains Mono Project Authors', 'SIL OPEN FONT LICENSE']) if (!t.includes(need)) bad(`font-licenses.txt lacks "${need}"`);
}

// 6. Weight: all CSS in the build (bundle-check prints the start-up share; this caps the whole).
const cssBytes = cssFiles.reduce((n, f) => n + size(f), 0);
if (cssBytes > BUDGET.cssMaxBytes) bad(`CSS is ${cssBytes} bytes, over the ceiling of ${BUDGET.cssMaxBytes} in scripts/style-budget.json (raising it is a change of its own, reviewed on its own)`);

// 7. Desktop: the content security policy already allows what the build uses (own-origin fonts).
let precache = null;
if (!web) {
  const csp = JSON.parse(readFileSync(join(repo, 'src-tauri/tauri.conf.json'), 'utf8')).app.security.csp;
  const fontSrc = csp['font-src'] ?? [];
  if (!fontSrc.includes("'self'")) bad("tauri.conf.json font-src lacks 'self': bundled fonts would be blocked");
  if (fontSrc.some((s) => /^https?:/i.test(s))) bad(`tauri.conf.json font-src names a host: ${fontSrc.join(' ')}`);
} else {
  // 8. Web: the phone's offline cache holds the fonts, and has not ballooned.
  const sw = join(root, 'sw.js');
  if (!existsSync(sw)) bad('sw.js is missing: the web build has no offline cache');
  else {
    const urls = [...text(sw).matchAll(/\burl:\s*"([^"]+)"/g)].map((m) => m[1]);
    for (const f of woff2) if (!urls.includes(rel(f).split('\\').join('/'))) bad(`sw.js does not precache ${rel(f)}: the phone would fall back to system fonts offline`);
    precache = urls.reduce((n, u) => n + (existsSync(join(root, u)) ? size(join(root, u)) : 0), 0);
    if (precache > BUDGET.precacheMaxBytes) bad(`offline cache is ${precache} bytes, over the ceiling of ${BUDGET.precacheMaxBytes} in scripts/style-budget.json`);
  }
}

console.log(
  `Style check ${problems.length ? 'FAILED' : 'passed'} for ${relative(process.cwd(), root) || '.'}: ` +
    `css ${cssBytes} B (ceiling ${BUDGET.cssMaxBytes}), fonts ${fontBytes} B in ${woff2.length} files` +
    (precache === null ? '' : `, offline cache ${precache} B (ceiling ${BUDGET.precacheMaxBytes})`) + '.',
);
if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
