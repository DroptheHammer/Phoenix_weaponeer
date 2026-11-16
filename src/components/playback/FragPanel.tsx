/**
 * The frag part of the strike editor's strip: the "Warn by" choice (blast
 * radius when the bomb goes off, as DCS works, or the real-world spacing in
 * time), and under the blast rule the warnings and gray notes the playback
 * library gives for the strike as the editor holds it. The spacing rule's
 * warnings are not here: the strip prints them itself, as it always did.
 *
 * Loaded lazily by the desktop entry, the first time a strike of two or more
 * jets is open, because the check builds the playback (the library is far
 * too big for start-up, and the phone never gets it).
 */
import { useMemo } from 'react';
import { FRAG_RULE_LABEL, FRAG_RULE_OPTIONS, FRAG_RULE_TITLES } from '../../lib/playback';
import type { FragRule } from '../../types/strike.types';
import { editorBurstReadout, type EditorBurst } from './fragEditor';
import { BLAST_CHECK_FAILED } from './launch';
import type { FragPanelProps } from './types';

export default function FragPanel({ args, rule, onRule }: FragPanelProps) {
  const { mission, drafts, resolved, offsets } = args;
  const times = offsets.join();
  // Rebuilt only when the jets, their times or the rule change; the editor re-renders far more often than that.
  const result = useMemo((): EditorBurst | undefined | 'failed' => {
    if (rule !== 'burst') return undefined;
    try {
      return editorBurstReadout({ ...args, fragRule: rule });
    } catch {
      // A strike the playback cannot build must not take the editor down with it.
      return 'failed';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission, drafts, resolved, times, rule]);

  return (
    <div className="space-y-1">
      <label className="h-5 flex items-center justify-end gap-2 text-xs text-gray-400" title={FRAG_RULE_TITLES[rule]}>
        {FRAG_RULE_LABEL}
        <select
          data-frag-rule
          className="h-5 py-0 px-1 rounded bg-gray-700 border border-gray-600 text-xs text-gray-100"
          style={{ colorScheme: 'dark' }}
          value={rule}
          onChange={(e) => onRule(e.target.value as FragRule)}
        >
          {(Object.keys(FRAG_RULE_OPTIONS) as FragRule[]).map((r) => (
            <option key={r} value={r}>{FRAG_RULE_OPTIONS[r]}</option>
          ))}
        </select>
      </label>
      {result === 'failed' ? (
        <div className="text-xs text-amber-300">{BLAST_CHECK_FAILED}</div>
      ) : (
        result && (
          <>
            {result.warnings.map((w, i) => (
              <div key={w} className="text-xs text-amber-300" title={result.titles[i]}>⚠ {w}</div>
            ))}
            {result.notes.map((n) => (
              <div key={n} className="text-xs text-gray-400">{n}</div>
            ))}
          </>
        )
      )}
    </div>
  );
}
