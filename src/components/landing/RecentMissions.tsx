import { useEffect, useId, useMemo, useState } from 'react';
import type { Mission } from '../../types/mission.types';
import { OSM_TILE_URL } from '../../lib/kneeboardBasemap';
import { editedWhenCapital } from '../../lib/landing/editedWhen';
import { fallbackCenterOf, platformPeekDeps } from '../../lib/landing/platformBindings';
import { fileNameOf, peekRecents, recentCardFrom, recentKeyId, recentKeys, type RecentCard, type RecentKey } from '../../lib/landing/recentCards';
import { CARD_PICTURE, planThumbnail } from '../../lib/landing/thumbnailPlan';
import { useLocalMissionStore } from '../../stores/localMissionStore';
import { useMissionStore } from '../../stores/missionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTheaterStore } from '../../stores/theaterStore';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { cx } from '../ui/cx';
import { W } from './words';

const DOT_CLASS: Record<string, string> = { SAM: 'fill-data-sam', SHORAD: 'fill-data-shorad', AAA: 'fill-data-aaa', MANPADS: 'fill-data-manpads', EWR: 'fill-data-ewr' };

/**
 * The little route picture: map tiles (colour, the planner's own OSM tiles, as plain SVG images placed by
 * thumbnailPlan, so the browser's and the phone's tile caches serve them), then the route, the waypoints and
 * the visible threats. Its input is the recent card's, which is made under STRICT_REVEAL whatever Settings
 * says: a hidden threat is never in it, and never pulls the frame or a tile request towards itself.
 * Nothing is drawn to a canvas and nothing is kept.
 */
function Thumbnail({ card, typeOf }: { card: Extract<RecentCard, { status: 'ok' }>; typeOf: Map<string, string> }) {
  const plan = useMemo(() => planThumbnail(card.thumbnail, CARD_PICTURE, { paddingPx: CARD_PICTURE.marginPx }), [card.thumbnail]);
  const { dot } = CARD_PICTURE;
  return (
    <svg viewBox={`0 0 ${CARD_PICTURE.width} ${CARD_PICTURE.height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="block aspect-video w-full bg-surface-deep short:aspect-[2/1]">
      {plan.tiles.map((t) => (
        <image key={t.key} href={OSM_TILE_URL.replace('{z}', String(t.tile.z)).replace('{x}', String(t.tile.x)).replace('{y}', String(t.tile.y))} x={t.rect.x} y={t.rect.y} width={t.rect.w} height={t.rect.h} preserveAspectRatio="none" />
      ))}
      {plan.route.length > 1 && <polyline points={plan.route.map(([x, y]) => `${x},${y}`).join(' ')} className="fill-none stroke-data-nav" strokeWidth={2} strokeDasharray="4 6" />}
      {plan.threats.map((t, i) => <circle key={`t${i}`} cx={t.x} cy={t.y} r={dot.threat} className={cx('stroke-[var(--d-halo)]', DOT_CLASS[typeOf.get(t.systemId) ?? ''] ?? 'fill-data-sam')} strokeWidth={dot.outline} />)}
      {plan.waypoints.map((w, i) => <circle key={`w${i}`} cx={w.x} cy={w.y} r={dot.waypoint} className="fill-data-nav stroke-[var(--d-halo)]" strokeWidth={dot.outline} />)}
    </svg>
  );
}

export interface RecentCardItemProps {
  card: RecentCard;
  /** The mission open right now ("Open now"), not one read from a file or kept in this browser. */
  isLive: boolean;
  now: Date;
  theaterName: (theaterId: string) => string;
  aircraftName: (aircraftId: string) => string;
  typeOf: Map<string, string>;
  /** A browser card only: its "Delete?" question is open. */
  asking: boolean;
  onOpen: () => void;
  /** A file card's ×: take it off the list (the file is not touched). */
  onForget: () => void;
  /** A browser card's ×: open or close the "Delete?" question. */
  onAsk: () => void;
  onCancelAsk: () => void;
  onDelete: () => void;
}

/** One recent mission: the route picture over its name, where and when, and its flights. */
export function RecentCardItem({ card, isLive, now, theaterName, aircraftName, typeOf, asking, onOpen, onForget, onAsk, onCancelAsk, onDelete }: RecentCardItemProps) {
  const forgetNameId = useId();
  const title = card.status === 'ok' ? card.name : card.label;
  const when = card.status === 'ok' ? editedWhenCapital(card.lastEdited, now) : null;
  // A saved file is told apart from another copy of the same mission by its file name; its folder is in the tooltip.
  const filePath = card.key.source === 'file' ? card.key.path : null;
  const fileName = filePath !== null && card.status === 'ok' ? fileNameOf(filePath) : null;
  return (
    <li className="relative grid min-w-0">
      <button type="button" onClick={onOpen} title={filePath ?? undefined} className="relative flex min-w-0 flex-col overflow-hidden rounded-ui-lg border border-line bg-surface-navy text-left text-ink shadow-ui-1 transition-colors duration-fast hover:border-control hover:bg-surface-raised motion-reduce:transition-none">
        {card.status === 'ok' ? (
          <Thumbnail card={card} typeOf={typeOf} />
        ) : (
          <span aria-hidden="true" className="grid aspect-video w-full place-items-center bg-surface-deep text-ink-3 short:aspect-[2/1]"><Icon name="file" size="lg" /></span>
        )}
        <span className={cx('grid gap-0.5 px-4 pb-4 pt-3 max-[1279px]:px-3 short:pb-3 short:pt-2.5')}>
          <span className="flex items-center gap-2 text-ui-lead font-semibold leading-[1.3] [overflow-wrap:anywhere]">
            {title}
            {isLive && <span className="inline-flex min-h-tag items-center whitespace-nowrap rounded-pill bg-tint-2 px-2 text-ui-caption font-semibold tracking-tag text-ink">{W.recentOpenNow}</span>}
          </span>
          {fileName && <span className="text-ui-small text-ink-3 [overflow-wrap:anywhere]">{fileName}</span>}
          {card.status === 'ok' ? (
            <>
              <span className="flex flex-wrap justify-between gap-x-2 text-ui-small text-ink-2">
                <span>{theaterName(card.theaterId)}</span>
                {when && <span><span className="sr-only">{W.recentLastEdited}</span>{when}</span>}
              </span>
              <span className="mt-1 text-ui-small text-ink-3">
                {card.flights.map((f, i) => (
                  <span key={f.group} className="whitespace-nowrap">{W.recentFlight(f.group, f.jets, f.aircraftIds.map(aircraftName).join(', '))}{i < card.flights.length - 1 ? ', ' : ''} </span>
                ))}
              </span>
            </>
          ) : (
            <span className="text-ui-small text-ink-2">{card.status === 'missing' ? W.recentMissing : W.recentUnreadable}</span>
          )}
        </span>
      </button>
      {!isLive && (
        // The round frame is a wrapper: a building block's className is for layout only.
        <span className="absolute right-2 top-2 rounded-full border border-line-strong bg-surface-navy">
          {card.key.source === 'file' ? (
            // The tooltip says the file stays; the name a screen reader speaks still says which mission this is.
            <>
              <span id={forgetNameId} className="sr-only">{W.recentForget(title)}</span>
              <IconButton icon="close" label={W.recentForgetTitle} aria-labelledby={forgetNameId} onClick={onForget} />
            </>
          ) : (
            <IconButton icon="close" label={W.recentDelete(title)} aria-expanded={asking} onClick={onAsk} />
          )}
        </span>
      )}
      {asking && card.key.source === 'browser' && (
        <div className="grid gap-3 border-t border-line bg-tint-1 px-4 pb-4 pt-3">
          <p className="text-ui-small text-ink">{W.recentDeleteAsk(title)}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="tonal" onClick={onCancelAsk}>{W.cancel}</Button>
            <Button variant="outline" icon="trash" onClick={onDelete}>{W.recentDeleteYes}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

export interface RecentMissionsProps {
  /** The mission open right now, if the planner came back to the front page with it open. */
  openMission: Mission | null;
  onContinue: () => void;
  onOpenFile: (path: string) => void;
  onOpenLocal: (id: string) => void;
  aircraft: ReadonlyArray<{ id: string; name: string }>;
  typeOf: Map<string, string>;
  phone: boolean;
  /** The browser build: its recent missions are the ones kept in this browser (only platformBindings may import @platform). */
  web: boolean;
}

/** Recent missions as cards: a grid on the desktop, one column on a phone, each card a picture of the route over its title. */
export function RecentMissions({ openMission, onContinue, onOpenFile, onOpenLocal, aircraft, typeOf, phone, web }: RecentMissionsProps) {
  const recentPaths = useSettingsStore((s) => s.settings.recentMissions);
  const forget = useSettingsStore((s) => s.forgetRecentMission);
  const entries = useLocalMissionStore((s) => s.entries);
  const remove = useLocalMissionStore((s) => s.remove);
  // Why this browser's storage last failed (the list could not be read, a delete or an autosave failed).
  // It is the only copy of a plan there, so the planner hears of it here, as the old list said it.
  const storageError = useLocalMissionStore((s) => s.error);
  const theaters = useTheaterStore((s) => s.theaters);
  const [cards, setCards] = useState<RecentCard[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  // The open mission is the "Open now" card, so its own file (desktop) or browser entry (web) is not listed twice.
  const filePath = useMissionStore((s) => s.filePath);
  // Keyed on the open mission's id, not the object: an edit must not read every recent file again.
  const openId = openMission?.id ?? null;
  const keys = useMemo(
    () => recentKeys(web, recentPaths, entries).filter((k) => (openId ? (k.source === 'browser' ? k.id !== openId : k.path !== filePath) : true)),
    [web, recentPaths, entries, openId, filePath],
  );
  useEffect(() => {
    let cancelled = false;
    setCards([]);
    void peekRecents(keys, platformPeekDeps, fallbackCenterOf, (card) => setCards((cs) => [...cs, card]), () => cancelled);
    return () => { cancelled = true; };
  }, [keys]);
  const live = useMemo(
    () => (openMission ? recentCardFrom(openMission, { source: 'browser', id: openMission.id, name: openMission.name, savedAt: openMission.updatedAt }, fallbackCenterOf) : null),
    [openMission],
  );
  const now = new Date();
  const nameOf = (id: string) => aircraft.find((a) => a.id === id)?.name ?? id;
  const shownError = web ? storageError : null;
  if (!live && cards.length === 0 && !shownError) return null;

  const cardView = (card: RecentCard, isLive: boolean) => {
    const id = isLive ? 'open-now' : recentKeyId(card.key);
    const key = card.key;
    return (
      <RecentCardItem
        key={id}
        card={card}
        isLive={isLive}
        now={now}
        theaterName={(theaterId) => theaters[theaterId]?.display_name ?? theaterId}
        aircraftName={nameOf}
        typeOf={typeOf}
        asking={asking === id}
        onOpen={() => (isLive ? onContinue() : key.source === 'file' ? onOpenFile(key.path) : onOpenLocal((key as Extract<RecentKey, { source: 'browser' }>).id))}
        onForget={() => { if (key.source === 'file') void forget(key.path); }}
        onAsk={() => setAsking(asking === id ? null : id)}
        onCancelAsk={() => setAsking(null)}
        onDelete={() => { void remove((key as Extract<RecentKey, { source: 'browser' }>).id); setAsking(null); }}
      />
    );
  };

  return (
    <section aria-labelledby="recents-title">
      <h2 id="recents-title" tabIndex={-1} className="mb-3 text-ui-lead font-semibold leading-ui-tight short:mb-2">{W.recentTitle}</h2>
      {shownError && (
        <p className="mb-3 flex min-w-0 items-start gap-1.5 text-ui-small font-semibold text-warn">
          <Icon name="warn" size="sm" className="mt-px shrink-0" />
          <span>{shownError}</span>
        </p>
      )}
      {/* auto-fill, not auto-fit: one or two cards keep the width they have in a full row, rather than one card
          stretching across the whole page with a picture as tall as the window. */}
      <ul className={cx('grid gap-4', phone ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]')}>
        {live && cardView(live, true)}
        {cards.map((c) => cardView(c, false))}
      </ul>
      {/* Not while the amber line above says the plan was NOT saved: the two would contradict each other. */}
      {web && !shownError && <p className="mt-3 text-ui-small leading-[1.45] text-ink-3">{W.recentWebFine}</p>}
    </section>
  );
}
