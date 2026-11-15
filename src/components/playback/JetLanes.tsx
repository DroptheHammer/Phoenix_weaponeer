/**
 * The lanes under the time bar: one per jet, on the same time axis as the
 * scrubber. A lane is a band cut into the planner's phase colours (the colour
 * code of the map and the card), with a lettered chip at each point where the
 * pilot acts (AP, POP, PDP, TRK, REL, the same letters and colours as the
 * planner's discs), the two IP marks, and a diamond at the time over target.
 * Beside it, the jet's seat (a button: it picks the jet to watch) and its times.
 * A seat that is not flown has a lane too, with the reason in place of the
 * band, so the lanes stay in the card's seat order.
 *
 * Marks before the time bar starts (usually the IP crossing) sit at the left
 * edge in one small group, "‹ IP", instead of off the end of the bar. Chips
 * take the row above or below the band so none covers another.
 *
 * Only the thin white line that follows the clock listens to it; the rest is
 * drawn once per change of jets, axis or width, so nothing here re-renders
 * while the jet plays.
 *
 * Colour is never the only cue: each colour change sits on a lettered chip
 * (the egress turn into its leg is told by the dash), the band is outlined,
 * and every chip and stretch has a tooltip with the planner's own words.
 */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LABEL_STYLE, MARKER_COLOR } from '../../lib/attackPicture';
import {
  axisFraction, BAND_H_PX, BAND_OUTLINE, BAND_TOP_PX, CHIP_DOT_PX, CHIP_H_PX, CHIP_TEXT, chipWidth, DIAMOND_EDGE, DIAMOND_PX, IP_TEXT, laneChips,
  PIN_CHIP_BG, PIN_CHIP_TEXT, PIN_GLYPH, PIN_MARK_PX, pinnedGroup,
  type ActionKind, type Axis, type LaneBand, type LaneMark, type SeatMarks,
} from '../../lib/playbackScene';
import { fmtStrikeTime } from '../../lib/strike';
import type { PlaybackScene } from './scene/createScene';
import { bandTitle, laneSummary, markTitle, pinnedTitle, READOUT_TITLE } from './laneText';
import {
  bandBackground, CHIP, CHIP_LETTERS, keepFocus, LANE, LANE_LABEL, LANE_SKIPPED, LANES, PIN_MARK, READOUT, ROW_GRID, SEAT_DOT, SEAT_OFF, SEAT_ON,
  SEAT_SKIPPED,
} from './ui';

/** One member's lane: a jet's, or a skipped member's (marks and bands empty, the reason given). */
export interface LaneInfo {
  seat: number;
  /** The seat label, "#1". */
  label: string;
  callsign?: string;
  /** The dot beside the seat label: the colour the jet's arrow is drawn in. */
  colour: string;
  marks: SeatMarks;
  bands: readonly LaneBand[];
  /** Time over target, strike time. */
  tot_s: number;
  /** When the card says to leave the IP, strike time; undefined when it has no figure. */
  cardPush_s: number | undefined;
  /** Why the jet is not flown, when it is not: the lane says so instead of drawing a band. */
  skipped?: string;
}

interface JetLanesProps {
  /** Null until the scene is up: the lanes draw without the moving line until then. */
  scene: PlaybackScene | null;
  axis: Axis;
  lanes: readonly LaneInfo[];
  /** The watched seat. */
  watched: number;
  /** A seat button was pressed (only a flown seat's can be). */
  onWatch(seat: number): void;
}

/** The white line at the clock's time. The one part of a lane that listens to the clock (about 12 times a second). */
function NowLine({ scene, axis }: { scene: PlaybackScene; axis: Axis }) {
  const snap = useSyncExternalStore(scene.subscribe, scene.getSnapshot);
  return <div aria-hidden data-now className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white" style={{ left: `${axisFraction(axis, snap.t) * 100}%` }} />;
}

/** The colours of a chip: a marker's own, or the IP label's blue (filled for the 3D's crossing, outlined and dashed for the card's push). */
function chipLook(kind: LaneMark['kind']): { background: string; color: string; boxShadow?: string; border?: string } {
  if (kind === 'push') return { background: LABEL_STYLE.ipBg, color: IP_TEXT, boxShadow: `inset 0 0 0 1px ${LABEL_STYLE.ipBorder}` };
  if (kind === 'cardPush') return { background: 'transparent', color: LABEL_STYLE.ipBorder, border: `1px dashed ${LABEL_STYLE.ipBorder}` };
  return { background: MARKER_COLOR[kind as ActionKind], color: CHIP_TEXT[kind as ActionKind] };
}

/** A lane's left cell: the button that picks the jet to watch. Pressed while it is the one watched; a seat not flown cannot be pressed. */
function SeatButton({ info, watched, onWatch }: { info: LaneInfo; watched: boolean; onWatch(seat: number): void }) {
  const who = `${info.label}${info.callsign ? ` ${info.callsign}` : ''}`;
  const flown = info.skipped === undefined;
  return (
    <button
      type="button"
      data-seat={info.seat}
      disabled={!flown}
      aria-pressed={watched}
      aria-label={`Watch ${who}`}
      // The side view is not built yet, so the title does not say it follows the watch.
      title={flown ?`Watch ${info.label}: Chase, From target and the planner's colours follow it` : 'Not flown in 3D'}
      onClick={() => onWatch(info.seat)}
      onMouseDown={keepFocus}
      className={`${LANE_LABEL} ${!flown ? SEAT_SKIPPED : watched ? SEAT_ON : SEAT_OFF}`}
    >
      <span aria-hidden className={SEAT_DOT} style={{ background: info.colour }} />
      <span className="min-w-0 truncate">{who}</span>
      {watched && <span aria-hidden className="shrink-0">◉</span>}
    </button>
  );
}

/** A lane's right cell: the time over target and the card's push time. `title` explains them (left off for a strike of one). */
function Readout({ info, title }: { info: LaneInfo; title?: string }) {
  return (
    <div data-readout={info.seat} className={READOUT} title={title}>
      <div>TOT {fmtStrikeTime(info.tot_s)}</div>
      <div>push IP {info.cardPush_s === undefined ? '—' : fmtStrikeTime(info.cardPush_s)}</div>
    </div>
  );
}

interface LaneProps {
  info: LaneInfo;
  scene: PlaybackScene | null;
  axis: Axis;
  width: number;
  watched: boolean;
  onWatch(seat: number): void;
  /** The times cell's tooltip: given when the strike has more than one jet. */
  readoutTitle?: string;
}

function Lane({ info, scene, axis, width, watched, onWatch, readoutTitle }: LaneProps) {
  const { marks, bands } = info;
  const pinned = marks.pinnedStart;
  const group = pinnedGroup(marks);
  // Each chip's place, worked out once per change of marks, axis or width.
  const placed = useMemo(() => laneChips(marks, axis, width), [marks, axis, width]);

  const impact = marks.marks.find((m) => m.kind === 'impact');
  const extent = bands.length ? { f0: bands[0].f0, f1: bands[bands.length - 1].f1 } : undefined;
  const span = extent ? Math.max(extent.f1 - extent.f0, 1e-9) : 1;

  if (info.skipped !== undefined) {
    return (
      <div data-lane-skipped={info.seat} className={ROW_GRID}>
        <SeatButton info={info} watched={false} onWatch={onWatch} />
        <div className={LANE}>
          <div className={LANE_SKIPPED} title={info.skipped}>
            <span className="truncate">not flown in 3D: {info.skipped}</span>
          </div>
        </div>
        <Readout info={info} title={readoutTitle} />
      </div>
    );
  }

  return (
    <div data-lane={info.seat} className={ROW_GRID}>
      <SeatButton info={info} watched={watched} onWatch={onWatch} />

      <div className={LANE}>
        <div data-lane-axis role="img" aria-label={laneSummary(info.label, info.callsign, marks)} className="relative h-full">
          {extent && (
            // The band's outline runs round exactly the stretch the jet is flying, not the whole axis.
            <div
              aria-hidden
              className="absolute rounded-sm"
              style={{ left: `${extent.f0 * 100}%`, width: `${(extent.f1 - extent.f0) * 100}%`, top: BAND_TOP_PX, height: BAND_H_PX, boxShadow: `0 0 0 1px ${BAND_OUTLINE}` }}
            >
              {bands.map((b) => (
                <span
                  key={b.key}
                  aria-hidden
                  data-band={b.style}
                  data-phase={b.phase}
                  title={bandTitle(b)}
                  className="absolute inset-y-0"
                  style={{ left: `${((b.f0 - extent.f0) / span) * 100}%`, width: `${((b.f1 - b.f0) / span) * 100}%`, background: bandBackground(b.style) }}
                />
              ))}
            </div>
          )}

          {width > 0 && placed.map(({ mark: m, width_px: w, x_px: x, row }) =>
            row < 0 ? (
              // No room on either row: a dot where the chip would be, so the mark is still there.
              <span
                key={m.key}
                aria-hidden
                data-chip={m.letters}
                data-kind={m.kind}
                data-row={row}
                title={markTitle(m)}
                className="absolute -translate-x-1/2 rounded-full"
                style={{ left: x, top: BAND_TOP_PX + BAND_H_PX + (CHIP_H_PX - CHIP_DOT_PX) / 2, width: CHIP_DOT_PX, height: CHIP_DOT_PX, ...chipLook(m.kind) }}
              />
            ) : (
              <span
                key={m.key}
                aria-hidden
                data-chip={m.letters}
                data-kind={m.kind}
                data-row={row}
                title={markTitle(m)}
                className={`${CHIP} ${CHIP_LETTERS}`}
                style={{ left: x, top: row === 0 ? 0 : BAND_TOP_PX + BAND_H_PX, width: w, ...chipLook(m.kind) }}
              >
                {m.letters}
              </span>
            ),
          )}

          {group && (
            <span
              aria-hidden
              data-pinned="start"
              data-keys={pinned.map((m) => m.key).join(' ')}
              title={pinnedTitle(pinned)}
              className="absolute left-0 top-0 h-3"
              style={{ width: PIN_MARK_PX + chipWidth(group.letters) }}
            >
              <span data-pinned-mark className={PIN_MARK} style={{ width: PIN_MARK_PX, color: PIN_GLYPH }}>‹</span>
              <span
                className={`${CHIP} ${CHIP_LETTERS}`}
                style={{
                  left: PIN_MARK_PX + chipWidth(group.letters) / 2, top: 0, width: chipWidth(group.letters),
                  ...(group.ip ? chipLook(group.filled ? 'push' : 'cardPush') : { background: PIN_CHIP_BG, color: PIN_CHIP_TEXT }),
                }}
              >
                {group.letters}
              </span>
            </span>
          )}

          {impact && width > 0 && (
            // The time over target: a diamond on the band, the planner's red with a pale edge (the red alone is faint on the panel for some eyes).
            <span
              aria-hidden
              data-impact
              title={markTitle(impact)}
              className="absolute z-[5] -translate-x-1/2 -translate-y-1/2 rotate-45"
              style={{ left: axisFraction(axis, impact.t_s) * width, top: BAND_TOP_PX + BAND_H_PX / 2, width: DIAMOND_PX, height: DIAMOND_PX, background: MARKER_COLOR.TGT, border: `1px solid ${DIAMOND_EDGE}` }}
            />
          )}

          {scene && <NowLine scene={scene} axis={axis} />}
        </div>
      </div>

      <Readout info={info} title={readoutTitle} />
    </div>
  );
}

export function JetLanes({ scene, axis, lanes, watched, onWatch }: JetLanesProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The lanes are all the same width (the grid sees to that), so one observer on the first axis box tells them all.
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const box = rootRef.current?.querySelector<HTMLElement>('[data-lane-axis]');
    if (!box) return;
    const measure = () => setWidth(box.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [lanes.length]);

  const readoutTitle = lanes.length >= 2 ? READOUT_TITLE : undefined;
  return (
    <div ref={rootRef} role="group" aria-label="Jets: pick the one to watch" className={LANES}>
      {lanes.map((l) => <Lane key={l.seat} info={l} scene={scene} axis={axis} width={width} watched={l.seat === watched} onWatch={onWatch} readoutTitle={readoutTitle} />)}
    </div>
  );
}
