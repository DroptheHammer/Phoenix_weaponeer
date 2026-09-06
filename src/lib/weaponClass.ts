import type { DbWeapon } from '../types/weapon.types';
import type { WeaponClass } from '../types/profile.types';

/**
 * Which profile weapon class a database weapon belongs to.
 *
 * Profiles are written for classes ("any low-drag bomb"), not individual
 * weapons, so this is the join between the weapons table and the library.
 * Derived from category, guidance and name rather than a new column, so an
 * existing database needs no migration for it.
 */
export function weaponClassOf(weapon: Pick<DbWeapon, 'category' | 'guidance' | 'name'>): WeaponClass | undefined {
  switch (weapon.category) {
    case 'bomb_unguided':
      // High-drag / retarded bombs can be released low; low-drag cannot.
      return /\bAIR\b|Snakeye|\bSE\b|Retard|High.?Drag|\bHD\b/i.test(weapon.name) ? 'bomb_hd' : 'bomb_ld';
    case 'bomb_guided':
      return weapon.guidance === 'gps' ? 'jdam' : 'lgb';
    case 'bomb_gps':
      return 'jdam';
    case 'cluster':
      return 'cluster';
    case 'rocket':
      return 'rocket';
    case 'gun':
      return 'gun';
    case 'missile_agm':
    case 'standoff':
      return 'agm';
    default:
      return undefined;
  }
}

export const WEAPON_CLASS_LABEL: Record<WeaponClass, string> = {
  bomb_ld: 'Low-drag bombs',
  bomb_hd: 'High-drag bombs',
  lgb: 'Laser-guided bombs',
  jdam: 'GPS bombs',
  rocket: 'Rockets',
  gun: 'Gun',
  cluster: 'Cluster',
  agm: 'Air-to-ground missiles',
};
