import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { normalizeImportedCallsign } from '../lib/callsign';
import type {
  Mission,
  Theater,
  Waypoint,
  WaypointType,
  ThreatInstance,
  FlightMember,
  Attack,
  FragOrdersData,
} from '../types';

/**
 * Normalize DCS aircraft type to our database aircraft ID.
 *
 * The ids must match the `aircraft` seed in `src-tauri/src/db/mod.rs` and the
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

interface MissionState {
  mission: Mission | null;
  isDirty: boolean;
  filePath: string | null;

  // Mission actions
  createMission: (name: string, theater: Theater) => void;
  loadMission: (mission: Mission, filePath?: string) => void;
  closeMission: () => void;
  updateMissionName: (name: string) => void;
  updateMissionNotes: (notes: string) => void;
  importFromFragOrders: (data: FragOrdersData, groupIndex: number) => void;

  // Waypoint actions
  addWaypoint: (waypoint: Omit<Waypoint, 'id'>) => void;
  updateWaypoint: (id: string, waypoint: Partial<Waypoint>) => void;
  removeWaypoint: (id: string) => void;
  reorderWaypoints: (waypointIds: string[]) => void;

  // Threat actions
  addThreat: (threat: Omit<ThreatInstance, 'id'>) => void;
  updateThreat: (id: string, threat: Partial<ThreatInstance>) => void;
  removeThreat: (id: string) => void;

  // Flight actions
  addFlightMember: (member: Omit<FlightMember, 'id'>) => void;
  updateFlightMember: (id: string, member: Partial<FlightMember>) => void;
  removeFlightMember: (id: string) => void;

  // Attack actions
  addAttack: (attack: Omit<Attack, 'id'>) => void;
  updateAttack: (id: string, attack: Partial<Attack>) => void;
  removeAttack: (id: string) => void;

  // State management
  markClean: () => void;
  setFilePath: (path: string | null) => void;
}

export const useMissionStore = create<MissionState>((set, get) => ({
  mission: null,
  isDirty: false,
  filePath: null,

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
    set({ mission, isDirty: false, filePath: null });
  },

  loadMission: (mission: Mission, filePath?: string) => {
    set({ mission, isDirty: false, filePath: filePath ?? null });
  },

  closeMission: () => {
    set({ mission: null, isDirty: false, filePath: null });
  },

  updateMissionName: (name: string) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: { ...mission, name, updatedAt: new Date().toISOString() },
      isDirty: true,
    });
  },

  updateMissionNotes: (notes: string) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: { ...mission, notes, updatedAt: new Date().toISOString() },
      isDirty: true,
    });
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
      loadout: [],
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
      notes: `Imported from FragOrders\nAircraft: ${group.aircraft_type}\nThreats detected: ${data.threats.length} (${threats.length} identified)`,
      createdAt: now,
      updatedAt: now,
    };

    set({ mission, isDirty: true, filePath: null });
  },

  addWaypoint: (waypointData) => {
    const { mission } = get();
    if (!mission) return;
    const waypoint: Waypoint = { ...waypointData, id: uuidv4() };
    set({
      mission: {
        ...mission,
        waypoints: [...mission.waypoints, waypoint],
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  updateWaypoint: (id: string, waypointUpdate: Partial<Waypoint>) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: {
        ...mission,
        waypoints: mission.waypoints.map((wp) =>
          wp.id === id ? { ...wp, ...waypointUpdate } : wp
        ),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  removeWaypoint: (id: string) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: {
        ...mission,
        waypoints: mission.waypoints.filter((wp) => wp.id !== id),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  reorderWaypoints: (waypointIds: string[]) => {
    const { mission } = get();
    if (!mission) return;
    const waypointMap = new Map(mission.waypoints.map((wp) => [wp.id, wp]));
    const reorderedWaypoints = waypointIds
      .map((id) => waypointMap.get(id))
      .filter((wp): wp is Waypoint => wp !== undefined);
    set({
      mission: {
        ...mission,
        waypoints: reorderedWaypoints,
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  addThreat: (threatData) => {
    const { mission } = get();
    if (!mission) return;
    const threat: ThreatInstance = { ...threatData, id: uuidv4() };
    set({
      mission: {
        ...mission,
        threats: [...mission.threats, threat],
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  updateThreat: (id: string, threatUpdate: Partial<ThreatInstance>) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: {
        ...mission,
        threats: mission.threats.map((t) =>
          t.id === id ? { ...t, ...threatUpdate } : t
        ),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  removeThreat: (id: string) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: {
        ...mission,
        threats: mission.threats.filter((t) => t.id !== id),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  addFlightMember: (memberData) => {
    const { mission } = get();
    if (!mission) return;
    const member: FlightMember = { ...memberData, id: uuidv4() };
    set({
      mission: {
        ...mission,
        flightMembers: [...mission.flightMembers, member],
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  updateFlightMember: (id: string, memberUpdate: Partial<FlightMember>) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: {
        ...mission,
        flightMembers: mission.flightMembers.map((m) =>
          m.id === id ? { ...m, ...memberUpdate } : m
        ),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  removeFlightMember: (id: string) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: {
        ...mission,
        flightMembers: mission.flightMembers.filter((m) => m.id !== id),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  addAttack: (attackData) => {
    const { mission } = get();
    if (!mission) return;
    const attack: Attack = { ...attackData, id: uuidv4() };
    set({
      mission: {
        ...mission,
        attacks: [...mission.attacks, attack],
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  updateAttack: (id: string, attackUpdate: Partial<Attack>) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: {
        ...mission,
        attacks: mission.attacks.map((a) =>
          a.id === id ? { ...a, ...attackUpdate } : a
        ),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  removeAttack: (id: string) => {
    const { mission } = get();
    if (!mission) return;
    set({
      mission: {
        ...mission,
        attacks: mission.attacks.filter((a) => a.id !== id),
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    });
  },

  markClean: () => {
    set({ isDirty: false });
  },

  setFilePath: (path: string | null) => {
    set({ filePath: path });
  },
}));
