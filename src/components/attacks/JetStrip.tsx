import { useEffect, useRef } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';

/**
 * One colour per jet in a strike, the same on the tab, the preview map and the
 * readout. Deliberately none of the attack picture's own colours (blue route,
 * red attack, green egress), so a wingman's track never reads as a leg of
 * the selected jet's.
 */
export const JET_COLORS = ['#22d3ee', '#e879f9', '#a3e635', '#fbbf24'];

interface JetStripProps {
  labels: string[];
  /** 'group', or the index of the jet shown. */
  selected: 'group' | number;
  onSelect: (tab: 'group' | number) => void;
  /** Flags a jet that cannot be saved as it stands. */
  blocked: boolean[];
}

/**
 * The tabs over a strike: the Group, then one per jet, lead first.
 *
 * On a phone they are one row of chips that scrolls sideways instead of
 * wrapping, so four callsigns never push the controls down. The chip shown
 * scrolls into view when a swipe changes it.
 */
export function JetStrip({ labels, selected, onSelect, blocked }: JetStripProps) {
  const isPhone = useIsPhone();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPhone) return;
    rowRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [isPhone, selected]);

  const tab = (active: boolean) =>
    `${isPhone ? 'shrink-0 min-h-[44px] px-4 whitespace-nowrap' : 'px-3 py-1.5'} rounded-lg text-sm border transition-colors flex items-center gap-2 ${
      active ? 'bg-dcs-blue border-blue-400 text-white' : 'bg-dcs-dark border-gray-600 text-gray-300 hover:border-gray-400'
    }`;
  return (
    <div ref={rowRef} className={isPhone ? 'flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar' : 'flex flex-wrap gap-2 mb-3'}>
      <button type="button" className={tab(selected === 'group')} onClick={() => onSelect('group')} aria-pressed={selected === 'group'}>
        Group
      </button>
      {labels.map((text, i) => (
        <button key={i} type="button" className={tab(selected === i)} onClick={() => onSelect(i)} aria-pressed={selected === i}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: JET_COLORS[i % JET_COLORS.length] }} />#{i + 1} {text}
          {blocked[i] && <span className="text-amber-300" title="Cannot be saved yet">⚠</span>}
        </button>
      ))}
    </div>
  );
}
