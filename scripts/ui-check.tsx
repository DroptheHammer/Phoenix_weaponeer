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
import { GroupLabel, Panel, type PanelTone } from '../src/components/ui/Panel';
import { Card } from '../src/components/ui/Card';
import { Chip, type ChipTone, type ChipSize } from '../src/components/ui/Chip';
import { Tabs, nextSelection, type TabsVariant } from '../src/components/ui/Tabs';
import { DialogFrame } from '../src/components/ui/DialogFrame';
import { isTopDialog, tabStop, type DialogNode } from '../src/components/ui/dialogKeys';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const read = (path: string) => readFileSync(path, 'utf8');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n).split('\\').join('/')]));
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => {};

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
  // Red when: Button.tsx's tonal variant says bg-gray-700; or Chip.tsx's neutral tone says bg-[#303953].
  // Seen: FAIL DS8 no raw colour in ui/: …  src/components/ui/Button.tsx:54 a Tailwind palette class   (DS14's "plain button, tonal" goes red with it: the tonal fill is gone)
  //       FAIL DS8 no raw colour in ui/: …  src/components/ui/Chip.tsx:39 a hex colour
  ok('DS8 no raw colour in ui/: no hex, no colour function, no Tailwind palette class; only token classes', hits.length === 0, hits.slice(0, 4).join('; '));
}

// ─── No class name is assembled from pieces in ui/ (Tailwind cannot see it) ─────
{
  const re = /(?:bg|text|border|ring|outline|fill|stroke|rounded|shadow|p[xytblr]?|m[xytblr]?|w|h|min-h|min-w|size|gap|leading|tracking|duration|ease)-\$\{/;
  const hits = walk('src/components/ui').filter((f) => /\.tsx?$/.test(f)).flatMap((f) => read(f).split('\n').flatMap((l, i) => (re.test(l) ? [`${f}:${i + 1}`] : [])));
  // Red when: Button.tsx's primary variant is written as a template string with an interpolated class, say `bg-${'accent'}`; or Chip.tsx's neutral tone is.
  // Seen: FAIL DS10 whole class names: no class in ui/ is built by interpolation  src/components/ui/Button.tsx:52
  //       FAIL DS10 whole class names: no class in ui/ is built by interpolation  src/components/ui/Chip.tsx:39
  // (The gallery page is scanned too: a chip name written as a template there was caught by this check, so it is written out whole.)
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

// ─── Chip, Tabs, Panel, Card ─────────────────────────────────────────────────────
{
  const warn = html(createElement(Chip, { tone: 'warn' }, 'Not in the weapon table'));
  const est = html(createElement(Chip, { tone: 'estimated' }, 'ESTIMATED'));
  // Red when: Chip's `estimated` tone is given text-warn (an estimate must never look like a caution); or its default icon is removed (`estimated: 'est'` out of DEFAULT_ICON).
  // Seen: FAIL DS14 Chip: a caution has its triangle in amber and an estimate has its tilde in an outline; both carry a word  <span class="… bg-tint-1 text-warn …   (each of the two changes;
  //       the text-warn one also reddens DS21: Chip estimated/sm: text-ink and text-warn)
  ok('DS14 Chip: a caution has its triangle in amber and an estimate has its tilde in an outline; both carry a word',
     /<svg/.test(warn) && /text-warn/.test(warn) && /<svg/.test(est) && /ESTIMATED/.test(est) && /border-control/.test(est) && !/text-warn/.test(est), `${warn} // ${est}`);
  const okChip = html(createElement(Chip, { tone: 'ok' }, 'Planned'));
  const noneChip = html(createElement(Chip, { tone: 'none', icon: 'dash-ring' }, 'No attack'));
  // Red when: Chip's ICON_TONE loses `ok: 'text-info'` (the sky check); or the sm size's icon goes back to 16 px (size="sm" in place of the xs choice).
  // Seen: FAIL DS14 Chip: a done status carries a sky check, a not-done status its own icon in the quiet fill, both 22 px with 14 px icons  <span class="… bg-tint-3 text-ink min-h-tag …   (each of the two changes)
  ok('DS14 Chip: a done status carries a sky check, a not-done status its own icon in the quiet fill, both 22 px with 14 px icons',
     /text-info/.test(okChip) && /size-3\.5/.test(okChip) && /bg-tint-3/.test(okChip) && />Planned</.test(okChip)
       && /bg-tint-1/.test(noneChip) && /text-ink-2/.test(noneChip) && /stroke-dasharray|strokeDasharray/i.test(noneChip) && /min-h-tag/.test(noneChip), `${okChip} // ${noneChip}`);
  const pills = html(createElement(Tabs, { variant: 'pills', label: 'Jets', selected: 'a', onSelect: noop, items: [{ id: 'a', label: 'Group', count: 2 }, { id: 'b', label: '#1 Viper 1-1' }] }));
  // Red when: Tabs' `{withCount ? ` (${item.count})` : null}` is removed (the count would vanish from the pills).
  // Seen: FAIL DS14 Tabs: pills read "Group (2)" with aria-pressed, in a labelled group  <div role="group" aria-label="Jets" class="flex flex-wrap gap-2"><button …
  ok('DS14 Tabs: pills read "Group (2)" with aria-pressed, in a labelled group',
     /Group.*\(2\)/.test(pills.replace(/<!-- -->/g, '')) && /aria-pressed="true"/.test(pills) && /aria-pressed="false"/.test(pills)
       && /role="group"[^>]*aria-label="Jets"|aria-label="Jets"[^>]*role="group"/.test(pills), pills.slice(0, 200));
  const bar = html(createElement(Tabs, { variant: 'bar', label: 'Planner panels', selected: null, onSelect: noop, items: [{ id: 'a', label: 'Route', count: 5, icon: 'route' }, { id: 'b', label: 'Cards', icon: 'card' }] }));
  // Red when: the `bar` group loses `var(--safe-bottom)` (the tab bar would sit under the iPhone's home bar): `pb-[calc(0.375rem+var(--safe-bottom))]` becomes `pb-1.5`.
  // Seen: FAIL DS14 Tabs: the phone bar keeps clear of the home bar, is 56 px tall per tab, and carries icon, label and count badge  <div role="group" aria-label="Planner panels" class="grid … pt-1.5 pb-1.5 pl-[max(0.5rem,var(--safe-…
  ok('DS14 Tabs: the phone bar keeps clear of the home bar, is 56 px tall per tab, and carries icon, label and count badge',
     /var\(--safe-bottom\)/.test(bar) && /min-h-tab/.test(bar) && /<svg/.test(bar) && />Route</.test(bar.replace(/<!-- -->/g, '')) && />5</.test(bar), bar.slice(0, 220));
  // Red when: Tabs.tsx's nextSelection becomes `return id;`.
  // Seen: FAIL DS15 Tabs: pressing the selected item closes it where it toggles, and never where it does not
  ok('DS15 Tabs: pressing the selected item closes it where it toggles, and never where it does not',
     nextSelection('a', 'a', true) === null && nextSelection('a', 'b', true) === 'b' && nextSelection('a', 'a', false) === 'a');
  for (const t of ['neutral', 'quiet', 'ok', 'none', 'detect', 'warn', 'estimated'] as ChipTone[])
    for (const s of ['sm', 'lg'] as ChipSize[]) audit(`Chip ${t}/${s}`, html(createElement(Chip, { tone: t, size: s }, 'x')));
  for (const variant of ['rail', 'bar', 'pills', 'segmented'] as TabsVariant[])
    for (const selected of ['a', null]) audit(`Tabs ${variant}`, html(createElement(Tabs, { variant, label: 'L', selected, onSelect: noop, items: [{ id: 'a', label: 'A', count: 1, icon: 'route' as const }, { id: 'b', label: 'B' }] })));
  for (const tone of ['group', 'float', 'well', 'dialog'] as PanelTone[]) audit(`Panel ${tone}`, html(createElement(Panel, { tone }, 'x')));
  audit('Panel nested', html(createElement(Panel, { nested: true }, 'x')));
  audit('GroupLabel', html(createElement(GroupLabel, { note: 'n' }, 'x')));
  for (const as of ['div', 'button', 'a'] as const) audit(`Card ${as}`, html(createElement(Card, { as, href: '#' }, 'x')));
}

// ─── The dialog frame ────────────────────────────────────────────────────────────
{
  const dlg = html(createElement(DialogFrame, { title: 'Preview Import', onClose: noop, phone: false }, 'body'));
  const dlgPhone = html(createElement(DialogFrame, { title: 'Preview Import', onClose: noop, phone: true }, 'body'));
  // Red when: DialogFrame drops aria-label from the role="dialog" element (App's Undo guard and the playback overlay look for it).
  // Seen: FAIL DS18 DialogFrame: role="dialog" with aria-label=title and aria-modal, z 2000, a close button named "Close <title>" (phone: "Close")  <div class="fixed inset-0 z-[2000] … <div role="dialog" aria-modal="true" class="flex flex-col overflow-hidden …   (no aria-label)
  ok('DS18 DialogFrame: role="dialog" with aria-label=title and aria-modal, z 2000, a close button named "Close <title>" (phone: "Close")',
     /role="dialog"[^>]*aria-modal="true"[^>]*aria-label="Preview Import"/.test(dlg) && /aria-label="Close Preview Import"/.test(dlg) && /z-\[2000\]/.test(dlg)
       && /role="dialog"[^>]*aria-label="Preview Import"/.test(dlgPhone) && /aria-label="Close"/.test(dlgPhone) && /z-\[2000\]/.test(dlgPhone), dlg.slice(0, 160));
  // A dialog of one fixed size whose body does not scroll (its two columns do), and an ordinary dialog that still scrolls its body.
  const cols = html(createElement(DialogFrame, { title: 'Choose your flight', onClose: noop, phone: false, widthClass: 'w-[min(980px,96vw)]', heightClass: 'h-[min(700px,90vh)]', scrollBody: false }, 'b'));
  const plain = html(createElement(DialogFrame, { title: 'Settings', onClose: noop, phone: false }, 'b'));
  // Red when: DialogFrame ignores scrollBody (the body's `scrollBody ? … : 'overflow-hidden px-6 pb-4 pt-1'` becomes `'overflow-y-auto px-6 pb-4 pt-1'`, so the body keeps scrolling);
  // or heightClass is dropped from the panel (`${heightClass}` becomes `max-h-[90vh]`).
  // Seen: FAIL DS18 DialogFrame: a fixed-height dialog with a body that does not scroll, for two columns that scroll apart; an ordinary dialog still scrolls its body  <div class="fixed inset-0 z-[2000] … aria-label="Choose your flight" class="flex flex-col overf…
  //       (each of the two changes)
  ok('DS18 DialogFrame: a fixed-height dialog with a body that does not scroll, for two columns that scroll apart; an ordinary dialog still scrolls its body',
     /h-\[min\(700px,90vh\)\]/.test(cols) && !/max-h-\[90vh\]/.test(cols) && !/overflow-y-auto/.test(cols) && /overflow-hidden px-6/.test(cols) && /max-h-\[90vh\]/.test(plain) && /overflow-y-auto px-6/.test(plain), cols.slice(0, 240));
  // The dialog element must be focusable by script (Modal moves focus into it when it opens) and never by Tab.
  const dialogTag = (markup: string) => markup.match(/<[^>]*role="dialog"[^>]*>/)?.[0] ?? '';
  // Red when: `tabIndex={-1}` is removed from the Panel in DialogFrame's desktop form; or from the phone form's outer div.
  // Seen: FAIL DS18 DialogFrame: the role="dialog" element carries tabindex="-1", desktop and phone  desktop: <div role="dialog" aria-modal="true" aria-label="Preview Import" class="flex flex-col overflow-hidden … // phone: <div tabindex="-1" class="fixed inset-0 z-[2000] …
  //       FAIL DS18 DialogFrame: the role="dialog" element carries tabindex="-1", desktop and phone  desktop: <div tabindex="-1" role="dialog" aria-modal="true" … // phone: <div class="fixed inset-0 z-[2000] flex flex-col bg-surface-navy …
  ok('DS18 DialogFrame: the role="dialog" element carries tabindex="-1", desktop and phone',
     /tabindex="-1"/.test(dialogTag(dlg)) && /tabindex="-1"/.test(dialogTag(dlgPhone)), `desktop: ${dialogTag(dlg)} // phone: ${dialogTag(dlgPhone)}`);
  audit('DialogFrame', html(createElement(DialogFrame, { title: 't', onClose: noop, phone: false, eyebrow: 'e', description: 'd', footer: 'f' }, 'b')) + html(createElement(DialogFrame, { title: 't', onClose: noop, phone: true, footer: 'f' }, 'b')));
  audit('DialogFrame columns', cols);
  audit('DialogFrame fill', html(createElement(DialogFrame, { title: 't', onClose: noop, phone: false, fill: true }, 'b')) + html(createElement(DialogFrame, { title: 't', onClose: noop, phone: true, fill: true }, 'b')));
}

// ─── Dialogs and the keyboard: who is on top, and where Tab goes ─────────────────
{
  // Stand-ins for elements: a name, a parent, and contains() walking up the parents, which is all the helpers use.
  interface Stand extends DialogNode { name: string; parent: Stand | null }
  const el = (name: string, parent: Stand | null = null): Stand => {
    const self: Stand = { name, parent, contains: (other) => { for (let p = other as Stand | null; p; p = p.parent) if (p === self) return true; return false; } };
    return self;
  };
  // A document whose [role="dialog"] elements are these, in page order.
  const doc = (...dialogs: Stand[]) => ({ querySelectorAll: () => dialogs });
  const name = (n: Stand | undefined) => n?.name ?? 'undefined';

  const lower = el('lower');
  const upper = el('upper');
  const outer = el('outer');
  const legend = el('legend', el('map', outer));
  const lone = el('lone');
  const elsewhere = el('elsewhere');
  const cases: [string, boolean, boolean][] = [
    ['of two, the later is on top', isTopDialog(upper, doc(lower, upper)), true],
    ['of two, the earlier is not', isTopDialog(lower, doc(lower, upper)), false],
    ['a dialog with a dialog inside it is on top', isTopDialog(outer, doc(outer, legend)), true],
    ['a dialog is not on top when the last dialog is elsewhere', isTopDialog(lone, doc(lone, elsewhere)), false],
    ['no dialog element, not on top', isTopDialog(null, doc(lower)), false],
  ];
  const wrong = cases.filter(([, got, want]) => got !== want).map(([what]) => what);
  // Red when: isTopDialog begins with `return true;` (every dialog answers every key, as before: one Escape closed both).
  // Seen: FAIL DS23 dialog on top: …  wrong: of two, the earlier is not; a dialog is not on top when the last dialog is elsewhere; no dialog element, not on top
  ok('DS23 dialog on top: of two dialogs only the later answers the keyboard; a dialog inside a dialog does not take it from the one round it', wrong.length === 0, `wrong: ${wrong.join('; ')}`);

  const root = el('dialog');
  const first = el('first', root);
  const middle = el('middle', root);
  const last = el('last', root);
  const behind = el('behind');
  const stops = [first, middle, last];
  const moves: [string, Stand | undefined, Stand | undefined][] = [
    ['Tab on the last goes to the first', tabStop(stops, last, false, root), first],
    ['Shift+Tab on the first goes to the last', tabStop(stops, first, true, root), last],
    ['Tab from the dialog itself goes to the first', tabStop(stops, root, false, root), first],
    ['Shift+Tab from the dialog itself goes to the last', tabStop(stops, root, true, root), last],
    ['Tab from behind the dialog goes to the first', tabStop(stops, behind, false, root), first],
    ['Shift+Tab from behind the dialog goes to the last', tabStop(stops, behind, true, root), last],
    ['Tab with nothing focused goes to the first', tabStop(stops, null, false, root), first],
    ['Tab from a middle control is the browser\'s own', tabStop(stops, middle, false, root), undefined],
    ['Shift+Tab from a middle control is the browser\'s own', tabStop(stops, middle, true, root), undefined],
    ['Shift+Tab on the last is the browser\'s own', tabStop(stops, last, true, root), undefined],
    ['no controls: Tab keeps focus on the dialog', tabStop([], root, false, root), root],
    ['no controls: Shift+Tab from behind comes to the dialog', tabStop([], behind, true, root), root],
  ];
  const off = moves.filter(([, got, want]) => got !== want).map(([what, got, want]) => `${what} (got ${name(got)}, want ${name(want)})`);
  // Red when: tabStop's `if (!back && active === last) return first;` is taken out (Tab walks out of the dialog after its last control).
  // Seen: FAIL DS24 Tab stays inside: …  Tab on the last goes to the first (got undefined, want first)
  ok('DS24 Tab stays inside: it wraps last to first and first to last, comes in from the dialog or from behind it, and leaves the browser\'s own move in between', off.length === 0, off.join('; '));
}

// ─── The gallery's dialogs get their sizes from classes the gallery defines ──────
{
  // The width and height props take a class name, and Tailwind builds nothing from the gallery's folder, so a utility class passed
  // there (h-[380px]) is never made and the dialog quietly ends up the wrong size. The page has to name a class gallery.css defines.
  const defined = new Set([...read('src/components/ui/dev/gallery.css').matchAll(/^\s*\.([\w-]+)/gm)].map((m) => m[1]));
  const given = [...read('src/components/ui/dev/gallery.tsx').matchAll(/\b(?:width|height)Class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
  const missing = given.filter((c) => !defined.has(c));
  // Red when: the scrolling dialog's heightClass="gallery-dialog-height-scrolling" in gallery.tsx becomes "h-[380px]" (a Tailwind class that is not built there);
  // or the same for the columns dialog's widthClass (w-[min(980px,96vw)]) or heightClass; or a rule's name is changed in gallery.css so the page's class is no longer defined.
  // Seen: FAIL DS18 gallery dialogs: every width and height class the gallery gives a dialog is defined in gallery.css  given: h-[380px], gallery-dialog-width-columns, gallery-dialog-height-columns; not defined: h-[380px]
  ok('DS18 gallery dialogs: every width and height class the gallery gives a dialog is defined in gallery.css', given.length > 0 && missing.length === 0, `given: ${given.join(', ')}; not defined: ${missing.join(', ')}`);
}

// ─── One utility per property ────────────────────────────────────────────────────
// Red when: `gap-2` goes back into Button's BASE (the text size's `gap-1` then meets it); or `font-bold` is added beside the tonal variant's `font-semibold`
// (Tailwind emits bold FIRST, so semibold would win and the button would not look bold).
// Seen: FAIL DS21 one utility per property: …  Button text/md: gap-2 and gap-1; Button text/lg: gap-2 and gap-1; Button text/compact: gap-2 and gap-1; …
//       FAIL DS21 one utility per property: …  Button tonal/md: font-semibold and font-bold; Button tonal/lg: font-semibold and font-bold; …
// Also red when, one change each: Chip's `estimated` tone gets `tracking-tag` beside `tracking-label`; `font-semibold` goes into Tabs' rail base (the lit state's `font-bold` meets it);
// the Panel group tone gets `border-line-strong` beside `border-line`; the Card's shadow gets `shadow-ui-2` beside `shadow-ui-1`; GroupLabel's note span gets `gap-2` beside `gap-1.5`;
// DialogFrame's desktop header gets `px-4` beside `px-6` (or the editor header `px-6` beside `px-4`).
// Seen: FAIL DS21 one utility per property: …  Chip estimated/sm: tracking-label and tracking-tag; Chip estimated/lg: tracking-label and tracking-tag
//       FAIL DS21 one utility per property: …  Tabs rail: font-semibold and font-bold
//       FAIL DS21 one utility per property: …  Panel group: border-line and border-line-strong
//       FAIL DS21 one utility per property: …  Card div: shadow-ui-1 and shadow-ui-2; Card button: shadow-ui-1 and shadow-ui-2; Card a: shadow-ui-1 and shadow-ui-2
//       FAIL DS21 one utility per property: …  GroupLabel: gap-1.5 and gap-2
//       FAIL DS21 one utility per property: …  DialogFrame: px-6 and px-4; DialogFrame columns: px-6 and px-4
//       FAIL DS21 one utility per property: …  DialogFrame fill: px-4 and px-6
ok('DS21 one utility per property: no primitive puts two classes of one family (padding, size, colour, weight, tracking, cursor ...) under the same variant',
   conflicts.length === 0, [...new Set(conflicts)].slice(0, 4).join('; '));
