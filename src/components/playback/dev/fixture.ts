/**
 * DEV ONLY (the playback harness). Made-up attacks in Nevada, built through
 * the planner's own functions the way scripts/geo-check.ts builds its
 * playback fixtures: auto-build on the real F-16C profile file and the real
 * Mk-82 row, then the playback library. No real mission, nothing private.
 *
 * The target is the synthetic NTTR point geo-check uses (4,000 ft), the IP
 * 15.3 nm out on 068°.
 *
 * - one (the default): a lone pop-up, as the editor hands over one jet.
 * - strike4: geo-check's four-ship, saved the editor's way (newJet,
 *   assignFlanks, saveStrikeTo) and read back as the attack list would
 *   (playbackInputFromMission): #1 and #2 pop-ups on TGT1, #3 a pop-up on
 *   TGT2 (2 nm on 160°, 5,200 ft), #4 a loft on TGT1, offsets 0/10/40/40,
 *   IPs automatic.
 * - late: the four-ship with #2 at 300 s, so it is still out of sight when
 *   the time bar starts; opened watching #2.
 * - skip: three pop-ups at 0/10/40 with #2's target pointed at a waypoint
 *   that does not exist, so #2 is skipped and #3 flies as the second jet.
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
import type { PlaybackLaunch } from '../types';

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

/** The pop-up as the editor would hand it to playback: one jet, offset 0. */
export function harnessLaunch(notes: string[] = []): PlaybackLaunch {
  const m = mission();
  const b = autoBuildAttack({
    mission: m, targetWaypointId: 'h-tgt', attackerId: 'h-p1', weapons, profiles, threatSystems: [],
    overrides: { weaponId: 'mk82', profileId: 'f16c.popup.std' },
  });
  if (!b.attack) throw new Error(`The harness pop-up did not auto-build: ${b.problems?.join('; ')}`);
  const attack = { ...b.attack, id: 'h-attack' } as Attack;
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

/**
 * The launch for a fixture, as the attack list would hand a saved strike over. `watch` is the seat
 * number (1 = #1) playback opens watching; left out, the lead (or, for late, #2).
 */
export function harnessFixtureLaunch(fixture: HarnessFixture, notes: string[] = [], watch?: number): PlaybackLaunch {
  if (fixture === 'one') return harnessLaunch(notes);
  const m = strikeMission();
  let input: PlaybackInput | undefined;
  if (fixture === 'skip') {
    const s = savedStrike(m, 'h-skip', ['h-p1', 'h-p2', 'h-p3'].map((who, i) => ({ who, target: 'h-tgt', profile: 'f16c.popup.std', tot: [0, 10, 40][i] })));
    const lost = { ...s.mission, attacks: s.mission.attacks.map((a) => (a.id === s.attackIds[1] ? { ...a, targetWaypointId: 'h-nowhere' } : a)) } as Mission;
    input = playbackInputFromMission(lost, { strikeId: 'h-skip' }, weapons);
  } else {
    const s = savedStrike(m, 'h-strike4', [
      { who: 'h-p1', target: 'h-tgt', profile: 'f16c.popup.std', tot: 0 },
      { who: 'h-p2', target: 'h-tgt', profile: 'f16c.popup.std', tot: 10 },
      { who: 'h-p3', target: 'h-tgt2', profile: 'f16c.popup.std', tot: 40 },
      { who: 'h-p4', target: 'h-tgt', profile: 'f16c.loft.std', tot: 40 },
    ]);
    input = playbackInputFromMission(s.mission, { strikeId: 'h-strike4' }, weapons);
    if (input && fixture === 'late') input = { ...input, jets: input.jets.map((j, i) => (i === 1 ? { ...j, totOffset_s: 300 } : j)) };
  }
  if (!input) throw new Error(`The harness ${fixture} fixture did not build`);
  // Every member in seat order, skipped ones included, so a seat number names the same member as the card.
  const ids = [...input.jets.map((j) => ({ id: j.id, label: j.label })), ...(input.skipped ?? []).map((j) => ({ id: j.id, label: j.label }))];
  const seat = watch ?? (fixture === 'late' ? 2 : 1);
  // A strike's title is its name.
  return { input, title: input.name, jetId: ids.find((j) => j.label === `#${seat}`)?.id, notes };
}

/** The moments the screenshot checks seek to, on the strike clock (built the same way PlaybackView builds them). */
export function harnessMoments(launch: PlaybackLaunch) {
  const pb = buildStrikePlayback(launch.input);
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
