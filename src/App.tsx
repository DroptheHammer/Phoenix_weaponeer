import { useState, useEffect, useMemo, useRef } from "react";
import { platform } from "@platform";
import { useMissionStore } from "./stores/missionStore";
import { useTheaterStore, useTheaterInfo } from "./stores/theaterStore";
import { useProfileStore } from "./stores/profileStore";
import { useUiStore } from "./stores/uiStore";
import { useVisibleMission } from "./hooks/useVisibleMission";
import { FragOrdersPreview } from "./components/import/FragOrdersPreview";
import { Modal } from "./components/common/Modal";
import { FrontPage } from "./components/landing/FrontPage";
import { W } from "./components/landing/words";
import { adoptSavedMission } from "./lib/landing/platformBindings";
import type { LoadOutcome } from "./lib/landing/loadRouter";
import { MapView } from "./components/map/MapView";
import { WaypointList } from "./components/waypoints/WaypointList";
import { ThreatList } from "./components/threats/ThreatList";
import { FlightRoster } from "./components/flights/FlightRoster";
import { AttackList } from "./components/attacks/AttackList";
import { KneeboardPreview } from "./components/kneeboard/KneeboardPreview";
import { UnsavedChangesDialog } from "./components/mission/UnsavedChangesDialog";
import { SettingsModal } from "./components/settings/SettingsModal";
import { useSettingsStore } from "./stores/settingsStore";
import { PhoneShell, type PhoneMenuItem, type PhoneTab } from "./components/phone/PhoneShell";
import { useIsPhone } from "./hooks/useIsPhone";
import { flushAutosave, isAutosaved, useAutosave } from "./stores/localMissionStore";
import { MISSION_FILE_GONE, openLocalMission, openMission, openMissionAt, saveMission, saveMissionAs, type FileResult } from "./lib/missionFile";
import type { FragOrdersData, DbWeapon, FuzeOption, Mission } from "./types";
import { StrikeNearMe } from "./components/mission/StrikeNearMe";
import { isRealWorld } from "./lib/strikeNearMe";

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
  /** The database's guess at the DCS kneeboard folder name; only aims the folder picker. */
  kneeboard_path: string;
}

type PanelType = 'waypoints' | 'threats' | 'flight' | 'attacks' | 'kneeboards';

/** What fills the window: the front page (always, with no mission), or the planner's map. */
type Screen = 'front' | 'map';

/** The "Choose your flight" dialog's Escape while the "Unsaved changes" dialog stands over it. */
const noop = () => {};

/**
 * "Strike near me" needs the phone's GPS, so it is a web-build feature; the
 * desktop app, with no GPS and a squadron's real missions, leaves it out.
 */
const STRIKE_NEAR_ME_AVAILABLE = platform.isWeb;

const toolbarButton =
  'px-3 py-1.5 rounded-lg text-sm font-medium bg-dcs-blue hover:bg-blue-600 transition-colors';

function App() {
  const { mission, isDirty, createMission, loadMission, closeMission, importFromFragOrders, updateThreat, moveAttackCustomIp, focusAttackId, setFocusAttackId } =
    useMissionStore();
  const hiddenAttackerIds = useUiStore((state) => state.hiddenAttackerIds);
  const resetDisplayFilter = useUiStore((state) => state.resetFilter);
  const selectedAttackId = useUiStore((state) => state.selectedAttackId);
  // Author-hidden threats removed unless revealed (⚙ Settings → Admin).
  const visibleMission = useVisibleMission();
  const loadTheaters = useTheaterStore((state) => state.loadTheaters);
  const loadProfiles = useProfileStore((state) => state.loadProfiles);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const theaterInfo = useTheaterInfo(mission?.theater);
  const [threats, setThreats] = useState<ThreatSystem[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [weapons, setWeapons] = useState<DbWeapon[]>([]);
  const [fuzeOptions, setFuzeOptions] = useState<Map<string, FuzeOption[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // The front page shows whenever no mission is open, and also when the planner goes back to it with one open.
  const [screen, setScreen] = useState<Screen>('front');
  // Where "Open now" on the front page goes back to: the screen the planner left for it.
  const [returnTo, setReturnTo] = useState<Exclude<Screen, 'front'>>('map');
  // A FragOrders link or file the load box has read: "Choose your flight" is open over the front page.
  const [chooser, setChooser] = useState<{ data: FragOrdersData; via: 'link' | 'link-payload' | 'cli-export' } | null>(null);
  const loadField = useRef<HTMLInputElement>(null);
  const [showStrikeNearMe, setShowStrikeNearMe] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType | null>(null);
  const mapPick = useUiStore((state) => state.mapPick);
  // Action held back by the unsaved-changes guard, with the phrase shown to the user.
  const [pendingAction, setPendingAction] = useState<{ label: string; run: () => void } | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  // The web build's phone layout (the desktop window can never be this small).
  const isPhone = useIsPhone();
  // The web build keeps every mission in this browser as it changes ("My missions").
  useAutosave(platform.isWeb);

  const shown: Screen = mission ? screen : 'front';
  const typeOf = useMemo(() => new Map(threats.map((t) => [t.id, t.threat_type])), [threats]);

  // Every load lands on the map, with no panel open and the display filter cleared.
  const afterLoad = () => {
    setActivePanel(null);
    resetDisplayFilter();
    setFileMsg(null);
    setScreen('map');
  };

  // To the front page with the mission kept: remember where the planner was, for the "Open now" card.
  const toFront = () => {
    if (shown !== 'front') setReturnTo(shown);
    setScreen('front');
    requestAnimationFrame(() => loadField.current?.focus());
  };

  /**
   * Run `action`, but stop first if it would discard unsaved planning.
   *
   * Everything that replaces or drops the current mission goes through here —
   * New, Import, Open and Close. Without it an hour of threat placement and
   * attack profiles vanishes on a single click.
   */
  const guardUnsaved = (label: string, action: () => void) => {
    if (platform.isWeb) {
      // The web build autosaves, so leaving a mission loses nothing once the
      // last change is stored. Only a failed autosave still asks.
      void flushAutosave().then(() => {
        const { mission: current, isDirty: dirty } = useMissionStore.getState();
        if (current && dirty && !isAutosaved(current)) setPendingAction({ label, run: action });
        else action();
      });
      return;
    }
    if (mission && isDirty) {
      setPendingAction({ label, run: action });
      return;
    }
    action();
  };

  // Closing the window — the X, Alt+F4, Cmd+Q, or closing the browser tab — is
  // the easiest way of all to lose an hour of planning, so it gets the same
  // guard (see `guardClose` in src/lib/platform). The check runs at the moment
  // of closing, so it reads the store rather than this render's closure.
  useEffect(
    () =>
      platform.guardClose(
        () => {
          const { mission: current, isDirty: dirty } = useMissionStore.getState();
          return Boolean(current && dirty && !(platform.isWeb && isAutosaved(current)));
        },
        (finish) =>
          setPendingAction({
            label: 'quit',
            run: () => {
              finish().catch((e) => setFileMsg(`Error: could not close the window: ${String(e)}`));
            },
          }),
      ),
    [],
  );

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

  const afterOpen = (result: FileResult) => {
    if (result.status === 'ok') {
      setActivePanel(null);
      resetDisplayFilter();
      setScreen('map');
    }
    reportFileResult(result, 'Opened');
  };

  // What the front page's load box read. A FragOrders mission opens "Choose your flight" and replaces nothing
  // yet; a saved mission is adopted at once, after the unsaved-changes guard, exactly as Open adopts one.
  const handleOutcome = (outcome: Exclude<LoadOutcome, { kind: 'error' }>) => {
    if (outcome.kind === 'fragorders') {
      setChooser({ data: outcome.data, via: outcome.via });
      return;
    }
    guardUnsaved('open another mission', () => {
      adoptSavedMission(outcome.mission, outcome.path);
      afterLoad();
    });
  };

  // The guard runs with "Choose your flight" still open, and it stays mounted until the import runs, so
  // Cancel in "Unsaved changes" comes back to it with the flight still chosen.
  const handleChooserImport = (groupIndex: number) => {
    const current = chooser;
    if (!current) return;
    guardUnsaved('import a new mission', () => {
      importFromFragOrders(current.data, groupIndex);
      setChooser(null);
      afterLoad();
    });
  };

  // Back from "Choose your flight": the front page as it was, the link or text still in the box.
  const closeChooser = () => {
    setChooser(null);
    requestAnimationFrame(() => loadField.current?.focus());
  };

  const handleOpen = () => {
    guardUnsaved('open another mission', async () => {
      setFileMsg(null);
      afterOpen(await openMission());
    });
  };

  // A recent mission that has been moved or deleted drops off the list.
  const handleOpenRecent = (path: string) => {
    guardUnsaved('open another mission', async () => {
      setFileMsg(null);
      const result = await openMissionAt(path);
      if (result.status === 'error' && result.message === MISSION_FILE_GONE) {
        void useSettingsStore.getState().forgetRecentMission(path);
      }
      afterOpen(result);
    });
  };

  // A mission autosaved in this browser (web build).
  const handleOpenLocal = (id: string) => {
    guardUnsaved('open another mission', async () => {
      setFileMsg(null);
      afterOpen(await openLocalMission(id));
    });
  };

  // Import (desktop header) and "Load a mission" (phone menu) go to the front page's load box. Nothing is
  // replaced yet, so no guard here: the guard runs when a load is about to replace the open mission.
  const handleImportClick = () => toFront();

  const handleCloseMission = () => {
    guardUnsaved('close this mission', () => {
      closeMission();
      resetDisplayFilter();
      setActivePanel(null);
      setFileMsg(null);
      setScreen('front');
    });
  };

  // Cmd/Ctrl+S saves; Cmd/Ctrl+Z undoes, and Shift+Z (or Ctrl+Y) redoes. There
  // was no keyboard layer at all before this.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (useMissionStore.getState().mission) void handleSave();
      } else if (key === 'z' || key === 'y') {
        // A text box keeps the browser's own undo for what is typed in it, and
        // an open dialog (the attack editor works on a draft) must not have the
        // mission change under it.
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (document.querySelector('[role="dialog"]')) return;
        event.preventDefault();
        const { undo, redo } = useMissionStore.getState();
        if (key === 'y' || event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // How many of the mission's attacks belong to a hidden attacker — surfaced
  // on the Attacks rail button so a hidden pilot is never forgotten silently.
  const hiddenAttackCount = useMemo(
    () => mission?.attacks.filter((a) => hiddenAttackerIds.includes(a.attackerId)).length ?? 0,
    [mission, hiddenAttackerIds],
  );

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
          platform.call<ThreatSystem[]>("get_all_threats"),
          platform.call<Aircraft[]>("get_all_aircraft"),
          platform.call<DbWeapon[]>("get_all_weapons"),
          loadTheaters(),
          loadProfiles(),
          // Never throws: a settings problem is shown in Settings, not here.
          loadSettings(),
        ]);
        setThreats(threatData);
        setAircraft(aircraftData);
        setWeapons(weaponData);

        // Load fuze options for each weapon
        const fuzeMap = new Map<string, FuzeOption[]>();
        await Promise.all(
          weaponData.map(async (weapon) => {
            try {
              const fuzes = await platform.call<FuzeOption[]>("get_fuze_options", { weaponId: weapon.id });
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

  // "Strike near me" (lib/strikeNearMe.ts): plan on a real place the phone's GPS finds.
  const handleStrikeNearMe = () => {
    guardUnsaved('start a new mission', () => setShowStrikeNearMe(true));
  };

  const handleStrikeNearMeCreated = (created: Mission) => {
    loadMission(created);
    setShowStrikeNearMe(false);
    afterLoad();
  };

  const handleNewMission = () => {
    guardUnsaved('start a new mission', () => {
      createMission("New Mission", "caucasus");
      afterLoad();
    });
  };

  // Map interaction handlers
  const handleMoveThreat = (threatId: string, position: { lat: number; lon: number }) => {
    updateThreat(threatId, { position });
  };

  const handleRemoveThreat = (threatId: string) => {
    const { removeThreat } = useMissionStore.getState();
    removeThreat(threatId);
  };

  // A saved attack's custom IP, dragged on the map — mirrors handleMoveThreat.
  const handleMoveCustomIp = (attackId: string, position: { lat: number; lon: number }) => {
    moveAttackCustomIp(attackId, position);
  };

  // ---- Shared by the desktop and phone layouts ----

  const mapView = mission && (
    <MapView
      theater={mission.theater}
      waypoints={mission.waypoints}
      threats={visibleMission?.threats ?? []}
      attacks={mission.attacks}
      bullseye={mission.bullseye}
      threatSystems={threatSystemMap}
      flightMembers={mission.flightMembers}
      selectedAttackId={selectedAttackId}
      focusAttackId={focusAttackId}
      onAttackFocused={() => setFocusAttackId(null)}
      onMoveThreat={handleMoveThreat}
      onRemoveThreat={handleRemoveThreat}
      onMoveCustomIp={handleMoveCustomIp}
    />
  );

  /*
    Unverified projection warning.

    Positions on these maps are believed correct but have never been
    checked against a known landmark, so they could be systematically
    offset while still looking entirely plausible. Say so rather than
    letting a planner assume the coordinates are trustworthy.
  */
  const unverifiedBanner = isRealWorld(mission) ? (
    // "Strike near me": positions are exact, but no DCS map has them.
    <div className="rounded-lg border border-sky-500/60 bg-sky-950/95 px-4 py-2 shadow-lg text-sm">
      <p className="font-semibold text-sky-200">Real world: can't be flown in DCS</p>
      <p className="text-sky-100/90">Planned on a real place for fun. The location stays on this device.</p>
    </div>
  ) : theaterInfo && !theaterInfo.verified && (
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
  );

  const renderPanel = (panel: PanelType) => {
    switch (panel) {
      case 'waypoints':
        return <WaypointList />;
      case 'threats':
        return <ThreatList threatSystems={threatSystemMap} availableThreats={threats} />;
      case 'flight':
        return <FlightRoster aircraft={aircraft} weapons={weapons} />;
      case 'attacks':
        return <AttackList weapons={weapons} fuzeOptions={fuzeOptions} aircraft={aircraft} threatSystems={threats} onAttackSaved={() => setActivePanel(null)} />;
      case 'kneeboards':
        return (
          <KneeboardPreview
            weapons={weapons}
            fuzeOptions={fuzeOptions}
            threatSystems={threats}
            aircraft={aircraft}
            onOpenSettings={() => setShowSettings(true)}
          />
        );
    }
  };

  const dialogs = (
    <>
      {showSettings && <SettingsModal aircraft={aircraft} onClose={() => setShowSettings(false)} />}

      {/* Before the "Unsaved changes" dialog, on purpose: a dialog drawn later stands on top, and that one must
          stand over this one, which stays open under it and ignores Escape until it is answered. */}
      {chooser && (
        <Modal title={W.chooseTitle} widthClass="w-[min(720px,calc(100vw-48px))]" onClose={pendingAction ? noop : closeChooser}>
          <FragOrdersPreview data={chooser.data} onBack={closeChooser} onImport={handleChooserImport} />
        </Modal>
      )}

      {showStrikeNearMe && (
        <StrikeNearMe
          aircraft={aircraft}
          onCreate={handleStrikeNearMeCreated}
          onClose={() => setShowStrikeNearMe(false)}
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
    </>
  );

  const frontPage = (
    <FrontPage
      phone={isPhone}
      web={platform.isWeb}
      openMission={mission}
      onOutcome={handleOutcome}
      onContinue={() => setScreen(returnTo)}
      onOpenFile={handleOpenRecent}
      onOpenLocal={handleOpenLocal}
      onNewMission={handleNewMission}
      onStrikeNearMe={STRIKE_NEAR_ME_AVAILABLE ? handleStrikeNearMe : undefined}
      aircraft={aircraft}
      typeOf={typeOf}
      busy={chooser !== null}
      loadFieldRef={loadField}
    />
  );

  // In the browser "Save" hands over a file, so it says so.
  const saveLabel = platform.isWeb ? 'Export .json' : 'Save';

  // ---- Phone layout (web build only) ----

  if (isPhone) {
    const phoneTabs: PhoneTab<PanelType>[] = mission && shown === 'map'
      ? [
          { id: 'waypoints', label: 'Route', badge: String(mission.waypoints.length) },
          { id: 'threats', label: 'Threats', badge: String(visibleMission?.threats.length ?? 0) },
          { id: 'flight', label: 'Flight', badge: String(mission.flightMembers.length) },
          { id: 'attacks', label: 'Attacks', badge: hiddenAttackCount > 0 ? `${mission.attacks.length} · ${hiddenAttackCount} hid` : String(mission.attacks.length) },
          { id: 'kneeboards', label: 'Cards' },
        ]
      : [];
    // The front page holds the load box, so its menu leads with what the page has not got; the map's menu
    // leads with the way back to the load box.
    const strikeItem = STRIKE_NEAR_ME_AVAILABLE ? [{ label: W.strikeNearMe, onClick: handleStrikeNearMe }] : [];
    const settingsItem = { label: 'Settings', onClick: () => setShowSettings(true) };
    const phoneMenu: PhoneMenuItem[] = shown === 'front'
      ? [
          { label: W.createNew, onClick: handleNewMission },
          ...strikeItem,
          ...(mission ? [{ label: 'Close mission', onClick: handleCloseMission }] : []),
          settingsItem,
        ]
      : [
          { label: W.heroTitle, onClick: handleImportClick },
          { label: W.createNew, onClick: handleNewMission },
          ...strikeItem,
          { label: 'Export .json', onClick: () => void handleSaveAs() },
          { label: 'Close mission', onClick: handleCloseMission },
          settingsItem,
        ];

    return (
      <>
        <PhoneShell<PanelType>
          title={mission && shown === 'map' ? mission.name : 'Phoenix Weaponeer'}
          dirty={Boolean(mission && isDirty)}
          menu={phoneMenu}
          message={fileMsg}
          onDismissMessage={() => setFileMsg(null)}
          // Only over the map: on the front page it would cover the page's own lines.
          banner={shown === 'map' ? unverifiedBanner : undefined}
          tabs={shown === 'map' ? phoneTabs : undefined}
          activeTab={activePanel}
          onTab={setActivePanel}
          panel={activePanel && shown === 'map' ? renderPanel(activePanel) : undefined}
          hidePanel={Boolean(mapPick)}
          fullTabs={['kneeboards']}
        >
          {loading ? (
            <p className="text-center text-gray-400 py-12">Loading…</p>
          ) : error ? (
            <p className="text-center text-red-400 py-12 px-4">Error: {error}</p>
          ) : shown === 'map' ? (
            <div className="absolute inset-0">{mapView}</div>
          ) : (
            <div className="absolute inset-0 flex flex-col">{frontPage}</div>
          )}
        </PhoneShell>
        {dialogs}
      </>
    );
  }

  // ---- Desktop layout (and the web build on a large screen) ----

  // The front page fills the window under the header and scrolls on its own; the map keeps its own layout.
  const onFront = shown === 'front' && !loading && !error;
  return (
    <div className={onFront ? 'flex h-screen flex-col bg-dcs-dark text-white' : 'min-h-screen bg-dcs-dark text-white'}>
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
            <button onClick={() => setShowSettings(true)} className={toolbarButton} title="Settings">
              ⚙ Settings
            </button>
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
                  title={platform.isWeb ? 'Download the mission as a .json file' : 'Save (Cmd/Ctrl+S)'}
                >
                  {saveLabel}
                </button>
                {/* In the browser every save is a fresh download, so Save As would be the same button. */}
                {!platform.isWeb && (
                  <button onClick={handleSaveAs} className={toolbarButton}>
                    Save As
                  </button>
                )}
                <button onClick={handleCloseMission} className={toolbarButton}>
                  Close
                </button>
              </>
            )}
            {/*
              Full screen on macOS hides the window's own buttons, and not every
              pilot knows Cmd+Q. `exit_app` quits outright (lib.rs lets it
              through), so the unsaved-changes guard runs here first. A web
              page is closed like any other tab.
            */}
            {!platform.isWeb && (
              <button
                onClick={() => guardUnsaved('quit', () => platform.quit())}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-300 border border-gray-600 hover:bg-gray-700 hover:text-white transition-colors"
                title="Quit Phoenix Weaponeer"
              >
                Quit
              </button>
            )}
          </div>
        </div>
      </header>

      {onFront ? (
        <main className="flex min-h-0 flex-1 flex-col">{frontPage}</main>
      ) : (
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
            <div className="absolute inset-0">{mapView}</div>

            {unverifiedBanner && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] max-w-2xl">{unverifiedBanner}</div>
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
                Threats ({visibleMission?.threats.length ?? 0})
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
                Attacks ({mission.attacks.length}{hiddenAttackCount > 0 ? ` · ${hiddenAttackCount} hidden` : ''})
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

            {/* Right sidebar panel - slides in when active. Hidden (not unmounted —
                an open AttackEditor must survive) while the map is waiting for a
                placement click, so the click can land anywhere including the
                strip the panel normally covers. */}
            {activePanel && (
              <div className={`absolute right-0 top-0 bottom-0 w-1/3 bg-dcs-navy shadow-2xl z-[1000] overflow-y-auto ${mapPick ? 'hidden' : ''}`}>
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
                <div className="p-4">{renderPanel(activePanel)}</div>
              </div>
            )}
          </div>
        ) : null}
      </main>
      )}

      {dialogs}
    </div>
  );
}

export default App;
