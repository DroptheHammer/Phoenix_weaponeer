/**
 * DEV ONLY (the playback harness). A made-up pop-up attack in Nevada, built
 * through the planner's own functions the way scripts/geo-check.ts builds its
 * playback fixtures: auto-build on the real F-16C profile file and the real
 * Mk-82 row, then the playback library. No real mission, nothing private.
 *
 * The target is the synthetic NTTR point geo-check uses (4,000 ft), the IP
 * 15.3 nm out on 068°.
 */
import f16Profiles from '../../../../src-tauri/resources/profiles/f16c.json';
import reference from '../../../../crates/core/data/reference.json';
import { autoBuildAttack } from '../../../lib/autoBuildAttack';
import { attackIpAnchor } from '../../../lib/ipAnchor';
import { calculateDestination } from '../../../lib/coordinates';
import { buildStrikePlayback, retime, strikeEvents, type PlaybackInput } from '../../../lib/playback';
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
  return { input, jetId: attack.id, notes };
}

/** The moments the screenshot checks seek to, on the strike clock (built the same way PlaybackView builds them). */
export function harnessMoments(launch: PlaybackLaunch) {
  const pb = buildStrikePlayback(launch.input);
  const timing = retime(pb);
  const events = strikeEvents(pb, timing).events.filter((e) => e.jet === 0);
  const at = (kind: string) => events.find((e) => e.kind === kind)?.t_s;
  return {
    pb, timing,
    window: timing.window,
    push: at('push'),
    /** The pop-up's pull-up (the planner's commit event, "Pull up"). */
    pullUp: at('commit') ?? at('action'),
    release: at('release'),
    impact: at('impact'),
    events: events.map((e) => ({ kind: e.kind, label: e.label, t_s: e.t_s })),
  };
}
