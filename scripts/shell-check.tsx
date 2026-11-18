/**
 * Checks for the app shell: the header, the rail and its counts, the side panel frame, the map's
 * own chrome (zoom, credit, Legend) and the phone shell. Run by geo-check as an import, third
 * after design-check and ui-check. A block is added when the file it reads exists, so this file
 * grows as the shell is built.
 *
 * Beside each check, "Red when" is the one change that turns it red, and "Seen" is the FAIL line
 * it printed.
 */
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stackedName, Tabs } from '../src/components/ui/Tabs';
import { readTokens } from './tokens.mjs';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => {};

// ─── The rail's names ──────────────────────────────────────────────────────────────────
{
  // Red when: stackedName's `return inBrackets ? `${item.label} (${inBrackets})` : item.label;` becomes `return item.label;` (the count and the note leave the name).
  // Seen: FAIL SH1 a rail or bar tab is named by its word, then its count (and note) in brackets, …  Threats | Attacks | Kneeboards   (SH2 goes red with it: the rail's buttons are named by the same function)
  const names = [stackedName({ label: 'Threats', count: 2 }), stackedName({ label: 'Attacks', count: 2, note: '1 hidden' }), stackedName({ label: 'Kneeboards' })];
  ok('SH1 a rail or bar tab is named by its word, then its count (and note) in brackets, as the rail is today: "Threats (2)", "Attacks (2 · 1 hidden)", "Kneeboards"',
     names.join(' | ') === 'Threats (2) | Attacks (2 · 1 hidden) | Kneeboards', names.join(' | '));

  // Red when: the `aria-label={stacked ? stackedName(item) : undefined}` line is taken out of Tabs (the badge then starts the name); or the
  // `{item.note ? <span className={cx(NOTE_BASE, …)}>{item.note}</span> : null}` line is.
  // Seen: FAIL SH2 the rail puts that name on each button, and a note ("1 hidden") as a visible second line under the label  <div role="group" aria-label="Planner panels" class="inline-grid gap-0.5 …   (each of the two changes; SH1 stays green)
  const rail = html(createElement(Tabs<'a' | 'b'>, { variant: 'rail', label: 'Planner panels', selected: 'b', onSelect: noop,
    items: [{ id: 'a', label: 'Threats', icon: 'threat', count: 2 }, { id: 'b', label: 'Attacks', icon: 'attack', count: 2, note: '1 hidden' }] }));
  ok('SH2 the rail puts that name on each button, and a note ("1 hidden") as a visible second line under the label',
     rail.includes('aria-label="Threats (2)"') && rail.includes('aria-label="Attacks (2 · 1 hidden)"') && />1 hidden<\/span>/.test(rail), rail.slice(0, 160));
}

// ─── The shell's named values ──────────────────────────────────────────────────────────
{
  // Tailwind builds only a class it knows, and a check on a component's markup sees a class's name, not its rule: a key
  // misspelled in tailwind.config.js would leave the header, the rail and the panel unstyled and every markup check
  // green. So this reads what Tailwind builds from the app's own config for the classes the shell is written with.
  // Tailwind's plugin is async and this script is not, hence the child process (as in design-check).
  const built = execFileSync(process.execPath, ['--input-type=module', '-e', [
    "import postcss from 'postcss';",
    "import tailwindcss from 'tailwindcss';",
    "import config from './tailwind.config.js';",
    "const classes = 'h-bar w-legend min-w-dock w-menu gap-inset p-inset leading-where-title leading-where-sub motion-safe:animate-sheet-in';",
    "const result = await postcss([tailwindcss({ ...config, content: [{ raw: classes, extension: 'html' }] })]).process('@tailwind utilities;', { from: undefined });",
    'process.stdout.write(result.css);',
  ].join('\n')], { encoding: 'utf8', maxBuffer: 1 << 26 }).replace(/\s+/g, ' ').replace(/ ?([{};:]) ?/g, '$1');
  const rules = [
    '.h-bar{height:var(--bar)}', '.w-legend{width:var(--legend-w)}', '.min-w-dock{min-width:var(--dock-w)}', '.w-menu{width:var(--menu-w)}',
    '.gap-inset{gap:var(--inset)}', '.p-inset{padding:var(--inset)}',
    '.leading-where-title{line-height:var(--where-title-lh)}', '.leading-where-sub{line-height:var(--where-sub-lh)}',
    'animation:sheet-in var(--t-panel) var(--ease)', '@keyframes sheet-in{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}',
  ];
  const unbuilt = rules.filter((rule) => !built.includes(rule));
  // --panel-w is read by an arbitrary class in the planner's grid, which names no theme key, so nothing else would notice it gone.
  const tokens = readTokens();
  const unnamed = ['--where-title-lh', '--where-sub-lh', '--dock-w', '--panel-w'].filter((name) => !(name in tokens));
  // Red when: the `bar: 'var(--bar)',` line leaves the theme's spacing (or `'where-title'` the line heights, or the `'sheet-in'` keyframes the theme); or the `--panel-w` line leaves tokens.css.
  // Seen: FAIL SH25 the shell's named values exist and build: …  not built: .h-bar{height:var(--bar)}; no token: none
  //       FAIL SH25 …  not built: @keyframes sheet-in{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}; no token: none
  //       FAIL SH25 …  not built: .leading-where-title{line-height:var(--where-title-lh)}; no token: none
  //       FAIL SH25 …  not built: none; no token: --panel-w
  ok('SH25 the shell\'s named values exist and build: the header, dock, Legend, menu and inset sizes, the header\'s two line heights and the panel\'s slide-in, and the four tokens that are new',
     unbuilt.length === 0 && unnamed.length === 0, `not built: ${unbuilt.join(' ; ') || 'none'}; no token: ${unnamed.join(', ') || 'none'}`);
}
