import type { Coordinates } from '../types';

/**
 * Convert decimal degrees to DMS (Degrees, Minutes, Seconds) format
 */
export function decimalToDMS(
  decimal: number,
  isLatitude: boolean
): string {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;

  const direction = isLatitude
    ? decimal >= 0 ? 'N' : 'S'
    : decimal >= 0 ? 'E' : 'W';

  return `${direction} ${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toFixed(2).padStart(5, '0')}"`;
}

/**
 * Format coordinates as DMS string
 */
export function formatCoordinatesDMS(coords: Coordinates): string {
  const lat = decimalToDMS(coords.lat, true);
  const lon = decimalToDMS(coords.lon, false);
  return `${lat} ${lon}`;
}

/**
 * Calculate distance between two coordinates in nautical miles
 * Uses the Haversine formula
 */
export function calculateDistance(
  from: Coordinates,
  to: Coordinates
): number {
  const R = 3440.065; // Earth's radius in nautical miles

  const lat1Rad = (from.lat * Math.PI) / 180;
  const lat2Rad = (to.lat * Math.PI) / 180;
  const deltaLat = ((to.lat - from.lat) * Math.PI) / 180;
  const deltaLon = ((to.lon - from.lon) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculate bearing from one coordinate to another in degrees
 */
export function calculateBearing(
  from: Coordinates,
  to: Coordinates
): number {
  const lat1Rad = (from.lat * Math.PI) / 180;
  const lat2Rad = (to.lat * Math.PI) / 180;
  const deltaLon = ((to.lon - from.lon) * Math.PI) / 180;

  const y = Math.sin(deltaLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLon);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  bearing = (bearing + 360) % 360;

  return bearing;
}

/**
 * Calculate a new coordinate given a start point, bearing, and distance
 */
export function calculateDestination(
  from: Coordinates,
  bearingDeg: number,
  distanceNm: number
): Coordinates {
  const R = 3440.065; // Earth's radius in nautical miles

  const lat1Rad = (from.lat * Math.PI) / 180;
  const lon1Rad = (from.lon * Math.PI) / 180;
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const angularDistance = distanceNm / R;

  const lat2Rad = Math.asin(
    Math.sin(lat1Rad) * Math.cos(angularDistance) +
      Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const lon2Rad =
    lon1Rad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1Rad),
      Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2Rad)
    );

  return {
    lat: (lat2Rad * 180) / Math.PI,
    lon: (lon2Rad * 180) / Math.PI,
  };
}
