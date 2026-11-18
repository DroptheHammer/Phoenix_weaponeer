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
import { PhoneMenuList, PhoneShell } from '../src/components/phone/PhoneShell';
import { BottomSheet } from '../src/components/phone/BottomSheet';
import { plannerRailItems, phoneTabItems, PANEL_TITLES } from '../src/components/shell/railItems';
import { MapZoom } from '../src/components/map/MapZoom';
import { MapCredit, MAP_CREDIT } from '../src/components/map/MapCredit';
import { PlannerShell } from '../src/components/shell/PlannerShell';
import { LayersButton, LegendBox, LegendContent, LegendDock, selectAnythingHidden } from '../src/components/map/MapLegend';
import { useUiStore } from '../src/stores/uiStore';
import { visibleMission } from '../src/lib/threatVisibility';
import type { Attack, ThreatInstance } from '../src/types';
import type { FlightMember } from '../src/types/flight.types';
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
  //         (the phone header's call given `undefined` where `dirtyWords` stands; SH38 goes red with it)
  const defAt = app.search(/const dirtyWords = platform\.isWeb \? 'Not exported' : 'Unsaved changes';/);
  const phoneAt = app.search(/if \(isPhone\) \{/);
  const says = {
    line: /<span className="max-\[959px\]:hidden">\{where\.sub\}\{isDirty \? ' · ' : ''\}<\/span> : null\}\s*\{isDirty \? dirtyWords : null\}/.test(overviewBar),
    tooltip: /subTitle=\{\[where\.sub, isDirty \? dirtyWords : ''\]\.filter\(Boolean\)\.join\(' · '\)\}/.test(overviewBar),
    noDot: overviewBar.length > 0 && !/\bdirty=\{/.test(overviewBar),
    oneDefinition: count(app, /const dirtyWords\b/g) === 1 && defAt >= 0 && phoneAt > defAt,
    phone: /phoneHeader\([^)]*, where, dirtyWords[,)]/.test(app),
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

// ─── The rail's items, the map's zoom and credit, the planner's frame ────────────────────
{
  const counts = { waypoints: 5, visibleThreats: 2, flightMembers: 4, attacks: 2, hiddenAttacks: 0 };
  const items = plannerRailItems(counts);
  const hidden = plannerRailItems({ ...counts, hiddenAttacks: 1 });
  const phone = phoneTabItems(counts);
  // Red when: plannerRailItems gives Threats `count: c.visibleThreats + 1`; or hiddenNote always returns `${n} hidden`.
  // Seen: FAIL SH7 the rail counts waypoints, the threats it is given, …  Waypoints (5) | Threats (3) | Flight (4) | Attacks (2) | Kneeboards   (+ 1)
  //       FAIL SH7 …  Waypoints (5) | Threats (2) | Flight (4) | Attacks (2 · 0 hidden) | Kneeboards   (the note always given)
  ok('SH7 the rail counts waypoints, the threats it is given, jets and attacks, and notes hidden attacks only when there are some; the phone uses its own words',
     items.map((i) => stackedName(i)).join(' | ') === 'Waypoints (5) | Threats (2) | Flight (4) | Attacks (2) | Kneeboards'
       && stackedName(hidden[3]) === 'Attacks (2 · 1 hidden)'
       && phone.map((i) => i.label).join(' ') === 'Route Threats Flight Attacks Cards'
       && Object.values(PANEL_TITLES).join(' ') === 'Waypoints Threats Flight Attacks Kneeboards',
     items.map((i) => stackedName(i)).join(' | '));

  const app = read('src/App.tsx');
  // Red when: App's rail counts become `visibleThreats: mission.threats.length,` (author-hidden threats counted on the rail).
  // Seen: FAIL SH19 the rail counts the visible mission's threats only (author-hidden ones only when revealed in Settings › Admin)  visibleThreats: mission.threats.length
  ok('SH19 the rail counts the visible mission\'s threats only (author-hidden ones only when revealed in Settings › Admin)',
     /visibleThreats: visibleMission\?\.threats\.length \?\? 0/.test(app) && !/visibleThreats:\s*mission\.threats/.test(app),
     /visibleThreats:[^,\n]*/.exec(app)?.[0] ?? 'no visibleThreats line');

  // Red when: the planner branch's `) : shown === 'map' && mission && railCounts ? (` becomes `) : mission && railCounts ? (` (the
  // planner would hang on there being a mission, not on the screen being the map).
  // Seen: FAIL SH21 App draws the planner only through one <PlannerShell>, on the map screen only, and no hand-made rail  rail string false; PlannerShell 1; on the map screen false
  ok('SH21 App draws the planner only through one <PlannerShell>, on the map screen only, and no hand-made rail',
     !/bg-dcs-navy text-gray-300 hover:bg-dcs-blue/.test(app) && count(app, /<PlannerShell\b/g) === 1 && /shown === ["']map["'] && mission && railCounts \? \(\s*<PlannerShell/.test(app) && !/<Tabs\b/.test(app),
     `rail string ${/bg-dcs-navy text-gray-300 hover:bg-dcs-blue/.test(app)}; PlannerShell ${count(app, /<PlannerShell\b/g)}; on the map screen ${/shown === ["']map["'] && mission && railCounts \? \(\s*<PlannerShell/.test(app)}`);

  // The planner's way back to the Flight overview is a back link before the mission's name and the File menu's first row,
  // both calling openOverview; the overview's own bar goes back to the front page and leads with "Open the map".
  const from = app.search(/shown === 'map' && mission\s*\?\s*\{/);
  const plannerBar = from < 0 ? '' : app.slice(from, from + Math.max(0, app.slice(from).search(/: shown === 'overview' && mission/)));
  const back = {
    opens: /const openOverview = \(\) => setScreen\(["']overview["']\);/.test(app),
    link: /<BackLink label="Flight overview" onClick=\{openOverview\} \/>/.test(plannerBar),
    row: /^\s*\{ id: 'overview', label: 'Flight overview', sub: [^\n]*, icon: 'flight', onSelect: openOverview \},$/m.test(plannerBar)
      && /fileItems: \[\s*\{ id: 'overview'/.test(plannerBar),
    overviewBar: /shown === ["']overview["'] && mission/.test(app) && /<BackLink label=\{W\.frontPage\} onClick=\{toFront\} \/>/.test(app) && /<AppBarPrimary icon="map" label=\{W\.openMap\}/.test(app),
  };
  // Red when: App keeps `const openOverview: (() => void) | undefined = undefined;` (the planner has no way back); or the planner bar's
  // `<BackLink label="Flight overview" … />` is taken out; or the File row is.
  // Seen: FAIL SH22 the planner opens the Flight overview (…), and the overview's header …  opens false, back link true, File row true, overview bar true   (left undefined)
  //       FAIL SH22 …  opens true, back link false, File row true, overview bar true   (the back link taken out)
  //       FAIL SH22 …  opens true, back link true, File row false, overview bar true   (the File row taken out)
  ok('SH22 the planner opens the Flight overview (a back link before the mission\'s name, and File\'s first row), and the overview\'s header goes back to the front page and leads with "Open the map"',
     Object.values(back).every(Boolean), `opens ${back.opens}, back link ${back.link}, File row ${back.row}, overview bar ${back.overviewBar}`);

  const mapView = read('src/components/map/MapView.tsx');
  // Red when: `attributionControl={false}` is taken out of MapView (Leaflet's own credit would be drawn beside the app's); or the
  // phone chrome's `<MapZoom` is taken out (the Layers button may stand first in that block, nothing else may); or it is renamed
  // `<MapZoomX` (the name is matched whole, so a longer name does not pass for it).
  // Seen: FAIL SH8 Leaflet's own zoom and attribution are off; MapView draws the app's zoom and credit on a phone  attribution off false; Leaflet zoom false
  //       FAIL SH8 …  attribution off true; Leaflet zoom false   (the phone's zoom renamed away: `<MapZoomX`)
  ok('SH8 Leaflet\'s own zoom and attribution are off; MapView draws the app\'s zoom and credit on a phone',
     /attributionControl=\{false\}/.test(mapView) && /zoomControl=\{false\}/.test(mapView) && !/<ZoomControl/.test(mapView) && /\{isPhone && \(\s*<>\s*(?:<LayersButton[^>]*\/>\s*)?<MapZoom\b[\s\S]*?<MapCredit/.test(mapView),
     `attribution off ${/attributionControl=\{false\}/.test(mapView)}; Leaflet zoom ${/<ZoomControl/.test(mapView)}`);

  // Red when: MAP_CREDIT becomes '© Map data'.
  // Seen: FAIL SH9 the credit names OpenStreetMap's contributors (its licence asks for it); …  <p class="m-0 rounded-ui-md border border-line-strong bg-surface-float px-2.5 py-0.5 …
  const credit = html(createElement(MapCredit));
  const zoom = html(createElement(MapZoom, { map: null }));
  ok('SH9 the credit names OpenStreetMap\'s contributors (its licence asks for it); the zoom is a named group of two 44 px buttons',
     MAP_CREDIT === '© OpenStreetMap contributors' && credit.includes(MAP_CREDIT) && zoom.includes('aria-label="Map zoom"') && zoom.includes('aria-label="Zoom in"') && zoom.includes('aria-label="Zoom out"') && (zoom.match(/size-tap/g) ?? []).length === 2,
     credit.slice(0, 160));

  const make = (activePanel: 'attacks' | null, hidePanel: boolean) =>
    html(createElement(PlannerShell<'attacks'>, {
      map: createElement('div', { id: 'the-map' }),
      leafletMap: null,
      railItems: [{ id: 'attacks', label: 'Attacks', icon: 'attack', count: 2 }],
      activePanel, onPanel: noop, panelTitle: 'Attacks', panel: createElement('p', null, 'panel body'), hidePanel,
      legend: createElement('section', { 'aria-label': 'Legend' }),
    }));
  const shut = make(null, false);
  const shown = make('attacks', false);
  const picking = make('attacks', true);
  // Red when: `hidden={hidePanel}` is dropped from <PanelSheet> in PlannerShell; or the open grid's `_var(--panel-w)]` becomes `_480px]`.
  // Seen: FAIL SH10 the planner: the map under a click-through grid; …  <div class="relative min-h-0 flex-1 overflow-hidden bg-surface-deep"><div cla…   (each of the two changes)
  ok('SH10 the planner: the map under a click-through grid; the rail and then the Legend in the left column; zoom and credit in the middle; the panel in a third column (--panel-w), kept but hidden while a map pick is armed',
     shut.includes('pointer-events-none') && shut.includes('grid-cols-[var(--dock-w)_minmax(0,1fr)]') && !shut.includes('planner-panel-title')
       && /aria-label="Planner panels"[\s\S]*aria-label="Legend"/.test(shut) && shut.includes('aria-label="Map zoom"') && shut.includes(MAP_CREDIT)
       && shown.includes('_var(--panel-w)]') && shown.includes('id="planner-panel-title"') && shown.includes('panel body') && shown.includes('aria-label="Close panel"')
       && picking.includes('panel body') && /<aside[^>]*class="hidden /.test(picking),
     shown.slice(0, 220));

  // Red when: PanelSheet's `entering && 'motion-safe:animate-sheet-in',` becomes `'motion-safe:animate-sheet-in',` (the slide would replay after every map pick).
  // Seen: FAIL SH23 the side panel slides in on its first showing only: …  slide class drawn true; hangs on entering false
  const sheet = read('src/components/shell/PanelSheet.tsx');
  ok('SH23 the side panel slides in on its first showing only: the slide class hangs on `entering`, which the end of the slide and a map pick clear (a source check: the slide itself is CSS)',
     shown.includes('motion-safe:animate-sheet-in') && /entering && ['"]motion-safe:animate-sheet-in['"]/.test(sheet) && /onAnimationEnd=\{settle\}/.test(sheet) && /if \(hidden\) setEntering\(false\)/.test(sheet),
     `slide class drawn ${shown.includes('motion-safe:animate-sheet-in')}; hangs on entering ${/entering && ['"]motion-safe:animate-sheet-in['"]/.test(sheet)}`);
}

// ─── The Legend ──────────────────────────────────────────────────────────────────────────
{
  const resetUi = () => {
    useUiStore.getState().resetFilter();
    useUiStore.getState().setLegendOpen(false);
  };
  // Red when: `legendOpen: false` is added to emptyFilter in uiStore.ts (with `as DisplayFilter`, so it compiles: Open, Import and Close would shut it); or
  // the store starts with `legendOpen: true`.
  // Seen: FAIL SH11 the Legend starts closed and stays as the planner left it through New, Open, Import, Close and Show all  starts closed true, kept false   (in emptyFilter)
  //       FAIL SH11 …  starts closed false, kept true   (the store starting open; SH12 goes red with it)
  // The initial state is read before anything else in this run could have set the flag.
  const startsClosed = useUiStore.getInitialState().legendOpen === false;
  resetUi();
  useUiStore.getState().setLegendOpen(true);
  useUiStore.getState().resetFilter();
  useUiStore.getState().showAll();
  const kept = useUiStore.getState().legendOpen;
  resetUi();
  ok('SH11 the Legend starts closed and stays as the planner left it through New, Open, Import, Close and Show all', startsClosed && kept === true, `starts closed ${startsClosed}, kept ${kept}`);

  const member = (id: string, callsign: string) => ({ id, callsign, position: 1, role: 'wingman', aircraftId: 'f16c', loadout: [] }) as unknown as FlightMember;
  const attack = (id: string, attackerId: string) => ({ id, attackerId }) as unknown as Attack;
  const threat = (id: string, source: 'mission' | 'planning', flags: { hiddenOnPlanner?: boolean; hiddenOnMap?: boolean } = {}) => ({ id, source, ...flags }) as unknown as ThreatInstance;
  const props = { attacks: [attack('a1', 'm1')], flightMembers: [member('m1', 'Testcall 1-1')], threats: [threat('t1', 'mission'), threat('t2', 'planning'), threat('t3', 'planning')] };
  // A store-connected component renders its store's initial state on the server (zustand 5), so the open and filtered
  // looks go through LegendBox, which takes them as props; LegendDock, connected, is rendered once to prove the app
  // starts with the Legend closed.
  const content = createElement(LegendContent, props);
  const dock = html(createElement(LegendDock, props));
  const closed = html(createElement(LegendBox, { open: false, filtered: false, onOpenChange: noop }, content));
  const open = html(createElement(LegendBox, { open: true, filtered: false, onOpenChange: noop }, content));
  const filtered = html(createElement(LegendBox, { open: false, filtered: true, onOpenChange: noop }, content));
  // Red when: LegendBox's `open ? 'w-legend' : 'min-w-dock'` becomes `'w-legend'`; or uiStore starts with `legendOpen: true`; or
  // `aria-controls={open ? 'map-legend-body' : undefined}` becomes `aria-controls="map-legend-body"` (it would name a body that is not there).
  // Seen: FAIL SH12 closed (as the app starts), the Legend is one button …  <section aria-label="Legend" class="rounded-ui-lg border border-line-strong bg-surface-float shadow-ui-2 pointer-events-auto flex min-h-0 shrink flex-col-reverse overflow-hidden w-legend"><button type…   (the width)
  //       FAIL SH12 …  <section aria-label="Legend" class="… overflow-hidden min-w-dock"><button ty…   (the store starting open, or aria-controls always set)
  ok('SH12 closed (as the app starts), the Legend is one button ("Legend", aria-expanded false, no aria-controls), the rail\'s width, on the floating material, with no key or filters drawn',
     dock === closed && closed.includes('aria-expanded="false"') && !closed.includes('aria-controls') && />Legend</.test(closed) && closed.includes('min-w-dock') && closed.includes('bg-surface-float')
       && !closed.includes('id="map-legend-body"') && !closed.includes('Mission ('),
     closed.slice(0, 200));
  // Red when: LegendBox's `flex-col-reverse` becomes `flex-col` (the button would jump to the top of the box).
  // Seen: FAIL SH13 open, it is one box --legend-w wide, its button at the bottom, …  <section aria-label="Legend" class="rounded-ui-lg border border-line-strong bg-surface-float shadow-ui-2 pointer-events-auto flex min-h-0 shrink flex-col overflow-hidden w-legend"><button type="button…
  ok('SH13 open, it is one box --legend-w wide, its button at the bottom, the key and the Attacks, Threats and Route filters above it, scrolling inside',
     open.includes('aria-expanded="true"') && open.includes('aria-controls="map-legend-body"') && open.includes('w-legend') && open.includes('flex-col-reverse') && open.includes('id="map-legend-body"') && open.includes('overflow-y-auto')
       && open.includes('Testcall 1-1 · 1 attack') && open.includes('Route &amp; waypoints') && open.includes('>Target<') && open.includes('>Bullseye<'),
     open.slice(0, 200));
  // Red when: the `· filtered` span is taken out of LegendBox.
  // Seen: FAIL SH14 with a layer hidden, the closed button says "Legend · filtered" in words  <section aria-label="Legend" class="rounded-ui-lg border border-line-strong bg-surface-float shadow-ui-2 pointer-events-auto flex min-h-0 shrink flex-col-reverse overflow-hidden min-w-dock"><button ty…
  ok('SH14 with a layer hidden, the closed button says "Legend · filtered" in words', filtered.includes('· filtered') && filtered.includes('title="Some layers are hidden"'), filtered.slice(0, 200));
  // Red when: App passes `threats={mission.threats}` to <LegendDock>.
  // Seen: FAIL SH15 the threat counts are the threats the Legend is given, and App gives it the visible mission's (author-hidden ones only if revealed in Settings › Admin)  Mission (1) Planning (2)   (App's line; the counts alone stay as they were)
  const counted = html(content);
  const app = read('src/App.tsx');
  ok('SH15 the threat counts are the threats the Legend is given, and App gives it the visible mission\'s (author-hidden ones only if revealed in Settings › Admin)',
     counted.includes('Mission (1)') && counted.includes('Planning (2)') && /<LegendDock[^>]*threats=\{visibleMission\?\.threats \?\? \[\]\}/.test(app) && !/<LegendDock[^>]*mission\.threats/.test(app),
     `${/Mission \(\d+\)/.exec(counted)?.[0]} ${/Planning \(\d+\)/.exec(counted)?.[0]}`);

  // The closed button says "filtered" when anything the Legend can filter is off, so the answer has to follow every one of its
  // filters: a jet, a flight, the mission's threats, the planning threats, and the route.
  const store = useUiStore.getState();
  const selectAnythingHiddenNow = () => selectAnythingHidden(useUiStore.getState());
  const wasHidden = (act: () => void) => {
    resetUi();
    act();
    const hidden = selectAnythingHiddenNow();
    useUiStore.getState().showAll();
    return hidden && !selectAnythingHiddenNow();
  };
  const filters: [string, () => void][] = [
    ['a jet', () => store.toggleAttacker('m1')],
    ['a flight', () => store.toggleFlight(['m1', 'm2'])],
    ['the mission threats', () => store.toggleThreatSource('mission')],
    ['the planning threats', () => store.toggleThreatSource('planning')],
    ['the route', () => store.toggleRoute()],
  ];
  const noticed = filters.map(([name, act]) => `${name} ${wasHidden(act)}`);
  const startsPlain = !selectAnythingHiddenNow();
  resetUi();
  // Red when: selectAnythingHidden's `|| s.routeHidden` is taken out (a hidden route would leave the button saying nothing).
  // Seen: FAIL SH30 the closed Legend says "filtered" for every filter it has (a jet, a flight, the mission threats, the planning threats, the route), and Show all clears it  starts plain true; a jet true, a flight true, the mission threats true, the planning threats true, the route false
  ok('SH30 the closed Legend says "filtered" for every filter it has (a jet, a flight, the mission threats, the planning threats, the route), and Show all clears it',
     startsPlain && noticed.every((line) => line.endsWith('true')), `starts plain ${startsPlain}; ${noticed.join(', ')}`);

  // Every filter the old Legend had is still there, ticked as the store says and wired to the same store action, and "Show all"
  // is offered only when something is hidden (a source check: a checkbox's click needs a browser, and web-smoke presses them).
  const legendSrc = read('src/components/map/MapLegend.tsx');
  const wired = {
    boxes: count(open, /type="checkbox"/g) === 5,
    flight: /checked=\{hiddenCount === 0\} indeterminate=\{hiddenCount > 0 && hiddenCount < memberIds\.length\} onChange=\{\(\) => toggleFlight\(memberIds\)\}/.test(legendSrc),
    jet: /checked=\{!hiddenAttackerIds\.includes\(m\.id\)\} onChange=\{\(\) => toggleAttacker\(m\.id\)\}/.test(legendSrc),
    mission: /checked=\{!hiddenThreatSources\.includes\('mission'\)\} onChange=\{\(\) => toggleThreatSource\('mission'\)\}/.test(legendSrc),
    planning: /checked=\{!hiddenThreatSources\.includes\('planning'\)\} onChange=\{\(\) => toggleThreatSource\('planning'\)\}/.test(legendSrc),
    route: /<TriCheckbox checked=\{!routeHidden\} onChange=\{toggleRoute\} \/>/.test(legendSrc),
    showAll: /\{anythingHidden && \(\s*<div[^>]*>\s*<Button variant="text" onClick=\{showAll\}>\s*Show all\s*<\/Button>/.test(legendSrc) && !/Show all/.test(open),
  };
  // Red when: the planning threats' `toggleThreatSource('planning')` becomes `toggleThreatSource('mission')`; or the route's box is taken out.
  // Seen: FAIL SH31 every filter the old Legend had is still there and wired to the same store action: …  boxes true, flight true, jet true, mission true, planning false, route true, Show all when something is hidden true   (planning wired to the mission threats)
  //       FAIL SH31 …  boxes false, flight true, jet true, mission true, planning true, route false, Show all when something is hidden true   (the route's box taken out)
  ok('SH31 every filter the old Legend had is still there and wired to the same store action: a flight, a jet, the mission and planning threats, the route, and Show all only while something is hidden',
     Object.values(wired).every(Boolean),
     `boxes ${wired.boxes}, flight ${wired.flight}, jet ${wired.jet}, mission ${wired.mission}, planning ${wired.planning}, route ${wired.route}, Show all when something is hidden ${wired.showAll}`);

  // Threats the mission author hid are never listed or counted. The Legend counts what it is given, so this feeds it the way
  // the app does (the visible mission) and proves a hidden threat leaves no trace in what it draws, and a revealed one counts.
  const hiddenFixture = [threat('h1', 'mission'), threat('h2', 'mission', { hiddenOnPlanner: true }), threat('h3', 'mission', { hiddenOnMap: true }), threat('h4', 'planning')];
  const withoutHidden = hiddenFixture.filter((t) => t.id === 'h1' || t.id === 'h4');
  const none = { onPlanner: false, onMap: false };
  const legendFor = (threats: ThreatInstance[]) => html(createElement(LegendContent, { ...props, threats }));
  const asTheAppFeeds = (reveal: { onPlanner: boolean; onMap: boolean }) => legendFor(visibleMission({ threats: hiddenFixture }, reveal).threats);
  const unrevealed = asTheAppFeeds(none);
  const same = unrevealed === legendFor(visibleMission({ threats: withoutHidden }, none).threats);
  const counts = [unrevealed, asTheAppFeeds({ onPlanner: true, onMap: false }), asTheAppFeeds({ onPlanner: true, onMap: true })].map((text) => /Mission \((\d+)\)/.exec(text)?.[1]).join(',');
  // Red when: the Legend's `Mission ({missionThreatCount})` becomes `Mission ({threats.length})` (the planning threat is counted as a mission one).
  // Seen: FAIL SH32 a threat the mission author hid leaves no trace in the Legend (it reads the same as for a mission without it), and a revealed one counts like any other  same as the mission without them true; mission counts 2,3,4 (want 1,2,3)   (SH15 goes red with it)
  ok('SH32 a threat the mission author hid leaves no trace in the Legend (it reads the same as for a mission without it), and a revealed one counts like any other',
     same && counts === '1,2,3' && /Planning \(1\)/.test(unrevealed), `same as the mission without them ${same}; mission counts ${counts} (want 1,2,3)`);

  // The desktop draws its Legend once, in the planner's left column; the phone's Layers button is MapView's own and is given
  // the same visible threats. Shut, the Layers button is one button; open, its panel is a dialog named "Layers".
  const mapViewSrc = read('src/components/map/MapView.tsx');
  const layers = html(createElement(LayersButton, props));
  const mapViewTag = app.slice(Math.max(0, app.indexOf('<MapView')), Math.max(0, app.indexOf('/>', app.indexOf('<MapView'))));
  const phoneLegend = {
    once: count(app, /<LegendDock\b/g) === 1 && /legend=\{<LegendDock\b/.test(app) && !/<MapLegend\b/.test(mapViewSrc) && !/import \{ MapLegend \}/.test(mapViewSrc) && !/<LegendDock\b/.test(mapViewSrc),
    shut: layers.includes('aria-expanded="false"') && />Layers</.test(layers) && !layers.includes('role="dialog"') && layers.includes('font-sans') && layers.includes('top-3'),
    panel: /role="dialog"\s+aria-label="Layers"/.test(legendSrc) && /<div\s+className="pointer-events-auto min-h-0 w-\[min\(var\(--legend-w\),calc\(100vw-1\.5rem\)\)\]/.test(legendSrc),
    first: /\{isPhone && \(\s*<>\s*<LayersButton attacks=\{attacks\} flightMembers=\{flightMembers\} threats=\{threats\} \/>\s*<MapZoom\b/.test(mapViewSrc),
    visible: /threats=\{visibleMission\?\.threats \?\? \[\]\}/.test(mapViewTag) && !/threats=\{mission\.threats\}/.test(mapViewTag),
  };
  // Red when: App's `<MapView … threats={visibleMission?.threats ?? []}` becomes `threats={mission.threats}` (the phone's Layers panel would count the hidden ones); or
  // MapView draws `<MapLegend … />` again (a second Legend on the desktop), or a `<LegendDock … />` (the same second Legend by its other name);
  // or the panel loses its `min-h-0` (it runs past the map's bottom); or the phone chrome's `<MapZoom` is renamed `<MapZoomX` (matched whole).
  // Seen: FAIL SH33 the desktop draws its Legend once, in the planner's left column; …  Legend once true, shut true, panel true, first true, visible threats false   (App's MapView given mission.threats)
  //       FAIL SH33 …  Legend once false, shut true, panel true, first true, visible threats true   (a `<MapLegend … />` line put back; also a `<LegendDock … />` line in MapView)
  //       FAIL SH33 …  Legend once true, shut true, panel false, first true, visible threats true   (`min-h-0` taken out of the panel)
  //       FAIL SH33 …  Legend once true, shut true, panel true, first false, visible threats true   (`<MapZoomX`)
  ok('SH33 the desktop draws its Legend once, in the planner\'s left column; the phone\'s Layers button is the first thing in MapView\'s phone chrome, shut it is one button, open its panel is a dialog named "Layers" that fits the map, and it is given the visible threats',
     Object.values(phoneLegend).every(Boolean),
     `Legend once ${phoneLegend.once}, shut ${phoneLegend.shut}, panel ${phoneLegend.panel}, first ${phoneLegend.first}, visible threats ${phoneLegend.visible}`);
}

// ─── The phone shell, and no word about hidden threats anywhere in the shell ─────────────
{
  const phone = html(createElement(PhoneShell<'waypoints' | 'kneeboards'>, {
    title: 'Testcall 1 - Test', subtitle: 'Nevada (NTTR) · Not exported', dirty: true, menu: [{ label: 'Export .json', icon: 'file', onClick: noop }],
    tabs: [{ id: 'waypoints', label: 'Route', icon: 'route', count: 5 }, { id: 'kneeboards', label: 'Cards', icon: 'card' }],
    activeTab: null, onTab: noop, children: createElement('div', { id: 'page' }),
  }));
  const overview = html(createElement(PhoneShell<'waypoints'>, {
    title: 'Venom 1 · 4 × F-16C Viper', subtitle: 'Copper Anvil · Nevada (NTTR)', onBack: noop, backLabel: 'Back to the front page', menu: [], children: createElement('div'),
  }));
  // Red when: PhoneShell's `<IconButton icon="more" label="Menu"` becomes `label="More"`; or the `{subtitle ? <p …>{subtitle}</p> : null}` line is taken out
  // (the overview loses its second line); or the `{onBack ? <IconButton icon="chev-left" … /> : null}` line is (no back arrow); or the bar's `variant="bar"` becomes
  // `variant="pills"` (no `var(--safe-bottom)`, no `min-h-tab`, no names).
  // Seen: FAIL SH16 the phone keeps its layout: top bar with the title, its second line, the back arrow, the unsaved dot (named) and "Menu"; the page; the bottom bar of tabs clear of the home bar, named "Route (5)", "Cards"  <div class="flex h-[100dvh] flex-col overflow-hidden bg-surface-window text-ink"><header class="z-[1200] flex min-h-[calc(var(--bar)+var(--safe-top))] shrink-0 items-center gap-3 border-b border-line-…
  //       (each of the four changes; SH29 goes red with the back arrow's, SH34 with the pills)
  ok('SH16 the phone keeps its layout: top bar with the title, its second line, the back arrow, the unsaved dot (named) and "Menu"; the page; the bottom bar of tabs clear of the home bar, named "Route (5)", "Cards"',
     phone.includes('aria-label="Menu"') && phone.includes('aria-label="unsaved changes"') && phone.includes('>Nevada (NTTR) · Not exported</p>') && phone.includes('var(--safe-bottom)') && phone.includes('min-h-tab')
       && phone.includes('aria-label="Route (5)"') && phone.includes('aria-label="Cards"') && phone.indexOf('id="page"') < phone.indexOf('aria-label="Route (5)"')
       && overview.includes('aria-label="Back to the front page"') && overview.includes('>Copper Anvil · Nevada (NTTR)</p>') && !phone.includes('Back to the front page'),
     phone.slice(0, 200));

  const files = ['src/App.tsx', 'src/components/shell/AppBar.tsx', 'src/components/shell/FileMenu.tsx', 'src/components/shell/PlannerShell.tsx', 'src/components/shell/PanelSheet.tsx',
    'src/components/shell/railItems.ts', 'src/components/map/MapLegend.tsx', 'src/components/phone/PhoneShell.tsx', 'src/components/phone/BottomSheet.tsx'];
  // Red when: "<span>Probable threats</span>" is written into MapLegend.tsx (or such words, or a hidden-threat counter, into any file here).
  // Seen: FAIL SH17 the shell never shows, counts or hints at threats the mission author hid (no such words, no hidden-threat counter)  src/components/map/MapLegend.tsx
  //       FAIL SH17 …  src/components/phone/PhoneShell.tsx   (a line `// isHiddenByAuthor` put into the phone shell)
  const hits = files.filter((f) => /probable threat|probableThreats|probableCount|location unknown|hidden by the mission author|hiddenCounts|isHiddenByAuthor/i.test(read(f)));
  ok('SH17 the shell never shows, counts or hints at threats the mission author hid (no such words, no hidden-threat counter)', hits.length === 0, hits.join(', '));

  // The phone's bottom bar: every tab an icon with its count as a badge and its note as a line, named by word, count
  // and note, and the open one alone in the accent (a tab with no panel open has none).
  const bar = (activeTab: 'attacks' | null) => html(createElement(PhoneShell<'waypoints' | 'threats' | 'flight' | 'attacks' | 'kneeboards'>, {
    title: 'Testcall 1 - Test', menu: [], tabs: phoneTabItems({ waypoints: 5, visibleThreats: 2, flightMembers: 4, attacks: 2, hiddenAttacks: 1 }),
    activeTab, onTab: noop, children: null,
  }));
  const tabsOf = (markup: string) => (markup.match(/<button[^>]*aria-pressed[^>]*>/g) ?? []);
  const withOpen = tabsOf(bar('attacks'));
  const lit = withOpen.filter((tag) => tag.includes('aria-pressed="true"'));
  const names = withOpen.map((tag) => /aria-label="([^"]*)"/.exec(tag)?.[1]).join(' | ');
  const noneOpen = tabsOf(bar(null));
  const badges = ['>5</span>', '>2</span>', '>4</span>'].every((badge) => bar(null).includes(badge));
  // Red when: PhoneShell's `selected={activeTab}` becomes `selected={null}` (no tab is lit while its sheet is open); or the Tabs bar's `bg-accent` leaves
  // its open style; or `variant="bar"` becomes `variant="pills"` (no icons, no badges, plain names).
  // Seen: FAIL SH34 the phone's bottom bar is five icon tabs named by word, count and note ("Attacks (2 · 1 hidden)"), the count as a badge and the note a line, and only the open tab is in the accent  names Route (5) | Threats (2) | Flight (4) | Attacks (2 · 1 hidden) | Cards; lit 0; none lit when none open true; badges true; note true   (`selected={null}`)
  //       FAIL SH34 …  names  |  |  |  | ; lit 1; none lit when none open true; badges false; note false   (the pills)
  ok('SH34 the phone\'s bottom bar is five icon tabs named by word, count and note ("Attacks (2 · 1 hidden)"), the count as a badge and the note a line, and only the open tab is in the accent',
     names === 'Route (5) | Threats (2) | Flight (4) | Attacks (2 · 1 hidden) | Cards' && lit.length === 1 && lit[0].includes('Attacks (2 · 1 hidden)') && lit[0].includes('bg-accent')
       && !withOpen.filter((tag) => !tag.includes('aria-pressed="true"')).some((tag) => tag.includes('bg-accent'))
       && noneOpen.every((tag) => tag.includes('aria-pressed="false"')) && badges && bar(null).includes('>1 hidden</span>'),
     `names ${names}; lit ${lit.length}; none lit when none open ${noneOpen.every((tag) => tag.includes('aria-pressed="false"'))}; badges ${badges}; note ${bar(null).includes('>1 hidden</span>')}`);

  // The menu is a list of icon rows, and App's rows keep their words and each get their icon. The open menu is drawn through its own
  // piece (the shell opens it on a tap); App's rows are read from its source, one `{ label: …` object at a time.
  const menu = html(createElement(PhoneMenuList, { items: [{ label: 'Export .json', icon: 'file', onClick: noop }, { label: 'Close mission', icon: 'close', onClick: noop }, { label: 'Plain row', onClick: noop }], onPick: noop }));
  const rows = {
    drawn: count(menu, /role="menuitem"/g) === 3 && count(menu, /<svg\b/g) === 2 && /<svg[\s\S]*?<\/svg><\/span>Export \.json<\/button>/.test(menu) && /<button[^>]*role="menuitem"[^>]*>Plain row<\/button>/.test(menu),
    menuOf: /role="menu"/.test(menu) && menu.includes('w-menu') && menu.includes('min-h-12'),
  };
  const app = read('src/App.tsx');
  const menuSrc = app.slice(Math.max(0, app.indexOf('const strikeItem')), Math.max(0, app.indexOf('const header = phoneHeader(')));
  const wanted = [
    ["W.strikeNearMe", 'pin'], ["'Settings'", 'settings'], ['W.heroTitle', 'folder'], ['W.createNew', 'plus'], ["'Export .json'", 'file'], ["'Close mission'", 'close'], ["'Flight overview'", 'flight'],
  ];
  const withoutIcon = (menuSrc.match(/\{ label: [^,]+, (?!icon: )/g) ?? []);
  const missing = wanted.filter(([label, icon]) => !new RegExp(`\\{ label: ${label.replace(/[.()']/g, '\\$&')}, icon: '${icon}'`).test(menuSrc));
  const appRows = { count: count(menuSrc, /\{ label: /g) === 9, allIcons: withoutIcon.length === 0, wanted: missing.length === 0 };
  // Red when: PhoneMenuList's `{item.icon ? (<span …><Icon name={item.icon} /></span>) : null}` is taken out (the rows lose their icons); or one of App's rows loses
  // its `icon: '…'` (a row with no icon); or a row's words change (the wanted list no longer finds it).
  // Seen: FAIL SH35 the phone's menu is a list of icon rows: each row draws its icon before its label, and App's nine rows keep their words and each has one  drawn false, a menu true; App's rows: 9 of 9 rows, without an icon none, words with their icon: none missing   (the icon taken out of PhoneMenuList)
  //       FAIL SH35 …  drawn true, a menu true; App's rows: 9 of 9 rows, without an icon { label: W.createNew, , words with their icon: none missing   (the icon taken off the overview menu's "Create new mission" row)
  //       FAIL SH35 …  drawn true, a menu true; App's rows: 9 of 9 rows, without an icon none, words with their icon: 'Export .json'→file   (that row worded "Export")
  ok('SH35 the phone\'s menu is a list of icon rows: each row draws its icon before its label, and App\'s nine rows keep their words and each has one',
     rows.drawn && rows.menuOf && appRows.count && appRows.allIcons && appRows.wanted,
     `drawn ${rows.drawn}, a menu ${rows.menuOf}; App's rows: ${count(menuSrc, /\{ label: /g)} of 9 rows, without an icon ${withoutIcon.join(' ') || 'none'}, words with their icon: ${missing.map(([l, i]) => `${l}→${i}`).join(', ') || 'none missing'}`);

  // The phone's tabs come from the same counts as the desktop rail (railCounts, which count only the threats the planner may see), not a list of their own.
  // Red when: App's `const phoneTabs = railCounts ? phoneTabItems(railCounts) : [];` becomes a list of its own (`mission ? [{ id: 'threats', …, count: mission.threats.length }] : []`).
  // Seen: FAIL SH36 the phone's tabs are made from the rail's counts (the visible mission's threats), not counted again in App  from railCounts false, no list of its own true
  ok('SH36 the phone\'s tabs are made from the rail\'s counts (the visible mission\'s threats), not counted again in App',
     /const phoneTabs = railCounts \? phoneTabItems\(railCounts\) : \[\];/.test(app) && !/\bbadge:/.test(app) && !/PhoneTab\b/.test(app),
     `from railCounts ${/const phoneTabs = railCounts \? phoneTabItems\(railCounts\) : \[\];/.test(app)}, no list of its own ${!/\bbadge:/.test(app) && !/PhoneTab\b/.test(app)}`);

  // The sheet's head and handle: a dialog named by its tab, a 96 x 44 handle that is a button (named Expand or Shrink, reachable by keyboard, switched by Enter or
  // Space), a title and a close button named "Close {title}"; it opens at the height it is given, and a hidden sheet is kept.
  const sheet = (props: { initialSnap?: 'half' | 'full'; hidden?: boolean }) => html(createElement(BottomSheet, { title: 'Threats', onClose: noop, ...props }, createElement('p', null, 'body')));
  const half = sheet({});
  const full = sheet({ initialSnap: 'full' });
  const away = sheet({ hidden: true });
  const sheetSrc = read('src/components/phone/BottomSheet.tsx');
  const handleTag = /<div[^>]*role="button"[^>]*>/.exec(half)?.[0] ?? '';
  const head = {
    dialog: half.includes('role="dialog"') && half.includes('aria-label="Threats"') && half.includes('>Threats</h2>') && half.includes('aria-label="Close Threats"'),
    handle: /\bh-tap\b/.test(handleTag) && /\bw-24\b/.test(handleTag),
    focusable: handleTag.includes('tabindex="0"') && /onKeyDown=\{onKeyDown\}/.test(sheetSrc) && /if \(event\.key !== 'Enter' && event\.key !== ' '\) return;/.test(sheetSrc),
    // 0.55 * 100 is 55.00000000000001 in floating point, which the browser takes as 55%.
    heights: half.includes('aria-label="Expand"') && /height:55(\.\d+)?%/.test(half) && full.includes('aria-label="Shrink"') && full.includes('height:100%'),
    kept: /class="[^"]*\shidden"/.test(away) && !/class="[^"]*\shidden"/.test(half) && away.includes('body'),
  };
  // Red when: the handle's `tabIndex={0}` is taken out (a keyboard cannot reach it); or `h-tap w-24` becomes `h-4 w-12` (a small target); or `Close ${title}` loses its name;
  // or the Enter/Space line is taken out of the key handler.
  // Seen: FAIL SH37 the sheet's head and handle: a dialog named by its tab, a 96 x 44 handle button the keyboard reaches and switches, a close button named "Close {title}", the height it is given, kept when hidden  dialog true, 96 x 44 handle true, keyboard false, heights true, kept when hidden true   (`tabIndex={0}` taken out; and the Enter/Space line)
  //       FAIL SH37 …  dialog true, 96 x 44 handle false, keyboard true, heights true, kept when hidden true   (`h-4 w-12`)
  //       FAIL SH37 …  dialog false, 96 x 44 handle true, keyboard true, heights true, kept when hidden true   (the close button named "Close")
  ok('SH37 the sheet\'s head and handle: a dialog named by its tab, a 96 x 44 handle button the keyboard reaches and switches, a close button named "Close {title}", the height it is given, kept when hidden',
     Object.values(head).every(Boolean),
     `dialog ${head.dialog}, 96 x 44 handle ${head.handle}, keyboard ${head.focusable}, heights ${head.heights}, kept when hidden ${head.kept}`);

  // The map's second line on the phone says where the mission is planned, in the words the desktop bar uses: App works the place out once and gives it to
  // both the planner's bar and the phone's header (the header helper's own rule for what the line says is landing-check's H3).
  const placeOnce = count(app, /const place = mission \? \(isRealWorld\(mission\) \? 'Real world' : theaterInfo\?\.display_name \?\? ''\) : '';/g) === 1;
  const placeToPhone = /phoneHeader\([^)]*, where, dirtyWords, place\)/.test(app);
  const placeToDesktop = /subTitle=\{\[place, isDirty \? dirtyWords : ''\]\.filter\(Boolean\)\.join\(' · '\)\}/.test(app);
  // Red when: the phone header's call loses its last argument (`, dirtyWords, place);` becomes `, dirtyWords);`: the map's second line is gone).
  // Seen: FAIL SH38 the phone's map header is given the same place the planner's bar names ("Nevada (NTTR)", "Real world"), worked out once  worked out once true, given to the phone header false, named in the planner's bar true
  ok('SH38 the phone\'s map header is given the same place the planner\'s bar names ("Nevada (NTTR)", "Real world"), worked out once',
     placeOnce && placeToPhone && placeToDesktop, `worked out once ${placeOnce}, given to the phone header ${placeToPhone}, named in the planner's bar ${placeToDesktop}`);

  // The phone's tab bar has no hover tint: a touch screen keeps the tab that was last tapped in the hover state, so the tint stayed on
  // it. A press still shows (`active:bg-tint-2`). The side rail is a mouse's, so it keeps its hover.
  const tabItems = [{ id: 'a' as const, label: 'Route', icon: 'route' as const, count: 5 }, { id: 'b' as const, label: 'Cards', icon: 'card' as const }];
  const barTabs = html(createElement(Tabs<'a' | 'b'>, { variant: 'bar', label: 'Planner panels', selected: 'a', onSelect: noop, items: tabItems }));
  const railTabs = html(createElement(Tabs<'a' | 'b'>, { variant: 'rail', label: 'Planner panels', selected: 'a', onSelect: noop, items: tabItems }));
  const tints = {
    barNoHover: !/hover:/.test(barTabs),
    // The tab that is off is the one the tint is for (the lit one is the accent).
    barPress: /aria-pressed="false"[^>]*class="[^"]*\bactive:bg-tint-2\b/.test(barTabs),
    railHover: /aria-pressed="false"[^>]*class="[^"]*\bhover:bg-tint-2\b/.test(railTabs),
  };
  // Red when: Tabs' bar `off:` style gets `hover:bg-tint-2` back; or loses `active:bg-tint-2`; or the rail's `hover:bg-tint-2` is taken out.
  // Seen: FAIL SH39 the phone's tab bar has no hover tint (a touch screen would leave it on the last tab tapped) but still tints under a press, and the side rail keeps its hover  no hover on the bar false, press tint on the bar true, hover on the rail true   (the hover put back)
  //       FAIL SH39 …  no hover on the bar true, press tint on the bar false, hover on the rail true   (`active:bg-tint-2` taken out)
  //       FAIL SH39 …  no hover on the bar true, press tint on the bar true, hover on the rail false   (the rail's hover taken out)
  ok('SH39 the phone\'s tab bar has no hover tint (a touch screen would leave it on the last tab tapped) but still tints under a press, and the side rail keeps its hover',
     tints.barNoHover && tints.barPress && tints.railHover,
     `no hover on the bar ${tints.barNoHover}, press tint on the bar ${tints.barPress}, hover on the rail ${tints.railHover}`);

  // The phone's Menu has the File menu's keyboard, run by the same rule (menuKey, imported, not copied; SH26 runs the rule itself) and
  // wired here: opening puts the keyboard on the first row; Up, Down, Home and End move through menuKey; Escape is heard on the window
  // while the menu is open and puts the keyboard back on Menu; Tab shuts it and moves on; a tap outside still shuts it. The wiring is read
  // from the source, as SH26 reads the File menu's.
  const phoneShellSrc = read('src/components/phone/PhoneShell.tsx');
  const keyed = {
    reused: /import \{ menuKey \} from '\.\.\/shell\/FileMenu';/.test(phoneShellSrc) && !/key === '(Escape|ArrowDown|ArrowUp|Home|End|Tab)'/.test(phoneShellSrc),
    first: /menuRows\(\)\[0\]\?\.focus\(\);/.test(phoneShellSrc),
    arrows: /<div className="relative" ref=\{menuRef\} onKeyDown=\{onMenuKeyDown\}>/.test(phoneShellSrc) && /const action = menuKey\(event\.key, at, rows\.length\);/.test(phoneShellSrc)
      && /if \('focus' in action\) \{\s*event\.preventDefault\(\);\s*rows\[action\.focus\]\?\.focus\(\);/.test(phoneShellSrc),
    tab: /else if \(action\.close === 'move-on'\) closeMenu\(false\);/.test(phoneShellSrc),
    escape: /const closeMenu = \(refocus: boolean\) => \{\s*setMenuOpen\(false\);\s*if \(refocus\) menuButton\.current\?\.focus\(\);\s*\};/.test(phoneShellSrc) && /<IconButton ref=\{menuButton\} icon="more" label="Menu"/.test(phoneShellSrc)
      && /window\.addEventListener\('keydown', onEscape\);/.test(phoneShellSrc) && /window\.removeEventListener\('keydown', onEscape\);/.test(phoneShellSrc)
      && /const onEscape = [^\n]*\{\s*const action = menuKey\(event\.key, -1, 0\);\s*if \(action && 'close' in action && action\.close === 'to-button'\) \{\s*event\.preventDefault\(\);\s*closeMenu\(true\);/.test(phoneShellSrc),
    outside: /if \(!menuRef\.current\?\.contains\(event\.target as Node\)\) setMenuOpen\(false\);/.test(phoneShellSrc) && /window\.addEventListener\('pointerdown', onDown\);/.test(phoneShellSrc),
  };
  // Red when: the Escape handler's `closeMenu(true)` becomes `closeMenu(false)` (the keyboard would not go back to Menu); or the arrows' `menuKey(event.key, at, rows.length)`
  // becomes a rule of the file's own (`ownKey(event.key, at, rows.length)`); or the open effect's `menuRows()[0]?.focus();` is taken out; or Tab's
  // `else if (action.close === 'move-on') closeMenu(false);` is; or the window's Escape (`window.addEventListener('keydown', onEscape);`) is.
  // Seen: FAIL SH40 the phone's Menu has the File menu's keyboard: …  rule imported, not copied true, first row on open true, arrows through menuKey true, Tab true, Escape back to Menu false, tap outside true   (`closeMenu(false)`)
  //       FAIL SH40 …  rule imported, not copied true, first row on open true, arrows through menuKey false, Tab true, Escape back to Menu true, tap outside true   (`ownKey`)
  //       FAIL SH40 …  rule imported, not copied true, first row on open false, arrows through menuKey true, Tab true, Escape back to Menu true, tap outside true   (the first-row focus taken out)
  //       FAIL SH40 …  rule imported, not copied true, first row on open true, arrows through menuKey true, Tab false, Escape back to Menu true, tap outside true   (Tab's close taken out)
  //       FAIL SH40 …  rule imported, not copied true, first row on open true, arrows through menuKey true, Tab true, Escape back to Menu false, tap outside true   (the window's Escape taken out)
  ok('SH40 the phone\'s Menu has the File menu\'s keyboard: opening puts the keyboard on the first row, Up, Down, Home and End move through menuKey (imported, not copied), Escape shuts it from wherever the keyboard is and puts it back on Menu, Tab shuts it and moves on, and a tap outside still shuts it',
     Object.values(keyed).every(Boolean),
     `rule imported, not copied ${keyed.reused}, first row on open ${keyed.first}, arrows through menuKey ${keyed.arrows}, Tab ${keyed.tab}, Escape back to Menu ${keyed.escape}, tap outside ${keyed.outside}`);
}

// ─── The small dialogs' buttons ──────────────────────────────────────────────────────────
{
  // The unsaved-changes dialog, the update banner and the error screen draw their buttons with the shared Button, so they have the same
  // colours, sizes and focus look as every other button and not a blue or accent button of their own. These three are read as source:
  // a dialog drawn into the page's body and the banner's waiting state cannot be rendered without a browser.
  // Red when: UpdateBanner's Reload goes back to a hand-made `<button … className="… bg-dcs-accent …">` (or any of the three files to `bg-dcs-blue` / `bg-dcs-accent`);
  // or a file draws a plain `<button` of its own, in any colour; or a file loses its Button import.
  // Seen: FAIL SH24 the unsaved-changes, update and error dialogs' buttons are the shared Button (no hand-made button of their own, blue, accent or any other colour)  src/components/common/UpdateBanner.tsx
  //         (Reload put back as `<button … className="px-3 py-2 rounded-lg bg-dcs-accent hover:bg-red-600 font-medium">`)
  //       FAIL SH24 …  src/components/mission/UnsavedChangesDialog.tsx   (Discard as a plain `<button … className="px-4 py-2 rounded-lg bg-red-600">`: no blue or accent class, so the plain button alone turns it red)
  //       FAIL SH24 …  src/components/common/ErrorBoundary.tsx   (the import changed to `'../ui/ButtonX'`)
  const small = ['src/components/mission/UnsavedChangesDialog.tsx', 'src/components/common/UpdateBanner.tsx', 'src/components/common/ErrorBoundary.tsx'];
  const raw = small.filter((f) => {
    const src = read(f);
    return /bg-dcs-(blue|accent)\b/.test(src) || /<button\b/.test(src) || !/from ['"][./]+ui\/Button['"]/.test(src);
  });
  ok('SH24 the unsaved-changes, update and error dialogs\' buttons are the shared Button (no hand-made button of their own, blue, accent or any other colour)', raw.length === 0, raw.join(', '));
}
