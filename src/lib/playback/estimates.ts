/** The plain-words note behind each estimate code, for the playback's ESTIMATED tooltip. */

import type { Estimate, EstimateCode } from './types';

const NOTES: Record<EstimateCode, string> = {
  profileNotFlown: 'The delivery profile has not been flown in DCS yet (the card says ESTIMATED).',
  cardPushIsEstimate: 'The card\'s push time is the drawn lines at one speed, with no turns: an estimate.',
  noWind: 'No wind: the IP crossing shown is the planned speeds along the drawn path, still an estimate.',
  flatGroundAgl: 'Altitudes are above the target\'s elevation, not above the ground under the jet.',
  vacuumBomb: 'The bomb falls in a vacuum, the planner\'s own model for its release range.',
  sightLineBomb: 'The dive release is drawn on the sight line; the bomb is shown on it, timed by a vacuum fall.',
  loftDragModel: 'The lofted bomb uses one drag figure for every bomb, sea-level air, no wind.',
  popClimbChord: 'The climb to the pull-down point is the side view\'s straight line, not the label\'s climb angle.',
  apexPlacement: 'The planner gives the apex no position; it is placed where the side view draws it.',
  pullDownShape: 'The altitude through the pull-down is a smooth curve through the planner\'s three points.',
  egressAltitudeSchematic: 'The climb or descent after release is the side view\'s sketch.',
  egressExtension: 'Past the drawn 1 nm egress leg the jet flies on along it.',
  fragEnvelope: 'The frag clear time is a planning envelope, not a DCS fragment model.',
};

export function estimatesOf(codes: EstimateCode[]): Estimate[] {
  return [...new Set(codes)].map((code) => ({ code, note: NOTES[code] }));
}
