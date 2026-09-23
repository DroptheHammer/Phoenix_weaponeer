import { useEffect, useMemo, useRef, useState } from 'react';
import type { Attack } from '../../types';
import { buildSideProfile } from '../../lib/attackPicture';
import { drawSideProfile } from '../../lib/renderKneeboardCanvas';

interface SideProfileViewProps {
  attack: Attack | undefined;
  targetElevation_ft: number;
}

/**
 * The kneeboard card's side view, drawn live in the attack editor. Same data
 * (`buildSideProfile`) and the same painter (`drawSideProfile`) as the card,
 * so what the planner drags here is what prints.
 */
export function SideProfileView({ attack, targetElevation_ft }: SideProfileViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const side = useMemo(() => (attack ? buildSideProfile(attack, targetElevation_ft) : undefined), [attack, targetElevation_ft]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || size.w === 0 || size.h === 0) return;
    // Sharp on a Retina screen: draw at device pixels, show at CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (side) drawSideProfile(ctx, side, { x: 0, y: 0, w: size.w, h: size.h });
  }, [side, size]);

  return (
    <div ref={wrapRef} className="relative h-full w-full bg-[#F4F4EC]">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size.w, height: size.h }} />
      {!side && <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">No side view for this profile</div>}
    </div>
  );
}
