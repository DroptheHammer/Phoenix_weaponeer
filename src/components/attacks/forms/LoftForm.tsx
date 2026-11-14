import type { DeliveryModeCode, LoftCCRPProfile } from '../../../types';
import { signedHeadingDelta } from '../../../lib/attackGeometry';
import {
  applyLoftPlan,
  jetRangeAtImpact_nm,
  loftPlanOf,
  resolveLoftEgressHeading,
  DEFAULT_LOFT_G,
  LOFT_FRAG_STANDOFF_NM,
} from '../../../lib/loftPlanning';
import { KNOB_RANGES } from '../../../lib/customizeKnobs';
import { SliderField } from '../../common/SliderField';
import { FormSection } from './FormSection';

interface LoftFormProps {
  profile: LoftCCRPProfile;
  /** LABS only: the F-4E's pull-up timer is shown for it. */
  deliveryMode?: DeliveryModeCode;
  onChange: (profile: LoftCCRPProfile) => void;
  /** Bearing IP → target: a loft runs straight along it. */
  directBearing_deg?: number;
  /** Distance IP → target, for the pull-up timer. */
  ipToTarget_nm?: number;
}

const field = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';
const fmtHdg = (h: number | undefined) =>
  h != null && Number.isFinite(h) ? `${Math.round(h).toString().padStart(3, '0')}°` : '---';
const ft = (v: number) => `${Math.round(v).toLocaleString()} ft`;
const ranges = KNOB_RANGES.loft_ccrp;

/**
 * The numbers behind a loft, for planners who want to change them.
 *
 * A loft runs straight from the IP at the target, so there is no action point
 * or check turn: the pilot states the run-in altitude and speed, the loft angle
 * and the G, and the way out. Everything in the grey panel is derived from
 * those (`applyLoftPlan`) and is what the card prints and the map draws. The
 * model and its sources are in docs/DELIVERY_PLANNING.md, "Loft and LABS".
 */
export function LoftForm({ profile, deliveryMode, onChange, directBearing_deg, ipToTarget_nm }: LoftFormProps) {
  // Every change re-derives the whole plan, so the panel below, the picture and
  // the card cannot disagree.
  const set = (patch: Partial<LoftCCRPProfile>) => onChange(applyLoftPlan({ ...profile, ...patch }, directBearing_deg, ipToTarget_nm));
  const num = (key: 'ingressAltitude_ft' | 'ingressSpeed_ktas' | 'pullUpAngle_deg' | 'pullG') => (v: number) =>
    set({ [key]: v } as Partial<LoftCCRPProfile>);

  // What the plan gives for these inputs, from this IP.
  const derived = applyLoftPlan(profile, directBearing_deg, ipToTarget_nm);
  const plan = loftPlanOf(profile);
  const attackHeading = derived.ingressHeading_deg;
  const egressHeading = resolveLoftEgressHeading(derived, attackHeading);
  const autoEgress = Math.round(resolveLoftEgressHeading({ egressDirection: profile.egressDirection, egressHeading_deg: undefined }, attackHeading));
  const jetRange = jetRangeAtImpact_nm(plan, Math.abs(signedHeadingDelta(attackHeading, egressHeading)));
  const labs = deliveryMode === 'LABS';
  const ipInside = ipToTarget_nm != null && derived.pullUpTimer_s == null;

  return (
    <div className="space-y-4">
      {/* The run-in: straight from the IP, so only the altitude and speed are the pilot's */}
      <FormSection title="Run-in">
        <SliderField
          label="Run-in altitude (ft AGL)"
          range={ranges.ingressAltitude_ft}
          value={profile.ingressAltitude_ft}
          onChange={num('ingressAltitude_ft')}
          hint="Wings level until the pull-up"
        />
        <SliderField label="Speed (KTAS)" range={ranges.ingressSpeed_ktas} value={profile.ingressSpeed_ktas} onChange={num('ingressSpeed_ktas')} />
        <div className="text-xs text-gray-400">
          Straight in from the IP on {fmtHdg(attackHeading)}. To change the axis, change the IP under Run in from.
        </div>
      </FormSection>

      {/* The pull and the angle the bomb leaves at */}
      <FormSection title="Loft">
        <SliderField label="Loft angle" range={ranges.pullUpAngle_deg} value={profile.pullUpAngle_deg} onChange={num('pullUpAngle_deg')} hint="Climb angle at release" />
        <SliderField
          label="Pull"
          range={ranges.pullG}
          value={profile.pullG}
          autoValue={DEFAULT_LOFT_G}
          onChange={num('pullG')}
          hint="4 G, built over 2 s, is the F-4 manual's pull"
        />
      </FormSection>

      {/* What follows from them */}
      <div className="rounded p-3 text-xs font-mono text-gray-200 space-y-1 bg-dcs-dark">
        <div>
          Pull up {derived.pullUpDistance_nm.toFixed(1)} nm from the target · {plan.pullG} G to {plan.loftAngle_deg}° in {plan.pullTime_s.toFixed(1)} s
        </div>
        <div>
          Release ~{ft(derived.releaseAltitude_ft)} AGL at {derived.releaseSpeed_ktas ?? '?'} kt · {derived.releaseRange_nm?.toFixed(1) ?? '?'} nm out
        </div>
        <div>
          Bomb falls {derived.bombTimeOfFlight_s?.toFixed(1) ?? '?'} s · peaks ~{ft(plan.bombApex_ft)} AGL
        </div>
        <div className={jetRange < LOFT_FRAG_STANDOFF_NM ? 'text-red-400' : undefined}>
          Jet is {jetRange.toFixed(1)} nm from the target when the bomb lands
          {jetRange < LOFT_FRAG_STANDOFF_NM ? ` (inside ${LOFT_FRAG_STANDOFF_NM} nm frag standoff)` : ''}
        </div>
        {labs && (
          <div className="text-amber-300">
            {derived.pullUpTimer_s != null
              ? `Pull-up timer ${derived.pullUpTimer_s.toFixed(1)} s — set before the IP, started over the IP`
              : ipInside
                ? 'The IP is inside the pull-up range: no run-in to time. Move the IP out.'
                : 'Pull-up timer needs an IP'}
          </div>
        )}
        <div className="text-xs text-gray-400">
          ESTIMATED: one bomb drag for every weapon, sea-level air, no wind. All altitudes are AGL over the target. Model and sources:
          docs/DELIVERY_PLANNING.md, Loft and LABS.
        </div>
      </div>

      {/* Leaving */}
      <FormSection title="Egress">
        <div>
          <label className={label}>Egress</label>
          <select
            className={field}
            style={{ colorScheme: 'dark' }}
            value={profile.egressDirection}
            onChange={(e) => set({ egressDirection: e.target.value as 'left' | 'right' })}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
        <SliderField
          label="Egress heading"
          range={ranges.egressHeading_deg}
          value={profile.egressHeading_deg}
          autoValue={autoEgress}
          onAuto={() => set({ egressHeading_deg: undefined })}
          onChange={(v) => set({ egressHeading_deg: v })}
          hint="Auto: a 120° turn off the attack heading"
        />
      </FormSection>
    </div>
  );
}
