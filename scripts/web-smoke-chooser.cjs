// Smoke test for "Choose your flight" under "Unsaved changes" (web build): with unsaved work, pressing Import
// opens "Unsaved changes" ON TOP of the flight chooser; Cancel comes back to the chooser with the flight still
// chosen; one Escape closes only the dialog on top; Discard imports. Runs at desktop size (1280 x 800, the
// chooser is a dialog) or phone size (390 x 844, the chooser is a sheet with a key handler of its own). Serve
// the build first, then run from the repo root:
//
//   npm run build:web && npx vite preview --config vite.config.web.ts --port 4173 &
//   PLAYWRIGHT_MODULE=<path to playwright or playwright-core> CHROME_PATH=<a Chromium binary> \
//     node scripts/web-smoke-chooser.cjs http://localhost:4173/ <screenshotDir> [width height]
//
// PLAYWRIGHT_MODULE and CHROME_PATH are optional: left out, it loads require('playwright') (give
// NODE_PATH=$(npm root -g) for a global install) and Playwright's own browser.
//
// The web build asks "Unsaved changes" only when its autosave failed, so the browser's mission store is made to
// refuse every write (IDBObjectStore.put throws). A fresh import is unsaved work, so no edit is needed.
//
// This is the one path in the web build that opens a dialog over a dialog, so it is also the browser proof of
// Modal's on-top rule (ui-check's DS23 holds only the helper).
//
// Prints one STEP line for each thing it proves; a thrown error prints FAILED and exits 1.
//
// Red when (phone, 390 x 844): App.tsx leaves `suspended={pendingAction !== null}` off the chooser (the sheet's own key
// handler then takes the Escape meant for "Unsaved changes").
// Seen: FAILED one Escape closed "Choose your flight" as well as "Unsaved changes"
// Red when (desktop, 1280 x 800): Modal's line `if (!root || !isTopDialog(root, document)) return;` loses its
// `isTopDialog` half, so the chooser's Modal answers the Escape too.
// Seen: FAILED one Escape closed "Choose your flight" as well as "Unsaved changes"
// (On the desktop the chooser's own `suspended` is not what holds the key: the Modal's on-top rule is, which is
// why this run is also the browser proof of that rule.)
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const fs = require('fs');
const path = require('path');

const [base, out, w = '1280', h = '800'] = process.argv.slice(2);
if (!base || !out) {
  console.error('usage: node scripts/web-smoke-chooser.cjs <url> <screenshotDir> [width height]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const fixture = fs.readFileSync(path.join(__dirname, '../test-data/nevada_SYNTHETIC_link_payload.json'), 'utf8');
// The phone layout (see src/hooks/useIsPhone.ts) keeps header actions in the menu.
const phone = +w < 768 || +h < 500;

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const context = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: phone });
  await context.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Storage refused (smoke test)', 'QuotaExceededError');
    };
  });
  const page = await context.newPage();
  const problems = [];
  let lastStep = 'start';
  page.on('pageerror', (e) => problems.push(`pageerror after "${lastStep}": ${e.message}`));
  page.on('console', (m) => {
    // Map tiles fail without a network; anything else is a problem.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const step = (s) => {
    lastStep = s;
    console.log(`STEP ${s}`);
  };

  // includeHidden: on a phone the sheet is hidden from screen readers while "Unsaved changes" stands over it,
  // and it must still be counted as there.
  const chooser = page.getByRole('dialog', { name: 'Choose your flight', includeHidden: true });
  const unsaved = page.getByRole('dialog', { name: 'Unsaved changes' });
  const importFlight = () => page.getByRole('button', { name: /^Import / });

  /** Where focus is, in words, and whether it is on or inside the chooser. */
  const focusInChooser = () =>
    page.evaluate(() => {
      const root = document.querySelector('[role="dialog"][aria-label="Choose your flight"]');
      const a = document.activeElement;
      return { inside: !!root && !!a && root.contains(a), words: a ? `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30)}"` : 'nothing' };
    });

  /** Paste the fixture into the load box and press Load; "Choose your flight" opens. */
  const loadFixture = async () => {
    await page.getByRole('heading', { name: 'Load a mission' }).waitFor({ timeout: 15000 });
    await page.getByPlaceholder('Paste a FragOrders link').fill(fixture);
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await chooser.waitFor({ timeout: 10000 });
  };
  /** Import in the header's File menu (desktop) or the menu's "Load a mission" (phone): back to the front page, mission kept. */
  const toFrontPage = async () => {
    if (phone) {
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: 'Load a mission' }).click();
    } else {
      await page.getByRole('button', { name: 'File', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
    }
  };
  /** Press Import in the chooser: with the autosave refused, "Unsaved changes" opens. */
  const pressImport = async () => {
    await importFlight().click();
    await unsaved.waitFor({ timeout: 10000 });
  };

  step(`layout: ${phone ? 'phone' : 'desktop'} ${w}x${h}`);

  // ---- A mission is open, and it is unsaved ----
  await page.goto(base);
  await loadFixture();
  await importFlight().click();
  // An import lands on the Flight overview.
  await page.getByRole('button', { name: 'Open the map', exact: true }).waitFor({ timeout: 15000 });
  step('a mission is open (its autosave is refused, so it counts as unsaved)');

  // ---- Load it again: Import asks first, over the chooser ----
  await toFrontPage();
  await loadFixture();
  await shot('01-chooser');
  await pressImport();
  await shot('02-unsaved-over-chooser');
  // Read now, judged after the Escape step below, so a sheet that is not suspended fails on its Escape first.
  const sheetHidden = phone ? await chooser.getAttribute('aria-hidden') : null;
  step('Import asked "Unsaved changes" with the chooser still open under it');

  // "On top" is proved by a click: it is refused if another element would receive it.
  await unsaved.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 5000 });
  await unsaved.waitFor({ state: 'detached', timeout: 5000 });
  if ((await chooser.count()) === 0) throw new Error('Cancel closed "Choose your flight" as well as "Unsaved changes"');
  const afterCancel = await focusInChooser();
  if (!afterCancel.inside) throw new Error(`after Cancel, focus is not back in the chooser (on ${afterCancel.words})`);
  if (phone && (await chooser.getAttribute('aria-hidden')) === 'true') throw new Error('the phone sheet is still hidden from screen readers after Cancel');
  if (!(await importFlight().isEnabled())) throw new Error('after Cancel the chooser has lost its chosen flight (Import is disabled)');
  step(`Cancel came back to the chooser, flight still chosen, focus on ${afterCancel.words}`);

  // ---- One Escape closes only the dialog on top ----
  await pressImport();
  await page.keyboard.press('Escape');
  await unsaved.waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(500);
  if ((await chooser.count()) === 0) throw new Error('one Escape closed "Choose your flight" as well as "Unsaved changes"');
  const afterEscape = await focusInChooser();
  if (!afterEscape.inside) throw new Error(`after Escape, focus is not back in the chooser (on ${afterEscape.words})`);
  step(`one Escape closed only "Unsaved changes"; the chooser is still open, focus on ${afterEscape.words}`);
  if (phone && sheetHidden !== 'true') throw new Error(`the phone sheet was not hidden from screen readers under "Unsaved changes" (aria-hidden was ${sheetHidden})`);
  if (phone) step('the phone sheet was aria-hidden while "Unsaved changes" stood over it');

  // ---- The next Escape belongs to the chooser, and focus goes to the load box ----
  await page.keyboard.press('Escape');
  await chooser.waitFor({ state: 'detached', timeout: 5000 });
  await page.waitForTimeout(400);
  const field = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'));
  if (field !== 'Paste a FragOrders link') throw new Error(`after the chooser closed, focus is not in the load box (on ${field})`);
  step('the next Escape closed the chooser; the box kept its text and has focus');

  // ---- Discard: the import goes ahead ----
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await chooser.waitFor({ timeout: 10000 });
  await pressImport();
  await unsaved.getByRole('button', { name: 'Discard', exact: true }).click();
  await unsaved.waitFor({ state: 'detached', timeout: 5000 });
  await chooser.waitFor({ state: 'detached', timeout: 5000 });
  await page.getByRole('button', { name: 'Open the map', exact: true }).waitFor({ timeout: 15000 });
  step('Discard imported the flight and landed on the Flight overview');
  await shot('03-imported');

  console.log(problems.length ? `PROBLEMS\n${problems.join('\n')}` : 'NO PAGE ERRORS');
  await browser.close();
  if (problems.length) process.exitCode = 1;
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
