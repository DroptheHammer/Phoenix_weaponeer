import { useRef, type ReactNode } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { cx } from '../ui/cx';
import { Tabs, type TabItem } from '../ui/Tabs';
import { MapZoom } from '../map/MapZoom';
import { MapCredit } from '../map/MapCredit';
import { PanelSheet } from './PanelSheet';

export interface PlannerShellProps<Id extends string> {
  /** The map (MapView), drawn under everything, edge to edge. */
  map: ReactNode;
  /** The Leaflet map MapView handed over (MapView's onMap), for the zoom buttons. */
  leafletMap: LeafletMap | null;
  railItems: readonly TabItem<Id>[];
  activePanel: Id | null;
  onPanel: (id: Id | null) => void;
  panelTitle: string;
  /** The open panel's content. Rendered only while a panel is open. */
  panel: ReactNode;
  /** A map placement is armed: keep the panel mounted but out of sight, so the click can land anywhere. */
  hidePanel: boolean;
  /** The unverified-coordinates or real-world notice, top centre of the map (hidden while a map pick is armed). */
  banner?: ReactNode;
  /** The Legend, at the bottom of the left column, under the rail. */
  legend: ReactNode;
}

/**
 * The desktop planner: the map is the page, and everything floats over it in one grid inset
 * 12 px from the edges.
 *
 *   column 1 (the rail's width, --dock-w): the rail at the top, the Legend at the bottom. The
 *     Legend is a flex item that may shrink, so open it is never taller than the room under the
 *     rail; the column is a fixed width, so the open Legend (wider) overflows to the right over
 *     the map instead of pushing the zoom and the credit.
 *   column 2 (the map's middle): the notice top centre, the zoom top right, the credit bottom right.
 *   column 3 (--panel-w, only while a panel shows): the side panel. Under 900 px wide (the web
 *     build on a small tablet) the panel covers columns 1 and 2 instead, rather than squeezing
 *     the map to a sliver beside it.
 *
 * The grid itself lets clicks through (pointer-events-none); only the floating boxes take them.
 */
export function PlannerShell<Id extends string>({
  map,
  leafletMap,
  railItems,
  activePanel,
  onPanel,
  panelTitle,
  panel,
  hidePanel,
  banner,
  legend,
}: PlannerShellProps<Id>) {
  const rail = useRef<HTMLDivElement>(null);
  const panelShown = activePanel !== null && !hidePanel;

  // The close button hands the keyboard back to the rail button that opened the panel.
  const closePanel = () => {
    const opener = rail.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    onPanel(null);
    opener?.focus();
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-deep">
      <div className="absolute inset-0">{map}</div>

      <div
        className={cx(
          'pointer-events-none absolute inset-0 z-[1000] grid grid-rows-[minmax(0,1fr)] gap-inset p-inset',
          panelShown
            ? 'grid-cols-[var(--dock-w)_minmax(0,1fr)_var(--panel-w)] max-[899px]:grid-cols-[var(--dock-w)_minmax(0,1fr)]'
            : 'grid-cols-[var(--dock-w)_minmax(0,1fr)]',
        )}
      >
        <div ref={rail} className="col-start-1 row-start-1 flex min-h-0 flex-col items-start justify-between gap-inset">
          <Tabs<Id> variant="rail" label="Planner panels" className="pointer-events-auto shrink-0" items={railItems} selected={activePanel} onSelect={onPanel} />
          {legend}
        </div>

        <div className="col-start-2 row-start-1 grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] gap-inset">
          {/* The notice steps aside while a map pick is armed: the pick's prompt and its Cancel sit
              top centre too, and the notice used to cover them. */}
          {banner && !hidePanel ? <div className="pointer-events-auto col-start-1 row-start-1 min-w-0 max-w-2xl justify-self-center">{banner}</div> : null}
          <MapZoom map={leafletMap} className="pointer-events-auto col-start-2 row-start-1 self-start" />
          <MapCredit className="pointer-events-auto col-span-2 row-start-3 max-w-full self-end justify-self-end" />
        </div>

        {activePanel !== null ? (
          <PanelSheet
            title={panelTitle}
            onClose={closePanel}
            hidden={hidePanel}
            className="pointer-events-auto col-start-3 row-start-1 max-[899px]:z-10 max-[899px]:col-span-full max-[899px]:col-start-1"
          >
            {panel}
          </PanelSheet>
        ) : null}
      </div>
    </div>
  );
}
