// Smoke test for the web build: drives it end to end in Chromium, with the
// synthetic mission in test-data (no real mission needed). Serve the build
// first, then run from the repo root:
//
//   npm run build:web && npx vite preview --config vite.config.web.ts --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/web-smoke.cjs http://localhost:4173/ <screenshotDir> [width height]
//
// Needs Playwright installed globally (it is in Claude Code cloud sessions).
// Prints one STEP line per stage; a thrown error prints FAILED and exits 1.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [base, out, w = '1280', h = '800'] = process.argv.slice(2);
const fixture = fs.readFileSync(path.join(__dirname, '../test-data/nevada_SYNTHETIC_link_payload.json'), 'utf8');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  // A phone gets touch events, which the attack editor's swipe between jets needs.
  const context = await browser.newContext({ viewport: { width: +w, height: +h }, acceptDownloads: true, hasTouch: +w < 768 || +h < 500 });
  const page = await context.newPage();
  const problems = [];
  let lastStep = 'start';
  page.on('pageerror', (e) => {
    // Also printed as it happens, so it lands between the steps that caused it.
    console.log(`  (page error: ${e.message})`);
    problems.push(`pageerror (after "${lastStep}"): ${e.message}\n${(e.stack || '').split('\n').slice(1, 6).join('\n')}`);
  });
  const failedHosts = new Set();
  page.on('requestfailed', (r) => failedHosts.add(new URL(r.url()).host));
  page.on('console', (m) => {
    // Tile loads fail in the cloud sandbox (no browser proxy); those are listed by host below.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  process.on('exit', () => console.log(`FAILED REQUEST HOSTS: ${[...failedHosts].join(', ') || 'none'}`));
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const step = (s) => {
    lastStep = s;
    console.log(`STEP ${s}`);
  };
  // The phone layout (see src/hooks/useIsPhone.ts) keeps file actions in the ⋯ menu.
  const phone = +w < 768 || +h < 500;
  const fileAction = async (desktopButton, menuItem) => {
    if (phone) {
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: menuItem }).click();
    } else if (desktopButton === 'Export .json') {
      // The planner's one filled button (Save, "Export .json" in the browser).
      await page.getByRole('button', { name: desktopButton, exact: true }).click();
    } else {
      // Everything else is under the header's File menu.
      await page.getByRole('button', { name: 'File', exact: true }).click();
      await page.getByRole('menuitem', { name: desktopButton, exact: true }).click();
    }
  };
  // Every load lands on the Flight overview; its "Open the map" (the header's filled button on the desktop, the
  // pinned button at the foot on a phone) goes on to the planner.
  const openTheMap = async () => {
    await page.getByRole('button', { name: 'Open the map', exact: true }).click();
    await page.getByRole('button', { name: /^Threats/ }).waitFor({ timeout: 10000 });
  };
  step(`layout: ${phone ? 'phone' : 'desktop'} ${w}x${h}`);

  await page.goto(base);
  await page.getByRole('heading', { name: 'Load a mission' }).waitFor({ timeout: 15000 });
  step('front page loaded');
  await shot('01-landing');

  await page.getByPlaceholder('Paste a FragOrders link').fill(fixture);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose your flight' }).waitFor({ timeout: 10000 });
  step('import preview shown');
  await shot('02-import-preview');
  await page.getByRole('button', { name: /^Import / }).click();
  await page.getByRole('button', { name: 'Open the map', exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'Jets and loadouts' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500); // the overview's map tiles
  const jetCards = await page.locator('article').count();
  const picker = page.getByRole('button', { name: /^Waypoint for the threat list: / });
  step(`mission imported; the Flight overview shows ${jetCards} jet cards, the threat block is about "${(await picker.getAttribute('aria-label')).replace(/^Waypoint for the threat list: |\. Change$/g, '')}"`);
  await shot('03a-overview');
  // The waypoint list opens from its button and closes with Escape, focus back on the button.
  await picker.click();
  const rows = await page.getByRole('menuitemradio').count();
  await shot('03b-overview-waypoints');
  await page.keyboard.press('Escape');
  await page.getByRole('menuitemradio').first().waitFor({ state: 'detached', timeout: 5000 });
  step(`waypoint list: ${rows} waypoints offered; Escape closed it, focus back on its button: ${await picker.evaluate((el) => el === document.activeElement)}`);
  await openTheMap();
  step('map opened from the overview');
  await page.waitForTimeout(1500); // map tiles
  await shot('03-mission-map');

  await page.getByRole('button', { name: /^Threats/ }).click();
  await page.waitForTimeout(300);
  await shot('04-threats');
  const threatText = await page.locator('body').innerText();
  step(`threat panel mentions Kub: ${/Kub/.test(threatText)}, Shilka: ${/Shilka/.test(threatText)}`);

  // Placing a threat: a click on the desktop, the centre crosshair on a phone.
  const mapBox = await page.locator('.leaflet-container').first().boundingBox();
  // Modal's backdrop (desktop) or page (phone); only the phone one is a role=dialog.
  const addForm = page.locator('div.fixed.inset-0').filter({ hasText: 'Add Planning Threat' });
  const latInput = page.getByPlaceholder('e.g., 36.12345');
  const lonInput = page.getByPlaceholder('e.g., -115.12345');
  const formCoords = async () => `${await latInput.inputValue()},${await lonInput.inputValue()}`;
  const panMap = async (dx, dy) => {
    const x = mapBox.x + mapBox.width / 2;
    const y = mapBox.y + mapBox.height / 3;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  if (phone) {
    // The same pick twice, once without panning and once after a pan: both
    // fill the form, and the pan must change where it lands.
    await page.getByRole('button', { name: '+ Add Threat' }).click();
    await page.getByRole('button', { name: 'Set here' }).waitFor({ timeout: 5000 });
    const sheetHidden = !(await page.getByRole('dialog', { name: 'Threats' }).isVisible());
    await shot('04b-crosshair');
    await page.getByRole('button', { name: 'Set here' }).click();
    await addForm.waitFor({ timeout: 5000 });
    const unpanned = await formCoords();
    await addForm.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: '+ Add Threat' }).click();
    await page.getByRole('button', { name: 'Set here' }).waitFor({ timeout: 5000 });
    await panMap(-120, -80);
    await page.getByRole('button', { name: 'Set here' }).click();
    await addForm.waitFor({ timeout: 5000 });
    const panned = await formCoords();
    step(`crosshair pick: sheet hidden ${sheetHidden}; unpanned ${unpanned}; panned ${panned}; moved ${unpanned !== panned && !panned.includes(',,')}`);
  } else {
    await page.getByRole('button', { name: '+ Add Threat' }).click();
    await page.getByText('Click map to place threat').waitFor({ timeout: 5000 });
    await page.mouse.click(mapBox.x + mapBox.width / 3, mapBox.y + mapBox.height / 2);
    await addForm.waitFor({ timeout: 5000 });
    step(`click pick filled ${await formCoords()}`);
  }
  await addForm.locator('select').selectOption({ index: 1 });
  await addForm.getByRole('button', { name: 'Add Threat' }).click();
  await addForm.waitFor({ state: 'detached', timeout: 5000 });
  const plannedCoords = () => page.locator('.border-orange-500 .font-mono').first().innerText();
  const placedAt = await plannedCoords();
  step(`planning threat added at ${placedAt}`);

  if (phone) {
    // Move instead of drag: close the sheet, tap the new threat (the last
    // threat marker drawn), Move, pan, "Move here".
    await page.getByRole('button', { name: 'Close Threats' }).click();
    await page.waitForTimeout(300);
    await page.locator('.custom-threat-marker').last().click({ force: true });
    await page.getByRole('button', { name: 'Move', exact: true }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(400); // popup fade-in
    await shot('04c-threat-popup');
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await page.getByRole('button', { name: 'Move here' }).waitFor({ timeout: 5000 });
    // Move first pans the map onto the threat; a drag during that animation
    // is overridden by it, as it would be for a person.
    await page.waitForTimeout(800);
    await panMap(90, 60);
    await page.getByRole('button', { name: 'Move here' }).click();
    await page.getByRole('button', { name: /^Threats/ }).click();
    await page.waitForTimeout(300);
    const movedTo = await plannedCoords();
    step(`moved planning threat: ${placedAt} -> ${movedTo}; changed ${movedTo !== placedAt}`);
    await page.getByRole('button', { name: 'Close Threats' }).click();

    // Layers: the legend folds into a button; toggle the route off and back.
    await page.getByRole('button', { name: 'Layers' }).click();
    const route = page.getByRole('checkbox', { name: /Route/ });
    await route.uncheck();
    await shot('04d-layers');
    const polylines = await page.locator('.leaflet-overlay-pane path[stroke-dasharray="5, 10"]').count();
    step(`layers: route hidden (dashed route lines left: ${polylines}), filter dot shown: ${await page.getByLabel('some layers hidden').count() > 0}`);
    await route.check();
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height - 40);
    step(`layers panel closes on an outside tap: ${!(await page.getByRole('dialog', { name: 'Layers' }).isVisible())}`);
    await page.getByRole('button', { name: /^Threats/ }).click();
  } else {
    // The desktop Legend is one small button at the map's bottom-left corner, shut as the app starts. Open it, switch the
    // route off, shut it with Escape (the button then says "filtered"), open it again, Show all puts the route back.
    const legendButton = page.getByRole('button', { name: /^Legend/ });
    step(`desktop legend shown: ${await legendButton.isVisible()}; shut as the app starts: ${(await legendButton.getAttribute('aria-expanded')) === 'false'}`);
    await legendButton.click();
    const route = page.getByRole('checkbox', { name: /Route/ });
    await route.uncheck();
    await shot('04d-legend');
    const polylines = await page.locator('.leaflet-overlay-pane path[stroke-dasharray="5, 10"]').count();
    await page.keyboard.press('Escape');
    const shutNow = (await legendButton.getAttribute('aria-expanded')) === 'false';
    const words = (await legendButton.innerText()).replace(/\s+/g, ' ').trim();
    step(`legend: route hidden (dashed route lines left: ${polylines}); Escape shut it: ${shutNow}; the shut button reads "${words}"`);
    await legendButton.click();
    await page.getByRole('button', { name: 'Show all' }).click();
    step(`legend: Show all put the route back: ${await route.isChecked()}`);
    await legendButton.click();
  }

  // Export = a download of the mission JSON, which Open must read back.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    fileAction('Export .json', 'Export .json'),
  ]);
  const saved = path.join(out, download.suggestedFilename());
  await download.saveAs(saved);
  const savedJson = JSON.parse(fs.readFileSync(saved, 'utf8'));
  step(`exported ${download.suggestedFilename()} with ${savedJson.waypoints.length} waypoints, ${savedJson.threats.length} threats`);

  // Closing loses nothing: the mission was autosaved, and the front page lists it under "Recent missions".
  await fileAction('Close', 'Close mission');
  await page.getByRole('heading', { name: 'Recent missions' }).waitFor({ timeout: 10000 });
  const listed = await page.getByRole('button', { name: new RegExp(savedJson.name) }).count();
  step(`closed; Recent missions lists "${savedJson.name}": ${listed > 0}`);
  await shot('05a-my-missions');
  await page.getByRole('button', { name: new RegExp(savedJson.name) }).first().click();
  await openTheMap();
  step('reopened from Recent missions (the overview, then the map)');
  // Closed at once on purpose: closing mid-zoom used to throw `_leaflet_pos`
  // from Leaflet's zoom-end timer (fixed by map/ZoomTimerGuard).
  await fileAction('Close', 'Close mission');

  // The front page's load box reads a saved mission too.
  await page.getByRole('button', { name: 'Choose file' }).waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByRole('button', { name: 'Choose file' }).click(),
  ]);
  await chooser.setFiles(saved);
  await openTheMap();
  step(`reopened the saved mission, overview then map (page errors so far: ${problems.length})`);
  await shot('05-reopened');

  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Attacks/ }).click();
  await page.waitForTimeout(600);
  step('attacks panel opened');
  if (phone) {
    // Tooltip text a phone can't hover over sits behind an ⓘ.
    await page.getByRole('button', { name: 'About strikes' }).click();
    step(`strike hint shown: ${await page.getByText('Plan the flight together').isVisible()}`);
    await shot('05b-attacks-hint');
  }
  await page.getByRole('button', { name: '+ Add Attack' }).click();
  await page.waitForTimeout(1500);
  await shot('06-attack-editor');
  step('attack editor opened');

  // The preview map must have a real size, or Leaflet throws (_leaflet_pos).
  const previewMapSize = async () => {
    const box = await page.locator('[role=dialog] .leaflet-container, .fixed .leaflet-container').last().boundingBox();
    return box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none';
  };
  step(`preview map ${await previewMapSize()}`);

  // Pick an option in the select whose placeholder is `placeholder`.
  const pick = async (placeholder, match) => {
    const sel = page.locator('select', { has: page.locator('option', { hasText: placeholder }) }).first();
    const labels = await sel.locator('option').allTextContents();
    let i = labels.findIndex((t, k) => k > 0 && match && match.test(t));
    if (i < 0) i = labels.length > 1 ? 1 : -1;
    if (i < 0) throw new Error(`nothing to pick for "${placeholder}"`);
    await sel.selectOption({ index: i });
    return labels[i];
  };
  const buildAttack = async () => {
    const target = await pick('Select target…', /TGT1/);
    const attacker = await pick('Select attacker…');
    const weapon = await pick('Select weapon…', /Mk-82/);
    step(`picked ${target} / ${attacker} / ${weapon}`);
  };
  await buildAttack();
  await page.waitForTimeout(800);
  await shot('07-attack-built');

  await page.getByRole('button', { name: /Customize/ }).click();
  await page.waitForTimeout(300);
  if (phone) {
    // −/+ step buttons; the box beside the label carries the same name.
    const up = page.locator('button[aria-label$=": up one step"]:enabled').first();
    const name = (await up.getAttribute('aria-label')).replace(/: up one step$/, '');
    const boxOf = page.getByRole('spinbutton', { name, exact: true }).first();
    const shown = async () => (await boxOf.inputValue()) || `(${await boxOf.getAttribute('placeholder')})`;
    const before = await shown();
    await up.scrollIntoViewIfNeeded();
    await up.click();
    const afterUp = await shown();
    await page.locator(`button[aria-label="${name}: down one step"]`).first().click();
    step(`"${name}" ${before} → + ${afterUp} → − ${await shown()}`);
  } else {
    const slider = page.locator('input[type=range]:enabled').first();
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    step('slider nudged with the keyboard');
  }
  await page.waitForTimeout(300);
  await shot('08-customize');

  await page.getByRole('button', { name: 'Save attack' }).click();
  await page.getByRole('button', { name: 'Save attack' }).waitFor({ state: 'detached', timeout: 5000 });
  // The Attacks tab counts them: the rail button's badge on the desktop ("1" over "Attacks"), "Attacks 1" on a phone.
  const attackCount = async () => (await page.getByRole('button', { name: /^Attacks/ }).first().innerText()).match(/\d+/)?.[0] ?? '0';
  step(`attack saved; Attacks tab counts ${await attackCount()}`);
  await shot('09-attack-saved');

  // A strike: two jets, a swipe (phone) or a tap moves from the Group tab to jet #1.
  // On a phone, saving closes the sheet to show the attack on the map.
  if (!(await page.getByRole('button', { name: '+ Add Attack' }).isVisible())) await page.getByRole('button', { name: /^Attacks/ }).click();
  await page.getByRole('button', { name: '+ Add Attack' }).click();
  await page.waitForTimeout(500);
  await buildAttack();
  await page.getByRole('button', { name: /\+ Wingman/ }).click();
  await page.getByRole('button', { name: 'Group', pressed: true }).waitFor({ timeout: 5000 });
  step('strike opened on the Group tab');
  await page.waitForTimeout(800);
  await shot('10-strike-group');
  if (phone) {
    const controls = page.locator('.overflow-y-auto.overscroll-contain').last();
    const b = await controls.boundingBox();
    const y = b.y + Math.min(60, b.height / 2);
    const cdp = await context.newCDPSession(page);
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', b.x + b.width - 30);
    for (const f of [0.75, 0.5, 0.25]) await touch('touchMove', b.x + b.width * f);
    await touch('touchEnd');
    await page.waitForTimeout(400);
  } else {
    await page.getByRole('button', { name: /^#1 / }).click();
  }
  const onJet1 = (await page.getByRole('button', { name: /^#1 /, pressed: true }).count()) > 0;
  step(`${phone ? 'swiped' : 'tapped'} to jet #1: ${onJet1}`);
  await shot('11-strike-jet1');
  if (phone) {
    await page.getByRole('button', { name: /Side view/ }).click();
    await page.waitForTimeout(300);
    await shot('12-side-view');
  }
  // The fixture's jets carry no loadout, so #2 has no weapon until one is picked.
  await page.getByRole('button', { name: /^#2 / }).click();
  await pick('Select weapon…', /Mk-82/);
  await page.waitForTimeout(500);
  await shot('12b-strike-jet2');
  await page.getByRole('button', { name: 'Save strike' }).click();
  await page.getByRole('button', { name: 'Save strike' }).waitFor({ state: 'detached', timeout: 5000 });
  step(`strike saved; Attacks tab counts ${await attackCount()}`);
  await shot('13-strike-saved');

  console.log(problems.length ? `PROBLEMS\n${problems.join('\n')}` : 'NO PAGE ERRORS');
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
