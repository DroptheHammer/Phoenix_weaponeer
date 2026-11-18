/**
 * The card's side view as a view of the playback: where the card's own picture puts a point, and where a jet
 * and its bomb are on that picture at a moment. Pure: no three.js, no React, no DOM.
 *
 * The picture itself is drawn by the card's painter (drawSideProfile), the same function the card and the attack
 * editor use; this file only knows its scale, so the moving dots can be laid on it. The painter's scale is not
 * exported and its file is the card's, so the numbers are written out again here and a check (geo-check, "side
 * view") draws the painter on a recording canvas and holds them to it.
 *
 * The axes are the card's, not the 3D's: across, the straight-line range to the jet's OWN target (so the target is
 * at the right, the run-in comes in from the left); up, height above that target. The dots are sampled on the
 * plan layer, the card's own lines, never the display layer, which rounds corners the picture does not draw.
 */

import {
  newBombState, newJetState, sampleBomb, sampleJet, sideCoords,
  type BombState, type JetState, type JetTrack, type SideCoords, type StrikePlayback, type StrikeTiming,
} from '../playback';

/** The painter's margins round the picture, px: left, right, above (room for labels), below (the ground's hatching and the caption). */
export const SIDE_PAD_LEFT_PX = 28;
export const SIDE_PAD_RIGHT_PX = 28;
export const SIDE_PAD_TOP_PX = 48;
export const SIDE_PAD_BOTTOM_PX = 48;

export interface SideBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How the picture's own numbers (range in nm, height in ft) become pixels in a box. */
export interface SideMap extends SideBox {
  /** The farthest and nearest range the picture spans, nm: its points' extremes, with room round them. */
  maxD: number;
  minD: number;
  /** Pixels per nm across, and per ft up. */
  xScale: number;
  yScale: number;
  /** The ground line's y. */
  groundY: number;
}

/**
 * The painter's mapping for `side` drawn into `box`: the range axis runs right to left (the target at the right),
 * 0.4 nm of room past the farthest point and 0.3 nm past the nearest, and the height axis is stretched to fit the
 * highest point with 15% to spare (at least 1,000 ft), the ground 48 px above the bottom.
 */
export function sideMapping(side: JetTrack['side'], box: SideBox): SideMap {
  const dists = side.points.map((p) => p.dist_nm);
  const maxD = Math.max(...dists) + 0.4;
  const minD = Math.min(...dists) - 0.3;
  return {
    x: box.x, y: box.y, w: box.w, h: box.h, maxD, minD,
    xScale: (box.w - SIDE_PAD_LEFT_PX - SIDE_PAD_RIGHT_PX) / (maxD - minD),
    yScale: (box.h - SIDE_PAD_TOP_PX - SIDE_PAD_BOTTOM_PX) / Math.max(side.maxAlt_ft * 1.15, 1000),
    groundY: box.y + box.h - SIDE_PAD_BOTTOM_PX,
  };
}

/** Where a range to the target (nm) is across the picture. */
export const sideX = (m: SideMap, d_nm: number) => m.x + SIDE_PAD_LEFT_PX + (m.maxD - d_nm) * m.xScale;
/** Where a height above the target (ft) is up the picture. */
export const sideY = (m: SideMap, alt_ft: number) => m.groundY - alt_ft * m.yScale;

/** The words under the picture: whose it is, what its two axes are, and what moves on it. */
export const sideCaption = (seat: string, callsign: string | undefined) =>
  `Side view of ${seat}${callsign ? ` ${callsign}` : ''}, as on the card: range to its own target, height above it, vertical scale stretched. The jet to release, then its bomb.`;

/** A dot on the picture: drawn or not, and where. */
export interface SideDot {
  visible: boolean;
  x: number;
  y: number;
}

/** The jet's dot and its bomb's, at one moment. */
export interface SideDots {
  jet: SideDot;
  bomb: SideDot;
}

export function newSideDots(): SideDots {
  return { jet: { visible: false, x: 0, y: 0 }, bomb: { visible: false, x: 0, y: 0 } };
}

/** What `sideDotsInto` samples into, kept by the caller so a frame allocates nothing. */
export interface SideScratch {
  js: JetState;
  bs: BombState;
  sc: SideCoords;
}

export function newSideScratch(): SideScratch {
  return { js: newJetState(), bs: newBombState(), sc: { range_nm: 0, agl_ft: 0 } };
}

/**
 * The jet's dot and its bomb's at strike time `t_s`, for flown jet `jet`, on the picture mapped by `m`. The jet shows
 * from the moment it crosses the IP until it releases; the bomb shows while it falls, from the release to the target.
 * Both sit at their straight-line range to the jet's own target and their height above it, from the plan layer.
 */
export function sideDotsInto(out: SideDots, pb: StrikePlayback, timing: StrikeTiming, jet: number, t_s: number, m: SideMap, scratch: SideScratch): SideDots {
  const js = sampleJet(pb, timing, jet, t_s, 'plan', scratch.js);
  out.jet.visible = js.visible && t_s <= timing.jets[jet].release_s;
  if (out.jet.visible) {
    sideCoords(pb, jet, js, scratch.sc);
    out.jet.x = sideX(m, scratch.sc.range_nm);
    out.jet.y = sideY(m, scratch.sc.agl_ft);
  }
  const bs = sampleBomb(pb, timing, jet, t_s, 'plan', scratch.bs);
  out.bomb.visible = bs.stage === 'falling';
  if (out.bomb.visible) {
    sideCoords(pb, jet, bs, scratch.sc);
    out.bomb.x = sideX(m, scratch.sc.range_nm);
    out.bomb.y = sideY(m, scratch.sc.agl_ft);
  }
  return out;
}
