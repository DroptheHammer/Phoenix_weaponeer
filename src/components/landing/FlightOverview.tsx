import { useMemo } from 'react';
import type { Mission } from '../../types/mission.types';
import type { HiddenReveal } from '../../lib/threatVisibility';
import { visibleMission } from '../../lib/threatVisibility';
import { buildOverview } from '../../lib/landing/overviewModel';
import type { SummaryRefs } from '../../lib/landing/missionSummary';
import { useTheaterInfo } from '../../stores/theaterStore';
import { Button } from '../ui/Button';
import { Dot } from '../ui/Chip';
import { cx } from '../ui/cx';
import { JetCard } from './JetCard';
import { OverviewMap } from './OverviewMap';
import { ThreatBlock } from './ThreatBlock';
import { WaypointPicker, waypointDotKind } from './WaypointPicker';
import { W } from './words';
import { OW } from './overviewWords';
import type { ImportContext } from './overviewWhere';

/**
 * The Flight overview, where every load lands: the flight's jets and loadouts, the threats, a map. The threat
 * block is about one waypoint (the target by default, another one picked from its list), and the map is framed
 * on that waypoint and the threats near it or covering it. Loaded on demand: App wraps the named export.
 */
export interface FlightOverviewProps {
  mission: Mission;
  reveal: HiddenReveal;
  refs: SummaryRefs;
  importContext: ImportContext | null;
  chosenWaypointId: string | null;
  onChooseWaypoint: (id: string) => void;
  onOpenMap: () => void;
  onOpenThreats: () => void;
  phone: boolean;
}

export function FlightOverview(props: FlightOverviewProps) {
  const { mission, reveal, refs, importContext, chosenWaypointId, onChooseWaypoint, onOpenMap, onOpenThreats, phone } = props;
  const model = useMemo(() => buildOverview(mission, reveal, refs, chosenWaypointId), [mission, reveal, refs, chosenWaypointId]);
  // The map and the waypoint list draw the visible mission and nothing else.
  const visible = useMemo(() => visibleMission(mission, reveal), [mission, reveal]);
  const theaterInfo = useTheaterInfo(mission.theater);
  const rangeOf = useMemo(() => new Map(refs.threatSystems.map((s) => [s.id, s.max_range_nm])), [refs.threatSystems]);
  const typeOf = useMemo(() => new Map(refs.threatSystems.map((s) => [s.id, s.threat_type ?? ''])), [refs.threatSystems]);
  const oneOf = importContext?.missionId === mission.id && importContext.playerFlights > 1 ? OW.oneOf(importContext.playerFlights) : null;
  const short = model.chosen?.short ?? null;
  const est = model.jets.some((j) => j.foot?.estimated);
  const r = model.readiness;

  const readiness = r.jets > 0 && (
    <div className={cx('flex items-center gap-3', phone && 'mx-1 mb-3')}>
      <div role="img" aria-label={OW.readinessLabel(r.planned, r.jets)} className={cx('grid h-2 shrink-0 auto-cols-fr grid-flow-col gap-1', phone ? 'w-[88px]' : 'w-28')}>
        {Array.from({ length: r.jets }, (_, i) => <span key={i} className={cx('rounded-pill', i < r.planned ? 'bg-info' : 'bg-tint-3')} />)}
      </div>
      <p className="whitespace-nowrap text-ui-small text-ink-2">
        <strong className={cx('font-bold text-ink', !phone && 'text-ui-body')}>{OW.readiness(r.planned, r.jets)}</strong>
        {OW.readinessRest(r.cardsReady)}
      </p>
    </div>
  );
  const estNote = est && (
    <p className="text-ui-small text-ink-2"><strong className="font-bold text-ink">{W.estimatedNoteStrong}</strong>{W.estimatedNote}</p>
  );
  const jets = model.jets.length > 0 ? (
    <ul className={cx('grid gap-3', phone ? 'grid-cols-1' : 'grid-cols-4 max-[1099px]:grid-cols-2')}>
      {model.jets.map((j) => <li key={j.key} className="grid min-w-0"><JetCard jet={j} phone={phone} /></li>)}
    </ul>
  ) : (
    <p className="rounded-ui-lg border border-dashed border-control px-4 py-3 text-ui-small text-ink-2">{OW.noJets}</p>
  );
  const picker = model.chosen ? (
    <WaypointPicker waypoints={visible.waypoints} threats={visible.threats} systems={refs.threatSystems} chosenId={model.chosen.id} short={model.chosen.short} onPick={onChooseWaypoint} phone={phone} />
  ) : null;
  const threats = (
    <ThreatBlock totals={model.totals} near={model.near} short={short} picker={picker} sitesOff={model.frame?.sitesOff ?? []} onOpenThreats={onOpenThreats} phone={phone} />
  );
  // The chosen waypoint, its dot coloured by its type as in the list; its height only for a target (OW.mapTarget).
  const target = model.chosen && (
    <span className="inline-flex items-center gap-1.5">
      <Dot kind={waypointDotKind(model.chosen.type)} />
      {OW.mapTarget(model.chosen.short, model.chosen.steerpoint, model.chosen.type === 'target' ? model.chosen.elevation_ft : null)}
    </span>
  );
  const map = (
    <OverviewMap
      waypoints={visible.waypoints}
      threats={visible.threats}
      rangeOf={rangeOf}
      typeOf={typeOf}
      frame={model.frame}
      fallback={theaterInfo?.default_center ?? null}
      label={short ? OW.mapLabel(short) : OW.mapTitle}
      phone={phone}
    />
  );

  // The page's one <main> is the shell's (App's on the desktop, the phone shell's), so the overview is a labelled
  // region inside it.
  if (phone) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <section tabIndex={0} aria-label={OW.overviewLabel(model.flight)} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8 pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] pt-4">
          <div className="mx-auto grid w-full max-w-[560px] gap-5">
            <div className="mx-1 grid gap-0.5 text-ui-small leading-[1.4] text-ink-2">
              {oneOf && <p className="font-medium text-ink">{oneOf}</p>}
              {target && <p>{target}</p>}
            </div>
            <section aria-labelledby="ov-jets-title">
              <h2 id="ov-jets-title" className="mx-1 mb-2.5 text-ui-lead font-semibold leading-ui-tight">{W.jetsTitle}</h2>
              {readiness}
              {jets}
              {estNote && <div className="px-1 pt-3 text-ui-caption">{estNote}</div>}
            </section>
            <section aria-labelledby="ov-threats-title">
              <div className="mx-1 mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h2 id="ov-threats-title" className="text-ui-lead font-semibold leading-ui-tight">{OW.threatsTitle}</h2>
                <p className="text-ui-small text-ink-2">{OW.threatsTotal(model.totals.systems, model.totals.threats)}</p>
              </div>
              {threats}
            </section>
            <section aria-labelledby="ov-map-title">
              <h2 id="ov-map-title" className="mx-1 mb-2.5 text-ui-lead font-semibold leading-ui-tight">{OW.mapTitle}</h2>
              {/* isolate: Leaflet's panes carry z-index 400-1000; without a stacking context of its own the map
                  would draw over anything that drops over it. The rule for every Leaflet picture outside the planner. */}
              <figure className="isolate overflow-hidden rounded-ui-lg border border-line-strong bg-surface-navy shadow-ui-1">
                <div className="relative aspect-[4/3] bg-surface-deep">{map}</div>
              </figure>
            </section>
          </div>
        </section>
        <footer className="shrink-0 border-t border-line-strong bg-surface-navy pb-[calc(0.75rem+var(--safe-bottom))] pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] pt-3 shadow-ui-up">
          <Button variant="primary" size="lg" icon="map" onClick={onOpenMap} className="w-full">{W.openMap}</Button>
        </footer>
      </div>
    );
  }

  return (
    <section
      tabIndex={-1}
      aria-label={OW.overviewLabel(model.flight)}
      className="mx-auto grid h-full min-h-0 w-full min-w-0 max-w-[1560px] grid-rows-[auto_minmax(272px,1fr)] gap-2.5 overflow-y-auto px-6 py-2.5 tall:grid-rows-[auto_minmax(300px,1fr)] tall:gap-4 tall:py-4 max-[1279px]:px-4 max-[1099px]:grid-rows-[auto_auto]"
    >
      <section aria-labelledby="ov-jets-title">
        <div className="mb-1.5 flex min-h-6 flex-wrap items-center justify-between gap-x-4 tall:min-h-[26px]">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <h2 id="ov-jets-title" className="text-ui-lead font-bold leading-6">{W.jetsTitle}</h2>
            {oneOf && <p className="text-ui-small text-ink-2">{oneOf}</p>}
            {estNote}
          </div>
          {readiness}
        </div>
        {jets}
      </section>
      <div className="grid max-h-[560px] min-h-0 min-w-0 grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-x-4 max-[1099px]:max-h-none max-[1099px]:grid-cols-1 max-[1099px]:gap-4">
        <section aria-labelledby="ov-threats-title" className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="mb-1.5 flex min-h-6 flex-wrap items-baseline gap-x-3 tall:min-h-[26px]">
            <h2 id="ov-threats-title" className="text-ui-lead font-bold leading-6">{OW.threatsTitle}</h2>
            <p className="text-ui-small text-ink-2">{OW.threatsTotal(model.totals.systems, model.totals.threats)}</p>
          </div>
          {threats}
        </section>
        <section aria-labelledby="ov-map-title" className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="mb-1.5 flex min-h-6 flex-wrap items-baseline gap-x-3 tall:min-h-[26px]">
            <h2 id="ov-map-title" className="text-ui-lead font-bold leading-6">{OW.mapTitle}</h2>
            {target && <p className="text-ui-small text-ink-2">{target}</p>}
          </div>
          {/* isolate: Leaflet's panes carry z-index 400-1000; without a stacking context of its own the map would
              draw over the waypoint list and any menu that drops over it. The rule for every Leaflet picture outside the planner. */}
          <figure className="relative isolate min-h-0 overflow-hidden rounded-ui-lg border border-line-strong bg-surface-deep shadow-ui-1 max-[1099px]:h-[clamp(240px,38vw,380px)]">
            {map}
          </figure>
        </section>
      </div>
    </section>
  );
}
