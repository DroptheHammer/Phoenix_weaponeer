import type { PopupCCIPProfile, DbWeapon } from '../../../types';
import { resolveEgressHeading } from '../../../lib/attackGeometry';
import { applyPopupPlan, popupPlanOf, DEFAULT_TRACKING_TIME_S, DEFAULT_PULL_G, FT_PER_NM } from '../../../lib/popupPlanning';
import { weaponFloor_ft } from '../../../lib/autoBuildAttack';
import { KNOB_RANGES } from '../../../lib/customizeKnobs';
import { SliderField } from '../../common/SliderField';
import { ActionPointFields } from './ActionPointFields';
import { FormSection } from './FormSection';

interface PopupCCIPFormProps {
  profile: PopupCCIPProfile;
  targetElevation: number;
  selectedWeapon: DbWeapon | null;
  onChange: (profile: PopupCCIPProfile) => void;
  /** Bearing IP → target: the route leg the action point sits on. */
  directBearing_deg?: number;
}

const field = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';
const fmtHdg = (h: number | undefined) =>
  h != null && Number.isFinite(h) ? `${Math.round(h).toString().padStart(3, '0')}°` : '---';
const ft = (v: number) => `${Math.round(v).toLocaleString()} ft`;
const ranges = KNOB_RANGES.popup_ccip;

/**
 * The numbers behind a pop-up, for planners who want to change them.
 *
 * The inputs are the handbook's: dive angle, release altitude (a floor),
 * speed, tracking time, G — plus the action point and check turn that anchor
 * the run-in on the route. Everything in the grey panel is derived from them
 * and is what the card prints and the map draws. See docs/DELIVERY_PLANNING.md.
 */
export function PopupCCIPForm({ profile, targetElevation, selectedWeapon, onChange, directBearing_deg }: PopupCCIPFormProps) {
  const set = (patch: Partial<PopupCCIPProfile>) => onChange(applyPopupPlan({ ...profile, ...patch }, directBearing_deg));
  const num = (key: keyof PopupCCIPProfile) => (v: number) => set({ [key]: v } as Partial<PopupCCIPProfile>);

  const plan = popupPlanOf(profile);
  const floor = weaponFloor_ft(selectedWeapon ?? undefined);
  const closes = profile.geometryCloses ?? true;
  const heading = profile.runInHeading_deg != null ? Math.round(profile.runInHeading_deg) : undefined;
  // What the plan gives with no override: re-run it and read the heading back.
  const planHeading = directBearing_deg != null ? applyPopupPlan(profile, directBearing_deg).runInHeading_deg : undefined;

  return (
    <div className="space-y-4">
      {/* The run-in on the route */}
      <FormSection title="Run-in">
        <SliderField
          label="Attack heading"
          range={ranges.runInHeading_deg}
          value={heading}
          autoValue={planHeading}
          isAuto={planHeading != null && heading === Math.round(planHeading)}
          onAuto={() => set({})}
          onChange={(v) => onChange({ ...profile, runInHeading_deg: v })}
          hint={`Set by the geometry — approach ${fmtHdg(profile.approachHeading_deg)}, pull down ${profile.offsetDirection === 'left' ? 'right' : 'left'} ${
            profile.pullDownTurn_deg != null ? `${Math.round(profile.pullDownTurn_deg)}°` : ''
          }`}
        />
        <ActionPointFields
          profileType="popup_ccip"
          value={{ actionRange_nm: profile.actionRange_nm, offsetTurn_deg: profile.offsetAngle_deg, side: profile.offsetDirection }}
          joinLabel="pull down"
          joinRange_nm={profile.turnInRange_nm}
          attackHeading={closes ? profile.runInHeading_deg : undefined}
          directBearing_deg={directBearing_deg}
          onChange={(v) => set({ actionRange_nm: v.actionRange_nm, offsetAngle_deg: v.offsetTurn_deg, offsetDirection: v.side })}
        />
        <SliderField label="Hard deck (ft AGL)" range={ranges.minAltitude_ft} value={profile.minAltitude_ft} onChange={num('minAltitude_ft')} />
      </FormSection>

      {/* The handbook's inputs */}
      <FormSection title="Pop-up">
        <SliderField label="Run-in altitude (ft AGL)" range={ranges.runInAltitude_ft} value={profile.runInAltitude_ft} onChange={num('runInAltitude_ft')} />
        <SliderField label="Speed (KTAS)" range={ranges.runInSpeed_ktas} value={profile.runInSpeed_ktas} onChange={num('runInSpeed_ktas')} />
        <SliderField label="Dive angle" range={ranges.diveAngle_deg} value={profile.diveAngle_deg} onChange={num('diveAngle_deg')} />
        <SliderField
          label="Release by (ft AGL)"
          range={ranges.releaseAltitude_ft}
          value={profile.releaseAltitude_ft}
          onChange={num('releaseAltitude_ft')}
          hint={
            floor > 0 ? <span className={profile.releaseAltitude_ft < floor ? 'text-red-400' : undefined}>Weapon floor {ft(floor)}</span> : undefined
          }
        />
        <SliderField label="Tracking time" range={ranges.trackingTime_s} value={profile.trackingTime_s} autoValue={DEFAULT_TRACKING_TIME_S} onChange={num('trackingTime_s')} />
        <SliderField label="Pull" range={ranges.pullG} value={profile.pullG} autoValue={DEFAULT_PULL_G} onChange={num('pullG')} hint="Pull-up and pull-down" />
      </FormSection>

      {/* What follows from them */}
      <div className={`rounded p-3 text-xs font-mono text-gray-200 space-y-1 ${closes ? 'bg-dcs-dark' : 'bg-red-950'}`}>
        <div>Action point {profile.actionRange_nm ?? '?'} nm · turn {profile.offsetDirection} {profile.offsetAngle_deg ?? '?'}° → {fmtHdg(profile.approachHeading_deg)}</div>
        <div>Pop {profile.popDistance_nm.toFixed(1)} nm · climb {plan.climbAngle_deg}° at {plan.pullG} G</div>
        <div>Pull down {ft(plan.pullDownAltitude_ft)} at {profile.turnInRange_nm?.toFixed(1) ?? '?'} nm · apex {ft(plan.apexAltitude_ft)}</div>
        <div>Pull-down turn {profile.pullDownTurn_deg != null ? `${Math.round(profile.pullDownTurn_deg)}°` : '?'} onto {fmtHdg(profile.runInHeading_deg)} (handbook guide {plan.doctrinalAngleOff_deg}°)</div>
        <div>Wings level {ft(plan.trackAltitude_ft)} at {(plan.mapDistance_ft / FT_PER_NM).toFixed(2)} nm (MAP)</div>
        <div>Aim-off {ft(plan.aimOff_ft)} beyond target</div>
        <div>Track {plan.trackingTime_s} s → release by {ft(plan.releaseAltitude_ft)} AGL at {(plan.bombRange_ft / FT_PER_NM).toFixed(2)} nm</div>
        <div>Turn radius {(plan.turnRadius_ft / FT_PER_NM).toFixed(2)} nm</div>
        <div className="col-span-2 text-xs text-gray-400">
          {closes
            ? `Target elevation ${Math.round(targetElevation).toLocaleString()} ft MSL — all altitudes above are AGL. Formulas: docs/DELIVERY_PLANNING.md.`
            : 'The check turn is too wide for this action range: even a 90° pull-down cannot reach the target. Reduce the turn or move the action point out.'}
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
          autoValue={profile.runInHeading_deg != null ? Math.round(resolveEgressHeading({ ...profile, egressHeading_deg: undefined }, profile.runInHeading_deg)) : undefined}
          onAuto={() => set({ egressHeading_deg: undefined })}
          onChange={(v) => set({ egressHeading_deg: v })}
        />
      </FormSection>
    </div>
  );
}
