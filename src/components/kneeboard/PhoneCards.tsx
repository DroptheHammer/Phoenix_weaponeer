import { useCallback, useMemo, useRef, useState } from 'react';
import { platform } from '@platform';
import { useVisibleMission } from '../../hooks/useVisibleMission';
import { useUiStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { buildKneeboardCard, kneeboardFilename, type ThreatSystemInfo } from '../../lib/buildKneeboardCard';
import { claimFilename } from '../../lib/kneeboardExportPlan';
import type { MapStatus } from '../../lib/renderKneeboardCanvas';
import type { ShareResult } from '../../lib/platform/types';
import type { DbWeapon, FuzeOption } from '../../types';
import { isRealWorld, REAL_WORLD_SHARE_WARNING } from '../../lib/strikeNearMe';
import { attackCardLabel, exportMapNote, previewMapNote } from './cardText';
import { useCardImages, type CardEntry } from './useCardImages';
import { CardZoom } from './CardZoom';
import { KneeboardMode } from './KneeboardMode';

interface PhoneCardsProps {
  weapons: DbWeapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
  threatSystems: ThreatSystemInfo[];
}

/** What to tell the planner after a share, or nothing (they cancelled). */
function shareMessage(result: ShareResult, count: number, statuses: MapStatus[]): string | null {
  const cards = count === 1 ? '1 card' : `${count} cards`;
  switch (result) {
    case 'shared':
      return `Shared ${cards}${exportMapNote(statuses)}`;
    case 'downloaded':
      return `No share sheet in this browser: downloaded ${cards}${exportMapNote(statuses)}`;
    case 'blocked':
      return 'Cards ready. Tap Share again to send them.';
    case 'unsupported':
      return 'Error: sharing is not available here';
    case 'cancelled':
      return null;
  }
}

/**
 * The Cards tab on a phone: every card stacked in a vertical list, full sheet
 * width, tap one to zoom in, share one under it or all from the top, or open
 * kneeboard mode to fly with them.
 *
 * "Share all" and "Kneeboard" stay pinned above the list so they're always a
 * thumb's reach away; the list itself scrolls. `useCardImages` only ever
 * needs to know which card is closest to being looked at, so that's the one
 * nearest the top of the scrolled list.
 */
export function PhoneCards({ weapons, fuzeOptions, threatSystems }: PhoneCardsProps) {
  // Only what this planner may see reaches a card (see useVisibleMission).
  const mission = useVisibleMission();
  const kneeboardMap = useUiStore((state) => state.kneeboardMap);
  const setKneeboardMap = useSettingsStore((state) => state.setKneeboardMap);

  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [kneeboardMode, setKneeboardMode] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Keyed by attack id rather than an array, so a card leaving (or a re-order)
  // never leaves a stale element behind at the wrong index.
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const entries = useMemo<CardEntry[]>(() => {
    if (!mission) return [];
    const taken = new Set<string>();
    return mission.attacks.flatMap((attack) => {
      const card = buildKneeboardCard(mission, attack.id, weapons, fuzeOptions, threatSystems);
      if (!card) return [];
      const name = kneeboardFilename(card.header.callsign, card.header.targetName, card.header.targetSteerpoint);
      return [{ attackId: attack.id, label: attackCardLabel(mission, attack.id), card, filename: claimFilename(name, taken) }];
    });
  }, [mission, weapons, fuzeOptions, threatSystems]);

  const shown = Math.min(Math.max(0, index), Math.max(0, entries.length - 1));
  const { imageOf, mapLoading, finalImage } = useCardImages(entries, kneeboardMap, shown);

  // Which card is nearest the top of the scrolled list — that's the one
  // `useCardImages` should treat as "on screen" and draw first.
  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const listTop = list.getBoundingClientRect().top;
    let nearest = 0;
    let nearestDistance = Infinity;
    entries.forEach((entry, i) => {
      const el = itemRefs.current[entry.attackId];
      if (!el) return;
      const distance = Math.abs(el.getBoundingClientRect().top - listTop);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
    });
    setIndex(nearest);
  };

  const scrollTo = (i: number) => {
    const entry = entries[i];
    itemRefs.current[entry?.attackId ?? '']?.scrollIntoView({ block: 'start' });
    setIndex(i);
  };

  // A "Strike near me" card shows a real location. Sharing one waits for a
  // "Share anyway" tap on an inline warning (a confirm() pop-up would use up
  // the tap the share sheet needs); once is enough for this panel.
  const [pendingShare, setPendingShare] = useState<CardEntry[] | null>(null);
  const [realWorldOk, setRealWorldOk] = useState(false);

  const share = useCallback(
    async (which: CardEntry[], acknowledged = realWorldOk) => {
      if (!which.length || !mission) return;
      if (isRealWorld(mission) && !acknowledged) {
        setPendingShare(which);
        return;
      }
      setPendingShare(null);
      setSharing(true);
      setMessage(null);
      try {
        const drawn = [];
        for (const entry of which) drawn.push({ entry, ...(await finalImage(entry)) });
        const title = which.length === 1 ? which[0].label : `${mission.name}: kneeboard cards`;
        const result = await platform.shareFiles(
          drawn.map((d) => ({ name: d.entry.filename, blob: d.blob })),
          title,
        );
        setMessage(shareMessage(result, which.length, drawn.map((d) => d.status)));
      } catch (e) {
        setMessage(`Error: ${String(e)}`);
      } finally {
        setSharing(false);
      }
    },
    [mission, finalImage, realWorldOk],
  );

  if (!mission) {
    return <div className="text-gray-400 text-center py-8 text-sm">No mission loaded.</div>;
  }

  if (!entries.length) {
    return (
      <div className="text-gray-400 text-center py-8 text-sm">
        No attacks planned yet. Add attacks to generate kneeboard cards.
      </div>
    );
  }

  const current = entries[shown];
  const currentImage = imageOf(current.attackId);
  const mapNote = mapLoading ? 'loading map…' : currentImage ? previewMapNote(currentImage.status) : null;
  const button = 'min-h-[44px] rounded-lg text-sm font-medium text-white transition-colors disabled:bg-gray-600';

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Pinned above the list: these stay in reach while it scrolls */}
      <div className="shrink-0 grid grid-cols-2 gap-2">
        <button onClick={() => void share(entries)} disabled={sharing} className={`${button} bg-dcs-blue hover:bg-blue-600`}>
          {sharing ? 'Preparing…' : `Share all (${entries.length})`}
        </button>
        <button onClick={() => setKneeboardMode(true)} className={`${button} bg-dcs-accent hover:bg-red-600`}>
          Kneeboard
        </button>
      </div>

      {pendingShare && (
        <div className="shrink-0 rounded-lg border border-amber-500/60 bg-amber-950 p-3 text-sm text-amber-100">
          <p className="mb-2">{REAL_WORLD_SHARE_WARNING}</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPendingShare(null)} className="min-h-[44px] px-4 rounded-lg bg-gray-700">
              Cancel
            </button>
            <button
              onClick={() => {
                setRealWorldOk(true);
                void share(pendingShare, true);
              }}
              className="min-h-[44px] px-4 rounded-lg bg-dcs-accent font-medium text-white"
            >
              Share anyway
            </button>
          </div>
        </div>
      )}

      {/* Map under the north-up picture */}
      <label className="shrink-0 flex items-center gap-2 min-h-[44px] text-sm text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          className="w-5 h-5"
          checked={kneeboardMap}
          onChange={(e) => void setKneeboardMap(e.target.checked)}
        />
        Map background
        {mapNote && <span className="text-gray-500">· {mapNote}</span>}
      </label>

      {message && (
        <button
          onClick={() => setMessage(null)}
          className={`shrink-0 text-left text-xs rounded p-2 break-words ${
            message.startsWith('Error') ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'
          }`}
        >
          {message}
        </button>
      )}

      {/* The list: every card, full sheet width, stacked and scrolled vertically */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4"
        aria-label="Kneeboard cards"
      >
        {entries.map((entry) => {
          const image = imageOf(entry.attackId);
          return (
            <div
              key={entry.attackId}
              ref={(el) => {
                itemRefs.current[entry.attackId] = el;
              }}
              className="flex flex-col gap-2"
            >
              <p className="text-sm truncate">{entry.label}</p>
              {image ? (
                <button onClick={() => setZoomed(entry.attackId)} className="w-full" aria-label={`Zoom ${entry.label}`}>
                  <img
                    src={image.url}
                    alt={entry.label}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="w-full aspect-[3/4] object-contain rounded border border-gray-600"
                  />
                </button>
              ) : (
                <div className="w-full aspect-[3/4] rounded border border-gray-700 bg-dcs-dark flex items-center justify-center text-xs text-gray-500">
                  Drawing card…
                </div>
              )}
              <button
                onClick={() => void share([entry])}
                disabled={sharing}
                className={`${button} w-full bg-dcs-blue hover:bg-blue-600`}
              >
                Share
              </button>
            </div>
          );
        })}
      </div>

      {zoomed && imageOf(zoomed) && (
        <CardZoom
          src={imageOf(zoomed)!.url}
          label={entries.find((e) => e.attackId === zoomed)?.label ?? 'Card'}
          onClose={() => setZoomed(null)}
        />
      )}

      {kneeboardMode && (
        <KneeboardMode
          cards={entries.map((e) => ({ key: e.attackId, label: e.label, src: imageOf(e.attackId)?.url }))}
          startIndex={shown}
          onClose={(i) => {
            setKneeboardMode(false);
            scrollTo(i);
          }}
        />
      )}
    </div>
  );
}
