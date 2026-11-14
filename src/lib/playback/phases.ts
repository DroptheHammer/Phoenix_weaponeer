/**
 * Phases are the picture's own line styles, so a trail coloured with
 * `LINE_STYLE[PHASE_STYLE[phase]]` has the map's colours. The lead-in draws as
 * route and the extension as the egress leg.
 */

import type { PhaseStyle, PlaybackPhase } from './types';

/** Index order of `TrackSamples.phase`. */
export const PHASES: readonly PlaybackPhase[] = ['leadIn', 'route', 'leg', 'climb', 'pullDown', 'attack', 'egress', 'egressLeg', 'extension'];

export const PHASE_STYLE: PhaseStyle = {
  leadIn: 'route',
  route: 'route',
  leg: 'leg',
  climb: 'climb',
  pullDown: 'pullDown',
  attack: 'attack',
  egress: 'egress',
  egressLeg: 'egressLeg',
  extension: 'egressLeg',
};

export const phaseIndex = (phase: PlaybackPhase): number => PHASES.indexOf(phase);
