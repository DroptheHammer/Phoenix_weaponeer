import type {
  KneeboardCard,
  KneeboardThreatItem,
  KneeboardStep,
  KneeboardDiagramData,
} from '../types/kneeboard.types';
import type { Mission } from '../types/mission.types';
import type { Attack } from '../types/attack.types';
import type { DbWeapon, FuzeOption } from '../types/weapon.types';
import { resolveEgressHeading } from './attackGeometry';
import { runAttackChecks } from './attackChecks';
import { getTheaterInfo } from '../stores/theaterStore';

// Minimal threat system shape (matches what App.tsx gets from the DB)
export interface ThreatSystemInfo {
  id: string;
  name: string;
  nato_designation?: string | null;
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

// ─── Attack param formatting ──────────────────────────────────────────────────

function formatAttackParams(attack: Attack): Record<string, string> {
  const p = attack.profile;
  const params: Record<string, string> = {};

  if (p.type === 'popup_ccip') {
    params['Run-in Alt'] = `${p.runInAltitude_ft.toLocaleString()}' AGL`;
    params['Run-in Spd'] = `${p.runInSpeed_ktas} KTAS`;
    params['Pop Distance'] = `${p.popDistance_nm.toFixed(1)} nm`;
    params['Apex Alt'] = `${p.apexAltitude_ft.toLocaleString()}' AGL`;
    params['Roll-in Alt'] = `${p.rollInAltitude_ft.toLocaleString()}' AGL`;
    params['Dive Angle'] = `${p.diveAngle_deg}°`;
    params['Release Alt'] = `${p.releaseAltitude_ft.toLocaleString()}' AGL`;
    params['Release Spd'] = `${p.releaseSpeed_ktas} KTAS`;
    params['Hard Deck'] = `${p.minAltitude_ft.toLocaleString()}' AGL`;
  } else if (p.type === 'dive_ccip') {
    params['Ingress HDG'] = `${p.ingressHeading_deg}°`;
    params['Roll-in Alt'] = `${p.rollInAltitude_ft.toLocaleString()}' AGL`;
    params['Dive Angle'] = `${p.diveAngle_deg}°`;
    params['Release Alt'] = `${p.releaseAltitude_ft.toLocaleString()}' AGL`;
    params['Release Spd'] = `${p.releaseSpeed_ktas} KTAS`;
    params['Pullout G'] = `${p.pulloutG}G`;
  } else if (p.type === 'level_ccrp') {
    params['Ingress HDG'] = `${p.ingressHeading_deg}°`;
    params['Release Alt'] = `${p.releaseAltitude_ft.toLocaleString()}' MSL`;
    params['Release Spd'] = `${p.releaseSpeed_ktas} KTAS`;
    params['Egress HDG'] = `${Math.round(
      resolveEgressHeading({ egressDirection: 'straight', egressHeading_deg: p.egressHeading_deg }, p.ingressHeading_deg),
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
      direction: 'STRAIGHT',
      heading: resolveEgressHeading(
        { egressDirection: 'straight', egressHeading_deg: p.egressHeading_deg },
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

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

/** Number the steps in order, replacing any numeral a step already carries. */
function numberSteps(steps: KneeboardStep[]): KneeboardStep[] {
  return steps.map((step, i) => ({
    ...step,
    title: `${CIRCLED[i] ?? `${i + 1}.`} ${step.title.replace(/^[①-⑩]\s*/u, '')}`,
  }));
}

function generateSteps(
  attack: Attack,
  weaponName: string,
  releaseMode: string,
  fuze: string,
  minSafeAlt?: number,
  runInHeading?: number,
): KneeboardStep[] {
  const p = attack.profile;
  const qty = attack.releaseQuantity;
  const headingText = fmtHeading(runInHeading);
  // Without a run-in heading there is nothing to break away from.
  const egressText =
    runInHeading != null ? fmtHeading(getEgressInfo(attack, runInHeading).heading) : '---';

  if (p.type === 'popup_ccip') {
    return [
      {
        title: '① CHECK IN AT IP',
        lines: [
          `Inbound heading: ${headingText}`,
          `Altitude: ${p.runInAltitude_ft.toLocaleString()}ft AGL  |  Speed: ${p.runInSpeed_ktas} KTAS`,
          'Master arm ON — confirm weapon type selected',
        ],
      },
      {
        title: '② POP MANEUVER',
        lines: [
          `At ${p.popDistance_nm.toFixed(1)}nm from target — PULL UP`,
          `${p.climbAngle_deg.toFixed(0)}° nose-high, MAX power`,
          `Climb to ${p.apexAltitude_ft.toLocaleString()}ft AGL (apex)`,
        ],
      },
      {
        title: '③ ROLL IN',
        lines: [
          `At ${p.rollInAltitude_ft.toLocaleString()}ft AGL — roll inverted, acquire target`,
          `Pitch to ${p.diveAngle_deg}° dive angle`,
          `Attack heading: ${headingText} — center pipper on target`,
        ],
      },
      {
        title: '④ WEAPONS RELEASE',
        lines: [
          `Release at ${p.releaseAltitude_ft.toLocaleString()}ft AGL  |  ${p.releaseSpeed_ktas} KTAS`,
          `${qty}× ${weaponName}  |  ${releaseMode}  |  ${fuze}`,
          ...(minSafeAlt ? [`⚠ DO NOT GO BELOW ${minSafeAlt.toLocaleString()}ft AGL`] : []),
        ],
        isWarning: !!minSafeAlt,
      },
      {
        title: '⑤ EGRESS',
        lines: [
          `Egress ${p.egressDirection.toUpperCase()} — heading ${egressText}`,
          `Hard deck: ${p.minAltitude_ft.toLocaleString()}ft AGL  — jink vs AAA/MANPADs`,
          'Safe arm — confirm weapons away',
        ],
      },
    ];
  }

  if (p.type === 'dive_ccip') {
    // The geometry is one dive; what the pilot does in it depends on the jet.
    const mode = attack.deliveryMode ?? 'CCIP';
    const ingressAlt = p.ingressAltitude_ft ?? p.rollInAltitude_ft;
    const egress = getEgressInfo(attack);
    const egressText = `Egress ${egress.direction} — heading ${fmtHeading(egress.heading)}`;
    const weaponLine = `${qty}× ${weaponName}  |  ${releaseMode}  |  ${fuze}`;
    const minSafeLine = minSafeAlt ? [`⚠ DO NOT GO BELOW ${minSafeAlt.toLocaleString()}ft AGL`] : [];
    const releaseNumbers = `${p.releaseAltitude_ft.toLocaleString()}ft AGL  |  ${p.releaseSpeed_ktas} KTAS`;

    const ingress: KneeboardStep = {
      title: 'INGRESS',
      lines: [
        `Heading: ${fmtHeading(p.ingressHeading_deg)}  |  ${ingressAlt.toLocaleString()}ft AGL`,
        mode === 'MAN' && attack.sightDepression_mils != null
          ? `Sight depression ${attack.sightDepression_mils} mils — set before the roll-in`
          : 'Acquire target visually — confirm master arm ON',
      ],
    };

    let rollIn: KneeboardStep;
    let release: KneeboardStep;
    if (mode === 'MAN') {
      rollIn = {
        title: 'ROLL IN',
        lines: [
          `At ${p.rollInAltitude_ft.toLocaleString()}ft AGL — roll to ${p.diveAngle_deg}° dive`,
          `Hold ${p.diveAngle_deg}° and ${p.releaseSpeed_ktas} KTAS — a steady dive is the whole trick`,
        ],
      };
      release = {
        title: 'PICKLE',
        lines: [
          `Pipper on the target passing ${releaseNumbers}`,
          weaponLine,
          ...minSafeLine,
        ],
        isWarning: !!minSafeAlt,
      };
    } else if (mode === 'DTOS') {
      rollIn = {
        title: 'ROLL IN — DESIGNATE',
        lines: [
          `At ${p.rollInAltitude_ft.toLocaleString()}ft AGL — roll to ${p.diveAngle_deg}° dive`,
          'Pipper / TD box on the target — designate, pickle and HOLD',
        ],
      };
      release = {
        title: 'PULL — SYSTEM RELEASES',
        lines: [
          `Pull through the cue — release about ${releaseNumbers}`,
          weaponLine,
          ...minSafeLine,
        ],
        isWarning: !!minSafeAlt,
      };
    } else {
      rollIn = {
        title: 'ROLL IN',
        lines: [
          `At ${p.rollInAltitude_ft.toLocaleString()}ft AGL — roll to ${p.diveAngle_deg}° dive`,
          `Maintain heading ${fmtHeading(p.ingressHeading_deg)} — keep pipper on target`,
        ],
      };
      release = {
        title: 'WEAPONS RELEASE',
        lines: [`Release at ${releaseNumbers}`, weaponLine, ...minSafeLine],
        isWarning: !!minSafeAlt,
      };
    }

    return [
      ingress,
      rollIn,
      release,
      {
        title: 'EGRESS',
        lines: [egressText, `Pull ${p.pulloutG}G to recover — safe arm`],
      },
    ];
  }

  if (p.type === 'level_ccrp') {
    const mode = attack.deliveryMode ?? 'CCRP';
    const egress = getEgressInfo(attack);
    const computed = mode === 'CCRP' || mode === 'AUTO';
    const ingressLines = [
      `Heading: ${fmtHeading(p.ingressHeading_deg)}`,
      `Altitude: ${p.releaseAltitude_ft.toLocaleString()}ft MSL  |  Speed: ${p.releaseSpeed_ktas} KTAS`,
      computed
        ? `${mode} mode — the jet computes the release point`
        : mode === 'VIS'
          ? 'Lock the target — confirm in range'
          : 'Wings level — pickle on the target visually',
    ];
    const releaseStep: KneeboardStep = computed
      ? {
          title: 'AUTO-RELEASE',
          lines: [
            'Maintain heading and altitude — do NOT manoeuvre',
            `Pickle and hold — jet releases ${qty}× ${weaponName}`,
            `Fuze: ${fuze}`,
          ],
        }
      : {
          title: mode === 'VIS' ? 'FIRE' : 'PICKLE',
          lines: [`${qty}× ${weaponName}  |  ${releaseMode}  |  ${fuze}`, 'Hold heading and altitude through release'],
        };
    return [
      { title: 'INGRESS', lines: ingressLines },
      releaseStep,
      {
        title: 'EGRESS',
        lines: [`Heading: ${fmtHeading(egress.heading)}`, 'Safe arm — confirm weapons away'],
      },
    ];
  }

  if (p.type === 'loft_ccrp') {
    return [
      {
        title: '① INGRESS',
        lines: [
          `Heading: ${p.ingressHeading_deg}°`,
          `Altitude: ${p.ingressAltitude_ft.toLocaleString()}ft MSL  |  Speed: ${p.ingressSpeed_ktas ?? '—'} KTAS`,
        ],
      },
      {
        title: '② PULL UP',
        lines: [
          `At ${p.pullUpDistance_nm.toFixed(1)}nm from target — PULL UP`,
          `${p.pullUpAngle_deg}° pull — maintain heading`,
        ],
      },
      {
        title: '③ LOFT RELEASE',
        lines: [
          `System auto-releases at ${p.releaseAltitude_ft.toLocaleString()}ft`,
          `${qty}× ${weaponName}  |  ${fuze}`,
        ],
      },
      {
        title: '④ EGRESS',
        lines: [
          `Heading: ${p.egressHeading_deg}°`,
          'Push nose down after release — stay low',
        ],
      },
    ];
  }

  // Fallback for other types
  return [
    {
      title: '① EXECUTE ATTACK',
      lines: [`${qty}× ${weaponName}  |  ${releaseMode}  |  ${fuze}`],
    },
  ];
}

// ─── Diagram data extraction ──────────────────────────────────────────────────

function buildDiagramData(attack: Attack, runInHeading?: number): KneeboardDiagramData | undefined {
  const p = attack.profile;

  if (p.type === 'popup_ccip') {
    return {
      type: 'popup_ccip',
      egressDirection: p.egressDirection,
      egressHeading_deg: runInHeading != null ? resolveEgressHeading(p, runInHeading) : NaN,
      popupCCIP: {
        runInHeading_deg: runInHeading,
        runInAltitude_ft: p.runInAltitude_ft,
        runInSpeed_ktas: p.runInSpeed_ktas,
        popDistance_nm: p.popDistance_nm,
        climbAngle_deg: p.climbAngle_deg,
        apexAltitude_ft: p.apexAltitude_ft,
        rollInAltitude_ft: p.rollInAltitude_ft,
        diveAngle_deg: p.diveAngle_deg,
        releaseAltitude_ft: p.releaseAltitude_ft,
        releaseSpeed_ktas: p.releaseSpeed_ktas,
        minAltitude_ft: p.minAltitude_ft,
      },
    };
  }

  if (p.type === 'dive_ccip') {
    const mode = attack.deliveryMode ?? 'CCIP';
    return {
      type: 'dive_ccip',
      egressDirection: p.egressDirection,
      egressHeading_deg: resolveEgressHeading(p, p.ingressHeading_deg),
      sightDepression_mils: mode === 'MAN' ? attack.sightDepression_mils : undefined,
      releaseLabel: mode === 'DTOS' ? 'SYS REL' : mode === 'MAN' ? 'PICKLE' : 'REL',
      diveCCIP: {
        ingressHeading_deg: p.ingressHeading_deg,
        rollInAltitude_ft: p.rollInAltitude_ft,
        diveAngle_deg: p.diveAngle_deg,
        releaseAltitude_ft: p.releaseAltitude_ft,
        releaseSpeed_ktas: p.releaseSpeed_ktas,
        pulloutG: p.pulloutG,
      },
    };
  }

  if (p.type === 'level_ccrp') {
    const mode = attack.deliveryMode ?? 'CCRP';
    const egressHeading = resolveEgressHeading(
      { egressDirection: 'straight', egressHeading_deg: p.egressHeading_deg },
      p.ingressHeading_deg,
    );
    return {
      type: 'level_ccrp',
      egressDirection: 'STRAIGHT',
      egressHeading_deg: egressHeading,
      releaseLabel: mode === 'CCRP' || mode === 'AUTO' ? 'AUTO-RELEASE' : mode === 'VIS' ? 'FIRE' : 'PICKLE',
      levelCCRP: {
        ingressHeading_deg: p.ingressHeading_deg,
        releaseAltitude_ft: p.releaseAltitude_ft,
        releaseSpeed_ktas: p.releaseSpeed_ktas,
        egressHeading_deg: egressHeading,
      },
    };
  }

  return undefined;
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

  // Threats within 60nm of target, sorted by distance (max 6)
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
        notes: t.status !== 'active' ? t.status.toUpperCase() : undefined,
      };
    })
    .sort((a, b) => a.distance_nm - b.distance_nm)
    .slice(0, 6);

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

  // The profile's own setup lines come first; the geometry steps follow.
  const profileStep: KneeboardStep[] = attack.procedure?.length
    ? [{ title: `${attack.sourceProfileName ?? 'PROFILE'} — SETUP`.toUpperCase(), lines: attack.procedure }]
    : [];

  // Sanity checks against the weapon's own limits. On a card these are
  // printed, not hidden — a pilot must see that the numbers disagree.
  const checkWarnings = runAttackChecks({
    profileType: attack.profileType,
    profile: attack.profile,
    weapon: weapon ?? null,
    targetElevation_ft: targetWp.elevation_ft,
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
      missionDate: mission.date,
      targetName: targetWp.name,
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
      parameters: formatAttackParams(attack),
      steps: numberSteps([
        ...profileStep,
        ...generateSteps(attack, weaponName, releaseMode, fuzeName, minSafeAlt, runInHeading),
      ]),
      diagram: buildDiagramData(attack, runInHeading),
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
