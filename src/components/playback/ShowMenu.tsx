/**
 * The Show menu over the 3D picture: one button that opens one panel of
 * choices about what the picture shows. For now one choice, where the time bar
 * starts; the others join as they are built. The choices are the pure
 * ShowState (src/lib/playbackScene/show.ts); nothing here is saved.
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
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { RUN_LEAD_S, type ShowAction, type ShowState } from '../../lib/playbackScene';
import { keepFocus, MENU_HEAD, MENU_HINT, MENU_PANEL, TOGGLE, TOGGLE_OFF, TOGGLE_ON } from './ui';

interface ShowMenuProps {
  show: ShowState;
  dispatch(a: ShowAction): void;
}

export function ShowMenu({ show, dispatch }: ShowMenuProps) {
  const [open, setOpen] = useState(false);
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
          setOpen((o) => !o);
        }}
        onMouseDown={keepFocus}
        aria-expanded={open}
        aria-controls="pb-show"
        className={`${TOGGLE} ${open ? TOGGLE_ON : TOGGLE_OFF} pointer-events-auto`}
        title="What the 3D view shows: labels, action points, attack colours, where the time bar starts, threats"
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
              checked={show.wholeRunIn}
              onChange={(e) => dispatch({ type: 'wholeRunIn', on: e.currentTarget.checked })}
            />
            <span>
              <span className={`block ${MENU_HEAD}`}>Whole run-in</span>
              <span className={`block ${MENU_HINT}`}>Start the time bar before the IP. Off: {RUN_LEAD_S} s before the first action.</span>
            </span>
          </label>
        </div>
      )}
    </>
  );
}
