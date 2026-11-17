/**
 * Checks for the front page, "Choose your flight" and the Flight overview's pieces: markup rendered to plain
 * HTML in node (react-dom/server), and scans of the source files. Run by geo-check after overview-check.
 *
 * Beside each check, "Red when" is the one-line change that turns it red, and "Seen" is the FAIL line it
 * printed.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JetCard } from '../src/components/landing/JetCard';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const src = (f: string) => readFileSync(f, 'utf8');

// ─── The jet card ────────────────────────────────────────────────────────────
// One planned jet with a known store and an unknown one, and ESTIMATED on its attack.
const card = renderToStaticMarkup(createElement(JetCard, {
  jet: {
    key: 'm1', position: 1, callsign: 'Testcall 1-1', role: 'Flight Lead',
    stores: [{ quantity: 2, name: 'Mk-84 LDGP', known: true }, { quantity: 1, name: 'AGM-45B Shrike ARM', known: false }],
    foot: { state: 'planned', lead: '#1 · T+0s', profile: 'Maverick 8k level', estimated: true, more: 0 },
  },
}));
// Red when (JetCard): the quantity cell's `flagged ? 'text-warn' : 'text-qty'` becomes `'text-ink'`; or the ESTIMATED chip's `tone="estimated"` becomes `tone="warn"`.
// Seen: FAIL UI1 quantities in their own colour, an unknown store amber with its words, ESTIMATED a tag of its own  <td class="… font-mono font-medium pr-3 text-ink"> <td class="… font-mono font-medium pr-3 text-ink">
//         (the quantity cell as 'text-ink')
//       FAIL UI1 quantities in their own colour, an unknown store amber with its words, ESTIMATED a tag of its own  <td class="… text-qty"> <td class="… text-warn">
//         (the chip as tone="warn": the quantities were right, the ESTIMATED half failed)
const qtyCells = card.match(/<td class="[^"]*font-mono[^"]*">/g) ?? [];
ok('UI1 quantities in their own colour, an unknown store amber with its words, ESTIMATED a tag of its own',
  qtyCells.length === 2 && qtyCells[0].includes('text-qty') && qtyCells[1].includes('text-warn') && card.includes('Not in the weapon table') &&
    /border-control[^>]*>(<svg[\s\S]*?<\/svg>)?ESTIMATED</.test(card) && !/text-warn[^>]*>[^<]*ESTIMATED/.test(card),
  qtyCells.join(' '));

// ─── What the front page's own files may write ───────────────────────────────
// The flight chooser's file (src/components/import/FragOrdersPreview.tsx) is still the old picker, written in Tailwind's
// own palette; it joins this list when it is rewritten on the tokens.
const files = readdirSync('src/components/landing').map((f) => `src/components/landing/${f}`);
// Colour comes from the tokens (text-ink, bg-surface-navy, text-qty, ...), never a hex, a colour function or a Tailwind
// palette class, so the screens follow the design system if it changes.
// Red when: `text-gray-400` (or any hex) is written in a landing file, say in the jet card.
// Seen: FAIL X3 no raw colour in the landing components (tokens only)  src/components/landing/JetCard.tsx:26
//         (the role line as `text-gray-400`)
//       FAIL X3 no raw colour in the landing components (tokens only)  src/components/landing/words.ts:80
//         (a `// #86efac` comment after the Qty word)
const PALETTE = /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d{1,3})?\b/;
const raw = files.flatMap((f) => src(f).split('\n').map((l, i) => [f, i + 1, l] as const)).filter(([, , l]) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l) || PALETTE.test(l)).map(([f, n]) => `${f}:${n}`);
ok('X3 no raw colour in the landing components (tokens only)', raw.length === 0, raw.join(', '));
// A comment in a committed file must make sense to someone who has only the repo: none may point at a git-ignored
// file a reader cannot open, and no width query may stand in for a height one (Tailwind's max-[…] is max-WIDTH).
// Red when: a comment in JetCard.tsx points at such a file by name and line, say "efb2.html .jet (:574-609)" (or a landing file gets `max-[819px]:mt-4`).
// Seen: FAIL X8 no landing file points at a git-ignored file, and none writes a height rule as a width query  src/components/landing/JetCard.tsx
//         (a `// efb2.html .jet (:574-609)` comment; the same with `max-[819px]:min-h-11` on the header row)
//       FAIL X8 no landing file points at a git-ignored file, and none writes a height rule as a width query  scripts/overview-check.ts
//         (one of those words added to that file's header comment)
const pointers = [...files, 'scripts/overview-check.ts'].filter((f) => /efb2|critique|BRIEF-V2|v2-facts|mockup|Other Items|max-\[819px\]:/i.test(src(f)));
ok('X8 no landing file points at a git-ignored file, and none writes a height rule as a width query', pointers.length === 0, pointers.join(', '));

// ─── The planner map's markers, rings and route ──────────────────────────────
// mapMarkers.ts is pinned whole: its code with comments and spacing taken out, hashed. The two icon functions are
// MapView's own, moved verbatim (compared with MapView's text from before the move, comments and spacing aside);
// the ring and route values are the ones MapView wrote inline. Any colour, size, weight or dash in either palette
// changes the hash. The map's look is protected: a change here is the owner's decision, made with this hash.
// Red when (mapMarkers.ts): the target waypoint's `'bg-red-500'` becomes `'bg-red-600'` (or MapView's ring pathOptions or route colour are written inline again).
// Seen: FAIL X4 the planner map draws its markers, rings and route only through mapMarkers.ts, and that code is unchanged  735dc6c28d00ae0f
//         (the target as 'bg-red-600': the hash moved)
//       FAIL X4 the planner map draws its markers, rings and route only through mapMarkers.ts, and that code is unchanged  b249e936535ba9ce
//         (`color="#3B82F6"` written again beside `{...ROUTE_LINE}` in MapView.tsx: the hash held, MapView's half failed)
const MARKERS_CODE_SHA256 = 'b249e936535ba9ce';
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
const mv = src('src/components/map/MapView.tsx');
const markersHash = createHash('sha256').update(codeOf(src('src/components/map/mapMarkers.ts'))).digest('hex').slice(0, 16);
ok('X4 the planner map draws its markers, rings and route only through mapMarkers.ts, and that code is unchanged',
  /from '\.\/mapMarkers'/.test(mv) && !/const create(Waypoint|Threat)Icon|'#EF4444'|"#3B82F6"|fillOpacity/.test(mv) && markersHash === MARKERS_CODE_SHA256,
  markersHash);

// ─── The height variants ─────────────────────────────────────────────────────
// The height variants are variants, not screens: one object-valued screen switches every max-* and min-* variant
// off (Tailwind 3.4 warns "complex-screen-config" and generates nothing), the editors' `max-md:` with them.
// Tailwind's own `max-[…]:` is a WIDTH query, so a window-height rule can only be written with these two. The
// probe runs in a child process: it reads tailwind.config.js, and Tailwind's plugin is async.
// Red when (tailwind.config.js): `screens: { tall: { raw: '(min-height: 860px)' } }` is added to theme.extend.
// Seen: FAIL X9 tall: and short: are height queries, and the width variants still work  {"tall:min-h-11":"@media (min-height: 860px) min-height:2.75rem","short:mt-1":"@media (max-height: 819px) margin-top:0.25rem","max-md:hidden":null,"max-[1279px]:block":null}
//         (Tailwind also printed: warn - The `min-*` and `max-*` variants are not supported with a `screens` configuration containing objects.)
// Red when (tailwind-probe.mjs): the `at +` is taken out of `const body = at + rule.nodes…` (the probe stops printing the @media, so a width query cannot be told from a height one).
// Seen: FAIL X9 tall: and short: are height queries, and the width variants still work  {"tall:min-h-11":"min-height:2.75rem","short:mt-1":"margin-top:0.25rem","max-md:hidden":"display:none","max-[1279px]:block":"display:block"}
const probe = JSON.parse(execFileSync(process.execPath, ['scripts/tailwind-probe.mjs', 'tall:min-h-11', 'short:mt-1', 'max-md:hidden', 'max-[1279px]:block'], { encoding: 'utf8' })) as Record<string, string | null>;
ok('X9 tall: and short: are height queries, and the width variants still work',
  probe['tall:min-h-11']?.startsWith('@media (min-height: 860px)') === true && probe['short:mt-1']?.startsWith('@media (max-height: 819px)') === true &&
    probe['max-md:hidden'] !== null && probe['max-[1279px]:block']?.startsWith('@media (max-width: 1279px)') === true,
  JSON.stringify(probe));
