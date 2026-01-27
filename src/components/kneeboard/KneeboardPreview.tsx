import type { KneeboardCard } from '../../types';

interface KneeboardPreviewProps {
  card?: KneeboardCard;
}

export function KneeboardPreview({ card }: KneeboardPreviewProps) {
  if (!card) {
    return (
      <div className="text-gray-400 text-center py-8">
        Select an attack to preview its kneeboard card.
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div
        className="bg-amber-50 text-gray-900 shadow-lg"
        style={{
          width: '384px', // Half of 768px for preview
          height: '512px', // Half of 1024px
          fontSize: '8px',
        }}
      >
        {/* Header */}
        <div className="bg-gray-700 text-white px-2 py-1 flex justify-between items-center">
          <span className="font-bold">{card.header.callsign}</span>
          <span>{card.header.missionDate}</span>
          <span className="font-bold">{card.header.targetName}</span>
        </div>

        {/* Target Section */}
        <div className="border-b border-gray-300 px-2 py-1">
          <div className="font-bold text-xs">TARGET</div>
          <div>{card.targetSection.name}</div>
          <div className="font-mono text-xs">{card.targetSection.coordinates}</div>
          <div>Elev: {card.targetSection.elevation_ft} ft MSL</div>
        </div>

        {/* Threats Section */}
        <div className="border-b border-gray-300 px-2 py-1">
          <div className="font-bold text-xs">THREATS</div>
          {card.threatSection.threats.length > 0 ? (
            card.threatSection.threats.map((threat, i) => (
              <div key={i} className="flex justify-between">
                <span>{threat.name}</span>
                <span>
                  {threat.bearing_deg}° / {threat.distance_nm.toFixed(1)} nm
                </span>
              </div>
            ))
          ) : (
            <div className="text-gray-500">No threats in area</div>
          )}
        </div>

        {/* Attack Section */}
        <div className="border-b border-gray-300 px-2 py-1">
          <div className="font-bold text-xs">ATTACK: {card.attackSection.profileType}</div>
          {Object.entries(card.attackSection.parameters).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span>{key}:</span>
              <span className="font-mono">{value}</span>
            </div>
          ))}
        </div>

        {/* Weapon Section */}
        <div className="border-b border-gray-300 px-2 py-1">
          <div className="font-bold text-xs">WEAPON</div>
          <div>
            {card.weaponSection.weaponName} × {card.weaponSection.quantity}
          </div>
          <div>Fuze: {card.weaponSection.fuze}</div>
          <div>Mode: {card.weaponSection.releaseMode}</div>
          {card.weaponSection.minSafeAlt_ft && (
            <div className="text-red-600 font-bold">
              MIN SAFE: {card.weaponSection.minSafeAlt_ft} ft AGL
            </div>
          )}
        </div>

        {/* Egress Section */}
        <div className="px-2 py-1">
          <div className="font-bold text-xs">EGRESS</div>
          <div>
            {card.egressSection.direction} - HDG {card.egressSection.heading_deg}°
          </div>
          {card.egressSection.fenceOutWaypoint && (
            <div>Fence Out: {card.egressSection.fenceOutWaypoint}</div>
          )}
        </div>
      </div>
    </div>
  );
}
