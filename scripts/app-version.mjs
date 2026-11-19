// The app's version, read from package.json for the tools that cannot import that file without
// bundling all of it: vite.config.ts and vite.config.web.ts (the About dialog's `__APP_VERSION__`)
// and geo-check. Paths are from the repo root, as in every script here (no import.meta.url:
// geo-check bundles this file as CommonJS, where it does not exist).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** package.json's "version", the one place the number is written. */
export function appVersion(json = readFileSync(resolve('package.json'), 'utf8')) {
  return JSON.parse(json).version;
}

/** What both builds' `define` hands the app: the constant the About dialog reads, as the source text that replaces it. */
export function appDefines(version = appVersion()) {
  return { __APP_VERSION__: JSON.stringify(version) };
}
