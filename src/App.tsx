import { lazy, Suspense, useState, useEffect, useMemo, useRef, type ComponentProps } from "react";
import { platform } from "@platform";
import { useMissionStore } from "./stores/missionStore";
import { useTheaterStore, useTheaterInfo } from "./stores/theaterStore";
import { useProfileStore } from "./stores/profileStore";
import { useUiStore } from "./stores/uiStore";
import { useVisibleMission } from "./hooks/useVisibleMission";
// Types only: the flight chooser's and the Flight overview's code is loaded when a load needs it, not at start-up.
import type { FragOrdersPreview } from "./components/import/FragOrdersPreview";
import type { FlightOverviewProps } from "./components/landing/FlightOverview";
import { overviewWhere, type ImportContext } from "./components/landing/overviewWhere";
import { Modal } from "./components/common/Modal";
import { Button } from "./components/ui/Button";
import { FrontPage } from "./components/landing/FrontPage";
import { W } from "./components/landing/words";
import { adoptSavedMission } from "./lib/landing/platformBindings";
import type { LoadOutcome } from "./lib/landing/loadRouter";
import { phoneHeader } from "./lib/landing/phoneHeader";
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
import { AppBar, AppBarPrimary, BackLink, HeaderWhere, type AppBarProps } from "./components/shell/AppBar";
import type { FileMenuItem } from "./components/shell/FileMenu";
import { flightGroupOf } from "./lib/callsign";

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

/**
 * What fills the window: the front page (always, with no mission), the Flight overview (where every load lands),
 * or the planner's map.
 */
type Screen = 'front' | 'overview' | 'map';

const noop = () => {};

/**
 * What stands in for the flight chooser when its code cannot be loaded (a browser tab left open across a site
 * update, a broken install): it says so and offers the way back, rather than throwing to the root error boundary
 * and blanking the app.
 */
function ChooserUnavailable({ onBack }: ComponentProps<typeof FragOrdersPreview>) {
  return (
    <Modal title={W.chooseTitle} onClose={onBack}>
      <p className="text-ui-body text-ink-2">{W.chooserFailed}</p>
      <div className="mt-4 flex justify-end">
        <Button variant="quiet" icon="chev-left" onClick={onBack}>{W.back}</Button>
      </div>
    </Modal>
  );
}

const FlightChooser = lazy(() =>
  import("./components/import/FragOrdersPreview")
    .then((m) => ({ default: m.FragOrdersPreview }))
    .catch(() => ({ default: ChooserUnavailable })),
);

/**
 * What stands in for the Flight overview when its code cannot be loaded: it says so, and offers the map, which is
 * already loaded, instead of blanking the app.
 */
function OverviewUnavailable({ onOpenMap }: FlightOverviewProps) {
  return (
    <div className="m-auto grid max-w-md justify-items-center gap-3 p-6 text-center">
      <p className="text-ui-body text-ink-2">{W.overviewFailed}</p>
      <Button variant="primary" icon="map" onClick={onOpenMap}>{W.openMap}</Button>
    </div>
  );
}

const FlightOverview = lazy(() =>
  import("./components/landing/FlightOverview")
    .then((m) => ({ default: m.FlightOverview }))
    .catch(() => ({ default: OverviewUnavailable })),
);

/**
 * "Strike near me" needs the phone's GPS, so it is a web-build feature; the
 * desktop app, with no GPS and a squadron's real missions, leaves it out.
 */
const STRIKE_NEAR_ME_AVAILABLE = platform.isWeb;

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
  const [returnTo, setReturnTo] = useState<Exclude<Screen, 'front'>>('overview');
  // What only an import knows (how many player flights the mission had, whether it came by link), for the
  // overview's lines. Cleared by any other load and by Close.
  const [importContext, setImportContext] = useState<ImportContext | null>(null);
  // The waypoint the overview's threat block is about, when the planner picked one: per mission, for this session.
  const [overviewWaypoint, setOverviewWaypoint] = useState<{ missionId: string; waypointId: string } | null>(null);
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
  // The overview reads the visible mission through these (Settings > Admin's reveal switches, and the databases).
  const reveal = useUiStore((state) => state.revealHidden);
  const refs = useMemo(() => ({ threatSystems: threats, aircraft, weapons, fuzeOptions }), [threats, aircraft, weapons, fuzeOptions]);

  // Fetch the two screens that load on demand once the page is up, so they are there when a load wants them. A
  // failure here is silent: the lazy load above says so when the screen is opened.
  useEffect(() => {
    const timer = setTimeout(() => {
      void import("./components/landing/FlightOverview").catch(noop);
      void import("./components/import/FragOrdersPreview").catch(noop);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Every load lands on the overview (an empty new mission on the map, having nothing to overview), with no
  // panel open and the display filter cleared.
  const afterLoad = (to: Exclude<Screen, 'front'>) => {
    setActivePanel(null);
    resetDisplayFilter();
    setFileMsg(null);
    setScreen(to);
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
      setImportContext(null);
      setScreen('overview');
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
      setImportContext(null);
      afterLoad('overview');
    });
  };

  // The guard runs with "Choose your flight" still open, and it stays mounted until the import runs, so
  // Cancel in "Unsaved changes" comes back to it with the flight still chosen.
  const handleChooserImport = (groupIndex: number) => {
    const current = chooser;
    if (!current) return;
    guardUnsaved('import a new mission', () => {
      importFromFragOrders(current.data, groupIndex);
      const id = useMissionStore.getState().mission?.id;
      setImportContext(id ? { missionId: id, playerFlights: current.data.player_groups.length, via: current.via } : null);
      setChooser(null);
      afterLoad('overview');
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
      setImportContext(null);
      setOverviewWaypoint(null);
    });
  };

  // From the overview to the map: with no panel open, or with the Threats panel open.
  const openMap = () => {
    setActivePanel(null);
    setScreen('map');
  };
  const openThreatsOnMap = () => {
    setActivePanel('threats');
    setScreen('map');
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
    setImportContext(null);
    afterLoad('overview');
  };

  const handleNewMission = () => {
    guardUnsaved('start a new mission', () => {
      createMission("New Mission", "caucasus");
      setImportContext(null);
      afterLoad('map');
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
          stand over this one, which stays open under it and takes no Escape until it is answered. */}
      {chooser && (
        <Suspense fallback={null}>
          <FlightChooser
            data={chooser.data}
            aircraft={aircraft}
            phone={isPhone}
            suspended={pendingAction !== null}
            onBack={closeChooser}
            onImport={handleChooserImport}
          />
        </Suspense>
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

  // The place a mission is planned on, as the headers name it.
  const place = mission ? (isRealWorld(mission) ? 'Real world' : theaterInfo?.display_name ?? '') : '';
  // The overview's "where you are" for the header: the flight, its jets, and a line with the mission and place.
  const where = mission && shown === 'overview' ? overviewWhere(mission, aircraft, importContext, place, new Date()) : null;

  const overview = mission && (
    <Suspense fallback={<div className="flex-1" />}>
      <FlightOverview
        mission={mission}
        reveal={reveal}
        refs={refs}
        importContext={importContext}
        chosenWaypointId={overviewWaypoint?.missionId === mission.id ? overviewWaypoint.waypointId : null}
        onChooseWaypoint={(id) => setOverviewWaypoint({ missionId: mission.id, waypointId: id })}
        onOpenMap={openMap}
        onOpenThreats={openThreatsOnMap}
        phone={isPhone}
      />
    </Suspense>
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
    // The front page holds the load box, so its menu leads with what the page has not got; the overview's menu
    // leads with the way back to the load box, and the map's with the way back to the overview.
    const strikeItem = STRIKE_NEAR_ME_AVAILABLE ? [{ label: W.strikeNearMe, onClick: handleStrikeNearMe }] : [];
    const settingsItem = { label: 'Settings', onClick: () => setShowSettings(true) };
    const overviewMenu: PhoneMenuItem[] = [
      { label: W.heroTitle, onClick: handleImportClick },
      { label: W.createNew, onClick: handleNewMission },
      ...strikeItem,
      { label: 'Export .json', onClick: () => void handleSaveAs() },
      { label: 'Close mission', onClick: handleCloseMission },
      settingsItem,
    ];
    const phoneMenu: PhoneMenuItem[] = shown === 'front'
      ? [
          { label: W.createNew, onClick: handleNewMission },
          ...strikeItem,
          ...(mission ? [{ label: 'Close mission', onClick: handleCloseMission }] : []),
          settingsItem,
        ]
      : shown === 'overview'
        ? overviewMenu
        : [{ label: 'Flight overview', onClick: () => setScreen('overview') }, ...overviewMenu];

    const header = phoneHeader(mission ? mission.name : null, shown === 'map', isDirty, 'Phoenix Weaponeer', where);

    return (
      <>
        <PhoneShell<PanelType>
          title={header.title}
          subtitle={header.subtitle}
          onBack={shown === 'overview' ? toFront : undefined}
          dirty={header.dirty}
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
          ) : shown === 'overview' ? (
            <div className="absolute inset-0 flex flex-col">{overview}</div>
          ) : (
            <div className="absolute inset-0 flex flex-col">{frontPage}</div>
          )}
        </PhoneShell>
        {dialogs}
      </>
    );
  }

  // ---- Desktop layout (and the web build on a large screen) ----

  // ---- The header (AppBar): what it says on each screen ----
  const dirtyWords = platform.isWeb ? 'Not exported' : 'Unsaved changes';
  const flightName = mission?.flightMembers[0] ? flightGroupOf(mission.flightMembers[0].callsign) : '';
  // The planner's way back to the Flight overview (a back link and a File row). Neither is drawn
  // until this is set, which comes with the planner's own new frame; the phone's menu has it already.
  const openOverview: (() => void) | undefined = undefined;
  const openItem: FileMenuItem = { id: 'open', label: 'Open', sub: platform.isWeb ? 'Open a .json file' : 'Open a saved mission', icon: 'folder', onSelect: handleOpen };
  // Import goes to the front page's load box (handleImportClick), which replaces nothing until a load runs.
  const importItem: FileMenuItem = { id: 'import', label: 'Import', sub: 'Load a FragOrders link or file', icon: 'drop', onSelect: handleImportClick };
  // In the browser every save is a fresh download, so Save As would be the same as Save.
  const saveAsItems: FileMenuItem[] = platform.isWeb ? [] : [{ id: 'save-as', label: 'Save As', sub: 'Save a copy under a new name', icon: 'save', onSelect: () => void handleSaveAs() }];
  const closeItem: FileMenuItem = { id: 'close', label: 'Close', sub: 'Close this mission', icon: 'close', onSelect: handleCloseMission };
  // A file message on a screen with no "where" line (the front page).
  const fileStatus = fileMsg ? (
    <p role="status" title={fileMsg} className={`m-0 min-w-0 truncate text-ui-small ${fileMsg.startsWith('Error') ? 'font-semibold text-warn' : 'text-ink-2'}`}>
      {fileMsg}
    </p>
  ) : undefined;

  const barShared = {
    onSettings: () => setShowSettings(true),
    // Full screen on macOS hides the window's own buttons, and not every pilot knows Cmd+Q.
    // `exit_app` quits outright (lib.rs lets it through), so the unsaved-changes guard runs
    // here first. A web page is closed like any other tab (no Quit).
    onQuit: platform.isWeb ? undefined : () => guardUnsaved('quit', () => platform.quit()),
  };
  const bar: AppBarProps =
    shown === 'map' && mission
      ? {
          ...barShared,
          lead: (
            <>
              {openOverview ? <BackLink label="Flight overview" onClick={openOverview} /> : null}
              <HeaderWhere
                title={mission.name}
                dirty={isDirty}
                fullTitle={isDirty ? `${mission.name} (${dirtyWords.toLowerCase()})` : mission.name}
                sub={
                  place || isDirty ? (
                    <>
                      {/* On a narrow window the place goes first; the unsaved words never go. */}
                      {place ? <span className="max-[959px]:hidden">{place}{isDirty ? ' · ' : ''}</span> : null}
                      {isDirty ? dirtyWords : null}
                    </>
                  ) : undefined
                }
                subTitle={[place, isDirty ? dirtyWords : ''].filter(Boolean).join(' · ')}
                status={fileMsg}
              />
            </>
          ),
          primary: (
            <AppBarPrimary
              icon="save"
              label={saveLabel}
              title={platform.isWeb ? 'Download the mission as a .json file' : 'Save (Cmd/Ctrl+S)'}
              onClick={() => void handleSave()}
              disabled={!isDirty}
            />
          ),
          fileItems: [
            ...(openOverview ? [{ id: 'overview', label: 'Flight overview', sub: flightName ? `Jets, loadouts and threats for ${flightName}` : 'Jets, loadouts and threats', icon: 'flight' as const, onSelect: openOverview }] : []),
            ...saveAsItems,
            openItem,
            importItem,
            closeItem,
          ],
        }
      : shown === 'overview' && mission && where
        ? {
            // The overview: the way back to the front page, the flight and its jets over the mission and place,
            // and "Open the map" as the one filled button. No Save here (Cmd/Ctrl+S still saves).
            ...barShared,
            lead: (
              <>
                <BackLink label={W.frontPage} onClick={toFront} />
                <HeaderWhere
                  title={where.title}
                  titleAside={where.aircraft ? ` · ${where.aircraft}` : undefined}
                  fullTitle={where.aircraft ? `${where.title} · ${where.aircraft}` : where.title}
                  sub={<span className="max-[959px]:hidden">{where.sub}</span>}
                  subTitle={where.sub}
                  status={fileMsg}
                />
              </>
            ),
            primary: <AppBarPrimary icon="map" label={W.openMap} onClick={openMap} />,
            fileItems: [...saveAsItems, openItem, importItem, closeItem],
          }
        : // The front page: a mission kept open behind it can still be closed from here.
          { ...barShared, lead: fileStatus, fileItems: mission ? [openItem, importItem, closeItem] : [openItem, importItem] };

  // The front page fills the window under the header and scrolls on its own; on the map screen the
  // planner fills it edge to edge.
  const onFront = shown === 'front' && !loading && !error;
  const onOverview = shown === 'overview' && !loading && !error;
  return (
    <div className="flex h-screen flex-col bg-dcs-dark text-white">
      <AppBar {...bar} />

      {onFront ? (
        <main className="flex min-h-0 flex-1 flex-col">{frontPage}</main>
      ) : onOverview ? (
        <main className="flex min-h-0 flex-1 flex-col">{overview}</main>
      ) : (
      <main className={shown === 'map' ? 'relative flex min-h-0 flex-1 flex-col' : 'p-6'}>
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Loading database...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400">Error: {error}</p>
          </div>
        ) : mission ? (
          <div className="relative min-h-0 flex-1">
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
