/**
 * One line under the lanes about the times: the first frag or cone warning the
 * planner's own readout gives for them, in amber, with the rest folded under a
 * "(+n more)" button; or, with none, an all-clear. The warnings are the strike
 * readout's own words (the editor's strip prints the same), so a jet that is
 * not flown still warns here exactly as it does there.
 *
 * At the right end: when the times have been moved off the plan's, a note that
 * they have, then Reset, which puts every one back, and Apply, which writes
 * them to where the plan can keep them. Reset is always there, and Apply
 * whenever playback has somewhere to write the times (a lone attack has not);
 * each is greyed and still while there is nothing to put back or to apply. A
 * strike of one jet has no times to move, and says so.
 *
 * After an Apply, one more line under it says what was done, until the times
 * change again.
 *
 * It takes one line of height, however many warnings there are: the folded
 * ones open below it and scroll after a few lines. The line after an Apply
 * takes one more.
 */
import { useState } from 'react';
import { FOOTER, FOOTER_APPLY, FOOTER_DIRTY, FOOTER_END, FOOTER_MORE, FOOTER_OK, FOOTER_REST, FOOTER_RESET, FOOTER_STATUS, FOOTER_WARN, keepFocus } from './ui';

interface DelayFooterProps {
  /** The readout's warnings at the times now. */
  warnings: readonly string[];
  /** The times are not the plan's. */
  dirty: boolean;
  /** The strike has one member: there is nothing to space. */
  single: boolean;
  /** Reset was pressed. */
  onReset(): void;
  /** The Apply button: its words, and what it does. Left out when there is nowhere to write the times. */
  apply?: { label: string; title: string; onApply(): void };
  /** What the last Apply did, a sentence each; left out until one has, and again once the times change. */
  status?: readonly string[];
}

export function DelayFooter({ warnings, dirty, single, onReset, apply, status }: DelayFooterProps) {
  const [open, setOpen] = useState(false);
  const rest = warnings.slice(1);
  return (
    <div>
      <div className={FOOTER}>
        {warnings.length > 0 ? (
          <span data-footer-warning className={FOOTER_WARN} title={warnings[0]}>⚠ {warnings[0]}</span>
        ) : (
          <span data-footer-ok className={FOOTER_OK}>✓ No frag or cone warnings at these times.</span>
        )}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            onMouseDown={keepFocus}
            aria-expanded={open}
            className={FOOTER_MORE}
            title={open ? 'Fold the other warnings away' : 'Show the other warnings'}
          >
            (+{rest.length} more)
          </button>
        )}
        <div className={FOOTER_END}>
          {single ? (
            <span data-footer-single className={FOOTER_OK}>One jet: nothing to space.</span>
          ) : (
            <>
              {dirty && <span data-footer-dirty className={FOOTER_DIRTY}>Times changed, not applied yet.</span>}
              <button
                type="button"
                data-reset
                // Never `disabled`: a disabled button drops out of the Tab order, and the keyboard should still find it.
                aria-disabled={!dirty}
                onClick={() => {
                  if (dirty) onReset();
                }}
                onMouseDown={keepFocus}
                className={FOOTER_RESET}
                title="Back to the plan's times"
              >
                Reset
              </button>
              {apply && (
                <button
                  type="button"
                  data-apply
                  aria-disabled={!dirty}
                  onClick={() => {
                    if (dirty) apply.onApply();
                  }}
                  onMouseDown={keepFocus}
                  className={FOOTER_APPLY}
                  title={apply.title}
                >
                  {apply.label}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {apply && (
        // There from the start, empty and of no height: a screen reader reads out what appears inside a
        // region it already knows, and often skips one that arrives with its words already in it.
        <div data-apply-live role="status">
          {status && status.length > 0 && (
            // One row: cut short when it is long, the whole of it in the tooltip.
            <div data-apply-status className={FOOTER_STATUS} title={status.join(' ')}>{status.join(' ')}</div>
          )}
        </div>
      )}
      {open && rest.length > 0 && (
        <ul className={FOOTER_REST}>
          {/* By position: two warnings may read the same, and a key must not repeat. */}
          {rest.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
    </div>
  );
}
