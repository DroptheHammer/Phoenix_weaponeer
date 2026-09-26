/**
 * The desktop app updates through its installers, so there is nothing to
 * watch for. Imported as `@pwa-update` in the desktop build; see `web.ts`.
 */
export function watchForUpdates(_onReady: (reload: () => void) => void): void {}
