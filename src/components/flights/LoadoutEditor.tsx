import { useState, useEffect } from 'react';
import { platform } from '@platform';
import { Modal } from '../common/Modal';
import type { LoadoutItem } from '../../types';
import { weaponForLoadoutItem } from '../../lib/autoBuildAttack';
import { loadoutFromRows, pickWeapon, rowsFromLoadout, type LoadoutRow } from '../../lib/loadoutRows';

interface DbWeapon {
  id: string;
  name: string;
  weight_lbs: number;
  category: string;
}

interface LoadoutEditorProps {
  aircraftName: string;
  loadout: LoadoutItem[];
  onSave: (loadout: LoadoutItem[]) => void;
  onClose: () => void;
}

export function LoadoutEditor({ aircraftName, loadout, onSave, onClose }: LoadoutEditorProps) {
  const [weapons, setWeapons] = useState<DbWeapon[]>([]);

  const [rows, setRows] = useState<LoadoutRow[]>(
    loadout.length > 0
      ? rowsFromLoadout(loadout)
      : [{ weaponType: '', quantity: 1 }]
  );

  useEffect(() => {
    platform.call<DbWeapon[]>('get_all_weapons').then(setWeapons).catch(console.error);
  }, []);

  const handleWeaponChange = (index: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? pickWeapon(r, value, weapons) : r)));
  };

  const handleQuantityChange = (index: number, value: number) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, quantity: value } : r)));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, { weaponType: '', quantity: 1 }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(loadoutFromRows(rows));
  };

  return (
    <Modal title={`Edit Loadout — ${aircraftName}`} onClose={onClose} widthClass="w-full max-w-md mx-4">
        {/* Body */}
        <div>
          <div className="space-y-2">
            {rows.map((row, index) => {
              // The row's weapon the way a loadout is read: id first, then name.
              const known = weaponForLoadoutItem(row, weapons);
              // A store the weapon table doesn't know gets its own option, so it
              // shows as itself and saving never drops or renames it. Not before
              // the table has loaded: every row would look unknown.
              const unknown = weapons.length > 0 && row.weaponType.trim() !== '' && !known;
              return (
                <div key={index} className="flex gap-2 items-center">
                  <select
                    value={known ? known.name : row.weaponType}
                    onChange={(e) => handleWeaponChange(index, e.target.value)}
                    className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— Select weapon —</option>
                    {unknown && <option value={row.weaponType}>{row.weaponType} (not in the weapon table)</option>}
                    {/* Guns are built in: the attack editor always offers the aircraft's own.
                        A gun pod that arrived on the jet stays listed for its own row. */}
                    {weapons
                      .filter((w) => w.category !== 'gun' || w === known)
                      .map((w) => (
                        <option key={w.id} value={w.name}>
                          {w.name}
                          {w.weight_lbs > 0 ? ` (${w.weight_lbs} lbs)` : ''}
                        </option>
                      ))}
                  </select>

                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={row.quantity}
                    onChange={(e) => handleQuantityChange(index, Math.max(1, Number(e.target.value)))}
                    className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-blue-500"
                  />

                  <button
                    onClick={() => handleRemoveRow(index)}
                    className="text-gray-500 hover:text-red-400 text-lg leading-none px-1"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleAddRow}
            className="mt-3 text-sm text-gray-400 hover:text-blue-400 transition-colors"
          >
            + Add weapon
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-600 text-sm hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-dcs-accent hover:bg-red-600 text-white text-sm font-medium transition-colors"
          >
            Save Loadout
          </button>
        </div>
    </Modal>
  );
}
