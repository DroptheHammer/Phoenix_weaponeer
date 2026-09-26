import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Put inside every `MapContainer`. A Leaflet zoom animation ends on a 250 ms
 * timer that `map.remove()` does not cancel; if the map unmounts inside that
 * window (closing a mission right after it opened and the map started
 * framing it), the timer moves a map whose panes are gone and throws
 * "Cannot read properties of undefined (reading '_leaflet_pos')". The timer
 * does nothing when no zoom is animating, so say none is.
 */
export function ZoomTimerGuard() {
  const map = useMap();
  useEffect(
    () => () => {
      (map as unknown as { _animatingZoom?: boolean })._animatingZoom = false;
    },
    [map],
  );
  return null;
}
