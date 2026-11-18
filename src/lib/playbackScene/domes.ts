/**
 * Threat envelopes for the 3D view: each threat the planner may see, as a half-ellipsoid dome in the playback's
 * three.js axes, plus the rows the Show menu will list (one per threat system) and the counts the notes need. Pure:
 * no three.js, no DOM. Nothing here draws: it works out the shapes and their line segments for whatever does.
 *
 * Which threats exist at all is decided before this file: the launch hands over only those the planner may see
 * (threats the mission's author hid are not in playback's data, so nothing here counts or hints at them). The
 * library's own `threatDomes` still applies the planner's visibility rule to whatever it is given, so a threat
 * that slipped through is neither drawn, listed nor counted: rows and counts come only from what it returns.
 * (Pure files may not import the visibility rule, so this is the route.)
 *
 * Weapons (everything but early-warning radars) draw as a ring on the ground and, when active, a wire cage over
 * it; only the 64 nearest the lead's target are drawn, and one whose ring misses the drawn area is counted, not
 * drawn. An early-warning radar's range is detection, not a weapon envelope: it draws as a ground ring only, and
 * only the part inside the drawn area. A radar whose range covers the whole drawn area, or never reaches it, has
 * no ring to draw and its row says so.
 */

import { domeHeightAt_m, threatDomes, type DomeSystem, type LocalFrame, type ThreatDome } from '../playback';
import type { TerrainBox } from './terrain';

/** A threat as the library's dome builder takes it (the library does not export the type). */
export type SceneThreat = Parameters<typeof threatDomes>[0][number];
/** Which author-hidden threats the planner has revealed: the rule the library's dome builder applies. */
export type SceneReveal = Parameters<typeof threatDomes>[2];

/** A threat system row as playback is handed it: what a dome needs, and the words that name it. */
export interface SceneSystem extends DomeSystem {
  name?: string;
  nato_designation?: string | null;
  threat_type?: string;
}

/** The threats and systems the planner may see, taken when Play is pressed. */
export interface SceneThreats {
  visible: SceneThreat[];
  systems: SceneSystem[];
  /** The planner's reveal switches as they stood: the library's dome builder checks every threat against them again. */
  reveal: SceneReveal;
}

export type ThreatGroup = 'SAM' | 'SHORAD' | 'AAA' | 'MANPADS' | 'EWR' | 'other';
/** The order groups are listed in. */
export const THREAT_GROUPS: readonly ThreatGroup[] = ['SAM', 'SHORAD', 'AAA', 'MANPADS', 'EWR', 'other'];

/** The group of a threat system by its type: the five the database knows, an exact match, else 'other'. */
export function groupOf(threat_type: string | undefined): ThreatGroup {
  return threat_type === 'SAM' || threat_type === 'SHORAD' || threat_type === 'AAA' || threat_type === 'MANPADS' || threat_type === 'EWR' ? threat_type : 'other';
}

/** The most weapon domes drawn: the nearest to the lead's target. */
export const MAX_DOMES = 64;
/** The map's circle colours: red for an active threat, grey for the rest (MapView.tsx). */
export const DOME_ACTIVE = '#EF4444', DOME_IDLE = '#9CA3AF';
/** A radar's ring is cut into chords about this long. */
export const EWR_SEG_M = 500;
/** The most chords one radar ring draws inside the drawn area. */
export const EWR_RING_MAX_SEGS = 512;
/** A radar ring never has more points than this, whatever its range. */
const EWR_RING_MAX_POINTS = 4096;
/** The segments a weapon's pieces are cut into: the ground ring, each of the two arcs of the cage, and the cage's latitude ring. */
const RIM_SEGS = 64, MERIDIAN_SEGS = 32, LATITUDE_SEGS = 48;
/** How high up the cage's latitude ring sits, as a share of the dome's height; its radius there follows from the dome's shape (0.8 of the range). */
const LATITUDE_AT = 0.6, LATITUDE_RADIUS = 0.8;

/**
 * Where a radar's ring lies against the drawn area (ENU metres, the box's own axes): `drawn`, some of the ring is
 * inside the box; `covers`, every corner of the box is within the range, so the whole area is inside the radar's
 * reach and there is no ring in it; `beyond`, the nearest point of the box is farther than the range.
 * A ring through exactly one corner is `drawn`.
 */
export type RingCover = 'drawn' | 'covers' | 'beyond';

export function ringCover(e_m: number, n_m: number, radius_m: number, box: TerrainBox): RingCover {
  const nearE = Math.max(box.west_m - e_m, 0, e_m - box.east_m);
  const nearN = Math.max(box.south_m - n_m, 0, n_m - box.north_m);
  if (Math.hypot(nearE, nearN) > radius_m) return 'beyond';
  const farE = Math.max(Math.abs(e_m - box.west_m), Math.abs(e_m - box.east_m));
  const farN = Math.max(Math.abs(n_m - box.south_m), Math.abs(n_m - box.north_m));
  return Math.hypot(farE, farN) <= radius_m ? 'covers' : 'drawn';
}

/** One threat as the 3D view draws it: three.js axes (x = east, z = −north), metres. */
export interface SceneDome {
  threatId: string;
  systemId: string;
  group: ThreatGroup;
  /** An early-warning radar: a ground ring only, never a cage, never an inside test. */
  ewr: boolean;
  /** The system's NATO name, else its own name, else its id. (Two radars can share a NATO name: rows use systemLabel.) */
  label: string;
  status: ThreatDome['status'];
  /** Only an active threat gets a cage. */
  active: boolean;
  /** A planning assumption, drawn dashed; a threat from the mission is solid. */
  dashed: boolean;
  x: number;
  z: number;
  radius_m: number;
  height_m: number;
  /** A radar's ring: how many points are on the circle (fixed when the dome is made). 0 for a weapon. */
  ringPoints: number;
  /** The library's dome, in its own axes: the inside test and the cage's height are its. */
  enu: ThreatDome;
}

/** One line of the Show menu's threat list: a system, and what became of its threats. */
export interface SceneSystemRow {
  systemId: string;
  group: ThreatGroup;
  /** "SA-6 Gainful · 2K12 Kub". */
  label: string;
  range_nm: number;
  /** Threats of this system the dome builder returned. */
  threats: number;
  /** Drawn (a weapon: among the 64 nearest and over the drawn area; a radar: part of its ring is). */
  drawn: number;
  /** A radar's range covers the whole drawn area. Radars only. */
  covers: number;
  /** The threat's ring misses the drawn area. */
  beyond: number;
  /** A weapon past the 64 nearest. Weapons only. */
  capped: number;
  /** Switched on when the menu opens: weapons are, early-warning radars are not. */
  defaultOn: boolean;
}

export interface DomeSet {
  domes: SceneDome[];
  /** One row per system with a threat the planner may see, in menu order. */
  systems: SceneSystemRow[];
  /** Weapon envelopes whose ring misses the drawn area (counted, not drawn). Weapons only. */
  outside: number;
  /** Weapon envelopes past the 64 nearest. Weapons only. */
  capped: number;
}

/** "SA-6 Gainful · 2K12 Kub": the NATO name and the name joined when both exist and differ; else the one there is; else the id. */
export function systemLabel(sys: SceneSystem): string {
  const nato = sys.nato_designation || undefined, name = sys.name || undefined;
  if (nato && name && nato !== name) return `${nato} · ${name}`;
  return nato ?? name ?? sys.id;
}

/** How many chords of a radar's ring of `n` points have both ends inside the box: the ones that are drawn. */
function ringChordsInBox(d: Pick<SceneDome, 'x' | 'z' | 'radius_m'>, n: number, box: TerrainBox): number {
  let count = 0;
  let prevIn = false, firstIn = false;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const e = d.x + d.radius_m * Math.cos(a), north = -(d.z + d.radius_m * Math.sin(a));
    const inside = e >= box.west_m && e <= box.east_m && north >= box.south_m && north <= box.north_m;
    if (i === 0) firstIn = inside;
    else if (inside && prevIn) count++;
    prevIn = inside;
  }
  return count + (prevIn && firstIn ? 1 : 0);
}

/**
 * How many points a radar's ring has: one every EWR_SEG_M round (at most 4,096), then, while more than
 * EWR_RING_MAX_SEGS of its chords lie inside the drawn area, fewer in proportion (set from the count, not
 * stepped down) until no more than that many do. It ends: the chords inside never outnumber the points, so each
 * pass sets a smaller number that is still at least EWR_RING_MAX_SEGS. The bound on the passes is as long as the whole
 * fall could be (from the most points there can be, one point a pass), so it never cuts a real reduction short; it is only
 * a safety net against a loop that never ends.
 */
function ringPointsFor(d: Pick<SceneDome, 'x' | 'z' | 'radius_m'>, box: TerrainBox): number {
  let n = Math.min(EWR_RING_MAX_POINTS, Math.ceil((2 * Math.PI * d.radius_m) / EWR_SEG_M));
  let count = ringChordsInBox(d, n, box);
  for (let pass = 0; pass < EWR_RING_MAX_POINTS && count > EWR_RING_MAX_SEGS; pass++) {
    n = Math.floor((n * EWR_RING_MAX_SEGS) / count);
    count = ringChordsInBox(d, n, box);
  }
  return n;
}

/**
 * The threats the planner may see as domes and menu rows. Every system is in: weapons are drawn as a ring and a cage
 * (the 64 nearest the frame's origin, the lead's target, among those whose ring reaches the drawn area), radars as a
 * ground ring only, and only where it lies inside the drawn area. The domes are the weapons nearest first, then the
 * radars drawn. No threat data gives no domes and no rows.
 */
export function sceneDomes(t: SceneThreats | undefined, frame: LocalFrame, box: TerrainBox): DomeSet {
  if (!t) return { domes: [], systems: [], outside: 0, capped: 0 };
  // The first row for an id wins, as the library's dome builder reads them.
  const systems = new Map<string, SceneSystem>();
  for (const s of t.systems) if (!systems.has(s.id)) systems.set(s.id, s);
  const rows = new Map<string, SceneSystemRow>();
  const rowOf = (sys: SceneSystem, group: ThreatGroup): SceneSystemRow => {
    let r = rows.get(sys.id);
    if (!r) {
      r = { systemId: sys.id, group, label: systemLabel(sys), range_nm: sys.max_range_nm, threats: 0, drawn: 0, covers: 0, beyond: 0, capped: 0, defaultOn: group !== 'EWR' };
      rows.set(sys.id, r);
    }
    return r;
  };

  const weapons: { dome: SceneDome; row: SceneSystemRow; dist_m: number }[] = [];
  const radars: SceneDome[] = [];
  // Counted and listed from what the library's builder returns, never from `visible` itself.
  for (const td of threatDomes(t.visible, t.systems, t.reveal, frame)) {
    const sys = systems.get(td.systemId)!;
    const group = groupOf(sys.threat_type);
    const row = rowOf(sys, group);
    row.threats++;
    const dome: SceneDome = {
      threatId: td.threatId, systemId: td.systemId, group, ewr: group === 'EWR', label: sys.nato_designation || sys.name || sys.id,
      status: td.status, active: td.status === 'active', dashed: td.source !== 'mission',
      x: td.e_m, z: -td.n_m, radius_m: td.radius_m, height_m: td.height_m, ringPoints: 0, enu: td,
    };
    const cover = ringCover(td.e_m, td.n_m, td.radius_m, box);
    if (dome.ewr) {
      if (cover === 'covers') row.covers++;
      else if (cover === 'beyond') row.beyond++;
      else {
        row.drawn++;
        dome.ringPoints = ringPointsFor(dome, box);
        radars.push(dome);
      }
    } else if (cover === 'beyond') {
      row.beyond++;
    } else {
      weapons.push({ dome, row, dist_m: Math.hypot(td.e_m, td.n_m) });
    }
  }
  // The nearest 64 to the lead's target are drawn; the sort is stable, so equal distances keep their order.
  weapons.sort((a, b) => a.dist_m - b.dist_m);
  weapons.forEach((w, i) => (i < MAX_DOMES ? w.row.drawn++ : w.row.capped++));
  const rowList = [...rows.values()].sort(
    (a, b) => THREAT_GROUPS.indexOf(a.group) - THREAT_GROUPS.indexOf(b.group) || (a.label < b.label ? -1 : a.label > b.label ? 1 : a.systemId < b.systemId ? -1 : a.systemId > b.systemId ? 1 : 0),
  );
  const sum = (pick: (r: SceneSystemRow) => number) => rowList.filter((r) => r.group !== 'EWR').reduce((n, r) => n + pick(r), 0);
  return {
    domes: [...weapons.slice(0, MAX_DOMES).map((w) => w.dome), ...radars],
    systems: rowList,
    outside: sum((r) => r.beyond),
    capped: sum((r) => r.capped),
  };
}

/**
 * How many segments a dome's lines can need at most, the size its buffer is made once. A radar: its ring's chords inside
 * the drawn area, at most EWR_RING_MAX_SEGS, half of them dashed. A weapon: the ground ring (64) and, when active, the
 * cage's two arcs (32 each) and latitude ring (48): 176 and 64; dashed, half of each piece: 88 and 32.
 */
export function domeSegmentCount(d: SceneDome): number {
  if (d.ewr) return d.dashed ? EWR_RING_MAX_SEGS / 2 : EWR_RING_MAX_SEGS;
  const full = d.active ? RIM_SEGS + 2 * MERIDIAN_SEGS + LATITUDE_SEGS : RIM_SEGS;
  return d.dashed ? full / 2 : full;
}

/** Writes one segment (six floats) and returns the next offset. */
function putSegment(out: Float32Array, o: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  out[o] = x0; out[o + 1] = y0; out[o + 2] = z0; out[o + 3] = x1; out[o + 4] = y1; out[o + 5] = z1;
  return o + 6;
}

/**
 * Writes the dome's line segments into `out` from `offset`, six floats a segment, and returns how many floats it wrote.
 * `baseY` is the ground under the dome's centre and `rimY(x, z)` the drawn ground at any point: a ring lies 1 m above
 * it so the terrain does not hide it. A dashed dome drops every other segment of each piece.
 *
 * A weapon: the ground ring (64 segments at the range), and for an active one the cage: two arcs over the centre (one
 * north-south, one east-west, 32 segments each, at the height the dome has over each point) and a latitude ring (48
 * segments, 0.6 of the way up, at 0.8 of the range, which is where the dome's surface is at that height).
 * A radar: the ring only, `ringPoints` points round the circle, a chord kept only when both its ends lie inside the
 * drawn area (the part outside is not drawn), every other one dropped when dashed.
 */
export function domeSegmentsInto(d: SceneDome, baseY: number, rimY: (x: number, z: number) => number, box: TerrainBox, out: Float32Array, offset: number): number {
  let o = offset;
  const R = d.radius_m;
  if (d.ewr) {
    const n = d.ringPoints;
    const px = (i: number) => d.x + R * Math.cos((2 * Math.PI * i) / n), pz = (i: number) => d.z + R * Math.sin((2 * Math.PI * i) / n);
    const inBox = (x: number, z: number) => x >= box.west_m && x <= box.east_m && -z >= box.south_m && -z <= box.north_m;
    let kept = 0;
    for (let i = 0; i < n; i++) {
      const x0 = px(i), z0 = pz(i), j = (i + 1) % n, x1 = px(j), z1 = pz(j);
      if (!inBox(x0, z0) || !inBox(x1, z1)) continue;
      if (!d.dashed || kept % 2 === 0) o = putSegment(out, o, x0, rimY(x0, z0) + 1, z0, x1, rimY(x1, z1) + 1, z1);
      kept++;
    }
    return o - offset;
  }
  const step = d.dashed ? 2 : 1;
  // A ring of `n` segments round (cx, cz) at radius r, each vertex 1 m over the drawn ground.
  const ring = (n: number) => {
    for (let i = 0; i < n; i += step) {
      const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n;
      const x0 = d.x + R * Math.cos(a0), z0 = d.z + R * Math.sin(a0), x1 = d.x + R * Math.cos(a1), z1 = d.z + R * Math.sin(a1);
      o = putSegment(out, o, x0, rimY(x0, z0) + 1, z0, x1, rimY(x1, z1) + 1, z1);
    }
  };
  ring(RIM_SEGS);
  if (!d.active) return o - offset;
  // The cage's two arcs: from the east (or south) rim over the top to the west (or north) rim.
  for (const [ux, uz] of [[1, 0], [0, 1]] as const) {
    for (let i = 0; i < MERIDIAN_SEGS; i += step) {
      const t0 = (Math.PI * i) / MERIDIAN_SEGS, t1 = (Math.PI * (i + 1)) / MERIDIAN_SEGS;
      o = putSegment(out, o,
        d.x + ux * R * Math.cos(t0), baseY + d.height_m * Math.sin(t0), d.z + uz * R * Math.cos(t0),
        d.x + ux * R * Math.cos(t1), baseY + d.height_m * Math.sin(t1), d.z + uz * R * Math.cos(t1));
    }
  }
  const latY = baseY + LATITUDE_AT * d.height_m, latR = LATITUDE_RADIUS * R;
  for (let i = 0; i < LATITUDE_SEGS; i += step) {
    const a0 = (2 * Math.PI * i) / LATITUDE_SEGS, a1 = (2 * Math.PI * (i + 1)) / LATITUDE_SEGS;
    o = putSegment(out, o, d.x + latR * Math.cos(a0), latY, d.z + latR * Math.sin(a0), d.x + latR * Math.cos(a1), latY, d.z + latR * Math.sin(a1));
  }
  return o - offset;
}

/**
 * Whether a point (three.js axes) is inside the dome: over its footprint, and no higher than its surface. A point under the
 * base but over the footprint counts as inside: the map and the card call a jet inside on range alone, and a site on a
 * ridge can shoot down into the valley, so playback must not say "clear" where they say "inside". Allocates nothing.
 */
export function insideDomeAt(d: SceneDome, baseY: number, x: number, y: number, z: number): boolean {
  const r = Math.hypot(x - d.x, z - d.z);
  return r <= d.radius_m && y - baseY <= domeHeightAt_m(d.enu, r);
}

/** 1 where the dome's system is switched on, else 0, for every dome. `out` is the caller's, as long as `domes`. */
export function domeMaskInto(domes: readonly SceneDome[], on: readonly string[], out: Uint8Array): void {
  for (let i = 0; i < domes.length; i++) out[i] = on.includes(domes[i].systemId) ? 1 : 0;
}

/**
 * The dome a point is inside, or −1: only a weapon whose system is switched on can be, and an active one beats one that is
 * not active, then the smaller one beats the larger. A radar is never picked: its ring is detection, not a weapon's reach.
 */
export function pickInside(domes: readonly SceneDome[], baseY: Float32Array, mask: Uint8Array, x: number, y: number, z: number): number {
  let best = -1;
  for (let i = 0; i < domes.length; i++) {
    const d = domes[i];
    if (d.ewr || !mask[i] || !insideDomeAt(d, baseY[i], x, y, z)) continue;
    if (best < 0) best = i;
    else {
      const b = domes[best];
      if ((d.active && !b.active) || (d.active === b.active && d.radius_m < b.radius_m)) best = i;
    }
  }
  return best;
}

/** Where a radar's tag goes: the ring's vertex inside the drawn area nearest the frame's origin; undefined when none is. */
export function ewrTagPoint(d: SceneDome, box: TerrainBox): { x: number; z: number } | undefined {
  let best: { x: number; z: number } | undefined;
  let bestD = Infinity;
  for (let i = 0; i < d.ringPoints; i++) {
    const a = (2 * Math.PI * i) / d.ringPoints;
    const x = d.x + d.radius_m * Math.cos(a), z = d.z + d.radius_m * Math.sin(a);
    if (x < box.west_m || x > box.east_m || -z < box.south_m || -z > box.north_m) continue;
    const dist = Math.hypot(x, z);
    if (dist < bestD) {
      bestD = dist;
      best = { x, z };
    }
  }
  return best;
}

/**
 * What a menu row says about where its threats are, the first that applies: a radar whose range covers the whole drawn area
 * (all of them, then some), threats beyond the drawn area (all, then some), weapons past the 64 nearest, a radar's ring that
 * is drawn. Nothing for an ordinary weapon row with everything drawn.
 */
export function threatRowNote(r: SceneSystemRow): string | undefined {
  const ewr = r.group === 'EWR';
  if (ewr && r.threats > 0 && r.covers === r.threats) return 'The whole drawn area is inside its detection range: no ring to draw.';
  if (ewr && r.covers > 0) return `${r.covers} cover the whole drawn area: no ring for those.`;
  if (r.threats > 0 && r.beyond === r.threats) return 'Beyond the drawn area: nothing to draw.';
  if (r.beyond > 0) return `${r.beyond} beyond the drawn area`;
  if (!ewr && r.capped > 0) return `${r.capped} not drawn: only the ${MAX_DOMES} nearest the lead's target are.`;
  if (ewr && r.drawn > 0) return `Detection range ${r.range_nm} nm: a ground ring`;
  return undefined;
}

/** The heading over each group of the Show menu's threat list. */
export const THREAT_GROUP_HEADINGS: Readonly<Record<ThreatGroup, string>> = {
  SAM: 'SAM', SHORAD: 'SHORAD', AAA: 'AAA', MANPADS: 'MANPADS', EWR: 'Early warning', other: 'Other',
};
/** What the threat list says when playback was handed no threat data at all (a plan opened before threats reached it). */
export const NO_THREAT_DATA = 'No threat data in this plan.';
/** What it says when the plan has no threat the planner may see. */
export const NO_THREATS = 'No threats in this plan.';

/** A row's words: "SA-6 Gainful · 2K12 Kub (1)", the system and how many of its threats the planner may see. */
export const threatRowText = (r: SceneSystemRow): string => `${r.label} (${r.threats})`;

/** The Show menu's threat list as words: one group per kind with threats, its heading and its rows; or the one line that says there are none. */
export interface ThreatMenu {
  empty?: string;
  groups: { group: ThreatGroup; heading: string; rows: { systemId: string; text: string; note?: string; defaultOn: boolean }[] }[];
}

/**
 * The threat list from the rows the dome builder made (sceneDomes, already in menu order). It knows only those rows, so a
 * plan whose threats were all hidden by its author reads exactly as a plan with none: the rows are the same (none), and
 * so is every word. `threatData` false: playback was handed no threat data at all.
 */
export function threatMenuOf(rows: readonly SceneSystemRow[], threatData: boolean): ThreatMenu {
  if (!threatData) return { empty: NO_THREAT_DATA, groups: [] };
  if (rows.length === 0) return { empty: NO_THREATS, groups: [] };
  const groups: ThreatMenu['groups'] = [];
  for (const group of THREAT_GROUPS) {
    const mine = rows.filter((r) => r.group === group);
    if (mine.length) {
      groups.push({ group, heading: THREAT_GROUP_HEADINGS[group], rows: mine.map((r) => ({ systemId: r.systemId, text: threatRowText(r), note: threatRowNote(r), defaultOn: r.defaultOn })) });
    }
  }
  return { groups };
}
