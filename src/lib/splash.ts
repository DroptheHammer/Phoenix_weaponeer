/**
 * The loading splash is plain HTML in index.html, so it is on screen with the
 * first frame, before any script runs. This takes it away: once the app has
 * loaded AND the splash has been up for the time set in Settings (2 seconds
 * unless changed, 0 to 10), it fades and leaves the page. Set to 0, it shows
 * only for as long as loading takes.
 */
export const SPLASH_FADE_MS = 300;
/** The splash time a new install starts with (the owner's choice, 2026-11-19). Mirrors `settings.rs`. */
export const SPLASH_SECONDS_DEFAULT = 2;
/** The longest the splash may be held. */
export const SPLASH_SECONDS_MAX = 10;

/** A splash time as the settings keep it: 0 to 10 seconds, in tenths. Anything that is not a number is the default. */
export function cleanSplashSeconds(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return SPLASH_SECONDS_DEFAULT;
  return Math.round(Math.min(SPLASH_SECONDS_MAX, Math.max(0, n)) * 10) / 10;
}

/** How much longer the splash must stay up, given how long the page has been open. */
export function splashWait_ms(sinceStart_ms: number, seconds: number): number {
  return Math.max(0, cleanSplashSeconds(seconds) * 1000 - sinceStart_ms);
}

/**
 * Take the splash away once it has been up for `seconds` since the page
 * opened (at once, if it already has), with a short fade.
 */
export function hideSplash(seconds: number, doc: Document = document, sinceStart_ms: number = performance.now()): void {
  const splash = doc.getElementById('splash');
  if (!splash) return;
  setTimeout(() => {
    // Let clicks through at once: the app underneath is ready while the picture fades.
    splash.style.pointerEvents = 'none';
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), SPLASH_FADE_MS);
  }, splashWait_ms(sinceStart_ms, seconds));
}
