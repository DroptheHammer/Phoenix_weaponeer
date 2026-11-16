/**
 * One jet's plan-layer track. The playback is resampled from the objects the
 * map and the card already draw, never re-solved: `buildAttackPicture` and
 * `buildSideProfile` are called with exactly the card's arguments, the picture
 * gives the ground path and the markers, the side view gives the altitudes,
 * and the planner's own functions give the speeds, stated times and falls.
 */

import type { Attack } from '../../types';
import type { AttackPicture } from '../../types/attackPicture.types';
import { buildAttackPicture, buildSideProfile } from '../attackPicture';
import { signedHeadingDelta } from '../attackGeometry';
import { calculateBearing } from '../coordinates';
import { attackSpeedOf, ipToImpact_s } from '../strike';
import { buildAltitude, type AltitudeModel } from './altitude';
import { anchorMarkers } from './anchors';
import { buildAttitude } from './attitude';
import { buildBomb } from './bomb';
import { burstSpecOf } from './burst';
import { type Chain, buildChain, pointAt, REVERSAL_DEG } from './chain';
import { integrateTau, spanTimings, type StatedSpan } from './clock';
import { buildDisplay } from './display';
import { estimatesOf } from './estimates';
import { trackEvents } from './events';
import { type FamilyFacts, familyFacts, familyOf } from './family';
import { fragSpecOf } from './frag';
import { appendExtension, chainColumns, finishSamples, gridIndex, sGrid } from './resample';
import type { Anchor, AnchorKind, EstimateCode, JetTrack, LocalFrame, PlaybackJetInput, PlaybackOptions } from './types';

const ANCHOR_ORDER: readonly AnchorKind[] = ['IP', 'AP', 'ROLL', 'RUN', 'POP', 'PDP', 'APEX', 'TRK', 'REL', 'ROLLOUT', 'END'];

/** Why a jet has no picture to fly. */
function skipReason(input: PlaybackJetInput): string {
  switch (input.attack.profileType) {
    case 'popup_ccip': return 'A pop-up needs an IP: without one there is no run-in to fly.';
    case 'loft_ccrp': return 'A loft needs an IP: its axis is the IP→target line.';
    case 'standoff': return 'Stand-off attacks have no attack picture to fly.';
    default: return 'This delivery (strafe, low-angle low-drag) has no attack picture to fly.';
  }
}

/** Corners sharper than REVERSAL_DEG: the drawn path doubles back (a pop before the action point, an IP inside a loft's pull-up range). */
function reversalWarnings(chain: Chain): string[] {
  const out: string[] = [];
  const segs = chain.segs.filter((g) => g.len > 0.001); // skip the 1 ft pop-up join, whose bearing means nothing
  for (let i = 1; i < segs.length; i++) {
    const turn = Math.abs(signedHeadingDelta(calculateBearing(segs[i - 1].a, segs[i - 1].b), calculateBearing(segs[i].a, segs[i].b)));
    if (turn > REVERSAL_DEG) out.push(`The drawn path doubles back (${Math.round(turn)}°) where the ${segs[i].style} line starts: it is flown as drawn.`);
  }
  return out;
}

/** Spans whose total time the planner states. */
function statedSpans(facts: FamilyFacts, alt: AltitudeModel, at: (k: AnchorKind) => number | undefined): StatedSpan[] {
  const out: StatedSpan[] = [];
  const span = (from: AnchorKind, to: AnchorKind, total_s: number | undefined, rule: StatedSpan['rule']) => {
    const i0 = at(from), i1 = at(to);
    if (i0 != null && i1 != null && i1 > i0 && total_s != null && total_s > 0) out.push({ from, to, i0, i1, total_s, rule });
  };
  if (facts.family === 'popup') span('TRK', 'REL', facts.trackingTime_s, 'stated:trackingTime_s');
  if (facts.family === 'loft') {
    span('IP', 'POP', facts.pullUpTimer_s, 'stated:pullUpTimer_s');
    if (alt.pull) span('POP', 'REL', facts.loftPlan!.pullTime_s, 'stated:pullPath');
  }
  return out;
}

/** A jet that cannot be flown: the reason, and its picture when one was built (the readout still reads it). */
export interface SkippedBuild {
  skipped: string;
  picture?: AttackPicture;
}

export function buildJetTrack(input: PlaybackJetInput, frame: LocalFrame, options: Required<PlaybackOptions>): JetTrack | SkippedBuild {
  const family = familyOf(input.attack.profileType);
  // buildAttackPicture and buildSideProfile read only the PlaybackAttack fields.
  const attack = input.attack as Attack;
  // The picture is built exactly as the editor's strip builds it, for every family it can draw.
  const picture = buildAttackPicture(attack, input.ipAnchor, input.target);
  const elev = input.target.elevation_ft ?? 0;
  const side = picture && family ? buildSideProfile(attack, elev) : undefined;
  if (!family || !picture || !side || side.segments.length === 0) return { skipped: skipReason(input), picture };
  const chain = buildChain(picture);
  const marks = anchorMarkers(chain, picture);
  const sRel = marks.s.REL;
  if (!chain.segs.length || sRel == null) return { skipped: 'The release point is not on the drawn path.', picture };

  const ipPoint = chain.vertices[0].p;
  const relSide = side.points.find((p) => p.kind === 'REL');
  const facts = familyFacts(input.attack, family, input.target, ipPoint, relSide?.alt_ft ?? 0);
  const alt = buildAltitude(family, side, marks.s, chain, input.target.coordinates, facts.loftPlan);

  // Anchors: the markers, plus the side points placed by range (the pop-up apex, a legacy dive's AP).
  const anchorS: Partial<Record<AnchorKind, number>> = { ...marks.s };
  const source: Partial<Record<AnchorKind, Anchor['source']>> = { ...marks.source };
  for (const k of alt.knots) {
    if (k.source === 'range' && anchorS[k.kind] == null) {
      anchorS[k.kind] = k.s;
      source[k.kind] = 'range';
    }
  }
  const exact = [...chain.vertices.map((v) => v.s), ...Object.values(anchorS), ...alt.knots.map((k) => k.s)] as number[];
  const grid = sGrid(exact, alt.breakpoints, chain.length_nm, options.sampleDs_nm);
  const indexOf = (k: AnchorKind) => (anchorS[k] != null ? gridIndex(grid, anchorS[k]!) : undefined);
  const h = grid.map((s) => alt.at(s));
  const stated = statedSpans(facts, alt, indexOf);
  const { tau, tas } = integrateTau({ s: grid, h, sRel, ingress_kt: facts.ingress_kt, egress_kt: facts.egress_kt, pull: alt.pull, stated });

  const releaseTau_s = tau[indexOf('REL')!];
  const egressEndTau_s = tau[tau.length - 1];
  const bomb = buildBomb(facts, pointAt(chain, sRel), input.target, frame);
  const impactTau_s = releaseTau_s + bomb.fall_s;
  const frag = fragSpecOf(input.weapon);
  const hideTau_s = Math.max(egressEndTau_s, impactTau_s + (frag?.clear_s ?? 0)) + options.tail_s;

  const cols = chainColumns(chain, grid, h, tau, tas);
  const egressLeg = picture.lines.find((l) => l.style === 'egressLeg');
  if (egressLeg && egressLeg.points.length === 2) appendExtension(cols, egressLeg.points[0], egressLeg.points[1], facts.egress_kt, hideTau_s);
  const samples = finishSamples(cols, frame, elev);

  const anchors: Partial<Record<AnchorKind, Anchor>> = {};
  const order: { kind: AnchorKind; index: number }[] = [];
  for (const kind of ANCHOR_ORDER) {
    const index = indexOf(kind);
    if (index == null) continue;
    anchors[kind] = { kind, s_nm: grid[index], index, tau_s: tau[index], agl_ft: h[index], source: source[kind] ?? 'line' };
    order.push({ kind, index });
  }

  const warnings = [...marks.warnings, ...alt.warnings, ...reversalWarnings(chain)];
  if (!input.ipAnchor) warnings.push('No IP: the planner\'s schematic 8 nm run-in is flown from its start.');
  if (family === 'loft' && facts.pullUpTimer_s == null) warnings.push('The IP is inside the pull-up range: there is no timer, and the drawn route runs away from the target first.');

  const cardSpeed_kt = attackSpeedOf(input.attack.profile);
  const codes: EstimateCode[] = [...facts.estimates, 'noWind', 'flatGroundAgl', 'egressAltitudeSchematic', 'egressExtension'];
  if (input.attack.estimated) codes.unshift('profileNotFlown');
  if (cardSpeed_kt) codes.push('cardPushIsEstimate');
  if (frag) codes.push('fragEnvelope');
  if (burstSpecOf(input.weapon)) codes.push('blastRadius');

  const built: Omit<JetTrack, 'attitude'> = {
    id: input.id, label: input.label, callsign: input.callsign, family,
    altRef: family === 'level' ? 'MSL' : 'AGL',
    flank: facts.flank,
    attackHeading_deg: picture.attackHeading,
    picture, side, target: input.target, targetElevation_ft: elev,
    ip: { point: ipPoint, source: input.ipAnchor?.source ?? 'schematic', label: input.ipAnchor?.shortLabel ?? 'Schematic run-in' },
    routeHeading_deg: calculateBearing(chain.segs[0].a, chain.segs[0].b),
    ingress_kt: facts.ingress_kt, egress_kt: facts.egress_kt, cardSpeed_kt,
    weapon: input.weapon, frag,
    samples, anchors, spans: spanTimings(order, tau, stated),
    events: trackEvents(facts, anchors, samples, impactTau_s, frag, input.target, frame),
    bomb, releaseTau_s, impactTau_s, egressEndTau_s, hideTau_s,
    cardIpToImpact_s: cardSpeed_kt ? ipToImpact_s(picture, cardSpeed_kt) : undefined,
    display: buildDisplay(samples, facts.ingress_kt, options),
    estimates: estimatesOf(codes),
    warnings,
  };
  // The roll table reads the finished track through the display layer, so it is added last.
  const track = built as JetTrack;
  track.attitude = buildAttitude(track);
  return track;
}
