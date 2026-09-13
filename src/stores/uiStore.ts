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

/**
 * What the planner has picked out of a list, and what the map should fly to.
 *
 * Selection lives here for the same reason the display filter does: it is a
 * view control, and clicking a row in a list must never mark the mission dirty
 * or reach a saved `.json`. Attack and threat selection are mutually exclusive
 * — only one thing is highlighted at a time, so picking a threat lets go of the
 * attack rather than leaving two things lit up with no way to tell which the
 * camera moved for.
 *
 * `focusThreatId` is a one-shot: the map consumes it, flies there, and clears
 * it. Selection persists; the fly-to does not, so re-selecting the same threat
 * flies to it again. Attacks already have this in `missionStore.focusAttackId`,
 * which additionally un-hides the attacker — kept there rather than duplicated.
 */
interface Selection {
  selectedAttackId: string | null;
  selectedThreatId: string | null;
  focusThreatId: string | null;
}

interface UiState extends DisplayFilter, Selection {
  /** Grey map under the kneeboard card's north-up picture. A view preference, never reset by Open/Import. */
  kneeboardMap: boolean;
  toggleKneeboardMap: () => void;
  selectAttack: (id: string | null) => void;
  /** Select a threat and ask the map to fly to it. */
  selectThreat: (id: string | null) => void;
  /** The map calls this once it has flown to `focusThreatId`. */
  threatFocused: () => void;
  clearSelection: () => void;
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

const emptySelection: Selection = {
  selectedAttackId: null,
  selectedThreatId: null,
  focusThreatId: null,
};

export const useUiStore = create<UiState>((set) => ({
  ...emptyFilter,
  ...emptySelection,

  kneeboardMap: true,
  toggleKneeboardMap: () => set((state) => ({ kneeboardMap: !state.kneeboardMap })),

  selectAttack: (id) => set({ selectedAttackId: id, selectedThreatId: null }),
  selectThreat: (id) => set({ selectedThreatId: id, selectedAttackId: null, focusThreatId: id }),
  threatFocused: () => set({ focusThreatId: null }),
  clearSelection: () => set({ ...emptySelection }),

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
  resetFilter: () => set({ ...emptyFilter, ...emptySelection }),
}));
