import type { ReactNode } from 'react';
import type { NearRow, NearThreats, ThreatTotals } from '../../lib/landing/nearThreats';
import { Button } from '../ui/Button';
import { Dot, type DotKind } from '../ui/Chip';
import { cx } from '../ui/cx';
import { OW } from './overviewWords';

const DOT: Record<string, DotKind> = { SAM: 'sam', SHORAD: 'shorad', AAA: 'aaa', MANPADS: 'manpads', EWR: 'ewr' };
const nm1 = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} nm`;
/** The reference value as it is: "2.8 nm", "13 nm" (as the reference table gives it; the card rounds to whole miles). */
const nmMax = (v: number) => `${Number.isInteger(v) ? String(v) : v.toFixed(1)} nm`;
const deg3 = (v: number) => `${String(Math.round(v) % 360).padStart(3, '0')}°`;

/**
 * The fixed-size threat block: five class tiles for the
 * whole mission, at most four rows about one waypoint, "+ N more in reach", one closing line. Its height does
 * not grow with the mission. Everything it shows comes from the visible mission (buildOverview).
 */
export function ThreatBlock({
  totals, near, short, picker, sitesOff, onOpenThreats, phone,
}: {
  totals: ThreatTotals;
  near: NearThreats | null;
  short: string | null;
  /** The waypoint button (WaypointPicker), or null with no waypoints. */
  picker: ReactNode;
  sitesOff: string[];
  onOpenThreats: () => void;
  phone: boolean;
}) {
  const tiles = (
    <ul aria-label={OW.classesLabel} className={cx('grid', phone ? 'mb-3 grid-cols-6 gap-2' : 'grid-cols-5 gap-2')}>
      {totals.classes.map((c, i) => {
        const none = c.systems === 0;
        return (
          <li
            key={c.cls}
            className={cx(
              'grid min-w-0 content-center rounded-ui-md border',
              phone ? cx('content-start gap-0.5 px-3 py-2.5', i < 3 ? 'col-span-2' : 'col-span-3') : 'min-h-11 py-1 pl-1.5 pr-1 tall:min-h-[52px] max-[1279px]:min-h-[58px]',
              none ? 'border-dashed border-control' : 'border-line bg-tint-1',
            )}
          >
            <span className={cx('flex min-w-0 items-center gap-1.5 text-ui-small font-bold leading-4', none ? 'text-ink-3' : 'text-ink', phone && 'mb-1')}>
              <Dot kind={DOT[c.cls]} />
              {OW.classNames[c.cls]}
            </span>
            {none ? (
              <span className="text-ui-caption leading-4 text-ink-3">
                —<span className="sr-only">{OW.tileNone}</span>
              </span>
            ) : (
              <span className={cx('whitespace-nowrap text-ink-2', phone ? 'grid text-ui-small' : 'text-ui-caption leading-4')}>
                <span className={phone ? '' : 'max-[1279px]:block'}><strong className="font-bold text-ink">{c.systems}</strong>{OW.tileSystems(c.systems)}</span>
                {!phone && <span aria-hidden="true" className="max-[1279px]:hidden"> · </span>}
                <span className={phone ? '' : 'max-[1279px]:block'}><strong className="font-bold text-ink">{c.threats}</strong>{OW.tileThreats(c.threats)}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );

  const rows = near?.rows ?? [];
  const row = (r: NearRow) => {
    const off = sitesOff.includes(r.systemId);
    const name = (
      <span className={cx('min-w-0 [overflow-wrap:anywhere]', r.inReach ? 'font-semibold text-ink' : 'font-normal text-ink-2', phone && 'text-ui-body')}>
        {r.name}
        {r.nato && <span className="font-normal text-ink-2"> ({r.nato})</span>}
        {r.nearest.status !== 'active' && <span className="ml-1.5 whitespace-nowrap text-ui-caption font-semibold text-ink-2">{OW.status(r.nearest.status)}</span>}
        {!r.inReach && <span className="ml-1.5 whitespace-nowrap text-ui-caption font-medium text-ink-3">{OW.outOfReach}</span>}
        {off && <span className="ml-1.5 whitespace-nowrap text-ui-caption font-medium text-ink-3">{OW.offMap}</span>}
      </span>
    );
    const tag = r.cls ? (
      <span className="inline-flex min-h-tag items-center gap-1.5 justify-self-start whitespace-nowrap rounded-pill bg-tint-2 px-2 text-ui-caption font-semibold tracking-tag text-ink">
        <Dot kind={DOT[r.cls]} />
        {r.cls}
      </span>
    ) : <span />;
    const nearest = (
      <span className={cx('whitespace-nowrap', r.inReach ? 'text-ink' : 'text-ink-2')}>
        <span className="text-ui-caption text-ink-3">{OW.nearest}</span> {nm1(r.nearest.distance_nm)} at {deg3(r.nearest.bearing_deg)}
      </span>
    );
    const max = (
      <span className="whitespace-nowrap text-ink-2">
        <span className="text-ui-caption text-ink-3">{OW.maxRange}</span> {nmMax(r.maxRange_nm)}
      </span>
    );
    const count = (
      <span className="text-right font-semibold text-ink">
        × {r.count}<span className="sr-only">{OW.countSr}</span>
      </span>
    );
    return phone ? (
      <li key={r.systemId} className="grid gap-1 px-3 py-2.5">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{name}{tag}</p>
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-ui-small">
          <span>{nearest}<span className="text-ink-2"> · </span>{max}</span>
          {count}
        </p>
      </li>
    ) : (
      <li
        key={r.systemId}
        className="grid min-h-[22px] min-w-0 grid-cols-[minmax(0,1fr)_92px_150px_112px_40px] items-center gap-x-2.5 border-t border-line text-ui-small leading-[1.3] first:border-t-transparent tall:min-h-[26px]"
      >
        {name}{tag}{nearest}{max}{count}
      </li>
    );
  };

  const head = (
    <div className={cx(phone ? 'px-3 pb-2 pt-3' : 'mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3')}>
      <h3 className={cx('flex items-center gap-2 font-bold', phone ? 'text-ui-body' : 'text-ui-small leading-[18px]')}>
        {OW.near} {picker}
      </h3>
      <p className={cx('text-ui-caption leading-4', phone ? 'mt-1 text-ink-2' : 'text-ink-3')}>{OW.nearCaption}</p>
    </div>
  );
  const empty = short ? OW.noNear(short) : OW.noWaypoints;
  const list = (
    <ol
      aria-label={short ? `${OW.near} ${short}` : OW.near}
      className={cx(phone ? 'divide-y divide-line border-t border-line' : 'mt-0.5 grid grid-rows-[repeat(4,minmax(22px,44px))] content-start tall:grid-rows-[repeat(4,minmax(26px,44px))]')}
    >
      {rows.map(row)}
      {rows.length === 0 && <li className={cx('flex items-center italic text-ink-3', phone ? 'px-3 py-2.5 text-ui-small' : 'text-ui-small')}>{empty}</li>}
      {/* Empty slots keep the block's height whatever the mission holds (desktop). */}
      {!phone && Array.from({ length: Math.max(0, 4 - Math.max(rows.length, 1)) }, (_, i) => <li key={`blank${i}`} aria-hidden="true" />)}
    </ol>
  );
  const more = near && near.moreInReach > 0 ? OW.moreInReach(near.moreInReach) : '';
  const out = near ?? { outSystems: totals.systems, outThreats: totals.threats };
  const foot = (
    <div className={cx('flex flex-wrap items-center justify-between gap-x-3 gap-y-1', phone ? 'grid gap-0.5 bg-shade px-3 pb-1 pt-3' : 'mt-1 border-t border-line pt-1')}>
      <p className="text-ui-small text-ink-2">
        <strong className="font-bold text-ink">{OW.outLineStrong(out.outSystems)}</strong>
        {OW.outLineRest(out.outSystems, out.outThreats, short ?? '')}
      </p>
      <Button variant="text" iconEnd="arrow-right" onClick={onOpenThreats} className={phone ? '-ml-3 justify-self-start' : undefined}>
        {OW.openThreats}
      </Button>
    </div>
  );

  return phone ? (
    <>
      {tiles}
      <div className="relative overflow-hidden rounded-ui-lg border border-line bg-surface-navy">
        {head}
        {list}
        {more && <p className="border-t border-line px-3 py-2 text-ui-small font-semibold text-ink-2">{more}</p>}
        <div className="border-t border-line">{foot}</div>
      </div>
    </>
  ) : (
    <div className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] rounded-ui-lg border border-line bg-surface-navy p-3 shadow-ui-1">
      {tiles}
      {head}
      {list}
      <p className="mt-0.5 min-h-[18px] text-ui-small font-semibold leading-[18px] text-ink-2">{more}</p>
      {foot}
    </div>
  );
}
