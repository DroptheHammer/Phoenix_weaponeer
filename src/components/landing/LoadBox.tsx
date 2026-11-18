import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { classifyLoadText } from '../../lib/landing/loadSniff';
import { latestGate, routeLoad, type LoadOutcome, type LoadSource } from '../../lib/landing/loadRouter';
import { chooseFileToLoad, platformLoadDeps, sourceFromFile, subscribeFileDrop } from '../../lib/landing/platformBindings';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/cx';
import { W } from './words';

export interface LoadBoxProps {
  onOutcome: (o: Exclude<LoadOutcome, { kind: 'error' }>) => void;
  phone: boolean;
  web: boolean;
  disabled?: boolean;
  /** The text field, so App can put the cursor in it. */
  fieldRef?: Ref<HTMLInputElement>;
}

/**
 * The one load box: paste a FragOrders link (or the
 * JSON itself), drop or choose a FragOrders .json or a saved mission. The data layer decides which
 * (classifyLoadText, routeLoad) and words every refusal; this only shows it. It never commits: the
 * outcome goes to App, which guards unsaved work at that moment. A newer load makes
 * an older one stale (latestGate), so Cancel just forgets the answer.
 */
export function LoadBox({ onOutcome, phone, web, disabled = false, fieldRef }: LoadBoxProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const gate = useMemo(() => latestGate(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const kind = text.trim() ? classifyLoadText(text) : null;
  const chip = kind?.kind === 'link' ? W.chipLink : kind?.kind === 'fragorders-json' ? W.chipFragJson : kind?.kind === 'saved-mission' ? W.chipSaved : null;
  const hint = refusal ?? (!kind ? (web ? W.hintIdleWeb : W.hintIdleDesktop) : kind.kind === 'link' ? W.hintLink : kind.kind === 'refused' ? W.hintUnknown : W.hintJson);

  const run = async (source: LoadSource | LoadSource[], busyWords: string) => {
    if (disabled) return;
    const token = gate.next();
    setRefusal(null);
    setBusy(busyWords);
    const outcome = await routeLoad(source, platformLoadDeps);
    if (!gate.isLatest(token)) return; // cancelled, or a newer load started
    setBusy(null);
    if (outcome.kind === 'error') setRefusal(outcome.message);
    else onOutcome(outcome);
  };
  const submitText = () => {
    const k = classifyLoadText(text);
    if (k.kind === 'refused') { setRefusal(k.message); return; }
    void run({ kind: 'text', text }, k.kind === 'link' ? W.busyLink : W.busyText);
  };
  const files = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const sources = [...list].map(sourceFromFile);
    void run(sources.length === 1 ? sources[0] : sources, W.busyFile(list[0].name));
  };

  // Choose file. On the desktop the system's own dialog, so a saved mission keeps its path: Save writes back to
  // it and it joins Recent missions, as Open has always done. In the browser a plain file input (no paths there).
  const chooseFile = async () => {
    if (web) { fileInput.current?.click(); return; }
    let source: Awaited<ReturnType<typeof chooseFileToLoad>> = null;
    try {
      source = await chooseFileToLoad();
    } catch (e) {
      // The system dialog itself failed to open: say so in the box rather than doing nothing.
      setRefusal(String(e));
    }
    if (source) void run(source, W.busyFile(source.name));
  };

  // The desktop app's own drop (Tauri hands the dropped files' paths, for the same reason). Only while the front
  // page is up; on the web there is no subscription and the HTML drop below serves.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (web) return;
    let unsubscribe: (() => void) | null = null;
    let gone = false;
    void subscribeFileDrop((e) => {
      if (e.type === 'drop') {
        setOver(false);
        if (e.sources.length) void runRef.current(e.sources.length === 1 ? e.sources[0] : e.sources, W.busyFile(e.sources[0].name));
      } else {
        setOver(e.type === 'over');
      }
    }).then((off) => { if (gone) off(); else unsubscribe = off; });
    return () => { gone = true; unsubscribe?.(); };
  }, [web]);

  const dropHandlers = phone ? {} : {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); depth.current += 1; setOver(true); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (e.dataTransfer.files.length) { files(e.dataTransfer.files); return; }
      const dropped = e.dataTransfer.getData('text/plain').trim();
      if (dropped) { setText(dropped); void run({ kind: 'text', text: dropped }, W.busyText); }
    },
  };

  const errored = refusal !== null;
  return (
    <>
      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); if (!busy) submitText(); }}
        aria-busy={busy ? true : undefined}
        {...dropHandlers}
        className={cx(
          'mt-6 grid w-full max-w-[780px] gap-2 rounded-ui-xl border bg-surface-navy p-2 text-left shadow-ui-2 transition-colors duration-fast motion-reduce:transition-none short:mt-4',
          phone && 'mt-5',
          errored ? 'border-warn' : over ? 'border-info' : 'border-line-strong',
        )}
      >
        <div className={cx('flex min-w-0 items-center gap-3 rounded-ui-lg border border-control bg-surface-deep focus-within:border-info focus-within:shadow-[0_0_0_2px_var(--c-sky)]', phone ? 'min-h-14 py-1 pl-4 pr-3' : 'min-h-16 py-2 pl-5 pr-2 short:min-h-0 short:py-1')}>
          <Icon name={kind && kind.kind !== 'link' && kind.kind !== 'refused' ? 'file' : 'link'} size="lg" className="text-ink-3" />
          <input
            ref={fieldRef}
            type="text"
            value={text}
            readOnly={busy !== null}
            onChange={(e) => { setText(e.target.value); setRefusal(null); }}
            placeholder={W.loadPlaceholder}
            aria-label={W.loadPlaceholder}
            aria-describedby="load-hint"
            aria-invalid={errored || undefined}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            enterKeyHint="go"
            className={cx('h-tap min-w-0 flex-1 border-0 bg-transparent p-0 text-ink placeholder:text-ink-3 focus:outline-none', phone ? 'text-[16px]' : 'text-ui-lead')}
          />
          {chip && !phone && !busy && (
            <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill bg-info-soft py-0.5 pl-2.5 pr-3 text-ui-small font-semibold text-info">{chip}</span>
          )}
          {!phone && (
            <Button type="submit" variant="primary" size="lg" busy={busy !== null} className="min-w-24 shrink-0">{W.loadButton}</Button>
          )}
        </div>
        {chip && phone && !busy && (
          <div className="flex px-1"><span className="inline-flex min-h-7 items-center gap-1.5 rounded-pill bg-info-soft py-0.5 pl-2.5 pr-3 text-ui-small font-semibold text-info">{chip}</span></div>
        )}
        {busy ? (
          <div role="status" aria-live="polite" className="grid gap-3 px-3 pb-1 pt-2">
            <p className="text-ui-body font-semibold text-ink">{busy}</p>
            <Button variant="quiet" onClick={() => { gate.next(); setBusy(null); }} className="justify-self-start">{W.cancel}</Button>
          </div>
        ) : phone ? (
          <div className="grid gap-2">
            <Button type="submit" variant="primary" size="lg">{W.loadButton}</Button>
            <Button variant="tonal" size="lg" icon="folder" onClick={() => void chooseFile()}>{W.chooseFile}</Button>
          </div>
        ) : (
          <div className={cx('flex min-h-[72px] min-w-0 items-center gap-4 rounded-ui-lg border-[1.5px] py-3 pl-5 pr-3 text-ink-2 short:min-h-0 short:py-2', over ? 'border-solid border-info bg-info-soft text-info' : 'border-dashed border-control')}>
            <Icon name="drop" size="lg" />
            <p className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-ui-body font-semibold text-ink">{over ? W.dropOver : W.dropIdle}</span>
              <span className="text-ui-small text-ink-2">{W.dropSub}</span>
            </p>
            <Button variant="tonal" icon="folder" onClick={() => void chooseFile()}>{W.chooseFile}</Button>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          tabIndex={-1}
          aria-label={W.chooseFileLabel}
          className="sr-only"
          onChange={(e) => { files(e.target.files); e.target.value = ''; }}
        />
      </form>
      <p id="load-hint" aria-live="polite" className={cx('mt-3 flex min-h-[18px] min-w-0 items-start justify-center gap-1.5 text-ui-small short:mt-2', errored ? 'text-left font-semibold text-warn' : 'text-ink-2')}>
        {errored && <Icon name="warn" size="sm" className="mt-px" />}
        <span>{hint}</span>
      </p>
    </>
  );
}
