/**
 * What the attack editor hands the 3D playback when Play is pressed: the
 * playback input built from the editor's drafts as they stand (unsaved edits
 * included, the same drafts the editor's map, side view and strike readout
 * draw), plus the notes the planner shows about the theater.
 *
 * Kept out of the editor so the editor keeps one import and one element for
 * playback. Small and free of three.js: it sits in the eager desktop bundle,
 * and only runs when the button is pressed.
 */
import type { Attack, Mission } from '../../types';
import type { IpAnchor } from '../../lib/ipAnchor';
import type { ResolvedDraft } from '../../lib/attackDraft';
import type { PlaybackInput } from '../../lib/playback';
import { getTheaterInfo } from '../../stores/theaterStore';
import { isRealWorld } from '../../lib/strikeNearMe';
import { formatCallsign } from '../../lib/callsign';
import type { PlaybackLaunch } from './types';

/** One jet as the editor holds it: the attack as it would save, and where its run-in starts. */
export interface EditorDraft {
  attack: Attack | undefined;
  ipAnchor: IpAnchor | undefined;
}

/**
 * The selected jet only, as a strike of one at offset 0: the spike flies one
 * jet. Undefined when that jet cannot be built yet (no attack, no target);
 * playback then opens and says so. The button is disabled until every jet
 * can save, so this is a safety net, not the normal path.
 */
export function playbackLaunchFromEditor(
  mission: Mission,
  drafts: readonly EditorDraft[],
  resolved: readonly ResolvedDraft[],
  selectedIndex: number,
): PlaybackLaunch | undefined {
  const draft = drafts[selectedIndex];
  const r = resolved[selectedIndex];
  const attack = draft?.attack;
  const target = r?.target;
  if (!attack || !target) return undefined;

  const member = mission.flightMembers.find((m) => m.id === attack.attackerId);
  const callsign = member ? formatCallsign(member.callsign) : undefined;
  const label = `#${selectedIndex + 1}`;
  const input: PlaybackInput = {
    name: callsign ?? `Jet ${selectedIndex + 1}`,
    jets: [{ id: attack.id, attack, ipAnchor: draft.ipAnchor, target, weapon: r.weapon, totOffset_s: 0, label, callsign }],
  };
  // colorIndex: drawn in the seat's colour (#2 magenta, as in the editor), though it flies as playback jet 0.
  return { input, jetId: attack.id, colorIndex: selectedIndex, notes: theaterNotes(mission) };
}

/**
 * The same warnings the planner's map shows (App.tsx's banner), said for the
 * 3D view: the ground drawn is the real world's, so an unverified theater's
 * plan may sit offset over it, and a "strike near me" plan is not a DCS map.
 */
export function theaterNotes(mission: Mission): string[] {
  if (isRealWorld(mission)) return ["Real world: can't be flown in DCS. Planned on a real place for fun."];
  const info = getTheaterInfo(mission.theater);
  if (info && !info.verified) {
    return [`${info.display_name}: coordinates unverified. This map's projection has not been checked against a known landmark, so the plan may sit offset over the ground drawn here.`];
  }
  return [];
}
