import type { ReactNode } from 'react';
import { cx } from '../ui/cx';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { FileMenu, type FileMenuItem } from './FileMenu';

export interface AppBarProps {
  /** Where you are, after the divider: a BackLink and a HeaderWhere (the planner), or a file message. */
  lead?: ReactNode;
  /** The screen's one main action, the only filled button: an <AppBarPrimary> (Save in the planner). */
  primary?: ReactNode;
  /** This screen's File menu rows (each screen has its own list). */
  fileItems: FileMenuItem[];
  onSettings: () => void;
  /** The desktop app's Quit. Left out (the browser), there is no Quit button. */
  onQuit?: () => void;
}

/**
 * The one app header: a 48 px bar, edge to edge, the same on every screen. Left: the app's
 * mark and name (the name goes under 1100 px), then where you are (`lead`). Right: the
 * screen's one main action (`primary`), then File, Settings and Quit as quiet buttons whose
 * words go under 1280 px.
 *
 * It sits above the map's floating controls (z 1100 > the planner's 1000), so the File menu
 * hangs over the map; and under every dialog and the playback (z 2000).
 */
export function AppBar({ lead, primary, fileItems, onSettings, onQuit }: AppBarProps) {
  return (
    <header className="relative z-[1100] flex h-bar min-w-0 shrink-0 items-center justify-between gap-4 border-b border-line-strong bg-surface-float pl-4 pr-2 text-ink">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <BrandMark />
          <span className="whitespace-nowrap text-ui-body font-bold max-[1099px]:hidden">Phoenix Weaponeer</span>
        </div>
        {lead ? (
          <>
            <span aria-hidden="true" className="h-6 w-px shrink-0 bg-line-strong" />
            {lead}
          </>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {primary}
        <FileMenu items={fileItems} />
        <Button variant="quiet" size="bar" icon="settings" aria-label="Settings" title="Settings" onClick={onSettings}>
          <span className="max-[1279px]:sr-only">Settings</span>
        </Button>
        {onQuit ? (
          <Button variant="quiet" size="bar" icon="quit" aria-label="Quit" title="Quit Phoenix Weaponeer" onClick={onQuit}>
            <span className="max-[1279px]:sr-only">Quit</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

/** The header's one filled button. Its word goes under 520 px; its name and tooltip stay. */
export function AppBarPrimary({ icon, label, title, onClick, disabled }: { icon: IconName; label: string; title?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="primary" size="bar" icon={icon} className="mr-2" onClick={onClick} disabled={disabled} aria-label={label} title={title ?? label}>
      <span className="max-[519px]:sr-only">{label}</span>
    </Button>
  );
}

/** A plain stand-in for the app's icon, which is separate work. Not a logo. */
function BrandMark() {
  return (
    <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-ui-sm border border-line-strong bg-tint-2 text-ink">
      <svg viewBox="0 0 24 24" className="size-[17px] fill-current">
        <path d="M12 3.5 18.5 19.5 12 15.8 5.5 19.5Z" />
      </svg>
    </span>
  );
}

/** A back link at the start of `lead` (the way back to the screen before). The word goes under 900 px. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex min-h-bar-btn shrink-0 items-center gap-0.5 whitespace-nowrap rounded-ui-sm pl-1 pr-2.5 text-ui-small font-semibold text-info transition-colors duration-fast ease-ui motion-reduce:transition-none hover:bg-info-soft"
    >
      <Icon name="chev-left" size="sm" />
      <span className="max-[899px]:hidden">{label}</span>
    </button>
  );
}

export interface HeaderWhereProps {
  /** The title line: the mission's name in the planner, or a flight's name ("Venom 1"). */
  title: string;
  /** Dimmer words after the title on the same line, with their separator: " · 4 × F-16C Viper". */
  titleAside?: string;
  /** The unsaved dot after the title (its words are in `fullTitle` and in `sub`: never the dot alone). */
  dirty?: boolean;
  /** The title's tooltip, the whole of it: "Copper Anvil (unsaved changes)", "Venom 1 · 4 × F-16C Viper". */
  fullTitle: string;
  /** The smaller, dimmer line under it. */
  sub?: ReactNode;
  /** Its tooltip, the whole line. */
  subTitle?: string;
  /** A file message ("Saved: copper-anvil.json", "Error: ...") shown in place of `sub` until the next action. */
  status?: string | null;
}

/**
 * Where you are: a title line over a smaller line. Both cut with an ellipsis (the whole text
 * is the tooltip) rather than run under the buttons at the right. The title is the screen's
 * h1 and can take focus when the screen opens (tabIndex -1).
 */
export function HeaderWhere({ title, titleAside, dirty = false, fullTitle, sub, subTitle, status }: HeaderWhereProps) {
  const isError = Boolean(status?.startsWith('Error'));
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
      <h1 tabIndex={-1} title={fullTitle} className="m-0 block min-w-0 truncate text-ui-title font-bold leading-where-title tracking-title outline-none">
        {title}
        {titleAside ? <span className="text-ui-body font-medium tracking-normal text-ink-2">{titleAside}</span> : null}
        {dirty ? <span aria-hidden="true" className="ml-2 inline-block size-2 rounded-full bg-accent align-middle" /> : null}
      </h1>
      {status ? (
        <p role="status" title={status} className={cx('m-0 min-w-0 truncate text-ui-caption leading-where-sub', isError ? 'font-semibold text-warn' : 'text-ink-2')}>
          {status}
        </p>
      ) : sub ? (
        <p title={subTitle} className="m-0 min-w-0 truncate text-ui-caption leading-where-sub text-ink-3">
          {sub}
        </p>
      ) : null}
    </div>
  );
}
