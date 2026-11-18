/**
 * The words inside the Flight overview (its jets' readiness, the threat block, the waypoint list and the map's
 * caption). Kept apart from words.ts because the front page imports words.ts at start-up, while these are needed
 * only once the overview, which loads on demand, opens. The header's words ("Front page", "Open the map") stay in
 * words.ts: App draws them.
 *
 * Nothing here speaks of threats the mission author hid: the app says nothing about them outside Settings > Admin.
 */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const OW = {
  oneOf: (n: number) => `One of ${n} player flights in this mission`,
  readiness: (planned: number, jets: number) => `${planned} of ${jets}`,
  readinessRest: (cards: number) => ` planned · ${plural(cards, 'card')} ready`,
  readinessLabel: (planned: number, jets: number) => `${planned} of ${jets} jets planned`,
  noJets: 'No jets in this flight yet. Add them in the Flight panel on the map.',
  threatsTitle: 'Threats',
  threatsTotal: (systems: number, threats: number) => `${plural(systems, 'system')} · ${plural(threats, 'threat')} in this mission`,
  classNames: { SAM: 'SAM', SHORAD: 'SHORAD', AAA: 'AAA', MANPADS: 'MANPADS', EWR: 'Early warning' } as Record<string, string>,
  classesLabel: 'Threat classes in this mission',
  tileSystems: (n: number) => (n === 1 ? ' system' : ' systems'),
  tileThreats: (n: number) => (n === 1 ? ' threat' : ' threats'),
  tileNone: ' none in this mission',
  near: 'Near',
  nearCaption: 'In reach first, then nearest within 60 nm, as the kneeboard card orders them. × is how many of that system are within 60 nm or in reach.',
  changeWaypoint: (short: string) => `Waypoint for the threat list: ${short}. Change`,
  nearest: 'nearest',
  maxRange: 'max range',
  outOfReach: '· out of reach',
  offMap: '· beyond the map',
  /** A site that is not active, in the card's own word ("DESTROYED", "SUPPRESSED", "DEGRADED", "UNKNOWN"). */
  status: (status: string) => `· ${status.toUpperCase()}`,
  countSr: ' of this system near or in reach',
  noNear: (short: string) => `No threats within 60 nm of ${short}.`,
  noWaypoints: 'This mission has no waypoints.',
  moreInReach: (n: number) => `+ ${n} more in reach`,
  outLineStrong: (n: number) => (n > 0 ? plural(n, 'more system') : 'No other systems'),
  outLineRest: (n: number, threats: number, short: string) => (n > 0 ? `, ${plural(threats, 'threat')}, out of reach of ${short}` : ' in this mission'),
  openThreats: 'Open Threats on the map',
  mapTitle: 'Map preview',
  /** The height only for a target: authors zero a target waypoint to the ground, so there it is the ground's; elsewhere it is a flight altitude. */
  mapTarget: (short: string, steerpoint: number, elevation: number | null) =>
    `${short} · Waypoint ${steerpoint}${elevation === null ? '' : ` · ${Math.round(elevation).toLocaleString('en-US')} ft MSL`}`,
  mapLabel: (short: string) => `Map of the area round ${short}, with the threats near it and their range rings`,
  pickerTitle: 'Show threats near',
  pickerRow: (inReach: number, nearOnly: number) =>
    inReach === 0 && nearOnly === 0 ? 'Nothing within 60 nm' : `${inReach} in reach · ${nearOnly} more within 60 nm`,
  overviewLabel: (flight: string) => `Flight overview: ${flight}`,
};
