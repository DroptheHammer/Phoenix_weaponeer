import type { LevelCCRPProfile } from '../../../types';
import { levelReleaseRange_nm, LEVEL_RUN_IN_NM } from '../../../lib/attackGeometry';
import { actionPointHeading } from '../../../lib/runIn';
import { ActionPointFields } from './ActionPointFields';

interface LevelFormProps {
  profile: LevelCCRPProfile;
  targetElevation_ft: number;
  onChange: (profile: LevelCCRPProfile) => void;
  /** Bearing IP → target: the route the action point sits on. */
  directBearing_deg?: number;
}

const field = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';

/** The numbers behind a level delivery. Altitude is MSL — what the pilot reads. */
export function LevelForm({ profile, targetElevation_ft, onChange, directBearing_deg }: LevelFormProps) {
  const joinRangeOf = (p: LevelCCRPProfile) =>
    levelReleaseRange_nm(Math.max((p.releaseAltitude_ft ?? 0) - targetElevation_ft, 0), p.releaseSpeed_ktas ?? 0) + LEVEL_RUN_IN_NM;
  const withHeading = (next: LevelCCRPProfile): LevelCCRPProfile => {
    const heading = actionPointHeading(next, directBearing_deg, joinRangeOf(next));
    return heading != null ? { ...next, ingressHeading_deg: heading } : next;
  };
  // A cleared optional field goes back to Auto; a cleared required field keeps
  // its last value rather than storing NaN.
  const num = (key: keyof LevelCCRPProfile, optional = false) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) onChange(withHeading({ ...profile, [key]: v }));
    else if (optional) onChange(withHeading({ ...profile, [key]: undefined }));
  };
  const joinRange_nm = joinRangeOf(profile);
  const computedHeading = actionPointHeading(profile, directBearing_deg, joinRange_nm);

  const agl = Math.round((profile.releaseAltitude_ft ?? 0) - targetElevation_ft);

  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className={label}>Attack heading (°)</label>
        <input
          type="number"
          className={field}
          value={profile.ingressHeading_deg != null ? Math.round(profile.ingressHeading_deg) : ''}
          onChange={(e) => {
            // Clearing the override hands the heading back to the geometry.
            const v = parseFloat(e.target.value);
            onChange(Number.isFinite(v) ? { ...profile, ingressHeading_deg: v } : withHeading(profile));
          }}
        />
        <div className="text-xs text-gray-400 mt-1">Set by the geometry below; type to override</div>
      </div>
      <ActionPointFields
        value={{
          actionRange_nm: profile.actionRange_nm,
          offsetTurn_deg: profile.offsetAngle_deg,
          side: profile.offsetDirection,
          offsetLegRatio: profile.offsetLegRatio,
        }}
        joinLabel="run in"
        joinRange_nm={joinRange_nm}
        attackHeading={computedHeading}
        directBearing_deg={directBearing_deg}
        showLeg
        speed_ktas={profile.releaseSpeed_ktas}
        onChange={(v) =>
          onChange(
            withHeading({
              ...profile,
              actionRange_nm: v.actionRange_nm,
              offsetAngle_deg: v.offsetTurn_deg,
              offsetDirection: v.side,
              offsetLegRatio: v.offsetLegRatio,
            }),
          )
        }
      />
      <div>
        <label className={label}>Release altitude (ft MSL)</label>
        <input type="number" className={field} value={profile.releaseAltitude_ft ?? ''} onChange={num('releaseAltitude_ft')} />
        <div className="text-xs text-gray-400 mt-1">{agl.toLocaleString()} ft above the target</div>
      </div>
      <div>
        <label className={label}>Release speed (KTAS)</label>
        <input type="number" className={field} value={profile.releaseSpeed_ktas ?? ''} onChange={num('releaseSpeed_ktas')} />
      </div>
      <div>
        <label className={label}>Egress</label>
        <select
          className={field}
          style={{ colorScheme: 'dark' }}
          value={profile.egressDirection ?? 'straight'}
          onChange={(e) => onChange({ ...profile, egressDirection: e.target.value as LevelCCRPProfile['egressDirection'] })}
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="straight">Straight ahead</option>
        </select>
      </div>
      <div>
        <label className={label}>Egress heading (°)</label>
        <input
          type="number"
          className={field}
          value={profile.egressHeading_deg ?? ''}
          placeholder={`Auto: ${profile.egressDirection && profile.egressDirection !== 'straight' ? `90° ${profile.egressDirection}` : `straight ahead ${Math.round(profile.ingressHeading_deg ?? 0)}°`}`}
          onChange={num('egressHeading_deg', true)}
        />
      </div>
    </div>
  );
}
