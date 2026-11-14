/**
 * What the 3D view shows: the Show menu's state and its reducer. Pure.
 *
 * Nothing here is saved: it lives for the open playback only. It is also the
 * one place the two mode types are declared, so the files that use them
 * import them from here instead of each exporting its own copy.
 */

/** Action point markers and the planner's words: none, as each jet nears a point, or all the time. */
export type ActionPointsMode = 'off' | 'coming' | 'always';
/** The planner's line colours on the watched jet only, or on every jet. */
export type AttackColours = 'watched' | 'all';

export interface ShowState {
  /** Altitude and speed beside each jet. */
  readonly labels: boolean;
  readonly actionPoints: ActionPointsMode;
  readonly attackColours: AttackColours;
  /** Start the time bar before the IP instead of just before the first action. */
  readonly wholeRunIn: boolean;
  /** Every threat system the menu lists, in menu order, fixed for the open playback. */
  readonly threatKeys: readonly string[];
  /** The ones switched on, always in threatKeys order. */
  readonly threatsOn: readonly string[];
}

export type ShowAction =
  | { type: 'labels'; on: boolean }
  | { type: 'actionPoints'; value: ActionPointsMode }
  | { type: 'attackColours'; value: AttackColours }
  | { type: 'wholeRunIn'; on: boolean }
  | { type: 'threat'; key: string; on: boolean }
  | { type: 'threatsAll' }
  | { type: 'threatsNone' };

/**
 * The menu as it opens: labels on, action points as they come, colours on the
 * watched jet, the time bar from just before the first action, and the
 * threats whose rows say so switched on (weapons on, early-warning radars
 * off). The rows are typed by shape only, so this file needs nothing from the
 * threat code. A system listed twice keeps its first place.
 */
export function initShow(rows: readonly { systemId: string; defaultOn: boolean }[] = []): ShowState {
  const threatKeys: string[] = [];
  const threatsOn: string[] = [];
  for (const r of rows) {
    if (threatKeys.includes(r.systemId)) continue;
    threatKeys.push(r.systemId);
    if (r.defaultOn) threatsOn.push(r.systemId);
  }
  return { labels: true, actionPoints: 'coming', attackColours: 'watched', wholeRunIn: false, threatKeys, threatsOn };
}

export function isThreatOn(s: ShowState, key: string): boolean {
  return s.threatsOn.includes(key);
}

/**
 * The next state. Returns the same object when nothing changes (an unknown
 * threat, the value it already has, All when all are on, None when none are),
 * so a click that changes nothing re-renders nothing.
 */
export function showReducer(s: ShowState, a: ShowAction): ShowState {
  switch (a.type) {
    case 'labels':
      return a.on === s.labels ? s : { ...s, labels: a.on };
    case 'actionPoints':
      return a.value === s.actionPoints ? s : { ...s, actionPoints: a.value };
    case 'attackColours':
      return a.value === s.attackColours ? s : { ...s, attackColours: a.value };
    case 'wholeRunIn':
      return a.on === s.wholeRunIn ? s : { ...s, wholeRunIn: a.on };
    case 'threat': {
      if (!s.threatKeys.includes(a.key) || a.on === isThreatOn(s, a.key)) return s;
      // Rebuilt from the menu's own order, so the list never depends on the order of the clicks.
      const threatsOn = a.on
        ? s.threatKeys.filter((k) => k === a.key || s.threatsOn.includes(k))
        : s.threatsOn.filter((k) => k !== a.key);
      return { ...s, threatsOn };
    }
    case 'threatsAll':
      return s.threatsOn.length === s.threatKeys.length ? s : { ...s, threatsOn: [...s.threatKeys] };
    case 'threatsNone':
      return s.threatsOn.length === 0 ? s : { ...s, threatsOn: [] };
    default:
      return s;
  }
}
