/**
 * What the attack editor hands the 3D playback when Play is pressed: the
 * playback input built from the editor's drafts as they stand (unsaved edits
 * included, the same drafts the editor's map, side view and strike readout
 * draw), plus the notes the planner shows about the theater.
 *
 * Every jet of the strike goes, in the editor's order, with the times the
 * sliders hold now. A strike also gets a way to write times back to those
 * sliders (Apply), and what the cards go by when two jets share a time, so
 * playback can say which jets an Apply leaves numbered differently on the
 * cards. Kept out of the editor so the editor keeps one import and
 * one element for playback. Small and free of three.js: it sits in the eager
 * desktop bundle, and only runs when the button is pressed.
 *
 * The attack list's Play hands over the plan as saved instead (a strike, or
 * one attack), and for a strike a way to write the times into the plan itself.
 *
 * Both also hand over the threats the planner may see, taken at the press with the Settings switches as they
 * stand: a threat the mission's author hid is not among them unless the planner revealed it, so playback gets
 * exactly what the same plan without those threats would give it.
 */
import type { Attack, DbWeapon, Mission, ThreatInstance } from '../../types';
import type { IpAnchor } from '../../lib/ipAnchor';
import type { ResolvedDraft } from '../../lib/attackDraft';
import type { PlaybackInput, PlaybackJetInput, PlaybackSubject, SkippedJet } from '../../lib/playback';
import type { FragRule } from '../../types/strike.types';
import { attackSpeedOf, strikeFragRule } from '../../lib/strike';
import { getTheaterInfo } from '../../stores/theaterStore';
import { useMissionStore } from '../../stores/missionStore';
import { useUiStore } from '../../stores/uiStore';
import { isRealWorld } from '../../lib/strikeNearMe';
import { formatCallsign } from '../../lib/callsign';
import { isThreatVisible, type HiddenReveal } from '../../lib/threatVisibility';
import type { SceneSystem, SceneThreats } from '../../lib/playbackScene/domes';
import type { EditorLaunch, PlaybackApply, PlaybackLaunch, PlaybackSystemRow } from './types';

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
  /** Puts each jet's time over target (the editor's order) back on its slider. Left out: playback offers no Apply. */
  applyOffsets?: (offsets: number[]) => void;
  /** The strike's frag rule as the editor holds it (unsaved choice included). Left out: the app's default, as a saved strike reads it. */
  fragRule?: FragRule;
  /** The threat systems the planner has, for the threats on `mission` (which is the planner's own view of the plan). Left out: none. */
  systems?: readonly PlaybackSystemRow[];
}

/**
 * The threats and systems playback is handed: every threat in `threats` the planner may see (an author-hidden one only if
 * its switch is on; `reveal` is those switches, read from the settings when not given) and every system row with a maximum
 * altitude to draw, rows kept whole. The planner's own view of the plan has already left the hidden ones out; this is
 * the same rule again at the press, so the attack list's whole plan and the editor's filtered one give the same answer.
 */
export function threatsAtPress(
  threats: readonly ThreatInstance[],
  systems: readonly PlaybackSystemRow[] = [],
  reveal: HiddenReveal = useUiStore.getState().revealHidden,
): SceneThreats {
  return {
    visible: threats.filter((t) => isThreatVisible(t, reveal)),
    systems: systems.filter((s): s is SceneSystem => Number.isFinite(s.max_altitude_ft)),
    reveal,
  };
}

/** The strike strip's line when the blast check could not be loaded or run. Here, not with the blast words, because the start-up code shows it. */
export const BLAST_CHECK_FAILED = "Blast distances couldn't be checked.";

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
export function playbackLaunchFromEditor(a: EditorLaunchArgs): EditorLaunch | undefined {
  const { mission, drafts, resolved, offsets, strikeName, selectedIndex, applyOffsets, systems } = a;
  const jets: PlaybackJetInput[] = [];
  const skipped: SkippedJet[] = [];
  const tie: [number, number][] = [];

  drafts.forEach((draft, i) => {
    const r = resolved[i];
    const attack = draft.attack;
    const target = r?.target;
    const label = `#${i + 1}`;
    const member = attack && mission.flightMembers.find((m) => m.id === attack.attackerId);
    // What the cards go by when two jets share a time: flight position, then the attack's number. A draft not
    // saved yet takes the numbers after every saved one, in the editor's order (what saving does).
    tie.push([member?.position ?? 9, attack && !attack.id.startsWith('draft-') ? attack.sequenceNumber : 1e9 + i]);
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
    jets.push({
      id: attack.id, attack, ipAnchor: draft.ipAnchor, target, weapon: r.weapon, totOffset_s, label,
      callsign: member ? formatCallsign(member.callsign) : undefined,
    });
  });
  if (!jets.length) return undefined;

  const title = strikeName ?? jets[0].callsign ?? 'Attack';
  // The rule is read the way a saved strike's is, so the editor's strip, its playback and the attack list's playback agree.
  const input: PlaybackInput = { name: title, jets, skipped, fragRule: strikeFragRule(a) };
  // Apply needs a strike to write into: two jets or more, and the editor's own way to set their sliders.
  const apply: PlaybackApply | undefined = strikeName !== undefined && applyOffsets && drafts.length >= 2 ? { to: 'editor', write: applyOffsets } : undefined;
  return { input, title, jetId: drafts[selectedIndex]?.attack?.id, notes: theaterNotes(mission), apply, tie, threats: threatsAtPress(mission.threats, systems) };
}

/**
 * The attack list's Play: a strike, or one attack, of the plan as it is saved now. The lazily loaded view
 * builds the jets from it. The mission goes along without its threats, so one the author hid cannot cross by
 * this road; the threats the planner may see come as `threats`, worked out here from the whole plan. The
 * theater notes come from the whole mission. Only a strike has times to apply: they go straight into the plan
 * (one Undo step each), re-based on whoever is first over the target. Undefined when no plan is open.
 */
export function playbackLaunchFromMission(subject: PlaybackSubject, weapons: DbWeapon[], systems?: readonly PlaybackSystemRow[]): PlaybackLaunch | undefined {
  const { mission, setStrikeOffsets } = useMissionStore.getState();
  if (!mission) return undefined;
  return {
    fromMission: { mission: { ...mission, threats: [] }, subject, weapons },
    jetId: 'attackId' in subject ? subject.attackId : undefined,
    notes: theaterNotes(mission),
    apply: 'strikeId' in subject ? { to: 'mission', write: (offsets) => setStrikeOffsets(subject.strikeId, offsets) } : undefined,
    threats: threatsAtPress(mission.threats, systems),
  };
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
