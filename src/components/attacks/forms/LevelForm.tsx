import type { LevelCCRPProfile } from '../../../types';
import { levelReleaseRange_nm, LEVEL_RUN_IN_NM, resolveEgressHeading } from '../../../lib/attackGeometry';
import { actionPointHeading } from '../../../lib/runIn';
import { KNOB_RANGES } from '../../../lib/customizeKnobs';
import { SliderField } from '../../common/SliderField';
import { ActionPointFields } from './ActionPointFields';
import { FormSection } from './FormSection';

interface LevelFormProps {
  profile: LevelCCRPProfile;
  targetElevation_ft: number;
  onChange: (profile: LevelCCRPProfile) => void;
  /** Bearing IP → target: the route the action point sits on. */
  directBearing_deg?: number;
}

const field = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';
const ranges = KNOB_RANGES.level_ccrp;

/** The numbers behind a level delivery. Altitude is MSL — what the pilot reads. */
export function LevelForm({ profile, targetElevation_ft, onChange, directBearing_deg }: LevelFormProps) {
  const joinRangeOf = (p: LevelCCRPProfile) =>
    levelReleaseRange_nm(Math.max((p.releaseAltitude_ft ?? 0) - targetElevation_ft, 0), p.releaseSpeed_ktas ?? 0) + LEVEL_RUN_IN_NM;
  const withHeading = (next: LevelCCRPProfile): LevelCCRPProfile => {
    const heading = actionPointHeading(next, directBearing_deg, joinRangeOf(next));
    return heading != null ? { ...next, ingressHeading_deg: heading } : next;
  };
  const set = (key: keyof LevelCCRPProfile) => (v: number | undefined) => onChange(withHeading({ ...profile, [key]: v }));
  const joinRange_nm = joinRangeOf(profile);
  const computedHeading = actionPointHeading(profile, directBearing_deg, joinRange_nm);
  const heading = profile.ingressHeading_deg != null ? Math.round(profile.ingressHeading_deg) : undefined;

  const agl = Math.round((profile.releaseAltitude_ft ?? 0) - targetElevation_ft);

  return (
    <div className="space-y-4">
      <FormSection title="Run-in">
        <SliderField
          label="Attack heading"
          range={ranges.ingressHeading_deg}
          value={heading}
          autoValue={computedHeading}
          isAuto={computedHeading != null && heading === Math.round(computedHeading)}
          onAuto={() => onChange(withHeading(profile))}
          onChange={(v) => onChange({ ...profile, ingressHeading_deg: v })}
        />
        <ActionPointFields
          profileType="level_ccrp"
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
      </FormSection>

      <FormSection title="Release">
        <SliderField
          label="Release altitude (ft MSL)"
          range={ranges.releaseAltitude_ft}
          value={profile.releaseAltitude_ft}
          onChange={set('releaseAltitude_ft')}
          hint={`${agl.toLocaleString()} ft above the target`}
        />
        <SliderField label="Release speed (KTAS)" range={ranges.releaseSpeed_ktas} value={profile.releaseSpeed_ktas} onChange={set('releaseSpeed_ktas')} />
      </FormSection>

      <FormSection title="Egress">
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
        <SliderField
          label="Egress heading"
          range={ranges.egressHeading_deg}
          value={profile.egressHeading_deg}
          autoValue={Math.round(resolveEgressHeading({ ...profile, egressHeading_deg: undefined }, profile.ingressHeading_deg))}
          onAuto={() => set('egressHeading_deg')(undefined)}
          onChange={set('egressHeading_deg')}
        />
      </FormSection>
    </div>
  );
}
