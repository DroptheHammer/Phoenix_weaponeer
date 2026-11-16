/**
 * Every type the 3D strike playback exports. The playback turns a planned
 * strike into time-stamped jet and bomb tracks; the 3D scene (B2) and the
 * playback screen (B3) are built on these.
 *
 * Units, everywhere: distances on the ground in nm (haversine, `_nm`), local
 * frame in metres (`_m`), altitudes in ft (`_ft`), speeds in kt TAS (no wind
 * anywhere in the planner, so TAS·cos(pitch) is the ground speed), times in s,
 * headings in degrees TRUE. "AGL" is the planner's AGL: feet above the jet's
 * OWN target waypoint's elevation, never above the ground under the jet.
 *
 * Two clocks:
 * - strike time `t_s`: seconds after "T", the zero of `totOffset_s`, as the
 *   card prints it (T+0:30 = 30). A jet's bombs land at t = its TOT.
 * - jet time `tau_s`: seconds after that jet crosses its IP. Strike time =
 *   tau_s + timing.jets[k].shift_s. Geometry is built once in jet time, so a
 *   re-time changes one number per jet and never the geometry.
 */

import type { Attack, Coordinates, DbWeapon, ThreatInstance, Waypoint } from '../../types';
import type { AttackPicture, LineStyleKey, SideProfile } from '../../types/attackPicture.types';
import type { FragRule } from '../../types/strike.types';
import type { BlastMeaning, BlastSource } from '../../types/weapon.types';
import type { IpAnchor, IpAnchorSource } from '../ipAnchor';
import type { FragConflict, StrikeReadout } from '../strike';

export type { FragRule };

// ─── Input ────────────────────────────────────────────────────────────────────

export type PlaybackFamily = 'dive' | 'level' | 'popup' | 'loft';

/** The fields `buildAttackPicture` / `buildSideProfile` read, plus `estimated` for the flag. */
export type PlaybackAttack = Pick<Attack, 'profileType' | 'profile' | 'estimated' | 'deliveryMode' | 'weaponClass'>;

/** One jet to play: a saved attack, or the strike editor's unsaved draft. */
export interface PlaybackJetInput {
  /** The attack id, or the caller's own id for an unsaved draft. Delays are keyed by it. */
  id: string;
  attack: PlaybackAttack;
  /** `attackIpAnchor(mission.waypoints, attack)`, or the editor's `draftIpAnchor`. */
  ipAnchor: IpAnchor | undefined;
  target: Waypoint;
  weapon: DbWeapon | undefined;
  /** Raw, as stored: never assume the lead is 0. The caller passes undefined as 0. */
  totOffset_s: number;
  /** '#k', the card's seat label. */
  label: string;
  callsign?: string;
}

/**
 * A jet the playback cannot fly, with the reason in plain words. It still
 * counts wherever the planner's rules do not need a flight path: Apply
 * re-bases over it, and the readout's frag rule (which needs only a weapon
 * and a TOT) still sees it, exactly as the editor's strip does.
 */
export interface SkippedJet {
  id: string;
  label: string;
  reason: string;
  /** Its plan delay. */
  totOffset_s: number;
  weapon: DbWeapon | undefined;
  /** Its picture when one could be built (the readout's splits and same-axis test read it). */
  picture?: AttackPicture;
  /** attackSpeedOf(profile): the speed the readout's push uses. */
  speed_ktas?: number;
  /**
   * Its place (0-based) among all the strike's members, in the readout's
   * order. Callers set it on `PlaybackInput.skipped` (input.ts does): without
   * it the jet is counted after the others. On `StrikePlayback.skipped` it is
   * always its index in `StrikePlayback.members`.
   */
  order?: number;
}

/**
 * One member of the strike as the readout sees it, flown or skipped: the list
 * `strikeReadout` / `fragConflicts` run over, in their order.
 */
export interface PlaybackMember {
  id: string;
  label: string;
  /** Index into `StrikePlayback.jets`; undefined when the member is skipped. */
  jet: number | undefined;
  weapon: DbWeapon | undefined;
  picture: AttackPicture | undefined;
  speed_ktas: number | undefined;
}

export interface PlaybackInput {
  name: string;
  /** Set only for a strike of two or more: Apply writes offsets to it. */
  strikeId?: string;
  /** In the caller's order, which is kept everywhere: `strikeReadout`'s tie rule depends on it. */
  jets: PlaybackJetInput[];
  /** Jets dropped before the build (a missing target waypoint), each with its `order` among all the members. */
  skipped?: SkippedJet[];
  /** Which test the frag warning uses. Left out: 'time', so an input built by hand behaves as it always did; the two doors write it. */
  fragRule?: FragRule;
}

export interface PlaybackOptions {
  /** Seconds of the strike window before the earliest flown push. Default 30. */
  leadIn_s?: number;
  /** Seconds the window runs on after the last frag clears or egress ends. Default 10. */
  tail_s?: number;
  /** Most ground distance between two stored samples, nm. Default 0.02. */
  sampleDs_nm?: number;
  /** Cap on the lead-in behind each IP, nm: beyond it a jet is not visible. Default 20. */
  maxLeadIn_nm?: number;
  /**
   * Display layer: half-width of the time window that rounds a corner, s.
   * A camera constant, not physics (no turn radius from a borrowed G). Default 2.
   */
  smooth_s?: number;
  /** Display layer: the lateral slot between jets that push together, nm. Default 0.5. */
  formationSpacing_nm?: number;
}

// ─── The local frame ──────────────────────────────────────────────────────────

/**
 * Azimuthal equidistant about the LEAD's target: range and bearing from the
 * origin are exactly `calculateDistance` / `calculateBearing`, so every
 * side-view range and the IP distance come out as the planner prints them.
 * up_m = (msl_ft − originElevation_ft) × 0.3048.
 */
export interface LocalFrame {
  origin: Coordinates;
  originElevation_ft: number;
}

// ─── Phases, anchors, events ──────────────────────────────────────────────────

/**
 * The picture line a stretch of track was resampled from, plus the two legs
 * the playback adds: the lead-in before the IP and the extension after the
 * drawn egress leg. `PHASE_STYLE` maps each onto a `LINE_STYLE` key.
 */
export type PlaybackPhase = 'leadIn' | 'route' | 'leg' | 'climb' | 'pullDown' | 'attack' | 'egress' | 'egressLeg' | 'extension';

/**
 * Points on a jet's track with a planner meaning. IP is s = 0; APEX is the
 * pop-up's apex (placed by range, it has no marker); ROLLOUT is the end of the
 * egress arc; END is the end of the drawn egress leg.
 */
export type AnchorKind = 'IP' | 'AP' | 'ROLL' | 'RUN' | 'POP' | 'PDP' | 'APEX' | 'TRK' | 'REL' | 'ROLLOUT' | 'END';

export interface Anchor {
  kind: AnchorKind;
  /** Along-track ground distance from the IP. */
  s_nm: number;
  /** Index into the jet's samples: a sample sits exactly on every anchor. */
  index: number;
  tau_s: number;
  agl_ft: number;
  /** marker: a picture marker of the same kind; range: placed where the range to target equals the side view's; line: a line end. */
  source: 'ip' | 'marker' | 'range' | 'line';
}

export type EventKind = 'push' | 'action' | 'commit' | 'pullDown' | 'track' | 'release' | 'impact' | 'rollOut' | 'fragClear';

export interface TrackEvent {
  kind: EventKind;
  /** Jet time. */
  tau_s: number;
  anchor?: AnchorKind | 'TGT';
  /** The planner's words: 'Pull up', 'Roll in', 'Auto-release'… */
  label: string;
  /** One of the four timeline ticks: IP push; pull-up, roll-in or turn-in; release; impact. */
  tick: boolean;
  /** Its time or place comes from an estimate (the flown push, a scripted bomb, the frag envelope). */
  estimated: boolean;
  lat: number;
  lon: number;
  e_m: number;
  n_m: number;
  up_m: number;
  agl_ft: number;
  msl_ft: number;
}

export interface StrikeEvent extends TrackEvent {
  /** Index into `StrikePlayback.jets`. */
  jet: number;
  /** Strike time. */
  t_s: number;
}

// ─── Estimates ────────────────────────────────────────────────────────────────

/** What on a jet's playback is an estimate, by name, so the UI can say so. */
export type EstimateCode =
  | 'profileNotFlown' // attack.estimated: the card's "ESTIMATED — not yet flown in DCS"
  | 'cardPushIsEstimate' // the card's push is ipToImpact_s: one speed, no turns (strike.ts)
  | 'noWind' // the planner has no wind: the flown push is still an estimate
  | 'flatGroundAgl' // AGL is over the target's elevation, not the ground under the jet
  | 'vacuumBomb' // level, pop-up and bomb-dive bombs: the planner's vacuum fall
  | 'sightLineBomb' // a gun or rocket pass on a dive profile: the card's sight line on a vacuum clock
  | 'loftDragModel' // loft: one drag for every bomb, sea-level air
  | 'popClimbChord' // pop-up POP→PDP flown as the side view's straight chord, not the label's climb angle
  | 'apexPlacement' // pop-up apex placed at the side view's APEX range on the arc
  | 'pullDownShape' // pop-up altitude PDP→APEX→TRK: a monotone cubic through the planner's points
  | 'egressAltitudeSchematic' // the side view's egress tip altitude, as a ramp
  | 'egressExtension' // flying on past the drawn 1 nm egress leg
  | 'fragEnvelope' // the frag clear time is a planning envelope, not a DCS fragment model
  | 'blastRadius'; // the weapon table's blast radius, with its source; distance only, no terrain

export interface Estimate {
  code: EstimateCode;
  note: string;
}

// ─── One jet ──────────────────────────────────────────────────────────────────

/**
 * The plan-layer track, a structure of arrays, all of length `n`. Positions
 * are interpolated linearly in lat/lon between picture vertices, so every
 * sample lies on a line the card draws. `tau_s` is strictly increasing.
 * Interval fields (`phase`, `heading_deg`, `pitch_deg`, `v*_mps`) describe the
 * stretch from sample i to i + 1; the last entry repeats the one before.
 */
export interface TrackSamples {
  n: number;
  tau_s: Float64Array;
  s_nm: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  e_m: Float64Array;
  n_m: Float64Array;
  up_m: Float64Array;
  agl_ft: Float64Array;
  msl_ft: Float64Array;
  /** The planned TAS (the label's number); the loft pull's is the simulated speed. */
  tas_kt: Float64Array;
  /** Index into PHASES. */
  phase: Uint8Array;
  heading_deg: Float64Array;
  pitch_deg: Float64Array;
  ve_mps: Float64Array;
  vn_mps: Float64Array;
  vu_mps: Float64Array;
}

export type BombModel = 'vacuum' | 'vacuumOnSightLine' | 'loftDrag';

/** A bomb from release (tau 0) to impact; the last sample is the target waypoint at AGL 0, exactly. */
export interface BombPath {
  model: BombModel;
  fall_s: number;
  n: number;
  tau_s: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  e_m: Float64Array;
  n_m: Float64Array;
  up_m: Float64Array;
  agl_ft: Float64Array;
  msl_ft: Float64Array;
}

/** The weapon's frag numbers, for the window and the cloud. */
export interface FragSpec {
  weaponId: string;
  /** frag_min_safe_alt_ft. */
  H_ft: number;
  /** fragClearTime_s(weapon): the readout's rule window. */
  clear_s: number;
  /** 2·√(2H/g) unrounded: when the last fragment thrown straight up lands (clear_s is this rounded up to 5 s). */
  raw_s: number;
  lethalRadius_ft: number | null;
  effectiveRadius_ft: number | null;
  /** The ground ring to draw: effective radius, else lethal; null when the row has neither. */
  ringRadius_ft: number | null;
}

/**
 * The display layer's precomputed data (jet time throughout). The display
 * track is the plan track averaged over a window of ±smooth_s in time (a box
 * kernel): on a straight, steady stretch that average IS the plan point, so
 * the display differs from the plan only within smooth_s of a corner, and
 * every window starts and ends on the plan at the plan's own time. Around
 * one corner between straight legs it is exactly the quadratic Bézier with
 * its control point on the corner. The window shrinks to nothing as the
 * release approaches, so it never reaches back across it; for 2·smooth_s
 * after the release the display is a cubic Hermite from the release (the
 * plan's position, the incoming velocity the bomb leaves with) to the
 * smoothed track, so the plan's corner at the release is rounded too and
 * nothing before the release moves.
 */
export interface DisplayTrack {
  smooth_s: number;
  /**
   * Jet times where the plan track turns, climbs, dives or changes speed
   * (more than 0.01° or 0.01 %). Sorted. The display equals the plan
   * whenever none is within smooth_s (and the release is not within
   * 2·smooth_s before).
   */
  corners_tau: Float64Array;
  /** Running integrals over jet time of the local columns, from tau 0: ∫ e dt and so on. */
  cum_e: Float64Array;
  cum_n: Float64Array;
  cum_up: Float64Array;
  /** True heading minus the local frame's grid heading, per interval (deg). */
  conv_deg: Float64Array;
  /**
   * The lead-in: straight back from the IP in the local frame, level at the
   * IP altitude, at the ingress speed, along the first stretch's heading.
   * Velocities are the forward ones (the jet flies toward the IP). Its
   * lat/lon come from its e/n through the frame (`fromLocalInto`).
   */
  leadIn: {
    ve_mps: number;
    vn_mps: number;
    up_m: number;
    agl_ft: number;
    msl_ft: number;
    tas_kt: number;
    heading_deg: number;
    /** maxLeadIn_nm at the ingress speed: before tau = −capTau_s the jet is not visible. */
    capTau_s: number;
  };
}

/**
 * A jet's roll and load factor over jet time (attitude.ts), built once per
 * jet: node i is at tau0_s + i·step_s, and the release is node releaseIndex.
 * Read it through rollAt and loadAt, which blend between nodes.
 */
export interface AttitudeTrack {
  tau0_s: number;
  step_s: number;
  n: number;
  releaseIndex: number;
  /** Degrees, right wing down positive, continuous and not wrapped (float64: the rate bound holds to the last bit). */
  roll_deg: Float64Array;
  /** g. */
  load_g: Float32Array;
}

/** How the time across one stretch between anchors was set. Stated times beat flown ones. */
export type SpanRule = 'flown' | 'stated:trackingTime_s' | 'stated:pullUpTimer_s' | 'stated:pullPath';

export interface SpanTiming {
  from: AnchorKind;
  to: AnchorKind;
  rule: SpanRule;
  dt_s: number;
}

export interface JetTrack {
  id: string;
  label: string;
  callsign?: string;
  family: PlaybackFamily;
  /** How the planner prints this jet's altitudes: level in MSL, the rest AGL. */
  altRef: 'AGL' | 'MSL';
  /** profile.offsetDirection; none for a loft. */
  flank?: 'left' | 'right';
  attackHeading_deg: number;
  /** The very objects the card draws, built here with the card's arguments. */
  picture: AttackPicture;
  side: SideProfile;
  target: Waypoint;
  targetElevation_ft: number;
  ip: { point: Coordinates; source: IpAnchorSource | 'schematic'; label: string };
  /** Bearing of the first stretch out of the IP: the display lead-in's heading. */
  routeHeading_deg: number;
  /** Planned TAS from the IP to release, and after release. */
  ingress_kt: number;
  egress_kt: number;
  /** attackSpeedOf(profile): the speed the card's push uses. */
  cardSpeed_kt: number | undefined;
  weapon: DbWeapon | undefined;
  frag?: FragSpec;
  samples: TrackSamples;
  anchors: Partial<Record<AnchorKind, Anchor>>;
  spans: SpanTiming[];
  /** Sorted by tau. */
  events: TrackEvent[];
  bomb: BombPath;
  releaseTau_s: number;
  /** = releaseTau_s + bomb.fall_s: the flown IP→impact time. */
  impactTau_s: number;
  /** End of the drawn egress leg. */
  egressEndTau_s: number;
  /** The jet hides after this: the later of the egress end and its frag clearing, plus tail_s. */
  hideTau_s: number;
  /** ipToImpact_s(picture, attackSpeedOf(profile)): exactly what the card's push uses. */
  cardIpToImpact_s: number | undefined;
  /** The display layer's data: smoothing and the lead-in. */
  display: DisplayTrack;
  /** The roll and load the displayed track needs, over jet time. */
  attitude: AttitudeTrack;
  estimates: Estimate[];
  warnings: string[];
}

// ─── The strike ───────────────────────────────────────────────────────────────

export interface StrikePlayback {
  name: string;
  strikeId?: string;
  frame: LocalFrame;
  /** The jets that fly, in the input's order (lead first for a saved strike). */
  jets: JetTrack[];
  /**
   * Every member, flown or skipped, in the readout's order: the input's jets
   * in their order, each of `input.skipped` at its `order`. `strikeReadout`,
   * `fragConflicts` and the danger zones run over this list, so a skipped jet
   * warns here exactly as it does in the editor's strip.
   */
  members: PlaybackMember[];
  /** Member id (flown or skipped) → raw totOffset_s as planned: Reset is retime(pb, pb.planDelays_s). */
  planDelays_s: Record<string, number>;
  /** In member order. */
  skipped: SkippedJet[];
  options: Required<PlaybackOptions>;
  warnings: string[];
  /** The input's frag rule, 'time' when it gave none. */
  fragRule: FragRule;
}

export interface TimingJet {
  id: string;
  /** Impact time on the strike clock = the jet's delay. */
  tot_s: number;
  /** Strike time of tau = 0. */
  shift_s: number;
  /** When the playback crosses the IP (= shift_s). */
  push_s: number;
  /** tot − cardIpToImpact_s: what the card and the readout print. */
  cardPush_s: number | undefined;
  /** push_s − cardPush_s: > 0, the playback leaves the IP later than the card says. */
  pushDelta_s: number | undefined;
  release_s: number;
  impact_s: number;
  egressEnd_s: number;
  /** tot + frag clear time (tot without frag data). */
  fragEnd_s: number;
  hide_s: number;
}

/**
 * A `fragConflicts` row with ids and its band on the timeline: second's bombs
 * land at t0, first's frag window ends at t1. `firstIndex` / `secondIndex`
 * index `StrikePlayback.members` (the readout's list); `firstJet` /
 * `secondJet` index `StrikePlayback.jets`, undefined for a skipped member.
 */
export interface TimedConflict extends FragConflict {
  firstId: string;
  secondId: string;
  firstJet: number | undefined;
  secondJet: number | undefined;
  t0_s: number;
  t1_s: number;
}

/**
 * The blast rule's row: jet `second` is inside the blast radius of seat
 * `first`'s bomb at the instant it goes off. The field names are
 * `TimedConflict`'s where they mean the same, so the bands, marks and chip
 * read both kinds. Both jets are flown: a jet the playback cannot fly has no
 * path and no burst point.
 */
export interface TimedBurst {
  rule: 'burst';
  /** The bomb's seat label. */
  first: string;
  /** The seat label of the jet inside its radius. */
  second: string;
  /** Places in `StrikePlayback.members`. */
  firstIndex: number;
  secondIndex: number;
  firstId: string;
  secondId: string;
  /** Indices into `StrikePlayback.jets`. */
  firstJet: number;
  secondJet: number;
  /** The bomb's time over target, and that plus `BURST_MARK_S`: what the time bar and the chip mark. The rule itself is the instant t0_s. */
  t0_s: number;
  t1_s: number;
  /** The jet's distance from the burst at that instant, 3D, ft (plan layer). */
  dist_ft: number;
  radius_ft: number;
  meaning: BlastMeaning;
  source: BlastSource;
  /** The bomb's weapon name. */
  weapon: string;
}

/** A frag warning's row under either rule. */
export type ConflictRow = TimedConflict | TimedBurst;

/** Is this row the blast rule's? */
export const isBurstRow = (c: ConflictRow): c is TimedBurst => 'rule' in c;

export interface StrikeWindow {
  t0_s: number;
  t1_s: number;
}

export interface StrikeTiming {
  /** Member id (flown or skipped) → TOT used. */
  delays_s: Record<string, number>;
  /** Same order as StrikePlayback.jets. */
  jets: TimingJet[];
  /** Earliest flown push − leadIn_s to the last hide time. */
  window: StrikeWindow;
  /** The same at the plan delays: freeze the timeline axis on it while a slider is dragged. */
  planWindow: StrikeWindow;
  /**
   * strikeReadout of every member (`StrikePlayback.members`) at these delays,
   * under the playback's rule. Under 'burst' its warnings are the blast lines
   * (one per conflict, in the same order) followed by the cone warnings.
   */
  readout: StrikeReadout;
  /** Under 'time' every row is a `TimedConflict`, under 'burst' a `TimedBurst`. */
  conflicts: ConflictRow[];
  /** Only under 'burst': the gray lines (weapons and jets not checked) and the names of the weapons not checked, for the footer. */
  blast?: { notes: string[]; unchecked: string[] };
}

// ─── Sampling ─────────────────────────────────────────────────────────────────

/**
 * plan: on the card's lines, the tested truth (tests, top-down, side-on; it
 * starts at the IP push). display: for the camera: corners rounded in time,
 * the lead-in before the IP, and the formation slot (chase, orbit, from the
 * target). Never the subject of a planner-agreement test.
 */
export type PlaybackLayer = 'plan' | 'display';

export interface JetState {
  /**
   * plan: from the IP push to the hide time. display: from 20 nm (maxLeadIn_nm)
   * behind the IP to the hide time.
   */
  visible: boolean;
  t_s: number;
  tau_s: number;
  phase: PlaybackPhase;
  lat: number;
  lon: number;
  e_m: number;
  n_m: number;
  up_m: number;
  agl_ft: number;
  msl_ft: number;
  tas_kt: number;
  /** Ground speed of the animation itself. */
  gs_kt: number;
  heading_deg: number;
  pitch_deg: number;
  /**
   * The roll of the jet about its velocity, right wing down positive, in
   * degrees, continuous and not wrapped: what a pilot would hold to fly the
   * displayed track (attitude.ts). 0 on the plan layer.
   */
  bank_deg: number;
  /** The load factor the displayed track needs, g. 1 on the plan layer. */
  load_g: number;
  /** Velocity in the local frame, for a chase camera's look-ahead (the display's excludes the slot's own drift). */
  ve_mps: number;
  vn_mps: number;
  vu_mps: number;
  /**
   * Display only: the formation slot applied, m, + right of the slot direction
   * (the displayed heading on straight stretches and steady turns, smoothed
   * through changes of turn rate: `slotDirection`). 0 on the plan layer.
   */
  slot_m: number;
  released: boolean;
}

export interface BombState {
  /** Only between release and impact. */
  visible: boolean;
  stage: 'carried' | 'falling' | 'impacted';
  /** Seconds since release. */
  tau_s: number;
  lat: number;
  lon: number;
  e_m: number;
  n_m: number;
  up_m: number;
  agl_ft: number;
  msl_ft: number;
  ve_mps: number;
  vn_mps: number;
  vu_mps: number;
}

/** A phase's colour key in `LINE_STYLE` (attackPicture.ts). */
export type PhaseStyle = Record<PlaybackPhase, LineStyleKey>;

// ─── Frag: slider danger zones and the cloud ──────────────────────────────────

/**
 * Delays of one jet that would trip the readout's frag rule against one other
 * member held at its current delay (a skipped member counts, as in the
 * readout): the open interval (T_other − F_this, T_other + F_other), with
 * `strikeReadout`'s strictness (a gap equal to the frag time is clear) and tie
 * rule (on equal TOTs the member listed first is first, so its weapon decides
 * whether the tie itself warns).
 *
 * `from_s` / `to_s` are for drawing. `inDangerZone` does not compare against
 * them: it evaluates the readout's own arithmetic on `T_s` and the two frag
 * times, because with fractional TOTs `T + F` and the readout's `x − T < F`
 * can disagree by one ulp at a frag-time end.
 */
export interface DangerZone {
  /** Index into `StrikePlayback.jets` of the jet held still; undefined when that member is skipped. */
  against: number | undefined;
  /** Index into `StrikePlayback.members` of the member held still. */
  againstMember: number;
  againstId: string;
  from_s: number;
  to_s: number;
  /** Whether each end itself warns: only ever the tie end, never a frag-time end. */
  includesFrom: boolean;
  includesTo: boolean;
  /** The other member's TOT, and the frag clear times the readout would use: this jet's (when it is first) and the other's. */
  T_s: number;
  fragThis_s: number;
  fragOther_s: number;
  /** Whether x = T_s itself warns (the member listed first has frag). */
  tieWarns: boolean;
  /**
   * Set by the blast rule only, whose zones are plain open intervals
   * (`from_s`, `to_s`) and may be several per other jet: 'victim', this jet
   * would be inside the other's blast radius; 'bomb', the other jet would be
   * inside this one's. Its frag-time fields are 0 and `T_s` is the other
   * jet's TOT.
   */
  role?: 'victim' | 'bomb';
}

/**
 * The frag envelope to draw at one moment, from the vacuum model
 * `fragClearTime_s` is derived from: fragments thrown at v0 = √(2gH) in every
 * direction lie, `age_s` after impact, on a sphere of radius v0·age whose
 * centre has fallen g·age²/2; its top, v0·age − g·age²/2, peaks at H. ESTIMATED.
 */
export interface FragCloudState {
  /** From impact until the readout's frag window closes (clear_s); false without frag data. */
  visible: boolean;
  age_s: number;
  /** The impact point on the target, at ground level. */
  lat: number;
  lon: number;
  e_m: number;
  n_m: number;
  up_m: number;
  H_ft: number;
  /** Height of the envelope's top above the impact point, ft (0 once every fragment is down). */
  top_ft: number;
  sphereRadius_ft: number;
  centreDrop_ft: number;
  ringRadius_ft: number | null;
  /** 1 until the last fragment lands (raw_s), then down to 0 at clear_s. */
  opacity: number;
  estimated: true;
}

// ─── Threat domes ─────────────────────────────────────────────────────────────

/** The runtime threat-system rows (snake_case, `get_all_threats`); only these two fields are read. */
export interface DomeSystem {
  id: string;
  max_range_nm: number;
  max_altitude_ft: number;
}

/**
 * A threat's outer envelope as a half-ellipsoid in the local frame:
 * horizontal semi-axis max_range_nm, vertical semi-axis max_altitude_ft above
 * the dome's base.
 */
export interface ThreatDome {
  threatId: string;
  systemId: string;
  status: ThreatInstance['status'];
  source: ThreatInstance['source'];
  centre: Coordinates;
  e_m: number;
  n_m: number;
  /** The base, MSL ft (the caller's, else the frame origin's elevation), and in the frame. */
  base_ft: number;
  base_up_m: number;
  radius_nm: number;
  radius_m: number;
  height_ft: number;
  height_m: number;
}

// ─── Extras ───────────────────────────────────────────────────────────────────

/** The card's side-view coordinates of a jet: straight-line range to its own target, and AGL. */
export interface SideCoords {
  range_nm: number;
  agl_ft: number;
}

/** A box in the local frame, metres. */
export interface PlaybackBounds {
  min_e_m: number;
  max_e_m: number;
  min_n_m: number;
  max_n_m: number;
  min_up_m: number;
  max_up_m: number;
}
