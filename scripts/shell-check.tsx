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
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stackedName, Tabs } from '../src/components/ui/Tabs';
import { AppBar, AppBarPrimary, HeaderWhere } from '../src/components/shell/AppBar';
import { FileMenu, menuKey, pressShutsMenu } from '../src/components/shell/FileMenu';
import { PhoneShell } from '../src/components/phone/PhoneShell';
import { readTokens } from './tokens.mjs';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const read = (path: string) => readFileSync(path, 'utf8');
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => {};
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

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

// ─── The header ────────────────────────────────────────────────────────────────────────
{
  const close = { id: 'close', label: 'Close', sub: 'Close this mission', icon: 'close' as const, onSelect: noop };
  // Red when: FileMenu's `size="bar"` becomes `size="compact"` (a 44 px button in a 48 px bar).
  // Seen: FAIL SH3 the header's buttons are the 36 px header size (Button size "bar": min-h-bar-btn), …  <div class="relative"><button id=":R0:-button" aria-label="File" title="File" aria-haspopup="menu" aria-expanded="false" type=…
  const file = html(createElement(FileMenu, { items: [close] }));
  const save = html(createElement(AppBarPrimary, { icon: 'save', label: 'Save', onClick: noop }));
  ok('SH3 the header\'s buttons are the 36 px header size (Button size "bar": min-h-bar-btn), and its one filled button is the primary',
     file.includes('min-h-bar-btn') && !file.includes('min-h-tap ') && save.includes('min-h-bar-btn') && save.includes('bg-accent') && save.includes('aria-label="Save"'),
     file.slice(0, 160));

  // Red when: AppBar's `flex h-bar min-w-0` becomes `flex h-14 min-w-0`; or its `{onQuit ? (` becomes `{onSettings ? (` (the browser would get a Quit button).
  // Seen: FAIL SH4 the header is one 48 px bar (h-bar) with the app name …  <header class="relative z-[1100] flex h-14 min-w-0 shrink-0 items-center …   (h-14)
  //       FAIL SH4 the header is one 48 px bar (h-bar) with the app name …  <header class="relative z-[1100] flex h-bar min-w-0 shrink-0 items-center …   (Quit drawn without onQuit)
  const desk = html(createElement(AppBar, { fileItems: [close], onSettings: noop, onQuit: noop }));
  const web = html(createElement(AppBar, { fileItems: [close], onSettings: noop }));
  ok('SH4 the header is one 48 px bar (h-bar) with the app name (gone under 1100 px), File and Settings on every screen, and Quit only where onQuit is given',
     /<header class="[^"]* h-bar /.test(desk) && desk.includes('Phoenix Weaponeer') && desk.includes('max-[1099px]:hidden') && desk.includes('aria-label="File"') && desk.includes('aria-label="Settings"')
       && desk.includes('aria-label="Quit"') && !web.includes('aria-label="Quit"'),
     desk.slice(0, 200));

  // Red when: HeaderWhere's error colour `isError ? 'font-semibold text-warn' : 'text-ink-2'` becomes `'text-ink-2'`.
  // Seen: FAIL SH5 the line under the title shows a file message in place of the place while there is one (an error in amber, as a status); …  <div class="grid min-w-0 grid-cols…
  const saved = html(createElement(HeaderWhere, { title: 'Copper Anvil', fullTitle: 'Copper Anvil', sub: 'Nevada (NTTR)', status: 'Saved: copper-anvil.json' }));
  const failed = html(createElement(HeaderWhere, { title: 'Copper Anvil', fullTitle: 'Copper Anvil', sub: 'Nevada (NTTR)', status: 'Error: disk full' }));
  const dirty = html(createElement(HeaderWhere, { title: 'Copper Anvil', dirty: true, fullTitle: 'Copper Anvil (unsaved changes)', sub: 'Nevada (NTTR) · Unsaved changes' }));
  const flight = html(createElement(HeaderWhere, { title: 'Venom 1', titleAside: ' · 4 × F-16C Viper', fullTitle: 'Venom 1 · 4 × F-16C Viper', sub: 'Copper Anvil · Nevada (NTTR)' }));
  ok('SH5 the line under the title shows a file message in place of the place while there is one (an error in amber, as a status); the unsaved dot is never the only sign; a flight\'s aircraft words sit dimmer on the title line',
     saved.includes('role="status"') && saved.includes('Saved: copper-anvil.json') && !saved.includes('Nevada') && failed.includes('text-warn')
       && dirty.includes('title="Copper Anvil (unsaved changes)"') && dirty.includes('Unsaved changes') && dirty.includes('bg-accent')
       && /<h1[^>]*>Venom 1<span class="[^"]*text-ink-2[^"]*"> · 4 × F-16C Viper<\/span><\/h1>/.test(flight) && flight.includes('leading-where-title'),
     saved.slice(0, 160));

  // Red when: FileMenu's button loses `aria-haspopup="menu"`; or its aria-controls is set while the menu is shut (`aria-controls={`${id}-menu`}`).
  // Seen: FAIL SH6 File is a named, quiet header button that says it opens a menu; …  <div class="relative"><button id=":R0:-button" aria-label="File" title="File" aria-expanded="false" type="button" …   (no aria-haspopup)
  //       FAIL SH6 File is a named, quiet header button that says it opens a menu; …  … aria-haspopup="menu" aria-expanded="false" aria-…   (aria-controls while shut)
  ok('SH6 File is a named, quiet header button that says it opens a menu; shut, there is no menu and no aria-controls pointing at one',
     file.includes('aria-label="File"') && file.includes('aria-haspopup="menu"') && file.includes('aria-expanded="false"') && !file.includes('role="menu"') && !file.includes('aria-controls'),
     file.slice(0, 200));

  // A choice list opens from its own button, Escape shuts it with the keyboard back on that button, and a press outside
  // shuts it. The key and press rules are pure, so they are run here; the wiring to them is read from the source.
  const wrap = { contains: (node: unknown) => node === 'inside' };
  const keys = [menuKey('Escape', 1, 4), menuKey('Tab', 1, 4), menuKey('ArrowDown', 3, 4), menuKey('ArrowUp', 0, 4), menuKey('Home', 2, 4), menuKey('End', 0, 4), menuKey('a', 0, 4)];
  const keysWant = [{ close: 'to-button' }, { close: 'move-on' }, { focus: 0 }, { focus: 3 }, { focus: 0 }, { focus: 3 }, null];
  const presses = [pressShutsMenu(wrap, 'inside'), pressShutsMenu(wrap, 'outside'), pressShutsMenu(null, 'outside')];
  const menuSrc = read('src/components/shell/FileMenu.tsx');
  const wired = {
    button: /onClick=\{\(\) => \(open \? close\(true\) : setOpen\(true\)\)\}/.test(menuSrc),
    press: /if \(pressShutsMenu\(wrap\.current, event\.target\)\) setOpen\(false\);/.test(menuSrc) && /window\.addEventListener\('pointerdown', onDown\)/.test(menuSrc),
    // Escape is heard on the window while the menu is open (a press on the menu's padding leaves the keyboard on the page),
    // put on and taken off with the outside-press listener, and it asks menuKey what the key means.
    escape: /window\.addEventListener\('keydown', onEscape\);/.test(menuSrc) && /window\.removeEventListener\('keydown', onEscape\);/.test(menuSrc)
      && /const onEscape = [^\n]*\{\s*const action = menuKey\(event\.key, -1, 0\);\s*if \(action && 'close' in action && action\.close === 'to-button'\) \{\s*event\.preventDefault\(\);\s*close\(true\);/.test(menuSrc),
    // The arrow keys, Home, End and Tab stay on the menu itself.
    onMenu: /role="menu"[\s\S]*?onKeyDown=\{onKeyDown\}/.test(menuSrc) && /action\.close === 'move-on'\) close\(false\);/.test(menuSrc) && /if \('focus' in action\) \{\s*event\.preventDefault\(\);\s*list\[action\.focus\]\?\.focus\(\);/.test(menuSrc),
  };
  // Red when: menuKey's Escape returns `{ close: 'move-on' }` (focus would not go back to File); or pressShutsMenu's
  // `return !wrap?.contains(target);` becomes `return false;`; or File's `setOpen(true)` becomes `setOpen(false)` (it would never open);
  // or the window's Escape is taken out (the `window.addEventListener('keydown', onEscape);` line is deleted, and Escape then does nothing
  // after a press on the menu's padding); or Tab's `else if (action.close === 'move-on') close(false);` is deleted from the menu's own handler.
  // Seen: FAIL SH26 the File menu opens from its own button, …  keys [{"close":"move-on"},{"close":"move-on"},{"focus":0},…]; presses false,true,true; button true, press true, escape true, onMenu true   (Escape)
  //       FAIL SH26 …  keys […]; presses false,false,false; button true, press true, escape true, onMenu true   (a press outside)
  //       FAIL SH26 …  presses false,true,true; button false, press true, escape true, onMenu true   (File never opens)
  //       FAIL SH26 …  presses false,true,true; button true, press true, escape false, onMenu true   (the window's Escape taken out)
  //       FAIL SH26 …  presses false,true,true; button true, press true, escape true, onMenu false   (Tab's close taken out of the menu's handler)
  ok('SH26 the File menu opens from its own button, Escape shuts the menu from wherever the keyboard is (heard on the window while it is open) and puts the keyboard back on File, Tab shuts it and moves on, the arrows wrap, and a press outside shuts it',
     JSON.stringify(keys) === JSON.stringify(keysWant) && presses.join(',') === 'false,true,true' && wired.button && wired.press && wired.escape && wired.onMenu,
     `keys ${JSON.stringify(keys)}; presses ${presses.join(',')}; button ${wired.button}, press ${wired.press}, escape ${wired.escape}, onMenu ${wired.onMenu}`);

  // Red when: `const toolbarButton = 'px-3';` is put back in App.tsx; or App draws a second header (`<header` or a second <AppBar).
  // Seen: FAIL SH20 App draws its desktop header only through one <AppBar> (no toolbarButton string, no <header> of its own)  toolbarButton true; AppBar 1; <header false
  const app = read('src/App.tsx');
  ok('SH20 App draws its desktop header only through one <AppBar> (no toolbarButton string, no <header> of its own)',
     !/toolbarButton/.test(app) && count(app, /<AppBar\b/g) === 1 && !/<header\b/.test(app) && /from ["']\.\/components\/shell\/AppBar["']/.test(app),
     `toolbarButton ${/toolbarButton/.test(app)}; AppBar ${count(app, /<AppBar\b/g)}; <header ${/<header\b/.test(app)}`);

  // The three File menus (the planner's, the overview's and the front page's) and the unsaved words are built in App, so
  // they are read from its source, one branch of the header at a time.
  const branch = (from: RegExp, to: RegExp) => {
    const start = app.search(from);
    const rest = start < 0 ? '' : app.slice(start);
    const end = rest.slice(1).search(to);
    return end < 0 ? '' : rest.slice(0, end + 1);
  };
  const plannerBar = branch(/shown === 'map' && mission\s*\?\s*\{/, /: shown === 'overview' && mission && where/);
  const overviewBar = branch(/shown === 'overview' && mission && where\s*\?\s*\{/, /: \/\/ The front page/);

  // Unsaved work is said in words where the title is the flight. The overview bar's small line ends with the words, which stay
  // when the rest of the line goes under 960 px (as in the planner's bar), its tooltip carries them, and it has no dot (the
  // dot belongs beside the mission's name). One `dirtyWords` is defined above the phone branch, and the phone header is given it.
  // Red when: the overview bar's `{isDirty ? dirtyWords : null}` is taken out of its `sub` (or its tooltip loses `isDirty ? dirtyWords : ''`); or
  // `dirtyWords` is defined again below the phone branch; or the phone header's call loses its `dirtyWords`.
  // Seen: FAIL SH27 unsaved work is said in words on the Flight overview, on the desktop bar and in the phone header, from one definition  words in the small line false, in its tooltip true, no dot true, one definition above the phone branch true, given to the phone header true
  //         (the words taken out of the line)
  //       FAIL SH27 …  words in the small line true, in its tooltip true, no dot true, one definition above the phone branch true, given to the phone header false
  //         (the phone header's call without `dirtyWords`)
  const defAt = app.search(/const dirtyWords = platform\.isWeb \? 'Not exported' : 'Unsaved changes';/);
  const phoneAt = app.search(/if \(isPhone\) \{/);
  const says = {
    line: /<span className="max-\[959px\]:hidden">\{where\.sub\}\{isDirty \? ' · ' : ''\}<\/span> : null\}\s*\{isDirty \? dirtyWords : null\}/.test(overviewBar),
    tooltip: /subTitle=\{\[where\.sub, isDirty \? dirtyWords : ''\]\.filter\(Boolean\)\.join\(' · '\)\}/.test(overviewBar),
    noDot: overviewBar.length > 0 && !/\bdirty=\{/.test(overviewBar),
    oneDefinition: count(app, /const dirtyWords\b/g) === 1 && defAt >= 0 && phoneAt > defAt,
    phone: /phoneHeader\([^)]*, where, dirtyWords\)/.test(app),
  };
  ok('SH27 unsaved work is said in words on the Flight overview, on the desktop bar and in the phone header, from one definition',
     Object.values(says).every(Boolean), `words in the small line ${says.line}, in its tooltip ${says.tooltip}, no dot ${says.noDot}, one definition above the phone branch ${says.oneDefinition}, given to the phone header ${says.phone}`);

  // Save is in File on each screen that has a mission but no Save button: the overview and the front page with a mission
  // open. A File row has no disabled state, so the row is always there. The planner's menu is unchanged (its filled button
  // is Save), and the front page with no mission stays Open and Import.
  // Red when: `saveItem` is taken out of `missionFileItems` (the overview's and the front page's list); or put into the planner's list.
  // Seen: FAIL SH28 Save is a File row on the overview and on the front page while a mission is open, and not in the planner's menu or the front page with no mission  row true, shared list false, overview true, front page true, planner without it true
  //         (saveItem taken out of the shared list)
  //       FAIL SH28 …  row true, shared list true, overview false, front page true, planner without it true
  //         (the overview given a list of its own without it)
  const saveRow = /const saveItem: FileMenuItem = \{\s*id: 'save',\s*label: saveLabel,\s*sub: platform\.isWeb \? 'Download the mission as a \.json file' : 'Save this mission',\s*icon: 'save',\s*onSelect: \(\) => void handleSave\(\),\s*\};/.test(app);
  const lists = {
    row: saveRow && /const saveLabel = platform\.isWeb \? 'Export \.json' : 'Save';/.test(app),
    list: /const missionFileItems: FileMenuItem\[\] = \[saveItem, \.\.\.saveAsItems, openItem, importItem, closeItem\];/.test(app),
    overview: /fileItems: missionFileItems,/.test(overviewBar),
    front: /fileItems: mission \? missionFileItems : \[openItem, importItem\] \}/.test(app),
    planner: /fileItems: \[[\s\S]*?\.\.\.saveAsItems,\s*openItem,\s*importItem,\s*closeItem,\s*\]/.test(plannerBar) && !/saveItem/.test(plannerBar),
  };
  ok('SH28 Save is a File row on the overview and on the front page while a mission is open, and not in the planner\'s menu or the front page with no mission',
     Object.values(lists).every(Boolean), `row ${lists.row}, shared list ${lists.list}, overview ${lists.overview}, front page ${lists.front}, planner without it ${lists.planner}`);

  // The phone's back arrow takes its name from the screen that draws it, so the words live in one place.
  // Red when: PhoneShell's `label={backLabel}` becomes `label="Back to the front page"`; or App stops passing `backLabel={W.backToFront}`.
  // Seen: FAIL SH29 the phone's back arrow is named by what App gives it, and PhoneShell holds no such words of its own  named by the given words false, only with onBack true, no literal in PhoneShell false, App passes W.backToFront true
  //         (the literal put back)
  //       FAIL SH29 …  named by the given words true, only with onBack true, no literal in PhoneShell true, App passes W.backToFront false
  //         (App's `backLabel` line taken out)
  const phoneSrc = read('src/components/phone/PhoneShell.tsx');
  const arrow = html(createElement(PhoneShell<'a'>, { title: 'Venom 1', onBack: noop, backLabel: 'Back to somewhere else', menu: [], children: null }));
  const noArrow = html(createElement(PhoneShell<'a'>, { title: 'Venom 1', backLabel: 'Back to somewhere else', menu: [], children: null }));
  const named = {
    given: arrow.includes('aria-label="Back to somewhere else"') && arrow.includes('title="Back to somewhere else"'),
    onlyWithBack: !noArrow.includes('Back to somewhere else'),
    noLiteral: !/back to the front page/i.test(phoneSrc),
    passed: /backLabel=\{W\.backToFront\}/.test(app),
  };
  ok('SH29 the phone\'s back arrow is named by what App gives it, and PhoneShell holds no such words of its own',
     Object.values(named).every(Boolean), `named by the given words ${named.given}, only with onBack ${named.onlyWithBack}, no literal in PhoneShell ${named.noLiteral}, App passes W.backToFront ${named.passed}`);
}
