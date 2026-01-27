import type { Theater, Coordinates } from '../types';

interface TheaterData {
  id: Theater;
  name: string;
  defaultBullseye: Coordinates;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export const THEATERS: Record<Theater, TheaterData> = {
  caucasus: {
    id: 'caucasus',
    name: 'Caucasus',
    defaultBullseye: { lat: 42.0, lon: 44.0 },
    bounds: {
      north: 46.0,
      south: 40.0,
      east: 48.0,
      west: 36.0,
    },
  },
  persian_gulf: {
    id: 'persian_gulf',
    name: 'Persian Gulf',
    defaultBullseye: { lat: 26.0, lon: 56.0 },
    bounds: {
      north: 32.0,
      south: 22.0,
      east: 62.0,
      west: 48.0,
    },
  },
  syria: {
    id: 'syria',
    name: 'Syria',
    defaultBullseye: { lat: 35.0, lon: 36.0 },
    bounds: {
      north: 38.0,
      south: 32.0,
      east: 42.0,
      west: 32.0,
    },
  },
  nevada: {
    id: 'nevada',
    name: 'Nevada (NTTR)',
    defaultBullseye: { lat: 37.0, lon: -116.0 },
    bounds: {
      north: 40.0,
      south: 34.0,
      east: -112.0,
      west: -120.0,
    },
  },
  normandy: {
    id: 'normandy',
    name: 'Normandy',
    defaultBullseye: { lat: 49.0, lon: -1.0 },
    bounds: {
      north: 52.0,
      south: 46.0,
      east: 4.0,
      west: -6.0,
    },
  },
  channel: {
    id: 'channel',
    name: 'The Channel',
    defaultBullseye: { lat: 51.0, lon: 1.0 },
    bounds: {
      north: 54.0,
      south: 48.0,
      east: 5.0,
      west: -4.0,
    },
  },
  south_atlantic: {
    id: 'south_atlantic',
    name: 'South Atlantic',
    defaultBullseye: { lat: -51.7, lon: -59.0 },
    bounds: {
      north: -48.0,
      south: -55.0,
      east: -54.0,
      west: -64.0,
    },
  },
  sinai: {
    id: 'sinai',
    name: 'Sinai',
    defaultBullseye: { lat: 30.0, lon: 33.0 },
    bounds: {
      north: 34.0,
      south: 26.0,
      east: 38.0,
      west: 28.0,
    },
  },
  kola: {
    id: 'kola',
    name: 'Kola Peninsula',
    defaultBullseye: { lat: 69.0, lon: 33.0 },
    bounds: {
      north: 72.0,
      south: 66.0,
      east: 42.0,
      west: 24.0,
    },
  },
};

export function getTheaterData(theater: Theater): TheaterData {
  return THEATERS[theater];
}

export function getTheaterDisplayName(theater: Theater): string {
  return THEATERS[theater]?.name ?? theater;
}
