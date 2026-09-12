import type { Waypoint } from '../types';

/**
 * Which waypoints the planner may pick as a target, and how they read.
 *
 * Pure so `geo-check.ts` can cover it, the same precedent as `arcClip.ts` and
 * `attackFlank.ts`.
 *
 * The naming here is deliberate. DCS `.miz` stores a route as
 * `["route"]["points"]` and its Mission Editor calls them *waypoints*;
 * FragOrders' own type is literally `Waypoint`. "STPT" is F-16 cockpit
 * terminology — it appears in the DTC (`NAV_PTS`, `STPT1`) and belongs on the
 * kneeboard card, which is what the pilot dials into the jet. Planner-facing UI
 * says Waypoint.
 */

/**
 * Every waypoint, in route order.
 *
 * Deliberately unfiltered. `Waypoint.type` is *our* guess, inferred from the
 * creator's free-text name by `infer_waypoint_type` in the Rust importer, and
 * that guess is a hint rather than a gate: mission creators write `TGT`,
 * `POINT BETA`, `KILL ZONE`, or nothing at all. The Sinai mission
 * `M01 V6.miz` names none of its 55 route points, so every one imported as
 * `nav` and a `type === 'target'` filter left the Target dropdown empty and the
 * mission unplannable.
 *
 * Any waypoint can be a target. The IP list at `AttackEditor.tsx` already took
 * this view ("not only IP-typed ones"); this is the same reasoning applied to
 * the target.
 *
 * The first waypoint is included even though nothing precedes it to fly in
 * from. The editor already says "Needs a waypoint before the target in the
 * route" — warn, do not block.
 */
export function targetCandidates(waypoints: Waypoint[]): Waypoint[] {
  return [...waypoints].sort((a, b) => a.steerpoint - b.steerpoint);
}

/**
 * How one waypoint reads in a picker: `Waypoint 8 — TGT1`, or `Waypoint 1`
 * when the creator left it unnamed.
 *
 * The name is passed through verbatim — nothing is parsed out of it and the
 * inferred type is not appended, because the creator's text is the truth and
 * our category is the guess.
 */
export function waypointLabel(wp: Waypoint): string {
  const name = (wp.name ?? '').trim();
  return name ? `Waypoint ${wp.steerpoint} — ${name}` : `Waypoint ${wp.steerpoint}`;
}

/**
 * Which waypoints may serve as the IP for an attack on `targetId`: every
 * waypoint except the target itself, in route order.
 *
 * Deliberately not restricted to waypoints earlier in the route. The default is
 * the prior numeric waypoint (`resolveIp` / `inferIp`), which is right almost
 * always, but the planner can see the map and may want to run in from anywhere
 * — a route doubling back, a chained attack, an offset the numbering does not
 * reflect. Never remove a knob.
 */
export function ipCandidates(waypoints: Waypoint[], targetId: string | undefined): Waypoint[] {
  return [...waypoints]
    .filter((wp) => wp.id !== targetId)
    .sort((a, b) => a.steerpoint - b.steerpoint);
}
