/**
 * The label beside each jet in the 3D view. Pure: no three.js, no DOM.
 *
 * Line 1 is always there, "#2 Viper 1-2", so jets are told apart by words and
 * never by colour alone. Line 2, when Labels is on, is the jet's altitude and
 * speed the way the planner prints them: "1,500ft AGL · 480 KTAS" (above sea
 * level for level runs), rounded to 10 ft, read off the display layer (what
 * the arrow flies). Line 3, whatever Labels says, names the threat envelope
 * the jet is inside, when a system switched on in Show has one round it. The
 * strings are rebuilt only when a printed number (or the envelope) changes,
 * and measured only then, so a playing view allocates nothing for them frame
 * by frame.
 */

import type { SceneDome } from './domes';
import { LABEL_LINE_PX } from './sceneStyle';
import type { SceneJetPose } from './source';

/** A jet's label stands this far from its arrow, diagonally, CSS pixels. */
export const LABEL_OFFSET_PX = 14;
/**
 * When none of a label's four corners is free, each corner is slid away from its arrow's row, a label line
 * (LABEL_LINE_PX) at a time, at most this many lines: jets flying close together inside an envelope carry
 * three-line labels, and four of those do not fit round four arrows a few pixels apart.
 */
export const LABEL_SLIDE_STEPS = 6;

/**
 * Line 3 of a jet's label while it is inside a threat's envelope (a system switched on in Show): "◎ inside SA-6 Gainful"
 * for an active one, which also puts a white ring round the jet's arrow; "inside SA-6 Gainful (suppressed)" for any other,
 * which gets the words only. The words say it, so the ring's colour is never the only sign.
 */
export function insideLine(d: Pick<SceneDome, 'label' | 'active' | 'status'>): string {
  return d.active ? `◎ inside ${d.label}` : `inside ${d.label} (${d.status})`;
}

/** The words beside an early-warning radar's ring: "Tall Rack · detection range 200 nm" (its range is detection, not a weapon's reach). */
export function ewrTagText(d: Pick<SceneDome, 'label' | 'enu'>): string {
  return `${d.label} · detection range ${d.enu.radius_nm} nm`;
}

/** "#2 Viper 1-2", or "#2" when the jet has no callsign. */
export function labelLine1(seatLabel: string, callsign: string | undefined): string {
  return callsign ? `${seatLabel} ${callsign}` : seatLabel;
}

/** "12,000ft MSL · 450 KTAS": the altitude the planner prints for this jet, to 10 ft, and its true airspeed. */
export function labelLine2(pose: Pick<SceneJetPose, 'agl_ft' | 'msl_ft' | 'tas_kt'>, altRef: 'AGL' | 'MSL'): string {
  const alt = Math.round((altRef === 'MSL' ? pose.msl_ft : pose.agl_ft) / 10) * 10 + 0; // + 0: never "-0"
  return `${alt.toLocaleString()}ft ${altRef} · ${Math.round(pose.tas_kt)} KTAS`;
}

/**
 * One jet's label words. line2 hands back the same string until a printed number (the altitude to
 * 10 ft, the speed to 1 kt, the reference) changes; width measures each new string once.
 */
export class LabelText {
  readonly line1: string;
  private l2 = '';
  private alt = NaN;
  private tas = NaN;
  private ref = '';
  private w1 = NaN;
  private w2 = NaN;
  private l3 = '';
  private d3: SceneDome | undefined;
  private w3 = NaN;
  private builds3 = 0;

  constructor(seatLabel: string, callsign: string | undefined) {
    this.line1 = labelLine1(seatLabel, callsign);
  }

  line2(pose: Pick<SceneJetPose, 'agl_ft' | 'msl_ft' | 'tas_kt'>, altRef: 'AGL' | 'MSL'): string {
    const alt = Math.round((altRef === 'MSL' ? pose.msl_ft : pose.agl_ft) / 10);
    const tas = Math.round(pose.tas_kt);
    if (alt !== this.alt || tas !== this.tas || altRef !== this.ref) {
      this.alt = alt;
      this.tas = tas;
      this.ref = altRef;
      this.l2 = labelLine2(pose, altRef);
      this.w2 = NaN;
    }
    return this.l2;
  }

  /**
   * Line 3: the envelope the jet is inside (insideLine), or '' when it is inside none. The same string until the dome
   * changes, so a jet flying through an envelope builds its words once. Only the dome object is compared: the domes are
   * made once per open and never change within it (a dome with another status is another object), so nothing is built
   * frame by frame to tell.
   */
  line3(dome: SceneDome | undefined): string {
    if (dome !== this.d3) {
      this.d3 = dome;
      this.l3 = dome ? insideLine(dome) : '';
      if (dome) this.builds3++;
      this.w3 = NaN;
    }
    return this.l3;
  }

  /** How many times line 3's words have been built (for the checks: once per envelope entered, never per frame). */
  get line3Builds(): number {
    return this.builds3;
  }

  /** The width of line i as `measure` gives it, measured once per new string. */
  width(i: 1 | 2 | 3, measure: (s: string) => number): number {
    if (i === 1) {
      if (this.w1 !== this.w1) this.w1 = measure(this.line1);
      return this.w1;
    }
    if (i === 3) {
      if (this.w3 !== this.w3) this.w3 = measure(this.l3);
      return this.w3;
    }
    if (this.w2 !== this.w2) this.w2 = measure(this.l2);
    return this.w2;
  }
}

/** The space kept clear round a bomb's ring beyond its radius, CSS pixels: the ring's dark band reaches about 3 px past it. */
export const RING_CLEAR_PX = 4;
/** At most this many boxes of the view's own controls over the picture (today the button row and the name chip). */
export const CHROME_BOXES_MAX = 4;

/**
 * Appends to the blocked boxes (bx, by, bw, bh; `n` already in them, the targets' discs and tags) what words must also
 * keep off: the box round each ring flagged in `keep` (ring k at rx[k], ry[k], radius rr[k] as drawn, plus
 * RING_CLEAR_PX; the falling bombs of the jets that wear the planner's colour code), then the `nChrome` boxes of the
 * view's own controls (cx, cy, cw, ch). Stops when the arrays are full. Returns the new count, to hand to placeLabels and
 * to block in the CalloutPlacer. Allocates nothing.
 */
export function blockKeepClear(
  n: number, bx: Float32Array, by: Float32Array, bw: Float32Array, bh: Float32Array,
  nRings: number, keep: Uint8Array, rx: Float32Array, ry: Float32Array, rr: Float32Array,
  nChrome: number, cx: Float32Array, cy: Float32Array, cw: Float32Array, ch: Float32Array,
): number {
  const cap = bx.length;
  for (let k = 0; k < nRings && n < cap; k++) {
    if (!keep[k]) continue;
    const m = rr[k] + RING_CLEAR_PX;
    bx[n] = rx[k] - m;
    by[n] = ry[k] - m;
    bw[n] = 2 * m;
    bh[n] = 2 * m;
    n++;
  }
  for (let i = 0; i < nChrome && n < cap; i++) {
    bx[n] = cx[i];
    by[n] = cy[i];
    bw[n] = cw[i];
    bh[n] = ch[i];
    n++;
  }
  return n;
}

/**
 * Lays out `n` labels, in seat order: label i (w[i] × h[i]) beside its anchor (ax[i], ay[i]), tried
 * up-right, up-left, down-right, down-left, LABEL_OFFSET_PX from the anchor; the first that overlaps
 * no label already placed and none of the `nBlocked` boxes already on the picture (a target's disc
 * and its name, a followed bomb's ring, the view's own controls), and lies wholly in the
 * `viewW`×`viewH` view wins. When no corner is free, the four corners are tried again slid away from
 * the anchor's row (the two upper ones upward, the two lower ones downward) one label line at a time,
 * up to LABEL_SLIDE_STEPS lines, in the same order, and the first free one wins; with none free, the
 * spot of all those tried that overlaps and leaves the view least (the earliest on a tie). A label with
 * a free corner therefore goes exactly where it always did. Top lefts go to outX, outY; `slid[i]`, when
 * given, is 1 for a label that went to a slid spot (it gets a leader to its arrow), else 0.
 * `keepR[j]`, when given, is the half size of a square round anchor j (its arrow, and the white ring round it) that
 * every other label keeps off as it keeps off a blocked box: a label lying over another jet's arrow hides that jet and
 * leaves nothing to tell which jet the label names. A label's own anchor never counts against it.
 * Deterministic; allocates nothing.
 */
export function placeLabels(
  n: number, ax: Float32Array, ay: Float32Array, w: Float32Array, h: Float32Array,
  viewW: number, viewH: number, outX: Float32Array, outY: Float32Array,
  nBlocked = 0, bx?: Float32Array, by?: Float32Array, bw?: Float32Array, bh?: Float32Array, slid?: Uint8Array,
  keepR?: Float32Array,
): void {
  const o = LABEL_OFFSET_PX;
  const blocked = bx && by && bw && bh ? nBlocked : 0;
  const anchors = keepR ? n : 0;
  for (let i = 0; i < n; i++) {
    let bestX = 0, bestY = 0, bestCost = Infinity, bestStep = 0;
    search: for (let s = 0; s <= LABEL_SLIDE_STEPS; s++) {
      const dy = s * LABEL_LINE_PX;
      for (let c = 0; c < 4; c++) {
        const x = c === 0 || c === 2 ? ax[i] + o : ax[i] - o - w[i];
        const y = c < 2 ? ay[i] - o - h[i] - dy : ay[i] + o + dy;
        // What it covers of the labels placed before it and of the blocked boxes, plus what of it lies outside the view.
        let cost = w[i] * h[i] - Math.max(0, Math.min(x + w[i], viewW) - Math.max(x, 0)) * Math.max(0, Math.min(y + h[i], viewH) - Math.max(y, 0));
        for (let j = 0; j < i; j++) {
          cost += Math.max(0, Math.min(x + w[i], outX[j] + w[j]) - Math.max(x, outX[j])) * Math.max(0, Math.min(y + h[i], outY[j] + h[j]) - Math.max(y, outY[j]));
        }
        for (let j = 0; j < blocked; j++) {
          cost += Math.max(0, Math.min(x + w[i], bx![j] + bw![j]) - Math.max(x, bx![j])) * Math.max(0, Math.min(y + h[i], by![j] + bh![j]) - Math.max(y, by![j]));
        }
        for (let j = 0; j < anchors; j++) {
          const r = keepR![j];
          if (j === i || !(r > 0)) continue;
          cost += Math.max(0, Math.min(x + w[i], ax[j] + r) - Math.max(x, ax[j] - r)) * Math.max(0, Math.min(y + h[i], ay[j] + r) - Math.max(y, ay[j] - r));
        }
        if (cost < bestCost) {
          bestCost = cost;
          bestX = x;
          bestY = y;
          bestStep = s;
          if (cost <= 0) break search;
        }
      }
    }
    outX[i] = bestX;
    outY[i] = bestY;
    if (slid) slid[i] = bestStep > 0 ? 1 : 0;
  }
}
