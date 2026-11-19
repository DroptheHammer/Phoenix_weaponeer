/**
 * The About dialog's entry for the elevation data behind the 3D playback's ground. Desktop build only:
 * the phone has no 3D playback and draws no heights, so `entry.web.tsx` never imports this file and
 * none of its words reach the web build (scripts/bundle-check.mjs looks for the credit in it).
 *
 * The owner is the playback's own credit line, from terrain.ts, less its leading "Elevation: " label, so
 * the two cannot drift apart. That line points to the playback's "Elevation sources" list, so the entry
 * says where the list is.
 */
import type { CreditEntry } from '../about/credits';
import { ELEVATION_CREDIT } from '../../lib/playbackScene/terrain';

export const ELEVATION_ENTRY: CreditEntry = {
  key: 'elevation',
  name: 'Elevation data',
  owner: ELEVATION_CREDIT.replace(/^Elevation: /, ''),
  takes: 'The height of the ground in the 3D playback, which lists the sources under "Elevation sources".',
};
