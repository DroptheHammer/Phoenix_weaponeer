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
 * The time over target is moved from here. On every lane but seat #1's (the
 * others are timed against it) the diamond is a handle: drag it along the lane,
 * or focus it and use the arrow keys (a second a press, five with Shift); or
 * type the seconds into the box in the times cell, which a seat that is not
 * flown has too. Amber stripes behind the diamond mark the times that would put
 * the jet inside another jet's blast radius when a bomb goes off, or another
 * jet inside its own (a stripe for an instant is drawn at least a few pixels
 * wide; on a strike warned by spacing in time, the times inside another's
 * frag), but only while that jet's time is being set
 * (its diamond held, or focused by the keyboard, or its box focused: at rest a
 * lane is clean, and the diamond's tooltip says what the stripes are), and a
 * warning mark beside its time says it is inside one now. While a handle is held
 * the lanes keep the scale they had (the axis is handed in frozen), so the lane
 * does not slide under the pointer.
 *
 * Marks before the time bar starts (usually the IP crossing) sit at the left
 * edge in one small group, "‹ IP", instead of off the end of the bar. Chips
 * take the row above or below the band so none covers another. A diamond
 * dragged past either end sits at that edge with an arrow, "‹◆" or "◆›", and
 * can still be taken hold of.
 *
 * Only the thin white line that follows the clock listens to it; the rest is
 * drawn once per change of jets, axis or width, so nothing here re-renders
 * while the jet plays.
 *
 * Colour is never the only cue: each colour change sits on a lettered chip
 * (the egress turn into its leg is told by the dash), the band is outlined,
 * and every chip and stretch has a tooltip with the planner's own words.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { LABEL_STYLE, MARKER_COLOR } from '../../lib/attackPicture';
import {
  axisFraction, axisTime, BAND_H_PX, BAND_OUTLINE, BAND_TOP_PX, bandBox, CHIP_DOT_PX, CHIP_H_PX, CHIP_TEXT, chipWidth, DIAMOND_EDGE, DIAMOND_PX, handleKeyStep,
  HANDLE_PX, IP_TEXT, laneChips, laneZonesShown, PIN_CHIP_BG, PIN_CHIP_TEXT, PIN_GLYPH, PIN_MARK_PX, pinnedGroup, ZONE_PAD_PX,
  type ActionKind, type Axis, type Band, type LaneBand, type LaneMark, type SeatMarks,
} from '../../lib/playbackScene';
import { fmtStrikeTime } from '../../lib/strike';
import type { PlaybackScene } from './scene/createScene';
import { bandTitle, boxLabel, handleLabel, handleTitle, heldTitle, laneSummary, markTitle, pinnedTitle, READOUT_TITLE } from './laneText';
import {
  bandBackground, CHIP, CHIP_LETTERS, CONFLICT_MARK, HANDLE, HATCH, keepFocus, keyboardFocused, LANE, LANE_LABEL, LANE_SKIPPED, LANES, leaveBox, PIN_MARK,
  READOUT, READOUT_LINE, ROW_GRID, SEAT_DOT, SEAT_OFF, SEAT_ON, SEAT_SKIPPED, TIME_BOX,
} from './ui';

/** One member's lane: a jet's, or a skipped member's (marks and bands empty, the reason given). */
export interface LaneInfo {
  seat: number;
  /** The member's id: what a new time over target names. */
  id: string;
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
  /** Seat #1: held still, the others are timed against it. It has no handle and no box. */
  locked: boolean;
  /** Where this jet's time over target would start a frag warning (inside another's blast radius, or another jet inside its own; under the spacing rule, inside another's frag): stripes behind its diamond (none for a locked or skipped seat). */
  zones: readonly Band[];
  /** In words, the frag warnings (blast or spacing) the seat is in at its time now; undefined when it is in none. */
  conflict: string | undefined;
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
  /** A member's time over target is now this (strike time): the handle, its keys and the box all say it here. */
  onDelay(id: string, value_s: number): void;
  /** A handle was taken hold of (true) or let go (false). */
  onDrag(on: boolean): void;
  /** What a diamond's tooltip says the stripes are, in the words of the strike's frag rule; left out, the spacing rule's. */
  stripesWords?: string;
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
      title={flown ? `Watch ${info.label}: Chase, From target, Side view and the planner's colours follow it` : 'Not flown in 3D'}
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

/** A time to show in the box: whole seconds as they are, a fraction to the millisecond (a re-based plan can leave one). */
const timeText = (t_s: number) => String(Math.round(t_s * 1000) / 1000);

/**
 * The box a time over target is typed in (seconds after T, negatives too). While it has the focus it keeps
 * its own text, because "-" on the way to "-15" is not a time yet; each text that is a number is a new time
 * at once, and when it loses the focus it shows the session's time again. Enter lets go of it.
 *
 * The typed text stands only while the session's time is the one it was typed at. A time changed from
 * elsewhere while the box still has the focus (Reset, pressed with the mouse, leaves the focus where it
 * was) shows in the box at once, not the text left behind.
 */
function TimeBox({ info, onDelay, onFocusChange }: { info: LaneInfo; onDelay(id: string, value_s: number): void; onFocusChange?(on: boolean): void }) {
  const [typed, setTyped] = useState<{ text: string; at_s: number } | undefined>(undefined);
  const text = typed !== undefined && typed.at_s === info.tot_s ? typed.text : undefined;
  return (
    <>
      <input
        type="number"
        step={1}
        data-box={info.seat}
        aria-label={boxLabel(info.label)}
        value={text ?? timeText(info.tot_s)}
        onChange={(e) => {
          const v = e.currentTarget.valueAsNumber;
          // A number is the session's time from the next render on; anything else leaves the time as it is.
          setTyped({ text: e.currentTarget.value, at_s: Number.isFinite(v) ? v : info.tot_s });
          if (Number.isFinite(v)) onDelay(info.id, v);
        }}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => {
          setTyped(undefined);
          onFocusChange?.(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          leaveBox(e.currentTarget);
        }}
        className={TIME_BOX}
      />
      <span aria-hidden>s</span>
    </>
  );
}

/** A lane's right cell: the time over target (typed in a box, or held), the card's push time, and a mark when the jet is in a frag warning (blast or spacing). `title` explains the times (left off for a strike of one). */
function Readout({ info, title, strike, onDelay, onBoxFocus }: { info: LaneInfo; title?: string; strike: boolean; onDelay(id: string, value_s: number): void; onBoxFocus?(on: boolean): void }) {
  return (
    <div data-readout={info.seat} className={READOUT} title={title}>
      <div className={READOUT_LINE}>
        <span>TOT {fmtStrikeTime(info.tot_s)}</span>
        {info.locked ? (
          strike && <span title={heldTitle(info.label)}>· held</span>
        ) : (
          <TimeBox info={info} onDelay={onDelay} onFocusChange={onBoxFocus} />
        )}
        {info.conflict !== undefined && (
          <span data-conflict-mark className={CONFLICT_MARK} title={info.conflict}>⚠</span>
        )}
      </div>
      <div>push IP {info.cardPush_s === undefined ? '—' : fmtStrikeTime(info.cardPush_s)}</div>
    </div>
  );
}

interface HandleProps {
  info: LaneInfo;
  /** The axis the lane draws on now (frozen while a handle is held). */
  axis: Axis;
  width: number;
  /** The lane's axis box: a pointer's place along it is a time. */
  axisBox: RefObject<HTMLDivElement>;
  /** The diamond is off the axis: it sits at that edge with an arrow. */
  pinned: 'start' | 'end' | undefined;
  /** The diamond's tooltip, said whole (the pinned words come first when it is off the axis). */
  title: string;
  onDelay(id: string, value_s: number): void;
  onDrag(on: boolean): void;
  /** The keyboard has the diamond (true: a Tab onto it, an arrow key pressed on it) or no longer does (false: it lost the focus, or a mouse press took hold of it); the focus a mouse press leaves behind is not the keyboard's. */
  onKeyboardFocus(on: boolean): void;
}

/**
 * The diamond that is also the handle: the planner's red with a pale edge, at the jet's time over target.
 * A press takes hold of it (the pointer is captured, so it follows beyond the lane), and its place along the
 * lane is the new time, to the second. A pointer moves faster than the picture can be redrawn, so the moves are
 * kept and handed on once a frame; when the pointer is let go, lost or the handle loses the focus, the last
 * one is handed on at once and the drag is over.
 */
function Handle({ info, axis, width, axisBox, pinned, title, onDelay, onDrag, onKeyboardFocus }: HandleProps) {
  const held = useRef<number | undefined>(undefined); // the pointer holding it
  const pending = useRef<number | undefined>(undefined);
  const frame = useRef(0);
  // The handlers below are made once per render, but a frame callback outlives it: it reads the latest.
  const latest = useRef({ info, axis, onDelay, onDrag });
  latest.current = { info, axis, onDelay, onDrag };

  const flush = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    const v = pending.current;
    pending.current = undefined;
    if (v !== undefined) latest.current.onDelay(latest.current.info.id, v);
  };
  const letGo = () => {
    if (held.current === undefined) return;
    held.current = undefined;
    flush();
    latest.current.onDrag(false);
  };
  // Closing playback with a move still waiting: nothing is left to hand it to.
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  return (
    <span
      role="slider"
      tabIndex={0}
      data-handle={info.seat}
      aria-label={handleLabel(info.label)}
      aria-valuemin={axis.t0_s}
      aria-valuemax={axis.t1_s}
      aria-valuenow={info.tot_s}
      aria-valuetext={fmtStrikeTime(info.tot_s)}
      title={title}
      className={HANDLE}
      style={{ left: axisFraction(axis, info.tot_s) * width, top: BAND_TOP_PX + BAND_H_PX / 2, width: HANDLE_PX, height: HANDLE_PX }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        held.current = e.pointerId;
        // A diamond reached by Tab keeps its focus through a press, so no focus event says the mouse has it now: the
        // press itself ends the keyboard's claim (an arrow key gives it back), and the let-go leaves the lane clean.
        onKeyboardFocus(false);
        onDrag(true);
      }}
      onPointerMove={(e) => {
        if (held.current !== e.pointerId) return;
        const box = axisBox.current?.getBoundingClientRect();
        if (!box || !(box.width > 0)) return;
        pending.current = axisTime(latest.current.axis, (e.clientX - box.left) / box.width);
        if (!frame.current) {
          frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            const v = pending.current;
            pending.current = undefined;
            if (v !== undefined) latest.current.onDelay(latest.current.info.id, v);
          });
        }
      }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      onLostPointerCapture={letGo}
      onFocus={(e) => onKeyboardFocus(keyboardFocused(e.currentTarget))}
      onBlur={() => {
        letGo();
        onKeyboardFocus(false);
      }}
      onKeyDown={(e) => {
        const step = handleKeyStep(e.key, e.shiftKey);
        if (step === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        // A key that moves the time is the keyboard setting it, even on a diamond a mouse press focused: no new focus
        // event comes to say so, and the browser's own :focus-visible turns on at the first key.
        onKeyboardFocus(true);
        onDelay(info.id, info.tot_s + step);
      }}
    >
      {pinned === 'start' && <span aria-hidden data-pin-arrow="start" className="absolute right-full text-[11px] leading-3" style={{ color: PIN_GLYPH }}>‹</span>}
      <span
        aria-hidden
        data-impact
        className="rotate-45"
        style={{ width: DIAMOND_PX, height: DIAMOND_PX, background: MARKER_COLOR.TGT, border: `1px solid ${DIAMOND_EDGE}` }}
      />
      {pinned === 'end' && <span aria-hidden data-pin-arrow="end" className="absolute left-full text-[11px] leading-3" style={{ color: PIN_GLYPH }}>›</span>}
    </span>
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
  /** The strike has more than one member: seat #1 is "held", the others can be moved. */
  strike: boolean;
  onDelay(id: string, value_s: number): void;
  onDrag(on: boolean): void;
  stripesWords?: string;
}

function Lane({ info, scene, axis, width, watched, onWatch, readoutTitle, strike, onDelay, onDrag, stripesWords }: LaneProps) {
  const { marks, bands } = info;
  const pinned = marks.pinnedStart;
  const group = pinnedGroup(marks);
  const axisBox = useRef<HTMLDivElement>(null);
  // Each chip's place, worked out once per change of marks, axis or width.
  const placed = useMemo(() => laneChips(marks, axis, width), [marks, axis, width]);
  // The three ways this jet's time is being set, kept from the lane's own events: the stripes show only while
  // one of them holds. (The session's `dragging` is any lane's hold, and is not it.)
  const [held, setHeld] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [boxFocus, setBoxFocus] = useState(false);
  const zonesShown = laneZonesShown({ held, keyboardFocus, boxFocus });
  // The diamond's tooltip says what the stripes are whenever the lane has any to show, so it can be asked at rest.
  const handleWords = handleTitle(info.label, info.zones.length > 0, stripesWords);

  const impact = [...marks.pinnedStart, ...marks.marks, ...marks.pinnedEnd].find((m) => m.kind === 'impact');
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
        <Readout info={info} title={readoutTitle} strike={strike} onDelay={onDelay} />
      </div>
    );
  }

  return (
    <div data-lane={info.seat} className={ROW_GRID}>
      <SeatButton info={info} watched={watched} onWatch={onWatch} />

      <div className={LANE}>
        <div ref={axisBox} data-lane-axis className="relative h-full">
          {/* The lane's picture, said in one sentence for a screen reader: an image of its own, with nothing inside it (what is inside an image is not offered as a control, and the handle must be). */}
          <span role="img" aria-label={laneSummary(info.label, info.callsign, marks)} className="pointer-events-none absolute inset-0" />

          {/* Behind everything, while this jet's time is being set: the times at which its time over target would start a frag warning (blast or spacing). Nothing here takes a press. */}
          {zonesShown && info.zones.map((z) => {
            const f0 = axisFraction(axis, z.t0_s);
            const f1 = axisFraction(axis, z.t1_s);
            if (!(f1 > f0)) return null;
            return (
              <span
                key={z.key}
                aria-hidden
                data-zone={z.key}
                className="pointer-events-none absolute"
                style={{ ...bandBox(f0, f1, z.minPx), top: BAND_TOP_PX - ZONE_PAD_PX, height: BAND_H_PX + 2 * ZONE_PAD_PX, background: HATCH }}
              />
            );
          })}

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

          {impact && width > 0 && (info.locked ? (
            // Seat #1's time is held: a plain mark, the diamond with nothing to take hold of.
            // The time over target: a diamond on the band, the planner's red with a pale edge (the red alone is faint on the panel for some eyes).
            <span
              aria-hidden
              data-impact
              title={markTitle(impact)}
              className="absolute z-[5] -translate-x-1/2 -translate-y-1/2 rotate-45"
              style={{ left: axisFraction(axis, impact.t_s) * width, top: BAND_TOP_PX + BAND_H_PX / 2, width: DIAMOND_PX, height: DIAMOND_PX, background: MARKER_COLOR.TGT, border: `1px solid ${DIAMOND_EDGE}` }}
            />
          ) : (
            <Handle
              info={info}
              axis={axis}
              width={width}
              axisBox={axisBox}
              pinned={impact.pinned}
              title={impact.pinned ? `${pinnedTitle([impact])}. ${handleWords}` : handleWords}
              onDelay={onDelay}
              onDrag={(on) => {
                setHeld(on);
                onDrag(on);
              }}
              onKeyboardFocus={setKeyboardFocus}
            />
          ))}

          {scene && <NowLine scene={scene} axis={axis} />}
        </div>
      </div>

      <Readout info={info} title={readoutTitle} strike={strike} onDelay={onDelay} onBoxFocus={setBoxFocus} />
    </div>
  );
}

export function JetLanes({ scene, axis, lanes, watched, onWatch, onDelay, onDrag, stripesWords }: JetLanesProps) {
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

  const strike = lanes.length >= 2;
  const readoutTitle = strike ? READOUT_TITLE : undefined;
  return (
    <div ref={rootRef} role="group" aria-label="Jets: pick the one to watch" className={LANES}>
      {lanes.map((l) => (
        <Lane key={l.seat} info={l} scene={scene} axis={axis} width={width} watched={l.seat === watched} onWatch={onWatch} readoutTitle={readoutTitle} strike={strike} onDelay={onDelay} onDrag={onDrag} stripesWords={stripesWords} />
      ))}
    </div>
  );
}
