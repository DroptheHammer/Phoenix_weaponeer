/**
 * What the phone's one-row header shows. The mission's name stands there only on the map; on the front page the
 * header is the app's own name. The red unsaved dot belongs to the mission's name, so it is shown only where that
 * name is: a dot beside "Phoenix Weaponeer" would read as the app having unsaved work.
 */
export function phoneHeader(
  missionName: string | null,
  onMap: boolean,
  unsaved: boolean,
  appName: string,
): { title: string; dirty: boolean } {
  const named = missionName !== null && onMap;
  return { title: named ? missionName : appName, dirty: named && unsaved };
}
