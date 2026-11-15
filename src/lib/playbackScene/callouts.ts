/**
 * The 3D view's discs and the planner's words beside them. Pure: no three.js,
 * no DOM.
 *
 * Each disc is filled with the planner's own colour (the map's and the
 * card's), so its letters are black or white, whichever reads better on that
 * fill. The WCAG luminance is written out here because the card's contrast
 * module sits outside the files this folder may import.
 *
 * The words at a point (a callout) are what the pilot does there, so they come
 * up before the jet gets there and go a little after: shown fully from 3 s
 * before the point to 2 s after, each end ramped over half a second, in real
 * seconds. At 16× those are 48 s and 32 s of strike time, so nothing flashes
 * past too fast to read; paused, the speed setting still applies, so whatever
 * the playhead stands inside stays up. Three at most of one jet's are up at
 * once ("As they come"), the nearest to the playhead, and a callout that joins
 * or leaves that set fades instead of popping.
 */

import type { ActionPointsMode } from './show';

/** WCAG 2.1 relative luminance of a '#rrggbb' colour. */
function luminance(hex: string): number {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
}

/** '#000000' or '#ffffff', whichever has the higher WCAG contrast on `hex` (a tie goes to black). */
export function letterInk(hex: string): '#000000' | '#ffffff' {
  const l = luminance(hex);
  const onBlack = (l + 0.05) / 0.05, onWhite = 1.05 / (l + 0.05);
  return onBlack >= onWhite ? '#000000' : '#ffffff';
}

/** A callout is fully shown from this many real seconds before its point… */
export const CALLOUT_BEFORE_WALL_S = 3;
/** …to this many after it. */
export const CALLOUT_AFTER_WALL_S = 2;
/** Each end fades over this long, real seconds; a callout joining or leaving the shown set fades at the same pace. */
export const CALLOUT_FADE_WALL_S = 0.5;
/** "As they come": at most this many of one jet's callouts at once, the nearest to the playhead. */
export const CALLOUT_MAX_PER_JET = 3;
/** The gap between a disc and its plate, and between a plate and the one above it, CSS pixels. */
export const CALLOUT_GAP_PX = 10;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * How much of a callout shows, 0…1, at strike time `t_s` for a point the jet reaches at `mark_s`.
 * Off: 0. Always: 1. As they come: by the window above, in real seconds at the clock's speed setting
 * (playing or paused alike, so a pause leaves the words where they are). A speed of 0, below 0 or not a
 * number is taken as 1. Never NaN. Stateless.
 */
export function calloutAlpha(t_s: number, mark_s: number, speed: number, mode: ActionPointsMode): number {
  if (mode === 'off') return 0;
  if (mode === 'always') return 1;
  const s = speed > 0 ? speed : 1;
  const u = (t_s - mark_s) / s;
  const F = CALLOUT_FADE_WALL_S;
  const a = clamp01(Math.min((u + CALLOUT_BEFORE_WALL_S + F) / F, (CALLOUT_AFTER_WALL_S + F - u) / F));
  return a === a ? a : 0;
}

/**
 * One frame's fader targets, and the callouts worth placing, nearest the playhead first.
 *
 * `mark_s[i]` and `jetOf[i]` belong to callout i (of `n`); `shown` is the fader's alpha. Callout i's
 * target is calloutAlpha; "As they come" keeps it only for the CALLOUT_MAX_PER_JET of each jet nearest
 * the playhead among those inside their window, and sets the rest to 0 (so they fade out, never
 * vanish). The candidates, written to `order` nearest first, are every callout inside its window or
 * still showing. Returns how many. Allocates nothing.
 */
export function calloutTargets(
  t_s: number, speed: number, mode: ActionPointsMode,
  mark_s: ArrayLike<number>, jetOf: ArrayLike<number>, n: number,
  shown: ArrayLike<number>, target: Float32Array, order: Int16Array,
): number {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const a = calloutAlpha(t_s, mark_s[i], speed, mode);
    target[i] = a;
    if (!(a > 0 || shown[i] > 0)) continue;
    // Insertion sort by distance from the playhead (ties by index): a few dozen at most.
    const d = Math.abs(t_s - mark_s[i]);
    let p = m++;
    while (p > 0 && Math.abs(t_s - mark_s[order[p - 1]]) > d) {
      order[p] = order[p - 1];
      p--;
    }
    order[p] = i;
  }
  if (mode === 'coming') {
    for (let p = 0; p < m; p++) {
      const i = order[p];
      if (!(target[i] > 0)) continue;
      let before = 0;
      for (let q = 0; q < p; q++) if (jetOf[order[q]] === jetOf[i] && target[order[q]] > 0) before++;
      if (before >= CALLOUT_MAX_PER_JET) target[i] = 0;
    }
  }
  return m;
}

/**
 * Where each callout's plate goes, frame by frame: six spots round its disc (up-right, up-left,
 * down-right, down-left, then the two upper ones a plate higher), the first that lies wholly in view
 * and covers nothing placed or blocked this frame. The spot a callout had last frame is tried first,
 * so plates do not hop about as the picture moves. Arrays are made once; nothing allocates after.
 */
export class CalloutPlacer {
  private readonly bx: Float32Array;
  private readonly by: Float32Array;
  private readonly bw: Float32Array;
  private readonly bh: Float32Array;
  private readonly last: Int8Array;
  private nBoxes = 0;
  private viewW = 0;
  private viewH = 0;
  private px = 0;
  private py = 0;
  /** The plate's top left after a successful place, CSS pixels. */
  get x(): number {
    return this.px;
  }
  get y(): number {
    return this.py;
  }

  /** Room for `capacity` boxes (blocked and placed together) and for slots 0 … capacity − 1. */
  constructor(capacity: number) {
    const c = Math.max(1, capacity);
    this.bx = new Float32Array(c);
    this.by = new Float32Array(c);
    this.bw = new Float32Array(c);
    this.bh = new Float32Array(c);
    this.last = new Int8Array(c).fill(-1);
  }

  /** A new frame: nothing placed or blocked yet. */
  begin(viewW: number, viewH: number): void {
    this.nBoxes = 0;
    this.viewW = viewW;
    this.viewH = viewH;
  }

  /** Something already on the picture (a jet's label, a target's disc and tag) that no plate may cover. */
  block(x: number, y: number, w: number, h: number): void {
    if (this.nBoxes >= this.bx.length) return;
    const i = this.nBoxes++;
    this.bx[i] = x;
    this.by[i] = y;
    this.bw[i] = w;
    this.bh[i] = h;
  }

  /** The top left of spot `s` for a `w`×`h` plate beside a disc of radius `r` at (ax, ay). */
  private spot(s: number, ax: number, ay: number, r: number, w: number, h: number): void {
    const o = (r + CALLOUT_GAP_PX) * Math.SQRT1_2;
    const right = s === 0 || s === 2 || s === 4;
    this.px = right ? ax + o : ax - o - w;
    this.py = s === 2 || s === 3 ? ay + o : ay - o - h - (s >= 4 ? h + CALLOUT_GAP_PX : 0);
  }

  private free(x: number, y: number, w: number, h: number): boolean {
    if (x < 0 || y < 0 || x + w > this.viewW || y + h > this.viewH) return false;
    for (let i = 0; i < this.nBoxes; i++) {
      if (x < this.bx[i] + this.bw[i] && x + w > this.bx[i] && y < this.by[i] + this.bh[i] && y + h > this.by[i]) return false;
    }
    return true;
  }

  /** Places callout `slot`'s plate; returns the spot (0…5), with its top left in x and y, or −1 when none is free (dropped this frame). */
  place(slot: number, ax: number, ay: number, r: number, w: number, h: number): number {
    if (slot < 0 || slot >= this.last.length || this.nBoxes >= this.bx.length) return -1;
    const prev = this.last[slot];
    for (let k = -1; k < 6; k++) {
      const s = k < 0 ? prev : k;
      if (s < 0 || (k >= 0 && s === prev)) continue;
      this.spot(s, ax, ay, r, w, h);
      if (!this.free(this.px, this.py, w, h)) continue;
      this.block(this.px, this.py, w, h);
      this.last[slot] = s;
      return s;
    }
    this.last[slot] = -1;
    return -1;
  }
}

/**
 * Each callout's shown alpha, eased toward its target by at most dt / CALLOUT_FADE_WALL_S a step
 * (wall seconds), so a callout that joins or leaves the shown set fades instead of popping. The
 * window's own ramps move at the same pace while playing at any speed.
 */
export class CalloutFader {
  readonly alpha: Float32Array;

  constructor(capacity: number) {
    this.alpha = new Float32Array(Math.max(1, capacity));
  }

  /** Steps callouts 0 … n − 1 toward `target`. Returns true while any is still short of its target (draw again). */
  step(dt_s: number, target: Float32Array, n: number): boolean {
    const most = (dt_s > 0 ? dt_s : 0) / CALLOUT_FADE_WALL_S;
    let moving = false;
    for (let i = 0; i < n; i++) {
      const d = target[i] - this.alpha[i];
      this.alpha[i] += d > most ? most : d < -most ? -most : d;
      if (this.alpha[i] !== target[i]) moving = true;
    }
    return moving;
  }
}
