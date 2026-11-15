/**
 * Class strings and small helpers shared by the playback's React chrome, so
 * the buttons look and behave alike.
 */
import type { MouseEvent } from 'react';
import { LINE_STYLE } from '../../lib/attackPicture';
import { DASH_ON_PX, DASH_PERIOD_PX, type PhaseKey } from '../../lib/playbackScene';

/**
 * Put on every playback button's onMouseDown: a mouse press does not take the
 * keyboard focus. Otherwise Space, pressed after clicking a button, would press
 * that button again (a speed, Home view) instead of playing and pausing. Tab
 * still reaches every button, and the Enter or Space that presses one still
 * works while it has focus.
 */
export const keepFocus = (e: MouseEvent) => e.preventDefault();

/**
 * Let go of a box a time was typed in. The focus goes to the playback window itself, not to the page behind
 * it: Space plays only from inside the window, so with the focus on the page it would do nothing.
 */
export function leaveBox(box: HTMLElement): void {
  box.blur();
  box.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
}

/**
 * Does this element have the focus the keyboard gives (a Tab onto it, a key pressed on it), as against the
 * focus a mouse press leaves behind? A browser too old to know the selector is taken as keyboard: showing
 * a warning is the safer way to be wrong.
 */
export function keyboardFocused(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

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

/**
 * The rows under the picture share three columns, so the lanes' time axes line
 * up with the scrubber's: the left holds Play and the clock (and each jet's
 * seat), the middle the time bar, the right the speeds (and each jet's times).
 */
export const ROW_GRID = 'grid grid-cols-[160px_minmax(0,1fr)_170px] items-center gap-x-3';
/**
 * The lanes sit one under another with no gap, four showing (4 × LANE_H_PX = 120 px); a strike of more
 * than four (a shared mission file can carry them) scrolls.
 */
export const LANES = 'max-h-[120px] overflow-y-auto';
/**
 * A lane's middle cell: 30 px tall, inset 8 px each side, the same inset the
 * scrubber's thumb travel has, so a time sits at the same x on both.
 */
export const LANE = 'relative h-[30px] px-2';
/**
 * A lane's left cell is the button that picks the jet to watch: the jet's colour dot, its seat and
 * callsign, then a ◉ while it is the one watched. Its text and fills are laneStyle's SEAT_* and
 * QUIET_TEXT (geo-check holds them against the panel, and holds each class below to the colour the
 * constant carries): grey-200 on the panel, white on grey-700 when watched, grey-400 for a seat that is
 * not flown.
 */
export const LANE_LABEL = 'flex min-w-0 w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-white';
export const SEAT_OFF = 'text-gray-200 hover:bg-gray-700';
export const SEAT_ON = 'bg-gray-700 text-white';
export const SEAT_SKIPPED = 'text-gray-400 cursor-not-allowed';
export const SEAT_DOT = 'h-2 w-2 shrink-0 rounded-full';
/** What a lane says in place of its band when its jet is not flown (grey-400, QUIET_TEXT). */
export const LANE_SKIPPED = 'flex h-full min-w-0 items-center text-xs text-gray-400';
/** The "‹" before the marks that fall before the time bar starts; its colour is laneStyle's PIN_GLYPH. */
export const PIN_MARK = 'absolute left-0 top-0 text-[11px] leading-3';
/** A lane's right cell: its time over target and the card's push time. Text: laneStyle's READOUT_TEXT. */
export const READOUT = 'min-w-0 font-mono text-[11px] leading-tight text-gray-300';
/**
 * The cell's first line: "TOT T+0:30", the box that time is typed in, and a mark when the jet is inside another's
 * frag. It is 16 px tall (the box's height) and the second line 13.75, so the cell stays inside the lane's 30.
 */
export const READOUT_LINE = 'flex h-4 items-center gap-1 whitespace-nowrap';
/** The box a time over target is typed in: fill and edge are laneStyle's BOX_FILL and BOX_EDGE. */
export const TIME_BOX = 'w-14 h-4 px-1 py-0 text-[11px] text-right tabular-nums bg-gray-700 border border-gray-500 rounded';
/** The warning mark beside a time that puts the jet inside another's frag (amber, laneStyle's WARN_TEXT). */
export const CONFLICT_MARK = 'text-amber-300';
/**
 * The handle that moves a jet's time over target, drawn over its diamond: a square to take hold of, a
 * resize cursor, no touch scrolling (a finger drags it), and a white ring when the keyboard is on it.
 */
export const HANDLE = 'absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 touch-none cursor-ew-resize items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
/** A chip on a lane: its width is set from its letters, its colours from the mark. */
export const CHIP = 'absolute flex h-3 items-center justify-center overflow-hidden rounded-full -translate-x-1/2';
export const CHIP_LETTERS = 'font-mono text-[10px] leading-3 font-bold';
/** The amber stripes over the times a jet would be over the target inside another's frag. */
export { HATCH } from '../../lib/playbackScene';
/**
 * The line of small print under the lanes: the first frag or cone warning in amber (WARN_TEXT), or an
 * all-clear in grey (QUIET_TEXT); the rest of the warnings fold under a text button that adds no height.
 */
export const FOOTER = 'flex items-center gap-3 text-xs';
export const FOOTER_WARN = 'min-w-0 truncate text-amber-300';
export const FOOTER_OK = 'min-w-0 truncate text-gray-400';
/**
 * The swatch before the warning that shows what the time bar's stripes look like (its background is HATCH,
 * set where it is drawn): it keeps its size, and the warning's text is what gives way, so it takes nothing
 * from the buttons at the right. The negative margin tightens the line's gap to a few pixels.
 */
export const FOOTER_KEY = 'h-[10px] w-[14px] shrink-0 -mr-2 rounded-sm';
export const FOOTER_MORE = 'shrink-0 whitespace-nowrap text-gray-400 hover:text-blue-400 px-1';
/** The folded warnings, a few lines at most before they scroll. */
export const FOOTER_REST = 'max-h-16 overflow-y-auto text-xs text-amber-300';
/** The right-hand end of the line: what the times are, and Reset. */
export const FOOTER_END = 'ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap';
/** "Times changed, not applied yet." (amber, WARN_TEXT). */
export const FOOTER_DIRTY = 'text-amber-300';
/**
 * Reset: 16 px tall like the line it sits on, so it adds no height. Greyed and still when there is nothing to
 * put back (aria-disabled, so the keyboard can still reach it and say so). Text READOUT_TEXT, edge BOX_EDGE.
 */
export const FOOTER_RESET =
  'h-4 rounded border border-gray-500 px-2 text-[11px] leading-[14px] text-gray-300 hover:bg-gray-700 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent';
/** Apply is Reset's twin: the same 16 px, edge and colours, so the line keeps its height. */
export const FOOTER_APPLY = FOOTER_RESET;
/**
 * What Apply said, in one 16 px row under the line (longer than the row, it is cut short and its whole text
 * is the row's tooltip), so four lanes and the small print still leave the picture its room. Text READOUT_TEXT.
 */
export const FOOTER_STATUS = 'h-4 min-w-0 truncate text-xs leading-4 text-gray-300';
/** The side view's panel: the editor's own pale background. */
export const SIDE_BG = 'bg-[#F4F4EC]';

/**
 * The CSS background of a stretch of a band: the planner's colour for that
 * line, as dashes (6 px on, 4 px off) where the planner dashes it, so the dash
 * tells route from leg and the egress turn from its leg without the colour.
 */
export function bandBackground(style: PhaseKey): string {
  const line = LINE_STYLE[style];
  return line.dash ? `repeating-linear-gradient(90deg, ${line.color} 0 ${DASH_ON_PX}px, transparent ${DASH_ON_PX}px ${DASH_PERIOD_PX}px)` : line.color;
}
