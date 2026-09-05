import { useRef, useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { useMissionStore } from '../../stores/missionStore';
import { buildKneeboardCard, kneeboardFilename, type ThreatSystemInfo } from '../../lib/buildKneeboardCard';
import { getDcsKneeboardPath, getAircraftKneeboardPath } from '../../lib/dcsExport';
import {
  renderKneeboardCard,
  canvasToBase64Png,
  KNEEBOARD_WIDTH,
  KNEEBOARD_HEIGHT,
} from '../../lib/renderKneeboardCanvas';
import type { DbWeapon, FuzeOption } from '../../types';

interface KneeboardPreviewProps {
  weapons: DbWeapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
  threatSystems: ThreatSystemInfo[];
}

// Preview is shown at half scale to fit the sidebar
const PREVIEW_WIDTH = 384;
const PREVIEW_HEIGHT = 512;

export function KneeboardPreview({ weapons, fuzeOptions, threatSystems }: KneeboardPreviewProps) {
  const { mission } = useMissionStore();

  const [selectedAttackId, setSelectedAttackId] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // Full-res hidden canvas for actual PNG generation
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

  // Re-render whenever selected attack changes
  useEffect(() => {
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

    // Draw full-res card
    renderKneeboardCard(fullCanvas, card);

    // Scale down to preview canvas
    const pCtx = previewCanvas.getContext('2d');
    if (!pCtx) return;
    previewCanvas.width = PREVIEW_WIDTH;
    previewCanvas.height = PREVIEW_HEIGHT;
    pCtx.drawImage(fullCanvas, 0, 0, KNEEBOARD_WIDTH, KNEEBOARD_HEIGHT, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

  }, [mission, selectedAttackId, weapons, fuzeOptions, threatSystems]);

  const handleExport = useCallback(async () => {
    if (!mission || !selectedAttackId || !fullCanvasRef.current) return;
    const card = buildKneeboardCard(mission, selectedAttackId, weapons, fuzeOptions, threatSystems);
    if (!card) return;

    const defaultName = kneeboardFilename(card.header.callsign, card.header.targetName);
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
      title: 'Save Kneeboard Card',
    });
    if (!path) return; // user cancelled

    setExporting(true);
    setExportMsg(null);
    try {
      renderKneeboardCard(fullCanvasRef.current, card);
      const base64 = canvasToBase64Png(fullCanvasRef.current);
      await invoke<void>('save_kneeboard_png', { path, base64Data: base64 });
      setExportMsg(`Saved: ${path.split('/').pop()}`);
    } catch (e) {
      setExportMsg(`Error: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [mission, selectedAttackId, weapons, fuzeOptions, threatSystems]);

  const handleExportAll = useCallback(async () => {
    if (!mission || !mission.attacks.length || !fullCanvasRef.current) return;

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

    try {
      for (const attack of mission.attacks) {
        const card = buildKneeboardCard(mission, attack.id, weapons, fuzeOptions, threatSystems);
        if (!card) continue;
        renderKneeboardCard(fullCanvasRef.current, card);
        const base64 = canvasToBase64Png(fullCanvasRef.current);
        const filename = kneeboardFilename(card.header.callsign, card.header.targetName);
        const path = `${folder}/${filename}`;
        try {
          await invoke<void>('save_kneeboard_png', { path, base64Data: base64 });
          saved++;
        } catch (e) {
          errors.push(`${filename}: ${String(e)}`);
        }
      }
      setExportMsg(
        errors.length
          ? `Saved ${saved} card(s) with ${errors.length} error(s)`
          : `Saved ${saved} card(s) to folder`,
      );
    } catch (e) {
      setExportMsg(`Error: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [mission, weapons, fuzeOptions, threatSystems]);

  const handleExportToDCS = useCallback(async () => {
    if (!mission || !mission.attacks.length || !fullCanvasRef.current) return;

    setExporting(true);
    setExportMsg('Detecting DCS folder...');

    try {
      // Get aircraft from first attack to determine kneeboard folder
      const firstAttack = mission.attacks[0];
      const attacker = mission.flightMembers.find(m => m.id === firstAttack.attackerId);

      if (!attacker) {
        setExportMsg('Error: Could not find flight member for attack');
        setExporting(false);
        return;
      }

      const aircraftPath = getAircraftKneeboardPath(attacker.aircraftId);
      const dcsPath = await getDcsKneeboardPath(aircraftPath);

      let folder: string;
      if (dcsPath) {
        // DCS folder detected - use it
        folder = dcsPath;
        setExportMsg(`Exporting to DCS ${aircraftPath} folder...`);
      } else {
        // DCS not detected - fall back to folder picker
        setExportMsg('DCS folder not detected. Please select folder manually.');
        const selectedFolder = await open({
          directory: true,
          multiple: false,
          title: 'DCS not detected - select export folder',
        });

        if (!selectedFolder) {
          setExporting(false);
          return;
        }
        folder = selectedFolder;
      }

      // Export all cards to the selected/detected folder
      let saved = 0;
      const errors: string[] = [];

      for (const attack of mission.attacks) {
        const card = buildKneeboardCard(mission, attack.id, weapons, fuzeOptions, threatSystems);
        if (!card) continue;
        renderKneeboardCard(fullCanvasRef.current, card);
        const base64 = canvasToBase64Png(fullCanvasRef.current);
        const filename = kneeboardFilename(card.header.callsign, card.header.targetName);
        const path = `${folder}/${filename}`;
        try {
          await invoke<void>('save_kneeboard_png', { path, base64Data: base64 });
          saved++;
        } catch (e) {
          errors.push(`${filename}: ${String(e)}`);
        }
      }

      if (dcsPath) {
        setExportMsg(
          errors.length
            ? `Saved ${saved} cards to DCS with ${errors.length} error(s)`
            : `✓ Saved ${saved} cards to DCS ${aircraftPath} kneeboard folder`,
        );
      } else {
        setExportMsg(
          errors.length
            ? `Saved ${saved} card(s) with ${errors.length} error(s)`
            : `Saved ${saved} card(s) to folder`,
        );
      }
    } catch (e) {
      setExportMsg(`Error: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  }, [mission, weapons, fuzeOptions, threatSystems]);

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

        {exportMsg && (
          <div
            className={`text-xs rounded p-2 font-mono ${
              exportMsg.startsWith('Error') ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'
            }`}
          >
            {exportMsg}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Cards saved as 768×1024 PNG (DCS kneeboard format).
        Place in: <code className="font-mono">Saved Games/DCS/Kneeboard/F-16C/</code>
      </p>
    </div>
  );
}
