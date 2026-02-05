import type { PopupCCIPProfile, Weapon } from '../types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a Popup CCIP attack profile against weapon constraints
 */
export function validatePopupProfile(
  profile: PopupCCIPProfile,
  weapon: Weapon,
  targetElevation: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!profile.ipWaypointId) {
    errors.push('IP waypoint is required');
  }
  if (!profile.runInAltitude_ft) {
    errors.push('Run-in altitude is required');
  }
  if (!profile.runInSpeed_ktas) {
    errors.push('Run-in speed is required');
  }
  if (!profile.popDistance_nm) {
    errors.push('Pop distance is required');
  }
  if (!profile.apexAltitude_ft) {
    errors.push('Apex altitude is required');
  }
  if (!profile.diveAngle_deg) {
    errors.push('Dive angle is required');
  }
  if (!profile.releaseAltitude_ft) {
    errors.push('Release altitude not calculated - check weapon selection');
  }

  // Release altitude vs weapon minimum
  if (weapon.minReleaseAlt_ft && profile.releaseAltitude_ft < weapon.minReleaseAlt_ft) {
    errors.push(
      `Release altitude (${Math.round(profile.releaseAltitude_ft)} ft) is below weapon minimum (${weapon.minReleaseAlt_ft} ft)`
    );
  }

  // Release altitude vs frag safety
  if (weapon.fragPattern?.minSafeAlt_ft && profile.releaseAltitude_ft < weapon.fragPattern.minSafeAlt_ft) {
    errors.push(
      `Release altitude (${Math.round(profile.releaseAltitude_ft)} ft) is below frag safety minimum (${weapon.fragPattern.minSafeAlt_ft} ft)`
    );
  }

  // Speed envelope warnings
  if (weapon.minReleaseSpeed_ktas && profile.runInSpeed_ktas < weapon.minReleaseSpeed_ktas) {
    warnings.push(
      `Run-in speed (${profile.runInSpeed_ktas} KTAS) is below weapon optimal minimum (${weapon.minReleaseSpeed_ktas} KTAS)`
    );
  }
  if (weapon.maxReleaseSpeed_ktas && profile.releaseSpeed_ktas > weapon.maxReleaseSpeed_ktas) {
    warnings.push(
      `Release speed (${Math.round(profile.releaseSpeed_ktas)} KTAS) may exceed weapon maximum (${weapon.maxReleaseSpeed_ktas} KTAS)`
    );
  }

  // Altitude envelope warnings
  if (weapon.maxReleaseAlt_ft && profile.releaseAltitude_ft > weapon.maxReleaseAlt_ft) {
    warnings.push(
      `Release altitude (${Math.round(profile.releaseAltitude_ft)} ft) exceeds weapon maximum (${weapon.maxReleaseAlt_ft} ft)`
    );
  }

  // Dive angle warnings
  if (profile.diveAngle_deg < 15) {
    warnings.push('Shallow dive angle (<15°) may result in long exposure to threats');
  }
  if (profile.diveAngle_deg > 45) {
    warnings.push('Steep dive angle (>45°) requires high-G pullout - check aircraft limits');
  }

  // Pop distance warnings
  if (profile.popDistance_nm < 1.5) {
    warnings.push('Short pop distance (<1.5 nm) provides minimal standoff from target threats');
  }
  if (profile.popDistance_nm > 5.0) {
    warnings.push('Long pop distance (>5 nm) may reduce accuracy and increase time in threat envelope');
  }

  // Hard deck vs terrain
  const terrainClearance = profile.minAltitude_ft - targetElevation;
  if (terrainClearance < 500) {
    warnings.push(`Hard deck is only ${Math.round(terrainClearance)} ft above target elevation - risk of CFIT`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick check if an attack profile has critical safety violations
 */
export function hasCriticalViolations(
  profile: PopupCCIPProfile,
  weapon: Weapon
): boolean {
  // Critical: Release altitude below weapon minimum
  if (weapon.minReleaseAlt_ft && profile.releaseAltitude_ft < weapon.minReleaseAlt_ft) {
    return true;
  }

  // Critical: Release altitude below frag safety
  if (weapon.fragPattern?.minSafeAlt_ft && profile.releaseAltitude_ft < weapon.fragPattern.minSafeAlt_ft) {
    return true;
  }

  return false;
}
