/**
 * Where a dive's roll-in and release sit, measured back from the target.
 *
 * A bomb released in a dive falls under the line of the dive, so a dive that
 * points straight at the target drops short of it. The handbook's dive aims
 * off: the line of the dive runs on past the target to an aim-off point, and
 * the release is where a bomb with the jet's velocity lands on the target.
 * The aim-off is the pop-up's own formula (`planPopup`), from the same vacuum
 * fall (`bombRangeVacuum_ft`), so the two deliveries agree.
 *
 * A gun or rockets fly nearly straight and keep the sight line through the
 * target, with no aim-off. So does a dive with no usable release speed: with no
 * bomb range to aim with, the picture stays as it was before the aim-off.
 *
 * This lives apart from attackGeometry.ts because popupPlanning.ts already
 * imports that file.
 */

import { diveGroundRange_nm } from './attackGeometry';
import { FT_PER_NM, bombRangeVacuum_ft } from './popupPlanning';

export interface DiveRanges {
  /** Beyond the target, ft; 0 for a fired pass. */
  aimOff_ft: number;
  /** Ground range from the target to the roll-in point, nm. */
  rollIn_nm: number;
  /** Ground range from the target to the release point, nm. */
  release_nm: number;
}

export function diveRanges(
  p: { rollInAltitude_ft: number; releaseAltitude_ft: number; diveAngle_deg: number; releaseSpeed_ktas: number },
  fired = false,
): DiveRanges {
  const line_nm = diveGroundRange_nm(p.releaseAltitude_ft, p.diveAngle_deg);
  const range_ft = bombRangeVacuum_ft(p.releaseAltitude_ft, p.releaseSpeed_ktas, p.diveAngle_deg);
  // A fired pass, or a speed that is missing or cleared (so there is no bomb range to aim with), keeps the sight line through the target.
  const aimOff_ft = fired || !Number.isFinite(range_ft) ? 0 : Math.max(line_nm * FT_PER_NM - range_ft, 0);
  const back_nm = aimOff_ft / FT_PER_NM;
  return { aimOff_ft, rollIn_nm: diveGroundRange_nm(p.rollInAltitude_ft, p.diveAngle_deg) - back_nm, release_nm: line_nm - back_nm };
}
