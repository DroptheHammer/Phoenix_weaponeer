import { leaderLine, type PlacedLabel } from '../../lib/labelLayout';

/**
 * The attack-picture labels `AttackLabelLayer` placed, drawn as plain HTML over
 * the map (outside `MapContainer`, like the legend). Shared by the main map and
 * the attack editor's preview map.
 */
export function PlacedLabelsOverlay({ labels }: { labels: PlacedLabel[] }) {
  return (
    <div className="absolute inset-0 z-[900] pointer-events-none">
      <svg className="absolute inset-0 w-full h-full">
        {labels
          .filter((l) => l.leader)
          .map((l, i) => {
            const line = leaderLine(l);
            if (!line) return null;
            const [[x1, y1], [x2, y2]] = [line.from, line.to];
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#374151" strokeWidth={1} />;
          })}
      </svg>
      {labels.map((l, i) => (
        <div
          key={i}
          className="absolute rounded text-xs font-semibold px-1.5 py-1 shadow-lg leading-tight whitespace-nowrap"
          style={{
            left: l.rect.x,
            top: l.rect.y,
            background: l.style?.bg ?? '#ffffff',
            color: l.style?.fg ?? '#111827',
            border: `1px solid ${l.style?.border ?? '#374151'}`,
          }}
        >
          {l.lines.map((line, j) => (
            <div key={j}>{line}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
