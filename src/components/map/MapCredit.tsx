import { cx } from '../ui/cx';

/**
 * The map tiles' credit. OpenStreetMap's licence asks for it wherever its tiles show, so
 * it is drawn by the app in both layouts now that Leaflet's own attribution is switched off.
 * Plain text (Leaflet's carried two links and its own name; the desktop app links nowhere out).
 */
export const MAP_CREDIT = '© OpenStreetMap contributors';

export function MapCredit({ className }: { className?: string }) {
  return (
    <p className={cx('m-0 rounded-ui-md border border-line-strong bg-surface-float px-2.5 py-0.5 text-right font-sans text-ui-caption leading-4 text-ink-2', className)}>
      {MAP_CREDIT}
    </p>
  );
}
