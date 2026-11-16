/**
 * DEV ONLY (the playback harness). Made-up attacks in Nevada, built through
 * the planner's own functions the way scripts/geo-check.ts builds its
 * playback fixtures: auto-build on the real F-16C profile file and the real
 * Mk-82 row, then the playback library. No real mission, nothing private.
 *
 * The target is the synthetic NTTR point geo-check uses (4,000 ft), the IP
 * 15.3 nm out on 068°.
 *
 * - one (the default): a lone pop-up, as the editor hands over one jet. With
 *   door=list it is handed over as the attack list hands over a lone attack's row.
 * - strike4: geo-check's four-ship, saved the editor's way (newJet,
 *   assignFlanks, saveStrikeTo) and handed over as the attack list hands a
 *   saved strike over (the plan as saved and the strike to play; the view
 *   builds the jets): #1 and #2 pop-ups on TGT1, #3 a pop-up on
 *   TGT2 (2 nm on 160°, 5,200 ft), #4 a loft on TGT1, offsets 0/10/40/40,
 *   IPs automatic. With door=editor the same four jets are handed over as the
 *   attack editor hands them over (the jets already built).
 * - late: the four-ship with #2 at 300 s, so it is still out of sight when
 *   the time bar starts; opened watching #2. Handed over like the editor.
 * - skip: three pop-ups at 0/10/40 with #2's target pointed at a waypoint
 *   that does not exist, so #2 is skipped and #3 flies as the second jet.
 *   Handed over like the editor.
 * - dive4: four F-16C 30° CCIP dive bombs on TGT1 at 0/5/10/15 s, saved the
 *   editor's way and handed over as the attack list hands a saved strike over
 *   (with door=editor, as the editor hands one over). It is there to look at
 *   the dive's bomb, which falls in an arc from each jet's own dive line.
 * - ridge: the one place the blast rule can warn. Two F-16C 30° dive bombers
 *   with Mk-84s on a shared IP, #1 on a second target up a ridge, #2 on TGT1,
 *   the ridge put where #2's own track passes 12 s before its impact, 150 ft
 *   above the ridge, so #2 flies through #1's burst when it is over its target
 *   about 11.9 s after #1. Handed over like dive4.
 *
 * The strikes also carry what the door gives a strike: a way to write times
 * back (the checks pass a recorder), and from the editor's what the cards go
 * by when two jets share a time.
 *
 * `rule` is the frag rule the strike is saved with ('burst' or 'time'); left
 * out, the strike says nothing and the app's own default applies.
 */
import f16Profiles from '../../../../src-tauri/resources/profiles/f16c.json';
import reference from '../../../../crates/core/data/reference.json';
import { autoBuildAttack } from '../../../lib/autoBuildAttack';
import { draftAttackData, resolveDraft, type DraftContext } from '../../../lib/attackDraft';
import { attackIpAnchor } from '../../../lib/ipAnchor';
import { calculateDestination } from '../../../lib/coordinates';
import { saveStrikeTo } from '../../../lib/strike';
import { assignFlanks, newJet } from '../../../lib/strikeDraft';
import { buildStrikePlayback, playbackInputFromMission, retime, strikeEvents, type PlaybackInput } from '../../../lib/playback';
import { firstActionTau, playRange } from '../../../lib/playbackScene';
import type { Attack, DbWeapon, DeliveryProfile, Mission, Strike, Waypoint } from '../../../types';
import type { FragRule } from '../../../types/strike.types';
import type { BlastMeaning } from '../../../types/weapon.types';
import type { EditorLaunch, PlaybackLaunch } from '../types';

export const TARGET = { lat: 37.15, lon: -116.83 };
export const TARGET_ELEVATION_FT = 4000;
export const IP_BEARING_DEG = 68;
export const IP_DISTANCE_NM = 15.3;

/**
 * The blast radii the harness gives two weapon rows, the figures a community test reports (Mk-82 250 ft, Mk-84 360
 * ft). They are fixture overrides on copies of the rows: nothing here touches the data file, and a row that
 * carries a radius of its own keeps it.
 */
const FIXTURE_BLAST: Record<string, [number, BlastMeaning]> = { mk82: [250, 'any_damage'], mk84: [360, 'destroyed'] };
const weapons = (reference as unknown as { weapons: DbWeapon[] }).weapons.map((w) => {
  const blast = FIXTURE_BLAST[w.id];
  return blast && w.blast_radius_ft == null
    ? { ...w, blast_radius_ft: blast[0], blast_radius_meaning: blast[1], blast_radius_source: 'community_measurement' as const }
    : w;
});
const profiles = f16Profiles as unknown as DeliveryProfile[];

function mission(): Mission {
  const target: Waypoint = { id: 'h-tgt', steerpoint: 8, name: 'TGT1', type: 'target', coordinates: TARGET, elevation_ft: TARGET_ELEVATION_FT } as Waypoint;
  const ip: Waypoint = {
    id: 'h-ip', steerpoint: 7, name: 'STPT 7', type: 'nav',
    coordinates: calculateDestination(TARGET, IP_BEARING_DEG, IP_DISTANCE_NM), elevation_ft: 5000,
  } as Waypoint;
  return {
    id: 'harness', name: 'Playback harness (synthetic)', date: '', theater: 'nevada', bullseye: TARGET, notes: '', createdAt: '', updatedAt: '',
    waypoints: [ip, target], threats: [], attacks: [], strikes: [],
    flightMembers: [{ id: 'h-p1', callsign: 'Viper 1-1', aircraftId: 'f16c', position: 1, role: 'flight_lead', loadout: [{ weaponType: 'Mk-82 LDGP', quantity: 6 }] }],
  } as unknown as Mission;
}

/** The pop-up auto-built for the harness's one pilot, and the plan it is built on. */
function lonePopup() {
  const m = mission();
  const b = autoBuildAttack({
    mission: m, targetWaypointId: 'h-tgt', attackerId: 'h-p1', weapons, profiles, threatSystems: [],
    overrides: { weaponId: 'mk82', profileId: 'f16c.popup.std' },
  });
  if (!b.attack) throw new Error(`The harness pop-up did not auto-build: ${b.problems?.join('; ')}`);
  return { m, attack: { ...b.attack, id: 'h-attack' } as Attack };
}

/**
 * The pop-up as the attack list hands over a lone attack's row: the plan as saved, with the pop-up in it as the
 * planner's third attack (so its number is not its seat number), and the attack to play. No Apply: a lone attack has
 * no times to move.
 */
export function harnessLoneFromList(notes: string[] = []): PlaybackLaunch {
  const { m, attack } = lonePopup();
  return { fromMission: { mission: { ...m, attacks: [{ ...attack, sequenceNumber: 3 }] }, subject: { attackId: attack.id }, weapons }, jetId: attack.id, notes };
}

/** The pop-up as the editor would hand it to playback: one jet, offset 0. */
export function harnessLaunch(notes: string[] = [], rule?: FragRule): EditorLaunch {
  const { m, attack } = lonePopup();
  const target = m.waypoints.find((w) => w.id === 'h-tgt')!;
  const input: PlaybackInput = {
    name: 'Viper 1-1',
    jets: [{ id: attack.id, attack, ipAnchor: attackIpAnchor(m.waypoints, attack), target, weapon: weapons.find((w) => w.id === 'mk82'), totOffset_s: 0, label: '#1', callsign: 'Viper 1-1' }],
    ...(rule ? { fragRule: rule } : {}),
  };
  // The title the editor gives a lone attack: the jet's callsign.
  return { input, title: 'Viper 1-1', jetId: attack.id, notes };
}

/**
 * The four pilots and both targets, the way geo-check's B3 fixture lays them out. TGT2 is 2 nm out on 160° at 5,200
 * ft unless a place is given for it.
 */
function strikeMission(tgt2: { coordinates: { lat: number; lon: number }; elevation_ft: number } = { coordinates: calculateDestination(TARGET, 160, 2), elevation_ft: 5200 }): Mission {
  const crew = (id: string, position: number) => ({ id, callsign: `Viper 1-${position}`, aircraftId: 'f16c', position, loadout: [{ weaponType: 'Mk-82 LDGP', quantity: 6 }] });
  return {
    id: 'harness-strike', name: 'Playback harness strike (synthetic)', date: '', theater: 'nevada', bullseye: TARGET, notes: '', createdAt: '', updatedAt: '',
    waypoints: [
      { id: 'h-ip', steerpoint: 7, name: 'STPT 7', type: 'turnpoint', coordinates: calculateDestination(TARGET, IP_BEARING_DEG, IP_DISTANCE_NM), elevation_ft: 5000 },
      { id: 'h-tgt', steerpoint: 8, name: 'TGT1', type: 'target', coordinates: TARGET, elevation_ft: TARGET_ELEVATION_FT },
      { id: 'h-tgt2', steerpoint: 9, name: 'TGT2', type: 'target', ...tgt2 },
    ],
    threats: [], attacks: [], strikes: [], flightMembers: [crew('h-p1', 1), crew('h-p2', 2), crew('h-p3', 3), crew('h-p4', 4)],
  } as unknown as Mission;
}

type Seat = { who: string; target: string; profile: string; tot: number; weapon?: string };
type StrikeOptions = { ip?: Strike['ip']; rule?: FragRule };

/** A strike drafted the editor's way, flanks assigned, and saved: the mission and the new attack ids. */
function savedStrike(m: Mission, strikeId: string, seats: Seat[], spacing_s = 10, { ip = {}, rule }: StrikeOptions = {}) {
  const ctx: DraftContext = { mission: m, weapons, profiles: profiles.filter((p) => p.id === 'f16c.popup.std' || p.id === 'f16c.loft.std' || p.id === 'f16c.dive.ccip30'), threatSystems: [] };
  const jets = assignFlanks(seats.map((s) => {
    const j = newJet(m, s.who, s.target, ip);
    return { ...j, draft: { ...j.draft, weaponId: s.weapon ?? 'mk82', profileId: s.profile }, totOffset_s: s.tot };
  }), ctx);
  let seq = 0;
  return saveStrikeTo(m, { id: strikeId, name: `${seats.length}-ship`, ip, spacing_s, ...(rule ? { fragRule: rule } : {}) },
    jets.map((j, i) => ({ data: draftAttackData(j.draft, resolveDraft(j.draft, ctx), undefined, 1 + i)!, totOffset_s: j.totOffset_s })),
    () => `${strikeId}-${++seq}`);
}

/** How long before its own impact #2's track passes over the ridge: the pass the ridge fixture sets up. */
const RIDGE_PASS_BEFORE_IMPACT_S = 12;
/** How far under that pass the ridge target's ground is. */
const RIDGE_BELOW_PASS_FT = 150;
/** #2's time over target after #1 in the ridge fixture: inside #1's blast radius when its bomb goes off. */
const RIDGE_TOT_S = 11.9;

/**
 * The ridge strike: #1 and #2 dive 30° with Mk-84s from one shared IP, #1 on a ridge, #2 on TGT1. The ridge is
 * worked out from #2's own plan track (the way a first strike with both jets on TGT1 flies it) so it follows
 * the planner's geometry, and is put under the point #2 passes 12 s before its impact, 150 ft down.
 */
function ridgeStrike(rule?: FragRule) {
  const ip = { ipWaypointId: 'h-ip' };
  const seat = (who: string, target: string, tot: number): Seat => ({ who, target, profile: 'f16c.dive.ccip30', tot, weapon: 'mk84' });
  const flat = strikeMission();
  const first = savedStrike(flat, 'h-ridge-first', [seat('h-p1', 'h-tgt', 0), seat('h-p2', 'h-tgt', 30)], 5, { ip });
  const track = buildStrikePlayback(playbackInputFromMission(first.mission, { strikeId: 'h-ridge-first' }, weapons)!).jets[1];
  const S = track.samples, tauPass = track.impactTau_s - RIDGE_PASS_BEFORE_IMPACT_S;
  let k = 0;
  while (k + 1 < S.n && S.tau_s[k + 1] < tauPass) k++;
  const f = (tauPass - S.tau_s[k]) / (S.tau_s[k + 1] - S.tau_s[k]);
  const at = (a: Float64Array) => a[k] + (a[k + 1] - a[k]) * f;
  const m = strikeMission({ coordinates: { lat: at(S.lat), lon: at(S.lon) }, elevation_ft: Math.round(at(S.msl_ft) - RIDGE_BELOW_PASS_FT) });
  return savedStrike(m, 'h-ridge', [seat('h-p1', 'h-tgt2', 0), seat('h-p2', 'h-tgt', RIDGE_TOT_S)], 5, { ip, rule });
}

export type HarnessFixture = 'one' | 'strike4' | 'late' | 'skip' | 'dive4' | 'ridge';

/** The id of the strike a fixture saves (the four-ship's two variants share one). */
const strikeIdOf = (fixture: HarnessFixture) => (fixture === 'dive4' ? 'h-dive4' : fixture === 'ridge' ? 'h-ridge' : 'h-strike4');

/** What Apply wrote: to the editor, a list of times in the editor's order; to the plan, each attack's time by its id. */
export type AppliedTimes = number[] | Record<string, number>;

/**
 * The launch for a fixture. The four-ship, the four dives and the ridge pair are handed over as the attack list hands a
 * saved strike over (the plan as saved and the strike to play, with Apply to the plan), unless `door` is 'editor': then,
 * like the other two strikes, as the attack editor hands one over (the jets built, with Apply to the strike and the
 * cards' tie). The lone pop-up is handed over as the attack editor hands one over, unless `door` is 'list': then as the
 * attack list hands over a lone attack's row.
 * `watch` is the seat number (1 = #1) playback opens watching; left out, the lead (or, for late, #2).
 * `rule` is the frag rule the strike is saved with; left out, the strike says nothing.
 */
export function harnessFixtureLaunch(fixture: HarnessFixture, notes: string[] = [], watch?: number, record?: (times: AppliedTimes) => void, door?: 'editor' | 'list', rule?: FragRule): PlaybackLaunch {
  if (fixture === 'one') return door === 'list' ? harnessLoneFromList(notes) : harnessLaunch(notes, rule);
  const m = strikeMission();
  let input: PlaybackInput | undefined;
  let planned = m;
  if (fixture === 'skip') {
    const s = savedStrike(m, 'h-skip', ['h-p1', 'h-p2', 'h-p3'].map((who, i) => ({ who, target: 'h-tgt', profile: 'f16c.popup.std', tot: [0, 10, 40][i] })), 10, { rule });
    const lost = { ...s.mission, attacks: s.mission.attacks.map((a) => (a.id === s.attackIds[1] ? { ...a, targetWaypointId: 'h-nowhere' } : a)) } as Mission;
    planned = lost;
    input = playbackInputFromMission(lost, { strikeId: 'h-skip' }, weapons);
  } else {
    const s = fixture === 'ridge'
      ? ridgeStrike(rule)
      : fixture === 'dive4'
        ? savedStrike(m, 'h-dive4', [0, 5, 10, 15].map((tot, i) => ({ who: `h-p${i + 1}`, target: 'h-tgt', profile: 'f16c.dive.ccip30', tot })), 5, { rule })
        : savedStrike(m, 'h-strike4', [
          { who: 'h-p1', target: 'h-tgt', profile: 'f16c.popup.std', tot: 0 },
          { who: 'h-p2', target: 'h-tgt', profile: 'f16c.popup.std', tot: 10 },
          { who: 'h-p3', target: 'h-tgt2', profile: 'f16c.popup.std', tot: 40 },
          { who: 'h-p4', target: 'h-tgt', profile: 'f16c.loft.std', tot: 40 },
        ], 10, { rule });
    planned = s.mission;
    input = playbackInputFromMission(s.mission, { strikeId: strikeIdOf(fixture) }, weapons);
    if (input && fixture === 'late') input = { ...input, jets: input.jets.map((j, i) => (i === 1 ? { ...j, totOffset_s: 300 } : j)) };
  }
  if (!input) throw new Error(`The harness ${fixture} fixture did not build`);
  // Every member in seat order, skipped ones included, so a seat number names the same member as the card.
  const ids = [...input.jets.map((j) => ({ id: j.id, label: j.label })), ...(input.skipped ?? []).map((j) => ({ id: j.id, label: j.label }))];
  const seat = watch ?? (fixture === 'late' ? 2 : 1);
  if ((fixture === 'strike4' || fixture === 'dive4' || fixture === 'ridge') && door !== 'editor') {
    return {
      fromMission: { mission: planned, subject: { strikeId: strikeIdOf(fixture) }, weapons }, jetId: ids.find((j) => j.label === `#${seat}`)?.id, notes,
      apply: record && { to: 'mission', write: record },
    };
  }
  // What the editor would hand over for a strike it had open: a way to write the times back (here, to the
  // checks' recorder) and what breaks a tie in time over target on the cards, each member's flight position
  // then its attack's number, in seat order.
  const members = [...ids].sort((a, b) => Number(a.label.slice(1)) - Number(b.label.slice(1)));
  const tie = members.map(({ id }): [number, number] => {
    const attack = planned.attacks.find((a) => a.id === id)!;
    return [planned.flightMembers.find((f) => f.id === attack.attackerId)?.position ?? 9, attack.sequenceNumber];
  });
  // A strike's title is its name.
  return { input, title: input.name, jetId: ids.find((j) => j.label === `#${seat}`)?.id, notes, apply: record && { to: 'editor', write: record }, tie };
}

/** The moments the screenshot checks seek to, on the strike clock (built the same way PlaybackView builds them). */
export function harnessMoments(launch: PlaybackLaunch) {
  const from = launch.fromMission;
  const pb = buildStrikePlayback((launch.input ?? (from && playbackInputFromMission(from.mission, from.subject, from.weapons)))!);
  const timing = retime(pb);
  const all = strikeEvents(pb, timing).events;
  const events = all.filter((e) => e.jet === 0);
  const at = (kind: string) => events.find((e) => e.kind === kind)?.t_s;
  return {
    pb, timing,
    window: timing.window,
    /** The stretch the clock plays by default: 10 s before the first action to the window's end. */
    range: playRange(pb, timing, false),
    /** With Show › Whole run-in: the whole window. */
    wholeRange: playRange(pb, timing, true),
    /** The lead's first action after the IP, strike time. */
    firstAction: timing.jets[0].shift_s + firstActionTau(pb.jets[0]).tau_s,
    push: at('push'),
    /** The pop-up's pull-up (the planner's commit event, "Pull up"). */
    pullUp: at('commit') ?? at('action'),
    release: at('release'),
    impact: at('impact'),
    events: events.map((e) => ({ kind: e.kind, label: e.label, t_s: e.t_s })),
    /** Each flown jet's own moments (playback index k), strike time, and its seat label. */
    jets: pb.jets.map((j, k) => ({
      id: j.id, label: j.label,
      firstAction: timing.jets[k].shift_s + firstActionTau(j).tau_s,
      release: timing.jets[k].release_s, impact: timing.jets[k].impact_s,
    })),
  };
}
