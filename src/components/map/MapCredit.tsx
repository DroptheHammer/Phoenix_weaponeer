import { cx } from '../ui/cx';

/**
 * The map tiles' credit. OpenStreetMap's licence asks for it wherever its tiles show, so
 * it is drawn by the app in both layouts now that Leaflet's own attribution is switched off.
 * Plain text (Leaflet's carried two links and its own name; the desktop app links nowhere out).
 */
export const MAP_CREDIT = '© OpenStreetMap contributors';

/**
 * The `bottom` of the phone's Layers column: where it stops, so its panel never runs under the
 * chip (held sideways the panel is tall enough to reach it). It is worked out from the chip's own
 * measures: on the phone the chip stands 0.5rem up from the map's bottom edge (MapView) and is one
 * 1rem line tall with 0.125rem of padding above and below and a 1 px border each side, and the
 * column stops 0.5rem above that. Kept beside the chip's classes so a change to the chip is made
 * here too.
 */
export const ABOVE_CREDIT = 'bottom-[calc(2.25rem+2px)]';

export function MapCredit({ className }: { className?: string }) {
  return (
    <p className={cx('m-0 rounded-ui-md border border-line-strong bg-surface-float px-2.5 py-0.5 text-right font-sans text-ui-caption leading-4 text-ink-2', className)}>
      {MAP_CREDIT}
    </p>
  );
}
