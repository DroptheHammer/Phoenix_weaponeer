/**
 * The loading splash is plain HTML in index.html, so it is on screen with the
 * first frame, before any script runs. This takes it away once the app has
 * loaded: a short fade, then out of the page. It shows for as long as loading
 * takes and no longer; there is no minimum time.
 */
export const SPLASH_FADE_MS = 300;

export function hideSplash(doc: Document = document): void {
  const splash = doc.getElementById('splash');
  if (!splash) return;
  // Let clicks through at once: the app underneath is ready while the picture fades.
  splash.style.pointerEvents = 'none';
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), SPLASH_FADE_MS);
}
