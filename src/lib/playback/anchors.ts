/**
 * Where the planner's named points sit on the flight polyline.
 *
 * Every picture marker (AP, ROLL, RUN, POP, PDP, TRK, REL) is anchored on the
 * chain vertex it was drawn from, in marker order. Never by range to the
 * target: range is not monotonic along every drawn path (a level offset leg
 * past cot θ dips back out), and the side view's stored ranges are rounded.
 */

import type { AttackPicture } from '../../types/attackPicture.types';
import { type Chain, lineStartS, vertexS } from './chain';
import type { Anchor, AnchorKind } from './types';

export interface MarkerAnchors {
  s: Partial<Record<AnchorKind, number>>;
  source: Partial<Record<AnchorKind, Anchor['source']>>;
  warnings: string[];
}

/**
 * Markers reuse the line points they mark, so a same-point match is expected.
 * A 0.001 nm fallback keeps a playback alive if a builder ever recomputes a
 * point, with a warning, because then a test somewhere should fail.
 */
const NEAR_NM = 0.001;

export function anchorMarkers(chain: Chain, picture: AttackPicture): MarkerAnchors {
  const s: MarkerAnchors['s'] = { IP: 0 };
  const source: MarkerAnchors['source'] = { IP: 'ip' };
  const warnings: string[] = [];
  let from = 0;
  for (const m of picture.markers) {
    if (m.kind === 'TGT') continue;
    let at = vertexS(chain, m.position, from);
    if (at == null) {
      at = vertexS(chain, m.position, from, NEAR_NM);
      if (at != null) warnings.push(`The ${m.kind} marker is not exactly on the drawn path (within ${NEAR_NM} nm).`);
    }
    if (at == null) {
      warnings.push(`The ${m.kind} marker is not on the drawn path: no altitude or event is pinned to it.`);
      continue;
    }
    s[m.kind] = at;
    source[m.kind] = 'marker';
    from = at;
  }
  const rollOut = lineStartS(chain, 'egressLeg');
  if (rollOut != null) {
    s.ROLLOUT = rollOut;
    source.ROLLOUT = 'line';
  }
  s.END = chain.length_nm;
  source.END = 'line';
  return { s, source, warnings };
}
