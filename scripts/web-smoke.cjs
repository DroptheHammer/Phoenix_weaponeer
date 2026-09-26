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
  const context = await browser.newContext({ viewport: { width: +w, height: +h }, acceptDownloads: true });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => {
    // Also printed as it happens, so it lands between the steps that caused it.
    console.log(`  (page error: ${e.message})`);
    problems.push(`pageerror: ${e.message}`);
  });
  const failedHosts = new Set();
  page.on('requestfailed', (r) => failedHosts.add(new URL(r.url()).host));
  page.on('console', (m) => {
    // Tile loads fail in the cloud sandbox (no browser proxy); those are listed by host below.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  process.on('exit', () => console.log(`FAILED REQUEST HOSTS: ${[...failedHosts].join(', ') || 'none'}`));
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const step = (s) => console.log(`STEP ${s}`);
  // The phone layout (see src/hooks/useIsPhone.ts) keeps file actions in the ⋯ menu.
  const phone = +w < 768 || +h < 500;
  const fileAction = async (desktopButton, menuItem) => {
    if (phone) {
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: menuItem }).click();
    } else {
      await page.getByRole('button', { name: desktopButton, exact: true }).click();
    }
  };
  step(`layout: ${phone ? 'phone' : 'desktop'} ${w}x${h}`);

  await page.goto(base);
  await page.getByRole('button', { name: 'Import FragOrders' }).waitFor({ timeout: 15000 });
  step('landing loaded');
  await shot('01-landing');

  await page.getByRole('button', { name: 'Import FragOrders' }).click();
  await page.getByRole('button', { name: 'From JSON' }).click();
  await page.getByPlaceholder('Or paste FragOrders JSON here...').fill(fixture);
  await page.getByRole('button', { name: 'Parse JSON' }).click();
  await page.getByRole('button', { name: 'Import Mission' }).waitFor({ timeout: 10000 });
  step('import preview shown');
  await shot('02-import-preview');
  await page.getByRole('button', { name: 'Import Mission' }).click();
  await page.getByRole('button', { name: /^Threats/ }).waitFor();
  step('mission imported');
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
    step(`desktop legend shown: ${await page.getByRole('button', { name: /Legend/ }).isVisible()}`);
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

  // Closing loses nothing: the mission was autosaved to "My missions".
  await fileAction('Close', 'Close mission');
  await page.getByText('My missions').waitFor({ timeout: 10000 });
  const listed = await page.getByRole('button', { name: new RegExp(savedJson.name) }).count();
  step(`closed; My missions lists "${savedJson.name}": ${listed > 0}`);
  await shot('05a-my-missions');
  await page.getByRole('button', { name: new RegExp(savedJson.name) }).first().click();
  await page.getByRole('button', { name: /^Threats/ }).waitFor({ timeout: 10000 });
  step('reopened from My missions');
  await fileAction('Close', 'Close mission');

  await page.getByRole('button', { name: 'Open .json File' }).waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByRole('button', { name: 'Open .json File' }).click(),
  ]);
  await chooser.setFiles(saved);
  await page.getByRole('button', { name: /^Threats/ }).waitFor({ timeout: 10000 });
  step(`reopened the saved mission (page errors so far: ${problems.length})`);
  await shot('05-reopened');

  await page.getByRole('button', { name: /^Attacks/ }).click();
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

  console.log(problems.length ? `PROBLEMS\n${problems.join('\n')}` : 'NO PAGE ERRORS');
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
