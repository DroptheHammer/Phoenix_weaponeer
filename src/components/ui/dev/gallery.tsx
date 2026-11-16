/**
 * DEV ONLY: the shared building blocks on one page, for looking at them and for measuring them.
 * Served by the dev server at /ui-gallery.html; no production build includes it (Vite builds
 * index.html only). It is not part of the app: nothing imports it.
 *
 * Every block is shown on three surfaces in turn (the window colour, the navy of a panel, and a
 * floating panel with a group inside it: the material the rail, the legend and the menus sit on),
 * in every variant, size and state it has. Each measurable element carries `data-gallery`, its kind
 * and size joined with a dash (button-md, button-lg, button-compact, button-sm, button-bar,
 * button-text, iconbutton-md, iconbutton-sm), so a script can select every one of a size and read
 * its box. Which variant and state it is sits in `data-variant`, `data-state` and `data-icon`
 * (never in the name), and each surface carries `data-surface`. The tiles of the icon table are
 * named by icon (icon-close) instead, since they all share one size. The panels are named by tone
 * (panel-group, panel-nested, panel-float, panel-well, panel-dialog), the cards by what they are
 * (card-div, card-button, card-a), the chips by size (chip-sm, chip-lg, with the tone in
 * `data-tone`), the dots dot, the group label grouplabel and the tab sets by variant (tabs-rail,
 * tabs-bar, tabs-pills, tabs-segmented). A chip, a dot, a group label and a tab set take no
 * extra attributes themselves, so each sits in a wrapper that carries the name and hugs the
 * block's own box. Open the page at 390 px wide and the phone's touch sizes show with no switch:
 * they are tokens that change under the phone's media query.
 *
 * The page lays itself out with gallery.css and uses no utility classes: Tailwind does not read
 * this folder, so none would exist.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import './gallery.css';
import { Button, type ButtonSize, type ButtonVariant } from '../Button';
import { Card } from '../Card';
import { Chip, Dot, type ChipSize, type ChipTone, type DotKind } from '../Chip';
import { Icon, type IconName, type IconSize } from '../Icon';
import { IconButton, type IconButtonSize } from '../IconButton';
import { GroupLabel, Panel } from '../Panel';
import { Tabs, type TabItem, type TabsVariant } from '../Tabs';

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

const SURFACE_CLASS = {
  window: 'gallery-surface gallery-surface-window',
  navy: 'gallery-surface gallery-surface-navy',
  float: 'gallery-surface gallery-surface-float',
} as const;
const SURFACE_TITLE: Record<keyof typeof SURFACE_CLASS, string> = {
  window: 'On the window',
  navy: 'On a panel',
  float: 'On a floating panel',
};

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

/** Every chip tone with the word it carries in the app; `none` twice, once for each of its two icons. */
const CHIPS: { tone: ChipTone; word: string; icon?: IconName }[] = [
  { tone: 'neutral', word: 'SAM' },
  { tone: 'quiet', word: 'Strike' },
  { tone: 'ok', word: 'Planned' },
  { tone: 'none', word: 'No attack', icon: 'dash-ring' },
  { tone: 'none', word: 'No A-G stores', icon: 'minus' },
  { tone: 'detect', word: 'FragOrders link', icon: 'link' },
  { tone: 'warn', word: 'Not in the weapon table' },
  { tone: 'estimated', word: 'ESTIMATED' },
];
// Written out whole: the class-name check forbids a name put together from a template anywhere in ui/, and a chip name built that way would look like one.
const CHIP_NAME: Record<ChipSize, string> = { sm: 'chip-sm', lg: 'chip-lg' };
const CHIP_SIZES = Object.keys(CHIP_NAME) as ChipSize[];

// Typed as a record, so adding a dot kind without adding it here is a type error.
const DOTS: Record<DotKind, true> = { target: true, ip: true, nav: true, bullseye: true, departure: true, sam: true, aaa: true, manpads: true, shorad: true, ewr: true };

/** What each tab set holds, and which item starts lit. Pressing an item changes it, so the states can be tried. */
const TAB_SETS: { variant: TabsVariant; label: string; selected: string; items: TabItem<string>[]; phone?: boolean }[] = [
  {
    variant: 'rail',
    label: 'Rail',
    selected: 'threats',
    items: [
      { id: 'route', label: 'Route', count: 5, icon: 'route' },
      { id: 'threats', label: 'Threats', count: 2, icon: 'threat' },
      { id: 'attacks', label: 'Attacks', count: 1, icon: 'attack' },
      { id: 'cards', label: 'Cards', icon: 'card' },
    ],
  },
  {
    variant: 'bar',
    label: 'Bar',
    selected: 'route',
    phone: true,
    items: [
      { id: 'route', label: 'Route', count: 5, icon: 'route' },
      { id: 'threats', label: 'Threats', count: 2, icon: 'threat' },
      { id: 'attacks', label: 'Attacks', icon: 'attack' },
      { id: 'cards', label: 'Cards', icon: 'card' },
    ],
  },
  {
    variant: 'pills',
    label: 'Pills',
    selected: 'group',
    items: [
      { id: 'group', label: 'Group', count: 2 },
      { id: 'one', label: '#1 Viper 1-1' },
      { id: 'two', label: '#2 Viper 1-2' },
      { id: 'three', label: '#3 Viper 1-3', disabled: true },
    ],
  },
  {
    variant: 'segmented',
    label: 'Segmented',
    selected: 'day',
    items: [
      { id: 'day', label: 'Day' },
      { id: 'night', label: 'Night' },
      { id: 'nvg', label: 'NVG' },
    ],
  },
];

/** One tab set that keeps its own choice. The rail and the bar close when the lit item is pressed again, as they do in the app. */
function TabsDemo({ variant, label, selected: first, items }: (typeof TAB_SETS)[number]) {
  const [selected, setSelected] = useState<string | null>(first);
  return <Tabs variant={variant} label={label} items={items} selected={selected} onSelect={setSelected} />;
}

function PanelsSection() {
  return (
    <div className="gallery-section">
      <h2 className="gallery-heading">Panels and group labels</h2>
      <div className="gallery-panels">
        <div>
          <div data-gallery="grouplabel" data-note="words">
            <GroupLabel note="2 of 4">Plain note</GroupLabel>
          </div>
          <div data-gallery="grouplabel" data-note="icon">
            <GroupLabel
              note={
                <>
                  <Icon name="check" size="xs" />
                  All set
                </>
              }
            >
              Note with an icon
            </GroupLabel>
          </div>
          <div data-gallery="grouplabel" data-note="none">
            <GroupLabel>No note</GroupLabel>
          </div>
        </div>
        <Panel data-gallery="panel-group">
          <div className="gallery-pad">group, row one</div>
          <div className="gallery-pad">group, row two</div>
          <div className="gallery-pad">group, row three</div>
        </Panel>
        <Panel tone="float" data-gallery="panel-float">
          <div className="gallery-pad">float: what sits over the map</div>
          <Panel nested data-gallery="panel-nested" className="gallery-inset">
            <div className="gallery-pad">a group inside it</div>
            <div className="gallery-pad">a second row</div>
          </Panel>
        </Panel>
        <Panel tone="well" data-gallery="panel-well">
          <div className="gallery-pad">well: a recessed field area</div>
        </Panel>
        <Panel tone="dialog" data-gallery="panel-dialog">
          <div className="gallery-pad">dialog: the surface a dialog sits on</div>
        </Panel>
      </div>
    </div>
  );
}

function CardsSection() {
  const body = (
    <div className="gallery-pad">
      <div className="gallery-card-title">Training mission</div>
      <div className="gallery-card-meta">2 flights, 9 waypoints</div>
    </div>
  );
  return (
    <div className="gallery-section">
      <h2 className="gallery-heading">Cards: plain, a button, a link</h2>
      <div className="gallery-panels">
        <Card data-gallery="card-div">{body}</Card>
        <Card as="button" data-gallery="card-button">{body}</Card>
        <Card as="a" href="#" data-gallery="card-a">{body}</Card>
      </div>
    </div>
  );
}

function ChipsSection() {
  return (
    <div className="gallery-section">
      <h2 className="gallery-heading">Chips: each tone in the 22 px and the 28 px size</h2>
      {CHIPS.map(({ tone, word, icon }) => (
        <div className="gallery-row" key={`${tone}-${word}`}>
          <div className="gallery-row-name">{icon ? `${tone} / ${icon}` : tone}</div>
          <div className="gallery-cells">
            {CHIP_SIZES.map((size) => (
              <span className="gallery-fit" data-gallery={CHIP_NAME[size]} data-tone={tone} key={size}>
                <Chip tone={tone} size={size} icon={icon}>{word}</Chip>
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="gallery-row">
        <div className="gallery-row-name">dots</div>
        <div className="gallery-cells">
          {(Object.keys(DOTS) as DotKind[]).map((kind) => (
            <span className="gallery-dot" key={kind}>
              <span className="gallery-fit" data-gallery="dot" data-kind={kind}>
                <Dot kind={kind} />
              </span>
              {kind}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabsSection() {
  return (
    <div className="gallery-section">
      <h2 className="gallery-heading">Tabs: press an item to light it (the rail and the bar let go when pressed again)</h2>
      {TAB_SETS.map((set) => (
        <div className="gallery-row" key={set.variant}>
          <div className="gallery-row-name">{set.variant}</div>
          <div className={set.phone ? 'gallery-phone-frame' : 'gallery-fit'} data-gallery={`tabs-${set.variant}`}>
            <TabsDemo {...set} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Every block in every variant, size and state: the same list goes on each surface. */
function Blocks() {
  return (
    <>
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

      <PanelsSection />
      <CardsSection />
      <ChipsSection />
      <TabsSection />

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
    </>
  );
}

/**
 * One surface: the blocks straight on the window colour or on a navy panel, and on the float
 * surface inside a floating panel with a group in it, the way the rail, the legend and the menus
 * hold theirs.
 */
function Surface({ tone }: { tone: keyof typeof SURFACE_CLASS }) {
  return (
    <section className={SURFACE_CLASS[tone]} data-surface={tone} aria-label={`Building blocks on the ${tone} surface`}>
      <h1 className="gallery-title">{SURFACE_TITLE[tone]}</h1>
      <p className="gallery-note">
        In a button row, left to right: as it is, cannot be pressed, working, with a leading icon, with a trailing icon. The text button has one size, so it has one row.
      </p>
      {tone === 'float' ? (
        <Panel tone="float">
          <Panel nested divided={false} className="gallery-float-group">
            <Blocks />
          </Panel>
        </Panel>
      ) : (
        <Blocks />
      )}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Surface tone="window" />
    <Surface tone="navy" />
    <Surface tone="float" />
  </StrictMode>,
);
