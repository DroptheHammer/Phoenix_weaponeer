import { useLayoutEffect, useRef, useState } from 'react';
import { useWakeLock } from '../../hooks/useWakeLock';
import { FullScreenCard } from './FullScreenCard';

interface KneeboardModeProps {
  cards: { key: string; label: string; src?: string }[];
  startIndex: number;
  /** Hands back the card last shown, so the carousel can stay on it. */
  onClose: (index: number) => void;
}

/**
 * The phone as a kneeboard: each card as large as the screen allows, on black,
 * swipe for the next, and the screen kept on until closed.
 */
export function KneeboardMode({ cards, startIndex, onClose }: KneeboardModeProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  useWakeLock(true);

  // Open on the card the planner was looking at.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollLeft = startIndex * scroller.clientWidth;
  }, [startIndex]);

  const onScroll = () => {
    const scroller = scrollerRef.current;
    if (scroller && scroller.clientWidth) setIndex(Math.round(scroller.scrollLeft / scroller.clientWidth));
  };

  const shown = Math.min(cards.length - 1, Math.max(0, index));

  return (
    <FullScreenCard
      label="Kneeboard mode"
      onClose={() => onClose(shown)}
      footer={cards.length > 1 ? `${shown + 1} / ${cards.length}` : undefined}
    >
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory overscroll-x-contain"
        style={{ scrollbarWidth: 'none' }}
      >
        {cards.map((card) => (
          <div
            key={card.key}
            className="w-full h-full shrink-0 snap-center snap-always flex items-center justify-center"
            style={{
              // Clear of the notch and home bar, and of the counter along the bottom.
              padding:
                'env(safe-area-inset-top) env(safe-area-inset-right) calc(env(safe-area-inset-bottom) + 20px) env(safe-area-inset-left)',
            }}
          >
            {card.src ? (
              <img src={card.src} alt={card.label} draggable={false} className="max-w-full max-h-full object-contain" />
            ) : (
              <p className="text-gray-500 text-sm">Drawing card…</p>
            )}
          </div>
        ))}
      </div>
    </FullScreenCard>
  );
}
