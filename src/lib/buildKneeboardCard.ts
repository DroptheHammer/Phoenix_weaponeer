import type { KneeboardCard, KneeboardThreatItem, KneeboardDiagramData } from '../types/kneeboard.types';
import type { Mission } from '../types/mission.types';
import type { Attack } from '../types/attack.types';
import type { DbWeapon, FuzeOption } from '../types/weapon.types';
import { resolveEgressHeading, type Turn } from './attackGeometry';
import { inferIp } from './autoBuildAttack';
import { popupPlanOf } from './popupPlanning';
import { describeRunIn } from './runIn';
import { buildAttackPicture, buildSideProfile } from './attackPicture';
import { runAttackChecks } from './attackChecks';
import { getTheaterInfo } from '../stores/theaterStore';
import { compareThreatsForCard, CARD_THREAT_POOL } from './cardThreats';

// Minimal threat system shape (matches what App.tsx gets from the DB)
export interface ThreatSystemInfo {
  id: string;
  name: string;
  nato_designation?: string | null;
  threat_type?: string;
  max_range_nm: number;
}

// ─── Geo helpers ──────────────────────────────────────────────────────────────

function bearingDeg(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function distanceNm(
  p1: { lat: number; lon: number },
  p2: { lat: number; lon: number },
): number {
  const R = 3440.065; // Earth radius in nm
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Coordinate formatting ────────────────────────────────────────────────────

function formatDDMMSS(deg: number, isLat: boolean): string {
  const hemi = isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minFull = (abs - d) * 60;
  const m = Math.floor(minFull);
  const s = Math.round((minFull - m) * 60);
  const dStr = isLat ? d.toString().padStart(2, '0') : d.toString().padStart(3, '0');
  return `${hemi} ${dStr}°${m.toString().padStart(2, '0')}'${s.toString().padStart(2, '0')}"`;
}

function formatCoords(lat: number, lon: number): string {
  return `${formatDDMMSS(lat, true)} ${formatDDMMSS(lon, false)}`;
}

// ─── Run-in geometry for the card ─────────────────────────────────────────────

/**
 * How the jet gets from the route onto the target, reduced to what a pilot
 * reads: the route heading, the action point and check turn, the heading of
 * the offset leg, where to turn onto the target, which way, and onto what.
 */
interface RunInGeo {
  ipName?: string;
  /** Bearing IP → target: the route leg */
  directBearing?: number;
  actionRange_nm?: number;
  offsetTurn?: Turn;
  /** Heading flown on the offset leg */
  approachHeading?: number;
  attackHeading?: number;
  /** The turn actually flown at the roll-in / pull-down / run-in start */
  turn?: Turn;
  /** Range from the target at which that turn happens */
  joinRange_nm?: number;
  joinLabel?: string;
  closes?: boolean;
}

function describeRunInForCard(mission: Mission, attack: Attack, target: Mission['waypoints'][number]): RunInGeo {
  const p = attack.profile;
  const ipId = (p as { ipWaypointId?: string }).ipWaypointId;
  const ip = (ipId ? mission.waypoints.find((w) => w.id === ipId) : undefined) ?? inferIp(mission, target);
  if (!ip) return {};
  const directBearing = bearingDeg(ip.coordinates, target.coordinates);
  const geo: RunInGeo = { ipName: `STPT ${ip.steerpoint} ${ip.name}`, directBearing };
  const story = describeRunIn(p, directBearing, target.elevation_ft ?? 0);
  if (!story) {
    // A save that predates the action point: the heading is all we know.
    const heading = (p as { ingressHeading_deg?: number }).ingressHeading_deg ?? (p as { runInHeading_deg?: number }).runInHeading_deg;
    return { ...geo, attackHeading: heading };
  }
  return {
    ...geo,
    actionRange_nm: story.actionRange_nm,
    offsetTurn: story.offsetTurn,
    approachHeading: story.approachHeading,
    attackHeading: story.attackHeading,
    turn: story.joinTurn,
    joinRange_nm: story.joinRange_nm,
    joinLabel: story.joinLabel,
    closes: story.closes,
  };
}

// ─── Attack param formatting ──────────────────────────────────────────────────

function formatAttackParams(attack: Attack, geo: RunInGeo): Record<string, string> {
  const p = attack.profile;
  const params: Record<string, string> = {};
  if (geo.offsetTurn && geo.actionRange_nm != null) {
    params['Action Point'] = `${geo.actionRange_nm} nm · turn ${geo.offsetTurn.direction.toUpperCase()} ${Math.round(geo.offsetTurn.deg)}°`;
    params['Approach HDG'] = fmtHeading(geo.approachHeading);
  }
  if (geo.attackHeading != null) params['Attack HDG'] = fmtHeading(geo.attackHeading);
  if (geo.turn && geo.joinRange_nm != null) {
    params[geo.joinLabel === 'pull down' ? 'Pull-down' : geo.joinLabel === 'roll in' ? 'Roll-in' : 'Run-in'] =
      `${geo.joinRange_nm.toFixed(1)} nm · ${geo.turn.direction.toUpperCase()} ${Math.round(geo.turn.deg)}°`;
  }

  if (p.type === 'popup_ccip') {
    const plan = popupPlanOf(p);
    params['Run-in'] = `${p.runInAltitude_ft.toLocaleString()}' AGL @ ${p.runInSpeed_ktas} KTAS`;
    params['Pop'] = `${p.popDistance_nm.toFixed(1)} nm · ${plan.climbAngle_deg}° climb`;
    params['Pull-down'] = `${Math.round(plan.pullDownAltitude_ft).toLocaleString()}' · apex ${Math.round(plan.apexAltitude_ft).toLocaleString()}'`;
    params['Track'] = `${Math.round(plan.trackAltitude_ft).toLocaleString()}' · ${plan.trackingTime_s} s · AOD ${Math.round(plan.aimOff_ft).toLocaleString()}'`;
    params['Dive Angle'] = `${p.diveAngle_deg}°`;
    params['Release by'] = `${p.releaseAltitude_ft.toLocaleString()}' AGL`;
    params['Hard Deck'] = `${p.minAltitude_ft.toLocaleString()}' AGL`;
  } else if (p.type === 'dive_ccip') {
    params['Roll-in Alt'] = `${p.rollInAltitude_ft.toLocaleString()}' AGL`;
    params['Dive Angle'] = `${p.diveAngle_deg}°`;
    params['Release Alt'] = `${p.releaseAltitude_ft.toLocaleString()}' AGL`;
    params['Release Spd'] = `${p.releaseSpeed_ktas} KTAS`;
    params['Pullout G'] = `${p.pulloutG}G`;
  } else if (p.type === 'level_ccrp') {
    params['Release Alt'] = `${p.releaseAltitude_ft.toLocaleString()}' MSL`;
    params['Release Spd'] = `${p.releaseSpeed_ktas} KTAS`;
    params['Egress HDG'] = `${Math.round(
      resolveEgressHeading({ egressDirection: p.egressDirection ?? 'straight', egressHeading_deg: p.egressHeading_deg }, p.ingressHeading_deg),
    )}°`;
  } else if (p.type === 'loft_ccrp') {
    params['Ingress HDG'] = `${p.ingressHeading_deg}°`;
    params['Ingress Alt'] = `${p.ingressAltitude_ft.toLocaleString()}' MSL`;
    params['Pull-up Dist'] = `${p.pullUpDistance_nm.toFixed(1)} nm`;
    params['Pull-up Angle'] = `${p.pullUpAngle_deg}°`;
    params['Release Alt'] = `${p.releaseAltitude_ft.toLocaleString()}' MSL`;
    params['Egress HDG'] = `${p.egressHeading_deg}°`;
  } else if (p.type === 'standoff') {
    params['Release HDG'] = `${p.releaseHeading_deg}°`;
    params['Release Alt'] = `${p.releaseAltitude_ft.toLocaleString()}' MSL`;
    params['Release Spd'] = `${p.releaseSpeed_ktas} KTAS`;
    params['Standoff Dist'] = `${p.standoffDistance_nm.toFixed(1)} nm`;
  }

  return params;
}

function getProfileLabel(attack: Attack): string {
  // Built from the library: say which profile, and what the jet is doing.
  if (attack.sourceProfileName) {
    const name = attack.sourceProfileName.toUpperCase();
    return attack.deliveryMode ? `${name} · ${attack.deliveryMode}` : name;
  }
  const type = attack.profileType;
  const labels: Record<string, string> = {
    popup_ccip: 'POPUP CCIP',
    dive_ccip: 'DIVE CCIP',
    level_ccrp: 'LEVEL CCRP',
    loft_ccrp: 'LOFT CCRP',
    standoff: 'STANDOFF',
    low_angle_low_drag: 'LALD',
    high_angle_strafe: 'HAS',
  };
  return labels[type] ?? type.toUpperCase().replace(/_/g, ' ');
}

/**
 * Egress direction and heading for the card. `attackHeading` is the final
 * run-in; when the profile has no explicit egress heading the break is
 * resolved from it, the same way the map overlay does.
 */
function getEgressInfo(attack: Attack, attackHeading?: number): { direction: string; heading: number } {
  const p = attack.profile;
  if (p.type === 'popup_ccip') {
    return {
      direction: p.egressDirection.toUpperCase(),
      heading: resolveEgressHeading(p, attackHeading ?? 0),
    };
  }
  if (p.type === 'dive_ccip') {
    return {
      direction: p.egressDirection === 'straight' ? 'STRAIGHT' : p.egressDirection.toUpperCase(),
      heading: resolveEgressHeading(p, p.ingressHeading_deg),
    };
  }
  if (p.type === 'level_ccrp') {
    return {
      direction: (p.egressDirection ?? 'straight').toUpperCase(),
      heading: resolveEgressHeading(
        { egressDirection: p.egressDirection ?? 'straight', egressHeading_deg: p.egressHeading_deg },
        p.ingressHeading_deg,
      ),
    };
  }
  if (p.type === 'loft_ccrp') {
    return { direction: 'STRAIGHT', heading: p.egressHeading_deg };
  }
  return { direction: 'STRAIGHT', heading: 0 };
}

// ─── Step generation ──────────────────────────────────────────────────────────

const fmtHeading = (h?: number) =>
  h != null && Number.isFinite(h) ? `${Math.round(h).toString().padStart(3, '0')}°` : '---';

// ─── Diagram data: the two pictures ──────────────────────────────────────────

/**
 * The attack north-up, exactly as the planner's map draws it, and the same
 * attack as altitude against distance. Labels on the pictures are the
 * procedure; there is no text checklist on the card.
 */
function buildDiagramData(mission: Mission, attack: Attack, target: Mission['waypoints'][number]): KneeboardDiagramData | undefined {
  const p = attack.profile;
  const ipId = (p as { ipWaypointId?: string }).ipWaypointId;
  const ip = (ipId ? mission.waypoints.find((w) => w.id === ipId) : undefined) ?? inferIp(mission, target);
  const picture = buildAttackPicture(attack, ip, target);
  const side = buildSideProfile(attack, target.elevation_ft ?? 0);
  if (!picture && !side) return undefined;
  const heading = picture?.attackHeading ?? (p as { ingressHeading_deg?: number }).ingressHeading_deg ?? (p as { runInHeading_deg?: number }).runInHeading_deg;
  const egress = getEgressInfo(attack, heading);
  return {
    type: attack.profileType,
    picture,
    side,
    attackHeading_deg: heading,
    egressDirection: picture?.egressDirection ?? egress.direction,
    egressHeading_deg: picture?.egressHeading ?? egress.heading,
    sightDepression_mils: attack.deliveryMode === 'MAN' ? attack.sightDepression_mils : undefined,
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildKneeboardCard(
  mission: Mission,
  attackId: string,
  weapons: DbWeapon[],
  fuzeOptions: Map<string, FuzeOption[]>,
  threatSystems: ThreatSystemInfo[],
): KneeboardCard | null {
  const attack = mission.attacks.find((a) => a.id === attackId);
  if (!attack) return null;

  const attacker = mission.flightMembers.find((m) => m.id === attack.attackerId);
  if (!attacker) return null;

  const targetWp = mission.waypoints.find((w) => w.id === attack.targetWaypointId);
  if (!targetWp) return null;

  // Weapon & fuze lookup
  const weapon = weapons.find((w) => w.id === attack.weaponId);
  const weaponName = weapon?.name ?? 'Unknown';

  let fuzeName = 'N/A';
  if (attack.fuzeId && weapon) {
    const fuzeList = fuzeOptions.get(weapon.id) ?? [];
    const fuze = fuzeList.find((f) => f.id === attack.fuzeId);
    if (fuze) {
      fuzeName = fuze.name;
      if (fuze.armingDelay_sec) fuzeName += ` (${fuze.armingDelay_sec}s delay)`;
    }
  }

  // Min safe alt from the weapon's frag data
  const minSafeAlt: number | undefined = weapon?.frag_min_safe_alt_ft ?? undefined;

  // Threats within 60nm of target: what can reach it first, then nearest.
  const targetPos = targetWp.coordinates;
  const nearbyThreats: KneeboardThreatItem[] = mission.threats
    .filter((t) => {
      const dist = distanceNm(targetPos, t.position);
      return dist <= 60;
    })
    .map((t) => {
      const system = threatSystems.find((s) => s.id === t.systemId);
      const dist = distanceNm(targetPos, t.position);
      const brg = bearingDeg(targetPos, t.position);
      const name = system?.nato_designation
        ? `${system.name.split(' (')[0]} (${system.nato_designation})`
        : system?.name ?? t.systemId;
      return {
        name,
        bearing_deg: Math.round(brg),
        distance_nm: dist,
        maxRange_nm: system?.max_range_nm ?? 0,
        threatType: system?.threat_type,
        notes: t.status !== 'active' ? t.status.toUpperCase() : undefined,
      };
    })
    .sort(compareThreatsForCard)
    .slice(0, CARD_THREAT_POOL);

  // IP waypoint name for egress section (popup CCIP only)
  let fenceOutWaypoint: string | undefined;
  // Run-in heading: user override if set, otherwise the natural IP→Target bearing
  let runInHeading: number | undefined;
  if (attack.profile.type === 'popup_ccip') {
    const popupProfile = attack.profile;
    if (popupProfile.ipWaypointId) {
      const ipWp = mission.waypoints.find((w) => w.id === popupProfile.ipWaypointId);
      if (ipWp) {
        fenceOutWaypoint = `STPT ${ipWp.steerpoint} - ${ipWp.name}`;
        runInHeading = bearingDeg(ipWp.coordinates, targetPos);
      }
    }
    if (
      popupProfile.runInHeading_deg != null &&
      Number.isFinite(popupProfile.runInHeading_deg)
    ) {
      runInHeading = popupProfile.runInHeading_deg;
    }
  }

  const egress = getEgressInfo(attack, runInHeading);
  const runIn = describeRunInForCard(mission, attack, targetWp);

  // A card flown off a tablet must carry the same caveats the screen shows.
  // Fail warn-open: an unknown or not-yet-loaded theater is treated as
  // unverified rather than silently trusted.
  const cautions: string[] = [];
  const theater = getTheaterInfo(mission.theater);
  if (!theater?.verified) {
    cautions.push(
      `${theater?.display_name ?? mission.theater}: map projection unverified — confirm steerpoints on the F10 map`,
    );
  }
  if (attack.estimated) {
    cautions.push(
      `ESTIMATED — ${attack.sourceProfileName ?? 'this profile'} has not been flown in DCS; verify the numbers before relying on them`,
    );
  }


  // Sanity checks against the weapon's own limits. On a card these are
  // printed, not hidden — a pilot must see that the numbers disagree.
  const checkWarnings = runAttackChecks({
    profileType: attack.profileType,
    profile: attack.profile,
    weapon: weapon ?? null,
    targetElevation_ft: targetWp.elevation_ft,
    directBearing_deg: runIn.directBearing,
  }).map((c) => c.text);

  const releaseMode =
    attack.releaseMode === 'ripple'
      ? `Ripple (${attack.rippleInterval_ft ?? '?'}ft)`
      : attack.releaseMode.charAt(0).toUpperCase() + attack.releaseMode.slice(1);

  return {
    id: `card-${attack.id}`,
    flightMemberId: attacker.id,
    attackId: attack.id,
    header: {
      callsign: attacker.callsign,
      // "Viper 1-1 — 30° Dive CCIP, Mk-84 attack on STPT 8 (TGT1)"
      title: `${attacker.callsign} — ${attack.sourceProfileName ?? getProfileLabel(attack)}, ${weaponName.split(' ')[0]} attack on STPT ${targetWp.steerpoint} (${targetWp.name})`,
      missionDate: mission.date,
      targetName: targetWp.name,
      targetSteerpoint: targetWp.steerpoint,
      cautions: cautions.length ? cautions : undefined,
    },
    targetSection: {
      name: targetWp.name,
      coordinates: formatCoords(targetPos.lat, targetPos.lon),
      coordinatesMGRS: '',
      elevation_ft: targetWp.elevation_ft,
      description: targetWp.targetInfo?.description ?? '',
    },
    threatSection: { threats: nearbyThreats },
    attackSection: {
      profileType: getProfileLabel(attack),
      parameters: formatAttackParams(attack, runIn),
      diagram: buildDiagramData(mission, attack, targetWp),
    },
    weaponSection: {
      weaponName,
      quantity: attack.releaseQuantity,
      fuze: fuzeName,
      releaseMode,
      minSafeAlt_ft: minSafeAlt,
      warnings: checkWarnings.length ? checkWarnings : undefined,
    },
    egressSection: {
      direction: egress.direction,
      heading_deg: egress.heading,
      fenceOutWaypoint,
    },
  };
}

/** Generate a safe filename for a kneeboard card */
export function kneeboardFilename(callsign: string, targetName: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_+/g, '_');
  return `${safe(callsign)}_${safe(targetName)}.png`;
}
