import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedBasemapTiles, loadBasemapTiles, type TileKey } from '../../lib/kneeboardBasemap';
import {
  renderKneeboardCard,
  renderKneeboardCardWithMap,
  mapStatusOf,
  type MapStatus,
} from '../../lib/renderKneeboardCanvas';
import type { KneeboardCard } from '../../types/kneeboard.types';

/** One attack's card, ready to draw. */
export interface CardEntry {
  attackId: string;
  label: string;
  card: KneeboardCard;
  /** Unique within the mission (`claimFilename`), for sharing and downloads. */
  filename: string;
}

/** A drawn card: a PNG and an object URL the page can show it by. */
export interface CardImage {
  url: string;
  blob: Blob;
  status: MapStatus;
  /** Drawn from `entries` as they are now, with every map tile it will get. */
  final: boolean;
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The card could not be encoded'))), 'image/png'),
  );
}

/** Let the page paint (and take a swipe) between cards. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** 0..n-1, nearest to `from` first: the card on screen, then its neighbours. */
function nearestFirst(from: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - from) - Math.abs(b - from) || a - b);
}

/**
 * Every card of the mission as a PNG, for the phone's carousel, viewers and
 * share sheet.
 *
 * Cards are drawn one at a time, with a frame between, starting from the one
 * on screen, so ten cards never freeze a swipe. Each is drawn first with
 * whatever map tiles are cached, then once more when the rest arrive: the
 * carousel fills in quickly even on a slow connection.
 */
export function useCardImages(entries: CardEntry[], map: boolean, current: number) {
  const images = useRef(new Map<string, CardImage>());
  const [, setVersion] = useState(0);
  const [mapLoading, setMapLoading] = useState(false);
  // Read when a new pass starts, so a swipe doesn't restart the drawing.
  const currentRef = useRef(current);
  currentRef.current = current;

  const publish = useCallback((attackId: string, image: CardImage) => {
    const old = images.current.get(attackId);
    images.current.set(attackId, image);
    // An <img> that has loaded keeps its picture; the old URL only holds memory.
    if (old) URL.revokeObjectURL(old.url);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Everything drawn from the previous entries is out of date now; it stays
    // on screen until its replacement is ready, but is never shared.
    const live = new Set(entries.map((e) => e.attackId));
    for (const [id, image] of images.current) {
      if (!live.has(id)) {
        URL.revokeObjectURL(image.url);
        images.current.delete(id);
      } else {
        images.current.set(id, { ...image, final: false });
      }
    }

    const canvas = document.createElement('canvas');
    (async () => {
      const waiting: { entry: CardEntry; tiles: TileKey[] }[] = [];
      for (const i of nearestFirst(currentRef.current, entries.length)) {
        await nextFrame();
        if (cancelled) return;
        const entry = entries[i];
        const report = renderKneeboardCard(canvas, entry.card, map ? cachedBasemapTiles : undefined);
        const blob = await toPngBlob(canvas);
        if (cancelled) return;
        const pending = map && report !== undefined && report.pending > 0;
        publish(entry.attackId, { url: URL.createObjectURL(blob), blob, status: mapStatusOf(report, map), final: !pending });
        if (pending) waiting.push({ entry, tiles: report.tiles });
      }
      if (!waiting.length) return;

      // All the missing tiles at once: neighbouring cards share most of theirs,
      // and offline every card would otherwise wait out its own timeout.
      setMapLoading(true);
      await loadBasemapTiles(waiting.flatMap((w) => w.tiles));
      for (const { entry } of waiting) {
        await nextFrame();
        if (cancelled) return;
        const report = renderKneeboardCard(canvas, entry.card, cachedBasemapTiles);
        const blob = await toPngBlob(canvas);
        if (cancelled) return;
        publish(entry.attackId, { url: URL.createObjectURL(blob), blob, status: mapStatusOf(report, true), final: true });
      }
      setMapLoading(false);
    })().catch(() => {
      // A card that can't be drawn stays a placeholder; sharing draws it afresh
      // and reports the error there.
      if (!cancelled) setMapLoading(false);
    });

    return () => {
      cancelled = true;
      setMapLoading(false);
    };
  }, [entries, map, publish]);

  // Free every image when the Cards panel closes.
  useEffect(() => {
    const held = images.current;
    return () => {
      for (const image of held.values()) URL.revokeObjectURL(image.url);
      held.clear();
    };
  }, []);

  /**
   * The finished PNG for sharing: the one already drawn if it is final,
   * otherwise drawn now, waiting for its map tiles as desktop export does.
   */
  const finalImage = useCallback(
    async (entry: CardEntry): Promise<{ blob: Blob; status: MapStatus }> => {
      const ready = images.current.get(entry.attackId);
      if (ready?.final) return ready;
      const canvas = document.createElement('canvas');
      const status = await renderKneeboardCardWithMap(canvas, entry.card, { map });
      return { blob: await toPngBlob(canvas), status };
    },
    [map],
  );

  return {
    imageOf: (attackId: string): CardImage | undefined => images.current.get(attackId),
    mapLoading,
    finalImage,
  };
}
