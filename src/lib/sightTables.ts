/**
 * Sight depression figures for manual bomb deliveries, from printed tables.
 *
 * The tables are community kneeboard packs' and one mod's own kneeboard
 * (`crates/core/data/sight_tables.json`; credited in the About dialog, never
 * on a card). One rule for every table:
 *
 * - On a printed point, the document's own figure.
 * - Between printed points, the planner's bomb-fall figure plus the table's
 *   own difference from it, carried across the gap. An estimate.
 * - Just beyond the printed points, on one axis only and within `SIGHT_REACH`,
 *   the nearest points' difference. An estimate.
 * - Anywhere else, no figure. The bomb-fall figure never prints on its own.
 *
 * A table is printed for the speed on the gauge; the planner holds true
 * airspeed. A printed point's true airspeed is worked at its own height over
 * a sea-level target, unless the document prints the true airspeed itself.
 */
import data from '../../crates/core/data/sight_tables.json';
import { iasToTas_kt, tasToIas_kt } from './airspeed';
import { bombRangeVacuum_ft } from './popupPlanning';

export interface SightCell {
  dive_deg: number;
  /** Release height above the target. */
  height_ft: number;
  speed_kias: number;
  /** The true airspeed the document itself prints beside the cell, when it does. */
  speed_ktas?: number;
  value?: number;
  /** ">200": the document says the sight cannot be set that far. */
  mark?: string;
  /** The document's own recovery warning on this figure. */
  rcvr?: boolean;
}

export interface SightSource {
  kind: string;
  title: string;
  author: string | null;
  site: string;
  file_no: string | null;
  /** What the app takes from it, for the About dialog. */
  takes: string;
  /** What the figures rest on, for the editor. */
  rests_on: string;
}

export interface SightTable {
  id: string;
  aircraft: string;
  source: string;
  store: string;
  /** How the editor names it: "F-5E table". */
  tag: string;
  /** The bombs the document prints the table for. */
  weapons: string[];
  /** Other slick bombs that borrow it; their figure is always an estimate. */
  stand_in: string[];
  /** A retarded bomb's figure moves fast with height and dive: carried between printed speeds only. */
  high_drag: boolean;
  /** The most the jet's sight can be set to, where a document states it. */
  dial_max_mils?: number;
  cells: SightCell[];
}

interface SightData {
  sources: Record<string, SightSource>;
  tables: SightTable[];
}

const DATA = data as unknown as SightData;

export const SIGHT_SOURCES: Record<string, SightSource> = DATA.sources;
export const SIGHT_TABLES: readonly SightTable[] = DATA.tables;

/** How near a printed point an attack must be to count as on it. */
export const SIGHT_ON = { dive_deg: 0.5, height_ft: 50, heightHighDrag_ft: 10, speed_kias: 5, bombFall_mils: 1.5 };
/** How far beyond the printed points a figure may be carried, and on how many axes at once. */
export const SIGHT_REACH = { dive_deg: 5, heightBelow_ft: 500, heightAbove_ft: 1000, speed_kias: 30, axes: 1 };

const SLACK = 1e-6;

export type SightKind = 'table' | 'between' | 'beyond' | 'none';
/** Why there is no figure: outside every printed point's reach; over the sight's limit; beside a ">200" cell. */
export type SightNoneReason = 'outside' | 'dial' | 'marked';

export interface SightLookup {
  kind: SightKind;
  tableId: string;
  /** The figure to print: the document's own, or the worked one rounded. */
  mils?: number;
  /** The worked figure before rounding. */
  exact?: number;
  /** The speed on the gauge the lookup used. */
  kias: number;
  /** How far outside the printed points, per axis (0 inside). */
  out?: { dive_deg: number; height_ft: number; speed_kias: number };
  /** True when the figure borrows another bomb's table. */
  standIn?: boolean;
  noneReason?: SightNoneReason;
  /** The sight's limit, when that is the reason. */
  dialMax_mils?: number;
  /** The figure is, or was worked from, the cell carrying the document's recovery warning. */
  rcvr?: boolean;
}

export interface SightQuery {
  dive_deg: number;
  /** Release height above the target. */
  height_ft: number;
  speed_ktas: number;
  /** The target's height above sea level; a missing one counts as 0. */
  targetElevation_ft: number;
  isaDev_C?: number;
}

/**
 * Where a bomb falling in a vacuum would need the sight: the angle from the
 * flight path down to the impact point, in mils. Not a sight setting by
 * itself (no drag, no angle of attack, no sight geometry); the tables supply
 * the difference.
 */
export function flightPathDepression_mils(dive_deg: number, height_ft: number, speed_ktas: number): number {
  const range_ft = bombRangeVacuum_ft(height_ft, speed_ktas, dive_deg);
  return Math.atan2(height_ft, range_ft) * 1000 - (dive_deg * Math.PI * 1000) / 180;
}

/** The table for a jet and a bomb, and whether the bomb borrows it. */
export function tableFor(aircraftId: string, weaponId: string): { table: SightTable; standIn: boolean } | null {
  const own = SIGHT_TABLES.find((t) => t.aircraft === aircraftId && t.weapons.includes(weaponId));
  if (own) return { table: own, standIn: false };
  const borrowed = SIGHT_TABLES.find((t) => t.aircraft === aircraftId && t.stand_in.includes(weaponId));
  return borrowed ? { table: borrowed, standIn: true } : null;
}

/** A printed point's own true airspeed, bomb-fall figure and difference. */
function cellFall(c: SightCell): number {
  const ktas = c.speed_ktas ?? iasToTas_kt(c.speed_kias, c.height_ft);
  return flightPathDepression_mils(c.dive_deg, c.height_ft, ktas);
}

/** One point on an axis: a difference, or a bar (a ">200" cell, or a row that came out as one). */
interface Point {
  x: number;
  bar: boolean;
  diff: number;
  /** The furthest the points under this one reached outside, on the axes already worked. */
  speedOut: number;
  heightOut: number;
  rcvr: boolean;
}

type Mode = 'on' | 'between' | 'beyond';
type Along = { bar: boolean; diff: number; out: number; speedOut: number; heightOut: number; rcvr: boolean } | null;

const far = (a: number, b: number) => (Math.abs(b) > Math.abs(a) ? b : a);
const one = (p: Point, out: number): Along => ({ bar: p.bar, diff: p.diff, out, speedOut: p.speedOut, heightOut: p.heightOut, rcvr: p.rcvr });

/** Carry the difference along one axis to `x`. */
function along(points: Point[], x: number, mode: Mode, tol: number): Along {
  if (points.length === 0) return null;
  // On a printed level: that level alone.
  let nearest = points[0];
  for (const p of points) if (Math.abs(p.x - x) < Math.abs(nearest.x - x)) nearest = p;
  if (Math.abs(nearest.x - x) <= tol + SLACK) return one(nearest, 0);
  if (mode === 'on') return null;

  const first = points[0];
  const last = points[points.length - 1];
  if (x < first.x || x > last.x) {
    if (mode === 'between') return null;
    const end = x < first.x ? first : last;
    return one(end, x - end.x);
  }
  let a = first;
  let b = last;
  for (let i = 0; i + 1 < points.length; i++) {
    if (points[i].x <= x && x <= points[i + 1].x) {
      a = points[i];
      b = points[i + 1];
      break;
    }
  }
  const speedOut = far(a.speedOut, b.speedOut);
  const heightOut = far(a.heightOut, b.heightOut);
  // Beside a ">200" cell and not on the printed neighbour: the document says the figure there is at least 200.
  if (a.bar || b.bar) return { bar: true, diff: 0, out: 0, speedOut, heightOut, rcvr: false };
  const f = (x - a.x) / (b.x - a.x);
  return { bar: false, diff: a.diff + (b.diff - a.diff) * f, out: 0, speedOut, heightOut, rcvr: a.rcvr || b.rcvr };
}

const levels = (xs: number[]) => [...new Set(xs)].sort((p, q) => p - q);

/** The sight figure for an attack from one table, or why there is none. */
export function lookupSight(table: SightTable, q: SightQuery, standIn = false): SightLookup {
  const kias = tasToIas_kt(q.speed_ktas, q.targetElevation_ft + q.height_ft, q.isaDev_C ?? 0);
  const base = { tableId: table.id, kias, ...(standIn ? { standIn: true } : {}) };
  const none = (noneReason: SightNoneReason, extra: Partial<SightLookup> = {}): SightLookup => ({ kind: 'none', ...base, noneReason, ...extra });
  const tolH = table.high_drag ? SIGHT_ON.heightHighDrag_ft : SIGHT_ON.height_ft;
  const inBox = (c: SightCell) =>
    Math.abs(c.dive_deg - q.dive_deg) <= SIGHT_ON.dive_deg + SLACK &&
    Math.abs(c.height_ft - q.height_ft) <= tolH + SLACK &&
    Math.abs(c.speed_kias - kias) <= SIGHT_ON.speed_kias + SLACK;

  // On a ">200" cell: the document itself says the sight cannot be set that far.
  if (table.cells.some((c) => c.mark === '>200' && inBox(c))) return none('dial', { dialMax_mils: table.dial_max_mils });

  // On a printed point: the document's own figure. The bomb-fall test keeps "on" honest where the
  // same gauge speed is another true airspeed (a higher target).
  const fall = flightPathDepression_mils(q.dive_deg, q.height_ft, q.speed_ktas);
  let on: SightCell | null = null;
  let onScore = Infinity;
  for (const c of table.cells) {
    if (c.value == null || !inBox(c) || Math.abs(cellFall(c) - fall) > SIGHT_ON.bombFall_mils + SLACK) continue;
    const score =
      Math.abs(c.dive_deg - q.dive_deg) / SIGHT_ON.dive_deg + Math.abs(c.height_ft - q.height_ft) / tolH + Math.abs(c.speed_kias - kias) / SIGHT_ON.speed_kias;
    if (score < onScore) {
      on = c;
      onScore = score;
    }
  }
  if (on && !standIn) return { kind: 'table', ...base, mils: on.value, exact: on.value, ...(on.rcvr ? { rcvr: true } : {}) };

  // Carry the difference: along speed, then across heights, then across dives.
  const speedMode: Mode = table.high_drag ? 'between' : 'beyond';
  const otherMode: Mode = table.high_drag ? 'on' : 'beyond';
  const divePoints: Point[] = [];
  for (const dive of levels(table.cells.map((c) => c.dive_deg))) {
    const atDive = table.cells.filter((c) => c.dive_deg === dive);
    const heightPoints: Point[] = [];
    for (const height of levels(atDive.map((c) => c.height_ft))) {
      const row = atDive
        .filter((c) => c.height_ft === height)
        .sort((a, b) => a.speed_kias - b.speed_kias)
        .map<Point>((c) => ({ x: c.speed_kias, bar: c.value == null, diff: c.value == null ? 0 : c.value - cellFall(c), speedOut: 0, heightOut: 0, rcvr: !!c.rcvr }));
      const r = along(row, kias, speedMode, SIGHT_ON.speed_kias);
      if (!r || Math.abs(r.out) > SIGHT_REACH.speed_kias + SLACK) continue;
      heightPoints.push({ x: height, bar: r.bar, diff: r.diff, speedOut: r.out, heightOut: 0, rcvr: r.rcvr });
    }
    const r = along(heightPoints, q.height_ft, otherMode, tolH);
    if (!r || r.out < -SIGHT_REACH.heightBelow_ft - SLACK || r.out > SIGHT_REACH.heightAbove_ft + SLACK) continue;
    divePoints.push({ x: dive, bar: r.bar, diff: r.diff, speedOut: r.speedOut, heightOut: r.out, rcvr: r.rcvr });
  }
  const r = along(divePoints, q.dive_deg, otherMode, SIGHT_ON.dive_deg);
  if (!r || Math.abs(r.out) > SIGHT_REACH.dive_deg + SLACK) return none('outside');
  if (r.bar) return none('marked', { dialMax_mils: table.dial_max_mils });
  const out = { dive_deg: r.out, height_ft: r.heightOut, speed_kias: r.speedOut };
  const axesOut = [out.dive_deg, out.height_ft, out.speed_kias].filter((v) => Math.abs(v) > SLACK).length;
  if (axesOut > SIGHT_REACH.axes) return none('outside');

  const exact = fall + r.diff;
  if (table.dial_max_mils != null && exact > table.dial_max_mils) return none('dial', { dialMax_mils: table.dial_max_mils, exact });
  if (exact < 0) return none('outside', { exact });
  return { kind: axesOut === 0 ? 'between' : 'beyond', ...base, mils: Math.round(exact), exact, out, ...(r.rcvr ? { rcvr: true } : {}) };
}
