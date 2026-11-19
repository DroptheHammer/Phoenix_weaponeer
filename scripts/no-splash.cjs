// The browser checks start the app many times, and each start would hold the loading splash for the
// time set in Settings (two seconds unless changed), over the very screen being checked. This sets
// the splash time to 0 in the browser's saved settings before the app reads them, unless a time is
// already saved, so a check sees the app as soon as it has loaded.
//
//   const { noSplash } = require('./no-splash.cjs');
//   await noSplash(context);   // or a page
const SETTINGS_KEY = 'phoenix-weaponeer.settings'; // src/lib/platform/web.ts

function setSplashToZero(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    if (saved.splashSeconds === undefined) {
      saved.splashSeconds = 0;
      localStorage.setItem(key, JSON.stringify(saved));
    }
  } catch {
    // No storage on this page: nothing to set.
  }
}

/** For a browser context or a single page, before it loads the app. */
const noSplash = (target) => target.addInitScript(setSplashToZero, SETTINGS_KEY);

module.exports = { noSplash, SETTINGS_KEY };
