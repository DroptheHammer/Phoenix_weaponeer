import {
  applyAngleOff,
  angleOffOf,
  isStraightIn,
  signedHeadingDelta,
  actionPointLeg,
  joinPointOnLeg,
  attackHeadingFromActionPoint,
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
import { inferIp } from '../src/lib/autoBuildAttack';
import { calculateBearing, calculateDistance, calculateDestination } from '../src/lib/coordinates';
import { buildAttackPicture, pictureFitPoints } from '../src/lib/attackPicture';
import { edgeCrossing } from '../src/lib/labelLayout';

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
const picture = buildAttackPicture(distantAttack, ipWp, tgtWp);
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
const diveWithIp = buildAttackPicture(distantAttack, ipWp, tgtWp);
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
const levelWithIp = buildAttackPicture(levelAttack, ipWp, tgtWp);
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
