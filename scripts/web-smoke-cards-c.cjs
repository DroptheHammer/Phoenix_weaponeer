// Smoke test for the phone Cards tab's option C layout (vertical list, no
// carousel): imports the synthetic mission, plans three attacks through the
// desktop-size Add Attack dialog, then shrinks to a phone and walks the
// cards: scroll, zoom, kneeboard mode, per-card Share and pinned Share all.
// Adapted from web-smoke-cards.cjs — that script's carousel steps (swipe,
// the "n / n" indicator, ‹ › buttons) don't exist in this layout, so this
// copy swaps them for a vertical scroll and drops the indicator checks.
// Serve the build first, then run from the repo root:
//
//   npm run build:web && npx vite preview --config vite.config.web.ts --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/web-smoke-cards-c.cjs http://localhost:4173/ <screenshotDir> [width height]
//
// width × height is the phone size (default 390×844). Headless Chromium has no
// share sheet, so Share must fall back to downloads; the PNGs land in
// <screenshotDir>/downloads. Prints one STEP line per stage; a thrown error
// prints FAILED and exits 1.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [base, out, w = '390', h = '844'] = process.argv.slice(2);
const fixture = fs.readFileSync(path.join(__dirname, '../test-data/nevada_SYNTHETIC_link_payload.json'), 'utf8');
const downloads = path.join(out, 'downloads');
fs.mkdirSync(downloads, { recursive: true });

/** Width × height of a PNG, from its header. */
function pngSize(file) {
  const bytes = fs.readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, hasTouch: true });
  const page = await context.newPage();
  const problems = [];
  let lastStep = 'start';
  page.on('pageerror', (e) => problems.push(`pageerror after "${lastStep}": ${e.message}`));
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

  // ---- Seed: import and plan attacks at desktop size ----
  await page.goto(base);
  await page.getByRole('button', { name: 'Import FragOrders' }).click();
  await page.getByRole('button', { name: 'From JSON' }).click();
  await page.getByPlaceholder('Or paste FragOrders JSON here...').fill(fixture);
  await page.getByRole('button', { name: 'Parse JSON' }).click();
  await page.getByRole('button', { name: 'Import Mission' }).click();
  await page.getByRole('button', { name: /^Attacks/ }).waitFor();
  step('mission imported');

  // Pilot 1, pilot 2, then pilot 1 again: the repeat must get its own file name.
  const selectWith = (placeholder) => page.locator(`select:has(option:text("${placeholder}"))`);
  for (const attacker of [1, 2, 1]) {
    // Saving an attack closes the panel, so it is opened each time.
    await page.getByRole('button', { name: /^Attacks/ }).click();
    await page.getByRole('button', { name: '+ Add Attack' }).click();
    const target = selectWith('Select target');
    await target.selectOption(await target.locator('option', { hasText: 'TGT1' }).first().getAttribute('value'));
    await selectWith('Select attacker').selectOption({ index: attacker });
    const weapon = selectWith('Select weapon');
    if ((await weapon.count()) && (await weapon.inputValue()) === '') await weapon.selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Save attack$/ }).click();
    await page.getByRole('button', { name: /^Save attack$/ }).waitFor({ state: 'detached', timeout: 10000 });
  }
  step('three attacks saved');

  // ---- The phone ----
  await page.setViewportSize({ width: +w, height: +h });
  await page.getByRole('button', { name: /^Cards/ }).click();
  const list = page.getByLabel('Kneeboard cards');
  await list.waitFor();
  await list.getByRole('img').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500); // the other cards, and the map tiles giving up
  step(`cards drawn: ${await list.getByRole('img').count()} of 3`);
  await shot('01-cards-half');

  // Pull the sheet to full height: the list should use the full width there.
  await page.getByRole('button', { name: 'Expand' }).click();
  await page.waitForTimeout(400);
  const box = await list.getByRole('img').first().boundingBox();
  step(`full sheet: first card ${Math.round(box.width)}x${Math.round(box.height)} in a ${w}px screen`);
  await shot('02-cards-full');

  // Scroll the list down to the second card (no horizontal carousel here).
  await list.evaluate((el) => el.scrollTo({ top: el.children[1].offsetTop }));
  await page.waitForTimeout(500);
  step(`scrolled to second card: "${await list.locator('p').nth(1).innerText()}"`);
  await shot('03-scrolled');

  // Tap the second card: the zoom viewer.
  await list.getByRole('button', { name: /^Zoom/ }).nth(1).click();
  const zoom = page.getByRole('dialog', { name: /zoomed$/ });
  await zoom.waitFor();
  const zoomImg = zoom.getByRole('img');
  const before = await zoomImg.boundingBox();
  // A double-tap zooms in about the tap.
  await zoomImg.dblclick({ position: { x: before.width / 2, y: before.height / 3 } });
  await page.waitForTimeout(200);
  const after = await zoomImg.boundingBox();
  step(`zoom viewer: double-tap ${Math.round(before.width)} → ${Math.round(after.width)}px wide`);
  await shot('04-zoomed');
  await zoom.getByRole('button', { name: 'Close' }).click();
  await zoom.waitFor({ state: 'detached' });

  // Kneeboard mode opens on the same card, swipes, and hands its place back
  // (it scrolls the list to that card on close instead of a carousel page).
  await page.getByRole('button', { name: 'Kneeboard', exact: true }).click();
  const kb = page.getByRole('dialog', { name: 'Kneeboard mode' });
  await kb.waitFor();
  await page.waitForTimeout(300);
  step(`kneeboard mode opened at "${await kb.getByText(/^\d+ \/ \d+$/).innerText()}"`);
  await shot('05-kneeboard-mode');
  await kb.locator('div.overflow-x-auto').evaluate((el) => el.scrollTo({ left: 2 * el.clientWidth }));
  await page.waitForTimeout(500);
  step(`kneeboard mode swiped to "${await kb.getByText(/^\d+ \/ \d+$/).innerText()}"`);
  await shot('06-kneeboard-mode-swiped');
  await kb.getByRole('button', { name: 'Close' }).click();
  await kb.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  step('closed; back on the list');

  // Share: no share sheet in headless Chromium, so the cards download.
  // Per-card Share buttons all read exactly "Share", so a specific one is
  // picked by position within the list rather than by name.
  const shareAndCollect = async (locator, count) => {
    const got = [];
    const onDownload = (d) => got.push(d);
    page.on('download', onDownload);
    await locator.click();
    for (let i = 0; i < 50 && got.length < count; i++) await page.waitForTimeout(200);
    page.off('download', onDownload);
    const names = [];
    for (const d of got) {
      const file = path.join(downloads, d.suggestedFilename());
      await d.saveAs(file);
      names.push(`${d.suggestedFilename()} (${pngSize(file)})`);
    }
    return names;
  };
  const one = await shareAndCollect(list.getByRole('button', { name: 'Share', exact: true }).first(), 1);
  step(`Share (no share sheet): downloaded ${one.join(', ')}`);
  const all = await shareAndCollect(page.getByRole('button', { name: /^Share all/ }), 3);
  step(`Share all (no share sheet): downloaded ${all.length}: ${all.join(', ')}`);
  step(`message: "${await page.getByText(/downloaded 3 cards/).innerText()}"`);
  await shot('07-shared');

  // With a share sheet (stubbed), Share all hands over every card in one go.
  await page.evaluate(() => {
    window.__shared = [];
    navigator.canShare = () => true;
    navigator.share = async (data) => {
      window.__shared.push({ title: data.title, files: data.files.map((f) => `${f.name} ${f.type} ${f.size > 0}`) });
    };
  });
  await page.getByRole('button', { name: /^Share all/ }).click();
  await page.getByText(/^Shared 3 cards/).waitFor({ timeout: 10000 });
  const shared = await page.evaluate(() => window.__shared);
  step(`Share all (share sheet): one call, ${shared.length === 1 ? shared[0].files.length : '?'} files, title "${shared[0]?.title}"`);
  // Closing the sheet is not an error.
  await page.evaluate(() => {
    navigator.share = async () => {
      throw new DOMException('Share canceled', 'AbortError');
    };
  });
  await list.getByRole('button', { name: 'Share', exact: true }).first().click();
  await page.waitForTimeout(500);
  step(`cancelled share leaves no error: ${(await page.getByText(/^Error/).count()) === 0}`);

  // Landscape phone: kneeboard mode fits the card to the height.
  await page.setViewportSize({ width: +h, height: +w });
  await page.getByRole('button', { name: 'Kneeboard', exact: true }).click();
  await page.getByRole('dialog', { name: 'Kneeboard mode' }).waitFor();
  await page.waitForTimeout(400);
  await shot('08-kneeboard-landscape');
  await page.getByRole('dialog', { name: 'Kneeboard mode' }).getByRole('button', { name: 'Close' }).click();
  step('landscape kneeboard mode shown');

  console.log(problems.length ? `PROBLEMS\n${problems.join('\n')}` : 'NO PAGE ERRORS');
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
