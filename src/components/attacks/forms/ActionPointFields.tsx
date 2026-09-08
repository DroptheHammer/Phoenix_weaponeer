import { DEFAULT_ACTION_RANGE_NM, type Side } from '../../../lib/attackGeometry';

export interface ActionPointValue {
  actionRange_nm?: number;
  offsetTurn_deg?: number;
  side?: Side;
}

interface ActionPointFieldsProps {
  value: ActionPointValue;
  /** What the pilot does at the join point — "roll in", "pull down", "run in". */
  joinLabel: string;
  /** Range from the target where that happens, for the hint. */
  joinRange_nm?: number;
  /** The attack heading the geometry produces, for the hint; undefined when it cannot close. */
  attackHeading?: number;
  directBearing_deg?: number;
  onChange: (value: ActionPointValue) => void;
  fieldClass?: string;
}

const defaultField = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';
const fmtHdg = (h: number | undefined) =>
  h != null && Number.isFinite(h) ? `${Math.round(h).toString().padStart(3, '0')}°` : '---';

/**
 * The run-in as a pilot briefs it: fly the route to the action point, turn a
 * round number of degrees left or right, run up the offset leg, then roll in
 * / pull down / run in onto the target. Three Customize fields; the attack
 * heading follows from them and is shown, not typed.
 */
export function ActionPointFields({
  value,
  joinLabel,
  joinRange_nm,
  attackHeading,
  directBearing_deg,
  onChange,
  fieldClass = defaultField,
}: ActionPointFieldsProps) {
  const enabled = directBearing_deg != null && Number.isFinite(directBearing_deg);
  const set = (patch: ActionPointValue) => onChange({ ...value, ...patch });
  const hint = !enabled
    ? 'Needs a waypoint before the target in the route'
    : attackHeading == null
      ? `Too wide: the leg never comes within ${joinRange_nm?.toFixed(1) ?? '?'} nm — reduce the turn or move the point out`
      : `Route ${fmtHdg(directBearing_deg)} → turn ${value.side ?? 'right'} to ${fmtHdg(directBearing_deg + (value.side === 'left' ? -1 : 1) * (value.offsetTurn_deg ?? 0))}, ${joinLabel} at ${joinRange_nm?.toFixed(1) ?? '?'} nm onto ${fmtHdg(attackHeading)}`;

  return (
    <>
      <div>
        <label className={label}>Action point (nm from target)</label>
        <input
          type="number"
          step="0.5"
          min={1}
          className={fieldClass}
          disabled={!enabled}
          value={value.actionRange_nm ?? DEFAULT_ACTION_RANGE_NM}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) set({ actionRange_nm: v });
          }}
        />
      </div>
      <div>
        <label className={label}>Check turn (°)</label>
        <input
          type="number"
          step="5"
          min={0}
          max={90}
          className={fieldClass}
          disabled={!enabled}
          value={value.offsetTurn_deg ?? ''}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) set({ offsetTurn_deg: v });
          }}
        />
      </div>
      <div>
        <label className={label}>Ingress from</label>
        <select
          className={fieldClass}
          style={{ colorScheme: 'dark' }}
          disabled={!enabled}
          value={value.side ?? 'right'}
          onChange={(e) => set({ side: e.target.value as Side })}
        >
          <option value="left">Left — turn left, up the target's left flank, final turn right</option>
          <option value="right">Right — turn right, up the target's right flank, final turn left</option>
        </select>
      </div>
      <div className="col-span-3 text-xs text-gray-400 -mt-2">{hint}</div>
    </>
  );
}
