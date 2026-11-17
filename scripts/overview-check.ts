/**
 * Checks for the Flight overview's pure parts (src/lib/landing/nearThreats.ts,
 * overviewFrame.ts, overviewModel.ts, flightChoices.ts, jetCards.ts,
 * editedWhen.ts). Run by geo-check as an import after landing-check.
 *
 * Beside each check, "Red when" is the one-line change to the real module that
 * turns it red, and "Seen" is the line it printed when that change was made.
 * Every name, place and link here is made up; test-data/private is never read.
 * The checks leave the shared stores as they found them.
 */
import { readFileSync } from 'node:fs';
import type { Mission } from '../src/types/mission.types';
import type { ThreatInstance } from '../src/types/threat.types';
import type { Waypoint } from '../src/types/waypoint.types';
import type { DbWeapon } from '../src/types/weapon.types';
import type { FragOrdersPlayerGroup } from '../src/types/fragorders.types';
import { autoBuildAttack } from '../src/lib/autoBuildAttack';
import { buildKneeboardCard, type ThreatSystemInfo } from '../src/lib/buildKneeboardCard';
import { CARD_THREAT_ROWS } from '../src/lib/cardThreats';
import { calculateDestination, calculateDistance } from '../src/lib/coordinates';
import { useTheaterStore, type TheaterInfo } from '../src/stores/theaterStore';
import { useMissionStore } from '../src/stores/missionStore';
import { NEAR_RADIUS_NM, NEAR_ROWS, defaultNearWaypoint, nearThreatsAt, threatTotals, waypointThreatCounts } from '../src/lib/landing/nearThreats';
import { FRAME_MAX_HALF_NM, FRAME_MIN_HALF_NM, frameAround } from '../src/lib/landing/overviewFrame';
import { buildOverview } from '../src/lib/landing/overviewModel';
import { filterChoices, flightChoices, flightLabelOf, flightMatches } from '../src/lib/landing/flightChoices';
import { jetCardsFromGroup, jetCardsFromMission, readinessOf } from '../src/lib/landing/jetCards';
import { editedWhen, editedWhenCapital } from '../src/lib/landing/editedWhen';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};

// ─── The reference systems the sample uses: the app's own rows ──────────────
const reference = JSON.parse(readFileSync('crates/core/data/reference.json', 'utf8')) as { threat_systems: ThreatSystemInfo[] };
const SYSTEMS: ThreatSystemInfo[] = reference.threat_systems;
const sys = (id: string) => SYSTEMS.find((s) => s.id === id)!;

// A made-up laydown of 13 systems and 286 sites round one target: system, sites, nearest nm, bearing from TGT1.
const TGT = { lat: 37.68, lon: -116.62 };
const SAMPLE: Array<[string, number, number, number]> = [
  ['sa18', 52, 2.1, 198], ['sa8', 6, 4.4, 112], ['sa15', 4, 6.1, 235], ['sa6', 6, 7.0, 300], ['sa3', 4, 11.5, 205], ['hawk', 2, 18.0, 120],
  ['zsu23', 64, 1.6, 72], ['zsu57', 40, 3.4, 275], ['s60', 72, 5.0, 190], ['sa19', 18, 8.6, 160], ['sa11', 8, 23.0, 35], ['sa2', 4, 31.0, 350],
  ['ewr1l13', 6, 38.0, 330],
];
let nextId = 0;
const threat = (systemId: string, near: number, brg: number, extra: Partial<ThreatInstance> = {}): ThreatInstance =>
  ({ id: `t${nextId++}`, systemId, position: calculateDestination(TGT, brg, near), status: 'active', source: 'mission', ...extra }) as ThreatInstance;
/** Each system's first site at its nearest distance, the rest a little farther out on the same bearing, all inside 60 nm. */
const sampleThreats = (): ThreatInstance[] =>
  SAMPLE.flatMap(([id, sites, near, brg]) => Array.from({ length: sites }, (_, k) => threat(id, near + k * 0.05, brg)));
const tgtWp: Waypoint = { id: 'w-tgt', steerpoint: 3, name: 'TGT1', type: 'target', coordinates: TGT, elevation_ft: 5249 } as Waypoint;

// ─── N: the threats near a waypoint ──────────────────────────────────────────
const big = sampleThreats();
const near = nearThreatsAt(tgtWp, big, SYSTEMS);
const totals = threatTotals(big, SYSTEMS);
// Red when (nearThreatsAt): the sort line compares distance only (`a.nearest.distance_nm - b.nearest.distance_nm`).
// Seen: FAIL N1 the sample lists Igla, Osa, Tor, Kub: in reach first, nearest first (the card's order)  ["zsu23","sa18","zsu57","sa8"]
ok('N1 the sample lists Igla, Osa, Tor, Kub: in reach first, nearest first (the card\'s order)',
  JSON.stringify(near.rows.map((r) => r.systemId)) === JSON.stringify(['sa18', 'sa8', 'sa15', 'sa6']), JSON.stringify(near.rows.map((r) => r.systemId)));
// Red when (nearThreatsAt): `const moreInReach = ...` drops `&& !shown.has(c.systemId)`.
// Seen: FAIL N1 then "+ 2 more in reach" and "7 more systems, 212 threats, out of reach"  {"more":6,"out":7,"outThreats":212}
ok('N1 then "+ 2 more in reach" and "7 more systems, 212 threats, out of reach"',
  near.moreInReach === 2 && near.outSystems === 7 && near.outThreats === 212, JSON.stringify({ more: near.moreInReach, out: near.outSystems, outThreats: near.outThreats }));
// Red when (threatTotals): `tally.threats += count;` becomes `tally.threats += 1;`.
// Seen: FAIL N1 the tiles: SAM 5/24, SHORAD 3/28, AAA 3/176, MANPADS 1/52, Early warning 1/6; 13 systems, 286 threats  {"systems":13,"threats":286,"classes":[{"cls":"SAM","systems":5,"threats":5},{"cls":"SHORAD","systems":3,"threats":3},...
ok('N1 the tiles: SAM 5/24, SHORAD 3/28, AAA 3/176, MANPADS 1/52, Early warning 1/6; 13 systems, 286 threats',
  JSON.stringify(totals.classes.map((c) => [c.cls, c.systems, c.threats])) ===
    JSON.stringify([['SAM', 5, 24], ['SHORAD', 3, 28], ['AAA', 3, 176], ['MANPADS', 1, 52], ['EWR', 1, 6]]) && totals.systems === 13 && totals.threats === 286,
  JSON.stringify(totals));
// Red when (nearThreatsAt): `bearing_deg: Math.round(calculateBearing(...)) % 360` loses the `Math.round`.
// Seen: FAIL N1 a row reads as the card: nearest 7.0 nm at 300°, max range 13, × 6 sites  {"d":6.999999999999984,"b":300.00000000000125,"c":6}
const kub = near.rows.find((r) => r.systemId === 'sa6')!;
ok('N1 a row reads as the card: nearest 7.0 nm at 300°, max range 13, × 6 sites',
  kub && kub.nearest.distance_nm.toFixed(1) === '7.0' && kub.nearest.bearing_deg === 300 && kub.maxRange_nm === 13 && kub.count === 6 && kub.inReach && kub.name === '2K12 Kub' && kub.nato === 'SA-6 Gainful',
  JSON.stringify({ d: kub?.nearest.distance_nm, b: kub?.nearest.bearing_deg, c: kub?.count }));

// The card's own threat table, built the way the app builds a card, agrees with the rows.
const mk84 = { id: 'mk84', name: 'Mk-84 LDGP', category: 'bomb_unguided', guidance: 'none', weight_lbs: 2000, frag_min_safe_alt_ft: 1500, carried_by: ['f16c'] } as unknown as DbWeapon;
const f16cProfiles = JSON.parse(readFileSync('src-tauri/resources/profiles/f16c.json', 'utf8'));
const feeder = { id: 'w-ip', steerpoint: 2, name: 'IP', type: 'ip', coordinates: calculateDestination(TGT, 68, 15.3), elevation_ft: 5000 } as Waypoint;
const lead = { id: 'f1', callsign: 'Testcall 1-1', position: 1, role: 'flight_lead', aircraftId: 'f16c', loadout: [{ weaponType: 'Mk-84 LDGP', quantity: 2, weaponId: 'mk84' }] };
const built = autoBuildAttack({
  mission: { waypoints: [feeder, tgtWp], flightMembers: [lead], threats: [], attacks: [] },
  targetWaypointId: tgtWp.id, attackerId: 'f1', weapons: [mk84], profiles: f16cProfiles, threatSystems: [],
  overrides: { weaponId: 'mk84', profileId: 'f16c.dive.ccip30' },
} as never);
const attack = { ...built.attack!, id: 'a1', sequenceNumber: 1 };
const oneSitePerSystem = SAMPLE.map(([id, , d, b]) => threat(id, d, b));
const cardMission = {
  id: 'test-m1', name: 'Test Mission', date: '2026-01-01', theater: 'nevada', bullseye: { lat: 36.2, lon: -115.0 }, notes: '',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', waypoints: [feeder, tgtWp], threats: oneSitePerSystem,
  flightMembers: [lead], attacks: [attack], strikes: [],
} as unknown as Mission;
const card = buildKneeboardCard(cardMission, 'a1', [mk84], new Map(), SYSTEMS);
const cardNames = (card?.threatSection.threats ?? []).slice(0, CARD_THREAT_ROWS).map((t) => t.name);
const rowNames = nearThreatsAt(tgtWp, oneSitePerSystem, SYSTEMS).rows.map((r) => (r.nato ? `${r.name.split(' (')[0]} (${r.nato})` : r.name));
// Red when (nearThreatsAt): the sort line becomes `candidates.sort((a, b) => b.maxRange_nm - a.maxRange_nm);` (its own rule, not the card's).
// Seen: FAIL N2 with one site per system, the rows are the card's four, in the card's order  card ["9K38 Igla (SA-18 Grouse)","9K33 Osa (SA-8 Gecko)",...] rows ["1L13 Nebo-SV (Tall Rack)","S-75 Dvina (SA-2 Guideline)",...]
ok('N2 with one site per system, the rows are the card\'s four, in the card\'s order',
  card !== null && JSON.stringify(cardNames) === JSON.stringify(rowNames), `card ${JSON.stringify(cardNames)} rows ${JSON.stringify(rowNames)}`);

// Red when (nearThreatsAt): `const counted = sites.filter((s) => s.distance_nm <= NEAR_RADIUS_NM || reaches(s));` drops `|| reaches(s)`.
// Seen: FAIL N3 an SA-5 100 nm out reaches the waypoint and is listed, though the card's 60 nm pool leaves it out  []
const sa5 = [threat('sa5', 100, 90)];
const sa5Near = nearThreatsAt(tgtWp, sa5, SYSTEMS);
ok('N3 an SA-5 100 nm out reaches the waypoint and is listed, though the card\'s 60 nm pool leaves it out',
  sa5Near.rows.length === 1 && sa5Near.rows[0].inReach && NEAR_RADIUS_NM === 60, JSON.stringify(sa5Near.rows.map((r) => r.systemId)));
// Red when (cardThreats.canShoot): `if (t.threatType === 'EWR') return false;` is deleted.
// Seen: FAIL N4 an early-warning radar 3 nm out never "reaches", and the Shilka at 1.6 nm with 1.5 nm range does not either  [["p19",true],["sa8",true],["zsu23",false]]
const odd = nearThreatsAt(tgtWp, [threat('p19', 3, 10), threat('zsu23', 1.6, 72), threat('sa8', 5.9, 0)], SYSTEMS);
ok('N4 an early-warning radar 3 nm out never "reaches", and the Shilka at 1.6 nm with 1.5 nm range does not either',
  JSON.stringify(odd.rows.map((r) => [r.systemId, r.inReach])) === JSON.stringify([['sa8', true], ['zsu23', false], ['p19', false]]),
  JSON.stringify(odd.rows.map((r) => [r.systemId, r.inReach])));
// Red when (nearThreatsAt): `if (counted.length === 0) continue;` is deleted (a far system then takes a row).
// Seen: FAIL N5 a gun 80 nm away is not near: no row, counted out; × counts only near sites  {"waypointId":"w-tgt","rows":[{"systemId":"sa6","name":"2K12 Kub",...
const far = nearThreatsAt(tgtWp, [threat('zsu23', 80, 0), threat('sa6', 7, 300), threat('sa6', 70, 300)], SYSTEMS);
ok('N5 a gun 80 nm away is not near: no row, counted out; × counts only near sites',
  far.rows.length === 1 && far.rows[0].count === 1 && far.outSystems === 1 && far.outThreats === 1, JSON.stringify(far));
// Red when (nearThreatsAt): the early return for a waypoint without a position returns `empty` (out 0) instead.
// Seen: FAIL N6 no threats: no rows; a waypoint with no position: no rows and everything counted out
const none = nearThreatsAt(tgtWp, [], SYSTEMS);
const noPos = nearThreatsAt({ ...tgtWp, coordinates: { lat: NaN, lon: 0 } } as Waypoint, big, SYSTEMS);
ok('N6 no threats: no rows; a waypoint with no position: no rows and everything counted out',
  none.rows.length === 0 && none.outSystems === 0 && noPos.rows.length === 0 && noPos.outSystems === 13 && noPos.outThreats === 286);

// Every system is a row, "more in reach" or "out", once: for any laydown.
// Red when (nearThreatsAt): `if (shown.has(systemId) || inReachIds.has(systemId)) continue;` loses `|| inReachIds.has(systemId)`.
// Seen: FAIL N7 rows + more in reach + out = every system, in 200 random laydowns  laydown 7: {"rows":4,"more":2,"out":19,"all":23}
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
let bad = '';
for (let i = 0; i < 200 && !bad; i++) {
  const ts = Array.from({ length: 1 + Math.floor(rand() * 60) }, () => threat(SYSTEMS[Math.floor(rand() * SYSTEMS.length)].id, rand() * 120, rand() * 360));
  const r = nearThreatsAt(tgtWp, ts, SYSTEMS);
  const systemsAll = new Set(ts.map((t) => t.systemId)).size;
  if (r.rows.length + r.moreInReach + r.outSystems !== systemsAll || r.rows.length > NEAR_ROWS) bad = `laydown ${i}: ${JSON.stringify({ rows: r.rows.length, more: r.moreInReach, out: r.outSystems, all: systemsAll })}`;
}
ok('N7 rows + more in reach + out = every system, in 200 random laydowns', bad === '', bad);
// Red when (threatTotals): `if (!tally) continue;` becomes a tally into SAM.
// Seen: FAIL N8 a threat whose system the table does not hold is in the totals and in no tile
const unknown = threatTotals([threat('zz-unknown', 3, 0), threat('sa6', 3, 0)], SYSTEMS);
ok('N8 a threat whose system the table does not hold is in the totals and in no tile',
  unknown.systems === 2 && unknown.threats === 2 && unknown.classes.reduce((n, c) => n + c.threats, 0) === 1);

// Which waypoint the block opens on.
const wp = (id: string, steerpoint: number, type: string, at = TGT): Waypoint => ({ id, steerpoint, name: id.toUpperCase(), type, coordinates: at, elevation_ft: 0 } as Waypoint);
const hot = calculateDestination(TGT, 0, 40);
// Red when (defaultNearWaypoint): the line `if (target) return target.id;` is deleted.
// Seen: FAIL N9 an attack's target wins over a waypoint marked "target", which wins over the most-threatened one
ok('N9 an attack\'s target wins over a waypoint marked "target", which wins over the most-threatened one',
  defaultNearWaypoint([wp('a', 1, 'nav'), wp('b', 2, 'target')], [{ targetWaypointId: 'a' }], [], SYSTEMS) === 'a' &&
  defaultNearWaypoint([wp('a', 1, 'nav'), wp('b', 2, 'target')], [], [], SYSTEMS) === 'b' &&
  defaultNearWaypoint([wp('a', 1, 'nav'), wp('c', 2, 'nav', hot)], [], [threat('sa6', 40 + 3, 0)], SYSTEMS) === 'c');
// Red when (defaultNearWaypoint): the sort drops `Number(a.w.steerpoint === 0) - Number(b.w.steerpoint === 0)`.
// Seen: FAIL N9 with nothing anywhere, the first turn point, not the spawn point; no waypoints, none
ok('N9 with nothing anywhere, the first turn point, not the spawn point; no waypoints, none',
  defaultNearWaypoint([wp('s', 0, 'departure'), wp('a', 1, 'nav')], [], [], SYSTEMS) === 'a' && defaultNearWaypoint([], [], [], SYSTEMS) === null);
// Red when (waypointThreatCounts): `for (const id of inReach) near.delete(id);` is deleted.
// Seen: FAIL N10 the picker counts systems in reach, and the others near, each once  {"inReach":6,"nearOnly":8}
const counts = waypointThreatCounts(tgtWp, big, SYSTEMS);
ok('N10 the picker counts systems in reach, and the others near, each once', counts.inReach === 6 && counts.nearOnly === 7, JSON.stringify(counts));
// A destroyed site keeps its row and its place, as on the card, and the row carries the card's word for it.
// Red when (nearThreatsAt): the row's `status: nearest.threat.status` becomes `status: 'active' as const`.
// Seen: FAIL N11 a destroyed SA-6 7 nm out is still listed in reach, and its row says it is destroyed  [["sa6",true,"active"]]
const struck = nearThreatsAt(tgtWp, [threat('sa6', 7, 300, { status: 'destroyed' })], SYSTEMS);
ok('N11 a destroyed SA-6 7 nm out is still listed in reach, and its row says it is destroyed',
  struck.rows.length === 1 && struck.rows[0].inReach && struck.rows[0].nearest.status === 'destroyed', JSON.stringify(struck.rows.map((r) => [r.systemId, r.inReach, r.nearest.status])));

// ─── F: where the overview's map looks ───────────────────────────────────────
const halfOf = (rows: Array<[string, number, number]>) =>
  frameAround(TGT, rows.map(([id, d, b]) => ({ systemId: id, position: calculateDestination(TGT, b, d), maxRange_nm: sys(id).max_range_nm })));
const f0 = frameAround(TGT, [])!;
// Red when (frameAround): `const halfWidth_nm = Math.max(hx, FRAME_MIN_HALF_NM);` becomes `= hx;`.
// Seen: FAIL F1 nothing listed: a 10 nm picture round the waypoint, centred on it  {"center":{"lat":37.68,"lon":-116.62},"halfWidth_nm":0,"halfHeight_nm":5,...}
ok('F1 nothing listed: a 10 nm picture round the waypoint, centred on it',
  f0.halfWidth_nm === FRAME_MIN_HALF_NM && f0.halfHeight_nm === FRAME_MIN_HALF_NM && Math.abs((f0.bounds[0][0] + f0.bounds[1][0]) / 2 - TGT.lat) < 1e-9 && FRAME_MIN_HALF_NM === 5,
  JSON.stringify(f0));
const fKub = halfOf([['sa6', 7, 300]])!;
// Red when (frameAround): the ring branch's `hx = Math.max(hx, dx + r);` drops `+ r`.
// Seen: FAIL F2 an SA-6 7 nm out: its whole 13 nm ring is in view  {"center":{"lat":37.68,"lon":-116.62},"halfWidth_nm":6.062855028503892,"halfHeight_nm":16.49351373023552,...}
ok('F2 an SA-6 7 nm out: its whole 13 nm ring is in view',
  fKub.ringsWhole.includes('sa6') && fKub.halfWidth_nm >= 7 * Math.sin((60 * Math.PI) / 180) + 13 - 0.01 && fKub.halfHeight_nm >= 3.5 + 13 - 0.01, JSON.stringify(fKub));
const f10 = halfOf([['sa10', 30, 90]])!;
// Red when (frameAround): the ring test `d + r <= FRAME_MAX_HALF_NM` becomes `r <= FRAME_MAX_HALF_NM * 2`.
// Seen: FAIL F3 an SA-10 30 nm out with a 47 nm ring: the site is in view, the ring is not made to fit  {"center":{"lat":37.68,"lon":-116.62},"halfWidth_nm":76.97932994738318,"halfHeight_nm":47.10095981607975,...}
ok('F3 an SA-10 30 nm out with a 47 nm ring: the site is in view, the ring is not made to fit',
  !f10.ringsWhole.includes('sa10') && f10.halfWidth_nm >= 29.9 && f10.halfWidth_nm <= 30.1 && f10.sitesOff.length === 0, JSON.stringify(f10));
const f5 = halfOf([['sa5', 100, 90]])!;
// Red when (frameAround): the `else if (d <= FRAME_MAX_HALF_NM)` test becomes `else if (true)` (every site is framed).
// Seen: FAIL F4 an SA-5 100 nm out covering the waypoint: off the map, the row says so, the picture stays 10 nm  {"center":{"lat":37.68,"lon":-116.62},"halfWidth_nm":99.91582848187812,"halfHeight_nm":5,...}
ok('F4 an SA-5 100 nm out covering the waypoint: off the map, the row says so, the picture stays 10 nm',
  f5.sitesOff.includes('sa5') && f5.halfWidth_nm === FRAME_MIN_HALF_NM, JSON.stringify(f5));
// Red when (frameAround): the site test `} else if (d <= FRAME_MAX_HALF_NM) {` becomes `d <= FRAME_MAX_HALF_NM * 2`.
// Seen: FAIL F5 never more than 60 nm each side (the block's own near radius), whatever is framed  118.98995823194554
let widest = 0;
for (let i = 0; i < 200; i++) {
  const f = frameAround(TGT, Array.from({ length: 6 }, () => ({ systemId: 'x', position: calculateDestination(TGT, rand() * 360, rand() * 120), maxRange_nm: rand() * 130 })))!;
  widest = Math.max(widest, f.halfWidth_nm, f.halfHeight_nm);
}
ok('F5 never more than 60 nm each side (the block\'s own near radius), whatever is framed',
  widest <= FRAME_MAX_HALF_NM && FRAME_MAX_HALF_NM === NEAR_RADIUS_NM && FRAME_MAX_HALF_NM === 60, String(widest));
// Red when (frameAround): `if (!ok(center)) return null;` is deleted (a NaN box is handed to the map).
// Seen: FAIL F6 no waypoint position: no frame; a row with no position is skipped
const fBad = frameAround(TGT, [{ systemId: 'x', position: { lat: NaN, lon: 1 }, maxRange_nm: 5 }])!;
ok('F6 no waypoint position: no frame; a row with no position is skipped',
  frameAround({ lat: NaN, lon: 0 }, []) === null && fBad.halfWidth_nm === FRAME_MIN_HALF_NM && Number.isFinite(fBad.bounds[0][0]));
// The frame holds every listed site that is within reach of the map.
// Red when (frameAround): `hy = Math.max(hy, dy);` is deleted in the site branch.
// Seen: FAIL F7 every framed site within 60 nm lies inside the box  {"i":6,"r":{"systemId":"s4","position":{"lat":38.59139664525442,"lon":-116.62869483692309},...
let outside = '';
for (let i = 0; i < 200 && !outside; i++) {
  const rows = Array.from({ length: 6 }, (_, k) => ({ systemId: `s${k}`, position: calculateDestination(TGT, rand() * 360, rand() * 70), maxRange_nm: rand() * 50 }));
  const f = frameAround(TGT, rows)!;
  for (const r of rows) {
    if (calculateDistance(TGT, r.position) > FRAME_MAX_HALF_NM - 0.5) continue;
    const inside = r.position.lat >= f.bounds[0][0] - 1e-6 && r.position.lat <= f.bounds[1][0] + 1e-6 && r.position.lon >= f.bounds[0][1] - 1e-6 && r.position.lon <= f.bounds[1][1] + 1e-6;
    if (!inside) outside = JSON.stringify({ i, r, f });
  }
}
ok('F7 every framed site within 60 nm lies inside the box', outside === '', outside);
// Ordinary long-range SAMs that cover the target from 20-31 nm show their whole ring (a 40 nm cap would cut all three).
// Red when (overviewFrame): `export const FRAME_MAX_HALF_NM = 60;` becomes `= 40;`.
// Seen: FAIL F8 an SA-2 20 nm out, an SA-11 22 nm out and an SA-2 31 nm out: each whole ring is in view  [[[],20],[[],16],[[],31]]
const wholeRings = [halfOf([['sa2', 20, 0]])!, halfOf([['sa11', 22, 45]])!, halfOf([['sa2', 31, 350]])!];
ok('F8 an SA-2 20 nm out, an SA-11 22 nm out and an SA-2 31 nm out: each whole ring is in view',
  wholeRings.every((f) => f.ringsWhole.length === 1 && f.sitesOff.length === 0), JSON.stringify(wholeRings.map((f) => [f.ringsWhole, Math.round(f.halfHeight_nm)])));

// ─── O: the overview model ────────────────────────────────────────────────────
const nevada: Record<string, TheaterInfo> = { nevada: { dcs_name: 'nevada', id: 'nevada', display_name: 'Test nevada', supported: true, verified: true, default_center: { lat: 36.5, lon: -115.2 } } };
const before = useTheaterStore.getState().theaters;
useTheaterStore.setState({ theaters: nevada });
try {
  const refs = { threatSystems: SYSTEMS, aircraft: [{ id: 'f16c', name: 'F-16C Viper' }], weapons: [mk84], fuzeOptions: new Map() };
  const hiddenNear = threat('sa6', 1, 10, { hiddenOnPlanner: true, notes: 'FAKE-HIDDEN-NOTE' } as Partial<ThreatInstance>);
  const leakMission = { ...cardMission, threats: [...oneSitePerSystem, hiddenNear] } as Mission;
  const strict = buildOverview(leakMission, { onPlanner: false, onMap: false }, refs, null);
  const text = JSON.stringify(strict);
  // Red when (buildOverview): `const threats = visible.threats;` becomes `const threats = mission.threats;`.
  // Seen: FAIL O1 a threat the author hid is not listed, counted, framed or drawn, and leaves no trace  rows ["sa6","sa18","sa8","sa15"] threats 14
  ok('O1 a threat the author hid is not listed, counted, framed or drawn, and leaves no trace',
    !strict.mapThreatIds.includes(hiddenNear.id) && strict.totals.threats === 13 && !text.includes(hiddenNear.id) && !text.includes('FAKE-HIDDEN-NOTE') &&
      !/probable|revealed/i.test(text) && strict.near!.rows[0].systemId === 'sa18',
    `rows ${JSON.stringify(strict.near?.rows.map((r) => r.systemId))} threats ${strict.totals.threats}`);
  const revealed = buildOverview(leakMission, { onPlanner: true, onMap: false }, refs, null);
  // Red when (buildOverview): the reveal is ignored (`visibleMission(mission, { onPlanner: false, onMap: false })`).
  // Seen: FAIL O2 revealed in Settings > Admin, it counts like any other threat
  ok('O2 revealed in Settings > Admin, it counts like any other threat',
    revealed.totals.threats === 14 && revealed.near!.rows[0].systemId === 'sa6' && revealed.mapThreatIds.includes(hiddenNear.id));
  // Red when (buildOverview): `const asked = ...` is replaced by `undefined` (the pick is ignored).
  // Seen: FAIL O3 the block follows the waypoint picked, and the default is the attack's target
  const picked = buildOverview(cardMission, { onPlanner: false, onMap: false }, refs, 'w-ip');
  const dflt = buildOverview(cardMission, { onPlanner: false, onMap: false }, refs, 'no-such-waypoint');
  ok('O3 the block follows the waypoint picked, and the default is the attack\'s target',
    picked.chosen?.id === 'w-ip' && picked.near?.waypointId === 'w-ip' && Math.abs(picked.frame!.center.lat - feeder.coordinates.lat) < 1e-9 && dflt.chosen?.id === 'w-tgt');
  // Red when (flightTitle): jetsLine drops the "×" form (`${n} jets · ${names.join(', ')}` always).
  // Seen: FAIL O4 the header names the flight and its jets: "Testcall 1" and "1 × F-16C Viper"  {"flight":"Testcall 1","jetsLine":"1 jets · F-16C Viper"}
  ok('O4 the header names the flight and its jets: "Testcall 1" and "1 × F-16C Viper"',
    dflt.flight === 'Testcall 1' && dflt.jetsLine === '1 × F-16C Viper', JSON.stringify({ flight: dflt.flight, jetsLine: dflt.jetsLine }));
  // Four short-range systems close in take the four rows; the SA-10 30 nm out that covers the target is only
  // "+ 1 more in reach". The map still frames it.
  // Red when (buildOverview): the frame is built from `near.rows` alone (the `...near.moreInReachSites` dropped).
  // Seen: FAIL F9 a system in reach that is not a row (an SA-10 30 nm out behind four close rows) is inside the map's box  {"rows":["sa18","sa8","sa15","sa6"],"halfWidth":16.463321982625377}
  const covered = buildOverview({ ...cardMission, threats: [threat('sa18', 1, 10), threat('sa8', 2, 100), threat('sa15', 3, 200), threat('sa6', 4, 300), threat('sa10', 30, 90)] } as Mission,
    { onPlanner: false, onMap: false }, refs, null);
  const sa10Site = calculateDestination(TGT, 90, 30);
  const box = covered.frame!.bounds;
  ok('F9 a system in reach that is not a row (an SA-10 30 nm out behind four close rows) is inside the map\'s box',
    covered.near!.moreInReach === 1 && !covered.near!.rows.some((r) => r.systemId === 'sa10') &&
      sa10Site.lat >= box[0][0] && sa10Site.lat <= box[1][0] && sa10Site.lon >= box[0][1] && sa10Site.lon <= box[1][1],
    JSON.stringify({ rows: covered.near?.rows.map((r) => r.systemId), halfWidth: covered.frame?.halfWidth_nm }));
} finally {
  useTheaterStore.setState({ theaters: before });
}

// ─── C: choose your flight ────────────────────────────────────────────────────
const group = (callsign: string, name: string, type: string, units: number): FragOrdersPlayerGroup =>
  ({ callsign, name, aircraft_type: type, waypoints: [], units: Array.from({ length: units }, (_, i) => ({ name: `u${i}`, callsign: `${callsign.split(' ')[0]} ${i + 1}`, onboard_num: null, loadout: [] })) }) as unknown as FragOrdersPlayerGroup;
const groups = [
  group('Venom11 1-1', 'Venom', 'F-16C_50', 4), group('Colt 2-1', 'Colt', 'FA-18C_hornet', 2), group('Jester 4-1', 'Jester', 'F-16C_50', 4),
  group('Uzi 1-1', 'Uzi', 'F-4E-45MC', 4), group('Lance 1-1', 'Lance', 'AH-64D_BLK_II', 2), group('', 'Nameless', 'F-16C_50', 6), group('', '', 'F-16C_50', 1),
];
const aircraft = [{ id: 'f16c', name: 'F-16C Viper' }, { id: 'f18c', name: 'F/A-18C Hornet' }, { id: 'f4e', name: 'F-4E Phantom II' }];
const types = flightChoices(groups, aircraft, new Set(['f16c', 'f18c', 'f4e']));
// Red when (flightChoices): the map lookup becomes `const type = { aircraftId, aircraftName, hasProfiles, flights: [] }` (no grouping).
// Seen: FAIL C1 grouped by aircraft in the mission's order, flights in theirs  [["F-16C Viper",["Flight 7"]],["F/A-18C Hornet",["Colt 2"]],...
ok('C1 grouped by aircraft in the mission\'s order, flights in theirs',
  JSON.stringify(types.map((t) => [t.aircraftName, t.flights.map((f) => f.label)])) ===
    JSON.stringify([['F-16C Viper', ['Venom 1', 'Jester 4', 'Nameless', 'Flight 7']], ['F/A-18C Hornet', ['Colt 2']], ['F-4E Phantom II', ['Uzi 1']], ['AH-64D_BLK_II', ['Lance 1']]]),
  JSON.stringify(types.map((t) => [t.aircraftName, t.flights.map((f) => f.label)])));
// Red when (flightChoices): `profileAircraftIds ? profileAircraftIds.has(aircraftId) : null` becomes `true`.
// Seen: FAIL C2 the Apache has no delivery profiles and is still listed; while the library loads nothing is said
ok('C2 the Apache has no delivery profiles and is still listed; while the library loads nothing is said',
  types[3]?.hasProfiles === false && types[0]?.hasProfiles === true && flightChoices(groups, aircraft, null).every((t) => t.hasProfiles === null) &&
    types[0]?.flights[2]?.jets === 6 && types[0]?.flights[0]?.index === 0 && types[0]?.flights[1]?.index === 2);
// Red when (flightMatches): the number test becomes `hay.includes(t)`.
// Seen: FAIL C3 "4" finds Jester 4 only; "f16" every F-16; "venom 1" Venom 1; "hornet" the Hornet; "zzz" nothing  {"four":["Jester 4","Uzi 1","Lance 1"],"f16":["Venom 1","Jester 4","Nameless","Flight 7"]}
const labels = (q: string) => filterChoices(types, q).flatMap((t) => t.flights.map((f) => f.label));
ok('C3 "4" finds Jester 4 only; "f16" every F-16; "venom 1" Venom 1; "hornet" the Hornet; "zzz" nothing',
  JSON.stringify(labels('4')) === '["Jester 4"]' && labels('f16').length === 4 && JSON.stringify(labels('venom 1')) === '["Venom 1"]' &&
    JSON.stringify(labels('hornet')) === '["Colt 2"]' && labels('zzz').length === 0 && labels('').length === 7,
  JSON.stringify({ four: labels('4'), f16: labels('f16') }));
// Red when (flightLabelOf): `return call || (group.name ?? '').trim() || ...` loses the group-name fallback.
// Seen: FAIL C3 a label from the lead's callsign, then the group name, then the place in the list
ok('C3 a label from the lead\'s callsign, then the group name, then the place in the list',
  flightLabelOf({ callsign: 'Viper12', name: 'x' }, 0) === 'Viper 1' && flightLabelOf({ callsign: '', name: 'Hawg' }, 0) === 'Hawg' && flightMatches({ label: 'Rage 5', aircraftName: 'F/A-18C Hornet', aircraftId: 'f18c' }, 'f/a-18'));
// The step names each jet exactly as the import will store it, an empty unit callsign included.
// Red when (jetCardsFromGroup): the callsign goes back to its own fallback, `formatCallsign(unit.callsign ?? '') || `Pilot ${i + 1}``.
// Seen: FAIL C4 the step's jet names are the imported mission's, even where the mission left a callsign empty  {"shown":["Testcall 2-1","Pilot 2"],"stored":["Testcall 2-1","Testcall 2-2"]}
{
  const unnamed = { callsign: 'Testcall 2-1', name: 'Testcall', aircraft_type: 'F-16C_50', waypoints: [],
    units: [{ name: 'u1', callsign: 'Testcall21', onboard_num: null, loadout: [] }, { name: 'u2', callsign: '', onboard_num: null, loadout: [] }] } as unknown as FragOrdersPlayerGroup;
  const storeBefore = useMissionStore.getState();
  useMissionStore.getState().importFromFragOrders({ theater: 'nevada', bullseye: { lat: 36, lon: -115 }, player_groups: [unnamed], threats: [], trigger_zones: [], warnings: [], notices: [] } as never, 0);
  const stored = (useMissionStore.getState().mission?.flightMembers ?? []).map((m) => m.callsign);
  useMissionStore.setState(storeBefore, true);
  const shown = jetCardsFromGroup(unnamed).map((c) => c.callsign);
  ok('C4 the step\'s jet names are the imported mission\'s, even where the mission left a callsign empty',
    JSON.stringify(shown) === JSON.stringify(stored) && JSON.stringify(stored) === '["Testcall 2-1","Testcall 2-2"]', JSON.stringify({ shown, stored }));
}

// ─── J: jet cards ─────────────────────────────────────────────────────────────
const loaded = {
  ...group('Venom11 1-1', 'Venom', 'F-16C_50', 6),
  units: Array.from({ length: 6 }, (_, i) => ({ name: `u${i}`, callsign: `Venom1${i + 1}`, onboard_num: null,
    loadout: i === 0 ? [{ weapon_id: 'mk84', name: 'Mk-84 LDGP', quantity: 2 }, { weapon_id: null, name: 'AGM-45B Shrike ARM', quantity: 1 }] : [] })),
} as unknown as FragOrdersPlayerGroup;
const stepCards = jetCardsFromGroup(loaded);
// Red when (jetCardsFromGroup): `group.units.slice(0, IMPORTED_JETS)` loses the slice.
// Seen: FAIL J1 the step shows the four jets the import keeps, the lead first, an unknown store flagged  6
ok('J1 the step shows the four jets the import keeps, the lead first, an unknown store flagged',
  stepCards.length === 4 && stepCards[0].callsign === 'Venom 1-1' && stepCards[0].role === 'Flight Lead' && stepCards[1].role === 'Wingman' &&
    stepCards[0].stores[1].known === false && stepCards[0].stores[0].known === true && stepCards[1].stores.length === 0 && stepCards[0].foot === undefined,
  String(stepCards.length));
const flights = [
  { memberId: 'm1', callsign: 'Venom 1-1', flight: 'Venom 1', position: 1, role: 'flight_lead', aircraftName: 'F-16C Viper', attackIds: ['a1', 'a3'], loadout: [{ quantity: 2, name: 'x', known: true }] },
  { memberId: 'm2', callsign: 'Venom 1-2', flight: 'Venom 1', position: 2, role: 'wingman', aircraftName: 'F-16C Viper', attackIds: ['a2'], loadout: [{ quantity: 2, name: 'y', known: true }] },
  { memberId: 'm3', callsign: 'Venom 1-3', flight: 'Venom 1', position: 3, role: 'wingman', aircraftName: 'F-16C Viper', attackIds: [], loadout: [{ quantity: 1, name: 'z', known: false }] },
  { memberId: 'm4', callsign: 'Venom 1-4', flight: 'Venom 1', position: 4, role: 'wingman', aircraftName: 'F-16C Viper', attackIds: [], loadout: [] },
] as never;
const atk = [
  { id: 'a1', attackerId: 'm1', sequenceNumber: 1, strikeId: 's1', totOffset_s: 0, sourceProfileName: 'Maverick 8k level', profileType: 'level_ccrp', estimated: true },
  { id: 'a2', attackerId: 'm2', sequenceNumber: 2, totOffset_s: 30, profileType: 'dive_ccip', estimated: false },
  { id: 'a3', attackerId: 'm1', sequenceNumber: 3, profileType: 'loft_ccrp' },
] as never;
const ovCards = jetCardsFromMission({ flights }, atk);
// Red when (jetCardsFromMission): the lead text drops the strike test (`· T+…` always).
// Seen: FAIL J2 the foot: "#1 · T+0s" for a strike's jet, "#2" for a lone attack, the profile, ESTIMATED apart, "+1 more"; no attack; no A-G stores  [{"state":"planned","lead":"#1 · T+0s","profile":"Maverick 8k level","estimated":true,"more":1},{"state":"planned","lead":"#2 · T+30s",...
ok('J2 the foot: "#1 · T+0s" for a strike\'s jet, "#2" for a lone attack, the profile, ESTIMATED apart, "+1 more"; no attack; no A-G stores',
  JSON.stringify(ovCards.map((c) => c.foot)) === JSON.stringify([
    { state: 'planned', lead: '#1 · T+0s', profile: 'Maverick 8k level', estimated: true, more: 1 },
    { state: 'planned', lead: '#2', profile: 'Dive CCIP', estimated: false, more: 0 },
    { state: 'none', lead: null, profile: null, estimated: false, more: 0 },
    { state: 'noag', lead: null, profile: null, estimated: false, more: 0 },
  ]), JSON.stringify(ovCards.map((c) => c.foot)));
// Red when (readinessOf): `if (jet.attackIds.some((id) => !blocked.has(id)))` becomes `if (jet.attackIds.length > 0)`.
// Seen: FAIL J3 "2 of 4 planned · 1 cards ready" when one jet's only attack cannot make a card  {"planned":2,"cardsReady":2,"jets":4}
const ready = readinessOf({ flights, attacks: [{ id: 'a1', status: 'ready' }, { id: 'a2', status: 'blocked' }, { id: 'a3', status: 'caution' }] } as never);
ok('J3 "2 of 4 planned · 1 cards ready" when one jet\'s only attack cannot make a card', ready.planned === 2 && ready.cardsReady === 1 && ready.jets === 4, JSON.stringify(ready));

// ─── E: last edited ───────────────────────────────────────────────────────────
const now = new Date(2026, 10, 16, 15, 0);
const at = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m, d, h, mi).toISOString();
// Red when (editedWhen): the yesterday line builds `now.getDate() + 1`.
// Seen: FAIL E1 today, yesterday, this year, another year, nothing  ["today, 14:20","15 Nov","9 Nov","9 Nov 2025",null]
const words = [at(2026, 10, 16, 14, 20), at(2026, 10, 15, 21, 5), at(2026, 10, 9, 8, 0), at(2025, 10, 9, 8, 0), 'garbage'].map((s) => editedWhen(s, now));
ok('E1 today, yesterday, this year, another year, nothing',
  JSON.stringify(words) === JSON.stringify(['today, 14:20', 'yesterday, 21:05', '9 Nov', '9 Nov 2025', null]) && editedWhenCapital(at(2026, 10, 16, 14, 20), now) === 'Today, 14:20' &&
    editedWhen(at(2026, 0, 1, 0, 5), new Date(2026, 0, 1, 23, 0)) === 'today, 00:05' && editedWhen(at(2025, 11, 31, 23, 0), new Date(2026, 0, 1, 9, 0)) === 'yesterday, 23:00',
  JSON.stringify(words));

// ─── X: one copy of the profile names ─────────────────────────────────────────
// Red when (AttackList.tsx): the PROFILE_LABELS map is pasted back in (a `level_ccrp:` line) and the import of lib/profileLabels dropped.
// Seen: FAIL X5 the attack list names its profiles from the shared map and keeps no copy
{
  const list = readFileSync('src/components/attacks/AttackList.tsx', 'utf8');
  ok('X5 the attack list names its profiles from the shared map and keeps no copy',
    !list.includes('level_ccrp:') && /from '\.\.\/\.\.\/lib\/profileLabels'/.test(list));
}
