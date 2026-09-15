import { useRef, useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { useVisibleMission } from '../../hooks/useVisibleMission';
import { useUiStore } from '../../stores/uiStore';
import { buildKneeboardCard, kneeboardFilename, type ThreatSystemInfo } from '../../lib/buildKneeboardCard';
import { join } from '@tauri-apps/api/path';
import { useSettingsStore } from '../../stores/settingsStore';
import { chooseKneeboardFolder, folderStillThere } from '../../lib/dcsExport';
import { aircraftFolderInfo, claimFilename, groupAttacksByAircraft, type AircraftFolderInfo } from '../../lib/kneeboardExportPlan';
import {
  renderKneeboardCard,
  renderKneeboardCardWithMap,
  mapStatusOf,
  canvasToBase64Png,
  KNEEBOARD_WIDTH,
  KNEEBOARD_HEIGHT,
  type MapStatus,
} from '../../lib/renderKneeboardCanvas';
import { cachedBasemapTiles, loadBasemapTiles } from '../../lib/kneeboardBasemap';
import type { KneeboardCard } from '../../types/kneeboard.types';
import type { DbWeapon, FuzeOption } from '../../types';

interface KneeboardPreviewProps {
  weapons: DbWeapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
  threatSystems: ThreatSystemInfo[];
  aircraft: AircraftFolderInfo[];
  onOpenSettings: () => void;
}

// Preview is shown at half scale to fit the sidebar
const PREVIEW_WIDTH = 384;
const PREVIEW_HEIGHT = 512;

/** The preview's one-line map status, or nothing when there is nothing to say. */
function previewMapNote(status: MapStatus): string | null {
  if (status === 'unavailable') return 'map unavailable (offline?)';
  if (status === 'partial') return 'map incomplete';
  return null;
}

/** Appended to an export message when a card went out without all of its map. */
function exportMapNote(statuses: MapStatus[]): string {
  if (statuses.includes('unavailable')) return ' — map tiles unavailable, saved without map';
  if (statuses.includes('partial')) return ' — map incomplete on some cards';
  return '';
}

export function KneeboardPreview({ weapons, fuzeOptions, threatSystems, aircraft, onOpenSettings }: KneeboardPreviewProps) {
  // Cards are built from what this planner may see: no author-hidden threat
  // reaches a card unless it was revealed in ⚙ Settings → Admin.
  const mission = useVisibleMission();
  const kneeboardMap = useUiStore((state) => state.kneeboardMap);
  const toggleKneeboardMap = useUiStore((state) => state.toggleKneeboardMap);
  const kneeboardFolders = useSettingsStore((state) => state.settings.kneeboardFolders);
  const setKneeboardFolder = useSettingsStore((state) => state.setKneeboardFolder);

  const [selectedAttackId, setSelectedAttackId] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [mapNote, setMapNote] = useState<string | null>(null);

  // Full-res hidden canvas the preview is scaled down from
  const fullCanvasRef = useRef<HTMLCanvasElement>(null);
  // Scaled preview canvas
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Auto-select first attack when mission changes
  useEffect(() => {
    if (mission?.attacks.length) {
      setSelectedAttackId((prev) =>
        mission.attacks.find((a) => a.id === prev) ? prev : mission.attacks[0].id,
      );
    } else {
      setSelectedAttackId('');
    }
  }, [mission]);

  // Re-render whenever selected attack changes. The card is drawn at once with
  // whatever map is cached, then again when the missing tiles arrive.
  useEffect(() => {
    setMapNote(null);
    if (!mission || !selectedAttackId || !fullCanvasRef.current || !previewCanvasRef.current) {
      // Clear preview
      const pCtx = previewCanvasRef.current?.getContext('2d');
      if (pCtx) {
        pCtx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
        pCtx.fillStyle = '#1E2A3A';
        pCtx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
        pCtx.fillStyle = '#667788';
        pCtx.font = '14px Arial';
        pCtx.textAlign = 'center';
        pCtx.fillText('Select an attack to preview', PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2);
      }
      return;
    }

    const card = buildKneeboardCard(mission, selectedAttackId, weapons, fuzeOptions, threatSystems);
    if (!card) return;

    const fullCanvas = fullCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const pCtx = previewCanvas.getContext('2d');
    if (!pCtx) return;

    const paint = () => {
      const report = renderKneeboardCard(fullCanvas, card, kneeboardMap ? cachedBasemapTiles : undefined);
      previewCanvas.width = PREVIEW_WIDTH;
      previewCanvas.height = PREVIEW_HEIGHT;
      pCtx.drawImage(fullCanvas, 0, 0, KNEEBOARD_WIDTH, KNEEBOARD_HEIGHT, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      return report;
    };

    const report = paint();
    if (!kneeboardMap || !report?.pending) {
      setMapNote(previewMapNote(mapStatusOf(report, kneeboardMap)));
      return;
    }

    // A slow tile load must not paint over a newer selection.
    let cancelled = false;
    setMapNote('loading map…');
    loadBasemapTiles(report.tiles).then(() => {
      if (cancelled) return;
      setMapNote(previewMapNote(mapStatusOf(paint(), true)));
    });
    return () => {
      cancelled = true;
    };
  }, [mission, selectedAttackId, weapons, fuzeOptions, threatSystems, kneeboardMap]);

  /** Render one card on its own canvas, so a preview redraw can never land between draw and encode. */
  const renderForExport = useCallback(
    async (card: KneeboardCard) => {
      const canvas = document.createElement('canvas');
      const status = await renderKneeboardCardWithMap(canvas, card, { map: kneeboardMap });
      return { base64: canvasToBase64Png(canvas), status };
    },
    [kneeboardMap],
  );

  const handleExport = useCallback(async () => {
    if (!mission || !selectedAttackId) return;
    const card = buildKneeboardCard(mission, selectedAttackId, weapons, fuzeOptions, threatSystems);
    if (!card) return;

    const defaultName = kneeboardFilename(card.header.callsign, card.header.targetName, card.header.targetSteerpoint);
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
      title: 'Save Kneeboard Card',
    });
    if (!path) return; // user cancelled

    setExporting(true);
    setExportMsg(null);
    try {
      const { base64, status } = await renderForExport(card);
      await invoke<void>('save_kneeboard_png', { path, base64Data: base64 });
      setExportMsg(`Saved: ${path.split(/[/\\]/).pop()}${exportMapNote([status])}`);
    } catch (e) {
      setExportMsg(`Error: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [mission, selectedAttackId, weapons, fuzeOptions, threatSystems, renderForExport]);

  const handleExportAll = useCallback(async () => {
    if (!mission || !mission.attacks.length) return;

    // Use proper folder picker
    const folder = await open({
      directory: true,
      multiple: false,
      title: `Select folder for ${mission.attacks.length} kneeboard cards`,
    });

    if (!folder) return; // user cancelled

    setExporting(true);
    setExportMsg(null);
    let saved = 0;
    const errors: string[] = [];
    const statuses: MapStatus[] = [];
    const taken = new Set<string>();

    try {
      for (const attack of mission.attacks) {
        const card = buildKneeboardCard(mission, attack.id, weapons, fuzeOptions, threatSystems);
        if (!card) continue;
        const { base64, status } = await renderForExport(card);
        statuses.push(status);
        const filename = claimFilename(kneeboardFilename(card.header.callsign, card.header.targetName, card.header.targetSteerpoint), taken);
        try {
          await invoke<void>('save_kneeboard_png', { path: await join(folder, filename), base64Data: base64 });
          saved++;
        } catch (e) {
          errors.push(`${filename}: ${String(e)}`);
        }
      }
      setExportMsg(
        (errors.length
          ? `Saved ${saved} card(s) with ${errors.length} error(s)`
          : `Saved ${saved} card(s) to folder`) + exportMapNote(statuses),
      );
    } catch (e) {
      setExportMsg(`Error: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [mission, weapons, fuzeOptions, threatSystems, renderForExport]);

  /**
   * Each aircraft type's cards go to that type's remembered kneeboard folder.
   * A type with no folder yet (or whose folder has gone) asks once, starting
   * at our best guess, and the answer is remembered in Settings.
   */
  const handleExportToDCS = useCallback(async () => {
    if (!mission || !mission.attacks.length) return;

    setExporting(true);
    setExportMsg(null);
    const lines: string[] = [];
    // Filenames already used in each folder this export — two aircraft types can share one.
    const takenByFolder = new Map<string, Set<string>>();
    const statuses: MapStatus[] = [];
    let anyErrors = false;

    try {
      const { groups, orphans } = groupAttacksByAircraft(mission);
      for (const group of groups) {
        const info = aircraftFolderInfo(group.aircraftId, aircraft);
        let folder: string | undefined = kneeboardFolders[group.aircraftId];
        if (!folder || !(await folderStillThere(folder))) {
          setExportMsg(`Choose the DCS kneeboard folder for ${info.name}…`);
          const picked = await chooseKneeboardFolder(info.name, info.folderHint, folder);
          if (!picked) {
            lines.push(`${info.name}: skipped — no folder chosen`);
            continue;
          }
          await setKneeboardFolder(group.aircraftId, picked);
          folder = picked;
        }

        let saved = 0;
        const errors: string[] = [];
        const taken = takenByFolder.get(folder) ?? new Set<string>();
        takenByFolder.set(folder, taken);
        for (const attack of group.attacks) {
          const card = buildKneeboardCard(mission, attack.id, weapons, fuzeOptions, threatSystems);
          if (!card) continue;
          const { base64, status } = await renderForExport(card);
          statuses.push(status);
          const filename = claimFilename(kneeboardFilename(card.header.callsign, card.header.targetName, card.header.targetSteerpoint), taken);
          try {
            await invoke<void>('save_kneeboard_png', { path: await join(folder, filename), base64Data: base64 });
            saved++;
          } catch (e) {
            errors.push(`${filename}: ${String(e)}`);
          }
        }
        anyErrors ||= errors.length > 0;
        lines.push(`${info.name}: ${saved} card(s) → ${folder}${errors.length ? ` — ${errors.length} error(s): ${errors[0]}` : ''}`);
      }
      if (orphans.length) {
        lines.push(`${orphans.length} attack(s) skipped — their pilot is no longer in the flight`);
      }
      setExportMsg(`${anyErrors ? 'Error: ' : '✓ '}${lines.join('\n')}${exportMapNote(statuses)}`);
    } catch (e) {
      setExportMsg(`Error: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [mission, weapons, fuzeOptions, threatSystems, renderForExport, aircraft, kneeboardFolders, setKneeboardFolder]);

  const resetFolder = useCallback(
    (aircraftId: string) => {
      setKneeboardFolder(aircraftId, null).catch((e) => setExportMsg(`Error: ${String(e)}`));
    },
    [setKneeboardFolder],
  );

  if (!mission) {
    return (
      <div className="text-gray-400 text-center py-8 text-sm">
        No mission loaded.
      </div>
    );
  }

  if (!mission.attacks.length) {
    return (
      <div className="text-gray-400 text-center py-8 text-sm">
        No attacks planned yet. Add attacks to generate kneeboard cards.
      </div>
    );
  }

  const getAttackLabel = (attackId: string) => {
    const attack = mission.attacks.find((a) => a.id === attackId);
    if (!attack) return attackId;
    const attacker = mission.flightMembers.find((m) => m.id === attack.attackerId);
    const target = mission.waypoints.find((w) => w.id === attack.targetWaypointId);
    const callsign = attacker?.callsign ?? '?';
    const targetName = target?.name ?? '?';
    const profile = attack.profileType.replace(/_/g, ' ').toUpperCase();
    return `${callsign} → ${targetName} (${profile})`;
  };

  return (
    <div className="space-y-3">
      {/* Hidden full-res canvas for rendering */}
      <canvas
        ref={fullCanvasRef}
        width={KNEEBOARD_WIDTH}
        height={KNEEBOARD_HEIGHT}
        className="hidden"
      />

      {/* Attack selector */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Select attack</label>
        <select
          value={selectedAttackId}
          onChange={(e) => setSelectedAttackId(e.target.value)}
          className="w-full bg-dcs-dark text-white text-sm rounded px-2 py-1 border border-gray-600"
        >
          {mission.attacks.map((attack) => (
            <option key={attack.id} value={attack.id}>
              {getAttackLabel(attack.id)}
            </option>
          ))}
        </select>
      </div>

      {/* Preview canvas */}
      <div className="flex justify-center">
        <canvas
          ref={previewCanvasRef}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          className="border border-gray-600 rounded"
          style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
        />
      </div>

      {/* Map under the north-up picture */}
      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input type="checkbox" checked={kneeboardMap} onChange={toggleKneeboardMap} />
        Map background
        {mapNote && <span className="text-gray-500">· {mapNote}</span>}
      </label>

      {/* Export controls */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || !selectedAttackId}
            className="flex-1 bg-dcs-accent hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-1.5 rounded transition-colors"
          >
            {exporting ? 'Saving…' : 'Export Selected'}
          </button>
          <button
            onClick={handleExportAll}
            disabled={exporting}
            className="flex-1 bg-dcs-blue hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-1.5 rounded transition-colors"
          >
            {exporting ? 'Saving…' : `Export All (${mission.attacks.length})`}
          </button>
        </div>

        <button
          onClick={handleExportToDCS}
          disabled={exporting}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-1.5 rounded transition-colors"
        >
          {exporting ? 'Saving…' : `🎯 Export All to DCS Folder`}
        </button>

        {/* Where each aircraft type in this mission will export to */}
        <div className="text-xs text-gray-400 space-y-1">
          {groupAttacksByAircraft(mission).groups.map(({ aircraftId }) => {
            const info = aircraftFolderInfo(aircraftId, aircraft);
            const folder = kneeboardFolders[aircraftId];
            return (
              <div key={aircraftId} className="flex items-center gap-2">
                <span className="text-gray-300 shrink-0">{info.name}:</span>
                <span className={`truncate ${folder ? 'font-mono' : 'text-gray-500'}`} title={folder}>
                  {folder ?? 'asks for its folder on first export'}
                </span>
                {folder && (
                  <button
                    onClick={() => resetFolder(aircraftId)}
                    disabled={exporting}
                    className="ml-auto shrink-0 text-dcs-accent hover:underline disabled:opacity-40"
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
          <button onClick={onOpenSettings} className="text-blue-400 hover:underline">
            All aircraft folders in Settings…
          </button>
        </div>

        {exportMsg && (
          <div
            className={`text-xs rounded p-2 font-mono whitespace-pre-line break-words ${
              exportMsg.startsWith('Error') ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'
            }`}
          >
            {exportMsg}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Cards saved as 768×1024 PNG (DCS kneeboard format). Export to DCS asks once per aircraft type
        for its kneeboard folder (usually <code className="font-mono">Saved Games/DCS/Kneeboard/&lt;aircraft&gt;</code>),
        then remembers it.
      </p>
    </div>
  );
}
