import type { JetCardModel } from '../../lib/landing/jetCards';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Panel } from '../ui/Panel';
import { cx } from '../ui/cx';
import { W } from './words';

/**
 * One jet: number, callsign and role; QTY then STORE, one store a line, the
 * quantities in mono and in their own colour (--c-qty, used for nothing else);
 * on the Flight overview a foot with the attack. The "Choose your flight" step
 * draws the same card without the foot, on the dialog's surface (`nested`).
 */
export function JetCard({ jet, nested = false, phone = false }: { jet: JetCardModel; nested?: boolean; phone?: boolean }) {
  const nameId = `jet-${jet.key}-name`;
  const body = (
    <>
      <div className={cx('flex flex-wrap items-center gap-x-2.5 gap-y-0.5 border-b border-line', phone ? 'min-h-11 px-4 py-1.5' : 'min-h-9 px-3 tall:min-h-11')}>
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-tile text-ui-caption font-bold leading-none">
          {jet.position}
        </span>
        <h3 id={nameId} className={cx('whitespace-nowrap font-bold leading-tight', phone ? 'text-ui-lead' : 'text-ui-body')}>
          {jet.callsign}
        </h3>
        <p className="whitespace-nowrap text-ui-small text-ink-2">{jet.role}</p>
      </div>
      <div className={cx('min-w-0', phone ? 'px-4 pb-3 pt-2.5' : 'px-3 pb-2 pt-1.5 tall:pb-3 tall:pt-2.5')}>
        <table className="w-full border-collapse">
          <caption className="sr-only">{W.quantityCaption(jet.callsign)}</caption>
          <thead>
            <tr>
              <th scope="col" className={cx('w-[1%] whitespace-nowrap pb-1 text-right text-ui-caption font-semibold uppercase leading-4 tracking-label text-ink-3', phone ? 'pr-4' : 'pr-3 tall:pb-1.5')}>
                {W.qty}
              </th>
              <th scope="col" className={cx('pb-1 text-left text-ui-caption font-semibold uppercase leading-4 tracking-label text-ink-3', !phone && 'tall:pb-1.5')}>
                {W.store}
              </th>
            </tr>
          </thead>
          <tbody className={cx(phone ? 'text-ui-body' : 'text-ui-small leading-[19px] tall:leading-6')}>
            {jet.stores.length === 0 ? (
              <tr>
                <td className={cx('w-[1%] whitespace-nowrap p-0 text-right align-top text-ink-2', phone ? 'pr-4' : 'pr-3')}>
                  <span aria-hidden="true">—</span>
                </td>
                <td className="p-0 align-top italic text-ink-2">{W.noStores}</td>
              </tr>
            ) : (
              jet.stores.map((s, i) => {
                const flagged = s.known === false;
                return (
                  <tr key={i}>
                    <td className={cx('w-[1%] whitespace-nowrap p-0 text-right align-top font-mono font-medium', phone ? 'pr-4 pt-0.5' : 'pr-3', flagged ? 'text-warn' : 'text-qty')}>
                      {s.quantity}
                    </td>
                    <td className={cx('p-0 align-top [overflow-wrap:anywhere]', phone && 'pt-0.5', flagged ? 'text-warn' : 'text-ink')}>
                      {s.name}
                      {flagged && (
                        <span className="flex items-center gap-1.5 text-ui-caption font-medium leading-4">
                          <Icon name="warn" size="sm" />
                          {W.notInTable}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {jet.foot && (
        <div className={cx('mt-auto grid border-t border-line bg-shade', phone ? 'gap-2 px-4 py-2.5' : 'gap-0.5 px-3 py-2 tall:gap-1 tall:py-3')}>
          <p className="flex min-h-[22px] items-center gap-2 tall:min-h-[26px]">
            <span className="w-14 shrink-0 text-ui-caption font-semibold uppercase tracking-label text-ink-3">{W.attack}</span>
            {jet.foot.state === 'planned' ? (
              <Chip tone="ok" icon="check">{W.planned}</Chip>
            ) : jet.foot.state === 'none' ? (
              <Chip tone="none" icon="dash-ring">{W.noAttack}</Chip>
            ) : (
              <Chip tone="none" icon="minus">{W.noAG}</Chip>
            )}
          </p>
          {jet.foot.state === 'planned' ? (
            <p className="flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-0.5 text-ui-small text-ink-2 tall:min-h-5">
              <span>
                <span className="font-mono text-ui-caption text-ink">{jet.foot.lead}</span>
                {jet.foot.profile ? ` · ${jet.foot.profile}` : ''}
                {jet.foot.more > 0 ? ` · ${W.moreAttacks(jet.foot.more)}` : ''}
              </span>
              {jet.foot.estimated && <Chip tone="estimated">{W.estimated}</Chip>}
            </p>
          ) : jet.foot.state === 'none' ? (
            <p className="min-h-[18px] text-ui-small text-ink-2 tall:min-h-5">{W.noAttackYet}</p>
          ) : null}
        </div>
      )}
    </>
  );
  return nested ? (
    <Panel as="article" tone="group" nested divided={false} aria-labelledby={nameId} className="flex min-w-0 flex-col">
      {body}
    </Panel>
  ) : (
    <Card as="article" aria-labelledby={nameId}>
      {body}
    </Card>
  );
}
