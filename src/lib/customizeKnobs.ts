/**
 * Slider ranges for every number in Customize.
 *
 * A range sets where the slider stops, never what the planner may fly. The
 * number box beside each slider takes any finite value, and a value past the
 * end just pins the slider there (warn, never block — see
 * docs/DELIVERY_PLANNING.md and the keep-every-knob rule).
 *
 * Kept as data, apart from the forms, so geo-check can hold the list to the
 * forms' knob count and check that every library profile opens inside its
 * sliders rather than pinned at an end.
 */

import { MAX_OFFSET_LEG_RATIO } from './attackGeometry';

export interface KnobRange {
  min: number;
  max: number;
  step: number;
  unit: string;
}

const HEADING: KnobRange = { min: 0, max: 359, step: 1, unit: '°' };
const ACTION_RANGE: KnobRange = { min: 1, max: 40, step: 0.5, unit: 'nm' };
const CHECK_TURN: KnobRange = { min: 0, max: 90, step: 1, unit: '°' };
const SPEED: KnobRange = { min: 200, max: 600, step: 10, unit: 'kt' };
const PULL_G: KnobRange = { min: 2, max: 9, step: 0.5, unit: 'G' };

/** Numeric fields, keyed by profile type then by the profile's own field name. */
export const KNOB_RANGES = {
  dive_ccip: {
    ingressHeading_deg: HEADING,
    actionRange_nm: ACTION_RANGE,
    offsetAngle_deg: CHECK_TURN,
    ingressAltitude_ft: { min: 500, max: 30000, step: 500, unit: 'ft' },
    rollInAltitude_ft: { min: 500, max: 30000, step: 500, unit: 'ft' },
    diveAngle_deg: { min: 5, max: 60, step: 1, unit: '°' },
    releaseAltitude_ft: { min: 500, max: 20000, step: 100, unit: 'ft' },
    releaseSpeed_ktas: SPEED,
    pulloutG: PULL_G,
    egressHeading_deg: HEADING,
  },
  level_ccrp: {
    ingressHeading_deg: HEADING,
    offsetLegRatio: { min: 0.2, max: MAX_OFFSET_LEG_RATIO, step: 0.05, unit: '×' },
    actionRange_nm: ACTION_RANGE,
    offsetAngle_deg: CHECK_TURN,
    // MSL: the library's highest level release plus the highest DCS terrain.
    releaseAltitude_ft: { min: 500, max: 45000, step: 500, unit: 'ft' },
    releaseSpeed_ktas: SPEED,
    egressHeading_deg: HEADING,
  },
  popup_ccip: {
    runInHeading_deg: HEADING,
    minAltitude_ft: { min: 0, max: 10000, step: 100, unit: 'ft' },
    actionRange_nm: ACTION_RANGE,
    offsetAngle_deg: CHECK_TURN,
    diveAngle_deg: { min: 5, max: 45, step: 1, unit: '°' },
    releaseAltitude_ft: { min: 500, max: 15000, step: 100, unit: 'ft' },
    runInSpeed_ktas: { min: 300, max: 600, step: 10, unit: 'kt' },
    runInAltitude_ft: { min: 100, max: 5000, step: 100, unit: 'ft' },
    trackingTime_s: { min: 1, max: 10, step: 0.5, unit: 's' },
    pullG: PULL_G,
    egressHeading_deg: HEADING,
  },
} as const satisfies Record<string, Record<string, KnobRange>>;

/** The left/right pickers in each form: not sliders, but knobs all the same. */
export const KNOB_CHOICES = {
  dive_ccip: ['offsetDirection', 'egressDirection'],
  level_ccrp: ['offsetDirection', 'egressDirection'],
  popup_ccip: ['offsetDirection', 'egressDirection'],
} as const;

/** The custom IP as a radial and distance off the target. */
export const IP_KNOB_RANGES = {
  radial_deg: HEADING,
  distance_nm: { min: 1, max: 60, step: 0.5, unit: 'nm' },
} as const satisfies Record<string, KnobRange>;

export type KnobProfileType = keyof typeof KNOB_RANGES;
