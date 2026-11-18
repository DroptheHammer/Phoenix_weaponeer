/**
 * What the phone's one-row header shows. The mission's name stands there only on the map; on the front page the
 * header is the app's own name. The red unsaved dot belongs to the mission's name, so it is shown only where that
 * name is: a dot beside "Phoenix Weaponeer" would read as the app having unsaved work.
 *
 * On the Flight overview (`overview` given, a mission open, not on the map) the header is the flight: "Venom 1 ·
 * 4 × F-16C Viper" over a second line with the mission's name, place and when it was edited. The mission's name is
 * only in that smaller line there, so the dot is not shown beside the flight either.
 */
export function phoneHeader(
  missionName: string | null,
  onMap: boolean,
  unsaved: boolean,
  appName: string,
  overview: { title: string; aircraft: string; sub: string } | null = null,
): { title: string; subtitle?: string; dirty: boolean } {
  const named = missionName !== null && onMap;
  if (missionName !== null && !onMap && overview) {
    return { title: overview.aircraft ? `${overview.title} · ${overview.aircraft}` : overview.title, subtitle: overview.sub || undefined, dirty: false };
  }
  return { title: named ? missionName : appName, dirty: named && unsaved };
}
