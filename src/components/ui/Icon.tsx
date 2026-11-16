import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * The app's icon set: stroke icons on a 24 x 24 grid, drawn for it. The brand mark (the app's
 * own icon) is not part of it.
 */
export type IconName =
  | 'settings' | 'quit' | 'link' | 'file' | 'drop' | 'folder' | 'plus' | 'minus' | 'close'
  | 'chev-left' | 'chev-right' | 'chev-down' | 'play' | 'check' | 'eye-off' | 'warn' | 'info' | 'est'
  | 'route' | 'threat' | 'flight' | 'attack' | 'card' | 'save' | 'map' | 'pin'
  | 'more' | 'layers' | 'reframe' | 'share' | 'trash'
  | 'arrow-right' | 'dash-ring' | 'search';

/** xs is the 14 px icon inside a tag or a status tag. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'rail';

// Full class names, so Tailwind can see them: 14, 16, 20, 24 and the rail's 22 px.
const SIZE: Record<IconSize, string> = { xs: 'size-3.5', sm: 'size-4', md: 'size-5', lg: 'size-6', rail: 'size-[22px]' };

const SHAPES: Record<IconName, ReactNode> = {
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h10M18 17h2" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
  quit: <path d="M12 3.5v8M7.1 6.6a7.5 7.5 0 1 0 9.8 0" />,
  link: <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.2 1.2M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1.2-1.2" />,
  file: <path d="M13.5 3.5h-6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-10zM13.5 3.5v5h5" />,
  drop: <path d="M12 4v10.5M8 10.5l4 4 4-4M4.5 16.5v2A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-2" />,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  'chev-left': <path d="M14.5 6l-6 6 6 6" />,
  'chev-right': <path d="M9.5 6l6 6-6 6" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />, // after a text button that goes somewhere ("Open Threats on the map")
  'dash-ring': <circle cx="12" cy="12" r="7.5" strokeDasharray="3.2 3.2" />, // "No attack": a ring not yet closed
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  'chev-down': <path d="M6 9.5l6 6 6-6" />,
  play: <path d="M8.5 5.5 19 12 8.5 18.5Z" />,
  check: <path d="M5.5 12.5l4.2 4.2L18.5 7.5" />,
  'eye-off': <path d="M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c5.5 0 9 6.5 9 6.5a15.6 15.6 0 0 1-2.6 3.4M6.3 7.6A15 15 0 0 0 3 12s3.5 6.5 9 6.5a9 9 0 0 0 4-1M10 10.2a2.8 2.8 0 0 0 3.9 3.9" />,
  warn: <path d="M12 4.5 20.5 19.5h-17zM12 10v4.5M12 17.1v.1" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.7v.1" />
    </>
  ),
  est: <path d="M3.5 12c2.2-4.5 4.5-4.5 8.5 0s6.3 4.5 8.5 0" />, // a tilde: "about", for ESTIMATED
  route: (
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h6.5a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6H16" />
    </>
  ),
  threat: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 11.95v.1" />
    </>
  ),
  flight: <path d="M12 3v18M12 8.5l-7.5 6V16l7.5-2.5 7.5 2.5v-1.5zM9 20.5l3-1.5 3 1.5" />,
  attack: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M12 11.95v.1" />
    </>
  ),
  card: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
      <path d="M9.5 3h5v3h-5zM8.5 11h7M8.5 14.5h7M8.5 18h4" />
    </>
  ),
  save: <path d="M5.5 4.5H16L18.5 7v12.5h-13zM8.5 4.5V9h6V4.5M8.5 19.5v-6h7v6" />,
  map: <path d="M9 5 3.5 7v12.5L9 17.5l6 2 5.5-2V5L15 7zM9 5v12.5M15 7v12.5" />,
  pin: (
    <>
      <path d="M12 20.5s-6-5.4-6-10.2a6 6 0 0 1 12 0c0 4.8-6 10.2-6 10.2z" />
      <circle cx="12" cy="10.2" r="2.2" />
    </>
  ),
  // Three solid dots: the only icon with filled shapes (the dots opt out of the stroke).
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  layers: <path d="M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" />,
  reframe: <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4" />,
  share: <path d="M12 15V4.5M8 8l4-4 4 4M7 11H6.5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 17.5 11H17" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5.5M14 11v5.5" />,
};

export interface IconProps {
  name: IconName;
  size?: IconSize;
  /** Layout only (margin, position). Inside ui/ a primitive may also give the icon its own token colour (Chip's sky check). */
  className?: string;
  /** Leave out for a decorative icon (hidden from screen readers); give it only when the icon stands alone. */
  title?: string;
}

export function Icon({ name, size = 'md', className, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('shrink-0', SIZE[size], className)}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {SHAPES[name]}
    </svg>
  );
}
