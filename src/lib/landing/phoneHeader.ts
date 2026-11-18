/**
 * What the phone's header shows. The mission's name stands there only on the map; on the front page the
 * header is the app's own name. The red unsaved dot belongs to the mission's name, so it is shown only where that
 * name is: a dot beside "Phoenix Weaponeer" would read as the app having unsaved work.
 *
 * On the map (a `place` given) the second line is the place the mission is planned on, then the same words that
 * stand beside the dot on the desktop ("Nevada (NTTR) · Not exported"): the dot alone is easy to miss, and the
 * place is short enough that a phone does not cut the words off. Without a `place` the map's header has no second line.
 *
 * On the Flight overview (`overview` given, a mission open, not on the map) the header is the flight: "Venom 1 ·
 * 4 × F-16C Viper" over a second line with the mission's name, place and when it was edited. The mission's name is
 * only in that smaller line there, so the dot is not shown beside the flight either. Unsaved work is said there in
 * words instead (`unsavedWords`, "Not exported" in the browser), first in that second line, because a phone cuts a
 * line at its right end and these are the words that must not be cut.
 */
export function phoneHeader(
  missionName: string | null,
  onMap: boolean,
  unsaved: boolean,
  appName: string,
  overview: { title: string; aircraft: string; sub: string } | null = null,
  unsavedWords = 'Unsaved changes',
  place: string | null = null,
): { title: string; subtitle?: string; dirty: boolean } {
  const named = missionName !== null && onMap;
  if (missionName !== null && !onMap && overview) {
    const subtitle = unsaved ? [unsavedWords, overview.sub].filter(Boolean).join(' · ') : overview.sub;
    return { title: overview.aircraft ? `${overview.title} · ${overview.aircraft}` : overview.title, subtitle: subtitle || undefined, dirty: false };
  }
  const subtitle = named && place !== null ? [place, unsaved ? unsavedWords : ''].filter(Boolean).join(' · ') : '';
  return { title: named ? missionName : appName, subtitle: subtitle || undefined, dirty: named && unsaved };
}
