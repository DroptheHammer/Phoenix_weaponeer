/**
 * Where an attack's run-in starts, resolved to one point.
 *
 * Three sources, in precedence order: a custom point the planner dropped on
 * the map or dialed in as a radial/distance off the target; a waypoint the
 * planner explicitly chose; the prior numeric waypoint, inferred when
 * neither of those is set. Every consumer — auto-build, the editor, the map,
 * the kneeboard card — reads an attack's IP through `attackIpAnchor` (or,
 * given an explicit choice already in hand, `resolveIpAnchor`) so they
 * cannot disagree about what the run-in leg actually is.
 *
 * Pure, so `geo-check.ts` can cover it — the same precedent as
 * `waypointOptions.ts` and `attackFlank.ts`.
 */

import type { Coordinates, Waypoint } from '../types/waypoint.types';
import type { Attack, IpAnchorFields } from '../types/attack.types';
import { calculateBearing, calculateDestination, calculateDistance } from './coordinates';
import { waypointLabel } from './waypointOptions';

export type IpAnchorSource = 'custom' | 'waypoint' | 'auto';

export interface IpAnchor {
  source: IpAnchorSource;
  /** Where the run-in starts. */
  point: Coordinates;
  /** The waypoint, when the anchor is one. Undefined for a custom point. */
  waypoint?: Waypoint;
  /** Planner-facing: "Waypoint 3 — IP ALPHA", or "Custom IP". */
  label: string;
  /** The card's tight columns and the map's frame edge: "STPT 3", or "CUSTOM IP". */
  shortLabel: string;
}

export type IpChoiceMode = 'auto' | 'waypoint' | 'custom';

export interface IpChoice {
  mode: IpChoiceMode;
  ipWaypointId?: string;
  customIp?: Coordinates;
}

/** A custom point this close to the target is not a usable IP — mirrors resolveIpAnchor's waypoint branch, which already excludes the target itself. */
const MIN_IP_DISTANCE_NM = 0.05;

function isUsablePoint(c: Coordinates | undefined, target: Coordinates): c is Coordinates {
  return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lon) && calculateDistance(c, target) >= MIN_IP_DISTANCE_NM;
}

/**
 * The waypoint the aircraft is flying from when it attacks this target: the
 * one immediately before it in the route. `autoBuildAttack.ts`'s `inferIp`
 * is a one-line delegate to this — see that file for the reasoning (chained
 * attacks fly in from the previous target, not the mission's IP).
 */
export function inferIpFrom(waypoints: Waypoint[], target: Waypoint): Waypoint | undefined {
  return waypoints
    .filter((wp) => wp.id !== target.id && wp.steerpoint < target.steerpoint)
    .sort((a, b) => b.steerpoint - a.steerpoint)[0];
}

/**
 * Resolve an explicit IP choice to a point. Precedence: a usable custom point
 * beats an explicitly chosen waypoint, which beats the inferred prior
 * waypoint. A non-finite or target-coincident custom point is not usable and
 * falls through to the waypoint branch, same as a dangling `ipWaypointId`
 * falls through to `inferIpFrom` — neither ever crashes the caller.
 */
export function resolveIpAnchor(waypoints: Waypoint[], target: Waypoint, choice: IpAnchorFields): IpAnchor | undefined {
  if (isUsablePoint(choice.customIp, target.coordinates)) {
    return {
      source: 'custom',
      point: choice.customIp!,
      label: 'Custom IP',
      shortLabel: 'CUSTOM IP',
    };
  }

  const picked = choice.ipWaypointId
    ? waypoints.find((wp) => wp.id === choice.ipWaypointId && wp.id !== target.id)
    : undefined;
  const waypoint = picked ?? inferIpFrom(waypoints, target);
  if (!waypoint) return undefined;

  return {
    source: picked ? 'waypoint' : 'auto',
    point: waypoint.coordinates,
    waypoint,
    label: waypointLabel(waypoint),
    shortLabel: `STPT ${waypoint.steerpoint}`,
  };
}

/** The waypoint-only override an editor should open with — the inverse of resolving just the waypoint branch. `autoBuildAttack.ts`'s `initialIpOverride` delegates here. */
export function initialIpOverrideFrom(waypoints: Waypoint[], target: Waypoint | undefined, storedIpWaypointId: string | undefined): string | undefined {
  if (!storedIpWaypointId || !target) return undefined;
  return inferIpFrom(waypoints, target)?.id === storedIpWaypointId ? undefined : storedIpWaypointId;
}

/**
 * What mode the editor's 3-way picker (Auto / a waypoint / Custom point)
 * should open in for a saved attack, and the value(s) to seed it with.
 *
 * A stored `customIp` can only have got there by a planner placing one —
 * unlike `ipWaypointId`, auto-build never writes it — so its presence is
 * unambiguous evidence of a deliberate choice; no "is this just the
 * default?" check is needed the way `initialIpOverrideFrom` needs one for
 * waypoints.
 */
export function initialIpChoice(waypoints: Waypoint[], target: Waypoint | undefined, stored: IpAnchorFields): IpChoice {
  if (target && isUsablePoint(stored.customIp, target.coordinates)) {
    return { mode: 'custom', customIp: stored.customIp };
  }
  const override = initialIpOverrideFrom(waypoints, target, stored.ipWaypointId);
  return override ? { mode: 'waypoint', ipWaypointId: override } : { mode: 'auto' };
}

/** The one lookup an attack's five profile types share for "where is its IP", replacing the `(attack.profile as { ipWaypointId?: string })` casts scattered across the map/card/editor. */
export function attackIpAnchor(waypoints: Waypoint[], attack: Pick<Attack, 'targetWaypointId' | 'profile'>): IpAnchor | undefined {
  const target = waypoints.find((wp) => wp.id === attack.targetWaypointId);
  if (!target) return undefined;
  return resolveIpAnchor(waypoints, target, attack.profile);
}

/** Radial FROM the target outward TO the IP, and the range — what the card and the editor's numeric fields print. */
export function ipRadial(target: Coordinates, ip: Coordinates): { radial_deg: number; distance_nm: number } {
  return { radial_deg: calculateBearing(target, ip), distance_nm: calculateDistance(target, ip) };
}

/** The inverse of `ipRadial`: a radial and distance off the target, as a point. */
export function ipFromRadial(target: Coordinates, radial_deg: number, distance_nm: number): Coordinates {
  return calculateDestination(target, radial_deg, distance_nm);
}

/** What the editor's Radial/Distance boxes should read for a resolved custom point. */
export function ipFieldsFor(target: Coordinates, ip: Coordinates): { radial: string; distance: string } {
  const { radial_deg, distance_nm } = ipRadial(target, ip);
  return { radial: String(Math.round(((radial_deg % 360) + 360) % 360)), distance: distance_nm.toFixed(1) };
}

/**
 * What a typed Radial/Distance pair means, as a point — or `undefined` on
 * blank, non-numeric, or non-positive-distance input. Never returns a NaN
 * coordinate, so a cleared field cannot write a broken `customIp` (the
 * failure mode behind review item M8).
 */
export function ipPointFromFields(target: Coordinates, radial: string, distance: string): Coordinates | undefined {
  const radial_deg = Number(radial);
  const distance_nm = Number(distance);
  if (!Number.isFinite(radial_deg) || !Number.isFinite(distance_nm) || distance_nm <= 0) return undefined;
  return ipFromRadial(target, radial_deg, distance_nm);
}

/** Where a newly-armed "Custom point" mode should seed its marker: the current anchor's point when there is one, else 10 nm north of the target. */
export function seedCustomIp(target: Waypoint, current: IpAnchor | undefined): Coordinates {
  return current ? current.point : calculateDestination(target.coordinates, 0, 10);
}
