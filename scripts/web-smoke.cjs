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
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  const failedHosts = new Set();
  page.on('requestfailed', (r) => failedHosts.add(new URL(r.url()).host));
  page.on('console', (m) => {
    // Tile loads fail in the cloud sandbox (no browser proxy); those are listed by host below.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  process.on('exit', () => console.log(`FAILED REQUEST HOSTS: ${[...failedHosts].join(', ') || 'none'}`));
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const step = (s) => console.log(`STEP ${s}`);

  await page.goto(base);
  await page.getByRole('button', { name: 'Import', exact: true }).waitFor({ timeout: 15000 });
  step('landing loaded');
  await shot('01-landing');

  await page.getByRole('button', { name: 'Import', exact: true }).click();
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

  // Save = a download of the mission JSON, which Open must read back.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByRole('button', { name: 'Save As' }).click(),
  ]);
  const saved = path.join(out, download.suggestedFilename());
  await download.saveAs(saved);
  const savedJson = JSON.parse(fs.readFileSync(saved, 'utf8'));
  step(`saved ${download.suggestedFilename()} with ${savedJson.waypoints.length} waypoints, ${savedJson.threats.length} threats`);

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByRole('button', { name: 'Open', exact: true }).click(),
  ]);
  await chooser.setFiles(saved);
  await page.getByRole('button', { name: /^Threats/ }).waitFor({ timeout: 10000 });
  step('reopened the saved mission');
  await shot('05-reopened');

  await page.getByRole('button', { name: /^Attacks/ }).click();
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
