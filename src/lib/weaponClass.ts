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

/** A gun or rockets: fired on the pass, not released as a store. */
export function isFired(weaponClass: WeaponClass | undefined): boolean {
  return weaponClass === 'gun' || weaponClass === 'rocket';
}

/**
 * Whether the weapon picker offers this weapon for an aircraft. Guns and
 * rockets belong to particular aircraft (`carried_by`, from the database's
 * aircraft_weapons); every other air-to-ground store is offered to all, as
 * it always has been.
 */
export function offeredTo(weapon: Pick<DbWeapon, 'category' | 'guidance' | 'name' | 'carried_by'>, aircraftId: string | undefined): boolean {
  const weaponClass = weaponClassOf(weapon);
  if (!weaponClass) return false;
  if (!isFired(weaponClass)) return true;
  return !!aircraftId && (weapon.carried_by ?? []).includes(aircraftId);
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
