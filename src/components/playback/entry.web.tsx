/**
 * `@playback` in the web (phone) build. There is no 3D playback on the web in
 * 0.4.0, so the button renders nothing and the phone never downloads three.js
 * or the playback shell. scripts/bundle-check.mjs checks that on every web build.
 * Same exports as `entry.desktop.tsx`.
 */
import type { PlayStrikeButtonProps } from './types';
import type { playbackLaunchFromEditor as DesktopLaunch } from './launch';

export const PLAYBACK_AVAILABLE = false;

/**
 * Nothing to build on the phone: the Play button never shows there, so this
 * never runs. Typed as the desktop one (a type-only import, so none of its
 * code comes along), so the editor compiles the same in both builds.
 */
export const playbackLaunchFromEditor: typeof DesktopLaunch = () => undefined;

export function PlayStrikeButton(_props: PlayStrikeButtonProps): null {
  return null;
}
