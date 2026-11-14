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
