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
  page.on('pageerror', (e) => problems.push(`pageerror (after "${lastStep}"): ${e.message}\n${(e.stack || '').split('\n').slice(1, 6).join('\n')}`));
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
  // Give the map's opening zoom time to end. Closing mid-zoom removes the map
  // while Leaflet's 250 ms zoom-end timer is still pending, and that timer
  // throws `_leaflet_pos` (a MapView issue on its own; no person closes that fast).
  await page.waitForTimeout(1000);
  await fileAction('Close', 'Close mission');

  await page.getByRole('button', { name: 'Open .json File' }).waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByRole('button', { name: 'Open .json File' }).click(),
  ]);
  await chooser.setFiles(saved);
  await page.getByRole('button', { name: /^Threats/ }).waitFor({ timeout: 10000 });
  step('reopened the saved mission');
  await shot('05-reopened');

  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Attacks/ }).click();
  await page.waitForTimeout(600);
  step('attacks panel opened');
  await page.getByRole('button', { name: '+ Add Attack' }).click();
  await page.waitForTimeout(1500);
  await shot('06-attack-editor');
  step('attack editor opened');

  // The preview map must have a real size, or Leaflet throws (_leaflet_pos).
  const mapBox = async () => {
    const box = await page.locator('[role=dialog] .leaflet-container, .fixed .leaflet-container').last().boundingBox();
    return box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none';
  };
  step(`preview map ${await mapBox()}`);

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
  // The Attacks tab counts them: "Attacks (1)" on the desktop, "Attacks 1" on a phone.
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
