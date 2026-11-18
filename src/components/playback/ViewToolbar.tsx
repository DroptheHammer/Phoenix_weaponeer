/**
 * The buttons over the top right of the 3D picture: the four cameras (Orbit,
 * Top-down, Chase #k, From target), the card's Side view, Home view, and the
 * Show menu. They sit on dark plates, because behind them can be the navy
 * sky, the pale haze or the map. The view in use shows pressed.
 *
 * The root covers the whole picture without catching any press of its own
 * (every button and the menu's panel switch presses back on), so the Show
 * panel can be placed against the picture's corner, and the canvas underneath
 * still gets every drag and wheel turn that does not land on a control.
 */
import type { ShowAction, ShowState, ViewMode } from '../../lib/playbackScene';
import type { PlaybackScene } from './scene/createScene';
import { ShowMenu } from './ShowMenu';
import { keepFocus, TOGGLE, TOGGLE_OFF, TOGGLE_ON } from './ui';

interface ViewToolbarProps {
  scene: PlaybackScene;
  show: ShowState;
  dispatch(a: ShowAction): void;
  /** The view in use: a camera, or the card's side view. */
  mode: ViewMode;
  /** The watched jet's seat label, "#3": Chase, From target and the side view follow it. */
  seat: string;
  onMode(mode: ViewMode): void;
}

export function ViewToolbar({ scene, show, dispatch, mode, seat, onMode }: ViewToolbarProps) {
  const views: { mode: ViewMode; label: string; title: string }[] = [
    { mode: 'orbit', label: 'Orbit', title: 'Turn the view round the strike: drag to turn, right-drag to slide, wheel to zoom' },
    { mode: 'top', label: 'Top-down', title: 'Straight down, north up, like the map: drag to slide, wheel to zoom' },
    { mode: 'chase', label: `Chase ${seat}`, title: `Ride behind ${seat}: drag to look around it, wheel to move closer or farther` },
    { mode: 'target', label: 'From target', title: `Look up at ${seat} from its target. Pick Orbit to move the camera` },
    { mode: 'side', label: 'Side view', title: `${seat} on its card's side view` },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="flex justify-end gap-1 pt-2 pr-3">
        {views.map((c) => (
          <button
            key={c.mode}
            type="button"
            onClick={() => onMode(c.mode)}
            onMouseDown={keepFocus}
            aria-pressed={mode === c.mode}
            className={`${TOGGLE} ${mode === c.mode ? TOGGLE_ON : TOGGLE_OFF} pointer-events-auto`}
            title={c.title}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => scene.goHome()}
          onMouseDown={keepFocus}
          className={`${TOGGLE} ${TOGGLE_OFF} pointer-events-auto`}
          title="Back to the attack: from just before the first action to just after the last bomb lands"
        >
          Home view
        </button>
        <ShowMenu show={show} dispatch={dispatch} />
      </div>
    </div>
  );
}
