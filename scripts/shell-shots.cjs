// Screenshot checks for the app shell: the header on every screen, the planner's icon rail and
// floating side panel, the map's zoom, credit and Legend (shut and open), the File menu, where
// the header and the dialogs stand in the stack, the About dialog (opened from File's last row and the phone's Menu), and the phone's bars,
// Layers button, sheet and menu (also from the keyboard).
// It serves a finished web build itself, loads the synthetic mission through the front page (no
// real mission needed), blocks map tiles (a plain, repeatable map), measures, and writes a PNG
// of every state it checks.
//
//   npm run build:web && node scripts/shell-shots.cjs dist-web <screenshotDir>
//
// Environment (as scripts/playback-shots.cjs):
//   PLAYWRIGHT_MODULE   path to a playwright-core (or playwright) folder; else require('playwright')
//   CHROME_PATH         the Chromium binary to launch; else Playwright's own
// Needs a local port and a browser, so it runs outside a command sandbox that forbids either.
// One browser script at a time. Prints one PASS/FAIL line per check and exits 1 on any FAIL.
//
// Every load lands on the Flight overview and "Open the map" goes on to the planner, so that is
// how it gets in, as scripts/web-smoke.cjs does. The synthetic mission has no attack, so the
// Legend's Attacks set and the rail's "1 hidden" line are not in these pictures.
//
// Each check carries a "Red when" line (the one change, made in a copy of the source and built
// there, that turns it red) and a "Seen" line (what it printed then). A change that was only
// argued, not run, says so.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');

const [distArg, out] = process.argv.slice(2);
if (!distArg || !out) {
  console.error('usage: node scripts/shell-shots.cjs <dist-web> <screenshotDir>');
  process.exit(2);
}
const dist = path.resolve(distArg);
fs.mkdirSync(out, { recursive: true });
const fixture = fs.readFileSync(path.join(__dirname, '../test-data/nevada_SYNTHETIC_link_payload.json'), 'utf8');
// What the About dialog has to show. The version is package.json's. The entries are the data module's own, read from its source,
// so a source added there is counted without this script changing (the web build has no elevation entry, which lives in a desktop-only file).
const appVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;
const creditNames = [...fs.readFileSync(path.join(__dirname, '../src/components/about/credits.ts'), 'utf8').matchAll(/^\s+name: (?:'([^']*)'|"([^"]*)")/gm)].map((m) => m[1] ?? m[2]);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
const lines = [];
let fails = 0;
const ok = (name, cond, detail = '') => { if (!cond) fails++; lines.push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const info = (s) => lines.push(`INFO ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const box = async (loc) => { const b = await loc.boundingBox(); return b && { l: Math.round(b.x), t: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.x + b.width), b: Math.round(b.y + b.height) }; };
const fmt = (b) => (b ? `[${b.l},${b.t} ${b.w}x${b.h}]` : 'none');
const meet = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const labelsOf = (loc) => loc.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const activeLabel = (page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
const background = (loc) => loc.evaluate((e) => getComputedStyle(e).backgroundColor);
// The bar's small line under the title, with its spaces made plain; empty (not a wait) when the bar has none.
const barLineOf = async (page) => (await page.locator('header p').first().innerText({ timeout: 2000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
// The accent as the browser computes it, read from the token itself (a probe element, not a copy of the number).
const accentOf = (page) => page.evaluate(() => {
  const d = document.createElement('div');
  d.style.color = 'var(--c-accent)';
  document.body.append(d);
  const c = getComputedStyle(d).color;
  d.remove();
  return c;
});

// The way in: the front page's load box, "Choose your flight", then the Flight overview every load lands on.
async function waitForFront(page) {
  await page.getByRole('heading', { name: 'Load a mission' }).waitFor({ timeout: 15000 });
}
async function loadMission(page) {
  await page.getByPlaceholder('Paste a FragOrders link').fill(fixture);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose your flight' });
  await chooser.waitFor({ timeout: 10000 });
  await chooser.getByRole('button', { name: /^Import / }).click();
  await page.getByRole('button', { name: 'Open the map', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'Jets and loadouts' }).waitFor({ timeout: 10000 });
  await sleep(600);
}
async function openTheMap(page) {
  await page.getByRole('button', { name: 'Open the map', exact: true }).click();
  await page.getByRole('group', { name: 'Planner panels' }).waitFor();
  await sleep(600);
}
async function newPage(browser, w, h, phone) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  const hosts = new Set();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  return { ctx, page, errors, hosts };
}
const onlyLocal = (hosts) => [...hosts].every((x) => x.startsWith('127.0.0.1') || x === 'tile.openstreetmap.org');

// The desktop header: its box, and what it says on the screen the page is on.
async function headerBox(page) { return box(page.locator('header').first()); }
// Open File, read its rows, leave it open (the caller shuts it).
async function openFile(page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await sleep(100);
  return labelsOf(page.getByRole('menuitem'));
}
async function shutFile(page) {
  await page.keyboard.press('Escape');
  await sleep(100);
}

// The About dialog, once its row has been pressed: whether it opened, its title, what it says and how it sits. Waits for the credits'
// heading, since the list is drawn a moment after the dialog. Reads nothing (opened false) when no dialog comes, so a missing row fails
// its checks instead of stopping the run.
const ABOUT = 'About Phoenix Weaponeer';
async function readAbout(page) {
  const dialog = page.getByRole('dialog', { name: ABOUT });
  const opened = await dialog.waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (!opened) return { opened };
  await dialog.getByRole('heading', { name: 'Credits and sources' }).waitFor({ timeout: 5000 }).catch(() => {});
  await sleep(200);
  const title = await dialog.getByRole('heading', { level: 2 }).innerText().catch(() => '');
  const text = (await dialog.innerText()).replace(/\s+/g, ' ');
  const entries = await dialog.locator('ul > li').evaluateAll((lis) => lis.map((li) => [...li.querySelectorAll('p')].map((p) => p.textContent.trim())));
  const closeButtons = await dialog.getByRole('button', { name: /^Close/ }).count();
  const fit = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const r = d.getBoundingClientRect();
    const all = [d, ...d.querySelectorAll('*')];
    return {
      box: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) },
      view: { w: window.innerWidth, h: window.innerHeight },
      pageWide: document.documentElement.scrollWidth > window.innerWidth,
      // An element whose content is wider than it is, or a part that sticks out of the dialog's sides: a sideways scroll.
      wide: all.filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1).map((el) => el.tagName.toLowerCase()),
      outside: all.filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1); }).length,
    };
  });
  return { opened, title, text, entries, closeButtons, fit };
}
// What the dialog must say, in order: the name and version, the owner and the licence, then the credits.
function aboutSays(a) {
  if (!a.opened) return { content: false, entries: false, detail: 'no dialog' };
  const at = ['Phoenix Weaponeer', `Version ${appVersion}`, '© DroptheHammer', 'PolyForm Strict License 1.0.0', 'Credits and sources'].map((s) => a.text.indexOf(s));
  const inOrder = at.every((n, i) => n >= 0 && (i === 0 || n > at[i - 1]));
  const plain = a.text.includes('Free to download and use for any noncommercial purpose') && a.text.includes('without written permission');
  const names = a.entries.map((e) => e[0]);
  const entriesOk = a.entries.length === creditNames.length && same([...names].sort(), [...creditNames].sort()) && a.entries.every((e) => e.length === 3 && e.every((line) => line.length > 0));
  const noElevation = !/Mapzen|Terrain Tiles|Elevation/i.test(a.text);
  return {
    content: inOrder && plain,
    entries: entriesOk && noElevation,
    detail: `order ${at.join('<')} plain ${plain}; version "${a.text.match(/Version \S+/)?.[0]}" (want "Version ${appVersion}"); entries ${a.entries.length} of ${creditNames.length}: ${names.join(' | ')}; elevation words ${!noElevation}`,
  };
}
const aboutFits = (a, w, h, full) => a.opened && !a.fit.pageWide && a.fit.wide.length === 0 && a.fit.outside === 0
  && a.fit.box.l >= 0 && a.fit.box.r <= w && a.fit.box.t >= 0 && a.fit.box.b <= h && (!full || (a.fit.box.l === 0 && a.fit.box.r === w));
const aboutFitText = (a) => (a.opened ? `box [${a.fit.box.l},${a.fit.box.t} to ${a.fit.box.r},${a.fit.box.b}] in ${a.fit.view.w}x${a.fit.view.h}; page wide ${a.fit.pageWide}; wider than itself ${a.fit.wide.join(',') || 'none'}; parts outside the dialog ${a.fit.outside}` : 'no dialog');

let browser;
(async () => {
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

  // 1024 x 768 is the desktop app's smallest window; 768 x 1024 (a tablet held upright) and 768 x 501
  // are the web build's smallest desktop layouts (useIsPhone switches to the phone below them).
  for (const [w, h] of [[1400, 900], [1024, 768], [768, 1024], [768, 501]]) {
    const { ctx, page, errors, hosts } = await newPage(browser, w, h, false);
    const tag = `${w}x${h}`;
    const covers = w < 900; // under 900 px wide the open panel covers the map
    await page.goto(base);
    await waitForFront(page);

    // ---- The front page, with no mission: the same bar, with File (Open, Import), Settings and no Quit.
    const frontBar = await headerBox(page);
    const frontRows = await openFile(page);
    await page.screenshot({ path: path.join(out, `shell-${tag}-front-file-menu.png`) });
    await shutFile(page);
    await page.screenshot({ path: path.join(out, `shell-${tag}-front.png`) });
    // Red when: AppBar's `{onQuit ? (` becomes `{onSettings ? (` (a Quit button in the browser); or its `h-bar` becomes `h-14`.
    // Seen: FAIL 1400x900 FH1 the front page's header is one 48 px bar, … and no Quit in the browser  header [0,0 1400x48] rows Open|Import   (each of the two, at all four sizes; the second printed header [0,0 1400x56]. Seen before About was a row: the rows in those lines now end with About.)
    // Also red when: App's `fileItems={[...bar.fileItems, aboutFileItem]}` becomes `fileItems={bar.fileItems}` (About is not a row).
    // Seen: FAIL 1400x900 FH1 the front page's header is one 48 px bar, …  header [0,0 1400x48] rows Open|Import   (at all four sizes; the same change turned red OH1, FH2, FM1 and AB1 to AB5 at every size: 36 FAIL lines)
    ok(`${tag} FH1 the front page's header is one 48 px bar, edge to edge, with File (Open, Import, About) and Settings, and no Quit in the browser`,
      frontBar.h === 48 && frontBar.l === 0 && frontBar.t === 0 && frontBar.w === w && same(frontRows, ['Open', 'Import', 'About'])
        && (await page.getByRole('button', { name: 'Settings', exact: true }).count()) === 1 && (await page.getByRole('button', { name: 'Quit' }).count()) === 0,
      `header ${fmt(frontBar)} rows ${frontRows.join('|')}`);
    // Red when: the name's `max-[1099px]:hidden` is taken out of AppBar (the name would stay under 1100 px).
    // Seen: FAIL 1024x768 H2 the app's name is in the bar from 1100 px wide and goes under that   (also at both 768 wide sizes; 1400x900 stays green)
    const brand = page.locator('header').first().getByText('Phoenix Weaponeer', { exact: true });
    ok(`${tag} H2 the app's name is in the bar from 1100 px wide and goes under that`, (await brand.isVisible()) === (w >= 1100));

    // ---- The Flight overview: the bar leads with the way back, the flight and its words, and "Open the map" is its one filled button.
    await loadMission(page);
    const ovBar = await headerBox(page);
    const ovMain = await box(page.locator('main'));
    const ovRows = await openFile(page);
    await page.screenshot({ path: path.join(out, `shell-${tag}-overview-file-menu.png`) });
    await shutFile(page);
    await page.screenshot({ path: path.join(out, `shell-${tag}-overview.png`) });
    const ovLine = await barLineOf(page);
    const ovHeader = page.locator('header').first();
    // Red when: `saveItem` is taken out of `missionFileItems` in App; or AppBar's `h-bar` becomes `h-14`. (Argued, not run: App's overview bar loses `primary`.)
    // Seen: FAIL 1400x900 OH1 the overview's header is one 48 px bar with the way back (Front page), …  header [0,0 1400x48] main [0,48 1400x852] rows Open|Import|Close   (the second change: header [0,0 1400x56] main [0,56 1400x844]. Seen before About was a row: the rows in those lines now end with About.)
    // Also red when: App's `fileItems={[...bar.fileItems, aboutFileItem]}` becomes `fileItems={bar.fileItems}`.
    // Seen: FAIL 1400x900 OH1 …  header [0,0 1400x48] main [0,48 1400x852] rows Export .json|Open|Import|Close   (at all four sizes)
    ok(`${tag} OH1 the overview's header is one 48 px bar with the way back (Front page), "Open the map" as its filled button, and File (Save, Open, Import, Close, About) over a page that fills the window`,
      ovBar.h === 48 && ovBar.l === 0 && ovBar.w === w && ovMain.t === 48 && ovMain.b === h
        && (await ovHeader.getByRole('button', { name: 'Front page', exact: true }).count()) === 1
        && (await ovHeader.getByRole('button', { name: 'Open the map', exact: true }).count()) === 1
        && same(ovRows, ['Export .json', 'Open', 'Import', 'Close', 'About']),
      `header ${fmt(ovBar)} main ${fmt(ovMain)} rows ${ovRows.join('|')}`);
    // Red when: App's overview bar drops its `{isDirty ? dirtyWords : null}` (the words for work not yet exported).
    // Seen: FAIL 1400x900 OH2 the overview's small line ends with "Not exported", at every width  Viper11 - Viper 1 · Nevada (NTTR) · edited today, HH:MM ·   (and an empty line at 768 wide)
    ok(`${tag} OH2 the overview's small line ends with "Not exported", at every width`, /Not exported$/.test(ovLine), ovLine);

    // ---- Back to the front page with the mission still open: the same bar, with Save in File; "Open now" goes back.
    await page.getByRole('button', { name: 'Front page', exact: true }).click();
    await page.getByRole('heading', { name: 'Load a mission' }).waitFor({ timeout: 5000 });
    await sleep(300);
    const openRows = await openFile(page);
    await shutFile(page);
    await page.screenshot({ path: path.join(out, `shell-${tag}-front-mission-open.png`) });
    // Red when: `saveItem` is taken out of `missionFileItems` in App.
    // Seen: FAIL 1400x900 FH2 with a mission kept open behind it, the front page's File carries Save, Open, Import, Close and About  Open|Import|Close   (before About was a row: the line now ends with About)
    // Also red when: App's `fileItems={[...bar.fileItems, aboutFileItem]}` becomes `fileItems={bar.fileItems}`.
    // Seen: FAIL 1400x900 FH2 …  Export .json|Open|Import|Close   (at all four sizes)
    ok(`${tag} FH2 with a mission kept open behind it, the front page's File carries Save, Open, Import, Close and About`,
      same(openRows, ['Export .json', 'Open', 'Import', 'Close', 'About']), openRows.join('|'));
    await page.getByRole('button', { name: /Open now/ }).first().click();
    await openTheMap(page);

    // ---- The planner: header, rail, zoom, credit, Legend, panel.
    const header = await headerBox(page);
    const mapArea = await box(page.locator('main'));
    // Red when: AppBar's `h-bar` becomes `h-14`. (Argued, not run: the planner's `<main>` takes padding again.)
    // Seen: FAIL 1400x900 H1 the header is one 48 px bar, edge to edge, and the map fills the window under it  header [0,0 1400x56] map [0,56 1400x844]
    ok(`${tag} H1 the header is one 48 px bar, edge to edge, and the map fills the window under it`,
      header && header.h === 48 && header.l === 0 && header.w === w && mapArea.t === 48 && mapArea.l === 0 && mapArea.w === w && mapArea.b === h, `header ${fmt(header)} map ${fmt(mapArea)}`);
    const barLine = await barLineOf(page);
    // Red when: the `max-[959px]:hidden` is taken off the place's span in App's planner bar (the place would stay on a narrow bar).
    // Seen: FAIL 768x1024 H3 the planner's small line carries the place from 960 px wide, and the unsaved words ("Not exported") always  Nevada (NTTR) · Not exported   (also at 768x501)
    ok(`${tag} H3 the planner's small line carries the place from 960 px wide, and the unsaved words ("Not exported") always`,
      /Not exported$/.test(barLine) && /Nevada/.test(barLine) === (w >= 960), barLine);
    const rail = page.getByRole('group', { name: 'Planner panels' });
    const names = await labelsOf(rail.getByRole('button'));
    // Red when: `stackedName` in Tabs returns `item.label` alone (the counts leave the names).
    // Seen: FAIL 1400x900 R1 the rail's names keep today's words  Waypoints | Threats | Flight | Attacks | Kneeboards
    ok(`${tag} R1 the rail's names keep today's words`, /^Waypoints \(\d+\)$/.test(names[0]) && /^Threats \(\d+\)$/.test(names[1]) && /^Flight \(\d+\)$/.test(names[2]) && /^Attacks \(\d+\)$/.test(names[3]) && names[4] === 'Kneeboards', names.join(' | '));
    // Red when: MapView's `attributionControl={false}` becomes `attributionControl={true}` (Leaflet's credit comes back beside ours).
    // Seen: FAIL 1400x900 M1 Leaflet's own zoom and attribution are gone; the app's zoom and credit are there
    ok(`${tag} M1 Leaflet's own zoom and attribution are gone; the app's zoom and credit are there`,
      (await page.locator('.leaflet-control-zoom, .leaflet-control-attribution').count()) === 0 && (await page.getByRole('group', { name: 'Map zoom' }).count()) === 1 && (await page.getByText('© OpenStreetMap contributors').count()) === 1);

    const toggle = page.getByRole('button', { name: /^Legend/ });
    const legendBox = page.getByRole('region', { name: 'Legend' });
    const zoom = page.getByRole('group', { name: 'Map zoom' });
    const credit = page.getByText('© OpenStreetMap contributors');
    // Put the Legend in the state asked for, whatever state it is in (a check that failed earlier must not strand the next steps).
    const setLegend = async (open) => { if ((await toggle.getAttribute('aria-expanded')) !== String(open)) { await toggle.click(); await sleep(150); } };
    for (const panelOpen of [false, true]) {
      if (panelOpen) { await rail.getByRole('button', { name: /^Attacks/ }).click(); await sleep(250); }
      for (const open of [false, true]) {
        // (Under the covering panel the Legend cannot be reached: one picture and P2, then on.)
        if (!(panelOpen && covers)) await setLegend(open);
        const lg = await box(legendBox);
        const rl = await box(rail);
        const zm = await box(zoom);
        const cr = await box(credit);
        const panel = panelOpen ? await box(page.locator('aside[aria-labelledby="planner-panel-title"]')) : null;
        const t = `${tag} panel ${panelOpen ? 'open' : 'closed'}, legend ${open ? 'open' : 'closed'}`;
        await page.screenshot({ path: path.join(out, `shell-${tag}-panel-${panelOpen ? 'open' : 'closed'}-legend-${open ? 'open' : 'closed'}.png`) });
        if (panelOpen && covers) {
          // Red when: PlannerShell's panel loses `max-[899px]:col-span-full max-[899px]:col-start-1` (it squeezes into the third column and leaves a sliver of map).
          // Seen: FAIL P2 768x1024 panel open, legend closed: under 900 px wide the open panel covers the map, inside the 12 px inset  panel [357,60 399x952]   (and [357,60 399x429] at 768x501)
          ok(`P2 ${t}: under 900 px wide the open panel covers the map, inside the 12 px inset`,
            panel && panel.l === mapArea.l + 12 && panel.r === mapArea.r - 12 && panel.t === mapArea.t + 12 && panel.b === mapArea.b - 12, `panel ${fmt(panel)}`);
          break;
        }
        const corner = lg.l === mapArea.l + 12 && lg.b === mapArea.b - 12;
        const clash = [['rail', rl], ['zoom', zm], ['credit', cr], ['panel', panel]].filter(([, b]) => meet(lg, b)).map(([n]) => n);
        // Red when: PlannerShell's left column `justify-between` becomes `justify-start` (the Legend rises under the rail instead of sitting at the corner).
        // Seen: FAIL L1 1400x900 panel closed, legend closed: the legend is its own box at the map's bottom-left corner, …  legend [12,384 96x46] rail [12,60 96x312] zoom [1342,60 46x90] credit [1197,866 191x22] panel none clashes none
        // (11 of the 14 L1 lines go red, at every size; the three that stay green are the open Legend at 768x501, where it already fills the column, and the two covered by P2.)
        ok(`L1 ${t}: the legend is its own box at the map's bottom-left corner, under the rail, clear of zoom, credit and panel`,
          corner && clash.length === 0 && lg.t >= rl.b + 12 && (open ? lg.w <= 224 : lg.w <= 96),
          `legend ${fmt(lg)} rail ${fmt(rl)} zoom ${fmt(zm)} credit ${fmt(cr)} panel ${fmt(panel)} clashes ${clash.join(',') || 'none'}`);
      }
    }
    // The lit rail button is the accent, with the panel open (it is, at every size: the loops above leave it open).
    const accent = await accentOf(page);
    const lit = await background(rail.locator('button[aria-pressed="true"]'));
    // Red when: Tabs' rail `on:` class loses `bg-accent` (the open panel's button is not lit).
    // Seen: FAIL 1400x900 R2 the rail's open button is the accent, and it is the only one lit  rgba(0, 0, 0, 0) vs rgb(233, 69, 96)
    ok(`${tag} R2 the rail's open button is the accent, and it is the only one lit`, lit === accent && (await rail.locator('button[aria-pressed="true"]').count()) === 1, `${lit} vs ${accent}`);
    // Where the open panel covers the map, shut it for the Legend's and the File menu's checks.
    if (covers) { await page.getByRole('button', { name: 'Close panel' }).click(); await sleep(100); }
    // Keyboard: Escape inside the open legend closes it and puts focus on its button.
    await setLegend(true);
    await page.getByRole('checkbox', { name: /Route/ }).focus();
    await page.keyboard.press('Escape');
    await sleep(100);
    // Red when: LegendBox's `onKeyDown={onKeyDown}` is taken off its Panel (Escape does nothing there).
    // Seen: FAIL 1400x900 K1 Escape in the legend closes it and focuses the Legend button
    ok(`${tag} K1 Escape in the legend closes it and focuses the Legend button`,
      (await toggle.getAttribute('aria-expanded')) === 'false' && (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Legend');
    // Filtered: uncheck Route, close: the button says so.
    await setLegend(true);
    await page.getByRole('checkbox', { name: /Route/ }).uncheck();
    await setLegend(false);
    // Red when: the words `· filtered` are taken out of LegendBox's span.
    // Seen: FAIL 1400x900 F1 a filtered map says so on the closed button  Legend
    const shutWords = (await toggle.innerText()).replace(/\s+/g, ' ').trim();
    ok(`${tag} F1 a filtered map says so on the closed button`, shutWords === 'Legend · filtered', shutWords);
    await page.screenshot({ path: path.join(out, `shell-${tag}-legend-filtered.png`) });
    await setLegend(true);
    await page.getByRole('button', { name: 'Show all' }).click();
    await setLegend(false);
    // Zoom buttons drive the map (where the panel covers the map it is shut now, so they can be pressed).
    await zoom.getByRole('button', { name: 'Zoom in' }).click();
    await sleep(400);
    info(`${tag} zoom clicked`);
    // The open panel under the File menu: the menu hangs over it and over the map.
    if ((await page.getByRole('button', { name: 'Close panel' }).count()) === 0) { await rail.getByRole('button', { name: /^Attacks/ }).click(); await sleep(250); }
    // File menu: keyboard. The planner's rows: Flight overview first (the way back), About last.
    const fileBtn = page.getByRole('button', { name: 'File', exact: true });
    await fileBtn.click();
    await sleep(100);
    const firstFocused = await activeLabel(page);
    const rows = await labelsOf(page.getByRole('menuitem'));
    const rowBoxes = [];
    for (const row of await page.getByRole('menuitem').all()) rowBoxes.push(await box(row));
    // Nothing of the rail, the panel, the zoom or the Legend is on top of the menu: at each row's middle the page's top element is that row.
    const topOfRows = await page.evaluate((rects) => rects.map((r) => document.elementFromPoint(r.l + r.w / 2, r.t + r.h / 2)?.closest('[role="menuitem"]')?.getAttribute('aria-label') ?? null), rowBoxes);
    await page.keyboard.press('End');
    const lastFocused = await activeLabel(page);
    await page.screenshot({ path: path.join(out, `shell-${tag}-file-menu.png`) });
    await page.keyboard.press('Escape');
    await sleep(100);
    // Red when: FileMenu's `rows.current[0]?.focus();` is taken out; or App's planner list loses its "Flight overview" row.
    // Seen: FAIL 1400x900 FM1 File opens on its first row (Flight overview), …  first File, rows Flight overview|Open|Import|Close, last File   (the second: first Open, rows Open|Import|Close, last Close. Seen before About was a row: the rows in those lines now end with About, and End reaches About.)
    // Also red when: App's `fileItems={[...bar.fileItems, aboutFileItem]}` becomes `fileItems={bar.fileItems}`.
    // Seen: FAIL 1400x900 FM1 …  first Flight overview, rows Flight overview|Open|Import|Close, last Close   (at all four sizes)
    ok(`${tag} FM1 File opens on its first row (Flight overview), lists Flight overview, Open, Import, Close, About, End reaches About, Escape returns to File`,
      firstFocused === 'Flight overview' && same(rows, ['Flight overview', 'Open', 'Import', 'Close', 'About']) && lastFocused === 'About' && (await page.getByRole('menu').count()) === 0 && (await activeLabel(page)) === 'File',
      `first ${firstFocused}, rows ${rows.join('|')}, last ${lastFocused}`);
    // Red when: AppBar's `z-[1100]` becomes `z-[900]` (the planner's floating layer, 1000, then covers the menu).
    // Seen: FAIL 1400x900 Z1 the File menu hangs over the open panel and the map: the top element at every row is that row  rows Open|Import|Close top ||   (the panel, not the menu, was the top element at every row's middle)
    ok(`${tag} Z1 the File menu hangs over the open panel and the map: the top element at every row is that row`, same(topOfRows, rows), `rows ${rows.join('|')} top ${topOfRows.join('|')}`);
    // Close the panel by its button: focus returns to the rail button.
    await page.getByRole('button', { name: 'Close panel' }).click();
    await sleep(100);
    // Red when: PlannerShell's `closePanel` loses `opener?.focus();`.
    // Seen: FAIL 1400x900 P1 closing the panel puts the keyboard back on its rail button   (at all four sizes)
    ok(`${tag} P1 closing the panel puts the keyboard back on its rail button`, /^Attacks/.test((await activeLabel(page)) || ''));
    // About: File's last row opens it. It holds the app's name and version, who owns it and under what licence, and the credits; it fits the
    // window with no sideways scroll; Escape and its close button each shut it and the keyboard goes back to File, where the dialog took it from.
    const openAbout = async () => {
      // (With a dialog still open the press cannot land: it gives up after 3 s instead of stopping the run.)
      await fileBtn.click({ timeout: 3000 }).catch(() => {});
      await sleep(100);
      await page.getByRole('menuitem', { name: 'About', exact: true }).click({ timeout: 3000 }).catch(() => {});
    };
    await openAbout();
    const about = await readAbout(page);
    await page.screenshot({ path: path.join(out, `shell-${tag}-about.png`) });
    const aboutSaid = aboutSays(about);
    const closeName = `Close ${ABOUT}`;
    // Red when: App's `fileItems={[...bar.fileItems, aboutFileItem]}` becomes `fileItems={bar.fileItems}`; or credits.ts's ABOUT_TITLE becomes `'About'` (the dialog is not named in full).
    // Seen: FAIL 1400x900 AB1 pressing About in File opens a dialog named "About Phoenix Weaponeer", titled so, with a close button named for it  dialog false, title "undefined", close buttons 0   (each change, at 1400x900; the shorter title left the dialog open, so that run stopped at the Settings press after AB5)
    ok(`${tag} AB1 pressing About in File opens a dialog named "${ABOUT}", titled so, with a close button named for it`,
      about.opened && about.title === ABOUT && (await page.getByRole('button', { name: closeName, exact: true }).count()) === 1,
      `dialog ${about.opened}, title "${about.title}", close buttons ${about.opened ? about.closeButtons : 0}`);
    // Red when: AboutDialog's `versionLine(__APP_VERSION__)` becomes `versionLine('0.3.3')` (the version typed, not read from package.json).
    // Seen: FAIL 1400x900 AB2 the dialog shows the app's name, "Version " + package.json's version, "© DroptheHammer", the licence's name and its two plain sentences, then the heading "Credits and sources", in that order  order 6<-1<56<72<290 plain true; version "Version 0.3.3" (want "Version 0.3.4"); entries 5 of 5: Map data | Figtree | JetBrains Mono | pydcs | Chuck's Guides; elevation words false
    ok(`${tag} AB2 the dialog shows the app's name, "Version " + package.json's version, "© DroptheHammer", the licence's name and its two plain sentences, then the heading "Credits and sources", in that order`, aboutSaid.content, aboutSaid.detail);
    // Red when: creditList in credits.ts loses an entry (`, CHUCKS_GUIDES` taken out); or the web build is made to carry the elevation entry (entry.web.tsx importing it from ./elevationCredit and returning it from loadPlaybackCredits).
    // Seen: FAIL 1400x900 AB3 under the heading, one entry (name, owner, what the app takes) for each source in the data module, and none of the elevation credit's words in the web build  order 6<42<56<72<290 plain true; version "Version 0.3.4" (want "Version 0.3.4"); entries 4 of 5: Map data | Figtree | JetBrains Mono | pydcs; elevation words false
    //   (the second change: … entries 6 of 5: Map data | Elevation data | Figtree | JetBrains Mono | pydcs | Chuck's Guides; elevation words true. scripts/bundle-check.mjs fails that build as well: "the playback library is in the web build".)
    ok(`${tag} AB3 under the heading, one entry (name, owner, what the app takes) for each source in the data module, and none of the elevation credit's words in the web build`, aboutSaid.entries, aboutSaid.detail);
    // Red when: a part of the dialog is made wider than it (`whitespace-nowrap` added to each entry's "takes" line in AboutDialog).
    // Seen: FAIL 1400x900 AB4 the dialog sits inside the window and does not scroll sideways, on the page or inside itself  box [444,112 to 956,788] in 1400x900; page wide false; wider than itself div,div; parts outside the dialog 30   (at all four sizes)
    ok(`${tag} AB4 the dialog sits inside the window and does not scroll sideways, on the page or inside itself`, aboutFits(about, w, h, false), aboutFitText(about));
    await page.keyboard.press('Escape');
    await sleep(150);
    // (A dialog that never opened shuts nothing: each way of shutting counts only for a dialog that was open first.)
    const shutByKey = about.opened && (await page.getByRole('dialog', { name: ABOUT }).count()) === 0 && (await activeLabel(page)) === 'File';
    await openAbout();
    const again = await readAbout(page);
    await page.getByRole('button', { name: closeName, exact: true }).click({ timeout: 3000 }).catch(() => {});
    await sleep(150);
    const shutByButton = again.opened && (await page.getByRole('dialog', { name: ABOUT }).count()) === 0 && (await activeLabel(page)) === 'File';
    // Red when: AboutDialog's `onClose={onClose}` becomes `onClose={() => {}}` (neither closes it); or Modal's cleanup loses `if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });` (the keyboard is not given back).
    // Seen: FAIL 1400x900 AB5 Escape and the close button each shut the dialog and put the keyboard back on File  Escape: shut and keyboard on File false; close button: false   (both changes, the second at all four sizes; the first stops the run at the Settings press after it, since the dialog stays up)
    ok(`${tag} AB5 Escape and the close button each shut the dialog and put the keyboard back on File`, shutByKey && shutByButton, `Escape: shut and keyboard on File ${shutByKey}; close button: ${shutByButton}`);
    // A dialog stands over the header and the planner: the stack is the map, the planner's floats (1000), the header (1100), the dialogs (2000).
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('dialog', { name: 'Settings' }).waitFor({ timeout: 5000 });
    const settingsBtn = await box(page.getByRole('button', { name: 'Settings', exact: true }));
    const stack = await page.evaluate((at) => {
      const top = document.elementFromPoint(at.x, at.y);
      const z = (el) => (el ? getComputedStyle(el).zIndex : null);
      return {
        coveredByHeader: Boolean(top?.closest('header')),
        dialogLayer: z(top),
        header: z(document.querySelector('header')),
        floats: z(document.querySelector('[aria-label="Planner panels"]')?.parentElement?.parentElement),
      };
    }, { x: settingsBtn.l + settingsBtn.w / 2, y: settingsBtn.t + settingsBtn.h / 2 });
    await page.screenshot({ path: path.join(out, `shell-${tag}-settings-over-header.png`) });
    // Red when: AppBar's `z-[1100]` becomes `z-[900]` (the design notes name these numbers). (Argued, not run: DialogFrame's backdrop `z-[2000]` or PlannerShell's `z-[1000]` changes.)
    // Seen: FAIL 1400x900 Z2 a dialog covers the header: its layer is 2000 over the header's 1100 and the planner's floats at 1000  {"coveredByHeader":false,"dialogLayer":"2000","header":"900","floats":"1000"}
    ok(`${tag} Z2 a dialog covers the header: its layer is 2000 over the header's 1100 and the planner's floats at 1000`,
      !stack.coveredByHeader && stack.dialogLayer === '2000' && stack.header === '1100' && stack.floats === '1000', JSON.stringify(stack));
    await page.keyboard.press('Escape');
    await sleep(100);
    // Red when: the page makes a request to a host other than this server and the (blocked) tile host (App given an effect that fetches "https://example.invalid/shell-proof"). (Argued, not run: a page error.)
    // Seen: FAIL 1400x900 E1 no page errors; only this server (tiles blocked)   hosts 127.0.0.1:62737,example.invalid,tile.openstreetmap.org   (every E1 line, desktop and phone)
    ok(`${tag} E1 no page errors; only this server (tiles blocked)`, errors.length === 0 && onlyLocal(hosts), `${errors.join('; ')} hosts ${[...hosts].join(',')}`);
    await ctx.close();
  }

  // Phone: the layout as the phone draws it; the bar of tabs at the foot, Layers top right, zoom bottom left, credit bottom right.
  {
    const { ctx, page, errors, hosts } = await newPage(browser, 390, 844, true);
    await page.goto(base);
    await waitForFront(page);
    const menuRows = async () => {
      await page.getByRole('button', { name: 'Menu' }).click();
      const rows = await page.getByRole('menuitem').evaluateAll((els) => els.map((e) => ({ name: e.textContent.trim(), icon: Boolean(e.querySelector('svg')) })));
      return rows;
    };
    const rowNames = (rows) => rows.map((r) => r.name);
    const bar = async () => box(page.locator('header').first());

    // ---- The front page: a 45 px navy bar with the app's name, and a menu of icon rows.
    const frontTop = await bar();
    const frontTitle = (await page.locator('header h1').innerText()).trim();
    const frontMenu = await menuRows();
    await page.screenshot({ path: path.join(out, 'shell-phone-390-front-menu.png') });
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.screenshot({ path: path.join(out, 'shell-phone-390-front.png') });
    // Red when: PhoneShell's header `min-h-[calc(var(--bar)+var(--safe-top))]` becomes `min-h-[56px]`. (Argued, not run: a menu row loses its icon.)
    // Seen: FAIL phone FH1 the front page: a 45 px bar edge to edge titled "Phoenix Weaponeer", …  bar [0,0 390x56] "Phoenix Weaponeer" rows Create new mission|Strike near me|Settings   (seen before About was a row: the rows now end with About)
    // Also red when: App's `menu={[...phoneMenu, aboutItem]}` becomes `menu={phoneMenu}`; or the About row loses its `icon: 'info'` (the rows read right and the row has no icon).
    // Seen: FAIL phone FH1 …  bar [0,0 390x45] "Phoenix Weaponeer" rows Create new mission|Strike near me|Settings   (the first; the second: … rows Create new mission|Strike near me|Settings|About)
    ok('phone FH1 the front page: a 45 px bar edge to edge titled "Phoenix Weaponeer", no back arrow, and a menu of icon rows (Create new mission, Strike near me, Settings, About)',
      frontTop.h === 45 && frontTop.l === 0 && frontTop.w === 390 && frontTitle === 'Phoenix Weaponeer' && (await page.getByRole('button', { name: 'Back to the front page' }).count()) === 0
        && same(rowNames(frontMenu), ['Create new mission', 'Strike near me', 'Settings', 'About']) && frontMenu.every((r) => r.icon),
      `bar ${fmt(frontTop)} "${frontTitle}" rows ${rowNames(frontMenu).join('|')}`);

    // ---- The overview: the back arrow, the flight over its line, the menu that leads with the way to the load box.
    await loadMission(page);
    const ovTop = await bar();
    const ovLine = await barLineOf(page);
    const ovMenu = await menuRows();
    await page.screenshot({ path: path.join(out, 'shell-phone-390-overview-menu.png') });
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.screenshot({ path: path.join(out, 'shell-phone-390-overview.png') });
    // Red when: PhoneShell's `{subtitle ? <p ...>` line is taken out (the overview's second line goes); or the header becomes `min-h-[56px]`. (Argued, not run: App's `onBack` is taken out.)
    // Seen: FAIL phone OH1 the overview: a 45 px bar with the back arrow, the flight, a second line starting "Not exported", …  bar [0,0 390x45] line "" rows Load a mission|Create new mission|Strike near me|Export .json|Close mission|Settings   (the second: bar [0,0 390x56]. Seen before About was a row: the rows now end with About.)
    // Also red when: App's `menu={[...phoneMenu, aboutItem]}` becomes `menu={phoneMenu}`; or the About row loses its `icon: 'info'`.
    // Seen: FAIL phone OH1 …  rows Load a mission|Create new mission|Strike near me|Export .json|Close mission|Settings   (the first; the second: the same rows with About)
    ok('phone OH1 the overview: a 45 px bar with the back arrow, the flight, a second line starting "Not exported", and a menu of icon rows that leads with Load a mission and ends with About',
      ovTop.h === 45 && (await page.getByRole('button', { name: 'Back to the front page' }).count()) === 1 && /^Not exported/.test(ovLine)
        && same(rowNames(ovMenu), ['Load a mission', 'Create new mission', 'Strike near me', 'Export .json', 'Close mission', 'Settings', 'About']) && ovMenu.every((r) => r.icon),
      `bar ${fmt(ovTop)} line "${ovLine}" rows ${rowNames(ovMenu).join('|')}`);

    // ---- Back to the front page with the mission open (its menu gains Close mission), then on to the map.
    await page.getByRole('button', { name: 'Back to the front page' }).click();
    await page.getByRole('heading', { name: 'Load a mission' }).waitFor({ timeout: 5000 });
    await sleep(300);
    const openMenu = await menuRows();
    await page.getByRole('button', { name: 'Menu' }).click();
    // Red when: App's front menu loses `...(mission ? [{ label: 'Close mission', ... }] : [])`.
    // Seen: FAIL phone FH2 with a mission kept open behind it, the front page's menu adds Close mission  Create new mission|Strike near me|Settings   (seen before About was a row: the rows now end with About)
    // Also red when: App's `menu={[...phoneMenu, aboutItem]}` becomes `menu={phoneMenu}`.
    // Seen: FAIL phone FH2 …  Create new mission|Strike near me|Close mission|Settings
    ok('phone FH2 with a mission kept open behind it, the front page\'s menu adds Close mission', same(rowNames(openMenu), ['Create new mission', 'Strike near me', 'Close mission', 'Settings', 'About']), rowNames(openMenu).join('|'));
    await page.getByRole('button', { name: /Open now/ }).first().click();
    await openTheMap(page);

    const top = await bar();
    const map = await box(page.locator('.leaflet-container'));
    const tabs = await box(page.getByRole('group', { name: 'Planner panels' }));
    const layersBtn = page.getByRole('button', { name: /^Layers/ });
    const layers = await box(layersBtn);
    const zoom = await box(page.getByRole('group', { name: 'Map zoom' }));
    const credit = await box(page.getByText('© OpenStreetMap contributors'));
    const tabNames = await labelsOf(page.getByRole('group', { name: 'Planner panels' }).getByRole('button'));
    const sub = await barLineOf(page);
    info(`phone top ${fmt(top)} map ${fmt(map)} tabs ${fmt(tabs)} layers ${fmt(layers)} zoom ${fmt(zoom)} credit ${fmt(credit)} names ${tabNames.join(' | ')} sub "${sub}"`);
    // Red when: LayersButton's `top-3` becomes `top-2` (it sits 8 px from the map's top). (Argued, not run: the zoom's `bottom-3` changes.)
    // Seen: FAIL phone S1 Layers 12 px from the map's top and right, zoom bottom left above the tabs, …  layers [283,53 95x44] map [0,45 390x730]
    ok('phone S1 Layers 12 px from the map\'s top and right, zoom bottom left above the tabs, credit bottom right, nothing overlaps, tab names start with the tab word',
      layers.r === map.r - 12 && layers.t === map.t + 12 && zoom.l <= 14 && zoom.b <= tabs.t && credit.r >= 380 && !meet(zoom, credit) && !meet(layers, zoom) && /^Route/.test(tabNames[0]) && tabNames[4] === 'Cards',
      `layers ${fmt(layers)} map ${fmt(map)}`);
    // Red when: PhoneShell's `{subtitle ? <p ...>` line is taken out; or its header becomes `min-h-[56px]`.
    // Seen: FAIL phone S4 the map's top bar is 45 px with the mission's name over a second line "{place} · Not exported"  [0,0 390x45] ""   (the second: [0,0 390x56] "Nevada (NTTR) · Not exported")
    ok('phone S4 the map\'s top bar is 45 px with the mission\'s name over a second line "{place} · Not exported"', top.h === 45 && map.t === 45 && /^Nevada.* · Not exported$/.test(sub), `${fmt(top)} "${sub}"`);
    // Red when: Tabs' bar padding `pt-1.5` becomes `pt-3` (the tab bar grows and the map shrinks).
    // Seen: FAIL phone S6 the bars and the map fill the screen: a 45 px top bar, a 730 px map, a 69 px tab bar, no gap between them  top [0,0 390x45] map [0,45 390x724] tabs [0,769 390x75]
    ok('phone S6 the bars and the map fill the screen: a 45 px top bar, a 730 px map, a 69 px tab bar, no gap between them',
      top.h === 45 && top.b === map.t && map.h === 730 && map.b === tabs.t && tabs.b === 844 && tabs.h === 69, `top ${fmt(top)} map ${fmt(map)} tabs ${fmt(tabs)}`);
    await page.screenshot({ path: path.join(out, 'shell-phone-390-map.png') });
    await layersBtn.click();
    await sleep(200);
    const pop = await box(page.getByRole('dialog', { name: 'Layers' }));
    // Red when: LayersButton's wrapper `gap-2` becomes `gap-1` (the panel sits 4 px under its button).
    // Seen: FAIL phone S5 the Layers panel opens 8 px under its button, at the right inset, and ends at least 20 px above the map's bottom  panel [122,105 256x280] map [0,45 390x724]
    // (The panel's `min-h-0` is no help here or in L2: the panel is `overflow-y-auto`, which lets a flex item shrink already, so taking `min-h-0` out leaves both green.)
    ok('phone S5 the Layers panel opens 8 px under its button, at the right inset, and ends at least 20 px above the map\'s bottom',
      pop && pop.t === layers.b + 8 && pop.r === map.r - 12 && pop.b <= map.b - 20, `panel ${fmt(pop)} map ${fmt(map)}`);
    await page.screenshot({ path: path.join(out, 'shell-phone-390-layers.png') });
    // Red when: (argued, not run) the panel is shorter than the room here ([122,109 256x280], the chip at 745), so the old `bottom-5` leaves this green; L4, held sideways, is the one that goes red.
    ok('phone S10 the open Layers panel ends at least 8 px above the map credit\'s chip', pop && credit && pop.b <= credit.t - 8, `panel ${fmt(pop)} credit ${fmt(credit)}`);
    await page.getByRole('checkbox', { name: /Route/ }).uncheck();
    await layersBtn.click();
    await sleep(100);
    // Red when: LayersButton's dot loses its `aria-label="some layers hidden"`.
    // Seen: FAIL phone S7 a filtered map says so on the shut Layers button
    ok('phone S7 a filtered map says so on the shut Layers button', (await page.getByLabel('some layers hidden').count()) === 1);
    await page.screenshot({ path: path.join(out, 'shell-phone-390-layers-filtered.png') });
    await layersBtn.click();
    await page.getByRole('button', { name: 'Show all' }).click();
    await layersBtn.click();

    const threatsTab = page.getByRole('group', { name: 'Planner panels' }).getByRole('button', { name: /^Threats/ });
    await threatsTab.click();
    await sleep(300);
    const half = await box(page.getByRole('dialog', { name: 'Threats' }));
    const accent = await accentOf(page);
    const lit = await background(threatsTab);
    await page.screenshot({ path: path.join(out, 'shell-phone-390-sheet.png') });
    // The sheet's header button keeps its words on one line: it is as tall as one line of its words plus its padding.
    const addThreat = page.getByRole('dialog', { name: 'Threats' }).getByRole('button', { name: /Add Threat/ });
    const addBox = await box(addThreat);
    const addOneLine = await addThreat.evaluate((el) => {
      const cs = getComputedStyle(el);
      return Math.round(parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
    });
    // Red when: the `shrink-0 whitespace-nowrap` classes are taken off ThreatList's Add Threat button (the words wrap onto two lines).
    // Seen: FAIL phone S11 the Threats sheet's Add Threat button keeps its words on one line (one line tall)  button [246,437 127x64], one line is 40 px   (the two classes taken off)
    ok('phone S11 the Threats sheet\'s Add Threat button keeps its words on one line (one line tall)', addBox && addBox.h === addOneLine, `button ${fmt(addBox)}, one line is ${addOneLine} px`);
    // Red when: BottomSheet's `absolute inset-x-0 bottom-0` becomes `bottom-2` (the sheet floats 8 px above the tab bar).
    // Seen: FAIL phone S2 the Threats sheet opens as a dialog named "Threats" over the map, above the tab bar, with its Expand handle  [0,366 390x402]   (S9 goes red with it)
    // Also red when: BottomSheet's handle loses `aria-label={snap === 'half' ? 'Expand' : 'Shrink'}`, or the dialog loses its `aria-label={title}`. Argued, not run: either change stops the steps that follow (they press "Expand" and look for the dialog by its name), so the run ends there instead of printing a FAIL line.
    ok('phone S2 the Threats sheet opens as a dialog named "Threats" over the map, above the tab bar, with its Expand handle', half && half.b === tabs.t && (await page.getByRole('button', { name: 'Expand' }).count()) === 1, fmt(half));
    // Red when: Tabs' bar `on:` class loses `bg-accent` (the open tab is not lit).
    // Seen: FAIL phone S8 the open tab is the accent, and it is the only one lit  rgba(0, 0, 0, 0) vs rgb(233, 69, 96)
    ok('phone S8 the open tab is the accent, and it is the only one lit', lit === accent && (await page.getByRole('group', { name: 'Planner panels' }).locator('button[aria-pressed="true"]').count()) === 1, `${lit} vs ${accent}`);
    await page.getByRole('button', { name: 'Expand' }).click();
    await sleep(400);
    const full = await box(page.getByRole('dialog', { name: 'Threats' }));
    await page.screenshot({ path: path.join(out, 'shell-phone-390-sheet-full.png') });
    await page.getByRole('button', { name: 'Shrink' }).click();
    await sleep(400);
    const halfAgain = await box(page.getByRole('dialog', { name: 'Threats' }));
    // Red when: BottomSheet's HEIGHT table makes `full` the same as `half` (`full: 0.55`).
    // Seen: FAIL phone S9 the handle takes the sheet to full height, up to the top bar, and back to half  half [0,374 390x402] full [0,374 390x402] back [0,374 390x402]
    ok('phone S9 the handle takes the sheet to full height, up to the top bar, and back to half',
      full.h > half.h && full.t === map.t && halfAgain.t === half.t && halfAgain.h === half.h && (await page.getByRole('button', { name: 'Expand' }).count()) === 1,
      `half ${fmt(half)} full ${fmt(full)} back ${fmt(halfAgain)}`);
    await page.getByRole('button', { name: 'Close Threats' }).click();
    await sleep(200);
    // The other sheets' Add buttons keep their words on one line as well: the Flight sheet's Add Pilot, and the Attacks sheet's Add Strike and Add Attack
    // (the synthetic flight has two jets, so Add Strike is offered). A button's lines are the rows its words stand on, counted word by word.
    const addLines = [];
    for (const [tabName, sheetName] of [[/^Flight/, 'Flight'], [/^Attacks/, 'Attacks']]) {
      const sheetTab = page.getByRole('group', { name: 'Planner panels' }).getByRole('button', { name: tabName });
      await sheetTab.click();
      await sleep(300);
      for (const btn of await page.getByRole('dialog', { name: sheetName }).getByRole('button', { name: /Add / }).all()) {
        const lines = await btn.evaluate((el) => {
          let most = 0;
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const range = document.createRange();
            range.selectNodeContents(n);
            most = Math.max(most, new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size);
          }
          return most;
        });
        addLines.push(`${(await btn.innerText()).replace(/\s+/g, ' ').trim()}: ${lines}`);
      }
      await page.screenshot({ path: path.join(out, `shell-phone-390-sheet-${sheetName.toLowerCase()}.png`) });
      await sheetTab.click();
      await sleep(200);
    }
    // Red when: the `shrink-0 whitespace-nowrap` classes are taken off the Attacks sheet's two buttons in AttackList (both wrap onto two lines at 390 px wide).
    // Seen: FAIL phone S12 the Flight and Attacks sheets' Add buttons keep their words on one line (Add Pilot, Add Strike, Add Attack)  + Add Pilot: 1 | + Add Strike: 2 | + Add Attack: 2   (the classes taken off both)
    ok('phone S12 the Flight and Attacks sheets\' Add buttons keep their words on one line (Add Pilot, Add Strike, Add Attack)',
      addLines.length === 3 && addLines.every((line) => line.endsWith(': 1')), addLines.join(' | '));
    const mapMenu = await menuRows();
    await page.screenshot({ path: path.join(out, 'shell-phone-390-menu.png') });
    // Red when: App's map menu loses its `{ label: 'Flight overview', ... }` row. (Argued, not run: a row loses its icon.)
    // Seen: FAIL phone S3 the map's menu leads with Flight overview, keeps Export .json and Close mission, and every row has an icon  Load a mission|Create new mission|Strike near me|Export .json|Close mission|Settings   (seen before About was a row: the rows now end with About)
    // Also red when: App's `menu={[...phoneMenu, aboutItem]}` becomes `menu={phoneMenu}`; or the About row loses its `icon: 'info'`.
    // Seen: FAIL phone S3 …  Flight overview|Load a mission|Create new mission|Strike near me|Export .json|Close mission|Settings   (the first; the second: the same rows with About, and the one row without an svg)
    ok('phone S3 the map\'s menu leads with Flight overview, keeps Export .json and Close mission, ends with About, and every row has an icon',
      same(rowNames(mapMenu), ['Flight overview', 'Load a mission', 'Create new mission', 'Strike near me', 'Export .json', 'Close mission', 'Settings', 'About']) && mapMenu.every((r) => r.icon), rowNames(mapMenu).join('|'));
    // ---- The menu from the keyboard, as the desktop's File menu answers it (the map's menu has eight rows).
    const menuBtn = page.getByRole('button', { name: 'Menu' });
    const focusedText = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);
    // (The menu was left open by the step above.)
    if ((await page.getByRole('menu').count()) > 0) await menuBtn.click();
    await menuBtn.focus();
    await page.keyboard.press('Enter');
    await sleep(100);
    const kOpened = (await page.getByRole('menu').count()) === 1;
    const kFirst = await focusedText();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const kThird = await focusedText();
    await page.keyboard.press('End');
    const kLast = await focusedText();
    await page.keyboard.press('ArrowDown');
    const kWrapped = await focusedText();
    await page.keyboard.press('ArrowUp');
    const kUpWrapped = await focusedText();
    await page.keyboard.press('Home');
    const kHome = await focusedText();
    await page.keyboard.press('Escape');
    await sleep(100);
    const kShut = (await page.getByRole('menu').count()) === 0;
    const kBack = await activeLabel(page);
    // Tab: open it again, Tab shuts it and the keyboard moves on (it is no longer in a menu).
    await page.keyboard.press('Enter');
    await sleep(100);
    await page.keyboard.press('Tab');
    await sleep(100);
    const kTabShut = (await page.getByRole('menu').count()) === 0;
    const kTabOn = await page.evaluate(() => !document.activeElement?.closest('[role="menu"]') && document.activeElement !== document.body);
    // Leave the menu shut whatever happened above (a press on Menu toggles it).
    if ((await page.getByRole('menu').count()) > 0) await menuBtn.click();
    // Red when: PhoneShell's window Escape listener (`window.addEventListener('keydown', onEscape);`) is taken out (the menu stays open on its third row).
    // Seen: FAIL phone K1 the Menu from the keyboard: …  opened true, first "Flight overview", Down twice "Create new mission", End "Settings", Down "Flight overview", Up "Settings", Home "Flight overview", Escape: menu shut false, keyboard on "null"; Tab: menu shut true, moved on true
    //   (the later Tab line is not to be trusted there: the Enter that reopens the menu lands on the row the shut menu should have left. Seen before About was a row: End and Up now land on About.)
    // Also red when: App's `menu={[...phoneMenu, aboutItem]}` becomes `menu={phoneMenu}` (End and Up land on Settings, not About).
    // Seen: FAIL phone K1 …  opened true, first "Flight overview", Down twice "Create new mission", End "Settings", Down "Flight overview", Up "Settings", Home "Flight overview", Escape: menu shut true, keyboard on "Menu"; Tab: menu shut true, moved on true
    ok('phone K1 the Menu from the keyboard: Enter opens it with the keyboard on its first row, Down twice reaches the third, End, Down, Up and Home move round it (the last row is About), Escape shuts it and puts the keyboard back on Menu, and Tab shuts it and moves on',
      kOpened && kFirst === 'Flight overview' && kThird === 'Create new mission' && kLast === 'About' && kWrapped === 'Flight overview' && kUpWrapped === 'About' && kHome === 'Flight overview'
        && kShut && kBack === 'Menu' && kTabShut && kTabOn,
      `opened ${kOpened}, first "${kFirst}", Down twice "${kThird}", End "${kLast}", Down "${kWrapped}", Up "${kUpWrapped}", Home "${kHome}", Escape: menu shut ${kShut}, keyboard on "${kBack}"; Tab: menu shut ${kTabShut}, moved on ${kTabOn}`);
    // ---- About, from the Menu's last row: a full-screen page with the same contents, no sideways scroll; Escape and its Close button shut it.
    const openAboutOnPhone = async () => {
      await menuBtn.click({ timeout: 3000 }).catch(() => {});
      await page.getByRole('menuitem', { name: 'About', exact: true }).click({ timeout: 3000 }).catch(() => {});
    };
    await openAboutOnPhone();
    const pAbout = await readAbout(page);
    await page.screenshot({ path: path.join(out, 'shell-phone-390-about.png') });
    const pSaid = aboutSays(pAbout);
    // Red when: App's `menu={[...phoneMenu, aboutItem]}` becomes `menu={phoneMenu}`; or AboutDialog's `versionLine(__APP_VERSION__)` becomes `versionLine('0.3.3')`; or `, CHUCKS_GUIDES` is taken out of creditList; or the web build is made to carry the elevation entry.
    // Seen: FAIL phone AB6 pressing About in the Menu opens the dialog named "About Phoenix Weaponeer", with the name and version, the owner and licence, the heading "Credits and sources" and an entry for each source  no dialog   (the first change; the second: order 6<-1<56<72<290 plain true; version "Version 0.3.3" (want "Version 0.3.4"); entries 5 of 5 …; the third: … entries 4 of 5: Map data | Figtree | JetBrains Mono | pydcs …; the fourth: … entries 6 of 5: Map data | Elevation data | … elevation words true)
    ok(`phone AB6 pressing About in the Menu opens the dialog named "${ABOUT}", with the name and version, the owner and licence, the heading "Credits and sources" and an entry for each source`,
      pAbout.opened && pAbout.title === ABOUT && pSaid.content && pSaid.entries, pSaid.detail);
    // Red when: a part of the dialog is made wider than it (`whitespace-nowrap` added to each entry's "takes" line in AboutDialog); or App's `menu={[...phoneMenu, aboutItem]}` becomes `menu={phoneMenu}` (no dialog).
    // Seen: FAIL phone AB7 the dialog is a page the width of the phone (390 px) and does not scroll sideways  box [0,0 to 390,844] in 390x844; page wide false; wider than itself div,div; parts outside the dialog 30   (the second change: no dialog)
    ok('phone AB7 the dialog is a page the width of the phone (390 px) and does not scroll sideways', aboutFits(pAbout, 390, 844, true), aboutFitText(pAbout));
    await page.keyboard.press('Escape');
    await sleep(150);
    const pShutByKey = pAbout.opened && (await page.getByRole('dialog', { name: ABOUT }).count()) === 0;
    await openAboutOnPhone();
    const pAgain = await readAbout(page);
    await page.getByRole('dialog', { name: ABOUT }).getByRole('button', { name: 'Close', exact: true }).click({ timeout: 3000 }).catch(() => {});
    await sleep(150);
    const pShutByButton = pAgain.opened && (await page.getByRole('dialog', { name: ABOUT }).count()) === 0;
    // Red when: DialogFrame's phone Close button `onClick={onClose}` becomes `onClick={() => {}}`; or App's `menu={[...phoneMenu, aboutItem]}` becomes `menu={phoneMenu}` (no dialog to shut).
    // Seen: FAIL phone AB8 Escape and its Close button each shut the dialog  Escape: shut true; Close button: shut false   (the first change; the second: Escape: shut false; Close button: shut false)
    ok('phone AB8 Escape and its Close button each shut the dialog', pShutByKey && pShutByButton, `Escape: shut ${pShutByKey}; Close button: shut ${pShutByButton}`);
    // Red when, Seen: as the desktop E1 (a stray request to another host).
    ok('phone E1 no page errors; only this server (tiles blocked)', errors.length === 0 && onlyLocal(hosts), `${errors.join('; ')} hosts ${[...hosts].join(',')}`);
    await ctx.close();
  }

  // A phone held sideways (844 x 390; useIsPhone calls anything under 500 px tall a phone): the map is only 276 px
  // tall, so the Layers panel is taller than the room under its button and has to stop short and scroll.
  {
    const { ctx, page, errors, hosts } = await newPage(browser, 844, 390, true);
    await page.goto(base);
    await waitForFront(page);
    await loadMission(page);
    await openTheMap(page);
    const top = await box(page.locator('header').first());
    const map = await box(page.locator('.leaflet-container'));
    const tabs = await box(page.getByRole('group', { name: 'Planner panels' }));
    const layersBtn = page.getByRole('button', { name: /^Layers/ });
    const layers = await box(layersBtn);
    const zoom = await box(page.getByRole('group', { name: 'Map zoom' }));
    const credit = await box(page.getByText('© OpenStreetMap contributors'));
    await page.screenshot({ path: path.join(out, 'shell-phone-844x390-map.png') });
    // Red when: Tabs' bar padding `pt-1.5` becomes `pt-3` (the tab bar grows to 75 px and the map shrinks).
    // Seen: FAIL phone L1 held sideways, the bars keep their size and the Layers button, zoom and credit keep their corners without meeting  top [0,0 844x45] map [0,45 844x270] tabs [0,315 844x75] layers [737,57 95x44] zoom [12,213 46x90] credit [645,285 191x22]
    ok('phone L1 held sideways, the bars keep their size and the Layers button, zoom and credit keep their corners without meeting',
      top.h === 45 && tabs.h === 69 && map.h === 390 - 45 - 69 && layers.r === map.r - 12 && layers.t === map.t + 12 && zoom.l <= 14 && zoom.b <= tabs.t && credit.r >= 830
        && !meet(layers, zoom) && !meet(zoom, credit) && !meet(layers, credit),
      `top ${fmt(top)} map ${fmt(map)} tabs ${fmt(tabs)} layers ${fmt(layers)} zoom ${fmt(zoom)} credit ${fmt(credit)}`);
    await layersBtn.click();
    await sleep(200);
    const dialog = page.getByRole('dialog', { name: 'Layers' });
    const pop = await box(dialog);
    const scrolls = await dialog.evaluate((el) => el.scrollHeight > el.clientHeight);
    await page.screenshot({ path: path.join(out, 'shell-phone-844x390-layers.png') });
    // Red when: LayersButton's wrapper `bottom-5` becomes `bottom-0` (the panel then runs to the map's foot instead of stopping 20 px short).
    // Seen: FAIL phone L2 held sideways, the Layers panel stops at least 20 px above the map's bottom and scrolls inside  panel [576,109 256x212] map [0,45 844x276] scrolls true
    ok('phone L2 held sideways, the Layers panel stops at least 20 px above the map\'s bottom and scrolls inside',
      pop && pop.t === layers.b + 8 && pop.b <= map.b - 20 && scrolls, `panel ${fmt(pop)} map ${fmt(map)} scrolls ${scrolls}`);
    // The credit chip stands in the same corner, and held sideways the panel is tall enough to reach it.
    // Red when: MapCredit's `ABOVE_CREDIT` is put back to the old `bottom-5` (the panel then runs 10 px under the chip).
    // Seen: FAIL phone L4 held sideways, the open Layers panel ends at least 8 px above the map credit's chip and still scrolls inside  panel [576,109 256x192] credit [645,291 191x22] scrolls true   (`bottom-5`: the panel reaches 10 px under the chip)
    ok('phone L4 held sideways, the open Layers panel ends at least 8 px above the map credit\'s chip and still scrolls inside', pop && credit && pop.b <= credit.t - 8 && scrolls, `panel ${fmt(pop)} credit ${fmt(credit)} scrolls ${scrolls}`);
    // Red when, Seen: as the desktop E1.
    ok('phone L3 held sideways, no page errors; only this server (tiles blocked)', errors.length === 0 && onlyLocal(hosts), `${errors.join('; ')} hosts ${[...hosts].join(',')}`);
    await ctx.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(out, 'shell-shots.log'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`${lines.filter((l) => l.startsWith('PASS')).length} PASS`);
  console.log(fails ? `${fails} FAIL` : 'all PASS');
  process.exitCode = fails ? 1 : 0;
})().catch(async (e) => {
  console.error('FAILED', e);
  // Leave no browser behind, and keep what was measured before the stop.
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(path.join(out, 'shell-shots.log'), lines.join('\n') + '\n');
  console.error(lines.join('\n'));
  process.exit(1);
});
