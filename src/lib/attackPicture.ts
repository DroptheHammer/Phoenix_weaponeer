/**
 * The attack, drawn — once. `buildAttackPicture` turns a saved attack into
 * lines, markers and labels in lat/lon; the map overlay renders them with
 * Leaflet and the kneeboard card renders the same picture north-up on canvas.
 * `buildSideProfile` is the matching altitude-versus-distance view. Colours
 * and words live here and nowhere else.
 */

import type { Attack, DiveCCIPProfile, LevelCCRPProfile, PopupCCIPProfile } from '../types/attack.types';
import type { Waypoint } from '../types/waypoint.types';
import type {
  AttackPicture,
  LineStyleKey,
  MarkerKind,
  PictureLine,
  PictureMarker,
  SideProfile,
  SidePoint,
  SideSegment,
} from '../types/attackPicture.types';
import {
  calculateBearing,
  calculateDiveGeometry,
  calculateLevelGeometry,
  calculatePopupGeometry,
  resolveEgressHeading,
  flankSign,
  normalizeHeading,
  diveGroundRange_nm,
  levelReleaseRange_nm,
  LEVEL_RUN_IN_NM,
  type ActionPointInput,
  type EgressPath,
  type Turn,
} from './attackGeometry';
import { popupActionOf, FT_PER_NM } from './popupPlanning';

// ─── The one palette ──────────────────────────────────────────────────────────

export interface LineStyle {
  color: string;
  width: number;
  dash?: number[];
}

/** Tailwind's blue-400, yellow-400, orange-500, red-500, green-500 — what the map has always used. */
export const LINE_STYLE: Record<LineStyleKey, LineStyle> = {
  route: { color: '#60a5fa', width: 2, dash: [10, 10] },
  leg: { color: '#60a5fa', width: 3 },
  climb: { color: '#fbbf24', width: 3 },
  pullDown: { color: '#f97316', width: 3 },
  attack: { color: '#ef4444', width: 3 },
  bomb: { color: '#ef4444', width: 1, dash: [4, 6] },
  egress: { color: '#22c55e', width: 3 },
  egressLeg: { color: '#22c55e', width: 2, dash: [10, 10] },
};

/** Hex of the Tailwind *-500 the map markers use, for the canvas. */
export const MARKER_COLOR: Record<MarkerKind, string> = {
  AP: '#a855f7',
  ROLL: '#f97316',
  RUN: '#f97316',
  POP: '#eab308',
  PDP: '#f97316',
  TRK: '#6b7280',
  REL: '#eab308',
  TGT: '#ef4444',
};

/** The Tailwind classes themselves, for the map. Listed as literals so Tailwind emits them. */
export const MARKER_TAILWIND: Record<MarkerKind, string> = {
  AP: 'bg-purple-500',
  ROLL: 'bg-orange-500',
  RUN: 'bg-orange-500',
  POP: 'bg-yellow-500',
  PDP: 'bg-orange-500',
  TRK: 'bg-gray-500',
  REL: 'bg-yellow-500',
  TGT: 'bg-red-500',
};

/** Label boxes: white with dark text on the map and the card; egress dark green; IP dark blue. */
export const LABEL_STYLE = {
  tooltipBg: '#ffffff',
  tooltipText: '#111827',
  tooltipBorder: '#374151',
  egressBg: '#14532d',
  egressBorder: '#4ade80',
  ipBg: '#1e3a8a',
  ipBorder: '#60a5fa',
};

// ─── Words ────────────────────────────────────────────────────────────────────

export const fmtHdg = (h: number) => Math.round(normalizeHeading(h)).toString().padStart(3, '0');
export const turnText = (turn: Turn, onto: number) =>
  turn.deg >= 3 ? `${turn.direction.toUpperCase()} onto ${fmtHdg(onto)}°` : `${fmtHdg(onto)}°`;
const nm1 = (v: number) => v.toFixed(1);
const ft = (v: number) => Math.round(v).toLocaleString();

// ─── Pieces ───────────────────────────────────────────────────────────────────

function actionOf(
  profile: { actionRange_nm?: number; offsetAngle_deg?: number; offsetDirection?: 'left' | 'right' },
  ipWaypoint: Waypoint | undefined,
  targetWaypoint: Waypoint,
): ActionPointInput | undefined {
  if (!ipWaypoint || profile.actionRange_nm == null || profile.offsetAngle_deg == null || !profile.offsetDirection) return undefined;
  return {
    directBearing_deg: calculateBearing(ipWaypoint.coordinates, targetWaypoint.coordinates),
    actionRange_nm: profile.actionRange_nm,
    offsetTurn_deg: profile.offsetAngle_deg,
    side: profile.offsetDirection,
  };
}

function egressLines(egress: EgressPath): PictureLine[] {
  return [
    { style: 'egress', points: egress.arc },
    { style: 'egressLeg', points: [egress.rollOut, egress.end] },
  ];
}

function actionMarker(position: { lat: number; lon: number }, range_nm: number, turn: Turn, approachHeading: number): PictureMarker {
  return {
    kind: 'AP',
    position,
    side: 'top',
    permanent: true,
    lines: [`${nm1(range_nm)}nm: ACTION — turn ${turn.direction.toUpperCase()} ${Math.round(turn.deg)}° to ${fmtHdg(approachHeading)}°`],
  };
}

const targetMarker = (position: { lat: number; lon: number }, attackHeading: number, side: 'bottom' | 'right' = 'bottom'): PictureMarker => ({
  kind: 'TGT',
  position,
  side,
  permanent: true,
  lines: [`Attack hdg: ${fmtHdg(attackHeading)}°`],
});

// ─── Plan view ────────────────────────────────────────────────────────────────

export function buildAttackPicture(attack: Attack, ipWaypoint: Waypoint | undefined, targetWaypoint: Waypoint): AttackPicture | undefined {
  switch (attack.profileType) {
    case 'dive_ccip':
      return divePicture(attack, attack.profile as DiveCCIPProfile, ipWaypoint, targetWaypoint);
    case 'level_ccrp':
      return levelPicture(attack, attack.profile as LevelCCRPProfile, ipWaypoint, targetWaypoint);
    case 'popup_ccip':
      return ipWaypoint ? popupPicture(attack.profile as PopupCCIPProfile, ipWaypoint, targetWaypoint) : undefined;
    default:
      return undefined;
  }
}

function divePicture(attack: Attack, profile: DiveCCIPProfile, ipWaypoint: Waypoint | undefined, targetWaypoint: Waypoint): AttackPicture {
  const g = calculateDiveGeometry(targetWaypoint.coordinates, profile.ingressHeading_deg, {
    rollInAltitude_ft: profile.rollInAltitude_ft,
    releaseAltitude_ft: profile.releaseAltitude_ft,
    diveAngle_deg: profile.diveAngle_deg,
    releaseSpeed_ktas: profile.releaseSpeed_ktas,
    egressDirection: profile.egressDirection,
    egressHeading_deg: profile.egressHeading_deg,
    egressG: profile.pulloutG,
    ipPoint: ipWaypoint?.coordinates,
    action: actionOf(profile, ipWaypoint, targetWaypoint),
  });
  const releaseLabel = attack.deliveryMode === 'DTOS' ? 'System release ~' : attack.deliveryMode === 'MAN' ? 'Pickle by' : 'Release by';
  const lines: PictureLine[] = g.actionPoint
    ? [
        { style: 'route', points: [g.ingressStart, g.actionPoint] },
        { style: 'leg', points: [g.actionPoint, g.rollInPoint] },
      ]
    : [{ style: 'route', points: [g.ingressStart, g.rollInPoint] }];
  lines.push({ style: 'attack', points: [g.rollInPoint, g.releasePoint] }, { style: 'bomb', points: [g.releasePoint, g.targetPoint] }, ...egressLines(g.egress));

  const markers: PictureMarker[] = [];
  if (g.actionPoint && g.offsetTurn) markers.push(actionMarker(g.actionPoint, profile.actionRange_nm ?? 0, g.offsetTurn, g.approachHeading));
  markers.push(
    {
      kind: 'ROLL',
      position: g.rollInPoint,
      side: 'top',
      permanent: true,
      lines: [
        `${nm1(g.rollInRange_nm)}nm: roll in ${turnText(g.rollInTurn, g.attackHeading)}`,
        `${profile.diveAngle_deg}° dive from ${ft(profile.rollInAltitude_ft)}ft AGL`,
        ...(attack.sightDepression_mils != null ? [`Sight ${attack.sightDepression_mils} mils`] : []),
      ],
    },
    {
      kind: 'REL',
      position: g.releasePoint,
      side: 'bottom',
      permanent: true,
      lines: [`${releaseLabel} ${ft(profile.releaseAltitude_ft)}ft AGL @ ${profile.releaseSpeed_ktas} KTAS`],
    },
    targetMarker(g.targetPoint, g.attackHeading),
  );
  return {
    lines,
    markers,
    labels: [{ kind: 'egress', position: g.egress.end, text: `Egress ${profile.egressDirection}, ${fmtHdg(g.egressHeading)}°` }],
    attackHeading: g.attackHeading,
    egressHeading: g.egressHeading,
    egressDirection: profile.egressDirection,
  };
}

function levelPicture(attack: Attack, profile: LevelCCRPProfile, ipWaypoint: Waypoint | undefined, targetWaypoint: Waypoint): AttackPicture {
  const releaseAltitude_agl = Math.max(profile.releaseAltitude_ft - (targetWaypoint.elevation_ft ?? 0), 0);
  const g = calculateLevelGeometry(targetWaypoint.coordinates, profile.ingressHeading_deg, {
    releaseAltitude_agl,
    releaseSpeed_ktas: profile.releaseSpeed_ktas,
    egressDirection: profile.egressDirection ?? 'straight',
    egressHeading_deg: profile.egressHeading_deg,
    ipPoint: ipWaypoint?.coordinates,
    action: actionOf(profile, ipWaypoint, targetWaypoint),
  });
  const mode = attack.deliveryMode ?? 'CCRP';
  const releaseLabel = mode === 'CCRP' || mode === 'AUTO' ? 'Auto-release' : mode === 'VIS' ? 'Fire' : 'Pickle';
  const egressDirection = profile.egressDirection ?? 'straight';
  const lines: PictureLine[] = g.actionPoint
    ? [
        { style: 'route', points: [g.ingressStart, g.actionPoint] },
        { style: 'leg', points: [g.actionPoint, g.runInStart] },
      ]
    : [{ style: 'route', points: [g.ingressStart, g.runInStart] }];
  lines.push({ style: 'attack', points: [g.runInStart, g.releasePoint] }, { style: 'bomb', points: [g.releasePoint, g.targetPoint] }, ...egressLines(g.egress));

  const markers: PictureMarker[] = [];
  if (g.actionPoint && g.offsetTurn) markers.push(actionMarker(g.actionPoint, profile.actionRange_nm ?? 0, g.offsetTurn, g.approachHeading));
  markers.push(
    {
      kind: 'RUN',
      position: g.runInStart,
      side: 'top',
      permanent: true,
      lines: [`${nm1(g.runInStartRange_nm)}nm: turn ${turnText(g.joinTurn, g.attackHeading)}`, 'Wings level for the release'],
    },
    {
      kind: 'REL',
      position: g.releasePoint,
      side: 'bottom',
      permanent: true,
      lines: [`${releaseLabel} ~${nm1(g.releaseRange_nm)}nm out`, `${ft(profile.releaseAltitude_ft)}ft MSL @ ${profile.releaseSpeed_ktas} KTAS`],
    },
    targetMarker(g.targetPoint, g.attackHeading),
  );
  return {
    lines,
    markers,
    labels: [{ kind: 'egress', position: g.egress.end, text: `Egress ${egressDirection}, ${fmtHdg(g.egressHeading)}°` }],
    attackHeading: g.attackHeading,
    egressHeading: g.egressHeading,
    egressDirection,
  };
}

function popupPicture(profile: PopupCCIPProfile, ipWaypoint: Waypoint, targetWaypoint: Waypoint): AttackPicture {
  const directBearing = calculateBearing(ipWaypoint.coordinates, targetWaypoint.coordinates);
  const { plan, action, pullDown_deg } = popupActionOf(profile, directBearing);
  const s = flankSign(action.side);
  const attackHeading = normalizeHeading(directBearing - s * action.offsetTurn_deg + s * pullDown_deg);
  const egressHeading = resolveEgressHeading(profile, attackHeading);
  const g = calculatePopupGeometry(ipWaypoint.coordinates, targetWaypoint.coordinates, {
    mapDistance_ft: plan.mapDistance_ft,
    turnRadius_ft: plan.turnRadius_ft,
    popToPullDown_ft: plan.popToPullDown_ft,
    bombRange_ft: plan.bombRange_ft,
    aimOff_ft: plan.aimOff_ft,
    angleOff_deg: pullDown_deg,
    action,
    egressHeading_deg: egressHeading,
    egressSpeed_ktas: profile.releaseSpeed_ktas,
    egressG: plan.pullG,
  });

  return {
    lines: [
      { style: 'route', points: [g.ipPoint, g.actionPoint] },
      { style: 'leg', points: [g.actionPoint, g.pullUpPoint] },
      { style: 'climb', points: [g.pullUpPoint, g.pullDownPoint] },
      { style: 'pullDown', points: g.pullDownArc },
      { style: 'attack', points: [g.trackPoint, g.releasePoint] },
      { style: 'bomb', points: [g.releasePoint, g.aimOffPoint] },
      ...egressLines(g.egress),
    ],
    markers: [
      actionMarker(g.actionPoint, g.actionRange_nm, g.offsetTurn, g.approachHeading),
      {
        kind: 'POP',
        position: g.pullUpPoint,
        side: 'bottom',
        permanent: true,
        lines: [
          `${nm1(g.popRange_nm)}nm: PULL UP — ${plan.pullG} G to ${plan.climbAngle_deg}° climb, hold ${fmtHdg(g.approachHeading)}°`,
          `${ft(profile.runInAltitude_ft)}ft AGL @ ${profile.runInSpeed_ktas} KTAS · MAX power`,
        ],
      },
      {
        kind: 'PDP',
        position: g.pullDownPoint,
        side: 'top',
        permanent: true,
        lines: [
          `${nm1(g.pullDownRange_nm)}nm: at ${ft(plan.pullDownAltitude_ft)}ft pull ${turnText(g.pullDown, g.attackHeading)}`,
          `Apex ${ft(plan.apexAltitude_ft)}ft · ${profile.diveAngle_deg}° dive`,
        ],
      },
      {
        kind: 'TRK',
        position: g.trackPoint,
        side: 'bottom',
        permanent: true,
        lines: [`${nm1(g.mapDistance_nm)}nm: wings level ${ft(plan.trackAltitude_ft)}ft — track ${plan.trackingTime_s}s`, `Aim-off ${ft(plan.aimOff_ft)}ft beyond TGT`],
      },
      {
        kind: 'REL',
        position: g.releasePoint,
        side: 'right',
        permanent: false,
        lines: [`Release by ${ft(plan.releaseAltitude_ft)}ft AGL · ${nm1(g.releaseRange_nm)}nm from TGT`],
      },
      targetMarker(g.targetPoint, g.attackHeading, 'right'),
    ],
    labels: [
      { kind: 'ip', position: g.ipPoint, text: `IP: ${ft(profile.runInAltitude_ft)}ft @ ${profile.runInSpeed_ktas}kts → route ${fmtHdg(g.routeHeading)}°` },
      { kind: 'egress', position: g.egress.end, text: `Egress ${profile.egressDirection}, ${fmtHdg(egressHeading)}°` },
    ],
    attackHeading: g.attackHeading,
    egressHeading: egressHeading,
    egressDirection: profile.egressDirection,
  };
}

// ─── Side view ────────────────────────────────────────────────────────────────

/** The same attack as altitude against distance to the target, for the card. */
export function buildSideProfile(attack: Attack, targetElevation_ft: number): SideProfile | undefined {
  const points: SidePoint[] = [];
  const segments: SideSegment[] = [];
  const add = (p: SidePoint) => points.push(p) - 1;
  const seg = (s: SideSegment) => segments.push(s);

  if (attack.profileType === 'dive_ccip') {
    const p = attack.profile as DiveCCIPProfile;
    const rollIn = diveGroundRange_nm(p.rollInAltitude_ft, p.diveAngle_deg);
    const release = diveGroundRange_nm(p.releaseAltitude_ft, p.diveAngle_deg);
    const ingressAlt = p.ingressAltitude_ft ?? p.rollInAltitude_ft;
    const start = add({ kind: 'AP', dist_nm: p.actionRange_nm ?? rollIn + 3, alt_ft: ingressAlt, label: p.actionRange_nm != null ? `${p.actionRange_nm}nm: ACTION` : undefined, side: 'top' });
    const roll = add({ kind: 'ROLL', dist_nm: rollIn, alt_ft: p.rollInAltitude_ft, label: `${nm1(rollIn)}nm · ${ft(p.rollInAltitude_ft)}ft · ${p.diveAngle_deg}° dive`, side: 'top' });
    const rel = add({ kind: 'REL', dist_nm: release, alt_ft: p.releaseAltitude_ft, label: `Release by ${ft(p.releaseAltitude_ft)}ft AGL`, side: 'bottom' });
    const tgt = add({ kind: 'TGT', dist_nm: 0, alt_ft: 0 });
    const out = add({ kind: 'EGRESS', dist_nm: release - 1.2, alt_ft: p.releaseAltitude_ft + 1500 });
    seg({ style: p.actionRange_nm != null ? 'leg' : 'route', from: start, to: roll });
    seg({ style: 'attack', from: roll, to: rel });
    seg({ style: 'bomb', from: rel, to: tgt });
    seg({ style: 'egress', from: rel, to: out, curve: 'up' });
    return { points, segments, maxAlt_ft: Math.max(ingressAlt, p.rollInAltitude_ft) };
  }

  if (attack.profileType === 'level_ccrp') {
    const p = attack.profile as LevelCCRPProfile;
    const agl = Math.max(p.releaseAltitude_ft - targetElevation_ft, 0);
    const release = levelReleaseRange_nm(agl, p.releaseSpeed_ktas);
    const runIn = release + LEVEL_RUN_IN_NM;
    const start = add({ kind: 'AP', dist_nm: p.actionRange_nm ?? runIn + 3, alt_ft: agl, label: p.actionRange_nm != null ? `${p.actionRange_nm}nm: ACTION` : undefined, side: 'top' });
    const run = add({ kind: 'RUN', dist_nm: runIn, alt_ft: agl, label: `${nm1(runIn)}nm: wings level`, side: 'top' });
    const rel = add({ kind: 'REL', dist_nm: release, alt_ft: agl, label: `Release ~${nm1(release)}nm · ${ft(p.releaseAltitude_ft)}ft MSL`, side: 'bottom' });
    const tgt = add({ kind: 'TGT', dist_nm: 0, alt_ft: 0 });
    const out = add({ kind: 'EGRESS', dist_nm: release - 1.2, alt_ft: agl + 800 });
    seg({ style: p.actionRange_nm != null ? 'leg' : 'route', from: start, to: run });
    seg({ style: 'attack', from: run, to: rel });
    seg({ style: 'bomb', from: rel, to: tgt });
    seg({ style: 'egress', from: rel, to: out, curve: 'up' });
    return { points, segments, maxAlt_ft: agl };
  }

  if (attack.profileType === 'popup_ccip') {
    const p = attack.profile as PopupCCIPProfile;
    const plan = popupActionOf(p, 0).plan;
    const map = plan.mapDistance_ft / FT_PER_NM;
    const bomb = plan.bombRange_ft / FT_PER_NM;
    const pdp = p.turnInRange_nm ?? map + 0.8;
    const pop = p.popDistance_nm;
    const start = add({ kind: 'AP', dist_nm: p.actionRange_nm ?? pop + 0.5, alt_ft: p.runInAltitude_ft, label: `${p.actionRange_nm ?? '?'}nm: ACTION`, side: 'top' });
    const popIdx = add({ kind: 'POP', dist_nm: pop, alt_ft: p.runInAltitude_ft, label: `${nm1(pop)}nm: PULL UP ${plan.climbAngle_deg}°`, side: 'bottom' });
    const pdpIdx = add({ kind: 'PDP', dist_nm: pdp, alt_ft: plan.pullDownAltitude_ft, label: `${ft(plan.pullDownAltitude_ft)}ft: pull down`, side: 'top' });
    const apex = add({ kind: 'APEX', dist_nm: pdp - (pdp - map) * 0.45, alt_ft: plan.apexAltitude_ft, label: `apex ${ft(plan.apexAltitude_ft)}ft`, side: 'top' });
    const trk = add({ kind: 'TRK', dist_nm: map, alt_ft: plan.trackAltitude_ft, label: `${ft(plan.trackAltitude_ft)}ft: track ${plan.trackingTime_s}s`, side: 'bottom' });
    const rel = add({ kind: 'REL', dist_nm: bomb, alt_ft: plan.releaseAltitude_ft, label: `Release by ${ft(plan.releaseAltitude_ft)}ft AGL`, side: 'bottom' });
    const tgt = add({ kind: 'TGT', dist_nm: 0, alt_ft: 0 });
    const out = add({ kind: 'EGRESS', dist_nm: bomb - 1.0, alt_ft: plan.releaseAltitude_ft + 1500 });
    seg({ style: 'leg', from: start, to: popIdx });
    seg({ style: 'climb', from: popIdx, to: pdpIdx });
    seg({ style: 'pullDown', from: pdpIdx, to: trk, via: apex });
    seg({ style: 'attack', from: trk, to: rel });
    seg({ style: 'bomb', from: rel, to: tgt });
    seg({ style: 'egress', from: rel, to: out, curve: 'up' });
    return { points, segments, hardDeck_ft: p.minAltitude_ft, maxAlt_ft: plan.apexAltitude_ft };
  }

  return undefined;
}
