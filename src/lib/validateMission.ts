import type { Mission } from '../types/mission.types';

/**
 * The gate between a saved mission file and the store.
 *
 * A mission file is data someone else may have written — a squadron mate's
 * plan off Discord. The Rust side checks only the top-level fields and passes
 * waypoints, threats, flight and attacks through as raw JSON, so nothing else
 * stands between the file and the map.
 *
 * It checks the values the app relies on being the right kind: ids and names
 * are text, steerpoints are whole numbers, positions are real coordinates. A
 * steerpoint that is really a string of HTML is exactly what the map used to
 * paste into the page. Optional fields and profile details are left alone, so
 * an older save with fewer fields still opens.
 */
export type MissionCheck = { ok: true; mission: Mission } | { ok: false; problems: string[] };

/** A file broken everywhere should say so in a few lines, not hundreds. */
const MAX_PROBLEMS = 6;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const show = (value: unknown): string => {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

export function validateMission(raw: unknown): MissionCheck {
  if (!isObject(raw)) return { ok: false, problems: ['the file is not a mission'] };
  const problems: string[] = [];

  const text = (obj: Json, key: string, where: string) => {
    if (typeof obj[key] !== 'string') problems.push(`${where}: ${key} must be text (got ${show(obj[key])})`);
  };
  const position = (value: unknown, where: string) => {
    const lat = isObject(value) ? value.lat : undefined;
    const lon = isObject(value) ? value.lon : undefined;
    const latOk = typeof lat === 'number' && lat >= -90 && lat <= 90;
    const lonOk = typeof lon === 'number' && lon >= -180 && lon <= 180;
    if (!latOk || !lonOk) problems.push(`${where}: not a real position (got ${show(value)})`);
  };
  /** Each entry of a top-level list that is an object, with its 1-based number for messages. */
  const entries = (key: string): Array<[Json, number]> => {
    const list = raw[key];
    if (!Array.isArray(list)) {
      problems.push(`${key} must be a list (got ${show(list)})`);
      return [];
    }
    return list.flatMap((item, i): Array<[Json, number]> => {
      if (isObject(item)) return [[item, i + 1]];
      problems.push(`${key} entry ${i + 1} is not an object (got ${show(item)})`);
      return [];
    });
  };

  for (const key of ['id', 'name', 'theater']) text(raw, key, 'Mission');
  position(raw.bullseye, 'Mission bullseye');

  for (const [wp, n] of entries('waypoints')) {
    const where = `Waypoint ${n}`;
    text(wp, 'id', where);
    text(wp, 'name', where);
    text(wp, 'type', where);
    if (!Number.isInteger(wp.steerpoint)) problems.push(`${where}: steerpoint must be a whole number (got ${show(wp.steerpoint)})`);
    position(wp.coordinates, where);
    if (wp.elevation_ft != null && !(typeof wp.elevation_ft === 'number' && Number.isFinite(wp.elevation_ft))) {
      problems.push(`${where}: elevation_ft must be a number (got ${show(wp.elevation_ft)})`);
    }
  }

  for (const [threat, n] of entries('threats')) {
    const where = `Threat ${n}`;
    text(threat, 'id', where);
    text(threat, 'systemId', where);
    position(threat.position, where);
  }

  for (const [member, n] of entries('flightMembers')) {
    const where = `Flight member ${n}`;
    text(member, 'id', where);
    text(member, 'callsign', where);
    text(member, 'aircraftId', where);
  }

  for (const [attack, n] of entries('attacks')) {
    const where = `Attack ${n}`;
    text(attack, 'id', where);
    text(attack, 'targetWaypointId', where);
    text(attack, 'attackerId', where);
    text(attack, 'profileType', where);
    if (!isObject(attack.profile)) problems.push(`${where}: profile is missing (got ${show(attack.profile)})`);
  }

  if (problems.length === 0) return { ok: true, mission: raw as unknown as Mission };
  const extra = problems.length - MAX_PROBLEMS;
  return {
    ok: false,
    problems: extra > 0 ? [...problems.slice(0, MAX_PROBLEMS), `…and ${extra} more`] : problems,
  };
}
