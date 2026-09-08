import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMissionStore } from "./stores/missionStore";
import { useTheaterStore, useTheaterInfo } from "./stores/theaterStore";
import { useProfileStore } from "./stores/profileStore";
import { FragOrdersImport } from "./components/import";
import { MapView } from "./components/map/MapView";
import { WaypointList } from "./components/waypoints/WaypointList";
import { ThreatList } from "./components/threats/ThreatList";
import { FlightRoster } from "./components/flights/FlightRoster";
import { AttackList } from "./components/attacks/AttackList";
import { KneeboardPreview } from "./components/kneeboard/KneeboardPreview";
import { UnsavedChangesDialog } from "./components/mission/UnsavedChangesDialog";
import { openMission, saveMission, saveMissionAs, type FileResult } from "./lib/missionFile";
import type { FragOrdersData, DbWeapon, FuzeOption } from "./types";

interface ThreatSystem {
  id: string;
  name: string;
  nato_designation: string | null;
  threat_type: string;
  max_range_nm: number;
  max_altitude_ft: number;
}

interface Aircraft {
  id: string;
  name: string;
  dcs_module_name: string;
}

type PanelType = 'waypoints' | 'threats' | 'flight' | 'attacks' | 'kneeboards';

const toolbarButton =
  'px-3 py-1.5 rounded-lg text-sm font-medium bg-dcs-blue hover:bg-blue-600 transition-colors';

function App() {
  const { mission, isDirty, createMission, closeMission, importFromFragOrders, updateThreat, focusAttackId, setFocusAttackId } =
    useMissionStore();
  const loadTheaters = useTheaterStore((state) => state.loadTheaters);
  const loadProfiles = useProfileStore((state) => state.loadProfiles);
  const theaterInfo = useTheaterInfo(mission?.theater);
  const [threats, setThreats] = useState<ThreatSystem[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [weapons, setWeapons] = useState<DbWeapon[]>([]);
  const [fuzeOptions, setFuzeOptions] = useState<Map<string, FuzeOption[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType | null>(null);
  const [threatPlacementCallback, setThreatPlacementCallback] = useState<((position: { lat: number; lon: number }) => void) | null>(null);
  // Action held back by the unsaved-changes guard, with the phrase shown to the user.
  const [pendingAction, setPendingAction] = useState<{ label: string; run: () => void } | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);

  const handleFragOrdersImport = (data: FragOrdersData, groupIndex: number) => {
    importFromFragOrders(data, groupIndex);
    setShowImportModal(false);
    setActivePanel(null); // Close any open panel after import
  };

  /**
   * Run `action`, but stop first if it would discard unsaved planning.
   *
   * Everything that replaces or drops the current mission goes through here —
   * New, Import, Open and Close. Without it an hour of threat placement and
   * attack profiles vanishes on a single click.
   */
  const guardUnsaved = (label: string, action: () => void) => {
    if (mission && isDirty) {
      setPendingAction({ label, run: action });
      return;
    }
    action();
  };

  const reportFileResult = (result: FileResult, verb: string) => {
    if (result.status === 'ok') {
      setFileMsg(`${verb}: ${result.path.split(/[/\\]/).pop()}`);
    } else if (result.status === 'error') {
      setFileMsg(`Error: ${result.message}`);
    }
  };

  const handleSave = async () => {
    setFileMsg(null);
    reportFileResult(await saveMission(), 'Saved');
  };

  const handleSaveAs = async () => {
    setFileMsg(null);
    reportFileResult(await saveMissionAs(), 'Saved');
  };

  const handleOpen = () => {
    guardUnsaved('open another mission', async () => {
      setFileMsg(null);
      const result = await openMission();
      if (result.status === 'ok') setActivePanel(null);
      reportFileResult(result, 'Opened');
    });
  };

  const handleImportClick = () => {
    guardUnsaved('import a new mission', () => setShowImportModal(true));
  };

  const handleCloseMission = () => {
    guardUnsaved('close this mission', () => {
      closeMission();
      setActivePanel(null);
      setFileMsg(null);
    });
  };

  // Cmd/Ctrl+S. There was no keyboard layer at all before this.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (useMissionStore.getState().mission) void handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Create threat system map for quick lookups
  const threatSystemMap = useMemo(() => {
    const map = new Map<string, ThreatSystem>();
    threats.forEach((threat) => map.set(threat.id, threat));
    return map;
  }, [threats]);

  useEffect(() => {
    async function loadDatabaseData() {
      try {
        const [threatData, aircraftData, weaponData] = await Promise.all([
          invoke<ThreatSystem[]>("get_all_threats"),
          invoke<Aircraft[]>("get_all_aircraft"),
          invoke<DbWeapon[]>("get_all_weapons"),
          loadTheaters(),
          loadProfiles(),
        ]);
        setThreats(threatData);
        setAircraft(aircraftData);
        setWeapons(weaponData);

        // Load fuze options for each weapon
        const fuzeMap = new Map<string, FuzeOption[]>();
        await Promise.all(
          weaponData.map(async (weapon) => {
            try {
              const fuzes = await invoke<FuzeOption[]>("get_fuze_options", { weaponId: weapon.id });
              if (fuzes.length > 0) {
                fuzeMap.set(weapon.id, fuzes);
              }
            } catch (e) {
              console.warn(`Failed to load fuze options for ${weapon.id}:`, e);
            }
          })
        );
        setFuzeOptions(fuzeMap);

        setLoading(false);
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    }
    loadDatabaseData();
  }, [loadTheaters, loadProfiles]);

  const handleNewMission = () => {
    guardUnsaved('start a new mission', () => createMission("New Mission", "caucasus"));
  };

  // Map interaction handlers
  const handleMoveThreat = (threatId: string, position: { lat: number; lon: number }) => {
    updateThreat(threatId, { position });
  };

  const handleRemoveThreat = (threatId: string) => {
    const { removeThreat } = useMissionStore.getState();
    removeThreat(threatId);
  };

  const handleRequestThreatPlacement = (callback: (position: { lat: number; lon: number }) => void) => {
    setThreatPlacementCallback(() => callback);
  };

  const handleMapClickForThreatPlacement = (position: { lat: number; lon: number }) => {
    if (threatPlacementCallback) {
      threatPlacementCallback(position);
      setThreatPlacementCallback(null); // Exit placement mode
    }
  };

  return (
    <div className="min-h-screen bg-dcs-dark text-white">
      <header className="bg-dcs-navy px-4 py-3 shadow-lg flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Phoenix Weaponeer</h1>
          <p className="text-gray-400 text-sm">DCS Mission Planning Tool</p>
        </div>

        <div className="flex items-center gap-3">
          {fileMsg && (
            <span
              className={`text-sm ${fileMsg.startsWith('Error') ? 'text-red-400' : 'text-gray-400'}`}
            >
              {fileMsg}
            </span>
          )}

          {mission && (
            <span className="text-sm text-gray-300 max-w-[16rem] truncate" title={mission.name}>
              {mission.name}
              {/* Unsaved-work indicator. */}
              {isDirty && <span className="text-dcs-accent ml-1">&#9679;</span>}
            </span>
          )}

          <div className="flex items-center gap-2">
            <button onClick={handleOpen} className={toolbarButton}>
              Open
            </button>
            {/*
              Import used to exist only on the no-mission landing screen, so
              once a mission was loaded there was no way back to it.
            */}
            <button onClick={handleImportClick} className={toolbarButton}>
              Import
            </button>
            {mission && (
              <>
                <button
                  onClick={handleSave}
                  disabled={!isDirty}
                  className={`${toolbarButton} disabled:opacity-40 disabled:hover:bg-dcs-blue`}
                  title="Save (Cmd/Ctrl+S)"
                >
                  Save
                </button>
                <button onClick={handleSaveAs} className={toolbarButton}>
                  Save As
                </button>
                <button onClick={handleCloseMission} className={toolbarButton}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="p-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Loading database...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400">Error: {error}</p>
          </div>
        ) : mission ? (
          <div className="relative h-[calc(100vh-120px)]">
            {/* Map - always visible as background */}
            <div className="absolute inset-0">
              <MapView
                theater={mission.theater}
                waypoints={mission.waypoints}
                threats={mission.threats}
                attacks={mission.attacks}
                bullseye={mission.bullseye}
                threatSystems={threatSystemMap}
                flightMembers={mission.flightMembers}
                focusAttackId={focusAttackId}
                onAttackFocused={() => setFocusAttackId(null)}
                onMoveThreat={handleMoveThreat}
                onRemoveThreat={handleRemoveThreat}
                isPlacementMode={!!threatPlacementCallback}
                onPlacePosition={handleMapClickForThreatPlacement}
              />
            </div>

            {/*
              Unverified projection warning.

              Positions on these maps are believed correct but have never been
              checked against a known landmark, so they could be systematically
              offset while still looking entirely plausible. Say so rather than
              letting a planner assume the coordinates are trustworthy.
            */}
            {theaterInfo && !theaterInfo.verified && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] max-w-2xl">
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/60 bg-amber-950/95 px-4 py-3 shadow-lg">
                  <svg
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <div className="text-sm">
                    <p className="font-semibold text-amber-200">
                      {theaterInfo.display_name}: coordinates unverified
                    </p>
                    <p className="text-amber-100/90">
                      This map's projection has not been checked against a known
                      landmark. Confirm a waypoint against the DCS F10 map before
                      flying these cards.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Panel toggle buttons - floating on left side */}
            <div className="absolute left-4 top-4 z-[1000] flex flex-col gap-2">
              <button
                onClick={() => setActivePanel(activePanel === 'waypoints' ? null : 'waypoints')}
                className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-colors ${
                  activePanel === 'waypoints'
                    ? 'bg-dcs-accent text-white'
                    : 'bg-dcs-navy text-gray-300 hover:bg-dcs-blue'
                }`}
              >
                Waypoints ({mission.waypoints.length})
              </button>
              <button
                onClick={() => setActivePanel(activePanel === 'threats' ? null : 'threats')}
                className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-colors ${
                  activePanel === 'threats'
                    ? 'bg-dcs-accent text-white'
                    : 'bg-dcs-navy text-gray-300 hover:bg-dcs-blue'
                }`}
              >
                Threats ({mission.threats.length})
              </button>
              <button
                onClick={() => setActivePanel(activePanel === 'flight' ? null : 'flight')}
                className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-colors ${
                  activePanel === 'flight'
                    ? 'bg-dcs-accent text-white'
                    : 'bg-dcs-navy text-gray-300 hover:bg-dcs-blue'
                }`}
              >
                Flight ({mission.flightMembers.length})
              </button>
              <button
                onClick={() => setActivePanel(activePanel === 'attacks' ? null : 'attacks')}
                className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-colors ${
                  activePanel === 'attacks'
                    ? 'bg-dcs-accent text-white'
                    : 'bg-dcs-navy text-gray-300 hover:bg-dcs-blue'
                }`}
              >
                Attacks ({mission.attacks.length})
              </button>
              <button
                onClick={() => setActivePanel(activePanel === 'kneeboards' ? null : 'kneeboards')}
                className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-colors ${
                  activePanel === 'kneeboards'
                    ? 'bg-dcs-accent text-white'
                    : 'bg-dcs-navy text-gray-300 hover:bg-dcs-blue'
                }`}
              >
                Kneeboards
              </button>
            </div>

            {/* Right sidebar panel - slides in when active */}
            {activePanel && (
              <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-dcs-navy shadow-2xl z-[1000] overflow-y-auto">
                {/* Panel header */}
                <div className="sticky top-0 bg-dcs-blue p-4 flex justify-between items-center shadow-md z-10">
                  <h2 className="text-xl font-semibold capitalize">{activePanel}</h2>
                  <button
                    onClick={() => setActivePanel(null)}
                    className="text-gray-400 hover:text-white text-2xl w-8 h-8 flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>

                {/* Panel content */}
                <div className="p-4">
                  {activePanel === 'waypoints' && <WaypointList />}
                  {activePanel === 'threats' && <ThreatList threatSystems={threatSystemMap} availableThreats={threats} onRequestPlacement={handleRequestThreatPlacement} />}
                  {activePanel === 'flight' && <FlightRoster aircraft={aircraft} />}
                  {activePanel === 'attacks' && <AttackList weapons={weapons} fuzeOptions={fuzeOptions} aircraft={aircraft} threatSystems={threats} onAttackSaved={() => setActivePanel(null)} />}
                  {activePanel === 'kneeboards' && (
                    <KneeboardPreview
                      weapons={weapons}
                      fuzeOptions={fuzeOptions}
                      threatSystems={threats}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">No mission loaded</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleNewMission}
                  className="bg-dcs-accent hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Create New Mission
                </button>
                <button
                  onClick={handleImportClick}
                  className="bg-dcs-blue hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Import FragOrders
                </button>
                <button
                  onClick={handleOpen}
                  className="bg-dcs-blue hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Open Saved Mission
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-dcs-navy rounded-lg p-4">
                <h3 className="font-medium mb-3 text-dcs-accent">Threat Database ({threats.length})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {threats.map((threat) => (
                    <div key={threat.id} className="bg-dcs-dark rounded p-2 text-sm">
                      <span className="font-medium">{threat.name}</span>
                      {threat.nato_designation && (
                        <span className="text-gray-400 ml-2">({threat.nato_designation})</span>
                      )}
                      <span className="text-gray-500 ml-2">
                        {threat.threat_type} - {threat.max_range_nm}nm
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-dcs-navy rounded-lg p-4">
                <h3 className="font-medium mb-3 text-dcs-accent">Aircraft Database ({aircraft.length})</h3>
                <div className="space-y-2">
                  {aircraft.map((ac) => (
                    <div key={ac.id} className="bg-dcs-dark rounded p-2 text-sm">
                      <span className="font-medium">{ac.name}</span>
                      <span className="text-gray-400 ml-2">({ac.dcs_module_name})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showImportModal && (
        <FragOrdersImport
          onClose={() => setShowImportModal(false)}
          onImport={handleFragOrdersImport}
        />
      )}

      {pendingAction && (
        <UnsavedChangesDialog
          actionLabel={pendingAction.label}
          onProceed={() => {
            const { run } = pendingAction;
            setPendingAction(null);
            run();
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}

export default App;
