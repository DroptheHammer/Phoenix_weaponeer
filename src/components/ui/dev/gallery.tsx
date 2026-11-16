/**
 * DEV ONLY: the shared building blocks on one page, for looking at them and for measuring them.
 * Served by the dev server at /ui-gallery.html; no production build includes it (Vite builds
 * index.html only). It is not part of the app: nothing imports it.
 *
 * Every block is shown on two surfaces in turn (the window colour and the navy of a panel), in
 * every variant, size and state it has. Each measurable element carries `data-gallery`, its kind
 * and size joined with a dash (button-md, button-lg, button-compact, button-sm, button-bar,
 * button-text, iconbutton-md, iconbutton-sm), so a script can select every one of a size and read
 * its box. Which variant and state it is sits in `data-variant`, `data-state` and `data-icon`
 * (never in the name), and each surface carries `data-surface`. The tiles of the icon table are
 * named by icon (icon-close) instead, since they all share one size. Open the page at 390 px wide and
 * the phone's touch sizes show with no switch: they are tokens that change under the phone's
 * media query.
 *
 * The page lays itself out with gallery.css and uses no utility classes: Tailwind does not read
 * this folder, so none would exist.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import './gallery.css';
import { Button, type ButtonSize, type ButtonVariant } from '../Button';
import { Icon, type IconName, type IconSize } from '../Icon';
import { IconButton, type IconButtonSize } from '../IconButton';

/** The name a script measures a button by: its size, or `text` for the text button, which has one size of its own. */
const buttonName = (variant: ButtonVariant, size: ButtonSize) => (variant === 'text' ? 'button-text' : `button-${size}`);

const VARIANTS: { variant: ButtonVariant; sample: string; icon: IconName }[] = [
  { variant: 'primary', sample: 'Import', icon: 'plus' },
  { variant: 'tonal', sample: 'Choose file', icon: 'file' },
  { variant: 'emphasis', sample: 'Add threat', icon: 'plus' },
  { variant: 'quiet', sample: 'Settings', icon: 'settings' },
  { variant: 'outline', sample: 'Delete', icon: 'trash' },
  { variant: 'text', sample: 'Edit', icon: 'plus' },
];
const SIZES: ButtonSize[] = ['md', 'lg', 'compact', 'sm', 'bar'];

// Typed as a record, so adding an icon to the set without adding it here is a type error.
const ICONS: Record<IconName, true> = {
  settings: true, quit: true, link: true, file: true, drop: true, folder: true, plus: true, minus: true, close: true,
  'chev-left': true, 'chev-right': true, 'chev-down': true, play: true, check: true, 'eye-off': true, warn: true, info: true, est: true,
  route: true, threat: true, flight: true, attack: true, card: true, save: true, map: true, pin: true,
  more: true, layers: true, reframe: true, share: true, trash: true,
  'arrow-right': true, 'dash-ring': true, search: true,
};
const ICON_SIZES: IconSize[] = ['xs', 'sm', 'md', 'lg', 'rail'];
const ICON_BUTTON_SIZES: IconButtonSize[] = ['md', 'sm'];

const SURFACE_CLASS = { window: 'gallery-surface gallery-surface-window', navy: 'gallery-surface gallery-surface-navy' } as const;

/** One button in each state it has: as it is, cannot be pressed, working, a leading icon, a trailing icon. */
function ButtonStates({ variant, size, sample, icon }: { variant: ButtonVariant; size: ButtonSize; sample: string; icon: IconName }) {
  // The name is the size alone, so one selector reaches every button of a size; the rest says which one it is.
  const mark = (state: 'default' | 'disabled' | 'busy', place: 'none' | 'start' | 'end') => ({
    'data-gallery': buttonName(variant, size),
    'data-variant': variant,
    'data-state': state,
    'data-icon': place,
  });
  return (
    <div className="gallery-cells">
      <Button {...mark('default', 'none')} variant={variant} size={size}>{sample}</Button>
      <Button {...mark('disabled', 'none')} variant={variant} size={size} disabled>{sample}</Button>
      <Button {...mark('busy', 'none')} variant={variant} size={size} busy>Fetching...</Button>
      <Button {...mark('default', 'start')} variant={variant} size={size} icon={icon}>{sample}</Button>
      <Button {...mark('default', 'end')} variant={variant} size={size} iconEnd="arrow-right">{sample}</Button>
    </div>
  );
}

function Surface({ tone }: { tone: keyof typeof SURFACE_CLASS }) {
  return (
    <section className={SURFACE_CLASS[tone]} data-surface={tone} aria-label={`Building blocks on the ${tone} surface`}>
      <h1 className="gallery-title">{tone === 'window' ? 'On the window' : 'On a panel'}</h1>
      <p className="gallery-note">
        Left to right: as it is, cannot be pressed, working, with a leading icon, with a trailing icon. The text button has one size, so it has one row.
      </p>

      <div className="gallery-section">
        <h2 className="gallery-heading">Buttons</h2>
        {VARIANTS.flatMap(({ variant, sample, icon }) =>
          (variant === 'text' ? (['md'] as ButtonSize[]) : SIZES).map((size) => (
            <div className="gallery-row" key={`${variant}-${size}`}>
              <div className="gallery-row-name">{variant === 'text' ? 'text (one size)' : `${variant} / ${size}`}</div>
              <ButtonStates variant={variant} size={size} sample={sample} icon={icon} />
            </div>
          )),
        )}
      </div>

      <div className="gallery-section">
        <h2 className="gallery-heading">The main button that cannot be pressed yet</h2>
        <div className="gallery-cells">
          <Button data-gallery="button-md" data-variant="primary" data-state="default" data-sample="import" variant="primary">Import</Button>
          <Button data-gallery="button-md" data-variant="primary" data-state="disabled" data-sample="import" variant="primary" disabled>Import</Button>
        </div>
      </div>

      <div className="gallery-section">
        <h2 className="gallery-heading">Icon buttons</h2>
        {ICON_BUTTON_SIZES.map((size) => (
          <div className="gallery-row" key={size}>
            <div className="gallery-row-name">{size}</div>
            <div className="gallery-cells">
              <IconButton data-gallery={`iconbutton-${size}`} data-state="default" data-icon="close" icon="close" label="Close" size={size} />
              <IconButton data-gallery={`iconbutton-${size}`} data-state="disabled" data-icon="close" icon="close" label="Close" size={size} disabled />
              <IconButton data-gallery={`iconbutton-${size}`} data-state="pressed" data-icon="layers" icon="layers" label="Layers" size={size} pressed />
              <IconButton data-gallery={`iconbutton-${size}`} data-state="default" data-icon="more" icon="more" label="More" size={size} />
            </div>
          </div>
        ))}
      </div>

      <div className="gallery-section">
        <h2 className="gallery-heading">Keyboard focus: press Tab to walk these</h2>
        <div className="gallery-cells">
          <Button variant="primary">Primary</Button>
          <Button variant="tonal">Tonal</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="text">Text</Button>
          <IconButton icon="settings" label="Settings" />
        </div>
      </div>

      <div className="gallery-section">
        <h2 className="gallery-heading">Icon sizes</h2>
        <div className="gallery-icon-sizes">
          {ICON_SIZES.map((size) => (
            <div className="gallery-icon-size" key={size}>
              <Icon name="arrow-right" size={size} />
              {size}
            </div>
          ))}
        </div>
      </div>

      <div className="gallery-section">
        <h2 className="gallery-heading">Icons ({Object.keys(ICONS).length})</h2>
        <div className="gallery-icons">
          {(Object.keys(ICONS) as IconName[]).map((name) => (
            <div className="gallery-icon" key={name} data-gallery={`icon-${name}`}>
              <Icon name={name} size="lg" />
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Surface tone="window" />
    <Surface tone="navy" />
  </StrictMode>,
);
