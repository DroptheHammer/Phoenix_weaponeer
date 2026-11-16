/**
 * Checks for the primitives in src/components/ui/. Run by geo-check as its second import (the
 * first is design-check, for the tokens and the fences).
 *
 * Beside each check, "Red when" is the one-line change that turns it red, and "Seen" is the FAIL
 * line it printed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, type ButtonVariant, type ButtonSize } from '../src/components/ui/Button';
import { IconButton } from '../src/components/ui/IconButton';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const read = (path: string) => readFileSync(path, 'utf8');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n).split('\\').join('/')]));
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

// ─── Nothing in ui/ may write a colour ───────────────────────────────────────────
{
  const PALETTE_NAMES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
  const BAD: [RegExp, string][] = [
    [/#[0-9a-fA-F]{3,8}\b/, 'a hex colour'],
    [/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/, 'a colour function'],
    [new RegExp(`(?<![\\w-])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)-(?:${PALETTE_NAMES})(?:-\\d{2,3})?(?:/\\d+)?(?![\\w-])`), 'a Tailwind palette class'],
  ];
  const hits: string[] = [];
  for (const file of walk('src/components/ui').filter((f) => /\.(tsx?|css)$/.test(f))) {
    read(file).split('\n').forEach((line, i) => {
      for (const [re, what] of BAD) if (re.test(line)) hits.push(`${file}:${i + 1} ${what}`);
    });
  }
  // Red when: Button.tsx's tonal variant says bg-gray-700.
  // Seen: FAIL DS8 no raw colour in ui/: …  src/components/ui/Button.tsx:54 a Tailwind palette class   (DS14's "plain button, tonal" goes red with it: the tonal fill is gone)
  ok('DS8 no raw colour in ui/: no hex, no colour function, no Tailwind palette class; only token classes', hits.length === 0, hits.slice(0, 4).join('; '));
}

// ─── No class name is assembled from pieces in ui/ (Tailwind cannot see it) ─────
{
  const re = /(?:bg|text|border|ring|outline|fill|stroke|rounded|shadow|p[xytblr]?|m[xytblr]?|w|h|min-h|min-w|size|gap|leading|tracking|duration|ease)-\$\{/;
  const hits = walk('src/components/ui').filter((f) => /\.tsx?$/.test(f)).flatMap((f) => read(f).split('\n').flatMap((l, i) => (re.test(l) ? [`${f}:${i + 1}`] : [])));
  // Red when: Button.tsx's primary variant is written as a template string with an interpolated class, say `bg-${'accent'}`.
  // Seen: FAIL DS10 whole class names: no class in ui/ is built by interpolation  src/components/ui/Button.tsx:52
  ok('DS10 whole class names: no class in ui/ is built by interpolation', hits.length === 0, hits.join('; '));
}

// ─── Each variant sets each property once (cx does not resolve conflicts) ────────
const FAMILIES: [string, RegExp][] = [
  ['padding-x', /^px-/], ['padding-y', /^py-/], ['padding-l', /^pl-/], ['padding-r', /^pr-/], ['padding-t', /^pt-/], ['padding-b', /^pb-/], ['padding', /^p-/],
  ['min-height', /^min-h-/], ['min-width', /^min-w-/], ['size', /^size-/], ['width', /^w-/], ['radius', /^rounded(-|$)/],
  ['font-size', /^text-ui-/], ['text-colour', /^text-(ink|info|warn|accent-fg)(-[\w-]+)?$/], ['background', /^bg-/],
  ['border-width', /^border(-\[[\d.]+px\]|-0)?$/], ['border-colour', /^border-(transparent|control|line|line-strong|accent|accent-line)$/],
  ['tracking', /^tracking-/], ['leading', /^leading-/], ['font-weight', /^font-(bold|semibold|medium|normal)$/], ['cursor', /^cursor-/], ['opacity', /^opacity-/], ['shadow', /^shadow-/], ['gap', /^gap-/],
];
const conflicts: string[] = [];
const audit = (label: string, markup: string) => {
  for (const m of markup.matchAll(/class="([^"]+)"/g)) {
    const seen = new Map<string, string>();
    for (const c of m[1].split(/\s+/)) {
      const cut = c.lastIndexOf(':');
      const prefix = cut < 0 ? '' : c.slice(0, cut);
      const base = cut < 0 ? c : c.slice(cut + 1);
      const fam = FAMILIES.find(([, re]) => re.test(base))?.[0];
      if (!fam) continue;
      const key = `${prefix}|${fam}`;
      if (seen.has(key) && seen.get(key) !== c) conflicts.push(`${label}: ${seen.get(key)} and ${c}`);
      seen.set(key, c);
    }
  }
};

// ─── No primitive removes the focus ring ─────────────────────────────────────────
{
  const killers = walk('src/components/ui').filter((f) => /\.tsx?$/.test(f) && /outline-none|outline: none/.test(read(f)));
  // Red when: Button.tsx's BASE gets `focus:outline-none`.
  // Seen: FAIL DS16 focus: no primitive removes the outline (the one global ring in index.css must reach every control)  src/components/ui/Button.tsx
  ok('DS16 focus: no primitive removes the outline (the one global ring in index.css must reach every control)', killers.length === 0, killers.join(', '));
}

// ─── Button and IconButton ───────────────────────────────────────────────────────
{
  const b = html(createElement(Button, null, 'Open'));
  // Red when: Button's default type="button" is changed to 'submit' (a button inside a form would submit it).
  // Seen: FAIL DS14 Button: a plain button is type="button", tonal, 44 px  <button type="submit" class="inline-flex …
  ok('DS14 Button: a plain button is type="button", tonal, 44 px', /type="button"/.test(b) && /bg-tint-2/.test(b) && /min-h-tap/.test(b), b);
  const busy = html(createElement(Button, { busy: true }, 'Fetching...'));
  // Red when: `disabled:cursor-not-allowed` goes back into Button's BASE (it is emitted after `cursor-progress` and wins on a busy button, which is disabled).
  // Seen: FAIL DS14 Button: busy disables, announces and shows the progress cursor, and only that cursor  <button type="button" disabled="" aria-busy="true" class="… disabled:cursor-not-allowed border …  cursor-progress">
  ok('DS14 Button: busy disables, announces and shows the progress cursor, and only that cursor',
     /disabled=""/.test(busy) && /aria-busy="true"/.test(busy) && /cursor-progress/.test(busy) && !/disabled:cursor-not-allowed/.test(busy) && /disabled:cursor-not-allowed/.test(b) && !/cursor-progress/.test(b), busy);
  const outline = html(createElement(Button, { variant: 'outline', icon: 'trash' }, 'Delete'));
  // Red when: the outline variant gets `bg-red-danger` (a red fill, or the word "danger").
  // Seen: FAIL DS14 Button: the outline variant is a neutral edge (never red), with its icon and its word  <button … class="… bg-red-danger …">
  ok('DS14 Button: the outline variant is a neutral edge (never red), with its icon and its word', /border-control/.test(outline) && /<svg/.test(outline) && />Delete</.test(outline) && !/\b(?:bg|text|border)-red|danger/.test(outline), outline);
  const text = html(createElement(Button, { variant: 'text' }, 'Edit'));
  // Red when: the text variant's `text-info` becomes `text-ink-2`.
  // Seen: FAIL DS14 Button: the row text button is sky, and takes its height and size from the phone-aware tokens  <button … class="… text-ink-2 …">
  ok('DS14 Button: the row text button is sky, and takes its height and size from the phone-aware tokens', /text-info/.test(text) && /min-h-tap-sm/.test(text) && /min-w-tap-sm/.test(text) && /text-ui-compact/.test(text), text);
  const ib = html(createElement(IconButton, { icon: 'close', label: 'Close panel' }));
  // Red when: IconButton's `title={label}` line is deleted (the tooltip goes).
  // Seen: FAIL DS14 IconButton: the label is its name  <button type="button" aria-label="Close panel" class="inline-grid …   (no title="Close panel")
  ok('DS14 IconButton: the label is its name', /aria-label="Close panel"/.test(ib) && /title="Close panel"/.test(ib) && /aria-hidden="true"/.test(ib), ib);
  // A disabled primary turns grey (it never looks half-ready); the rest fade to 50%. The header's 36 px size. A trailing arrow.
  const primary = html(createElement(Button, { variant: 'primary', disabled: true }, 'Import'));
  const tonal = html(createElement(Button, { variant: 'tonal', disabled: true }, 'File'));
  const bar = html(createElement(Button, { variant: 'quiet', size: 'bar', icon: 'settings' }, 'Settings'));
  const go = html(createElement(Button, { variant: 'text', iconEnd: 'arrow-right' }, 'Open Threats on the map'));
  // Red when: Button's primary variant loses ` disabled:bg-tint-2 disabled:text-ink-3` (a disabled Import would still be accent pink); or the `bar` size's
  // `min-h-bar-btn` becomes `min-h-tap` (44 px does not fit the 48 px header); or the iconEnd line moves above `{children}`.
  // Seen: FAIL DS14 Button: a disabled primary is grey with dim ink and does not fade; other variants fade to 50%; …  <button type="button" disabled="" class="…   (each of the three changes)
  ok('DS14 Button: a disabled primary is grey with dim ink and does not fade; other variants fade to 50%; the header size is 36 px; a trailing icon follows the label',
     /disabled:bg-tint-2/.test(primary) && /disabled:text-ink-3/.test(primary) && !/disabled:opacity-50/.test(primary) && /disabled:opacity-50/.test(tonal)
       && /min-h-bar-btn/.test(bar) && /rounded-ui-md/.test(bar) && />Open Threats on the map<svg/.test(go), `${primary} // ${bar} // ${go}`);
  for (const v of ['primary', 'tonal', 'emphasis', 'quiet', 'outline', 'text'] as ButtonVariant[])
    for (const s of ['md', 'lg', 'compact', 'sm', 'bar'] as ButtonSize[])
      for (const extra of [{}, { busy: true }, { disabled: true }, { icon: 'plus' as const }, { iconEnd: 'arrow-right' as const }])
        audit(`Button ${v}/${s}`, html(createElement(Button, { variant: v, size: s, ...extra }, 'x')));
  audit('IconButton', html(createElement(IconButton, { icon: 'close', label: 'x', size: 'sm' })));
}

// ─── One utility per property ────────────────────────────────────────────────────
// Red when: `gap-2` goes back into Button's BASE (the text size's `gap-1` then meets it); or `font-bold` is added beside the tonal variant's `font-semibold`
// (Tailwind emits bold FIRST, so semibold would win and the button would not look bold).
// Seen: FAIL DS21 one utility per property: …  Button text/md: gap-2 and gap-1; Button text/lg: gap-2 and gap-1; Button text/compact: gap-2 and gap-1; …
//       FAIL DS21 one utility per property: …  Button tonal/md: font-semibold and font-bold; Button tonal/lg: font-semibold and font-bold; …
ok('DS21 one utility per property: no primitive puts two classes of one family (padding, size, colour, weight, tracking, cursor ...) under the same variant',
   conflicts.length === 0, [...new Set(conflicts)].slice(0, 4).join('; '));
