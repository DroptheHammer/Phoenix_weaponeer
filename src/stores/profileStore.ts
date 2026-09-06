import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { DeliveryProfile, ProfileLibrary, WeaponClass } from '../types/profile.types';
import { SUPPORTED_GEOMETRIES } from '../types/profile.types';

interface ProfileState {
  profiles: DeliveryProfile[];
  /** User profile files the backend could not read — shown, never silently dropped */
  warnings: string[];
  loaded: boolean;
  loadProfiles: () => Promise<void>;
}

/**
 * The delivery profile library, fetched once at startup.
 *
 * The Rust side (`src-tauri/src/profiles`) owns parsing and validation of both
 * the bundled files and the squadron's overrides; this store just holds the
 * merged result. Same pattern as `theaterStore`.
 */
export const useProfileStore = create<ProfileState>((set) => ({
  profiles: [],
  warnings: [],
  loaded: false,

  loadProfiles: async () => {
    const library = await invoke<ProfileLibrary>('list_delivery_profiles');
    set({ profiles: library.profiles, warnings: library.warnings, loaded: true });
  },
}));

function matches(profile: DeliveryProfile, aircraftId: string, weaponClass?: WeaponClass): boolean {
  if (profile.aircraftId !== aircraftId) return false;
  // Loft ships in the files but has no geometry yet — hide it until it does.
  if (!SUPPORTED_GEOMETRIES.includes(profile.geometry)) return false;
  return weaponClass ? profile.weaponClasses.includes(weaponClass) : true;
}

/** Non-reactive lookup, for use outside React render (auto-build). */
export function profilesFor(aircraftId: string, weaponClass?: WeaponClass): DeliveryProfile[] {
  return useProfileStore.getState().profiles.filter((p) => matches(p, aircraftId, weaponClass));
}

/** Reactive lookup — re-renders once the library has loaded. */
export function useProfilesFor(aircraftId?: string, weaponClass?: WeaponClass): DeliveryProfile[] {
  return useProfileStore((state) =>
    aircraftId ? state.profiles.filter((p) => matches(p, aircraftId, weaponClass)) : [],
  );
}

export function getProfile(id: string): DeliveryProfile | undefined {
  return useProfileStore.getState().profiles.find((p) => p.id === id);
}

/** The profile auto-build reaches for: the one flagged default for that class, else the first match. */
export function defaultProfileFor(aircraftId: string, weaponClass: WeaponClass): DeliveryProfile | undefined {
  const candidates = profilesFor(aircraftId, weaponClass);
  return candidates.find((p) => p.defaultFor?.includes(weaponClass)) ?? candidates[0];
}
