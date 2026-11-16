/**
 * What the 3D view draws about a falling bomb and where it lands (the ring round it, its pulse at the
 * release, the flash at the impact, the ring at the weapon's blast radius and the words beside it), as plain
 * numbers: no three.js, no DOM.
 *
 * Like the callouts, what shows is a pure function of the clock's time and its speed setting (playing or
 * paused alike), never of what was drawn on the frame before: a seek away and back, a re-timed strike and
 * a rebuilt scene all give the same picture.
 */

import { BOMB_RING_OTHER_R_PX, BOMB_RING_R_PX, IMPACT_RING_FADE_FROM_PX, IMPACT_RING_MIN_R_PX, OTHER_MARKER_ALPHA } from './sceneStyle';

/** The ring round a bomb starts this many times too wide at the release and settles over this long, real seconds. */
export const RELEASE_PULSE_WALL_S = 0.5;
/** How much wider than its size the ring starts, as a share of that size: 1 is twice as wide. */
export const RELEASE_PULSE_EXTRA = 1;

/** The ring round a falling bomb at rest: its radius in CSS pixels and how solid it is (0…1). */
export interface BombRingLook {
  r: number;
  alpha: number;
}

/**
 * The ring for a bomb of a jet that wears the planner's colour code (`coded`: the watched jet, or every
 * jet with Show › Attack colours › All jets) or of another jet, whose ring is smaller and fainter as its
 * discs are. Writes into `out` and hands it back, so a frame allocates nothing.
 */
export function bombRingLook(coded: boolean, out: BombRingLook): BombRingLook {
  out.r = coded ? BOMB_RING_R_PX : BOMB_RING_OTHER_R_PX;
  out.alpha = coded ? 1 : OTHER_MARKER_ALPHA;
  return out;
}

/**
 * How many times its resting size the ring is `age_s` after the release (strike seconds): 2 at the
 * release, settling to 1 over RELEASE_PULSE_WALL_S real seconds (the stretch of strike time grows with
 * the clock's speed setting, so the pulse is as quick to the eye at 16× as at 1×), and 1 before the
 * release and afterwards. A speed of 0, below 0 or not a number is taken as 1. Never NaN. Stateless.
 */
export function releasePulse(age_s: number, speed: number): number {
  const s = speed > 0 && speed < Infinity ? speed : 1;
  const u = age_s / s;
  if (!(u >= 0) || u >= RELEASE_PULSE_WALL_S) return 1;
  const k = 1 - u / RELEASE_PULSE_WALL_S;
  return 1 + RELEASE_PULSE_EXTRA * k * k;
}

/**
 * Where a bomb lands, at its time over target: a flash, then (where the weapon table has a blast radius)
 * a ring on the ground. Every figure is a display time in real seconds, none is a weapon number.
 * Each step of it lasts at least 0.2 real seconds and a frame moves the clock by at most 0.1 real seconds
 * (MAX_FRAME_DT_S), so the flash is seen growing over at least two frames and the ring holds for many, at
 * every speed and on the slowest machine.
 *
 * The flash grows to full size over this long,
 */
export const IMPACT_FLASH_GROW_WALL_S = 0.25;
/** stays at full strength until this long after the impact, */
export const IMPACT_FLASH_FULL_WALL_S = 0.45;
/** and has faded out by this long after it. */
export const IMPACT_FLASH_END_WALL_S = 1.2;
/** The ring on the ground grows to its full radius over this long, */
export const IMPACT_RING_GROW_WALL_S = 0.6;
/** stays at full strength until this long after the impact, */
export const IMPACT_RING_HOLD_WALL_S = 2.5;
/** and has faded out by this long after it (its words with it). */
export const IMPACT_RING_END_WALL_S = 3.5;

/**
 * The effect at a bomb's impact at one moment, each 0…1: the flash's size (a share of its full size) and
 * strength, the ring's radius (a share of its full radius) and strength.
 */
export interface ImpactPhase {
  flash: number;
  flashAlpha: number;
  ring: number;
  ringAlpha: number;
}

export function newImpactPhase(): ImpactPhase {
  return { flash: 0, flashAlpha: 0, ring: 0, ringAlpha: 0 };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Quick at first, settling gently: 0 at 0, 1 at 1. */
const easeOut = (x: number) => 1 - (1 - x) * (1 - x) * (1 - x);
/** 1 until `full`, then down in a straight line to 0 at `end`. */
const fadeOut = (u: number, full: number, end: number) => (u <= full ? 1 : u >= end ? 0 : (end - u) / (end - full));

/**
 * The effect `age_s` after the impact (strike seconds), at the clock's speed setting: the real seconds that
 * matter are age ÷ speed, as for the callouts, so the flash is as quick to the eye at 16× as at 1× and stays
 * up while paused. Before the impact, and for a time that is not a number, all four are 0. A speed of 0,
 * below 0 or not a number is taken as 1. Never NaN. Writes into `out` and hands it back, so a frame
 * allocates nothing; nothing of an earlier call is kept, so a seek away and back gives the same answer.
 */
export function impactPhase(age_s: number, speed: number, out: ImpactPhase): ImpactPhase {
  const s = speed > 0 && speed < Infinity ? speed : 1;
  const u = age_s / s;
  if (!(u >= 0)) {
    out.flash = out.flashAlpha = out.ring = out.ringAlpha = 0;
    return out;
  }
  out.flash = easeOut(clamp01(u / IMPACT_FLASH_GROW_WALL_S));
  out.flashAlpha = fadeOut(u, IMPACT_FLASH_FULL_WALL_S, IMPACT_FLASH_END_WALL_S);
  out.ring = easeOut(clamp01(u / IMPACT_RING_GROW_WALL_S));
  out.ringAlpha = fadeOut(u, IMPACT_RING_HOLD_WALL_S, IMPACT_RING_END_WALL_S);
  return out;
}

/**
 * The ring's radius on screen, CSS pixels: its true radius `ring_m` over the metres a pixel covers where it lies
 * (`wpp`). Nothing is added: the ring is never drawn bigger than the weapon's radius.
 */
export function ringPixels(ring_m: number, wpp: number): number {
  return ring_m / wpp;
}

/**
 * How strongly a ring of `r_px` on screen is drawn: 0 up to IMPACT_RING_FADE_FROM_PX (too small to read as a ring),
 * 1 from IMPACT_RING_MIN_R_PX, in a straight line between, so orbiting or zooming across it fades the ring in and out
 * and never pops it. Not a number, or below 0: 0.
 */
export function ringFade(r_px: number): number {
  const f = (r_px - IMPACT_RING_FADE_FROM_PX) / (IMPACT_RING_MIN_R_PX - IMPACT_RING_FADE_FROM_PX);
  return f > 0 ? (f < 1 ? f : 1) : 0;
}

/**
 * The words beside a burst: "#1 impact", and while its ring is drawn large enough to read (`withRadius`) and the
 * weapon has a blast radius, that radius in whole feet marked as an estimate (the figure is a community test's, not
 * the game's). A new array each call: worked out once per source, never per frame.
 */
export function impactTagLines(seatLabel: string, ring_ft: number | null, withRadius: boolean): string[] {
  const first = `${seatLabel} impact`;
  return withRadius && ring_ft !== null && ring_ft > 0
    ? [first, `blast radius ${Math.round(ring_ft).toLocaleString('en-US')} ft (est.)`]
    : [first];
}
