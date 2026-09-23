import { DEFAULT_ACTION_RANGE_NM, solveOffsetLeg, offsetLegRatioFor, type Side } from '../../../lib/attackGeometry';
import { KNOB_RANGES, type KnobProfileType } from '../../../lib/customizeKnobs';
import { SliderField } from '../../common/SliderField';

export interface ActionPointValue {
  actionRange_nm?: number;
  offsetTurn_deg?: number;
  side?: Side;
  offsetLegRatio?: number;
}

interface ActionPointFieldsProps {
  /** Which profile's slider ranges to use. */
  profileType: KnobProfileType;
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
  /** Level CCRP only: show the offset leg control instead of action point. */
  showLeg?: boolean;
  /** Level CCRP only: release speed for time calculation. */
  speed_ktas?: number;
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
  profileType,
  value,
  joinLabel,
  joinRange_nm,
  attackHeading,
  directBearing_deg,
  onChange,
  fieldClass = defaultField,
  showLeg = false,
  speed_ktas,
}: ActionPointFieldsProps) {
  const enabled = directBearing_deg != null && Number.isFinite(directBearing_deg);
  const set = (patch: ActionPointValue) => onChange({ ...value, ...patch });
  const checkTurn = value.offsetTurn_deg ?? 0;

  // The two knobs are one number seen two ways. Typing the leg makes the leg
  // authoritative (it then rescales with release altitude); typing the action
  // point clears the ratio and pins the miles.
  const setLeg = (ratio: number) => {
    const solved = joinRange_nm != null ? solveOffsetLeg(joinRange_nm, checkTurn, ratio) : undefined;
    set({ offsetLegRatio: ratio, actionRange_nm: solved ? Math.round(solved.actionRange_nm * 10) / 10 : value.actionRange_nm });
  };
  const setActionRange = (nm: number) => set({ actionRange_nm: nm, offsetLegRatio: undefined });

  // Whatever is authoritative, both boxes show a live number.
  const shownRatio =
    value.offsetLegRatio ??
    (joinRange_nm != null && value.actionRange_nm != null ? offsetLegRatioFor(joinRange_nm, checkTurn, value.actionRange_nm) : undefined);
  const solution = showLeg && joinRange_nm != null && shownRatio != null ? solveOffsetLeg(joinRange_nm, checkTurn, shownRatio) : undefined;

  const hint = !enabled
    ? 'Needs a waypoint before the target in the route'
    : attackHeading == null
      ? `Too wide: the leg never comes within ${joinRange_nm?.toFixed(1) ?? '?'} nm — reduce the turn or move the point out`
      : `Route ${fmtHdg(directBearing_deg)} → turn ${value.side ?? 'right'} to ${fmtHdg(directBearing_deg + (value.side === 'left' ? -1 : 1) * (value.offsetTurn_deg ?? 0))}, ${joinLabel} at ${joinRange_nm?.toFixed(1) ?? '?'} nm onto ${fmtHdg(attackHeading)}`;

  // What the defence sees. A fire-control radar has roughly a 40° cone, so the
  // pair has to arrive far enough apart that it must choose one.
  // How far off the direct line this attack arrives, and how long it spends
  // getting there. The azimuth split between two attackers is what the leg is
  // really buying, but it is obvious on the map once two attacks are plotted —
  // printing it here just puzzles someone planning a single ship.
  const legTime_s = solution && speed_ktas ? (solution.legLength_nm / speed_ktas) * 3600 : undefined;
  const legLines = solution
    ? [
        `Leg ${solution.legLength_nm.toFixed(1)} nm (${(Math.round(shownRatio! * 100) / 100).toFixed(2)} × run-in${legTime_s ? `, ${Math.round(legTime_s)} s` : ''}) · axis ${Math.round(solution.axisOffset_deg)}° off the line`,
      ]
    : [];

  // Warn, never block.
  const warnings: string[] = [];
  if (showLeg && joinRange_nm != null && shownRatio != null && !solution) {
    warnings.push(
      `Geometry does not close: the leg never comes back within ${joinRange_nm.toFixed(1)} nm of the target. Shorten the leg or reduce the check turn.`,
    );
  }
  if (solution && solution.axisOffset_deg > 75) {
    warnings.push(
      `Past the beam: the axis has swung ${Math.round(solution.axisOffset_deg)}° off the line — you arrive nearly abeam the target, and a second attack mirrored on the far side would be nose-to-nose with this one.`,
    );
  }
  if (solution && solution.angleOff_deg > 90) {
    warnings.push(`Angle-off ${Math.round(solution.angleOff_deg)}° — past the BEM's indirect-attack threshold (>90°).`);
  }

  const ranges = KNOB_RANGES[profileType];

  return (
    <>
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
      <SliderField
        label="Check turn"
        range={ranges.offsetAngle_deg}
        value={value.offsetTurn_deg}
        disabled={!enabled}
        onChange={(v) => set({ offsetTurn_deg: v })}
      />
      {showLeg && (
        <SliderField
          label="Offset leg (× run-in)"
          range={KNOB_RANGES.level_ccrp.offsetLegRatio}
          value={shownRatio != null ? Math.round(shownRatio * 100) / 100 : undefined}
          disabled={!enabled}
          onChange={setLeg}
        />
      )}
      <SliderField
        label="Action point (nm from target)"
        range={ranges.actionRange_nm}
        value={value.actionRange_nm}
        autoValue={DEFAULT_ACTION_RANGE_NM}
        disabled={!enabled}
        onChange={setActionRange}
      />
      <div className="text-xs text-gray-400">
        <div>{hint}</div>
        {legLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        {warnings.map((line) => (
          <div key={line} className="text-amber-400">
            {line}
          </div>
        ))}
      </div>
    </>
  );
}
