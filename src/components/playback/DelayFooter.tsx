/**
 * One line under the lanes about the times: the first frag or cone warning the
 * planner's own readout gives for them, in amber, with the rest folded under a
 * "(+n more)" button; or, with none, an all-clear. The warnings are the strike
 * readout's own words (the editor's strip prints the same), so a jet that is
 * not flown still warns here exactly as it does there.
 *
 * It takes one line of height, however many warnings there are: the folded
 * ones open below it and scroll after a few lines.
 */
import { useState } from 'react';
import { FOOTER, FOOTER_MORE, FOOTER_OK, FOOTER_REST, FOOTER_WARN, keepFocus } from './ui';

interface DelayFooterProps {
  /** The readout's warnings at the times now. */
  warnings: readonly string[];
}

export function DelayFooter({ warnings }: DelayFooterProps) {
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
      </div>
      {open && rest.length > 0 && (
        <ul className={FOOTER_REST}>
          {/* By position: two warnings may read the same, and a key must not repeat. */}
          {rest.map((w, i) => <li key={i}>⚠ {w}</li>)}
        </ul>
      )}
    </div>
  );
}
