/**
 * The strike's targets as the 3D view draws them: one per distinct target
 * point, not one per jet, so four jets on one target show one red mark with
 * every seat named beside it ("TGT1 · #1 #2 #4"), never four marks stacked
 * on top of each other. Pure: no three.js, no DOM.
 *
 * The mark stands up off the ground: a red post from the drawn ground to a
 * set height on screen above the target, with the planner's red TGT disc on
 * top. Seen from the side it reads at a glance; seen straight down the post
 * shrinks onto its foot and the disc sits on the target, as on the map. A
 * target planned above the ground drawn under it (a rooftop, or terrain the
 * elevation tiles smooth away) still gets its post past the planned height,
 * so the bombs that land there land on something.
 */

/** Jets whose targets are this close (m, three.js axes) share one target. */
export const TARGET_GROUP_M = 1;

/** The post's top stands this far above the planned target on screen, CSS pixels: the disc sits there. */
export const TARGET_STAND_PX = 40;

/** One distinct target, three.js axes (x east, y up on the playback's datum, z = −north), m. */
export interface SceneTarget {
  key: string;
  /** The target waypoint's name, as the planner shows it. */
  name: string;
  x: number;
  y: number;
  z: number;
  /** The seats (member indices) of the jets on it, lowest first. */
  seats: number[];
  /** The playback jet indices on it, in the same order as `seats`. */
  jets: number[];
}

/**
 * Groups the jets' target points into distinct targets. `points[k]` and `seats[k]` belong to playback
 * jet k. Targets come in the order of their lowest seat, so the lead's target is first; a target's
 * position and name are those of its lowest seat's point.
 */
export function groupTargets(
  points: readonly { x: number; y: number; z: number; name: string }[],
  seats: readonly number[],
): { targets: SceneTarget[]; targetOfJet: number[] } {
  const order = points.map((_, k) => k).sort((a, b) => seats[a] - seats[b] || a - b);
  const targets: SceneTarget[] = [];
  const targetOfJet: number[] = new Array(points.length).fill(-1);
  for (const k of order) {
    const p = points[k];
    let i = targets.findIndex((t) => Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) <= TARGET_GROUP_M);
    if (i < 0) {
      i = targets.length;
      targets.push({ key: `target-${i}`, name: p.name, x: p.x, y: p.y, z: p.z, seats: [], jets: [] });
    }
    targets[i].seats.push(seats[k]);
    targets[i].jets.push(k);
    targetOfJet[k] = i;
  }
  return { targets, targetOfJet };
}

/** A target planned this far (m) above or below the ground drawn under it earns a note (about 50 ft); less is "on" the ground. */
export const TARGET_GAP_M = 15;

export type GapKind = 'on' | 'above' | 'below';

/** Is the planned height on the drawn ground, above it or below it? A difference of TARGET_GAP_M or less is on it. */
export function gapKind(planned_y: number, ground_y: number): GapKind {
  const d = planned_y - ground_y;
  return Math.abs(d) <= TARGET_GAP_M ? 'on' : d > 0 ? 'above' : 'below';
}

/** A target planned off the ground drawn under it: who is on it, and how far (m, planned less drawn; never within TARGET_GAP_M). */
export interface TargetGap {
  key: string;
  name: string;
  seatLabels: string[];
  gap_m: number;
}

/**
 * The targets whose planned height is not the drawn ground's, in target order. `heightAt` is the drawn ground
 * at (x, z) in three.js axes, so a gap changes when the ground does (flat, then real once the heights arrive).
 */
export function targetGaps(targets: readonly SceneTarget[], seatLabels: readonly string[], heightAt: (x: number, z: number) => number): TargetGap[] {
  const gaps: TargetGap[] = [];
  for (const t of targets) {
    const ground = heightAt(t.x, t.z);
    if (gapKind(t.y, ground) === 'on') continue;
    gaps.push({ key: t.key, name: t.name, seatLabels: t.seats.map((s) => seatLabels[s] ?? `#${s + 1}`), gap_m: t.y - ground });
  }
  return gaps;
}

/** The words beside a target's disc: its name, then every seat on it ("TGT1 · #1 #3"). */
export function targetTag(t: SceneTarget, seatLabels: readonly string[]): string {
  return `${t.name} · ${t.seats.map((s) => seatLabels[s] ?? `#${s + 1}`).join(' ')}`;
}

/**
 * The target post, heights in m on the playback's datum: from just above the drawn ground (1 m, so
 * it never flickers into it) up to TARGET_STAND_PX on screen above the higher of the planned target
 * and the drawn ground. `worldPerPx` is metres per CSS pixel at the target.
 */
export function targetPost(planned_y: number, ground_y: number, worldPerPx: number): { bottom: number; top: number } {
  return { bottom: ground_y + 1, top: Math.max(planned_y, ground_y) + TARGET_STAND_PX * worldPerPx };
}
