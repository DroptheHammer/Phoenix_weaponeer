import type { LoadoutItem } from '../types/flight.types';

/**
 * The loadout editor's rows, and the rules for turning picks into a saved
 * loadout. Kept out of the component so they can be tested without a page.
 *
 * `weaponId` wins over the name when a loadout is read (`weaponForLoadoutItem`),
 * so the two must never disagree: a pick writes both, and a row that was not
 * touched keeps exactly what it came in with.
 */
export interface LoadoutRow {
  weaponType: string;
  quantity: number;
  weaponId?: string;
}

/** Rows to edit: every line as stored, `weaponId` included. */
export function rowsFromLoadout(loadout: LoadoutItem[]): LoadoutRow[] {
  return loadout.map((item) => ({
    weaponType: item.weaponType,
    quantity: item.quantity,
    ...(item.weaponId ? { weaponId: item.weaponId } : {}),
  }));
}

/**
 * The row after a pick, by the weapon's name (the option's value). A weapon the
 * table has takes its id with its name; an empty pick has no weapon and so no id.
 */
export function pickWeapon(row: LoadoutRow, name: string, weapons: Array<{ id: string; name: string }>): LoadoutRow {
  const weapon = weapons.find((w) => w.name === name);
  return weapon
    ? { weaponType: weapon.name, quantity: row.quantity, weaponId: weapon.id }
    : { weaponType: name, quantity: row.quantity };
}

/** What Save stores: rows with a weapon, trimmed, each keeping its `weaponId`. */
export function loadoutFromRows(rows: LoadoutRow[]): LoadoutItem[] {
  return rows
    .filter((r) => r.weaponType.trim() !== '')
    .map((r) => ({
      weaponType: r.weaponType.trim(),
      quantity: r.quantity,
      ...(r.weaponId ? { weaponId: r.weaponId } : {}),
    }));
}
