import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useMissionStore } from '../../stores/missionStore';
import { useUiStore } from '../../stores/uiStore';
import { hiddenCounts } from '../../lib/threatVisibility';
import { platform } from '@platform';
import { chooseKneeboardFolder, folderStillThere } from '../../lib/dcsExport';
import type { AircraftFolderInfo } from '../../lib/kneeboardExportPlan';

interface SettingsModalProps {
  aircraft: AircraftFolderInfo[];
  onClose: () => void;
}

/**
 * Preferences that outlive a mission. First section: where each aircraft
 * type's kneeboard cards go in DCS. Add later sections below it.
 */
export function SettingsModal({ aircraft, onClose }: SettingsModalProps) {
  const kneeboardFolders = useSettingsStore((state) => state.settings.kneeboardFolders);
  const warning = useSettingsStore((state) => state.warning);
  const setKneeboardFolder = useSettingsStore((state) => state.setKneeboardFolder);

  const reveal = useUiStore((state) => state.revealHidden);
  const setRevealHidden = useUiStore((state) => state.setRevealHidden);
  const threats = useMissionStore((state) => state.mission?.threats);
  const counts = threats ? hiddenCounts(threats) : null;
  // Tucked away by default; open when a switch is already on, so it is never
  // on without being visible.
  const [showAdmin, setShowAdmin] = useState(reveal.onPlanner || reveal.onMap);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Remembered folders that are no longer on disk. */
  const [gone, setGone] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      Object.entries(kneeboardFolders).map(async ([id, folder]) => [id, await folderStillThere(folder)] as const),
    ).then((results) => {
      if (!cancelled) setGone(new Set(results.filter(([, exists]) => !exists).map(([id]) => id)));
    });
    return () => {
      cancelled = true;
    };
  }, [kneeboardFolders]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const choose = (ac: AircraftFolderInfo) =>
    run(ac.id, async () => {
      const picked = await chooseKneeboardFolder(ac.name, ac.kneeboard_path || ac.id, kneeboardFolders[ac.id]);
      if (picked) await setKneeboardFolder(ac.id, picked);
    });

  const reset = (ac: AircraftFolderInfo) => run(ac.id, () => setKneeboardFolder(ac.id, null));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000]">
      <div className="bg-dcs-navy rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close settings">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* The browser has no DCS install, so no folders to choose. */}
          {!platform.isWeb && (
          <>
          <div>
            <h3 className="font-medium text-dcs-accent">DCS kneeboard folders</h3>
            <p className="text-xs text-gray-400 mt-1">
              Where <span className="text-gray-300">Export All to DCS Folder</span> puts each aircraft type's cards.
              A type with no folder asks the first time you export it, then remembers your choice.
              Reset makes it ask again.
            </p>
          </div>

          {(warning || error) && (
            <div className="text-xs rounded p-2 bg-red-900 text-red-200 font-mono">{error ?? warning}</div>
          )}

          <div className="space-y-1">
            {aircraft.map((ac) => {
              const folder = kneeboardFolders[ac.id];
              const busy = busyId === ac.id;
              return (
                <div key={ac.id} className="bg-dcs-dark rounded p-2 text-sm flex items-center gap-3">
                  <div className="w-44 shrink-0 font-medium truncate" title={ac.name}>{ac.name}</div>
                  <div className="flex-1 min-w-0 text-xs">
                    {folder ? (
                      <>
                        <div className="font-mono truncate text-gray-300" title={folder}>{folder}</div>
                        {gone.has(ac.id) && (
                          <div className="text-amber-400">Folder not found — the next export will ask again</div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-500">Not set — asks on first export</span>
                    )}
                  </div>
                  <button
                    onClick={() => choose(ac)}
                    disabled={busyId !== null}
                    className="shrink-0 bg-dcs-blue hover:bg-blue-600 disabled:bg-gray-600 text-white text-xs font-medium px-2 py-1 rounded"
                  >
                    {busy ? '…' : 'Choose…'}
                  </button>
                  <button
                    onClick={() => reset(ac)}
                    disabled={!folder || busyId !== null}
                    className="shrink-0 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-medium px-2 py-1 rounded"
                  >
                    Reset
                  </button>
                </div>
              );
            })}
          </div>
          </>
          )}

          {platform.isWeb && (warning || error) && (
            <div className="text-xs rounded p-2 bg-red-900 text-red-200 font-mono">{error ?? warning}</div>
          )}

          <div className={platform.isWeb ? '' : 'pt-3 mt-3 border-t border-gray-700'}>
            <button
              onClick={() => setShowAdmin((open) => !open)}
              className="text-sm text-gray-400 hover:text-white"
            >
              {showAdmin ? '▾' : '▸'} Admin
            </button>
            {showAdmin && (
              <div className="mt-2 space-y-2 text-sm">
                <p className="text-xs text-gray-400">
                  Show enemy threats the mission author hid. Once shown, they count like any other threat: map, attack
                  geometry and cards. Both switches turn off every time the app starts. This only hides them in the
                  planner; anyone who opens the mission file itself can still read the positions.
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reveal.onPlanner}
                    onChange={(e) => setRevealHidden({ onPlanner: e.target.checked })}
                  />
                  Show threats hidden on the planner
                  {counts && <span className="text-gray-400">({counts.onPlanner} in this mission)</span>}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reveal.onMap}
                    onChange={(e) => setRevealHidden({ onMap: e.target.checked })}
                  />
                  Show threats hidden on the F10 map
                  {counts && <span className="text-gray-400">({counts.onMap} in this mission)</span>}
                </label>
                {counts && counts.both > 0 && (
                  <p className="text-xs text-amber-300">
                    {counts.both} {counts.both === 1 ? 'is' : 'are'} hidden both ways and need both switches.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
