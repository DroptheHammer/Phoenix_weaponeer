import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { platform } from '@platform';
import type { LoadoutItem } from '../../types';

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

interface Row {
  weaponType: string;
  quantity: number;
}

export function LoadoutEditor({ aircraftName, loadout, onSave, onClose }: LoadoutEditorProps) {
  const [weapons, setWeapons] = useState<DbWeapon[]>([]);

  const [rows, setRows] = useState<Row[]>(
    loadout.length > 0
      ? loadout.map((item) => ({ weaponType: item.weaponType, quantity: item.quantity }))
      : [{ weaponType: '', quantity: 1 }]
  );

  useEffect(() => {
    platform.call<DbWeapon[]>('get_all_weapons').then(setWeapons).catch(console.error);
  }, []);

  const handleWeaponChange = (index: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, weaponType: value } : r)));
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
    const newLoadout: LoadoutItem[] = rows
      .filter((r) => r.weaponType.trim() !== '')
      .map((r) => ({ weaponType: r.weaponType.trim(), quantity: r.quantity }));
    onSave(newLoadout);
  };

  const modal = (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-dcs-navy text-white border border-gray-600 rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold">Edit Loadout</h2>
            <p className="text-sm text-gray-400">{aircraftName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="flex gap-2 items-center">
                <select
                  value={row.weaponType}
                  onChange={(e) => handleWeaponChange(index, e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">— Select weapon —</option>
                  {/* Guns are built in: the attack editor always offers the aircraft's own. */}
                  {weapons
                    .filter((w) => w.category !== 'gun')
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
            ))}
          </div>

          <button
            onClick={handleAddRow}
            className="mt-3 text-sm text-gray-400 hover:text-blue-400 transition-colors"
          >
            + Add weapon
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-700">
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
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
