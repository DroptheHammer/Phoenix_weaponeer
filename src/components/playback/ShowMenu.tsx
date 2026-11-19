/**
 * The Show menu over the 3D picture: one button that opens one panel of
 * choices about what the picture shows: altitude and speed on the jets'
 * labels, the action points (off, as each jet nears them, or always), the
 * planner's colour code on the watched jet or on every jet, the ring round each
 * falling bomb and the flash where it lands, whether Chase watches the bomb land, where the time bar starts, and
 * the threats: one switch per threat system, grouped by kind (SAM, SHORAD, AAA, MANPADS, Early warning, Other),
 * with All and None, the weapons on and the early-warning radars off as it opens. The list holds only the systems
 * the planner may see: a threat the mission's author hid is not in playback's data, so it is neither named nor
 * counted and a plan whose threats are all hidden reads exactly as a plan with none; unless the planner's Settings
 * switch reveals it, when it counts as any other. The choices
 * are the pure ShowState (src/lib/playbackScene/show.ts); nothing here is saved.
 *
 * Behaviour:
 * - The panel stays open while choices are made. A press anywhere outside it
 *   closes it, and so does Escape: the overlay's Escape handler asks the open
 *   panel (a "pb-esc" event on the element marked data-esc-close) to close
 *   instead of closing playback, so a second Escape is what closes playback.
 * - A mouse press leaves the keyboard focus where it was, so Space still plays
 *   and pauses afterwards. Opened from the keyboard (Enter or Space on the
 *   button), focus moves to the first choice, and Escape brings it back to the
 *   button.
 * - No aria-haspopup: the panel is an ordinary group of controls, not a menu
 *   or a listbox, and announcing it as one would promise arrow-key behaviour
 *   it does not have.
 *
 * It renders the button and the panel side by side (a fragment) because the
 * panel is positioned against the picture, not against the toolbar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { RUN_LEAD_S, isThreatOn, threatMenuOf, type ActionPointsMode, type AttackColours, type SceneSystemRow, type ShowAction, type ShowState } from '../../lib/playbackScene';
import { keepFocus, MENU_HEAD, MENU_HINT, MENU_PANEL, MENU_SUBHEAD, SEG_SMALL, TOGGLE, TOGGLE_OFF, TOGGLE_ON } from './ui';

interface ShowMenuProps {
  show: ShowState;
  dispatch(a: ShowAction): void;
  /**
   * The threat systems the planner may see, one row each, in menu order (sceneDomes): nothing of a threat the
   * mission's author hid is among them, so the list neither names nor counts one, unless the planner's Settings switch
   * reveals it, when it counts as any other.
   */
  rows: readonly SceneSystemRow[];
  /** Playback was handed threat data at all (a plan with no threats still was). */
  threatData: boolean;
}

/** The three ways the action points show, in the menu's order, with the line that says what each does. */
const ACTION_POINTS: readonly { value: ActionPointsMode; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'No markers or words along the runs.' },
  { value: 'coming', label: 'As they come', hint: "Markers along each run; the planner's words show as each jet nears a point." },
  { value: 'always', label: 'Always', hint: "Markers and the planner's words all the time." },
];

/** Which jets wear the planner's colour code, in the menu's order, with the line that says what each does. */
const ATTACK_COLOURS: readonly { value: AttackColours; label: string; hint: string }[] = [
  { value: 'watched', label: 'Watched jet', hint: "The planner's colours on the watched jet; the others in their own colour." },
  { value: 'all', label: 'All jets', hint: "The planner's colours on every jet; the arrows keep their own colour." },
];

export function ShowMenu({ show, dispatch, rows, threatData }: ShowMenuProps) {
  const [open, setOpen] = useState(false);
  const threats = useMemo(() => threatMenuOf(rows, threatData), [rows, threatData]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Set by the press that opens the panel: a click made with Enter or Space has detail 0, a mouse click has 1 or more.
  const openedByKeyboard = useRef(false);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    if (openedByKeyboard.current) panel.querySelector<HTMLElement>('input, button')?.focus();

    const onPress = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (panel.contains(target) || buttonRef.current?.contains(target))) return;
      // Focus inside the panel would be left on nothing once the panel goes (and Space would stop
      // playing and pausing): hand it to the button first. A press on something that takes focus
      // itself, the scrubber say, still moves it there afterwards.
      if (panel.contains(document.activeElement)) buttonRef.current?.focus();
      setOpen(false);
    };
    const onEscape = () => {
      const focusInside = panel.contains(document.activeElement);
      // Shut at once, before this Escape returns: a custom event is not one React treats as urgent, so
      // left to itself the panel could still be on screen when the next Escape arrives (a slow frame),
      // and that one would shut the panel again instead of leaving playback.
      flushSync(() => setOpen(false));
      // The panel has gone: put focus back on the button that opened it, not on nothing.
      if (focusInside) buttonRef.current?.focus();
    };
    // Capture phase on the document: before playback's own handlers, which stop the press from reaching React's.
    document.addEventListener('pointerdown', onPress, true);
    panel.addEventListener('pb-esc', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPress, true);
      panel.removeEventListener('pb-esc', onEscape);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          openedByKeyboard.current = e.detail === 0;
          // Shut with the mouse while focus is inside the panel (it was opened from the keyboard): the
          // press leaves focus where it was, so move it here before the panel, and the focus with it, goes.
          if (open && panelRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
          setOpen((o) => !o);
        }}
        onMouseDown={keepFocus}
        aria-expanded={open}
        aria-controls="pb-show"
        className={`${TOGGLE} ${open ? TOGGLE_ON : TOGGLE_OFF} pointer-events-auto`}
        title="What the 3D view shows: labels, action points, attack colours, bombs, where the time bar starts, threats"
      >
        Show ▾
      </button>
      {open && (
        <div
          ref={panelRef}
          id="pb-show"
          role="group"
          aria-label="What the 3D view shows"
          data-esc-close
          className={`${MENU_PANEL} pointer-events-auto`}
        >
          {/* A mouse press keeps the focus where it was (Space still plays); Tab and Space still reach the box. */}
          <label className="flex items-start gap-2 cursor-pointer" onMouseDown={keepFocus}>
            <input
              type="checkbox"
              className="mt-0.5 accent-dcs-accent"
              checked={show.labels}
              onChange={(e) => dispatch({ type: 'labels', on: e.currentTarget.checked })}
            />
            <span>
              <span className={`block ${MENU_HEAD}`}>Labels</span>
              <span className={`block ${MENU_HINT}`}>Altitude and speed beside each jet. Off: seat and callsign only.</span>
            </span>
          </label>
          <div role="group" aria-labelledby="pb-show-ap">
            <span id="pb-show-ap" className={`block ${MENU_HEAD}`}>Action points</span>
            <div className="mt-1 inline-flex rounded border border-gray-600 overflow-hidden">
              {ACTION_POINTS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => dispatch({ type: 'actionPoints', value: c.value })}
                  onMouseDown={keepFocus}
                  aria-pressed={show.actionPoints === c.value}
                  title={c.hint}
                  className={`${SEG_SMALL} ${show.actionPoints === c.value ? 'bg-gray-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <span className={`block mt-1 ${MENU_HINT}`}>{ACTION_POINTS.find((c) => c.value === show.actionPoints)?.hint}</span>
          </div>
          <div role="group" aria-labelledby="pb-show-ac">
            <span id="pb-show-ac" className={`block ${MENU_HEAD}`}>Attack colours</span>
            <div className="mt-1 inline-flex rounded border border-gray-600 overflow-hidden">
              {ATTACK_COLOURS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => dispatch({ type: 'attackColours', value: c.value })}
                  onMouseDown={keepFocus}
                  aria-pressed={show.attackColours === c.value}
                  title={c.hint}
                  className={`${SEG_SMALL} ${show.attackColours === c.value ? 'bg-gray-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <span className={`block mt-1 ${MENU_HINT}`}>{ATTACK_COLOURS.find((c) => c.value === show.attackColours)?.hint}</span>
          </div>
          <label className="flex items-start gap-2 cursor-pointer" onMouseDown={keepFocus}>
            <input
              type="checkbox"
              className="mt-0.5 accent-dcs-accent"
              checked={show.impact}
              onChange={(e) => dispatch({ type: 'impact', on: e.currentTarget.checked })}
            />
            <span>
              <span className={`block ${MENU_HEAD}`}>Impact</span>
              <span className={`block ${MENU_HINT}`}>A ring round each falling bomb, then a flash and, where the weapon table has a blast radius, a ring where it lands at that radius (est.). Not a simulation of the weapon. Off: the bomb alone.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer" onMouseDown={keepFocus}>
            <input
              type="checkbox"
              className="mt-0.5 accent-dcs-accent"
              checked={show.bombCam}
              onChange={(e) => dispatch({ type: 'bombCam', on: e.currentTarget.checked })}
            />
            <span>
              <span className={`block ${MENU_HEAD}`}>Watch the bomb land</span>
              <span className={`block ${MENU_HINT}`}>Chase looks at the bomb from release until it lands, holds on the burst, then swings back to the jet. Off: it stays on the jet.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer" onMouseDown={keepFocus}>
            <input
              type="checkbox"
              className="mt-0.5 accent-dcs-accent"
              checked={show.wholeRunIn}
              onChange={(e) => dispatch({ type: 'wholeRunIn', on: e.currentTarget.checked })}
            />
            <span>
              <span className={`block ${MENU_HEAD}`}>Whole run-in</span>
              <span className={`block ${MENU_HINT}`}>Start the time bar before the IP. Off: {RUN_LEAD_S} s before the first action.</span>
            </span>
          </label>
          <div role="group" aria-labelledby="pb-show-th" data-threats="">
            <div className="flex items-baseline justify-between">
              <span id="pb-show-th" className={MENU_HEAD}>Threats</span>
              {threats.groups.length > 0 && (
                <span className="flex gap-1">
                  <button type="button" onClick={() => dispatch({ type: 'threatsAll' })} onMouseDown={keepFocus} aria-label="Show every threat" className={`${SEG_SMALL} rounded border border-gray-600 text-gray-300 hover:bg-gray-700`}>
                    All
                  </button>
                  <button type="button" onClick={() => dispatch({ type: 'threatsNone' })} onMouseDown={keepFocus} aria-label="Hide every threat" className={`${SEG_SMALL} rounded border border-gray-600 text-gray-300 hover:bg-gray-700`}>
                    None
                  </button>
                </span>
              )}
            </div>
            {threats.empty !== undefined ? (
              <span className={`block mt-1 ${MENU_HINT}`} data-threats-empty="">{threats.empty}</span>
            ) : (
              threats.groups.map((g) => (
                <div key={g.group} className="mt-1" data-threat-group={g.group}>
                  <span className={`block ${MENU_SUBHEAD}`}>{g.heading}</span>
                  {g.rows.map((r) => {
                    const on = isThreatOn(show, r.systemId);
                    return (
                      // A switched-off row is told by its empty box and its dimmer words, not by colour alone.
                      <label key={r.systemId} className="flex items-start gap-2 cursor-pointer" onMouseDown={keepFocus} data-threat-row={r.systemId}>
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-dcs-accent"
                          checked={on}
                          onChange={(e) => dispatch({ type: 'threat', key: r.systemId, on: e.currentTarget.checked })}
                        />
                        <span>
                          <span className={`block ${on ? 'text-gray-100' : 'text-gray-400'}`}>{r.text}</span>
                          {r.note && <span className={`block ${MENU_HINT}`}>{r.note}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
