/**
 * Checks for the design tokens, the Tailwind theme that reads them, and the fences around everything
 * the redesign must not touch (the map's colours, the cards, the 3D playback's colour code). Run by
 * geo-check as its first import, so the release gate covers it.
 *
 * Beside each check, "Red when" is the one-line change that turns it red, and "Seen" is the FAIL line
 * it printed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { over, ratio, VISIONS, CONTRAST_FLOOR, type Rgba, type Vision } from '../src/lib/cardContrast';
import { LABEL_STYLE } from '../src/lib/attackPicture';
import { PHONE_QUERY } from '../src/hooks/useIsPhone';
// @ts-expect-error plain JS helper with a .d.mts beside it
import { readTokens, readPhone, hexOf } from './tokens.mjs';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const read = (path: string) => readFileSync(path, 'utf8');
/** A stylesheet with its comments blanked but every line break kept, so a line number found in the result is the file's own. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n).split('\\').join('/')]));
const nodeRequire = createRequire(process.cwd() + '/');
const tokens: Record<string, string> = readTokens();
const phone: { query: string; tokens: Record<string, string> } | null = readPhone(PHONE_QUERY);

// ─── Tokens: the base palette is the app's own ───────────────────────────────────
// Red when: tokens.css --rgb-accent becomes `233 69 97`.
// Seen: FAIL DS1 tokens: the five base colours are the ones the app has always had  --rgb-accent is #e94561, pinned #e94560
const PINNED_BASE: Record<string, string> = { '--rgb-window': '#1a1a2e', '--rgb-deep': '#10101f', '--rgb-navy': '#16213e', '--rgb-blue': '#0f3460', '--rgb-accent': '#e94560' };
{
  const wrong = Object.entries(PINNED_BASE).filter(([name, hex]) => hexOf(name, tokens) !== hex);
  ok('DS1 tokens: the five base colours are the ones the app has always had', wrong.length === 0, wrong.map(([n, h]) => `${n} is ${hexOf(n, tokens)}, pinned ${h}`).join('; '));
}

// ─── The Tailwind config reads only tokens that exist, and writes no colour ──────
{
  const config = read('tailwind.config.js');
  const named = new Set<string>();
  for (const m of config.matchAll(/var\((--[\w-]+)\)/g)) named.add(m[1]);
  for (const m of config.matchAll(/channel\('([\w-]+)'\)/g)) named.add(`--rgb-${m[1]}`);
  const missing = [...named].filter((n) => !(n in tokens));
  const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(config.replace(/\/\/.*$/gm, '').replace(/rgb\(var\(--rgb-\$\{name\}\) \/ <alpha-value>\)/, ''));
  const twinless = Object.keys(tokens).filter((n) => n.startsWith('--rgb-') && !(`--c-${n.slice(6)}` in tokens));
  // Red when: `--rgb-text-3` is renamed in tokens.css only (the config still names it).
  // Seen: FAIL DS2 tailwind config: …  missing: --rgb-text-3; literal: false; no twin: --rgb-text-3x
  //       (the contrast check below then throws, for it cannot read the renamed token)
  // Red when: tailwind.config.js gets `'dcs-navy': '#16213e'` back.
  // Seen: FAIL DS2 tailwind config: …  missing: ; literal: true; no twin: ; the old-names check and DS9 go red with it
  ok('DS2 tailwind config: every variable it names exists in tokens.css, it holds no colour literal, every --rgb-* has its --c-* twin',
     missing.length === 0 && !literal && twinless.length === 0, `missing: ${missing.join(', ')}; literal: ${literal}; no twin: ${twinless.join(', ')}`);
}

// ─── Tokens resolve to colours; contrast, as the cards are held to it ────────────
const PALETTE: Record<string, string> = {
  window: '--rgb-window', deep: '--rgb-deep', navy: '--rgb-navy', blue: '--rgb-blue', raised: '--rgb-navy-raised', accent: '--rgb-accent', accentHover: '--rgb-accent-hover',
  accentFg: '--rgb-accent-fg', onAccent: '--rgb-on-accent', ink: '--rgb-text', ink2: '--rgb-text-2', ink3: '--rgb-text-3', control: '--rgb-outline', info: '--rgb-sky', warn: '--rgb-warn', track: '--rgb-track', qty: '--rgb-qty',
};
const TINTS: Record<string, string> = { tint1: '--c-fill-1', tint2: '--c-fill-2', tint3: '--c-fill-3', accentSoft: '--c-accent-soft', accentSoftHover: '--c-accent-soft-hover', infoSoft: '--c-sky-soft', shade: '--c-shade' };
const channels = (name: string): [number, number, number] => {
  const v = tokens[name] ?? '';
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  const m = /^(\d+) (\d+) (\d+)$/.exec(ref ? tokens[ref[1]] : v);
  if (!m) throw new Error(`${name} is not a channel list`);
  return [+m[1], +m[2], +m[3]];
};
/** `rgb(var(--rgb-x) / a)` or `rgb(255 255 255 / a)` to a colour with alpha. */
const tint = (name: string): Rgba => {
  const m = /^rgb\((?:var\((--[\w-]+)\)|(\d+) (\d+) (\d+)) \/ ([\d.]+)\)$/.exec(tokens[name] ?? '');
  if (!m) throw new Error(`${name} is not a translucent rgb(): ${tokens[name]}`);
  const [r, g, b] = m[1] ? channels(m[1]) : [+m[2], +m[3], +m[4]];
  return { r, g, b, a: +m[5] };
};
const colour = (key: string): Rgba => {
  if (PALETTE[key]) { const [r, g, b] = channels(PALETTE[key]); return { r, g, b, a: 1 }; }
  if (TINTS[key]) return tint(TINTS[key]);
  const m = /^#([0-9a-f]{6})$/i.exec(tokens[`--d-${key}`] ?? '');
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  throw new Error(`unknown colour ${key}`);
};
/** Layers bottom first, each laid over the one below (as a browser composites them). */
const stack = (layers: string[]): Rgba => layers.slice(1).reduce<Rgba>((bg, k) => over(colour(k), bg), { ...colour(layers[0]), a: 1 });

type Pair = [id: string, kind: 'text' | 'graphic', fg: string, on: string[]];
const PAIRS: Pair[] = [
  ['T01', 'text', 'ink', ['window']], ['T02', 'text', 'ink', ['navy']], ['T03', 'text', 'ink', ['navy', 'tint1']], ['T04', 'text', 'ink', ['navy', 'raised']],
  ['T05', 'text', 'ink', ['navy', 'tint2']], ['T06', 'text', 'ink', ['navy', 'tint3']], ['T07', 'text', 'ink', ['navy', 'tint1', 'tint2']], ['T08', 'text', 'ink', ['window', 'tint2']],
  ['T09', 'text', 'ink', ['navy', 'accentSoft']], ['T10', 'text', 'ink', ['deep']], ['T11', 'text', 'ink', ['blue']],
  ['T12', 'text', 'ink2', ['window']], ['T13', 'text', 'ink2', ['navy']], ['T14', 'text', 'ink2', ['navy', 'raised']], ['T15', 'text', 'ink2', ['navy', 'tint1']],
  ['T16', 'text', 'ink2', ['navy', 'tint2']], ['T17', 'text', 'ink2', ['navy', 'tint1', 'tint1']], ['T18', 'text', 'ink2', ['navy', 'tint1', 'tint2']], ['T19', 'text', 'ink2', ['deep']],
  ['T20', 'text', 'ink2', ['navy', 'shade']],
  ['T21', 'text', 'ink3', ['window']], ['T22', 'text', 'ink3', ['navy']], ['T23', 'text', 'ink3', ['deep']],
  ['T24', 'text', 'onAccent', ['accent']], ['T25', 'text', 'onAccent', ['accentHover']],
  ['T26', 'text', 'accentFg', ['navy', 'accentSoft']], ['T27', 'text', 'accentFg', ['navy', 'accentSoftHover']],
  ['T28', 'text', 'info', ['window']], ['T29', 'text', 'info', ['navy']], ['T30', 'text', 'info', ['navy', 'tint1']], ['T31', 'text', 'info', ['navy', 'tint1', 'infoSoft']],
  ['T32', 'text', 'info', ['navy', 'infoSoft']], ['T33', 'text', 'info', ['window', 'infoSoft']], ['T34', 'text', 'info', ['deep', 'infoSoft']],
  ['T35', 'text', 'warn', ['window', 'tint1']], ['T36', 'text', 'warn', ['navy', 'tint1']], ['T37', 'text', 'warn', ['navy', 'tint1', 'tint1']],
  // The loadout quantities, on a card (navy) and on a card inside a dialog (a tint over the dialog's navy).
  ['T38', 'text', 'qty', ['navy']], ['T39', 'text', 'qty', ['navy', 'tint1']],
  ['G01', 'graphic', 'control', ['navy']], ['G02', 'graphic', 'control', ['deep']], ['G03', 'graphic', 'control', ['window']], ['G04', 'graphic', 'control', ['navy', 'tint1']],
  ['G05', 'graphic', 'accent', ['navy']], ['G06', 'graphic', 'accent', ['navy', 'accentSoft']], ['G07', 'graphic', 'accent', ['window']],
  ['G08', 'graphic', 'info', ['window']], ['G09', 'graphic', 'info', ['navy']], ['G10', 'graphic', 'info', ['navy', 'tint1']], ['G11', 'graphic', 'info', ['deep']], ['G12', 'graphic', 'info', ['navy', 'accentSoft']],
  ['G13', 'graphic', 'ink2', ['navy']], ['G14', 'graphic', 'ink2', ['window']], ['G15', 'graphic', 'ink', ['navy', 'tint2']], ['G16', 'graphic', 'onAccent', ['accent']], ['G17', 'graphic', 'track', ['navy']],
  ['D01', 'graphic', 'target', ['navy']], ['D02', 'graphic', 'ip', ['navy']], ['D03', 'graphic', 'nav', ['navy']], ['D04', 'graphic', 'bullseye', ['navy']], ['D05', 'graphic', 'departure', ['navy']],
  ['D06', 'graphic', 'sam', ['navy']], ['D07', 'graphic', 'aaa', ['navy']], ['D08', 'graphic', 'manpads', ['navy']], ['D09', 'graphic', 'shorad', ['navy']], ['D10', 'graphic', 'ewr', ['navy']],
];
/**
 * Known dips under colour-blind simulation, pinned so they cannot get worse: pair -> vision -> lowest ratio allowed.
 * G17 is the phone slider's track, kept as today (2.1:1), so its floor is 2.0 in every vision.
 */
const KNOWN: Record<string, Partial<Record<Vision | 'normal', number>>> = {
  T24: { protan: 3.5 }, G05: { protan: 2.9 }, G06: { protan: 2.5 }, D01: { protan: 2.9 }, D06: { protan: 2.1 },
  G17: { normal: 2.0, protan: 2.0, deutan: 2.0 },
};
{
  const failures: string[] = [];
  for (const [id, kind, fg, on] of PAIRS) {
    const bg = stack(on);
    for (const v of VISIONS) {
      const r = ratio(colour(fg), bg, v);
      const floor = KNOWN[id]?.[v] ?? CONTRAST_FLOOR[kind];
      if (r < floor) failures.push(`${id} ${fg} on ${on.slice().reverse().join(' on ')} (${v}): ${r.toFixed(2)} < ${floor}`);
    }
  }
  // Red when: tokens.css --rgb-text-3 becomes `120 130 150`.
  // Seen: FAIL DS5 contrast: …  T21 ink3 on window (normal): 4.41 < 4.5; … T22 ink3 on navy (normal): 4.11 < 4.5; … T22 ink3 on navy (protan): 4.10 < 4.5; … (deutan): 4.12 < 4.5
  // Red when: tokens.css --rgb-qty becomes `40 120 70` (the quantity pairs T38 and T39).
  // Seen: FAIL DS5 contrast: …  T38 qty on navy (normal): 2.93 < 4.5; … (protan): 3.03 < 4.5; … (deutan): 2.84 < 4.5; T39 qty on tint1 on navy (normal): 2.46 < 4.5; … (protan): 2.55 < 4.5; … (deutan): 2.39 < 4.5
  ok('DS5 contrast: every pair the primitives draw meets AA (text 4.5, graphic 3) in normal, protan and deutan vision, the known dips no worse than pinned',
     failures.length === 0, failures.join('; ') || `${PAIRS.length} pairs x ${VISIONS.length + 1} visions`);
}

// ─── Tailwind: the theme reads the tokens and leaves the map's palette alone ─────
{
  const probe = (...classes: string[]): Record<string, string | null> =>
    JSON.parse(execFileSync(process.execPath, ['scripts/tailwind-probe.mjs', ...classes], { encoding: 'utf8' }));
  const got = probe('bg-dcs-navy/80', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-orange-500', 'bg-slate-500', 'bg-gray-500', 'hover:bg-blue-600', 'text-gray-400', 'bg-sky-950/95', 'accent-dcs-accent', 'fill-dcs-accent');
  // Red when: tailwind.config.js moves `colors` out of `extend` (that replaces Tailwind's palette), or adds `red: ...` to it.
  // Seen: FAIL DS3 tailwind: the default palette the map markers and the chrome greys use is intact  bg-red-500 -> null
  const palette = { 'bg-red-500': '239 68 68', 'bg-yellow-500': '234 179 8', 'bg-blue-500': '59 130 246', 'bg-orange-500': '249 115 22', 'bg-slate-500': '100 116 139', 'bg-gray-500': '107 114 128', 'text-gray-400': '156 163 175', 'hover:bg-blue-600': '37 99 235' };
  const wrong = Object.entries(palette).filter(([c, rgb]) => !(got[c] ?? '').includes(`rgb(${rgb} /`));
  ok('DS3 tailwind: the default palette the map markers and the chrome greys use is intact', wrong.length === 0, wrong.map(([c]) => `${c} -> ${got[c]}`).join('; '));
  // Red when: the `'dcs-navy'` line is deleted from tailwind.config.js.
  // Seen: FAIL DS3 tailwind: the old dcs-* names still compile, with an opacity, from the tokens, … null
  ok('DS3 tailwind: the old dcs-* names still compile, with an opacity, from the tokens, and so do the two map-overlay classes that replaced hex literals',
     (got['bg-dcs-navy/80'] ?? '').includes('rgb(var(--rgb-navy) / 0.8)') && (got['accent-dcs-accent'] ?? '').includes('var(--rgb-accent)') && (got['fill-dcs-accent'] ?? '').includes('var(--rgb-accent)') && got['bg-sky-950/95'] !== null, String(got['bg-dcs-navy/80']));
  const named = probe('min-h-tab', 'size-tap-sm', 'min-w-tap-sm', 'text-ui-compact', 'shadow-ui-up', 'rounded-ui-md', 'font-map', 'bg-surface-navy/80', 'enabled:hover:bg-tint-3', 'min-h-bar-btn', 'min-h-tag', 'text-qty');
  // Red when: the `qty: channel('qty'),` line is deleted from tailwind.config.js (or `'bar-btn': 'var(--bar-btn)'`, or `tab: 'var(--tab)'`).
  // Seen: FAIL DS3 tailwind: the design system's own names generate  text-qty   (with the bar-btn line gone: … min-h-bar-btn)
  ok('DS3 tailwind: the design system\'s own names generate', Object.values(named).every((v) => v !== null), Object.entries(named).filter(([, v]) => v === null).map(([c]) => c).join(', '));

  // Spacing: the 4px rhythm IS Tailwind's own scale, so utilities and variables cannot disagree.
  const full = nodeRequire('tailwindcss/resolveConfig')({ content: [], theme: {} });
  const SP: Record<string, string> = { '--sp-05': '0.5', '--sp-1': '1', '--sp-15': '1.5', '--sp-2': '2', '--sp-25': '2.5', '--sp-3': '3', '--sp-35': '3.5', '--sp-4': '4', '--sp-5': '5', '--sp-6': '6', '--sp-8': '8', '--sp-10': '10' };
  // Red when: tokens.css --sp-35 becomes 15px.
  // Seen: FAIL DS4 spacing: every --sp-* token equals the Tailwind scale step it mirrors  --sp-35 15px vs spacing[3.5] 0.875rem
  const off = Object.entries(SP).filter(([name, key]) => parseFloat(full.theme.spacing[key]) * 16 !== parseFloat(tokens[name]));
  ok('DS4 spacing: every --sp-* token equals the Tailwind scale step it mirrors', off.length === 0, off.map(([n, k]) => `${n} ${tokens[n]} vs spacing[${k}] ${full.theme.spacing[k]}`).join('; '));
}

// ─── The data colours are copies of the map's own ────────────────────────────────
{
  // The map's markers and rings are written in mapMarkers.ts (MapView and the Flight overview both draw through it).
  const map = read('src/components/map/mapMarkers.ts');
  const colors = nodeRequire('tailwindcss/resolveConfig')({ content: [], theme: {} }).theme.colors;
  const markers: Record<string, [string, string]> = { target: ['red', '500'], ip: ['yellow', '500'], nav: ['blue', '500'], bullseye: ['orange', '500'], departure: ['slate', '500'] };
  const wrong: string[] = [];
  for (const [kind, [hue, shade]] of Object.entries(markers)) {
    if (!new RegExp(`${kind}: 'bg-${hue}-${shade}'`).test(map)) wrong.push(`the map's markers no longer draw ${kind} as bg-${hue}-${shade}`);
    if ((tokens[`--d-${kind}`] ?? '').toLowerCase() !== String(colors[hue][shade]).toLowerCase()) wrong.push(`--d-${kind} ${tokens[`--d-${kind}`]} vs ${hue}-${shade} ${colors[hue][shade]}`);
  }
  for (const [kind, key] of [['sam', 'SAM'], ['aaa', 'AAA'], ['manpads', 'MANPADS'], ['shorad', 'SHORAD'], ['ewr', 'EWR']]) {
    const m = new RegExp(`${key}: '(#[0-9A-Fa-f]{6})'`).exec(map);
    if (!m || m[1].toLowerCase() !== (tokens[`--d-${kind}`] ?? '').toLowerCase()) wrong.push(`--d-${kind} ${tokens[`--d-${kind}`]} vs map ${m?.[1]}`);
  }
  const ring = /threat\.status === 'active' \? '(#[0-9A-Fa-f]{6})'/.exec(map);
  if (!ring || ring[1].toLowerCase() !== (tokens['--d-ring'] ?? '').toLowerCase()) wrong.push(`--d-ring vs map ${ring?.[1]}`);
  // Red when: tokens.css --d-sam becomes #dc2627; or mapMarkers.ts draws the target waypoint as 'bg-red-600'.
  // Seen: FAIL DS6 data colours: each --d-* token equals what the map's markers draw  --d-sam #dc2627 vs map #DC2626
  //       FAIL DS6 data colours: each --d-* token equals what the map's markers draw  the map's markers no longer draw target as bg-red-500   (mapMarkers.ts: 'bg-red-600')
  ok('DS6 data colours: each --d-* token equals what the map\'s markers draw', wrong.length === 0, wrong.join('; '));
}

// ─── The files that hold the protected colours take no token and no bundled font ─
{
  // The card, the attack picture, the jet colours, and the 3D playback's planner colour code: its scene and lane
  // colours, the components that draw the planner's colours on the timeline, and the 3D layers.
  const PROTECTED = ['src/lib/attackPicture.ts', 'src/lib/cardTheme.ts', 'src/lib/cardContrast.ts', 'src/lib/renderKneeboardCanvas.ts', 'src/lib/labelLayout.ts',
    'src/components/attacks/JetStrip.tsx', 'src/lib/jetColors.ts',
    'src/lib/playbackScene/sceneStyle.ts', 'src/lib/playbackScene/laneStyle.ts', 'src/lib/playbackScene/callouts.ts',
    'src/components/playback/ui.ts', 'src/components/playback/JetLanes.tsx', 'src/components/playback/terrain/terrainLoader.ts',
    ...walk('src/components/playback/scene')];
  const missingFiles = PROTECTED.filter((f) => !existsSync(f));
  const hits = PROTECTED.filter((f) => existsSync(f) && /var\(--|Figtree|JetBrains/.test(read(f)));
  // The tooltip block in index.css is LABEL_STYLE written out (a CSS rule cannot import it).
  const block = /\.leaflet-tooltip\.attack-tooltip\s*\{([^}]*)\}/.exec(read('src/index.css'))?.[1] ?? '';
  const tooltipOk = block.includes(`background: ${LABEL_STYLE.tooltipBg}`) && block.includes(`color: ${LABEL_STYLE.tooltipText}`) && block.includes(`border: 1px solid ${LABEL_STYLE.tooltipBorder}`);
  // Red when: attackPicture.ts LINE_STYLE.attack.color becomes 'var(--c-accent)'; or `Figtree` is added to MONO in renderKneeboardCanvas.ts; or LABEL_STYLE.tooltipBg changes without index.css;
  // or laneStyle.ts PANEL becomes 'var(--c-navy)'; or a protected file is renamed without this list (it would silently leave the fence).
  // Seen: FAIL DS7 protected colours: …  missing: ; hits: src/lib/attackPicture.ts   (renderKneeboardCanvas.ts with the font named; laneStyle.ts with the var; a file under scene/ with a var)
  //       FAIL DS7 protected colours: …  missing: ; hits: ; tooltip CSS differs from LABEL_STYLE
  //       FAIL DS7 protected colours: …  missing: src/lib/playbackScene/callout.ts; hits:
  ok('DS7 protected colours: the card, picture, jet and playback colour files exist, hold no var() and no bundled font; the map tooltip CSS still equals LABEL_STYLE',
     missingFiles.length === 0 && hits.length === 0 && tooltipOk, `missing: ${missingFiles.join(', ')}; hits: ${hits.join(', ')}${tooltipOk ? '' : '; tooltip CSS differs from LABEL_STYLE'}`);
}

// ─── No colour literal in the fonts or the base stylesheet ───────────────────────
{
  const COLOUR = [/#[0-9a-fA-F]{3,8}\b/, /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/];
  // index.css may hold a colour only inside the map tooltip block (LABEL_STYLE, see DS7): a CSS rule cannot import it.
  const parts: [string, string][] = [
    ['src/styles/fonts.css', stripComments(read('src/styles/fonts.css'))],
    ['src/index.css', stripComments(read('src/index.css')).replace(/\.leaflet-tooltip\.attack-tooltip\s*\{[^}]*\}/, (m) => m.replace(/[^\n]/g, ''))],
  ];
  const hits = parts.flatMap(([file, css]) => css.split('\n').flatMap((line, i) => (COLOUR.some((re) => re.test(line)) ? [`${file}:${i + 1}`] : [])));
  // Red when: index.css gets `color: #fff` in `body` (or anywhere but the tooltip block); or fonts.css gets a colour; or the thumb ring in .range-lg goes back to `#f1f5f9`.
  // Seen: FAIL DS8 no raw colour in the base styles: …  src/index.css:38   (`color: #fff;` added to body)
  //       FAIL DS8 no raw colour in the base styles: …  src/index.css:136; src/index.css:148   (both thumb rings back to `#f1f5f9`)
  //       FAIL DS8 no raw colour in the base styles: …  src/styles/fonts.css:44   (`color: rgb(255 0 0);` inside the last @font-face)
  ok('DS8 no raw colour in the base styles: fonts.css and index.css (outside the map tooltip block) write no colour literal', hits.length === 0, hits.join('; '));
}

// ─── The five base hex values are written down once (and where nothing can read a variable) ─
{
  const BASE_HEX = ['#1a1a2e', '#10101f', '#16213e', '#0f3460', '#e94560'];
  const ALLOWED = new Set(['src/styles/tokens.css', 'index.html', 'playback-harness.html', 'src-tauri/tauri.conf.json', 'src/lib/cardTheme.ts', 'src/lib/cardContrast.ts',
    'src/lib/playbackScene/sceneStyle.ts', 'src/lib/playbackScene/laneStyle.ts']);
  const files = [...walk('src').filter((f) => /\.(tsx?|css)$/.test(f) && !f.startsWith('src/generated')), 'index.html', 'playback-harness.html', 'vite.config.ts', 'vite.config.web.ts', 'tailwind.config.js', 'src-tauri/tauri.conf.json'].filter(existsSync);
  const stray = files.filter((f) => !ALLOWED.has(f) && BASE_HEX.some((h) => read(f).toLowerCase().includes(h)));
  const window = hexOf('--rgb-window', tokens);
  const html = /<html[^>]*style="background-color:\s*(#[0-9a-fA-F]{6})/.exec(read('index.html'))?.[1]?.toLowerCase();
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json')).app.windows[0].backgroundColor?.toLowerCase();
  const web = read('vite.config.web.ts');
  const derived = web.includes('hexOf("--rgb-navy")') && web.includes('hexOf("--rgb-window")');
  const scene = /BG = '(#[0-9a-fA-F]{6})'/.exec(read('src/lib/playbackScene/sceneStyle.ts'))?.[1]?.toLowerCase();
  // The timeline's panel colour is written out for geo-check's contrast pairs; it is Tailwind's dcs-navy, the token.
  const navy = hexOf('--rgb-navy', tokens);
  const panel = /export const PANEL = '(#[0-9a-fA-F]{6})'/.exec(read('src/lib/playbackScene/laneStyle.ts'))?.[1]?.toLowerCase();
  // Red when: a base hex is pasted into a component (say `#e94560` back into MapLegend.tsx); or tauri.conf.json's backgroundColor becomes #1a1a2f; or index.html's inline background changes;
  // or laneStyle.ts PANEL becomes '#16213f'.
  // Seen: FAIL DS9 one source: …  stray: src/components/map/MapLegend.tsx; …                      (the legend's hex back)
  //       FAIL DS9 one source: …  stray: ; index.html #1a1a2e; tauri #1a1a2f; token #1a1a2e; …      (the window colour off by one)
  //       FAIL DS9 one source: …  stray: ; … derived true; scene #1a1a2e; panel #16213f vs #16213e  (the panel colour off by one)
  //       FAIL DS9 one source: …  stray: vite.config.web.ts; … derived false; …                    (the theme colour written as a literal)
  ok('DS9 one source: no stray copy of a base colour; the window background in index.html, tauri.conf.json and the playback scene, and the timeline panel, equal the tokens; the web build derives its theme colours from them',
     stray.length === 0 && html === window && tauri === window && derived && scene === window && panel === navy,
     `stray: ${stray.join(', ')}; index.html ${html}; tauri ${tauri}; token ${window}; derived ${derived}; scene ${scene}; panel ${panel} vs ${navy}`);
}

// ─── Fonts ───────────────────────────────────────────────────────────────────────
{
  const css = read('src/styles/fonts.css');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const families = faces.map((f) => /font-family:\s*'([^']+)'/.exec(f)?.[1]);
  const srcs = faces.map((f) => /src:\s*url\('([^']+)'\)/.exec(f)?.[1] ?? '');
  const registered = new Set(families);
  const familiesOk = families.join('|') === 'Figtree Variable|Figtree Variable|JetBrains Mono Variable';
  const first = (name: string) => /^\s*'([^']+)'/.exec(tokens[name] ?? '')?.[1];
  const pkg = JSON.parse(read('package.json')).dependencies as Record<string, string>;
  const pinned = ['@fontsource-variable/figtree', '@fontsource-variable/jetbrains-mono'].filter((p) => !/^\d+\.\d+\.\d+$/.test(pkg[p] ?? ''));
  const missing = srcs.filter((s) => !existsSync(join('node_modules', s)));
  const bytes = srcs.reduce((n, s) => n + (existsSync(join('node_modules', s)) ? statSync(join('node_modules', s)).size : 0), 0);
  // What the theme makes of `font-sans` and `font-mono`: Tailwind's base styles put html, pre and code in these, so the
  // theme must name the two stacks in tokens.css, not a stack of its own.
  const themeFonts = JSON.parse(execFileSync(process.execPath, ['scripts/tailwind-probe.mjs', 'font-sans', 'font-mono'], { encoding: 'utf8' })) as Record<string, string | null>;
  const themeOk = themeFonts['font-sans'] === 'font-family:var(--font-sans)' && themeFonts['font-mono'] === 'font-family:var(--font-mono)';
  // Red when: fonts.css renames 'Figtree Variable' to 'Figtree'; or package.json says "^5.3.0"; or a src becomes url(https://fonts.gstatic.com/...);
  // or tailwind.config.js has `mono: ['Consolas', 'Monaco', 'monospace']` back in place of `mono: ['var(--font-mono)']`, or loses its `sans:` line.
  // Seen: FAIL DS11 fonts: …  faces 3; families Figtree|Figtree Variable|JetBrains Mono Variable; …                   (the first face renamed)
  //       FAIL DS11 fonts: …  unpinned @fontsource-variable/figtree; …                                                (a caret on the pin)
  //       FAIL DS11 fonts: …  missing https://fonts.gstatic.com/s/figtree/v1/x.woff2; bytes 60560; …                  (a remote src; DS13 goes red too)
  //       FAIL DS11 fonts: …  theme font-sans font-family:var(--font-sans), font-mono font-family:Consolas, Monaco, monospace   (the old literal stack left in the theme)
  //       FAIL DS11 fonts: …  theme font-sans font-family:ui-sans-serif, system-ui, sans-serif, …, font-mono font-f…           (no `sans:` entry)
  ok('DS11 fonts: exactly 3 @font-face (Figtree latin and latin-ext, JetBrains Mono latin), swap, bare package paths that exist, the stack names a registered family, both packages pinned exactly, 60-71 kB, and the theme\'s sans and mono are those stacks',
     faces.length === 3 && familiesOk && faces.every((f) => /font-display:\s*swap/.test(f)) && srcs.every((s) => /^@fontsource-variable\/(figtree|jetbrains-mono)\/files\/[\w-]+\.woff2$/.test(s))
       && registered.has(first('--font-sans') ?? '') && registered.has(first('--font-mono') ?? '') && pinned.length === 0 && missing.length === 0 && bytes >= 60000 && bytes <= 71000 && themeOk,
     `faces ${faces.length}; families ${[...registered].join('|')}; sans ${first('--font-sans')}; mono ${first('--font-mono')}; unpinned ${pinned.join(',')}; missing ${missing.join(',')}; bytes ${bytes}; theme font-sans ${themeFonts['font-sans']}, font-mono ${themeFonts['font-mono']}`);
}
{
  const root = /:root\s*\{[^}]*font-family:\s*([^;]+);/.exec(read('src/index.css'))?.[1]?.trim();
  const wrappers = ['src/components/map/MapView.tsx', 'src/components/map/AttackPreviewMap.tsx'].filter((f) => !/\bfont-map\b/.test(read(f)));
  // The 3D playback keeps today's look: its overlay's root carries legacy-ui, which index.css maps to today's two stacks,
  // light native controls and the browser's scrollbars.
  const overlay = /role="dialog"[\s\S]{0,200}className="[^"]*\blegacy-ui\b/.test(read('src/components/playback/PlaybackOverlay.tsx'));
  // Today's font-mono: the monospace stack the theme held before the bundled fonts. Written out because the config no longer holds it.
  const LEGACY_MONO = 'Consolas, Monaco, monospace';
  // index.css as rules: each selector list split at its top-level commas (so `:is(a, b)` stays one selector), spaces folded.
  const selectors = (list: string) => {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', '));
  };
  const rules = [...read('src/index.css').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: selectors(m[1]), body: m[2] }));
  const has = (selector: string, decl: RegExp) => rules.some((r) => r.sel.includes(selector) && decl.test(r.body));
  const LEGACY_MONO_SEL = '.legacy-ui :is(.font-mono, pre, code, kbd, samp)';
  // Each promise of the playback fence, by name, so a FAIL says which one went.
  const fence: [string, boolean][] = [
    ['today\'s sans', has('.legacy-ui', /font-family:\s*var\(--font-map\)/)],
    ['light native controls', has('.legacy-ui', /color-scheme:\s*normal/)],
    ['today\'s mono, <pre> included', has(LEGACY_MONO_SEL, /font-family:\s*var\(--font-legacy-mono\)/)],
    ['today\'s mono ligatures', has(LEGACY_MONO_SEL, /font-variant-ligatures:\s*normal/)],
    ['ordinary digits', has('.legacy-ui', /font-variant-numeric:\s*normal/)],
    ['browser scrollbar width', has('.legacy-ui *', /scrollbar-width:\s*auto/)],
    ['browser scrollbar colour', has('.legacy-ui *', /scrollbar-color:\s*auto/)],
    ['no ligatures in the app\'s mono (outside the fence)', has('.font-mono', /font-variant-ligatures:\s*none/)],
  ];
  const broken = fence.filter(([, kept]) => !kept).map(([name]) => name);
  // Red when: ` font-map` is deleted from MapView.tsx; or --font-map in tokens.css gains Figtree; or ` legacy-ui` is deleted from PlaybackOverlay.tsx;
  // or --font-legacy-mono loses `Monaco, `; or `color-scheme: normal` leaves the .legacy-ui rule (the playback's checkboxes and slider would turn dark);
  // or `.legacy-ui,` leaves the digits rule (tabular digits in the playback); or `scrollbar-color: auto;` is deleted; or `font-variant-ligatures: none;`
  // leaves the .font-mono rule; or the fence's mono selector loses `pre, ` (the error panel's details in JetBrains Mono).
  // Seen: FAIL DS12 map and playback fonts: …  no font-map: src/components/map/MapView.tsx; …                          (and the same with AttackPreviewMap.tsx)
  //       FAIL DS12 map and playback fonts: …  'Figtree Variable', Inter, system-ui, Avenir, Helvetica, Arial, sans-serif; root …   (--font-map gaining Figtree)
  //       FAIL DS12 map and playback fonts: …  overlay false; fence broken: none; …                                     (legacy-ui left off the overlay)
  //       FAIL DS12 map and playback fonts: …  fence broken: light native controls; …
  //       FAIL DS12 map and playback fonts: …  legacy mono Consolas, monospace vs Consolas, Monaco, monospace          (Monaco dropped)
  //       FAIL DS12 map and playback fonts: …  fence broken: ordinary digits; …
  //       FAIL DS12 map and playback fonts: …  fence broken: browser scrollbar colour; …
  //       FAIL DS12 map and playback fonts: …  fence broken: no ligatures in the app's mono (outside the fence); …
  //       FAIL DS12 map and playback fonts: …  fence broken: today's mono, <pre> included, today's mono ligatures; …     (`pre, ` dropped from the :is list)
  //       FAIL DS12 map and playback fonts: …  fence broken: today's mono ligatures; …
  ok('DS12 map and playback fonts: --font-map is today\'s stack, the root font is Figtree, both map wrappers carry font-map, the playback overlay carries legacy-ui, which keeps today\'s sans, mono, digits, native controls and scrollbars',
     tokens['--font-map'] === 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif' && root === 'var(--font-sans)' && wrappers.length === 0 && overlay && broken.length === 0 && tokens['--font-legacy-mono'] === LEGACY_MONO,
     `${tokens['--font-map']}; root ${root}; no font-map: ${wrappers.join(', ')}; overlay ${overlay}; fence broken: ${broken.join(', ') || 'none'}; legacy mono ${tokens['--font-legacy-mono']} vs ${LEGACY_MONO}`);
}
{
  const HOST = /fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.bunny\.net|use\.typekit\.net|fonts\.adobe\.com/i;
  const hits = ['index.html', 'vite.config.ts', 'vite.config.web.ts', 'tailwind.config.js', 'src-tauri/tauri.conf.json', 'src/index.css', 'src/styles/fonts.css', 'src/styles/tokens.css'].filter((f) => HOST.test(read(f)));
  const sec = JSON.parse(read('src-tauri/tauri.conf.json')).app.security as { csp: Record<string, string[]>; devCsp: Record<string, string[]> };
  const fontSrc = (c: Record<string, string[]>) => c['font-src'] ?? [];
  const cspOk = [sec.csp, sec.devCsp].every((c) => fontSrc(c).includes("'self'") && !fontSrc(c).some((s) => /^https?:/i.test(s)));
  // Red when: a <link href="https://fonts.googleapis.com/..."> goes into index.html; or 'self' leaves font-src in tauri.conf.json.
  // Seen: FAIL DS13 no font host: …  index.html; font-src 'self',data: / 'self',data:                                  (the link in index.html)
  //       FAIL DS13 no font host: …  ; font-src https://example.org,data: / https://example.org,data:                  (font-src without 'self', run on a copy of the file)
  ok('DS13 no font host: none of the sources names one, and both Content Security Policies allow own-origin fonts only', hits.length === 0 && cspOk, `${hits.join(', ')}; font-src ${fontSrc(sec.csp)} / ${fontSrc(sec.devCsp)}`);
}

// ─── Motion and the phone block live where they are promised ─────────────────────
{
  const css = read('src/index.css');
  const stars = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(',').some((s) => s.trim().startsWith('*')));
  const motion = stars.filter((m) => /transition|animation/.test(m[2]));
  // Red when: index.css gets `* { transition-duration: .01ms !important }`, the blanket reduced-motion rule (it moved the map 32 px in Leaflet's fit).
  // Seen: FAIL DS19 motion: no universal rule sets a transition or animation (…)  *
  ok('DS19 motion: no universal rule sets a transition or animation (each primitive carries motion-reduce:transition-none)', motion.length === 0, motion.map((m) => m[1].trim()).join('; '));

  const mediaCss = [...css.matchAll(/@media\s*([^{]+)\{/g)].map((m) => m[1].trim());
  // Red when: tokens.css's query becomes `(max-width: 700px), (max-height: 500px)`; or useIsPhone's PHONE_QUERY changes alone; or the --tap-sm override is dropped;
  // or the `--bar: 44px;` line leaves the phone block.
  // Seen: FAIL DS20 phone: …  tokens.css phone block: --tap-sm 44px, --fs-compact 15px, --check 22px, --field 56px, --menu-w 264px, --legend-w 256px; …   (no --bar)
  //       FAIL DS20 phone: …  tokens.css phone block: none under (max-width: 767px), (max-height: 500px); …   (the query changed)
  //       FAIL DS20 phone: …  tokens.css phone block: --tap-sm 32px, --fs-compact 15px, --bar 44px, …   (--tap-sm wrong)
  // A second @media block ahead of the phone block (say a min-height one) leaves this green: tokens.mjs finds the phone block by its query.
  ok('DS20 phone: the token overrides sit under the same query as useIsPhone and the phone rules in index.css, and override tokens that exist',
     phone !== null && phone.query === PHONE_QUERY && mediaCss.includes(PHONE_QUERY) && phone.tokens['--tap-sm'] === '44px' && phone.tokens['--fs-compact'] === '15px'
       && phone.tokens['--bar'] === '44px' && Object.keys(phone.tokens).every((k) => k in tokens),
     `tokens.css phone block: ${phone ? Object.entries(phone.tokens).map(([k, v]) => `${k} ${v}`).join(', ') : 'none under ' + PHONE_QUERY}; index.css: ${mediaCss.join(' | ')}`);
}

// ─── Keyboard focus: one ring, from index.css ────────────────────────────────────
{
  // What the app ships is index.css after Tailwind has processed it, not the file as written: Tailwind drops a rule in
  // `@layer base` whose selector names a class that appears nowhere in the source, and Leaflet adds `leaflet-container`
  // at run time. So this reads Tailwind's output, with the app's own config. Tailwind's plugin is async and this
  // script is not, hence the child process (as in tailwind-probe.mjs).
  const shipped = execFileSync(process.execPath, ['--input-type=module', '-e', [
    "import { readFileSync } from 'node:fs';",
    "import postcss from 'postcss';",
    "import tailwindcss from 'tailwindcss';",
    "import config from './tailwind.config.js';",
    "const result = await postcss([tailwindcss(config)]).process(readFileSync('src/index.css', 'utf8'), { from: 'src/index.css' });",
    'process.stdout.write(result.css);',
  ].join('\n')], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const css = stripComments(shipped);
  const focus = /:where\([^)]*\bbutton\b[^)]*\[tabindex\][^)]*\):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--c-sky\)/.test(css);
  const leaflet = /\[class~=['"]?leaflet-container['"]?\]\s+:where\([^)]*\):focus-visible\s*\{[^}]*outline:\s*revert/.test(css);
  // Red when: the `outline: 2px solid var(--c-sky);` line is changed or removed in index.css; or the `outline: revert;` line leaves the Leaflet rule;
  // or the whole ring rule is commented out instead of deleted; or the Leaflet rule's selector goes back to `.leaflet-container …` (Tailwind then drops it from the build).
  // Seen: FAIL DS16 focus: one global 2px sky ring at zero specificity (:where), …  global false; leaflet true   (the ring in the accent colour; the same with the ring rule commented out)
  //       FAIL DS16 focus: one global 2px sky ring at zero specificity (:where), …  global true; leaflet false   (no `outline: revert;`; the same with the class selector)
  ok('DS16 focus: one global 2px sky ring at zero specificity (:where), and Leaflet\'s own controls keep the browser ring, in the stylesheet Tailwind builds', focus && leaflet, `global ${focus}; leaflet ${leaflet}`);
}

// ─── The quantity colour marks a loadout's numbers and nothing else ──────────────
{
  // The files that may use it: none yet. A screen that draws a loadout's quantity column adds its file here
  // (one shared stores-table component is preferred, so one entry).
  const QTY_USERS = new Set<string>([]);
  const QTY = /\b(?:text|bg|border|fill|stroke|ring|outline|decoration|divide|from|via|to|shadow|accent|caret|placeholder)-qty\b|--(?:c|rgb)-qty\b/;
  const users = walk('src').filter((f) => /\.(tsx?|css)$/.test(f) && f !== 'src/styles/tokens.css' && QTY.test(read(f)));
  const stray = users.filter((f) => !QTY_USERS.has(f));
  // Red when: `text-qty` is put on a word anywhere in src (say a chip's colour); or `--c-qty` is used in index.css.
  // Seen: FAIL DS22 quantity colour: …  used in: src/components/map/MapLegend.tsx; not listed: src/components/map/MapLegend.tsx   (and the same with src/index.css)
  ok('DS22 quantity colour: only the files listed may use --c-qty / text-qty (the numbers of a loadout list, nothing else)', stray.length === 0, `used in: ${users.join(', ') || 'nothing'}; not listed: ${stray.join(', ')}`);
}
