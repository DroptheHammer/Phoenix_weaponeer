import { useEffect, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';

const BUTTON =
  'grid size-tap place-items-center text-ink outline-offset-[-3px] transition-colors duration-fast ease-ui motion-reduce:transition-none enabled:hover:bg-tint-2 enabled:active:bg-tint-2 disabled:cursor-not-allowed disabled:text-ink-3';

/**
 * The map's zoom: two 44 px buttons in one floating box, in place of Leaflet's own control
 * (30 px, white, and on the desktop hidden under the legend). It drives the same map, so the
 * keyboard's + and - on the map and the mouse wheel still work as before. A button is greyed
 * at the end of its range, as Leaflet's was.
 */
export function MapZoom({ map, className }: { map: LeafletMap | null; className?: string }) {
  const [ends, setEnds] = useState({ atMin: false, atMax: false });

  useEffect(() => {
    if (!map) return;
    const update = () => setEnds({ atMin: map.getZoom() <= map.getMinZoom(), atMax: map.getZoom() >= map.getMaxZoom() });
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);

  return (
    <div role="group" aria-label="Map zoom" className={cx('grid overflow-hidden rounded-ui-md border border-line-strong bg-surface-float shadow-ui-2', className)}>
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={!map || ends.atMax} onClick={() => map?.zoomIn()} className={BUTTON}>
        <Icon name="plus" />
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={!map || ends.atMin} onClick={() => map?.zoomOut()} className={cx(BUTTON, 'border-t border-line-strong')}>
        <Icon name="minus" />
      </button>
    </div>
  );
}
