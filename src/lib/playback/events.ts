/**
 * Events: each jet's in jet time, built with the track; the strike's as one
 * list in strike time. An anchored event sits exactly on its sample, so a tick
 * fires where the jet passes the matching marker on the map.
 *
 * `estimated` follows one rule: the flown push (no wind; it differs from the
 * card's push), the impact of a scripted or drag-model bomb, and the frag
 * clearing. The impact time itself is the TOT, by definition.
 */

import type { Waypoint } from '../../types';
import { toLocal, upOf } from './frame';
import type { FamilyFacts } from './family';
import type { Anchor, AnchorKind, EventKind, FragSpec, LocalFrame, StrikeEvent, StrikePlayback, StrikeTiming, TrackEvent, TrackSamples } from './types';

interface EventSpec {
  kind: EventKind;
  anchor: AnchorKind;
  label: string;
  tick: boolean;
  estimated?: boolean;
}

export function trackEvents(
  facts: FamilyFacts,
  anchors: Partial<Record<AnchorKind, Anchor>>,
  S: TrackSamples,
  impactTau_s: number,
  frag: FragSpec | undefined,
  target: Waypoint,
  frame: LocalFrame,
): TrackEvent[] {
  const commit: AnchorKind = facts.family === 'dive' ? 'ROLL' : facts.family === 'level' ? 'RUN' : 'POP';
  const specs: EventSpec[] = [
    { kind: 'push', anchor: 'IP', label: facts.pushLabel, tick: true, estimated: true },
    { kind: 'action', anchor: 'AP', label: 'Action · check turn', tick: false },
    { kind: 'commit', anchor: commit, label: facts.commitLabel, tick: true },
    { kind: 'pullDown', anchor: 'PDP', label: 'Pull down', tick: false },
    { kind: 'track', anchor: 'TRK', label: `Wings level · track ${facts.trackingTime_s ?? ''} s`, tick: false },
    { kind: 'release', anchor: 'REL', label: facts.releaseLabel, tick: true },
    { kind: 'rollOut', anchor: 'ROLLOUT', label: 'Roll out', tick: false },
  ];
  const events: TrackEvent[] = [];
  for (const spec of specs) {
    const a = anchors[spec.anchor];
    // A range-placed AP (a legacy dive's schematic one) is no check turn.
    if (!a || (spec.kind === 'action' && a.source !== 'marker')) continue;
    const i = a.index;
    events.push({
      kind: spec.kind, tau_s: S.tau_s[i], anchor: spec.anchor, label: spec.label, tick: spec.tick, estimated: spec.estimated ?? false,
      lat: S.lat[i], lon: S.lon[i], e_m: S.e_m[i], n_m: S.n_m[i], up_m: S.up_m[i], agl_ft: S.agl_ft[i], msl_ft: S.msl_ft[i],
    });
  }
  const elev = target.elevation_ft ?? 0;
  const tgt = toLocal(frame, target.coordinates);
  const atTarget = { anchor: 'TGT' as const, lat: target.coordinates.lat, lon: target.coordinates.lon, e_m: tgt.e_m, n_m: tgt.n_m, up_m: upOf(frame, elev), agl_ft: 0, msl_ft: elev };
  events.push({ kind: 'impact', tau_s: impactTau_s, label: 'Impact (TOT)', tick: true, estimated: facts.fall.model !== 'vacuum', ...atTarget });
  if (frag) events.push({ kind: 'fragClear', tau_s: impactTau_s + frag.clear_s, label: 'Frag clear (est.)', tick: false, estimated: true, ...atTarget });
  return events.sort((a, b) => a.tau_s - b.tau_s);
}

/** Every jet's events on the strike clock, sorted; plus each jet's card push for a ghost tick. */
export function strikeEvents(pb: StrikePlayback, timing: StrikeTiming): { events: StrikeEvent[]; cardPush_s: (number | undefined)[] } {
  const events: StrikeEvent[] = [];
  pb.jets.forEach((track, jet) => {
    const shift = timing.jets[jet].shift_s;
    for (const e of track.events) events.push({ ...e, jet, t_s: e.tau_s + shift });
  });
  events.sort((a, b) => a.t_s - b.t_s || a.jet - b.jet);
  return { events, cardPush_s: timing.jets.map((j) => j.cardPush_s) };
}
