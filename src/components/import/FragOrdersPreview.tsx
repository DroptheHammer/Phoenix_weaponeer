import { useEffect, useMemo, useRef, useState } from 'react';
import type { FragOrdersData } from '../../types';
import { useUiStore } from '../../stores/uiStore';
import { useProfileStore } from '../../stores/profileStore';
import { importThreatView } from '../../lib/threatVisibility';
import { filterChoices, flightChoices, type FlightChoice } from '../../lib/landing/flightChoices';
import { jetCardsFromGroup } from '../../lib/landing/jetCards';
import { Modal } from '../common/Modal';
import { Button } from '../ui/Button';
import { GroupLabel } from '../ui/Panel';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { cx } from '../ui/cx';
import { JetCard } from '../landing/JetCard';
import { W } from '../landing/words';

/**
 * "Choose your flight", the import's second step: a dialog on the desktop, a bottom sheet with two views (the list
 * of flights, then the chosen flight's jets) on a phone. Every player flight, grouped by aircraft, with a filter;
 * the chosen flight's jets in the same cards the Flight overview uses; Import hands the group's index to App, which
 * commits it through importFromFragOrders. It lists no threats. What it says about them comes from
 * importThreatView, which works from the threats this planner may see, so a mission whose threats the author hid
 * reads exactly like one with none.
 */

interface Props {
  data: FragOrdersData;
  aircraft: ReadonlyArray<{ id: string; name: string }>;
  onBack: () => void;
  onImport: (groupIndex: number) => void;
  phone: boolean;
  /**
   * True while App's "Unsaved changes" dialog stands over this step (Import was pressed with unsaved work). The
   * step stays mounted, so Cancel there comes back to it, but takes no keys: Escape belongs to that dialog. On a
   * phone the sheet is not a Modal, so it switches its own Escape off and hides itself from screen readers. On the
   * desktop the dialog is a Modal, which already ignores Escape while another dialog is on top of it.
   */
  suspended?: boolean;
}

export function FragOrdersPreview({ data, aircraft, onBack, onImport, phone, suspended = false }: Props) {
  const reveal = useUiStore((s) => s.revealHidden);
  const profiles = useProfileStore((s) => s.profiles);
  const profilesLoaded = useProfileStore((s) => s.loaded);
  const types = useMemo(
    () => flightChoices(data.player_groups, aircraft, profilesLoaded ? new Set(profiles.map((p) => p.aircraftId)) : null),
    [data, aircraft, profiles, profilesLoaded],
  );
  const all = useMemo(() => types.flatMap((t) => t.flights), [types]);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<number>(all[0]?.index ?? -1);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const shownTypes = useMemo(() => filterChoices(types, query), [types, query]);
  const shown = useMemo(() => shownTypes.flatMap((t) => t.flights), [shownTypes]);
  const chosenFlight = all.find((f) => f.index === chosen) ?? null;
  const chosenHidden = !!chosenFlight && !shown.some((f) => f.index === chosen);

  // Desktop: a chosen flight is never left behind the filter, so Tab and Import always act on a row you can see.
  // A phone keeps the choice and says so ("Chosen: Venom 1 (hidden by the filter)"), since its jets are on a view of their own.
  useEffect(() => {
    if (!phone && chosenHidden && shown.length > 0) setChosen(shown[0].index);
  }, [phone, chosenHidden, shown]);

  // Every word about threats comes from the view of the threats this planner may see.
  const threatView = importThreatView(data, reveal);
  const warnings = [
    ...(threatView.unidentified > 0 ? [W.unmatched(threatView.unidentified, threatView.unmatchedTypes.join(', '))] : []),
    ...data.warnings,
  ];
  const eyebrow = [data.source?.title, data.theater_display_name].filter(Boolean).join(' · ');
  const canImport = chosenFlight !== null && (phone || !chosenHidden);
  const importLabel = chosenFlight && canImport ? W.importFlight(chosenFlight.label) : W.importNone;

  const notices = (
    <>
      {!data.projection_verified && (
        <div className="flex items-start gap-2 rounded-ui-sm bg-tint-1 px-3 py-2 text-ui-small text-warn">
          <Icon name="warn" size="sm" className="mt-0.5" />
          <span><strong className="font-bold">{W.unverifiedTitle(data.theater_display_name)}</strong> {W.unverifiedBody}</span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="grid gap-1 rounded-ui-sm bg-tint-1 px-3 py-2 text-ui-small text-warn">
          <p className="flex items-center gap-2 font-bold"><Icon name="warn" size="sm" />{W.warningsTitle(warnings.length)}</p>
          <ul className="list-disc pl-9">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      {threatView.notices.map((n, i) => (
        <p key={i} className="flex items-start gap-2 rounded-ui-sm bg-info-soft px-3 py-2 text-ui-small font-medium text-ink"><Icon name="info" size="sm" className="mt-0.5 text-info" />{n}</p>
      ))}
    </>
  );

  // The phone keyboard. While the filter has focus it covers the bottom of the page, the pinned Import button with
  // it, so the sheet's bottom edge is lifted by the keyboard's height, read from the visual viewport. The sheet
  // gets shorter and its foot sits just above the keys. Enter ("search") puts the keyboard away. Whether the
  // sheet is suspended does not matter here, so the lift is the same when "Unsaved changes" is answered Cancel.
  const filterInput = useRef<HTMLInputElement>(null);
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport;
    const input = filterInput.current;
    if (!phone || !vv || !input) return;
    const sync = () => {
      const up = document.activeElement === input ? Math.round(window.innerHeight - vv.height - vv.offsetTop) : 0;
      setKeyboard(up > 80 ? up : 0); // a keyboard is taller than the browser's own bars changing
    };
    const timers: number[] = [];
    const onFocus = () => { timers.push(window.setTimeout(sync, 60), window.setTimeout(sync, 400)); };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', sync);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      input.removeEventListener('focus', onFocus);
      input.removeEventListener('blur', sync);
      setKeyboard(0); // a sheet left with the keyboard up must not come back lifted
    };
  }, [phone, view]);

  const filter = (
    <div className={cx('flex min-h-tap items-center gap-2 rounded-ui-md border border-control bg-surface-deep pl-3 pr-1 focus-within:border-info focus-within:shadow-[0_0_0_2px_var(--c-sky)]', phone && 'min-h-14 rounded-ui-lg pl-4')}>
      <Icon name="search" className="text-ink-3" />
      <input
        ref={filterInput}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Escape first clears what was typed; only an empty filter lets it through to close the step.
          if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder={W.filterPlaceholder}
        aria-label={W.filterPlaceholder}
        aria-controls="flight-list"
        autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="search" enterKeyHint="search"
        className={cx('h-tap min-w-0 flex-1 border-0 bg-transparent p-0 text-ink placeholder:text-ink-3 focus:outline-none', phone ? 'text-[16px]' : 'text-ui-body')}
      />
      {query && <IconButton icon="close" size="sm" label={W.filterClear} onClick={() => setQuery('')} />}
    </div>
  );

  const row = (f: FlightChoice) => (
    <li key={f.index}>
      <label className={cx('flex cursor-pointer items-center gap-3 transition-colors duration-fast motion-reduce:transition-none', phone ? 'min-h-12 px-4 py-1' : 'min-h-tap px-3 hover:bg-tint-2', f.index === chosen && 'bg-accent-soft')}>
        <input
          type="radio"
          name="flight-group"
          checked={f.index === chosen}
          onChange={() => setChosen(f.index)}
          // On a phone, tapping a flight (a click with a pointer, not the keyboard's arrow keys) opens its jets.
          onClick={(e) => { if (phone && (e.detail > 0)) setView('detail'); }}
          onKeyDown={(e) => { if (phone && e.key === 'Enter') { e.preventDefault(); setView('detail'); } }}
          className={cx('m-0 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-control checked:border-accent checked:bg-accent checked:shadow-[inset_0_0_0_3px_var(--c-deep)]', phone ? 'size-[22px]' : 'size-5')}
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="text-ui-body font-semibold text-ink">{f.label}</span>
          <span className="text-ui-small text-ink-2">{W.flightRow(f.jets)}</span>
        </span>
      </label>
    </li>
  );

  const list = (
    <div id="flight-list" role="radiogroup" aria-label="Player flights" className={cx(!phone && 'min-h-0 min-w-0 overflow-y-auto pb-1 pl-0.5 pr-1 pt-0.5 max-[899px]:overflow-visible')}>
      {shownTypes.map((t) => (
        <div key={t.aircraftId} role="group" aria-label={t.aircraftName} className={cx(phone ? 'mb-4' : 'mb-3')}>
          <GroupLabel note={W.typeNote(t.flights.length, t.hasProfiles)}>{t.aircraftName}</GroupLabel>
          <ul className="divide-y divide-line overflow-hidden rounded-ui-lg border border-line bg-tint-1">{t.flights.map(row)}</ul>
        </div>
      ))}
      {shown.length === 0 && (
        <div className={cx('grid justify-items-start gap-1 text-ui-small text-ink-2', phone ? 'rounded-ui-md border border-dashed border-control p-4' : 'p-3')}>
          <p className={phone ? 'text-ui-body font-semibold text-ink' : ''}>{W.noMatch(query.trim())}</p>
          {phone && <p>{W.noMatchHint}</p>}
          {phone && chosenFlight && <p>{W.chosenHidden(chosenFlight.label)}</p>}
          <Button variant="text" onClick={() => setQuery('')}>{W.filterClear}</Button>
        </div>
      )}
      {data.player_groups.length === 0 && <p className="p-3 text-ui-small text-warn">{W.noGroups}</p>}
    </div>
  );

  // The right-hand side on the desktop always carries the warnings, even when the mission has no flight to show,
  // so a planner who sees an empty list can read why.
  const group = chosenFlight ? data.player_groups[chosenFlight.index] : null;
  const detail = (
    <div className={cx('grid content-start gap-3', !phone && 'min-h-0 min-w-0 overflow-y-auto pb-1 pr-1 max-[899px]:overflow-visible')}>
      {!phone && notices}
      {group && chosenFlight && (
        <>
          <GroupLabel note={W.jetsNote(chosenFlight.label, chosenFlight.jets, chosenFlight.aircraftName)}>{W.jetsTitle}</GroupLabel>
          {chosenFlight.hasProfiles === false && (
            <p className="flex items-start gap-2 rounded-ui-sm bg-info-soft px-3 py-2 text-ui-small font-medium text-ink"><Icon name="info" size="sm" className="mt-0.5 text-info" /><span><strong className="font-bold">{W.noProfilesStrong}</strong>{W.noProfiles(chosenFlight.aircraftName)}</span></p>
          )}
          {chosenFlight.jets > 4 && <p className="text-ui-small text-ink-2">{W.onlyFour(chosenFlight.jets)}</p>}
          <ul className={cx('grid gap-3', phone ? 'grid-cols-1' : 'grid-cols-2 max-[899px]:grid-cols-1')}>
            {jetCardsFromGroup(group).map((j) => <li key={j.key} className="grid min-w-0"><JetCard jet={j} nested phone={phone} /></li>)}
          </ul>
        </>
      )}
    </div>
  );

  const back = () => (phone && view === 'detail' ? setView('list') : onBack());
  const footer = (
    <>
      <Button variant="quiet" size={phone ? 'lg' : 'md'} icon="chev-left" onClick={back} aria-label={phone && view === 'detail' ? W.backToList : undefined}>{W.back}</Button>
      <Button variant="primary" size={phone ? 'lg' : 'md'} disabled={!canImport} onClick={() => chosenFlight && onImport(chosenFlight.index)} className={phone ? 'min-w-0 flex-1' : undefined}>{importLabel}</Button>
    </>
  );

  // The phone's Back closes the sheet from the list, and steps back from a flight's jets to the list.
  const sheetBody = useRef<HTMLDivElement>(null);
  useEffect(() => { sheetBody.current?.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => {
    if (!phone || suspended) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') back(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (phone) {
    return (
      <div className="fixed inset-0 z-[2000] flex flex-col justify-end bg-scrim" style={keyboard ? { bottom: keyboard } : undefined}>
        <div role="dialog" aria-modal="true" aria-label={W.chooseTitle} aria-hidden={suspended || undefined} className="flex h-[calc(100%-var(--safe-top)-1.5rem)] min-h-0 flex-col rounded-t-ui-xl border border-b-0 border-line-strong bg-surface-navy text-ink shadow-ui-2">
          <div className="flex shrink-0 items-start justify-between gap-3 pb-3 pl-5 pr-2 pt-4">
            <div className="grid min-w-0 gap-0.5 pt-2">
              {eyebrow && <p className="text-ui-caption font-semibold uppercase tracking-label text-ink-3">{eyebrow}</p>}
              <h2 className="text-ui-headline font-bold leading-ui-tight tracking-title">{W.chooseTitle}</h2>
              <p className="text-ui-body text-ink-2">{W.chooseDesc}</p>
            </div>
            <IconButton icon="close" label={W.chooseClose} onClick={onBack} />
          </div>
          <div ref={sheetBody} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1 [scroll-padding-top:80px]">
            {view === 'list' ? (
              <>
                <div className="sticky top-0 z-[2] -mx-4 bg-surface-navy px-4 py-2 shadow-[0_1px_0_var(--c-line)]">{filter}</div>
                {notices}
                <div className="mx-1 flex flex-wrap items-baseline justify-between gap-x-3 text-ui-small text-ink-2">
                  <p role="status" aria-live="polite">{W.flightCount(shown.length, all.length)}</p>
                  <p>{W.tapHint}</p>
                </div>
                {list}
              </>
            ) : (
              detail
            )}
          </div>
          <div className={cx('flex shrink-0 gap-3 border-t border-line bg-surface-deep pt-3', keyboard ? 'pb-3' : 'pb-[calc(0.75rem+var(--safe-bottom))]', 'pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))]')}>{footer}</div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      title={W.chooseTitle}
      eyebrow={eyebrow || undefined}
      description={W.chooseDesc}
      onClose={onBack}
      widthClass="w-[min(980px,calc(100vw-48px))]"
      heightClass="h-[min(700px,calc(100vh-48px))]"
      scrollBody={false}
      footer={footer}
    >
      {/* Two columns that scroll on their own. Narrower than 900 px they stack, and the whole body scrolls instead:
          each part then takes the height of its content, so no list is squeezed into a small scroller of its own. */}
      <div className="grid h-full min-h-0 grid-cols-[minmax(260px,330px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-5 max-[899px]:block max-[899px]:space-y-5 max-[899px]:overflow-y-auto">
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 max-[899px]:grid-rows-none">
          {filter}
          <p role="status" className="mx-1 text-ui-small font-semibold text-ink-2">{W.flightCount(shown.length, all.length)}</p>
          {list}
        </div>
        {detail}
      </div>
    </Modal>
  );
}
