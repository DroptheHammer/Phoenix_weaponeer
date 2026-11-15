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
 *
 * The strikes also carry what the door gives a strike: a way to write times
 * back (the checks pass a recorder), and from the editor's what the cards go
 * by when two jets share a time.
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
import type { Attack, DbWeapon, DeliveryProfile, Mission, Waypoint } from '../../../types';
import type { EditorLaunch, PlaybackLaunch } from '../types';

export const TARGET = { lat: 37.15, lon: -116.83 };
export const TARGET_ELEVATION_FT = 4000;
export const IP_BEARING_DEG = 68;
export const IP_DISTANCE_NM = 15.3;

const weapons = (reference as unknown as { weapons: DbWeapon[] }).weapons;
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
export function harnessLaunch(notes: string[] = []): EditorLaunch {
  const { m, attack } = lonePopup();
  const target = m.waypoints.find((w) => w.id === 'h-tgt')!;
  const input: PlaybackInput = {
    name: 'Viper 1-1',
    jets: [{ id: attack.id, attack, ipAnchor: attackIpAnchor(m.waypoints, attack), target, weapon: weapons.find((w) => w.id === 'mk82'), totOffset_s: 0, label: '#1', callsign: 'Viper 1-1' }],
  };
  // The title the editor gives a lone attack: the jet's callsign.
  return { input, title: 'Viper 1-1', jetId: attack.id, notes };
}

/** The four pilots and both targets, the way geo-check's B3 fixture lays them out. */
function strikeMission(): Mission {
  const crew = (id: string, position: number) => ({ id, callsign: `Viper 1-${position}`, aircraftId: 'f16c', position, loadout: [{ weaponType: 'Mk-82 LDGP', quantity: 6 }] });
  return {
    id: 'harness-strike', name: 'Playback harness strike (synthetic)', date: '', theater: 'nevada', bullseye: TARGET, notes: '', createdAt: '', updatedAt: '',
    waypoints: [
      { id: 'h-ip', steerpoint: 7, name: 'STPT 7', type: 'turnpoint', coordinates: calculateDestination(TARGET, IP_BEARING_DEG, IP_DISTANCE_NM), elevation_ft: 5000 },
      { id: 'h-tgt', steerpoint: 8, name: 'TGT1', type: 'target', coordinates: TARGET, elevation_ft: TARGET_ELEVATION_FT },
      { id: 'h-tgt2', steerpoint: 9, name: 'TGT2', type: 'target', coordinates: calculateDestination(TARGET, 160, 2), elevation_ft: 5200 },
    ],
    threats: [], attacks: [], strikes: [], flightMembers: [crew('h-p1', 1), crew('h-p2', 2), crew('h-p3', 3), crew('h-p4', 4)],
  } as unknown as Mission;
}

type Seat = { who: string; target: string; profile: string; tot: number };

/** A strike drafted the editor's way, flanks assigned, and saved: the mission and the new attack ids. */
function savedStrike(m: Mission, strikeId: string, seats: Seat[]) {
  const ctx: DraftContext = { mission: m, weapons, profiles: profiles.filter((p) => p.id === 'f16c.popup.std' || p.id === 'f16c.loft.std'), threatSystems: [] };
  const jets = assignFlanks(seats.map((s) => {
    const j = newJet(m, s.who, s.target, {});
    return { ...j, draft: { ...j.draft, weaponId: 'mk82', profileId: s.profile }, totOffset_s: s.tot };
  }), ctx);
  let seq = 0;
  return saveStrikeTo(m, { id: strikeId, name: `${seats.length}-ship`, ip: {}, spacing_s: 10 },
    jets.map((j, i) => ({ data: draftAttackData(j.draft, resolveDraft(j.draft, ctx), undefined, 1 + i)!, totOffset_s: j.totOffset_s })),
    () => `${strikeId}-${++seq}`);
}

export type HarnessFixture = 'one' | 'strike4' | 'late' | 'skip';

/** What Apply wrote: to the editor, a list of times in the editor's order; to the plan, each attack's time by its id. */
export type AppliedTimes = number[] | Record<string, number>;

/**
 * The launch for a fixture. The four-ship is handed over as the attack list hands a saved strike over (the plan
 * as saved and the strike to play, with Apply to the plan), unless `door` is 'editor': then, like the other two
 * strikes, as the attack editor hands one over (the jets built, with Apply to the strike and the cards' tie).
 * The lone pop-up is handed over as the attack editor hands one over, unless `door` is 'list': then as the
 * attack list hands over a lone attack's row.
 * `watch` is the seat number (1 = #1) playback opens watching; left out, the lead (or, for late, #2).
 */
export function harnessFixtureLaunch(fixture: HarnessFixture, notes: string[] = [], watch?: number, record?: (times: AppliedTimes) => void, door?: 'editor' | 'list'): PlaybackLaunch {
  if (fixture === 'one') return door === 'list' ? harnessLoneFromList(notes) : harnessLaunch(notes);
  const m = strikeMission();
  let input: PlaybackInput | undefined;
  let planned = m;
  if (fixture === 'skip') {
    const s = savedStrike(m, 'h-skip', ['h-p1', 'h-p2', 'h-p3'].map((who, i) => ({ who, target: 'h-tgt', profile: 'f16c.popup.std', tot: [0, 10, 40][i] })));
    const lost = { ...s.mission, attacks: s.mission.attacks.map((a) => (a.id === s.attackIds[1] ? { ...a, targetWaypointId: 'h-nowhere' } : a)) } as Mission;
    planned = lost;
    input = playbackInputFromMission(lost, { strikeId: 'h-skip' }, weapons);
  } else {
    const s = savedStrike(m, 'h-strike4', [
      { who: 'h-p1', target: 'h-tgt', profile: 'f16c.popup.std', tot: 0 },
      { who: 'h-p2', target: 'h-tgt', profile: 'f16c.popup.std', tot: 10 },
      { who: 'h-p3', target: 'h-tgt2', profile: 'f16c.popup.std', tot: 40 },
      { who: 'h-p4', target: 'h-tgt', profile: 'f16c.loft.std', tot: 40 },
    ]);
    planned = s.mission;
    input = playbackInputFromMission(s.mission, { strikeId: 'h-strike4' }, weapons);
    if (input && fixture === 'late') input = { ...input, jets: input.jets.map((j, i) => (i === 1 ? { ...j, totOffset_s: 300 } : j)) };
  }
  if (!input) throw new Error(`The harness ${fixture} fixture did not build`);
  // Every member in seat order, skipped ones included, so a seat number names the same member as the card.
  const ids = [...input.jets.map((j) => ({ id: j.id, label: j.label })), ...(input.skipped ?? []).map((j) => ({ id: j.id, label: j.label }))];
  const seat = watch ?? (fixture === 'late' ? 2 : 1);
  if (fixture === 'strike4' && door !== 'editor') {
    return {
      fromMission: { mission: planned, subject: { strikeId: 'h-strike4' }, weapons }, jetId: ids.find((j) => j.label === `#${seat}`)?.id, notes,
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
