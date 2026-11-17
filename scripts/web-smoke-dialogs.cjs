// Smoke test for dialogs and the keyboard (web build, 1280×800): a dialog
// opened from the keyboard takes focus, Tab and Shift+Tab never leave it,
// Escape closes it and focus goes back to the button that opened it. Run on
// Settings (a small dialog) and on the attack editor (the full-size one, with
// its map). Serve the build first, then run from the repo root:
//
//   npm run build:web && npx vite preview --config vite.config.web.ts --port 4173 &
//   PLAYWRIGHT_MODULE=<path to playwright or playwright-core> CHROME_PATH=<a Chromium binary> \
//     node scripts/web-smoke-dialogs.cjs http://localhost:4173/ <screenshotDir>
//
// PLAYWRIGHT_MODULE and CHROME_PATH are optional: left out, it loads
// require('playwright') (give NODE_PATH=$(npm root -g) for a global install)
// and Playwright's own browser.
//
// Two of the app's own dialogs open at once only in the desktop app (closing
// the window over an open editor asks about unsaved changes); in the web build
// no path a user can take opens one dialog over another, so the on-top rule is
// held by ui-check (DS23), not here.
//
// Prints one STEP line per stage; a thrown error prints FAILED and exits 1.
//
// Red when: Modal's line that focuses the dialog on mount is taken out.
// Seen: FAILED Settings: focus is not in the dialog when it opens (on button "⚙ Settings")
// Red when: Modal's Tab branch never runs (`event.key === 'Tab'` becomes `event.key === 'Tab' && false`).
// Seen: FAILED Settings: Tab number 3 left the dialog (focus on body "Phoenix WeaponeerDCS Mission P")
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const fs = require('fs');
const path = require('path');

const [base, out] = process.argv.slice(2);
if (!base || !out) {
  console.error('usage: node scripts/web-smoke-dialogs.cjs <url> <screenshotDir>');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const fixture = fs.readFileSync(path.join(__dirname, '../test-data/nevada_SYNTHETIC_link_payload.json'), 'utf8');
const TABS = 30;

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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

  /** Where focus is, said in words, and whether it is on or inside the newest dialog. */
  const focusState = () =>
    page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const top = dialogs[dialogs.length - 1] || null;
      const a = document.activeElement;
      const words = a ? `${a.tagName.toLowerCase()}${a.getAttribute('aria-label') ? ` "${a.getAttribute('aria-label')}"` : a.textContent ? ` "${a.textContent.trim().slice(0, 30)}"` : ''}` : 'nothing';
      return { inside: !!top && !!a && top.contains(a), onDialog: a === top, dialogs: dialogs.length, words };
    });

  /** Open a dialog from the keyboard, walk it with Tab both ways, close it with Escape, and check focus came back. */
  async function walk(label, opener, dialog) {
    await opener.focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor();
    await page.waitForTimeout(300);
    const opened = await focusState();
    if (!opened.inside) throw new Error(`${label}: focus is not in the dialog when it opens (on ${opened.words})`);
    step(`${label}: opened from the keyboard; focus on ${opened.onDialog ? 'the dialog itself' : opened.words}`);
    await shot(`${label.replace(/\W+/g, '-')}-open`);

    const seen = new Set();
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 1; i <= TABS; i++) {
        await page.keyboard.press(key);
        const f = await focusState();
        if (!f.inside) throw new Error(`${label}: ${key} number ${i} left the dialog (focus on ${f.words})`);
        seen.add(f.words);
      }
    }
    step(`${label}: ${TABS} Tabs and ${TABS} Shift+Tabs all stayed inside; ${seen.size} different stops`);

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(200);
    const back = await opener.evaluate((el) => el === document.activeElement);
    const after = await focusState();
    if (!back) throw new Error(`${label}: after Escape, focus is not back on what opened it (on ${after.words})`);
    step(`${label}: Escape closed it (${after.dialogs} dialog left in the page) and focus is back on what opened it`);
  }

  // ---- The synthetic mission ----
  await page.goto(base);
  await page.getByRole('button', { name: 'Import FragOrders' }).click();
  await page.getByRole('button', { name: 'From JSON' }).click();
  await page.getByPlaceholder('Or paste FragOrders JSON here...').fill(fixture);
  await page.getByRole('button', { name: 'Parse JSON' }).click();
  await page.getByRole('button', { name: 'Import Mission' }).click();
  await page.getByRole('button', { name: /^Attacks/ }).waitFor();
  step('mission imported');

  // ---- Settings: a small dialog ----
  await walk('Settings', page.getByRole('button', { name: '⚙ Settings' }), page.getByRole('dialog', { name: 'Settings' }));

  // ---- The attack editor: the full-size dialog, with its map ----
  await page.getByRole('button', { name: /^Attacks/ }).click();
  await walk('Attack editor', page.getByRole('button', { name: '+ Add Attack' }), page.getByRole('dialog', { name: 'Add Attack' }));

  console.log(problems.length ? `PROBLEMS\n${problems.join('\n')}` : 'NO PAGE ERRORS');
  await browser.close();
  if (problems.length) process.exitCode = 1;
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
