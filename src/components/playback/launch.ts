/**
 * What the attack editor hands the 3D playback when Play is pressed: the
 * playback input built from the editor's drafts as they stand (unsaved edits
 * included, the same drafts the editor's map, side view and strike readout
 * draw), plus the notes the planner shows about the theater.
 *
 * Every jet of the strike goes, in the editor's order, with the times the
 * sliders hold now. Kept out of the editor so the editor keeps one import and
 * one element for playback. Small and free of three.js: it sits in the eager
 * desktop bundle, and only runs when the button is pressed.
 */
import type { Attack, Mission } from '../../types';
import type { IpAnchor } from '../../lib/ipAnchor';
import type { ResolvedDraft } from '../../lib/attackDraft';
import type { PlaybackInput, PlaybackJetInput, SkippedJet } from '../../lib/playback';
import { attackSpeedOf } from '../../lib/strike';
import { getTheaterInfo } from '../../stores/theaterStore';
import { isRealWorld } from '../../lib/strikeNearMe';
import { formatCallsign } from '../../lib/callsign';
import type { PlaybackLaunch } from './types';

/** One jet as the editor holds it: the attack as it would save, and where its run-in starts. */
export interface EditorDraft {
  attack: Attack | undefined;
  ipAnchor: IpAnchor | undefined;
}

export interface EditorLaunchArgs {
  mission: Mission;
  /** Every jet, in the editor's order: the attack as it would save (undefined while it cannot), and its IP. */
  drafts: readonly EditorDraft[];
  /** The editor's own resolution of each draft: its target waypoint, weapon and profile. */
  resolved: readonly ResolvedDraft[];
  /** Each jet's time over target on the strike clock, s, as the sliders hold it (the lead's is never used: it is the clock's zero). */
  offsets: readonly number[];
  /** The strike's name; undefined for a lone attack. */
  strikeName?: string;
  /** The jet being edited: playback opens watching it. */
  selectedIndex: number;
}

/** Why a jet the editor cannot build yet still keeps its place in the strike. */
const NOT_READY = 'Not ready in the editor yet.';

/**
 * The whole strike as the editor has it now, every jet in the editor's order
 * and numbered the editor's way (#1, #2, …). A jet with no attack or no target
 * yet is kept as a member that is not flown, so the others keep their seat
 * numbers and colours, and its time still counts in the strike's readout.
 * Undefined when no jet can be built: playback then opens and says so. The
 * button is disabled until every jet can save, so that is a safety net, not
 * the normal path.
 */
export function playbackLaunchFromEditor(a: EditorLaunchArgs): PlaybackLaunch | undefined {
  const { mission, drafts, resolved, offsets, strikeName, selectedIndex } = a;
  const jets: PlaybackJetInput[] = [];
  const skipped: SkippedJet[] = [];

  drafts.forEach((draft, i) => {
    const r = resolved[i];
    const attack = draft.attack;
    const target = r?.target;
    const label = `#${i + 1}`;
    // The lead's time over target is the strike clock's zero whatever its slider says (the editor's
    // readout and its save do the same), and a time that is not a number is no delay.
    const totOffset_s = i === 0 ? 0 : Number.isFinite(offsets[i]) ? offsets[i] : 0;
    if (!attack || !target) {
      skipped.push({
        id: attack?.id ?? `draft-${i}`, label, reason: NOT_READY, totOffset_s, weapon: r?.weapon,
        speed_ktas: r?.profile ? attackSpeedOf(r.profile) : undefined, order: i,
      });
      return;
    }
    const member = mission.flightMembers.find((m) => m.id === attack.attackerId);
    jets.push({
      id: attack.id, attack, ipAnchor: draft.ipAnchor, target, weapon: r.weapon, totOffset_s, label,
      callsign: member ? formatCallsign(member.callsign) : undefined,
    });
  });
  if (!jets.length) return undefined;

  const title = strikeName ?? jets[0].callsign ?? 'Attack';
  const input: PlaybackInput = { name: title, jets, skipped };
  return { input, title, jetId: drafts[selectedIndex]?.attack?.id, notes: theaterNotes(mission) };
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
