/**
 * The buttons over the top right of the 3D picture: Home view, and the Show
 * menu. (The camera choices join them as they are built.) They sit on dark
 * plates, because behind them can be the navy sky, the pale haze or the map.
 *
 * The root covers the whole picture without catching any press of its own
 * (every button and the menu's panel switch presses back on), so the Show
 * panel can be placed against the picture's corner, and the canvas underneath
 * still gets every drag and wheel turn that does not land on a control.
 */
import type { ShowAction, ShowState } from '../../lib/playbackScene';
import type { PlaybackScene } from './scene/createScene';
import { ShowMenu } from './ShowMenu';
import { keepFocus, TOGGLE, TOGGLE_OFF } from './ui';

interface ViewToolbarProps {
  scene: PlaybackScene;
  show: ShowState;
  dispatch(a: ShowAction): void;
}

export function ViewToolbar({ scene, show, dispatch }: ViewToolbarProps) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="flex justify-end gap-1 pt-2 pr-3">
        <button
          type="button"
          onClick={() => scene.goHome()}
          onMouseDown={keepFocus}
          className={`${TOGGLE} ${TOGGLE_OFF} pointer-events-auto`}
          title="Back to the view of the whole attack"
        >
          Home view
        </button>
        <ShowMenu show={show} dispatch={dispatch} />
      </div>
    </div>
  );
}
