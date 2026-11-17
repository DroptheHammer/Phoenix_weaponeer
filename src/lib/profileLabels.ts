import type { AttackProfileType } from '../types/attack.types';

/**
 * What an attack's profile is called when it was not built from a named
 * profile. Moved here unchanged from AttackList.tsx so the attack list and the
 * Flight overview can never word the same attack two ways.
 */
export const PROFILE_LABELS: Record<AttackProfileType, string> = {
  level_ccrp: 'Level CCRP',
  dive_ccip: 'Dive CCIP',
  popup_ccip: 'Popup CCIP',
  loft_ccrp: 'Loft CCRP',
  low_angle_low_drag: 'LALD',
  high_angle_strafe: 'Strafe',
  standoff: 'Standoff',
};
