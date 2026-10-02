import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { normalizeImportedCallsign } from '../lib/callsign';
import { importNotes } from '../lib/importNotes';
import { removeAttackFrom, moveAttackCustomIp } from '../lib/missionOps';
import { saveStrikeTo, removeStrikeFrom } from '../lib/strike';
import type { CardLighting } from '../lib/cardTheme';
import { COALESCE_MS, EMPTY_HISTORY, recordEdit, redoStep, undoStep } from '../lib/missionHistory';
import { useUiStore } from './uiStore';
import type {
  Mission,
  Theater,
  Waypoint,
  WaypointType,
  ThreatInstance,
  FlightMember,
  Attack,
  Coordinates,
  FragOrdersData,
  Strike,
} from '../types';

/**
 * Normalize DCS aircraft type to our database aircraft ID.
 *
 * The ids must match the `aircraft` in `crates/core/data/reference.json` and the
 * `aircraftId` in each profile file under `src-tauri/resources/profiles/`.
 */
function normalizeAircraftType(dcsType: string): string {
  const typeMap: Record<string, string> = {
    'F-16C_50': 'f16c',
    'F-16C': 'f16c',
    'F-16CM': 'f16c',
    'FA-18C_hornet': 'f18c',
    'F/A-18C': 'f18c',
    'A-10C': 'a10c',
    'A-10C_2': 'a10c',
    'F-15E': 'f15e',
    'F-15ESE': 'f15e',
    'F-4E-45MC': 'f4e',
    'F-4E': 'f4e',
    'A-4E-C': 'a4ec',
    'F-5E-3': 'f5e',
    'F-5E': 'f5e',
    'F-14B': 'f14',
    'F-14A-135-GR': 'f14',
    'F-14A': 'f14',
    'Mirage-F1': 'f1', // every F1 variant starts with this (CE, EE, M-EE, BE…)
    'AV8BNA': 'av8b',
  };

  // Check exact match
  if (typeMap[dcsType]) {
    return typeMap[dcsType];
  }

  // Check partial matches
  for (const [pattern, id] of Object.entries(typeMap)) {
    if (dcsType.includes(pattern) || pattern.includes(dcsType)) {
      return id;
    }
  }

  // Default to lowercase, replacing non-alphanumeric
  return dcsType.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The last edit that asked to be merged with its neighbours (typing in one field). */
let lastEdit: { key: string; at: number } | null = null;

/**
 * Every change to the mission goes through here so Undo can take it back.
 * `key` names what is being edited: repeated edits under one key within
 * `COALESCE_MS` (keystrokes in a text box) are one Undo step.
 */
function edit(next: Mission, key?: string) {
  const { mission, past, future } = useMissionStore.getState();
  if (!mission) return;
  const now = Date.now();
  const coalesce = key !== undefined && lastEdit?.key === key && now - lastEdit.at < COALESCE_MS;
  lastEdit = key === undefined ? null : { key, at: now };
  useMissionStore.setState({ mission: next, ...recordEdit({ past, future }, mission, coalesce), isDirty: true });
}

interface MissionState {
  mission: Mission | null;
  isDirty: boolean;
  filePath: string | null;
  /** Undo trail, oldest first. Cleared whenever a different mission is put in place. */
  past: Mission[];
  /** Redo trail; cleared by any new edit. */
  future: Mission[];
  /** The mission as last saved or opened, so undoing back to it clears `isDirty`. */
  savedMission: Mission | null;
  undo: () => void;
  redo: () => void;
  /** Set by the attack editor's Save so the map can reframe on it once. */
  focusAttackId: string | null;
  setFocusAttackId: (id: string | null) => void;

  // Mission actions
  createMission: (name: string, theater: Theater) => void;
  loadMission: (mission: Mission, filePath?: string) => void;
  closeMission: () => void;
  updateMissionName: (name: string) => void;
  updateMissionNotes: (notes: string) => void;
  /** Which lighting the cards are drawn in. Saved with the mission, so it is an undoable edit. */
  setCardLighting: (lighting: CardLighting) => void;
  importFromFragOrders: (data: FragOrdersData, groupIndex: number) => void;

  // No waypoint actions, on purpose: the route is the mission author's and stays
  // fixed. It arrives with the import (or an opened mission) and is never edited.

  // Threat actions
  addThreat: (threat: Omit<ThreatInstance, 'id'>) => void;
  updateThreat: (id: string, threat: Partial<ThreatInstance>) => void;
  removeThreat: (id: string) => void;

  // Flight actions
  addFlightMember: (member: Omit<FlightMember, 'id'>) => void;
  updateFlightMember: (id: string, member: Partial<FlightMember>) => void;
  removeFlightMember: (id: string) => void;

  // Attack actions
  addAttack: (attack: Omit<Attack, 'id'>) => string;
  updateAttack: (id: string, attack: Partial<Attack>) => void;
  removeAttack: (id: string) => void;
  /** A saved attack's custom IP dragged on the map; re-derives its headings. A strike member's moves the whole strike's. */
  moveAttackCustomIp: (id: string, position: Coordinates) => void;

  // Strike actions (see lib/strike.ts)
  /** Write a strike and its members in one step; returns the member attack ids, lead first. */
  saveStrike: (
    strike: Strike,
    members: { id?: string; data: Omit<Attack, 'id' | 'strikeId' | 'totOffset_s'>; totOffset_s: number }[],
  ) => string[];
  /** Ungroup: members stay as plain attacks. */
  removeStrike: (id: string) => void;

  // State management
  markClean: () => void;
  setFilePath: (path: string | null) => void;
}

export const useMissionStore = create<MissionState>((set, get) => ({
  mission: null,
  isDirty: false,
  filePath: null,
  ...EMPTY_HISTORY,
  savedMission: null,
  undo: () => {
    const { mission, past, future } = get();
    const step = mission && undoStep({ past, future }, mission);
    if (!step) return;
    lastEdit = null;
    set({ mission: step.mission, ...step.history, isDirty: step.mission !== get().savedMission });
  },
  redo: () => {
    const { mission, past, future } = get();
    const step = mission && redoStep({ past, future }, mission);
    if (!step) return;
    lastEdit = null;
    set({ mission: step.mission, ...step.history, isDirty: step.mission !== get().savedMission });
  },
  focusAttackId: null,
  // Saving an attack un-hides its attacker on the map display filter — a
  // planner who just saved an attack for a hidden pilot should see it, not
  // have the map try to frame a picture that isn't drawn.
  setFocusAttackId: (id) => {
    if (id) {
      const attack = get().mission?.attacks.find((a) => a.id === id);
      if (attack) useUiStore.getState().unhideAttacker(attack.attackerId);
    }
    set({ focusAttackId: id });
  },

  createMission: (name: string, theater: Theater) => {
    const now = new Date().toISOString();
    const mission: Mission = {
      id: uuidv4(),
      name,
      date: new Date().toISOString().split('T')[0],
      theater,
      bullseye: { lat: 0, lon: 0 },
      waypoints: [],
      threats: [],
      flightMembers: [],
      attacks: [],
      notes: '',
      createdAt: now,
      updatedAt: now,
    };
    lastEdit = null;
    set({ mission, ...EMPTY_HISTORY, savedMission: mission, isDirty: false, filePath: null });
  },

  loadMission: (mission: Mission, filePath?: string) => {
    const loaded = { ...mission, strikes: mission.strikes ?? [], cardLighting: mission.cardLighting ?? 'day' };
    lastEdit = null;
    set({ mission: loaded, ...EMPTY_HISTORY, savedMission: loaded, isDirty: false, filePath: filePath ?? null });
  },

  closeMission: () => {
    lastEdit = null;
    set({ mission: null, ...EMPTY_HISTORY, savedMission: null, isDirty: false, filePath: null });
  },

  updateMissionName: (name: string) => {
    const { mission } = get();
    if (!mission) return;
    edit({ ...mission, name, updatedAt: new Date().toISOString() }, 'mission-name');
  },

  updateMissionNotes: (notes: string) => {
    const { mission } = get();
    if (!mission) return;
    edit({ ...mission, notes, updatedAt: new Date().toISOString() }, 'mission-notes');
  },

  // No coalescing key: a pick from a list is one step, and Undo should take it back whole.
  setCardLighting: (cardLighting: CardLighting) => {
    const { mission } = get();
    if (!mission || (mission.cardLighting ?? 'day') === cardLighting) return;
    edit({ ...mission, cardLighting, updatedAt: new Date().toISOString() });
  },

  importFromFragOrders: (data: FragOrdersData, groupIndex: number) => {
    const now = new Date().toISOString();
    const group = data.player_groups[groupIndex];

    if (!group) {
      console.error('Invalid group index for FragOrders import');
      return;
    }

    // Convert theater name to Theater type
    const theater = data.theater as Theater;

    // Convert waypoints (using coordinates and elevation_ft per the Waypoint interface)
    const waypoints: Waypoint[] = group.waypoints.map((wp) => ({
      id: uuidv4(),
      steerpoint: wp.steerpoint,
      name: wp.name,
      type: wp.wp_type as WaypointType,
      coordinates: wp.position,
      elevation_ft: wp.altitude_ft,
    }));

    // Convert threats (only those with known system IDs)
    const threats: ThreatInstance[] = data.threats
      .filter((t) => t.system_id !== null)
      .map((t) => ({
        id: uuidv4(),
        systemId: t.system_id!,
        position: t.position,
        status: 'active' as const,
        source: 'mission' as const,
        notes: `${t.group_name} - DCS unit: ${t.unit_type}`,
        // The author's hide flags, carried only when set, so a threat nobody
        // hid saves exactly as before.
        ...(t.hidden_on_planner ? { hiddenOnPlanner: true } : {}),
        ...(t.hidden_on_map ? { hiddenOnMap: true } : {}),
      }));

    // Create flight members from units (position is 1-4)
    // Extract callsign name + flight number from group callsign (e.g. "Viper 1-1" → name="Viper", flight="1")
    // so per-unit fallback generates "Viper 1-1", "Viper 1-2", etc. instead of "Viper 1-1-2"
    const csMatch = group.callsign.match(/^([A-Za-z]+)\s*(\d)/);
    const csName = csMatch?.[1] ?? group.callsign;
    const csFlight = csMatch?.[2] ?? '1';

    const flightMembers: FlightMember[] = group.units.slice(0, 4).map((unit, idx) => ({
      id: uuidv4(),
      callsign: normalizeImportedCallsign(unit.callsign) || `${csName} ${csFlight}-${idx + 1}`,
      position: (idx + 1) as 1 | 2 | 3 | 4,
      role: idx === 0 ? 'flight_lead' as const : 'wingman' as const,
      aircraftId: normalizeAircraftType(group.aircraft_type),
      // What the mission author loaded: the weapon row's name for a store the
      // table knows (with its id), the DCS name for one it does not (no id).
      loadout: (unit.loadout ?? []).map((store) => ({
        weaponType: store.name,
        quantity: store.quantity,
        ...(store.weapon_id != null ? { weaponId: store.weapon_id } : {}),
      })),
      pilotName: unit.name,
    }));

    // Create the mission
    const mission: Mission = {
      id: uuidv4(),
      name: `${group.callsign} - ${group.name}`,
      date: new Date().toISOString().split('T')[0],
      theater,
      bullseye: data.bullseye,
      waypoints,
      threats,
      flightMembers,
      attacks: [],
      notes: importNotes(data, group, threats.length),
      createdAt: now,
      updatedAt: now,
    };

    lastEdit = null;
    // Never saved, so `savedMission` stays empty and the mission counts as unsaved.
    set({ mission, ...EMPTY_HISTORY, savedMission: null, isDirty: true, filePath: null });
  },

  addThreat: (threatData) => {
    const { mission } = get();
    if (!mission) return;
    const threat: ThreatInstance = { ...threatData, id: uuidv4() };
    edit({
      ...mission,
      threats: [...mission.threats, threat],
      updatedAt: new Date().toISOString(),
    });
  },

  updateThreat: (id: string, threatUpdate: Partial<ThreatInstance>) => {
    const { mission } = get();
    if (!mission) return;
    edit(
      {
        ...mission,
        threats: mission.threats.map((t) =>
          t.id === id ? { ...t, ...threatUpdate } : t
        ),
        updatedAt: new Date().toISOString(),
      },
      `threat:${id}`,
    );
  },

  removeThreat: (id: string) => {
    const { mission } = get();
    if (!mission) return;
    edit({
      ...mission,
      threats: mission.threats.filter((t) => t.id !== id),
      updatedAt: new Date().toISOString(),
    });
  },

  addFlightMember: (memberData) => {
    const { mission } = get();
    if (!mission) return;
    const member: FlightMember = { ...memberData, id: uuidv4() };
    edit({
      ...mission,
      flightMembers: [...mission.flightMembers, member],
      updatedAt: new Date().toISOString(),
    });
  },

  updateFlightMember: (id: string, memberUpdate: Partial<FlightMember>) => {
    const { mission } = get();
    if (!mission) return;
    edit(
      {
        ...mission,
        flightMembers: mission.flightMembers.map((m) =>
          m.id === id ? { ...m, ...memberUpdate } : m
        ),
        updatedAt: new Date().toISOString(),
      },
      `flight-member:${id}`,
    );
  },

  removeFlightMember: (id: string) => {
    const { mission } = get();
    if (!mission) return;
    edit({
      ...mission,
      flightMembers: mission.flightMembers.filter((m) => m.id !== id),
      updatedAt: new Date().toISOString(),
    });
  },

  addAttack: (attackData) => {
    const { mission } = get();
    if (!mission) return '';
    const attack: Attack = { ...attackData, id: uuidv4() };
    edit({
      ...mission,
      attacks: [...mission.attacks, attack],
      updatedAt: new Date().toISOString(),
    });
    return attack.id;
  },

  updateAttack: (id: string, attackUpdate: Partial<Attack>) => {
    const { mission } = get();
    if (!mission) return;
    edit({
      ...mission,
      attacks: mission.attacks.map((a) =>
        a.id === id ? { ...a, ...attackUpdate } : a
      ),
      updatedAt: new Date().toISOString(),
    });
  },

  removeAttack: (id: string) => {
    const { mission } = get();
    if (!mission) return;
    edit({ ...removeAttackFrom(mission, id), updatedAt: new Date().toISOString() });
  },

  saveStrike: (strike, members) => {
    const { mission } = get();
    if (!mission) return [];
    const saved = saveStrikeTo(mission, strike, members, uuidv4);
    edit({ ...saved.mission, updatedAt: new Date().toISOString() });
    return saved.attackIds;
  },

  removeStrike: (id) => {
    const { mission } = get();
    if (!mission) return;
    edit({ ...removeStrikeFrom(mission, id), updatedAt: new Date().toISOString() });
  },

  moveAttackCustomIp: (id, position) => {
    const { mission } = get();
    if (!mission) return;
    edit({ ...moveAttackCustomIp(mission, id, position), updatedAt: new Date().toISOString() });
  },

  markClean: () => {
    set({ isDirty: false, savedMission: get().mission });
  },

  setFilePath: (path: string | null) => {
    set({ filePath: path });
  },
}));
