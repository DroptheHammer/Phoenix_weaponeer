import type { Coordinates } from './waypoint.types';

/**
 * The attack, drawn. One description feeds both the planner's map overlay and
 * the kneeboard card, so a pilot sees the same points, colours and words in
 * the briefing and on the knee.
 */

/** Which stage of the attack a line belongs to; each has one colour and dash everywhere. */
export type LineStyleKey = 'route' | 'leg' | 'climb' | 'pullDown' | 'attack' | 'bomb' | 'egress' | 'egressLeg';

/** The named points. Each has one colour everywhere. */
export type MarkerKind = 'AP' | 'ROLL' | 'RUN' | 'POP' | 'PDP' | 'TRK' | 'REL' | 'TGT';

export type LabelSide = 'top' | 'bottom' | 'left' | 'right';

export interface PictureLine {
  style: LineStyleKey;
  points: Coordinates[];
}

export interface PictureMarker {
  kind: MarkerKind;
  position: Coordinates;
  /** The white label's lines — the words a pilot reads at that point. */
  lines: string[];
  side: LabelSide;
  /** Shown without hovering. */
  permanent: boolean;
}

export interface PictureLabel {
  kind: 'egress' | 'ip';
  position: Coordinates;
  text: string;
}

export interface AttackPicture {
  lines: PictureLine[];
  markers: PictureMarker[];
  labels: PictureLabel[];
  attackHeading: number;
  egressHeading: number;
  egressDirection: string;
  /** The IP's short name — "STPT 3" or "CUSTOM IP" — for the card's frame-edge arrow. */
  ipShortLabel?: string;
}

// ─── Side view ────────────────────────────────────────────────────────────────

export type SidePointKind = MarkerKind | 'APEX' | 'EGRESS';

export interface SidePoint {
  kind: SidePointKind;
  /** Ground distance from the target along the track; positive = before the target. */
  dist_nm: number;
  alt_ft: number;
  /** Short white label, when the point carries a number the pilot needs. */
  label?: string;
  side?: LabelSide;
}

export interface SideSegment {
  style: LineStyleKey;
  /** Indexes into `points`. */
  from: number;
  to: number;
  /** Index of a point the curve passes over (a pull-down through the apex). */
  via?: number;
  /** A pull-up drawn as a rising curve. */
  curve?: 'up';
}

export interface SideProfile {
  points: SidePoint[];
  segments: SideSegment[];
  hardDeck_ft?: number;
  maxAlt_ft: number;
}
