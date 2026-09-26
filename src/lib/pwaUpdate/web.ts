/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';

/**
 * The installed web app keeps running the version it last loaded (it works
 * offline from its own copy). When a newer one has downloaded in the
 * background, `onReady` gets the function that switches to it — the app asks
 * first rather than reloading under a planner mid-edit. Imported as
 * `@pwa-update` in the web build only.
 */
export function watchForUpdates(onReady: (reload: () => void) => void): void {
  const update = registerSW({
    onNeedRefresh: () => onReady(() => void update(true)),
  });
}
