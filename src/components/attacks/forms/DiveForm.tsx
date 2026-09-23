import type { DiveCCIPProfile } from '../../../types';
import { resolveEgressHeading, diveGroundRange_nm } from '../../../lib/attackGeometry';
import { actionPointHeading } from '../../../lib/runIn';
import { KNOB_RANGES } from '../../../lib/customizeKnobs';
import { SliderField } from '../../common/SliderField';
import { ActionPointFields } from './ActionPointFields';
import { FormSection } from './FormSection';

interface DiveFormProps {
  profile: DiveCCIPProfile;
  onChange: (profile: DiveCCIPProfile) => void;
  /** Bearing IP → target: the route the action point sits on. */
  directBearing_deg?: number;
}

const field = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';
const ranges = KNOB_RANGES.dive_ccip;

/** The numbers behind a dive delivery, for planners who want to change them. */
export function DiveForm({ profile, onChange, directBearing_deg }: DiveFormProps) {
  // The attack heading follows from the action point, check turn and roll-in
  // range, so any change re-derives it while the geometry closes.
  const withHeading = (next: DiveCCIPProfile): DiveCCIPProfile => {
    const heading = actionPointHeading(next, directBearing_deg, diveGroundRange_nm(next.rollInAltitude_ft, next.diveAngle_deg));
    return heading != null ? { ...next, ingressHeading_deg: heading } : next;
  };
  const set = (key: keyof DiveCCIPProfile) => (v: number | undefined) => onChange(withHeading({ ...profile, [key]: v }));
  const joinRange_nm = diveGroundRange_nm(profile.rollInAltitude_ft, profile.diveAngle_deg);
  const computedHeading = actionPointHeading(profile, directBearing_deg, joinRange_nm);
  const heading = profile.ingressHeading_deg != null ? Math.round(profile.ingressHeading_deg) : undefined;

  return (
    <div className="space-y-4">
      <FormSection title="Run-in">
        <SliderField
          label="Attack heading"
          range={ranges.ingressHeading_deg}
          value={heading}
          autoValue={computedHeading}
          // Auto: the heading the geometry below produces. Dragging overrides it
          // until the next change to the geometry re-derives it.
          isAuto={computedHeading != null && heading === Math.round(computedHeading)}
          onAuto={() => onChange(withHeading(profile))}
          onChange={(v) => onChange({ ...profile, ingressHeading_deg: v })}
        />
        <ActionPointFields
          profileType="dive_ccip"
          value={{ actionRange_nm: profile.actionRange_nm, offsetTurn_deg: profile.offsetAngle_deg, side: profile.offsetDirection }}
          joinLabel="roll in"
          joinRange_nm={joinRange_nm}
          attackHeading={computedHeading}
          directBearing_deg={directBearing_deg}
          onChange={(v) => onChange(withHeading({ ...profile, actionRange_nm: v.actionRange_nm, offsetAngle_deg: v.offsetTurn_deg, offsetDirection: v.side }))}
        />
        <SliderField
          label="Ingress altitude (ft AGL)"
          range={ranges.ingressAltitude_ft}
          value={profile.ingressAltitude_ft}
          autoValue={profile.rollInAltitude_ft}
          onAuto={() => set('ingressAltitude_ft')(undefined)}
          onChange={set('ingressAltitude_ft')}
        />
      </FormSection>

      <FormSection title="Dive">
        <SliderField label="Roll-in altitude (ft AGL)" range={ranges.rollInAltitude_ft} value={profile.rollInAltitude_ft} onChange={set('rollInAltitude_ft')} />
        <SliderField label="Dive angle" range={ranges.diveAngle_deg} value={profile.diveAngle_deg} onChange={set('diveAngle_deg')} />
        <SliderField label="Release altitude (ft AGL)" range={ranges.releaseAltitude_ft} value={profile.releaseAltitude_ft} onChange={set('releaseAltitude_ft')} />
        <SliderField label="Release speed (KTAS)" range={ranges.releaseSpeed_ktas} value={profile.releaseSpeed_ktas} onChange={set('releaseSpeed_ktas')} />
        <SliderField label="Pull-out" range={ranges.pulloutG} value={profile.pulloutG} onChange={set('pulloutG')} />
      </FormSection>

      <FormSection title="Egress">
        <div>
          <label className={label}>Egress</label>
          <select
            className={field}
            style={{ colorScheme: 'dark' }}
            value={profile.egressDirection}
            onChange={(e) => onChange({ ...profile, egressDirection: e.target.value as DiveCCIPProfile['egressDirection'] })}
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
