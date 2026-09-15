import {
  applyAngleOff,
  angleOffOf,
  isStraightIn,
  signedHeadingDelta,
  actionPointLeg,
  joinPointOnLeg,
  attackHeadingFromActionPoint,
  solveOffsetLeg,
  offsetLegRatioFor,
  maxOffsetLegRatio,
  levelReleaseRange_nm,
  LEVEL_RUN_IN_NM,
  calculatePopupGeometry,
  calculateDiveGeometry,
  calculateLevelGeometry,
  egressPath,
} from '../src/lib/attackGeometry';
import {
  planPopup,
  solvePullDownTurn,
  approachAbeamFor,
  doctrinalCheckTurn,
  applyPopupPlan,
} from '../src/lib/popupPlanning';
import { describeRunIn } from '../src/lib/runIn';
import { inferIp, resolveIp, initialIpOverride, autoBuildAttack } from '../src/lib/autoBuildAttack';
import { calculateBearing, calculateDistance, calculateDestination } from '../src/lib/coordinates';
import { buildAttackPicture, pictureFitPoints } from '../src/lib/attackPicture';
import { resolveIpAnchor, inferIpFrom, initialIpOverrideFrom, attackIpAnchor, initialIpChoice, ipRadial, ipFromRadial, ipFieldsFor, ipPointFromFields, seedCustomIp } from '../src/lib/ipAnchor';
import { edgeCrossing, pixelSpan, labelsAreLegible } from '../src/lib/labelLayout';
import { targetCandidates, ipCandidates, waypointLabel } from '../src/lib/waypointOptions';
import { flightGroupOf } from '../src/lib/callsign';
import { applyDisplayFilter } from '../src/lib/displayFilter';
import { visibleArcSpans } from '../src/lib/arcClip';
import { compareThreatsForCard } from '../src/lib/cardThreats';
import { applyFlank, applyEgress } from '../src/lib/attackFlank';
import { useUiStore } from '../src/stores/uiStore';
import {
  lonLatToTile,
  tileNwCorner,
  metresPerTilePixel,
  chooseZoom,
  tilesCovering,
  planBasemap,
  tileRectPx,
  MIN_BASEMAP_ZOOM,
  MAX_BASEMAP_ZOOM,
  MAX_BASEMAP_TILES,
} from '../src/lib/kneeboardBasemap';
import { planViewTransform, mapStatusOf } from '../src/lib/renderKneeboardCanvas';
import { groupAttacksByAircraft, aircraftFolderInfo, claimFilename } from '../src/lib/kneeboardExportPlan';
import { validateMission } from '../src/lib/validateMission';
import { escapeHtml } from '../src/lib/html';
import { runAttackChecks, hasErrors } from '../src/lib/attackChecks';
import { readFileSync } from 'node:fs';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const r = (v: number) => Math.round(v * 10) / 10;
const NM = 6076.12;

// ─── Angle-off arithmetic, including the 360 wrap ────────────────────────────
ok('ingress from the LEFT flank rotates the axis right: 010 → 040', applyAngleOff(10, { deg: 30, side: 'left' }) === 40);
ok('ingress from the RIGHT flank rotates it left, across north: 350 → 320', applyAngleOff(350, { deg: 30, side: 'right' }) === 320);
const a = angleOffOf(340, 10);
ok('measure 340 vs 010 = 30°, ingress from the right', a.deg === 30 && a.side === 'right', JSON.stringify(a));
ok('straight-in within 5', isStraightIn(252, 248) && isStraightIn(243, 248) && !isStraightIn(242, 248));
ok('straight-in across north', isStraightIn(2, 358));

// ─── NTTR-like geometry: IP ~12 nm north-east of the target, direct bearing ~248 ──
const tgt = { lat: 37.15, lon: -116.83 };
const direct = 248;
const ip = (() => {
  const d = 12, b = (direct + 180) % 360, R = 3440.065;
  const lat1 = (tgt.lat * Math.PI) / 180, lon1 = (tgt.lon * Math.PI) / 180, br = (b * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d / R) + Math.cos(lat1) * Math.sin(d / R) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d / R) * Math.cos(lat1), Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
})();
const directBearing = calculateBearing(ip, tgt);
ok('IP→TGT bearing ≈ 248', Math.abs(directBearing - direct) < 0.5, r(directBearing).toString());

// ─── The action point and the offset leg ─────────────────────────────────────
// Threat on the left of the direct line → ingress from the RIGHT flank: turn right at the action point, final turn LEFT.
const actionR = { directBearing_deg: directBearing, actionRange_nm: 4.5, offsetTurn_deg: 20, side: 'right' as const };
const legR = actionPointLeg(tgt, actionR);
ok('action point is 4.5 nm from the target on the route', Math.abs(calculateDistance(legR.actionPoint, tgt) - 4.5) < 0.01 && Math.abs(signedHeadingDelta(calculateBearing(ip, legR.actionPoint), directBearing)) < 0.5);
ok('right-flank check turn: approach = direct + 20', Math.abs(signedHeadingDelta(directBearing, legR.approachHeading) - 20) < 0.01, r(legR.approachHeading).toString());
ok('leg passes 1.54 nm abeam the target', Math.abs(legR.abeam_nm - 4.5 * Math.sin((20 * Math.PI) / 180)) < 0.001, r(legR.abeam_nm).toString());

// 30° dive from 8,000 ft: roll-in 2.28 nm from the target.
const rollInRange = 8000 / Math.tan((30 * Math.PI) / 180) / NM;
const joinR = joinPointOnLeg(tgt, actionR, rollInRange)!;
ok('roll-in point is on the leg at the roll-in range', Math.abs(calculateDistance(joinR.point, tgt) - rollInRange) < 0.01 && Math.abs(signedHeadingDelta(calculateBearing(legR.actionPoint, joinR.point), legR.approachHeading)) < 0.5);
ok('roll-in turn is LEFT for a right-flank ingress, ~42°', joinR.joinTurn.direction === 'left' && Math.abs(joinR.joinTurn.deg - 42.5) < 1, JSON.stringify(joinR.joinTurn));
ok('attack heading = approach − roll-in turn', Math.abs(signedHeadingDelta(legR.approachHeading, joinR.attackHeading) + joinR.joinTurn.deg) < 0.01, r(joinR.attackHeading).toString());
ok('attack heading points at the target from the roll-in', Math.abs(signedHeadingDelta(calculateBearing(joinR.point, tgt), joinR.attackHeading)) < 0.5);
ok('attack heading is ~22° LEFT of the direct line (right flank)', signedHeadingDelta(directBearing, joinR.attackHeading) < -20 && signedHeadingDelta(directBearing, joinR.attackHeading) > -25, r(signedHeadingDelta(directBearing, joinR.attackHeading)).toString());
ok('attackHeadingFromActionPoint agrees', Math.abs(signedHeadingDelta(attackHeadingFromActionPoint(actionR, rollInRange)!, joinR.attackHeading)) < 0.01);
ok('a 40° check turn at 4.5 nm never reaches 2.3 nm', joinPointOnLeg(tgt, { ...actionR, offsetTurn_deg: 40 }, rollInRange) === undefined);

// Left flank mirrors it.
const actionL = { ...actionR, side: 'left' as const };
const joinL = joinPointOnLeg(tgt, actionL, rollInRange)!;
ok('left flank: approach = direct − 20, roll-in turn RIGHT, attack heading right of direct', Math.abs(signedHeadingDelta(directBearing, actionPointLeg(tgt, actionL).approachHeading) + 20) < 0.01 && joinL.joinTurn.direction === 'right' && signedHeadingDelta(directBearing, joinL.attackHeading) > 20);

// Dive geometry end to end.
const dive = calculateDiveGeometry(tgt, 0, { rollInAltitude_ft: 8000, releaseAltitude_ft: 4500, diveAngle_deg: 30, releaseSpeed_ktas: 450, egressDirection: 'right', egressG: 4, ipPoint: ip, action: actionR });
ok('dive: route heading IP→AP = direct', Math.abs(signedHeadingDelta(dive.routeHeading, directBearing)) < 0.5);
ok('dive: release point 1.28 nm out on the axis', Math.abs(dive.releaseRange_nm - 4500 / Math.tan((30 * Math.PI) / 180) / NM) < 0.01);
ok('dive: egress breaks RIGHT from the release point, ends on the egress heading', dive.egress.turn.direction === 'right' && Math.abs(signedHeadingDelta(dive.attackHeading, dive.egressHeading) - 90) < 0.01 && calculateDistance(dive.egress.arc[0], dive.releasePoint) < 0.001);
ok('dive: egress arc never crosses the target', dive.egress.arc.every((p) => calculateDistance(p, tgt) > 0.3));
// Legacy save without an action point still draws.
const legacy = calculateDiveGeometry(tgt, 218, { rollInAltitude_ft: 8000, releaseAltitude_ft: 4500, diveAngle_deg: 30, egressDirection: 'right', ipPoint: ip });
ok('dive legacy: straight transit from the IP to the roll-in, heading kept', legacy.actionPoint === undefined && legacy.attackHeading === 218);

// Level: run-in start 3 nm before release; action point pushed out when needed is auto-build's job — here it fits.
const lvl = calculateLevelGeometry(tgt, 0, { releaseAltitude_agl: 3000, releaseSpeed_ktas: 450, egressDirection: 'right', ipPoint: ip, action: { ...actionR, actionRange_nm: 7 } });
ok('level: run-in start on the leg, 3 nm before release', Math.abs(lvl.runInStartRange_nm - lvl.releaseRange_nm - 3) < 0.01 && Math.abs(calculateDistance(lvl.runInStart, tgt) - lvl.runInStartRange_nm) < 0.01 && lvl.actionPoint !== undefined, r(lvl.runInStartRange_nm).toString());
ok('an action point inside the join range is rejected (auto-build moves it out)', joinPointOnLeg(tgt, actionR, 4.7) === undefined && attackHeadingFromActionPoint(actionR, 4.7) === undefined);

// ─── The handbook's worked example (Korean AF BEM Vol 5 §5.17.1) ─────────────
const bem = planPopup({ diveAngle_deg: 15, releaseAltitude_ft: 2000, speed_ktas: 520, trackingTime_s: 5, pullG: 3.5 });
ok('BEM: climb 20°, guide angle-off 40°', bem.climbAngle_deg === 20 && bem.doctrinalAngleOff_deg === 40);
ok('BEM: track altitude 3,137 ft', Math.abs(bem.trackAltitude_ft - 3137) < 3, r(bem.trackAltitude_ft).toString());
ok('BEM: apex 3,887 ft (manual rounds to 3,900)', Math.abs(bem.apexAltitude_ft - 3887) < 3, r(bem.apexAltitude_ft).toString());
ok('BEM: pop-to-pull-down = apex × 60 / 20', Math.abs(bem.popToPullDown_ft - bem.apexAltitude_ft * 3) < 0.01);
ok('BEM: turn radius 6,853 ft', Math.abs(bem.turnRadius_ft - 6853) < 5, r(bem.turnRadius_ft).toString());
ok('BEM: horizontal tracking 4,242 ft', Math.abs(bem.horizontalTracking_ft - 4242) < 5);
ok('BEM: vacuum bomb range within 2% of the table (5,138 ft)', Math.abs(bem.bombRange_ft - 5138) / 5138 < 0.02, r(bem.bombRange_ft).toString());
// The manual's own check turn at its 4.5 nm action point was 17°; the guide rounds to 15.
ok('BEM: doctrinal check turn at 4.5 nm ≈ 15–20° (manual: 17°)', [15, 20].includes(doctrinalCheckTurn(bem, 4.5)), doctrinalCheckTurn(bem, 4.5).toString());
const bemPull = solvePullDownTurn(bem, 4.5, 17)!;
ok('BEM: a 17° check turn at 4.5 nm closes with a ~40° pull-down', Math.abs(bemPull - 40) < 6, r(bemPull).toString());

// ─── F-16 20° pop ────────────────────────────────────────────────────────────
const plan20 = planPopup({ diveAngle_deg: 20, releaseAltitude_ft: 3500, speed_ktas: 480 });
ok('20° dive → 30° climb → guide 60°', plan20.climbAngle_deg === 30 && plan20.doctrinalAngleOff_deg === 60);
const check20 = doctrinalCheckTurn(plan20, 4.5);
ok('20° pop: doctrinal check turn at 4.5 nm is a round 25°', check20 === 25, check20.toString());
const pull20 = solvePullDownTurn(plan20, 4.5, check20)!;
ok('20° pop: pull-down for a 25° check turn ≈ 55–65°', pull20 > 55 && pull20 < 65, r(pull20).toString());
ok('solve is exact: abeam(pull-down) = 4.5 sin 25°', Math.abs(approachAbeamFor(plan20, pull20) - 4.5 * NM * Math.sin((25 * Math.PI) / 180)) < 1);
ok('a 60° check turn at 4.5 nm cannot close', solvePullDownTurn(plan20, 4.5, 60) === undefined);

const popAction = { directBearing_deg: directBearing, actionRange_nm: 4.5, offsetTurn_deg: check20, side: 'right' as const };
const gpop = calculatePopupGeometry(ip, tgt, {
  mapDistance_ft: plan20.mapDistance_ft, turnRadius_ft: plan20.turnRadius_ft, popToPullDown_ft: plan20.popToPullDown_ft,
  bombRange_ft: plan20.bombRange_ft, aimOff_ft: plan20.aimOff_ft, angleOff_deg: pull20, action: popAction,
  egressHeading_deg: 0, egressSpeed_ktas: 480, egressG: 3.5,
});
ok('pop: approach = direct + 25 for a right-flank ingress', Math.abs(signedHeadingDelta(directBearing, gpop.approachHeading) - 25) < 0.01);
ok('pop: pull-down turn LEFT by the solved angle', gpop.pullDown.direction === 'left' && Math.abs(gpop.pullDown.deg - pull20) < 0.01);
ok('pop: PDP sits on the offset leg', Math.abs(signedHeadingDelta(calculateBearing(gpop.actionPoint, gpop.pullDownPoint), gpop.approachHeading)) < 1, `${r(calculateBearing(gpop.actionPoint, gpop.pullDownPoint))} vs ${r(gpop.approachHeading)}`);
ok('pop: PUP sits on the offset leg, between AP and PDP', gpop.holdDown_nm > 0 && Math.abs(signedHeadingDelta(calculateBearing(gpop.actionPoint, gpop.pullUpPoint), gpop.approachHeading)) < 1, r(gpop.holdDown_nm).toString());
ok('pop: track point at the MAP, release at bomb range', Math.abs(calculateDistance(gpop.trackPoint, tgt) - plan20.mapDistance_ft / NM) < 0.01 && Math.abs(calculateDistance(gpop.releasePoint, tgt) - plan20.bombRange_ft / NM) < 0.01);
ok('pop: arc runs PDP → TRK', calculateDistance(gpop.pullDownArc[0], gpop.pullDownPoint) < 0.005 && calculateDistance(gpop.pullDownArc[gpop.pullDownArc.length - 1], gpop.trackPoint) < 0.005);
ok('pop: pops about 4 nm out', gpop.popRange_nm > 3.5 && gpop.popRange_nm < 4.6, r(gpop.popRange_nm).toString());
ok('pop: climb leg is the pop-to-pull-down distance', Math.abs(calculateDistance(gpop.pullUpPoint, gpop.pullDownPoint) - plan20.popToPullDown_ft / NM) < 0.01);
ok('pop: aim-off point beyond the target on the axis', Math.abs(signedHeadingDelta(gpop.attackHeading, calculateBearing(tgt, gpop.aimOffPoint))) < 0.5);

// applyPopupPlan fills the derived fields and headings from the route.
const filled = applyPopupPlan({
  type: 'popup_ccip', ipWaypointId: 'ip', runInAltitude_ft: 500, runInSpeed_ktas: 480,
  diveAngle_deg: 20, releaseAltitude_ft: 3500, releaseSpeed_ktas: 480, minAltitude_ft: 500, offsetDirection: 'right',
  climbAngle_deg: 0, apexAltitude_ft: 0, rollInAltitude_ft: 0, popDistance_nm: 0, egressDirection: 'right',
}, directBearing);
ok('applyPopupPlan: apex 5,900 / pull-down 4,400 / climb 30 / check turn 25 / closes', filled.apexAltitude_ft === 5900 && filled.rollInAltitude_ft === 4400 && filled.climbAngle_deg === 30 && filled.offsetAngle_deg === 25 && filled.geometryCloses === true, `${filled.apexAltitude_ft}/${filled.rollInAltitude_ft}/${filled.offsetAngle_deg}`);
ok('applyPopupPlan: approach and attack headings written from the route', filled.approachHeading_deg != null && Math.abs(signedHeadingDelta(filled.approachHeading_deg!, directBearing + 25)) < 0.01 && filled.runInHeading_deg != null && Math.abs(signedHeadingDelta(filled.runInHeading_deg!, gpop.attackHeading)) < 0.1);

// describeRunIn reads the same story back for the editor and the card.
const story = describeRunIn(filled, directBearing)!;
ok('describeRunIn (pop-up): 4.5 nm, turn right 25°, pull down left onto the attack heading', story.actionRange_nm === 4.5 && story.offsetTurn.deg === 25 && story.offsetTurn.direction === 'right' && story.joinTurn.direction === 'left' && story.joinLabel === 'pull down' && Math.abs(signedHeadingDelta(story.attackHeading, filled.runInHeading_deg!)) < 0.01);
const diveStory = describeRunIn({ type: 'dive_ccip', ingressHeading_deg: joinR.attackHeading, rollInAltitude_ft: 8000, diveAngle_deg: 30, releaseAltitude_ft: 4500, releaseSpeed_ktas: 450, pulloutG: 4, egressDirection: 'right', actionRange_nm: 4.5, offsetAngle_deg: 20, offsetDirection: 'right' }, directBearing)!;
ok('describeRunIn (dive): roll in left ~42° onto the computed heading', diveStory.joinLabel === 'roll in' && diveStory.joinTurn.direction === 'left' && Math.abs(diveStory.joinTurn.deg - joinR.joinTurn.deg) < 0.1 && Math.abs(signedHeadingDelta(diveStory.attackHeading, joinR.attackHeading)) < 0.01);

// Egress path shape.
const eg = egressPath(tgt, 0, 90, 450, 4);
ok('egress: 90° right turn, arc radius ~0.74 nm, ends heading 090', eg.turn.direction === 'right' && Math.abs(calculateDistance(eg.rollOut, tgt) - Math.SQRT2 * 0.74) < 0.05 && Math.abs(signedHeadingDelta(calculateBearing(eg.rollOut, eg.end), 90)) < 0.5);

// ─── Chained attacks flow in from the previous steerpoint, not the route's IP ──
const wp = (id: string, steerpoint: number, type: string, lat: number, lon: number) => ({ id, steerpoint, type, name: id, coordinates: { lat, lon }, elevation_ft: 0 });
const chained = { waypoints: [wp('STPT7', 7, 'ip', 37.3, -116.6), wp('TGT1', 8, 'target', 37.15, -116.83), wp('TGT2', 9, 'target', 37.05, -116.95), wp('STPT10', 10, 'nav', 36.9, -117.1)] } as unknown as Parameters<typeof inferIp>[0];
ok('attack on STPT 8 flows in from STPT 7 (the IP)', inferIp(chained, chained.waypoints[1])?.id === 'STPT7');
ok('attack on STPT 9 flows in from STPT 8 (the previous target), not the IP', inferIp(chained, chained.waypoints[2])?.id === 'TGT1');
ok('first waypoint has nothing before it', inferIp(chained, chained.waypoints[0]) === undefined);

// ─── pictureFitPoints excludes the route line but keeps the attack ─────────────
// Build a dive attack where the IP sits far out (10+ nm), producing a long route line.
const farIp = calculateDestination(tgt, (direct + 180) % 360, 12);
const distantAttack = {
  id: 'test',
  targetWaypointId: 'tgt',
  profileType: 'dive_ccip' as const,
  profile: {
    type: 'dive_ccip' as const,
    ipWaypointId: 'ip',
    rollInAltitude_ft: 8000,
    diveAngle_deg: 30,
    releaseAltitude_ft: 4500,
    releaseSpeed_ktas: 450,
    pulloutG: 4,
    egressDirection: 'right' as const,
    actionRange_nm: 4.5,
    offsetAngle_deg: 20,
    offsetDirection: 'right' as const,
    ingressHeading_deg: dive.attackHeading,
    fuzeMode: 'instant',
    quantity: 1,
    targetElevation_ft: 0,
  },
};
const ipWp = { id: 'ip', steerpoint: 7, type: 'ip' as const, name: 'IP', coordinates: farIp, elevation_ft: 0 };
const tgtWp = { id: 'tgt', steerpoint: 8, type: 'target' as const, name: 'TGT', coordinates: tgt, elevation_ft: 0 };
// Build a real IpAnchor from a waypoint fixture via the production resolver, not a hand-rolled stand-in.
const anchorOf = (ip: { id: string; steerpoint: number; name: string; coordinates: { lat: number; lon: number } }, target: { id: string; steerpoint: number; name: string; coordinates: { lat: number; lon: number } }) =>
  resolveIpAnchor([ip as never, target as never], target as never, { ipWaypointId: ip.id })!;
const picture = buildAttackPicture(distantAttack, anchorOf(ipWp, tgtWp), tgtWp);
if (!picture) throw new Error('buildAttackPicture failed');

// The raw all-points set (what the map USED to fit) includes the route line.
const allPoints = [
  ...picture.lines.flatMap((l) => l.points),
  ...picture.markers.map((m) => m.position),
  ...picture.labels.map((l) => l.position),
];
const farthestFromTarget = Math.max(...allPoints.map((p) => calculateDistance(p, tgt)));
ok('raw all-points includes a point >8 nm from target (the route line to the distant IP)', farthestFromTarget > 8, r(farthestFromTarget).toString());

// pictureFitPoints excludes the route line, so nothing should be beyond ~1 nm past the action point.
const fitPts = pictureFitPoints(picture);
const farthestFit = Math.max(...fitPts.map((p) => calculateDistance(p, tgt)));
ok('pictureFitPoints excludes the route line: nothing beyond ~5.5 nm (roughly 1 nm past the 4.5 nm action point)', farthestFit < 5.5, r(farthestFit).toString());

// Non-finite coordinates are filtered out.
const badPicture = { ...picture, markers: [...picture.markers, { kind: 'TGT' as const, position: { lat: NaN, lon: -116.83 }, lines: [], side: 'bottom' as const, permanent: true }] };
const cleanedFit = pictureFitPoints(badPicture);
ok('pictureFitPoints filters out non-finite coordinates', cleanedFit.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)));

// Egress label and TGT marker ARE included.
const hasEgressLabel = fitPts.some((p) => picture.labels.some((l) => l.kind === 'egress' && l.position.lat === p.lat && l.position.lon === p.lon));
const hasTgtMarker = fitPts.some((p) => picture.markers.some((m) => m.kind === 'TGT' && m.position.lat === p.lat && m.position.lon === p.lon));
ok('pictureFitPoints includes egress label position', hasEgressLabel);
ok('pictureFitPoints includes TGT marker position', hasTgtMarker);

// ─── IP labels: only when there is a real IP waypoint ─────────────────────────
const diveWithIp = buildAttackPicture(distantAttack, anchorOf(ipWp, tgtWp), tgtWp);
const diveNoIp = buildAttackPicture(distantAttack, undefined, tgtWp);
ok('dive picture WITH ip waypoint has an ip label', diveWithIp && diveWithIp.labels.some((l) => l.kind === 'ip'));
ok('dive picture WITHOUT ip waypoint has no ip label', diveNoIp && !diveNoIp.labels.some((l) => l.kind === 'ip'));

const levelAttack = {
  id: 'test-level',
  targetWaypointId: 'tgt',
  profileType: 'level_ccrp' as const,
  profile: {
    type: 'level_ccrp' as const,
    ipWaypointId: 'ip',
    releaseAltitude_ft: 20000,
    releaseSpeed_ktas: 480,
    egressDirection: 'right' as const,
    ingressHeading_deg: lvl.attackHeading,
    fuzeMode: 'instant',
    quantity: 1,
    targetElevation_ft: 0,
  },
};
const levelWithIp = buildAttackPicture(levelAttack, anchorOf(ipWp, tgtWp), tgtWp);
const levelNoIp = buildAttackPicture(levelAttack, undefined, tgtWp);
ok('level picture WITH ip waypoint has an ip label', levelWithIp && levelWithIp.labels.some((l) => l.kind === 'ip'));
ok('level picture WITHOUT ip waypoint has no ip label', levelNoIp && !levelNoIp.labels.some((l) => l.kind === 'ip'));

// ─── edgeCrossing: segment/rectangle clip ─────────────────────────────────────
// The IP is normally off-frame, so this decides where its tag gets pinned. A
// weak test here hid a real bug: an implementation that only handled a level
// approach passed, while every diagonal silently returned nothing at all.
const bounds = { x: 100, y: 100, w: 400, h: 300 };
const inboardInside: [number, number] = [250, 200];
const inBox = (p: [number, number] | undefined) =>
  !!p && p[0] >= bounds.x + 8 && p[0] <= bounds.x + bounds.w - 8 && p[1] >= bounds.y + 8 && p[1] <= bounds.y + bounds.h - 8;
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

const fromWest = edgeCrossing([50, 200], inboardInside, bounds);
ok('edgeCrossing: run-in from the west pins to the left edge', inBox(fromWest) && near(fromWest![0], 108) && near(fromWest![1], 200), JSON.stringify(fromWest));

const fromEast = edgeCrossing([600, 250], [300, 250], bounds);
ok('edgeCrossing: run-in from the east pins to the right edge', inBox(fromEast) && near(fromEast![0], 492) && near(fromEast![1], 250), JSON.stringify(fromEast));

const fromNorth = edgeCrossing([300, 20], [300, 250], bounds);
ok('edgeCrossing: run-in from the north pins to the top edge', inBox(fromNorth) && near(fromNorth![0], 300) && near(fromNorth![1], 108), JSON.stringify(fromNorth));

const fromSouth = edgeCrossing([300, 600], [300, 250], bounds);
ok('edgeCrossing: run-in from the south pins to the bottom edge', inBox(fromSouth) && near(fromSouth![0], 300) && near(fromSouth![1], 392), JSON.stringify(fromSouth));

// A 45° diagonal — dx === dy — is the case the first implementation got wrong.
const fromNW = edgeCrossing([0, 0], [300, 300], bounds);
ok('edgeCrossing: 45° diagonal from the north-west enters at the corner', inBox(fromNW) && near(fromNW![0], 108) && near(fromNW![1], 108), JSON.stringify(fromNW));

// Enters through the bottom edge, not the right one, despite being further east.
const fromSE = edgeCrossing([700, 600], inboardInside, bounds);
ok('edgeCrossing: diagonal from the south-east enters through the bottom edge', inBox(fromSE) && near(fromSE![1], 392) && fromSE![0] > 300 && fromSE![0] < 492, JSON.stringify(fromSE));

ok('edgeCrossing: undefined when the point is already in frame', edgeCrossing(inboardInside, inboardInside, bounds) === undefined);
ok('edgeCrossing: undefined when both ends are off frame', edgeCrossing([50, 50], [900, 900], bounds) === undefined);

// ─── pixelSpan and labelsAreLegible threshold ─────────────────────────────────
ok('pixelSpan of an empty array is 0', pixelSpan([]) === 0);
ok('pixelSpan of a single point is 0', pixelSpan([[100, 200]]) === 0);

// A box spanning 300 × 400 px has a diagonal of 500
const boxPoints: [number, number][] = [[100, 100], [400, 100], [400, 500], [100, 500]];
const diagonal = pixelSpan(boxPoints);
ok('pixelSpan of a 300×400 box is 500', Math.abs(diagonal - 500) < 0.01, r(diagonal).toString());

// Spread-out attack (clearly above 150 px threshold)
const spreadPoints: [number, number][] = [[100, 100], [400, 350]];
ok('labelsAreLegible is true for spread-out attack (span > 150)', labelsAreLegible(spreadPoints));

// Clumped attack at mission scale (span ~40 px, well below 150 px)
const clumpedPoints: [number, number][] = [[200, 200], [220, 230]];
ok('labelsAreLegible is false for clumped attack (span < 150)', !labelsAreLegible(clumpedPoints));

ok('labelsAreLegible is false for empty point set', !labelsAreLegible([]));

// ─── The redundant "Action point set to…" adjustment is gone ─────────────────
// The run-in hint under the Ingress toggle already prints both the action range
// and the join range, so the amber line below it only restated them (removed
// 2026-09-08). Built on the REAL f16c profile library and a real-shaped weapon
// row: the previous version of this check wired a hand-made profile with no
// aircraftId/geometry/weaponClasses, so autoBuildAttack bailed at its early
// return and the check passed whether the message existed or not. The
// actionRange assertion below is what stops that happening again — it proves
// the push-out branch actually ran.
const f16cProfiles = JSON.parse(readFileSync('src-tauri/resources/profiles/f16c.json', 'utf8'));
const jdamLevel = f16cProfiles.find((p: { id: string }) => p.id === 'f16c.level.ccrp.jdam');

const gbu31 = {
  id: 'gbu31', name: 'GBU-31(V)1/B', category: 'bomb_gps', guidance: 'gps',
  weight_lbs: 2036, min_release_alt_ft: 5000, frag_min_safe_alt_ft: 1500,
};
const wpTgt = { id: 'w-tgt', steerpoint: 8, name: 'TGT1', type: 'target', coordinates: tgt, elevation_ft: 4000 };
// STPT 7 sits 15.3 nm out on 068° — the real Viper 1 leg, long enough that the
// action point can be pushed out without tripping the "route too short" problem.
const wpIp = { id: 'w-ip', steerpoint: 7, name: 'STPT 7', type: 'turnpoint',
               coordinates: calculateDestination(tgt, 68, 15.3), elevation_ft: 5000 };
const pilot = { id: 'p1', callsign: 'Viper 1-1', aircraftId: 'f16c',
                loadout: [{ weaponType: 'GBU-31(V)1/B', quantity: 2 }] };

const levelBuild = autoBuildAttack({
  mission: { waypoints: [wpIp, wpTgt], flightMembers: [pilot], threats: [], attacks: [] },
  targetWaypointId: wpTgt.id,
  attackerId: pilot.id,
  weapons: [gbu31],
  profiles: [jdamLevel],
  threatSystems: [],
} as never);

const levelProfile = levelBuild.attack?.profile as { actionRange_nm?: number } | undefined;
ok('level CCRP 20k JDAM builds against the real f16c profile library',
   levelBuild.attack != null, levelBuild.problems.join('; '));
ok('the action point really is pushed out past the run-in start (branch ran)',
   (levelProfile?.actionRange_nm ?? 0) > 8, 'actionRange ' + (levelProfile?.actionRange_nm ?? 'none'));
ok('no "Action point set to" adjustment is emitted',
   !levelBuild.adjustments.some((m: string) => m.includes('Action point set to')),
   levelBuild.adjustments.length ? levelBuild.adjustments.join('; ') : '(none)');

// ─── The level offset leg ────────────────────────────────────────────────────
// The leg is specified as a multiple of the run-in (join) range and the action
// point falls out of it, so a long time-of-fall moves the check turn out
// instead of eating the leg. Before this, the same NTTR case flew a 2.04 nm leg
// (0.29 x J) with an 11.3 deg azimuth split — a pair inside one radar cone.

// Library profiles store release altitude AGL; the level profile converts to MSL.
const jdamAgl = 20000;
const J = levelReleaseRange_nm(jdamAgl, 420) + LEVEL_RUN_IN_NM;
ok('JDAM 20k/420kt run-in range is 7.1 nm', Math.abs(J - 7.11) < 0.02, r(J).toString());

const sol = solveOffsetLeg(J, 30, 1.5)!;
ok('1.5 x leg at a 30 deg check turn: axis 48.6 deg, split 97.2 deg, angle-off 78.6 deg',
   Math.abs(sol.axisOffset_deg - 48.59) < 0.05 && Math.abs(sol.split_deg - 97.18) < 0.1 && Math.abs(sol.angleOff_deg - 78.59) < 0.05,
   `axis ${r(sol.axisOffset_deg)} split ${r(sol.split_deg)} AO ${r(sol.angleOff_deg)}`);
ok('...and derives a 13.9 nm action point for a 10.7 nm leg',
   Math.abs(sol.actionRange_nm - 13.95) < 0.05 && Math.abs(sol.legLength_nm - 1.5 * J) < 0.001,
   `AP ${r(sol.actionRange_nm)} leg ${r(sol.legLength_nm)}`);

// The split depends only on the ratio and the check turn — J cancels out of
// sin(phi). That is what makes the multiple the right knob to expose.
const solHigh = solveOffsetLeg(J * 2.3, 30, 1.5)!;
ok('the split is independent of the join range (J cancels)', Math.abs(solHigh.split_deg - sol.split_deg) < 1e-9,
   `${r(solHigh.split_deg)} vs ${r(sol.split_deg)}`);

// Tangency: at cot(theta) the leg just touches the run-in ring, angle-off 90.
ok('the leg goes tangent at cot(check turn) — 1.732 x at 30 deg, angle-off 90',
   Math.abs(maxOffsetLegRatio(30)! - 1.7320508) < 1e-6 &&
   Math.abs(solveOffsetLeg(J, 30, maxOffsetLegRatio(30)!)!.angleOff_deg - 90) < 0.001);
ok('a leg longer than 1/sin(check turn) does not close at all', solveOffsetLeg(J, 45, 1.5) === undefined);

// Round trip: action point -> ratio -> action point.
const backRatio = offsetLegRatioFor(J, 30, sol.actionRange_nm)!;
ok('action point converts back to the 1.5 x ratio it came from', Math.abs(backRatio - 1.5) < 0.001, r(backRatio).toString());

// Auto-build on the real NTTR leg.
const lvlP = levelBuild.attack!.profile as { actionRange_nm?: number; offsetAngle_deg?: number; offsetLegRatio?: number };
ok('auto-build picks a 30 deg check turn and a 1.5 x leg for a level attack',
   lvlP.offsetAngle_deg === 30 && Math.abs((lvlP.offsetLegRatio ?? 0) - 1.5) < 1e-9,
   `turn ${lvlP.offsetAngle_deg} ratio ${lvlP.offsetLegRatio}`);
ok('the 13.9 nm action point still fits inside the 15.3 nm route leg, no adjustment',
   Math.abs((lvlP.actionRange_nm ?? 0) - 13.9) < 0.06 && levelBuild.adjustments.length === 0,
   `AP ${lvlP.actionRange_nm} · ${levelBuild.adjustments.join('; ') || 'no adjustments'}`);

// THE ONE THAT PROVES THE FEATURE. Measured on the picture the map and the
// kneeboard card both draw. Reads 2.04 nm (0.29 x J) without the change.
const lvlPic = buildAttackPicture(levelBuild.attack as never, anchorOf(wpIp, wpTgt), wpTgt as never)!;
const apPt = lvlPic.markers.find((m) => m.kind === 'AP')!.position;
const runPt = lvlPic.markers.find((m) => m.kind === 'RUN')!.position;
const drawnLeg = calculateDistance(apPt, runPt);
ok('the drawn offset leg really is 1.5 x the run-in range (10.7 nm, was 2.0)',
   Math.abs(drawnLeg - 1.5 * J) < 0.05, `${r(drawnLeg)} nm = ${r(drawnLeg / J)} x J`);
ok('the run-in start still sits on the run-in ring',
   Math.abs(calculateDistance(runPt, tgt) - J) < 0.1, r(calculateDistance(runPt, tgt)).toString());
ok('the attack axis is swung ~49 deg off the direct line (was 5.6)',
   Math.abs(Math.abs(signedHeadingDelta(calculateBearing(wpIp.coordinates, tgt), levelBuild.attack!.profile.ingressHeading_deg)) - 48.59) < 0.5,
   r(signedHeadingDelta(calculateBearing(wpIp.coordinates, tgt), levelBuild.attack!.profile.ingressHeading_deg)).toString());

// Past tangency the near-root solve returns the wrong point; the leg length has
// to be threaded through. Fails if legLength_nm is ignored.
const wide = { directBearing_deg: 248, actionRange_nm: solveOffsetLeg(J, 30, 1.95)!.actionRange_nm,
               offsetTurn_deg: 30, side: 'right' as const, legLength_nm: 1.95 * J };
const wideJoin = joinPointOnLeg(tgt, wide, J)!;
ok('past tangency (1.95 x) the join point is still on the ring and the leg is still 1.95 x',
   Math.abs(wideJoin.alongLeg_nm - 1.95 * J) < 0.001 && Math.abs(calculateDistance(wideJoin.point, tgt) - J) < 0.15,
   `leg ${r(wideJoin.alongLeg_nm)} ring ${r(calculateDistance(wideJoin.point, tgt))}`);

// Auto-build refuses to go past 90 deg angle-off on its own.
const wideTurn = autoBuildAttack({
  mission: { waypoints: [wpIp, wpTgt], flightMembers: [pilot], threats: [], attacks: [] },
  targetWaypointId: wpTgt.id, attackerId: pilot.id, weapons: [gbu31], profiles: [jdamLevel],
  threatSystems: [], overrides: { offsetTurn_deg: 40 },
} as never);
const wideP = wideTurn.attack!.profile as { offsetLegRatio?: number };
ok('a 40 deg check turn caps the leg at cot(40) = 1.19 x, angle-off exactly 90',
   Math.abs((wideP.offsetLegRatio ?? 0) - maxOffsetLegRatio(40)!) < 1e-9 &&
   Math.abs(solveOffsetLeg(J, 40, wideP.offsetLegRatio!)!.angleOff_deg - 90) < 0.001,
   `ratio ${wideP.offsetLegRatio?.toFixed(3)}`);
ok('...and says so in an adjustment naming the 90 deg limit',
   wideTurn.adjustments.some((m: string) => m.includes('angle-off past 90')),
   wideTurn.adjustments.join('; ') || '(none)');

// A short route leg pulls the action point in and reports the split it cost.
const wpNear = { ...wpIp, coordinates: calculateDestination(tgt, 68, 11) };
const shortLeg = autoBuildAttack({
  mission: { waypoints: [wpNear, wpTgt], flightMembers: [pilot], threats: [], attacks: [] },
  targetWaypointId: wpTgt.id, attackerId: pilot.id, weapons: [gbu31], profiles: [jdamLevel], threatSystems: [],
} as never);
const shortP = shortLeg.attack!.profile as { actionRange_nm?: number };
ok('an 11 nm route leg pulls the action point in to fit',
   (shortP.actionRange_nm ?? 99) <= 10.5, `AP ${shortP.actionRange_nm}`);
ok('...and the adjustment names the split it cost',
   shortLeg.adjustments.some((m: string) => m.includes('azimuth split drops')),
   shortLeg.adjustments.join('; ') || '(none)');

// Dive is untouched: still a 4.5 nm action point and a 20 deg check turn.
const diveProfiles = f16cProfiles.filter((p: { id: string }) => p.id === 'f16c.dive.ccip30');
if (diveProfiles.length) {
  const mk82 = { id: 'mk82', name: 'Mk-82 LDGP', category: 'bomb_unguided', guidance: 'unguided',
                 weight_lbs: 500, min_release_alt_ft: 3000, frag_min_safe_alt_ft: 1500 };
  const divePilot = { ...pilot, loadout: [{ weaponType: 'Mk-82 LDGP', quantity: 4 }] };
  const diveBuild = autoBuildAttack({
    mission: { waypoints: [wpIp, wpTgt], flightMembers: [divePilot], threats: [], attacks: [] },
    targetWaypointId: wpTgt.id, attackerId: divePilot.id, weapons: [mk82],
    profiles: diveProfiles, threatSystems: [],
  } as never);
  const dp = diveBuild.attack?.profile as { offsetAngle_deg?: number; offsetLegRatio?: number } | undefined;
  ok('dive still uses the handbook 20 deg check turn and carries no leg ratio',
     dp != null && dp.offsetAngle_deg === 20 && dp.offsetLegRatio === undefined,
     `turn ${dp?.offsetAngle_deg} ratio ${dp?.offsetLegRatio}`);

  // A custom IP wins over the route's real IP waypoint, for dive too.
  const diveCustomIp = calculateDestination(wpTgt.coordinates, 300, 10);
  const diveCustomBuild = autoBuildAttack({
    mission: { waypoints: [wpIp, wpTgt], flightMembers: [divePilot], threats: [], attacks: [] },
    targetWaypointId: wpTgt.id, attackerId: divePilot.id, weapons: [mk82],
    profiles: diveProfiles, threatSystems: [],
    overrides: { customIp: diveCustomIp },
  } as never);
  ok('dive: a custom IP moves the computed run-in bearing off the route waypoint',
     Math.abs((diveCustomBuild.directBearing ?? 0) - 120) < 1, String(r(diveCustomBuild.directBearing ?? 0)));
  const dcp = diveCustomBuild.attack?.profile as { customIp?: { lat: number; lon: number }; ipWaypointId?: string } | undefined;
  ok('dive: the custom point is written onto the built profile, ipWaypointId cleared',
     dcp?.ipWaypointId === undefined && dcp?.customIp != null && calculateDistance(dcp.customIp as never, diveCustomIp) < 0.001);
}

// ─── Map display filter ──────────────────────────────────────────────────────
// Store what is HIDDEN, not what is visible — applyDisplayFilter and
// flightGroupOf are the pure logic behind the map's Legend/filter panel.
// MapController/FocusController deliberately never see a filtered array; that
// invariant lives in MapView.tsx and isn't checkable from a flat script, but
// the filter math itself is.

ok('flightGroupOf drops the element suffix: Viper 1-1 -> Viper 1',
   flightGroupOf('Viper 1-1') === 'Viper 1', flightGroupOf('Viper 1-1'));
ok('flightGroupOf drops the element suffix: Hawg 2-4 -> Hawg 2',
   flightGroupOf('Hawg 2-4') === 'Hawg 2', flightGroupOf('Hawg 2-4'));
ok('flightGroupOf returns a callsign with no element suffix unchanged',
   flightGroupOf('Enfield') === 'Enfield', flightGroupOf('Enfield'));
ok('flightGroupOf does not mis-group a bare "-N" suffix with no flight number before it',
   flightGroupOf('Renegade-2') === 'Renegade-2', flightGroupOf('Renegade-2'));

// Fixtures for applyDisplayFilter — two attackers, two attacks, one threat of
// each source, a two-waypoint route. Values are irrelevant; only identity and
// counts matter here.
const dfWaypoints = [
  { id: 'wp1', steerpoint: 1, name: 'IP', type: 'ip', coordinates: { lat: 1, lon: 1 }, elevation_ft: 0 },
  { id: 'wp2', steerpoint: 2, name: 'TGT', type: 'target', coordinates: { lat: 2, lon: 2 }, elevation_ft: 0 },
] as never[];
const dfThreats = [
  { id: 't1', systemId: 's1', position: { lat: 1, lon: 1 }, status: 'active', source: 'mission' },
  { id: 't2', systemId: 's2', position: { lat: 2, lon: 2 }, status: 'active', source: 'planning' },
] as never[];
const dfAttacks = [
  { id: 'a1', targetWaypointId: 'wp2', attackerId: 'pilot1', profileType: 'dive_ccip', profile: {}, weaponId: 'w1', releaseQuantity: 1, releaseMode: 'single', sequenceNumber: 1 },
  { id: 'a2', targetWaypointId: 'wp2', attackerId: 'pilot2', profileType: 'dive_ccip', profile: {}, weaponId: 'w1', releaseQuantity: 1, releaseMode: 'single', sequenceNumber: 2 },
] as never[];
const emptyFilter = { hiddenAttackerIds: [], hiddenThreatSources: [], routeHidden: false } as never;

const dfIdentity = applyDisplayFilter({ attacks: dfAttacks, threats: dfThreats, waypoints: dfWaypoints } as never, emptyFilter);
ok('an empty filter returns every attack, threat and waypoint (visible by default)',
   dfIdentity.attacks.length === 2 && dfIdentity.threats.length === 2 && dfIdentity.waypoints.length === 2,
   `attacks ${dfIdentity.attacks.length} threats ${dfIdentity.threats.length} waypoints ${dfIdentity.waypoints.length}`);

const dfOneHidden = applyDisplayFilter(
  { attacks: dfAttacks, threats: dfThreats, waypoints: dfWaypoints } as never,
  { hiddenAttackerIds: ['pilot1'], hiddenThreatSources: [], routeHidden: false } as never,
);
ok('hiding one flight member leaves the other members\' attacks drawn',
   dfOneHidden.attacks.length === 1 && (dfOneHidden.attacks[0] as { attackerId: string }).attackerId === 'pilot2',
   `remaining: ${dfOneHidden.attacks.map((a: { attackerId: string }) => a.attackerId).join(',')}`);

const dfRouteHidden = applyDisplayFilter(
  { attacks: dfAttacks, threats: dfThreats, waypoints: dfWaypoints } as never,
  { hiddenAttackerIds: [], hiddenThreatSources: [], routeHidden: true } as never,
);
ok('hiding the route empties the drawn waypoints and leaves the source array untouched',
   dfRouteHidden.waypoints.length === 0 && dfWaypoints.length === 2,
   `drawn ${dfRouteHidden.waypoints.length} source ${dfWaypoints.length}`);

const dfMissionHidden = applyDisplayFilter(
  { attacks: dfAttacks, threats: dfThreats, waypoints: dfWaypoints } as never,
  { hiddenAttackerIds: [], hiddenThreatSources: ['mission'], routeHidden: false } as never,
);
ok('hiding mission threats leaves the planning threats drawn',
   dfMissionHidden.threats.length === 1 && (dfMissionHidden.threats[0] as { source: string }).source === 'planning',
   `remaining: ${dfMissionHidden.threats.map((t: { source: string }) => t.source).join(',') || '(none)'}`);

// The flight row's tri-state box. A partly-hidden flight must RESTORE the whole
// flight, not hide the remainder — clicking an indeterminate box gives back
// what is missing. Only a fully visible flight hides.
const flight = ['p1', 'p2'];
useUiStore.getState().resetFilter();
useUiStore.getState().toggleFlight(flight);
const allHiddenNow = useUiStore.getState().hiddenAttackerIds;
ok('toggling a fully visible flight hides every member',
   flight.every((id) => allHiddenNow.includes(id)), `hidden: ${allHiddenNow.join(',') || '(none)'}`);

useUiStore.getState().resetFilter();
useUiStore.getState().toggleAttacker('p1');
useUiStore.getState().toggleFlight(flight);
const afterPartial = useUiStore.getState().hiddenAttackerIds;
ok('toggling a partly hidden flight restores the whole flight, it does not hide the rest',
   afterPartial.length === 0, `hidden: ${afterPartial.join(',') || '(none)'}`);
useUiStore.getState().resetFilter();

// ─── Threat rings on the kneeboard card ──────────────────────────────────────
// The card used to stroke each whole circle and lean on ctx.clip() to trim it
// to the diagram box. Measured off a real exported card, the SA-11 ring came
// out r=1009 px centred 454 px BELOW the box, and the canvas drew the whole
// circle: a red arc across the threat table and the header. Only the spans
// genuinely inside the box are handed to the canvas now.
const ringBox = { x: 0, y: 270, w: 768, h: 468 };
const TWO_PI = Math.PI * 2;
const spanLen = (sp: Array<[number, number]>) => sp.reduce((t, [a0, a1]) => t + (a1 - a0), 0);
const onCircle = (cx: number, cy: number, rr: number, ang: number) => ({ x: cx + rr * Math.cos(ang), y: cy + rr * Math.sin(ang) });
const inRingBox = (p: { x: number; y: number }, b: typeof ringBox) =>
  p.x >= b.x - 1e-6 && p.x <= b.x + b.w + 1e-6 && p.y >= b.y - 1e-6 && p.y <= b.y + b.h + 1e-6;

// The real measured case: centre well below the box, radius large enough that
// the circle's top edge reaches up into the header.
const sa11 = visibleArcSpans(238, 1192, 1009, ringBox);
ok('a ring centred below the card yields only spans inside the diagram box',
   sa11.length > 0 && sa11.every(([a0, a1]) => {
     for (let k = 0; k <= 24; k++) {
       if (!inRingBox(onCircle(238, 1192, 1009, a0 + ((a1 - a0) * k) / 24), ringBox)) return false;
     }
     return true;
   }),
   `${sa11.length} span(s)`);
// The part that was actually escaping: the top of that circle sits at y=183,
// which is up in the THREATS IN AREA table. No span may cover it.
ok('the arc that used to cross the header is not drawn',
   sa11.every(([a0, a1]) => {
     const topAngle = -Math.PI / 2 + TWO_PI; // straight up from the centre
     return !(a0 <= topAngle && topAngle <= a1) && !(a0 <= -Math.PI / 2 && -Math.PI / 2 <= a1);
   }),
   `spans ${sa11.map(([a, b2]) => `${r(a)}..${r(b2)}`).join(' ')}`);

// A box sitting entirely inside a huge engagement ring: the edge is nowhere in
// frame, so nothing draws. The table says you are inside it, in bold red.
ok('a ring that swallows the whole frame draws nothing',
   visibleArcSpans(384, 504, 20000, ringBox).length === 0);
// A ring nowhere near the frame draws nothing either.
ok('a ring entirely outside the frame draws nothing',
   visibleArcSpans(-5000, -5000, 100, ringBox).length === 0);
// A ring wholly inside the frame is drawn whole.
const wholeRing = visibleArcSpans(384, 504, 80, ringBox);
ok('a ring wholly inside the frame is drawn as one full circle',
   wholeRing.length === 1 && Math.abs(spanLen(wholeRing) - TWO_PI) < 1e-9,
   `${wholeRing.length} span(s), ${r(spanLen(wholeRing))} rad`);
// A ring straddling one edge is drawn as a single partial arc, not a circle.
const straddle = visibleArcSpans(384, ringBox.y, 120, ringBox);
ok('a ring straddling the top edge draws a partial arc, not a full circle',
   straddle.length === 1 && spanLen(straddle) > 0.1 && spanLen(straddle) < TWO_PI - 0.1,
   `${r(spanLen(straddle))} rad`);

// ─── Which threats the card leads with ───────────────────────────────────────
// Sorting on distance alone lets a 1.3 nm gun truck parked on the target push a
// live SA-11 off a card that only prints four rows.
const zu23 = { name: 'ZU-23-2', bearing_deg: 90, distance_nm: 0.4, maxRange_nm: 1.35 };
const buk = { name: '9K37 Buk (SA-11)', bearing_deg: 200, distance_nm: 12.0, maxRange_nm: 19 };
const farSam = { name: 'S-75 (SA-2)', bearing_deg: 250, distance_nm: 31.7, maxRange_nm: 24 };
const nearHarmless = { name: 'ZSU-57-2', bearing_deg: 10, distance_nm: 3.0, maxRange_nm: 2.2 };
const ranked = [farSam, nearHarmless, zu23, buk].sort(compareThreatsForCard);
ok('the card leads with threats that can reach the target, nearest first',
   ranked[0].name === 'ZU-23-2' && ranked[1].name.startsWith('9K37 Buk'),
   ranked.map((t) => t.name).join(' | '));
ok('a live SA-11 outranks a closer gun that cannot reach the target',
   ranked.indexOf(buk) < ranked.indexOf(nearHarmless),
   `Buk at ${ranked.indexOf(buk)}, ZSU-57-2 at ${ranked.indexOf(nearHarmless)}`);
ok('out-of-range threats keep their own nearest-first order behind the shooters',
   ranked.indexOf(nearHarmless) < ranked.indexOf(farSam));

// A search radar is not a shooter, however far it can see. DB v3 adds a P-19
// with an 86 nm DETECTION range that sits on the SAM site it serves — treat
// that as an engagement envelope and it tops every card and eats one of the
// four rows a pilot gets.
const p19 = { name: 'P-19 Danube (Flat Face)', bearing_deg: 201, distance_nm: 9.2, maxRange_nm: 86, threatType: 'EWR' };
const withEwr = [p19, buk, zu23].sort(compareThreatsForCard);
ok('a search radar ranks behind anything that can shoot, however far it sees',
   withEwr[withEwr.length - 1].name.startsWith('P-19'),
   withEwr.map((t) => t.name).join(' | '));
ok('the P-19 does not displace a live SA-11 it happens to sit closer than',
   withEwr.indexOf(buk) < withEwr.indexOf(p19),
   `Buk at ${withEwr.indexOf(buk)}, P-19 at ${withEwr.indexOf(p19)}`);

// ─── Picking a flank must not discard a customized profile ───────────────────
// The Ingress/Egress toggles used to call resetToProfile(), which cleared the
// whole hand-edited profile: type a dive angle, pick the other flank, and the
// dive angle silently reverted to the library default.
//
// Note the check turn and action range have to leave the geometry closable —
// 25° at 5.5 nm wants 2.3 nm abeam, but a 37° dive from 9,200 ft rolls in at
// only ~2.0 nm, so describeRunIn returns nothing and no heading is derived.
const customDive = {
  type: 'dive_ccip' as const,
  ipWaypointId: 'ip',
  rollInAltitude_ft: 9200,       // hand-typed, not a library number
  diveAngle_deg: 37,             // hand-typed
  releaseAltitude_ft: 5100,      // hand-typed
  releaseSpeed_ktas: 470,
  pulloutG: 4.5,
  egressDirection: 'right' as const,
  actionRange_nm: 4.5,
  offsetAngle_deg: 20,
  offsetDirection: 'right' as const,
  ingressHeading_deg: 100,       // deliberately stale: must be re-derived
  fuzeMode: 'instant',
  quantity: 1,
  targetElevation_ft: 0,
};

const onLeft = applyFlank(customDive as never, 'left', directBearing) as typeof customDive;
const onRight = applyFlank(customDive as never, 'right', directBearing) as typeof customDive;

ok('changing flank keeps every hand-typed number',
   onLeft.diveAngle_deg === 37 && onLeft.rollInAltitude_ft === 9200 &&
   onLeft.releaseAltitude_ft === 5100 && onLeft.pulloutG === 4.5 &&
   onLeft.actionRange_nm === 4.5 && onLeft.offsetAngle_deg === 20,
   `dive ${onLeft.diveAngle_deg}° roll-in ${onLeft.rollInAltitude_ft} rel ${onLeft.releaseAltitude_ft}`);
ok('changing flank changes the flank', onLeft.offsetDirection === 'left', onLeft.offsetDirection);
ok('the stale attack heading is replaced, not carried over',
   onLeft.ingressHeading_deg !== 100 && Number.isFinite(onLeft.ingressHeading_deg),
   `100° → ${r(onLeft.ingressHeading_deg)}°`);
// The real proof the heading was solved rather than copied: the two flanks sit
// the same angle either side of the direct bearing.
const dLeft = signedHeadingDelta(onLeft.ingressHeading_deg, directBearing);
const dRight = signedHeadingDelta(onRight.ingressHeading_deg, directBearing);
ok('the two flanks are mirror images about the direct bearing',
   Math.abs(dLeft + dRight) < 0.5 && Math.abs(dLeft) > 1,
   `left ${r(dLeft)}° right ${r(dRight)}° off ${directBearing}`);

// A typed egress heading outranks the direction in resolveEgressHeading, so the
// toggle has to clear it or the button lights up and nothing moves.
const withTypedEgress = { ...customDive, egressHeading_deg: 123 };
const egressed = applyEgress(withTypedEgress as never, 'left') as typeof withTypedEgress;
ok('choosing an egress side clears a typed egress heading, so the choice takes effect',
   egressed.egressDirection === 'left' && egressed.egressHeading_deg === undefined,
   `dir ${egressed.egressDirection}, hdg ${String(egressed.egressHeading_deg)}`);
ok('choosing an egress side keeps the rest of the profile',
   egressed.diveAngle_deg === 37 && egressed.actionRange_nm === 4.5);

// ─── Selecting something out of a list ───────────────────────────────────────
// Selection is a view control in uiStore, never missionStore: clicking a row
// must not mark the mission dirty.
useUiStore.getState().clearSelection();
useUiStore.getState().selectAttack('a1');
ok('selecting an attack records it', useUiStore.getState().selectedAttackId === 'a1');

// Only one thing is lit at a time — otherwise two rows glow and nothing says
// which one the camera moved for.
useUiStore.getState().selectThreat('t1');
ok('selecting a threat lets go of the attack',
   useUiStore.getState().selectedThreatId === 't1' && useUiStore.getState().selectedAttackId === null,
   `threat ${String(useUiStore.getState().selectedThreatId)}, attack ${String(useUiStore.getState().selectedAttackId)}`);
useUiStore.getState().selectAttack('a2');
ok('selecting an attack lets go of the threat',
   useUiStore.getState().selectedAttackId === 'a2' && useUiStore.getState().selectedThreatId === null);

// The fly-to is one-shot: the map consumes it and clears it, so selecting the
// same threat twice flies there twice.
useUiStore.getState().selectThreat('t2');
ok('selecting a threat asks the map to fly to it', useUiStore.getState().focusThreatId === 't2');
useUiStore.getState().threatFocused();
ok('the map clears the fly-to once it has moved, leaving the selection alone',
   useUiStore.getState().focusThreatId === null && useUiStore.getState().selectedThreatId === 't2');

// A stale selection must not survive into a different mission.
useUiStore.getState().selectThreat('t3');
useUiStore.getState().resetFilter();
ok('opening a new mission clears the selection',
   useUiStore.getState().selectedThreatId === null &&
   useUiStore.getState().selectedAttackId === null &&
   useUiStore.getState().focusThreatId === null);
useUiStore.getState().resetFilter();

// ─── Any waypoint can be a target ────────────────────────────────────────────
// `Waypoint.type` is inferred from the creator's free-text name, so it is a
// hint and never a gate. Sinai M01 V6 names none of its 55 route points, so
// every one imports as `nav`; a `type === 'target'` filter left the Target
// dropdown empty and the whole mission unplannable.
const routePoint = (steerpoint: number, name: string, type: string) =>
  ({ id: `w${steerpoint}`, steerpoint, name, type,
     coordinates: { lat: 31 + steerpoint / 100, lon: 34 }, elevation_ft: 0 }) as never;

// The Sinai shape: four unnamed nav points, nothing typed as a target.
const unnamedRoute = [
  routePoint(1, '', 'nav'), routePoint(2, '', 'nav'),
  routePoint(3, '', 'nav'), routePoint(4, '', 'nav'),
];
ok('every waypoint is offered as a target, even when all four are unnamed nav points',
   targetCandidates(unnamedRoute).length === 4);

// A route that does name a target still offers everything, not just that one.
const namedRoute = [
  routePoint(3, 'JUNNO', 'nav'), routePoint(1, '', 'nav'),
  routePoint(8, 'TGT1', 'target'), routePoint(7, 'IP', 'ip'),
];
ok('a route containing a real target still offers every waypoint, not only the target',
   targetCandidates(namedRoute).length === 4);
ok('target candidates come back in route order regardless of input order',
   targetCandidates(namedRoute).map((w) => w.steerpoint).join(',') === '1,3,7,8');

// The creator's text is passed through verbatim; our inferred type is not shown.
ok('a named waypoint reads "Waypoint 8 — TGT1"',
   waypointLabel(routePoint(8, 'TGT1', 'target')) === 'Waypoint 8 — TGT1');
ok('an unnamed waypoint reads "Waypoint 1" with no dangling separator',
   waypointLabel(routePoint(1, '', 'nav')) === 'Waypoint 1');
ok('a whitespace-only name is treated as unnamed',
   waypointLabel(routePoint(2, '   ', 'nav')) === 'Waypoint 2');
ok('a free-text name the importer could not classify is still shown verbatim',
   waypointLabel(routePoint(5, 'KILL ZONE', 'nav')) === 'Waypoint 5 — KILL ZONE');

// ─── Waypoint 0 is the spawn point, and is still a waypoint ──────────────────
// Route points are numbered by raw 0-based index, as FragOrders publishes them,
// so waypoint 0 is the ramp/runway/air start. It stays in the list and on the
// map — it is where the first leg is flown from — and, per "type is a hint,
// never a gate", it is still offered in the pickers.
const routeFromTheRamp = [
  routePoint(2, '', 'nav'), routePoint(0, '', 'departure'),
  routePoint(1, '', 'nav'), routePoint(3, '', 'nav'),
];
ok('the departure point reads "Waypoint 0", not a blank or a dangling separator',
   waypointLabel(routePoint(0, '', 'departure')) === 'Waypoint 0');
ok('waypoint 0 sorts first, ahead of the first turnpoint',
   targetCandidates(routeFromTheRamp).map((w) => w.steerpoint).join(',') === '0,1,2,3');
ok('the departure point is still offered as a target — type is a hint, never a gate',
   targetCandidates(routeFromTheRamp).length === 4);
ok('the departure point is still offered as an IP',
   ipCandidates(routeFromTheRamp, 'w2').some((w) => w.steerpoint === 0));

// ─── Any waypoint can be the IP ──────────────────────────────────────────────
// The default is the prior numeric waypoint, but the planner may run in from
// anywhere. The pick has to reach the *geometry*, not just the drawn line —
// before this, autoBuildAttack always called inferIp and a chosen IP moved the
// picture while the computed run-in silently disagreed with it.
const ipEast  = { id: 'ip-e', steerpoint: 5, name: 'EAST',  type: 'nav',
                  coordinates: calculateDestination(tgt, 90, 12), elevation_ft: 3000 };
const ipNorth = { id: 'ip-n', steerpoint: 6, name: 'NORTH', type: 'nav',
                  coordinates: calculateDestination(tgt, 0, 12), elevation_ft: 3000 };
const ipLate  = { id: 'ip-l', steerpoint: 9, name: 'LATE',  type: 'nav',
                  coordinates: calculateDestination(tgt, 180, 12), elevation_ft: 3000 };
const ipMission = { waypoints: [ipEast, ipNorth, wpTgt, ipLate], flightMembers: [pilot],
                    threats: [], attacks: [] };

ok('the default IP is the prior numeric waypoint',
   resolveIp(ipMission as never, wpTgt as never, undefined)?.id === 'ip-n');
ok('an explicit pick beats the prior numeric waypoint',
   resolveIp(ipMission as never, wpTgt as never, 'ip-e')?.id === 'ip-e');
ok('a waypoint LATER in the route may be chosen as the IP',
   resolveIp(ipMission as never, wpTgt as never, 'ip-l')?.id === 'ip-l');
ok('the target itself cannot be its own IP — falls back to the inferred one',
   resolveIp(ipMission as never, wpTgt as never, wpTgt.id)?.id === 'ip-n');
ok('a deleted IP falls back to the inferred one rather than losing the run-in',
   resolveIp(ipMission as never, wpTgt as never, 'gone')?.id === 'ip-n');

// The pick must change the COMPUTED run-in, not only what is drawn.
const buildAuto = autoBuildAttack({
  mission: ipMission, targetWaypointId: wpTgt.id, attackerId: pilot.id,
  weapons: [gbu31], profiles: [jdamLevel], threatSystems: [],
} as never);
const buildEast = autoBuildAttack({
  mission: ipMission, targetWaypointId: wpTgt.id, attackerId: pilot.id,
  weapons: [gbu31], profiles: [jdamLevel], threatSystems: [],
  overrides: { ipWaypointId: 'ip-e' },
} as never);
// NORTH is 12 nm due north of the target, so the run-in tracks 180°;
// EAST is 12 nm due east, so it tracks 270°.
ok('the default IP drives the computed run-in bearing (NORTH → 180°)',
   Math.abs((buildAuto.directBearing ?? 0) - 180) < 1, String(r(buildAuto.directBearing ?? 0)));
ok('choosing a different IP moves the computed run-in bearing (EAST → 270°)',
   Math.abs((buildEast.directBearing ?? 0) - 270) < 1, String(r(buildEast.directBearing ?? 0)));
ok('the chosen IP is written onto the built profile, so the map and card agree',
   (buildEast.attack?.profile as { ipWaypointId?: string })?.ipWaypointId === 'ip-e');

// A custom point beats even an explicitly chosen waypoint.
const customIpPoint = calculateDestination(tgt, 45, 9);
const buildCustom = autoBuildAttack({
  mission: ipMission, targetWaypointId: wpTgt.id, attackerId: pilot.id,
  weapons: [gbu31], profiles: [jdamLevel], threatSystems: [],
  overrides: { ipWaypointId: 'ip-e', customIp: customIpPoint },
} as never);
ok('a custom IP wins over an explicitly chosen waypoint — moves the computed run-in bearing (→ 225°)',
   Math.abs((buildCustom.directBearing ?? 0) - 225) < 1, String(r(buildCustom.directBearing ?? 0)));
const bcp = buildCustom.attack?.profile as { customIp?: { lat: number; lon: number }; ipWaypointId?: string } | undefined;
ok('the custom point is written onto the built profile as customIp, with ipWaypointId cleared',
   bcp?.ipWaypointId === undefined && bcp?.customIp != null && calculateDistance(bcp.customIp as never, customIpPoint) < 0.001);
ok('a non-finite override customIp falls back to the chosen waypoint rather than breaking the build',
   autoBuildAttack({
     mission: ipMission, targetWaypointId: wpTgt.id, attackerId: pilot.id,
     weapons: [gbu31], profiles: [jdamLevel], threatSystems: [],
     overrides: { ipWaypointId: 'ip-e', customIp: { lat: NaN, lon: 0 } },
   } as never).attack != null);

// The picker offers everything except the target itself, in route order.
ok('IP candidates are every waypoint except the target, in route order',
   ipCandidates([wpTgt, ipLate, ipEast, ipNorth] as never, wpTgt.id)
     .map((w) => w.id).join(',') === 'ip-e,ip-n,ip-l');

// Reopening a saved attack must not look hard-pinned. autoBuildAttack writes
// the resolved IP onto every profile it builds, so a stored id is not evidence
// the planner chose anything.
ok('a stored IP equal to the inferred one opens as Auto, so it keeps tracking the route',
   initialIpOverride(ipMission as never, wpTgt as never, 'ip-n') === undefined);
ok('a stored IP the planner really chose opens as that override',
   initialIpOverride(ipMission as never, wpTgt as never, 'ip-e') === 'ip-e');
ok('an attack with no stored IP opens as Auto',
   initialIpOverride(ipMission as never, wpTgt as never, undefined) === undefined);
ok('with no target there is nothing to infer from, so no override',
   initialIpOverride(ipMission as never, undefined, 'ip-e') === undefined);

// ─── Kneeboard basemap: tile arithmetic, and tiles landing where the card draws ──
// Reference values are from an independent Python calculation, not this code.
const origin = lonLatToTile(0, 0, 1);
ok('tile maths: (0°, 0°) at zoom 1 is the corner of tile (1, 1)', Math.abs(origin.x - 1) < 1e-9 && Math.abs(origin.y - 1) < 1e-9, JSON.stringify(origin));
const sinaiTile = lonLatToTile(31.0, 34.5, 14);
ok('tile maths: N31 E34.5 at zoom 14 is 9762.133 / 6706.811 (independent Python calc)',
   Math.abs(sinaiTile.x - 9762.1333) < 0.001 && Math.abs(sinaiTile.y - 6706.8113) < 0.001, JSON.stringify(sinaiTile));
const nttrTile = lonLatToTile(37.15, -116.83, 13);
ok('tile maths: N37.15 W116.83 at zoom 13 is 1437.468 / 3184.295 (independent Python calc)',
   Math.abs(nttrTile.x - 1437.4684) < 0.001 && Math.abs(nttrTile.y - 3184.2946) < 0.001, JSON.stringify(nttrTile));
const cornerBack = lonLatToTile(tileNwCorner(9762, 6706, 14).lat, tileNwCorner(9762, 6706, 14).lon, 14);
ok('tile maths: a tile corner converts back to exactly that tile', Math.abs(cornerBack.x - 9762) < 1e-6 && Math.abs(cornerBack.y - 6706) < 1e-6, JSON.stringify(cornerBack));
const sinaiNw = tileNwCorner(9762, 6706, 14), sinaiSe = tileNwCorner(9763, 6707, 14);
ok('tile maths: tile 9762/6706 brackets N31 E34.5', sinaiNw.lat >= 31 && sinaiSe.lat <= 31 && sinaiNw.lon <= 34.5 && sinaiSe.lon >= 34.5);

const zooms = [20, 40, 80, 160, 320, 640].map((pxPerNm) => chooseZoom(pxPerNm, 31));
ok('chooseZoom: more pixels per mile never picks a coarser zoom', zooms.every((z, i) => i === 0 || z >= zooms[i - 1]) && zooms[5] > zooms[0], zooms.join(','));
const z160 = chooseZoom(160, 31);
ok('chooseZoom: tiles at least as detailed as the card (drawn shrunk, never stretched)', metresPerTilePixel(31, z160) <= 1852 / 160, `z${z160}`);
ok('chooseZoom: and the lowest zoom that is — one coarser would be stretched', metresPerTilePixel(31, z160 - 1) > 1852 / 160, `z${z160}`);
ok('chooseZoom: clamps at both ends, and a nonsense scale falls back to the lowest',
   chooseZoom(0.001, 31) === MIN_BASEMAP_ZOOM && chooseZoom(1e7, 31) === MAX_BASEMAP_ZOOM && chooseZoom(NaN, 31) === MIN_BASEMAP_ZOOM);

const coverNw = { lat: 31.05, lon: 34.4 }, coverSe = { lat: 30.95, lon: 34.6 };
const covering = tilesCovering(coverNw, coverSe, 14);
const hasTileOf = (lat: number, lon: number) => {
  const f = lonLatToTile(lat, lon, 14);
  return covering.some((t) => t.x === Math.floor(f.x) && t.y === Math.floor(f.y));
};
ok('tilesCovering: includes the tile under every corner of the frame',
   hasTileOf(coverNw.lat, coverNw.lon) && hasTileOf(coverNw.lat, coverSe.lon) && hasTileOf(coverSe.lat, coverNw.lon) && hasTileOf(coverSe.lat, coverSe.lon), `${covering.length} tiles`);
const zoomedOut = planBasemap({ lat: 40, lon: 20 }, { lat: 20, lon: 50 }, 160, 30);
ok('planBasemap: a frame zoomed far out steps down to a sane tile count instead of fetching thousands',
   zoomedOut.length > 0 && zoomedOut.length <= MAX_BASEMAP_TILES, `${zoomedOut.length} tiles at z${zoomedOut[0]?.z}`);

// The real test: a point on a tile, placed the way drawBasemap places tiles,
// must land where the card's own projection puts that point. Checked across a
// 9×9 grid over the whole north-up box, at NTTR and at Sinai latitudes.
const cardBox = { x: 0, y: 300, w: 768, h: 470 };
const sinaiTgt = { lat: 30.6, lon: 34.8 };
const sinaiIpWp = { ...ipWp, coordinates: calculateDestination(sinaiTgt, (direct + 180) % 360, 12) };
const sinaiTgtWp = { ...tgtWp, coordinates: sinaiTgt };
const sinaiPicture = buildAttackPicture(distantAttack, anchorOf(sinaiIpWp, sinaiTgtWp), sinaiTgtWp);
for (const [theatre, pic] of [['NTTR', picture], ['Sinai', sinaiPicture]] as const) {
  const view = planViewTransform(pic!, cardBox)!;
  const nw = view.fromPx(cardBox.x, cardBox.y), se = view.fromPx(cardBox.x + cardBox.w, cardBox.y + cardBox.h);
  const tiles = planBasemap(nw, se, view.scale, view.target.lat);
  const z = tiles[0].z;
  let worstPx = 0, worstRoundTrip = 0;
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const px = cardBox.x + (cardBox.w * i) / 8, py = cardBox.y + (cardBox.h * j) / 8;
      const p = view.fromPx(px, py);
      const back = view.toPx(p);
      worstRoundTrip = Math.max(worstRoundTrip, Math.hypot(back[0] - px, back[1] - py));
      const f = lonLatToTile(p.lat, p.lon, z);
      const rect = tileRectPx({ x: Math.floor(f.x), y: Math.floor(f.y), z }, view.toPx);
      const onTile: [number, number] = [rect.x + (f.x - Math.floor(f.x)) * rect.w, rect.y + (f.y - Math.floor(f.y)) * rect.h];
      worstPx = Math.max(worstPx, Math.hypot(onTile[0] - back[0], onTile[1] - back[1]));
    }
  }
  ok(`${theatre} card: fromPx and toPx are inverses`, worstRoundTrip < 1e-6, worstRoundTrip.toExponential(1));
  ok(`${theatre} card: map tiles land within 1 px of the card's projection across the whole box`, worstPx < 1, `worst ${worstPx.toFixed(2)} px, z${z}, ${tiles.length} tiles, ${view.scale.toFixed(0)} px/nm`);
  const rects = tiles.map((t) => tileRectPx(t, view.toPx));
  ok(`${theatre} card: the tiles cover the box to its edges — no bare strip`,
     Math.min(...rects.map((r) => r.x)) <= cardBox.x && Math.min(...rects.map((r) => r.y)) <= cardBox.y &&
     Math.max(...rects.map((r) => r.x + r.w)) >= cardBox.x + cardBox.w && Math.max(...rects.map((r) => r.y + r.h)) >= cardBox.y + cardBox.h);
}

const report = (drawn: number, failed: number, pending: number) => ({ tiles: Array(drawn + failed + pending).fill({ x: 0, y: 0, z: 1 }), drawn, failed, pending });
ok('mapStatusOf: every tile drawn is ok, some is partial, none is unavailable',
   mapStatusOf(report(4, 0, 0), true) === 'ok' && mapStatusOf(report(3, 1, 0), true) === 'partial' && mapStatusOf(report(0, 2, 2), true) === 'unavailable');
ok('mapStatusOf: switched off says off, and a card with no picture says none',
   mapStatusOf(report(4, 0, 0), false) === 'off' && mapStatusOf(undefined, true) === 'none');

// ─── Export to DCS: each aircraft type's cards go to that type's folder ────────
const exportMission = {
  flightMembers: [
    { id: 'v11', aircraftId: 'f16c' },
    { id: 'h11', aircraftId: 'a10c' },
    { id: 'v12', aircraftId: 'f16c' },
  ],
  attacks: [
    { id: 'atk1', attackerId: 'v11' },
    { id: 'atk2', attackerId: 'h11' },
    { id: 'atk3', attackerId: 'v12' },
    { id: 'atk4', attackerId: 'gone' },
  ],
} as never;
const plan = groupAttacksByAircraft(exportMission);
ok('export groups: one folder per aircraft type, in the order each first appears',
   plan.groups.map((g) => g.aircraftId).join(',') === 'f16c,a10c', plan.groups.map((g) => g.aircraftId).join(','));
ok('export groups: both Vipers\' cards go together, the Hog\'s on its own — not all into the first attack\'s folder',
   plan.groups[0].attacks.map((a) => a.id).join(',') === 'atk1,atk3' && plan.groups[1].attacks.map((a) => a.id).join(',') === 'atk2');
ok('export groups: an attack whose pilot left the flight is set aside, not exported somewhere',
   plan.orphans.map((a) => a.id).join(',') === 'atk4');
const dbAircraft = [{ id: 'av8b', name: 'AV-8B Harrier', kneeboard_path: 'AV8BNA' }];
ok('folder hint comes from the database, not a hard-coded list (av8b → AV8BNA, not AV8B)',
   aircraftFolderInfo('av8b', dbAircraft).folderHint === 'AV8BNA' && aircraftFolderInfo('av8b', dbAircraft).name === 'AV-8B Harrier');
ok('an aircraft the database does not know still gets a name and a hint',
   aircraftFolderInfo('mig21', dbAircraft).name === 'mig21' && aircraftFolderInfo('mig21', dbAircraft).folderHint === 'mig21');

const takenNames = new Set<string>();
const claimed = ['Viper_1-1_TGT.png', 'Viper_1-1_TGT.png', 'viper_1-1_tgt.png', 'Viper_1-2_TGT.png'].map((n) => claimFilename(n, takenNames));
ok('two cards with the same name get _2, _3 instead of overwriting — case-insensitively, as Windows and macOS folders are',
   claimed.join(',') === 'Viper_1-1_TGT.png,Viper_1-1_TGT_2.png,viper_1-1_tgt_3.png,Viper_1-2_TGT.png', claimed.join(','));

// ─── A shared mission file is untrusted until checked ─────────────────────────
const goodMission = {
  id: 'm1', name: 'Op Sentinel', date: '2026-09-12', theater: 'sinai', bullseye: { lat: 30.5, lon: 34.5 },
  notes: '', createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z',
  waypoints: [{ id: 'w0', steerpoint: 0, name: 'WP0', type: 'departure', coordinates: { lat: 30.776, lon: 34.667 }, elevation_ft: 102 }],
  threats: [{ id: 't1', systemId: 'sa6', position: { lat: 31.0, lon: 34.2 }, status: 'active', source: 'mission' }],
  flightMembers: [{ id: 'f1', callsign: 'Springfield 1-1', position: 1, role: 'flight_lead', aircraftId: 'f16c', loadout: [] }],
  attacks: [{ id: 'a1', targetWaypointId: 'w0', attackerId: 'f1', profileType: 'dive_ccip', profile: { type: 'dive_ccip' }, weaponId: 'mk84', releaseQuantity: 1, releaseMode: 'single', sequenceNumber: 1 }],
};
ok('a well-formed saved mission passes the file check', validateMission(goodMission).ok, JSON.stringify(validateMission(goodMission)));
const payload = '<img src=x onerror=alert(1)>';
const hostile = structuredClone(goodMission);
(hostile.waypoints[0] as Record<string, unknown>).steerpoint = payload;
const hostileCheck = validateMission(hostile);
ok('a steerpoint carrying HTML is refused before it can reach the map',
   !hostileCheck.ok && hostileCheck.problems.some((p) => p.includes('steerpoint')), JSON.stringify(hostileCheck));
const noPosition = structuredClone(goodMission);
(noPosition.threats[0] as Record<string, unknown>).position = { lat: null, lon: 34 };
ok('a threat with no real position is refused', !validateMission(noPosition).ok);
const missionWithGoodCustomIp = structuredClone(goodMission);
(missionWithGoodCustomIp.attacks[0].profile as Record<string, unknown>).customIp = { lat: 30.8, lon: 34.7 };
ok('an attack with a well-formed custom IP passes the file check', validateMission(missionWithGoodCustomIp).ok, JSON.stringify(validateMission(missionWithGoodCustomIp)));
const missionWithHostileCustomIp = structuredClone(goodMission);
(missionWithHostileCustomIp.attacks[0].profile as Record<string, unknown>).customIp = { lat: '<img src=x onerror=alert(1)>', lon: 34 };
const hostileIpCheck = validateMission(missionWithHostileCustomIp);
ok('an attack with a malicious custom IP is refused before it can reach the map',
   !hostileIpCheck.ok && hostileIpCheck.problems.some((p) => p.includes('custom IP')), JSON.stringify(hostileIpCheck));
ok('a profile with no customIp at all is still accepted (most attacks have none)',
   validateMission(goodMission).ok);
ok('something that is not a mission at all is refused',
   !validateMission([]).ok && !validateMission(null).ok && !validateMission({ ...goodMission, attacks: 'nope' }).ok);
const olderSave = structuredClone(goodMission) as Record<string, unknown>;
delete (olderSave.attacks as Record<string, unknown>[])[0].sequenceNumber;
delete (olderSave.waypoints as Record<string, unknown>[])[0].elevation_ft;
ok('an older save missing optional fields still opens', validateMission(olderSave).ok, JSON.stringify(validateMission(olderSave)));
const brokenEverywhere = structuredClone(goodMission) as Record<string, unknown>;
brokenEverywhere.waypoints = Array.from({ length: 20 }, () => ({ ...goodMission.waypoints[0], id: 7 }));
const brokenCheck = validateMission(brokenEverywhere);
ok('a file broken everywhere lists a handful of problems, not hundreds',
   !brokenCheck.ok && brokenCheck.problems.length === 7 && brokenCheck.problems[6] === '…and 14 more', JSON.stringify(brokenCheck));
ok('escapeHtml defuses markup, quotes and ampersands',
   escapeHtml(payload) === '&lt;img src=x onerror=alert(1)&gt;' && escapeHtml(`"'&`) === '&quot;&#39;&amp;');
ok('escapeHtml leaves an ordinary steerpoint number alone', escapeHtml(12) === '12');

// ─── IP anchor: precedence, round trip, and safety (lib/ipAnchor.ts) ──────────
// A custom IP is the whole point of issue #4 — every profile type must agree
// on precedence (custom > chosen waypoint > inferred prior waypoint) and on
// what a broken or coincident-with-target point does, since this is the one
// place a shared mission file's numbers get drawn straight onto the map.
const anchorTgt = wp('tgt-a', 5, 'target', 32.0, 35.0);
const anchorPrior = wp('prior-a', 4, 'nav', 32.05, 35.02);
const anchorPicked = wp('picked-a', 2, 'nav', 31.9, 34.9);
const anchorWps = [anchorPrior, anchorPicked, anchorTgt];
const anchorCustomPt = calculateDestination(anchorTgt.coordinates, 270, 8);

const anchorCustom = resolveIpAnchor(anchorWps as never, anchorTgt as never, { ipWaypointId: anchorPicked.id, customIp: anchorCustomPt });
ok('resolveIpAnchor: a custom point wins over a chosen waypoint',
   anchorCustom?.source === 'custom' && calculateDistance(anchorCustom.point, anchorCustomPt) < 0.001);

const anchorWaypoint = resolveIpAnchor(anchorWps as never, anchorTgt as never, { ipWaypointId: anchorPicked.id });
ok('resolveIpAnchor: an explicit waypoint wins over the inferred one',
   anchorWaypoint?.source === 'waypoint' && anchorWaypoint.waypoint?.id === anchorPicked.id);

const anchorAuto = resolveIpAnchor(anchorWps as never, anchorTgt as never, {});
ok('resolveIpAnchor: falls back to the prior numeric waypoint when nothing is chosen',
   anchorAuto?.source === 'auto' && anchorAuto.waypoint?.id === anchorPrior.id);

const anchorNaN = resolveIpAnchor(anchorWps as never, anchorTgt as never, { ipWaypointId: anchorPicked.id, customIp: { lat: NaN, lon: 35 } });
ok('resolveIpAnchor: a non-finite custom point falls back to the chosen waypoint, never crashes',
   anchorNaN?.source === 'waypoint' && anchorNaN.waypoint?.id === anchorPicked.id);

const anchorOnTarget = resolveIpAnchor(anchorWps as never, anchorTgt as never, { customIp: anchorTgt.coordinates });
ok('resolveIpAnchor: a custom point on top of the target is not usable, falls back to auto',
   anchorOnTarget?.source === 'auto');

ok('resolveIpAnchor: a custom anchor reads "Custom IP" / "CUSTOM IP"',
   anchorCustom?.label === 'Custom IP' && anchorCustom?.shortLabel === 'CUSTOM IP');
ok('resolveIpAnchor: a waypoint anchor names the STPT',
   anchorWaypoint?.shortLabel === `STPT ${anchorPicked.steerpoint}` && anchorWaypoint?.label === waypointLabel(anchorPicked as never));

ok('initialIpChoice: a stored custom point opens Custom',
   initialIpChoice(anchorWps as never, anchorTgt as never, { customIp: anchorCustomPt }).mode === 'custom');
ok('initialIpChoice: a stored id equal to the inferred waypoint opens Auto',
   initialIpChoice(anchorWps as never, anchorTgt as never, { ipWaypointId: anchorPrior.id }).mode === 'auto');
ok('initialIpChoice: a stored id different from the inferred waypoint opens the waypoint mode',
   initialIpChoice(anchorWps as never, anchorTgt as never, { ipWaypointId: anchorPicked.id }).mode === 'waypoint');

const anchorAttack = { targetWaypointId: anchorTgt.id, profile: { type: 'dive_ccip', customIp: anchorCustomPt } };
ok('attackIpAnchor: reads the anchor straight off a saved attack',
   attackIpAnchor(anchorWps as never, anchorAttack as never)?.source === 'custom');

// Point <-> radial/distance round trip, including the 0/360 wrap and high latitude.
for (const [lat, radial, dist] of [[32.0, 45, 6.2], [60.0, 358, 12.4], [-10, 179.5, 3.1], [32.0, 0.4, 2.0]] as const) {
  const origin = { lat, lon: 10 };
  const pt = ipFromRadial(origin, radial, dist);
  const back = ipRadial(origin, pt);
  ok(`ipRadial/ipFromRadial round-trip at lat ${lat}, radial ${radial}`,
     Math.abs(((back.radial_deg - radial + 540) % 360) - 180) < 0.01 && Math.abs(back.distance_nm - dist) < 0.001,
     `${r(back.radial_deg)}/${r(back.distance_nm)}`);
}

// ipPointFromFields never returns a NaN coordinate — the M8 failure mode a
// cleared or half-typed Customize field used to risk.
for (const [radial, distance] of [['', ''], ['abc', '5'], ['090', '0'], ['090', '-3'], ['090', 'abc']] as const) {
  ok(`ipPointFromFields('${radial}', '${distance}') is undefined, never NaN`,
     ipPointFromFields(anchorTgt.coordinates, radial, distance) === undefined);
}
ok('ipPointFromFields parses a good pair', ipPointFromFields(anchorTgt.coordinates, '090', '5.0') !== undefined);

// ipFieldsFor -> ipPointFromFields -> ipFieldsFor is stable: no display drift on blur.
const anchorFields1 = ipFieldsFor(anchorTgt.coordinates, anchorCustomPt);
const anchorRoundTripped = ipPointFromFields(anchorTgt.coordinates, anchorFields1.radial, anchorFields1.distance)!;
const anchorFields2 = ipFieldsFor(anchorTgt.coordinates, anchorRoundTripped);
ok('ipFieldsFor is stable across a round trip through the text fields',
   anchorFields1.radial === anchorFields2.radial && anchorFields1.distance === anchorFields2.distance,
   `${anchorFields1.radial}/${anchorFields1.distance} vs ${anchorFields2.radial}/${anchorFields2.distance}`);

ok('seedCustomIp: seeds from the current anchor when there is one',
   calculateDistance(seedCustomIp(anchorTgt as never, anchorWaypoint), anchorWaypoint!.point) < 0.001);
const anchorSeeded = seedCustomIp(anchorTgt as never, undefined);
ok('seedCustomIp: seeds 10 nm north of the target when there is no current anchor',
   Math.abs(calculateDistance(anchorSeeded, anchorTgt.coordinates) - 10) < 0.01 &&
   Math.abs(calculateBearing(anchorTgt.coordinates, anchorSeeded)) < 0.01);

// inferIp/resolveIp/initialIpOverride (autoBuildAttack.ts) are now thin
// delegates — must still behave exactly as before.
ok('inferIp delegates to inferIpFrom',
   inferIp({ waypoints: anchorWps } as never, anchorTgt as never)?.id === inferIpFrom(anchorWps as never, anchorTgt as never)?.id);
ok('resolveIp delegates to resolveIpAnchor',
   resolveIp({ waypoints: anchorWps } as never, anchorTgt as never, anchorPicked.id)?.id === anchorPicked.id);
ok('initialIpOverride delegates to initialIpOverrideFrom',
   initialIpOverride({ waypoints: anchorWps } as never, anchorTgt as never, anchorPrior.id) === undefined &&
   initialIpOverride({ waypoints: anchorWps } as never, anchorTgt as never, anchorPicked.id) === anchorPicked.id);

// ---------------------------------------------------------------------------
// M8: a NaN in a profile (a cleared Customize field) must be an error, so Save
// is blocked and the card flags it — never skipped as "not a number, no check".
// ---------------------------------------------------------------------------
const cleanDive = { type: 'dive_ccip', ingressHeading_deg: 200, rollInAltitude_ft: 8000, diveAngle_deg: 30, releaseAltitude_ft: 4500, releaseSpeed_ktas: 450, pulloutG: 4, egressDirection: 'right' };
ok('attackChecks: a clean dive profile has no errors',
   !hasErrors(runAttackChecks({ profileType: 'dive_ccip', profile: cleanDive as never })));
for (const key of ['releaseAltitude_ft', 'rollInAltitude_ft', 'diveAngle_deg', 'releaseSpeed_ktas', 'ingressHeading_deg'] as const) {
  const nanChecks = runAttackChecks({ profileType: 'dive_ccip', profile: { ...cleanDive, [key]: NaN } as never });
  ok(`attackChecks: dive ${key} = NaN is an error`, hasErrors(nanChecks), JSON.stringify(nanChecks));
}
const cleanLevel = { type: 'level_ccrp', ingressHeading_deg: 200, releaseAltitude_ft: 3000, releaseSpeed_ktas: 450, egressDirection: 'right' };
ok('attackChecks: level releaseAltitude_ft = NaN is an error',
   hasErrors(runAttackChecks({ profileType: 'level_ccrp', profile: { ...cleanLevel, releaseAltitude_ft: NaN } as never, targetElevation_ft: 0 })));
ok('attackChecks: an absent optional field (egress heading) is not an error',
   !hasErrors(runAttackChecks({ profileType: 'level_ccrp', profile: { ...cleanLevel, egressHeading_deg: undefined } as never, targetElevation_ft: 0 })));
