// Smoke test for "Strike near me" (web build) on a phone, with the browser's
// location mocked to a synthetic point (never a real address — CLAUDE.md,
// Privacy). Serve the build first, then run from the repo root:
//
//   npm run build:web && npx vite preview --config vite.config.web.ts --port 4173 &
//   NODE_PATH=$(npm root -g) node scripts/web-smoke-strike.cjs http://localhost:4173/ <screenshotDir> [width height]
//
// Checks: the location is found, the crosshair sets the target, the mission
// is on the real-world pseudo-theater with its banner, an attack auto-builds,
// and both the card share and the .json export warn about the real location
// first. Prints one STEP line per stage; a thrown error prints FAILED.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [base, out, w = '390', h = '844'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const SYNTHETIC = { latitude: 10, longitude: 20, accuracy: 12 };

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: +w, height: +h },
    hasTouch: true,
    acceptDownloads: true,
    permissions: ['geolocation'],
    geolocation: SYNTHETIC,
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  const failedHosts = new Set();
  page.on('requestfailed', (r) => failedHosts.add(new URL(r.url()).host));
  process.on('exit', () => console.log(`FAILED REQUEST HOSTS: ${[...failedHosts].join(', ') || 'none'}`));
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const step = (s) => console.log(`STEP ${s}`);

  await page.goto(base);
  await page.getByRole('button', { name: '📍 Strike near me' }).click();
  await page.getByText(/Move the map to put the crosshair/).waitFor({ timeout: 15000 });
  step(`location found: ${(await page.getByText(/you are the blue dot/).innerText()).trim()}`);
  await page.waitForTimeout(800);
  await shot('01-pick');
  await page.getByRole('button', { name: 'Set target here' }).click();
  step((await page.getByText(/^Target set at/).innerText()).replace(/\s*Move it$/, ''));
  await shot('02-details');
  await page.getByRole('button', { name: 'Create mission' }).click();
  await page.getByText("Real world: can't be flown in DCS").waitFor({ timeout: 10000 });
  step('mission created; real-world banner shown');
  await page.waitForTimeout(800);
  await shot('03-mission');

  await page.getByRole('button', { name: /^Route/ }).click();
  const route = await page.locator('[role=dialog]').last().innerText();
  step(`route lists IP and TGT: ${/IP/.test(route) && /TGT/.test(route)}`);
  await page.getByRole('button', { name: /^Attacks/ }).click();
  await page.getByRole('button', { name: '+ Add Attack' }).click();
  // Pick the option matching `match`, else the first real one.
  const pick = async (placeholder, match) => {
    const sel = page.locator('select', { has: page.locator('option', { hasText: placeholder }) }).first();
    const labels = await sel.locator('option').allTextContents();
    const i = labels.findIndex((t, k) => k > 0 && (!match || match.test(t)));
    await sel.selectOption({ index: i > 0 ? i : 1 });
    return (await sel.locator('option:checked').innerText()).trim();
  };
  step(`picked ${await pick('Select target…', /TGT/)} / ${await pick('Select attacker…')} / ${await pick('Select weapon…')}`);
  await page.waitForTimeout(800);
  await shot('04-attack');
  await page.getByRole('button', { name: 'Save attack' }).click();
  await page.getByRole('button', { name: 'Save attack' }).waitFor({ state: 'detached', timeout: 5000 });
  step('attack saved');

  await page.getByRole('button', { name: /^Cards/ }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const warned = await page.getByRole('button', { name: 'Share anyway' }).isVisible();
  step(`card share warns first: ${warned}`);
  await shot('05-share-warning');
  const [card] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: 'Share anyway' }).click(),
  ]);
  step(`after "Share anyway": ${card.suggestedFilename()}`);

  await page.getByRole('button', { name: 'Menu' }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByRole('menuitem', { name: 'Export .json' }).click(),
  ]);
  step(`export asked first: ${dialogs.some((d) => /real location/.test(d))}; saved ${file.suggestedFilename()}`);

  console.log(problems.length ? `PROBLEMS\n${problems.join('\n')}` : 'NO PAGE ERRORS');
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
