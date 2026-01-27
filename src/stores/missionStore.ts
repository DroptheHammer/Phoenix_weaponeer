import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  Mission,
  Theater,
  Waypoint,
  ThreatInstance,
  FlightMember,
  Attack,
} from '../types';

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
  setFilePath: (path: string) => void;
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

  setFilePath: (path: string) => {
    set({ filePath: path });
  },
}));
