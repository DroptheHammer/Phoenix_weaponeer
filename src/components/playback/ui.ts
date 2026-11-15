/**
 * Class strings and small helpers shared by the playback's React chrome, so
 * the buttons look and behave alike.
 */
import type { MouseEvent } from 'react';

/**
 * Put on every playback button's onMouseDown: a mouse press does not take the
 * keyboard focus. Otherwise Space, pressed after clicking a button, would press
 * that button again (a speed, Home view) instead of playing and pausing. Tab
 * still reaches every button, and the Enter or Space that presses one still
 * works while it has focus.
 */
export const keepFocus = (e: MouseEvent) => e.preventDefault();

/** One button of a segmented group (the speeds): the group draws the border. */
export const SEG = 'px-1.5 py-1.5 text-sm';

/** A smaller segmented button, for the choice groups inside the Show menu. */
export const SEG_SMALL = 'px-2 py-0.5 text-xs';

/**
 * The buttons that sit over the 3D picture. Each draws its own border; the
 * pressed one is light on dark (grey-on-navy vanishes over a pale map), the
 * rest sit on a dark plate so they read over sky, haze and land alike.
 */
export const TOGGLE = 'px-2 py-1 text-xs rounded border border-gray-600';
export const TOGGLE_ON = 'bg-gray-100 text-gray-900 border-gray-100 font-semibold';
export const TOGGLE_OFF = 'bg-dcs-navy/80 text-gray-300 hover:bg-gray-700';

/** A plain text button (Notes, Reset): no border, lights up on hover. */
export const TEXT_BTN = 'text-gray-400 hover:text-blue-400 px-2 py-1';

/**
 * The Show menu's panel, laid over the picture under the toolbar: it scrolls
 * inside the picture instead of running past it, whatever the window's height.
 */
export const MENU_PANEL =
  'absolute top-10 right-3 z-10 w-72 max-h-[calc(100%-3rem)] overflow-y-auto rounded border border-gray-600 bg-gray-900 p-2 space-y-2 text-xs text-gray-200 shadow-lg';
/** A choice's name in the menu, and the line of plain words under it. */
export const MENU_HEAD = 'font-semibold text-gray-100';
export const MENU_HINT = 'text-gray-400';
