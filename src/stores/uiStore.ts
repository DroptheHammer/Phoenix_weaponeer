import { create } from 'zustand';
import type { ThreatSource } from '../types';

/**
 * Map display filter — a view-time control, not mission data.
 *
 * Deliberately its own store rather than living in `missionStore`, which is
 * serialized to disk and drives `isDirty`. A planner hiding a pilot's attack
 * to declutter the map must never mark the mission dirty or land in a saved
 * `.json`.
 *
 * Stores what is HIDDEN, not what is visible: hide-sets default empty, so
 * everything is visible by default and anything newly added (a new attack, a
 * new threat) appears immediately. Storing the visible set instead would make
 * a newly created attack invisible until explicitly added — a trap.
 */
export interface DisplayFilter {
  /** FlightMember.id — attacks by these attackers are hidden on the map. */
  hiddenAttackerIds: string[];
  /** ThreatInstance.source values that are hidden on the map. */
  hiddenThreatSources: ThreatSource[];
  /** Route line + steerpoint markers hidden on the map. */
  routeHidden: boolean;
}

interface UiState extends DisplayFilter {
  toggleAttacker: (id: string) => void;
  /** Toggles every member of a flight together (used by the flight row's tri-state box). */
  toggleFlight: (memberIds: string[]) => void;
  toggleThreatSource: (src: ThreatSource) => void;
  toggleRoute: () => void;
  /** Un-hides one attacker without touching anything else hidden — used when saving an attack. */
  unhideAttacker: (id: string) => void;
  /** Clears every hide-set — the legend's "Show all" reset link. */
  showAll: () => void;
  /** Clears every hide-set — called on New/Open/Import/Close so a stale filter never lies. */
  resetFilter: () => void;
}

const emptyFilter: DisplayFilter = {
  hiddenAttackerIds: [],
  hiddenThreatSources: [],
  routeHidden: false,
};

export const useUiStore = create<UiState>((set) => ({
  ...emptyFilter,

  toggleAttacker: (id) =>
    set((state) => ({
      hiddenAttackerIds: state.hiddenAttackerIds.includes(id)
        ? state.hiddenAttackerIds.filter((x) => x !== id)
        : [...state.hiddenAttackerIds, id],
    })),

  toggleFlight: (memberIds) =>
    set((state) => {
      // A partly-hidden flight restores the WHOLE flight rather than hiding the
      // rest of it: clicking an indeterminate box should give you back what is
      // missing, not take away what is left. Only a fully visible flight hides.
      const anyHidden = memberIds.some((id) => state.hiddenAttackerIds.includes(id));
      const without = state.hiddenAttackerIds.filter((id) => !memberIds.includes(id));
      return { hiddenAttackerIds: anyHidden ? without : [...without, ...memberIds] };
    }),

  toggleThreatSource: (src) =>
    set((state) => ({
      hiddenThreatSources: state.hiddenThreatSources.includes(src)
        ? state.hiddenThreatSources.filter((x) => x !== src)
        : [...state.hiddenThreatSources, src],
    })),

  toggleRoute: () => set((state) => ({ routeHidden: !state.routeHidden })),

  unhideAttacker: (id) =>
    set((state) => ({
      hiddenAttackerIds: state.hiddenAttackerIds.filter((x) => x !== id),
    })),

  showAll: () => set({ ...emptyFilter }),
  resetFilter: () => set({ ...emptyFilter }),
}));
