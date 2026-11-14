/**
 * The bomb, from the release point to the target waypoint, timed by the
 * planner's own fall models. The last sample is exactly the target at AGL 0.
 * The pop-up's drawn bomb line runs on to the aim-off point past the target:
 * it is the nose's aim line, not the bomb, and is never used here.
 *
 * - level, pop-up: the vacuum parabola the release range was computed with
 *   (`levelFallVacuum`, `bombFallVacuum`), so it lands on the target.
 * - dive: the bomb rides the card's straight REL→TGT sight line, timed by the
 *   vacuum fall (see `familyFacts`). It leaves at the jet's own ground speed.
 * - loft: the planner's simulated drag path, with its own sample times.
 */

import type { Coordinates, Waypoint } from '../../types';
import { toLocal, upOf } from './frame';
import type { FamilyFacts } from './family';
import type { BombPath, LocalFrame } from './types';

/** Seconds between stored vacuum samples: the chord sags g·dt²/8 = 0.04 ft between them. */
const VACUUM_DT_S = 0.1;

interface FallPoint {
  t: number;
  /** Fraction of the way from the release point to the target. */
  f: number;
  agl: number;
}

function vacuumPoints(fall: Extract<FamilyFacts['fall'], { kind: 'vacuum' }>): FallPoint[] {
  const T = fall.time_s;
  const pts: FallPoint[] = [];
  const height = (t: number) => Math.max(fall.h0_ft - fall.vy0_fps * t - 0.5 * fall.g_fps2 * t * t, 0);
  const fraction = (t: number) => {
    if (fall.model === 'vacuumOnSightLine') return fall.h0_ft > 0 ? 1 - height(t) / fall.h0_ft : 1;
    return fall.range_ft > 0 ? (fall.vx_fps * t) / fall.range_ft : 1;
  };
  for (let k = 0; k * VACUUM_DT_S < T; k++) {
    const t = k * VACUUM_DT_S;
    pts.push({ t, f: fraction(t), agl: height(t) });
  }
  if (T > 0 || pts.length === 0) pts.push({ t: T, f: 1, agl: 0 });
  return pts;
}

function loftPoints(facts: FamilyFacts): FallPoint[] {
  const path = facts.loftPlan!.bombPath;
  const x0 = path[0].x_ft;
  const span = path[path.length - 1].x_ft - x0;
  const pts: FallPoint[] = [];
  for (const p of path) {
    const t = p.t_s ?? NaN;
    if (pts.length > 0 && !(t > pts[pts.length - 1].t)) continue;
    pts.push({ t, f: span > 0 ? (p.x_ft - x0) / span : 1, agl: p.alt_ft });
  }
  const last = pts[pts.length - 1];
  last.f = 1;
  last.agl = 0;
  return pts;
}

export function buildBomb(facts: FamilyFacts, rel: Coordinates, target: Waypoint, frame: LocalFrame): BombPath {
  const pts = facts.fall.kind === 'vacuum' ? vacuumPoints(facts.fall) : loftPoints(facts);
  const n = pts.length;
  const elev = target.elevation_ft ?? 0;
  const tgt = target.coordinates;
  const bomb: BombPath = {
    model: facts.fall.model, fall_s: pts[n - 1].t, n,
    tau_s: new Float64Array(n), lat: new Float64Array(n), lon: new Float64Array(n),
    e_m: new Float64Array(n), n_m: new Float64Array(n), up_m: new Float64Array(n),
    agl_ft: new Float64Array(n), msl_ft: new Float64Array(n),
  };
  pts.forEach((pt, i) => {
    // Straight in lat/lon from REL to TGT: the line the card draws for the bomb.
    const p = pt.f >= 1 ? tgt : { lat: rel.lat + (tgt.lat - rel.lat) * pt.f, lon: rel.lon + (tgt.lon - rel.lon) * pt.f };
    const local = toLocal(frame, p);
    bomb.tau_s[i] = pt.t;
    bomb.lat[i] = p.lat;
    bomb.lon[i] = p.lon;
    bomb.e_m[i] = local.e_m;
    bomb.n_m[i] = local.n_m;
    bomb.agl_ft[i] = pt.agl;
    bomb.msl_ft[i] = elev + pt.agl;
    bomb.up_m[i] = upOf(frame, elev + pt.agl);
  });
  return bomb;
}
