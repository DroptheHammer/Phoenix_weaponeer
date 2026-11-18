import type { Ref } from 'react';
import type { LoadOutcome } from '../../lib/landing/loadRouter';
import type { Mission } from '../../types/mission.types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/cx';
import { LoadBox } from './LoadBox';
import { RecentMissions } from './RecentMissions';
import { W } from './words';

export interface FrontPageProps {
  phone: boolean;
  /** platform.isWeb, passed in: only platformBindings.ts may import @platform (check X1). */
  web: boolean;
  openMission: Mission | null;
  /** The words for work in the open mission not yet saved ("Unsaved changes", "Not exported" in the browser), or nothing: told on the "Open now" card only. */
  openUnsaved?: string;
  onOutcome: (o: Exclude<LoadOutcome, { kind: 'error' }>) => void;
  onContinue: () => void;
  onOpenFile: (path: string) => void;
  onOpenLocal: (id: string) => void;
  onNewMission: () => void;
  /** Web only (it needs the phone's GPS); absent on the desktop. */
  onStrikeNearMe?: () => void;
  aircraft: ReadonlyArray<{ id: string; name: string }>;
  typeOf: Map<string, string>;
  /** While a dialog is open (Choose your flight), the box takes nothing. */
  busy: boolean;
  /** The load field, so the menu's Import (or Load a mission) can put the cursor in it. */
  loadFieldRef?: Ref<HTMLInputElement>;
}

/**
 * The front page: "Load a mission", the one load
 * box, the two quiet secondary actions, recent missions as cards. The threat and aircraft database lists that
 * used to sit here are gone (they are the Add Threat picker's and Settings' business).
 */
export function FrontPage(p: FrontPageProps) {
  const secondary = p.phone ? (
    <ul className="relative mt-5 w-full divide-y divide-line overflow-hidden rounded-ui-lg border border-line">
      {[[W.createNew, 'plus', p.onNewMission], ...(p.onStrikeNearMe ? [[W.strikeNearMe, 'pin', p.onStrikeNearMe]] : [])].map(([label, icon, run]) => (
        <li key={label as string}>
          <button type="button" onClick={run as () => void} className="grid min-h-[52px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 text-left text-ui-body font-semibold text-ink active:bg-tint-2">
            <Icon name={icon as 'plus' | 'pin'} className="text-ink-2" />
            <span>{label as string}</span>
            <Icon name="chev-right" size="sm" className="text-ink-3" />
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <div className="mt-2 flex flex-wrap justify-center gap-2 short:mt-1">
      <Button variant="quiet" icon="plus" onClick={p.onNewMission}>{W.createNew}</Button>
      {p.onStrikeNearMe && <Button variant="quiet" icon="pin" onClick={p.onStrikeNearMe}>{W.strikeNearMe}</Button>}
    </div>
  );
  return (
    <div
      className={cx(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto',
        p.phone ? 'overscroll-contain pb-[calc(var(--safe-bottom)+2rem)] pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] pt-2' : 'px-8 pb-5 pt-4 max-[899px]:px-4 short:py-2',
      )}
    >
      <div className={cx('m-auto grid w-full min-w-0', p.phone ? 'max-w-[560px] gap-8' : 'max-w-[1240px] gap-10 short:gap-6')}>
        <div className="grid min-w-0 justify-items-center text-center">
          <h1 tabIndex={-1} className={cx('font-bold leading-[1.15] tracking-display', p.phone ? 'text-ui-headline' : 'text-ui-display short:text-ui-headline')}>{W.heroTitle}</h1>
          <p className={cx('mt-2 text-ink-2', p.phone ? 'text-ui-body' : 'text-ui-lead short:mt-1 short:text-ui-body')}>{p.phone ? W.heroSubPhone : W.heroSubDesktop}</p>
          <LoadBox onOutcome={p.onOutcome} phone={p.phone} web={p.web} disabled={p.busy} fieldRef={p.loadFieldRef} />
          {secondary}
        </div>
        <RecentMissions
          openMission={p.openMission}
          openUnsaved={p.openUnsaved}
          onContinue={p.onContinue}
          onOpenFile={p.onOpenFile}
          onOpenLocal={p.onOpenLocal}
          aircraft={p.aircraft}
          typeOf={p.typeOf}
          phone={p.phone}
          web={p.web}
        />
      </div>
    </div>
  );
}
