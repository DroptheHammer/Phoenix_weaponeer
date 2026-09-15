import type { DiveCCIPProfile } from '../../../types';
import { resolveEgressHeading, diveGroundRange_nm } from '../../../lib/attackGeometry';
import { actionPointHeading } from '../../../lib/runIn';
import { ActionPointFields } from './ActionPointFields';

interface DiveFormProps {
  profile: DiveCCIPProfile;
  onChange: (profile: DiveCCIPProfile) => void;
  /** Bearing IP → target: the route the action point sits on. */
  directBearing_deg?: number;
}

const field = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';

/** The numbers behind a dive delivery, for planners who want to change them. */
export function DiveForm({ profile, onChange, directBearing_deg }: DiveFormProps) {
  // The attack heading follows from the action point, check turn and roll-in
  // range, so any change re-derives it while the geometry closes.
  const withHeading = (next: DiveCCIPProfile): DiveCCIPProfile => {
    const heading = actionPointHeading(next, directBearing_deg, diveGroundRange_nm(next.rollInAltitude_ft, next.diveAngle_deg));
    return heading != null ? { ...next, ingressHeading_deg: heading } : next;
  };
  // A cleared optional field goes back to Auto; a cleared required field keeps
  // its last value rather than storing NaN.
  const num = (key: keyof DiveCCIPProfile, optional = false) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) onChange(withHeading({ ...profile, [key]: v }));
    else if (optional) onChange(withHeading({ ...profile, [key]: undefined }));
  };
  const joinRange_nm = diveGroundRange_nm(profile.rollInAltitude_ft, profile.diveAngle_deg);
  const computedHeading = actionPointHeading(profile, directBearing_deg, joinRange_nm);

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
        value={{ actionRange_nm: profile.actionRange_nm, offsetTurn_deg: profile.offsetAngle_deg, side: profile.offsetDirection }}
        joinLabel="roll in"
        joinRange_nm={joinRange_nm}
        attackHeading={computedHeading}
        directBearing_deg={directBearing_deg}
        onChange={(v) => onChange(withHeading({ ...profile, actionRange_nm: v.actionRange_nm, offsetAngle_deg: v.offsetTurn_deg, offsetDirection: v.side }))}
      />
      <div>
        <label className={label}>Ingress altitude (ft AGL)</label>
        <input type="number" className={field} value={profile.ingressAltitude_ft ?? ''} placeholder={`${profile.rollInAltitude_ft}`} onChange={num('ingressAltitude_ft', true)} />
      </div>
      <div>
        <label className={label}>Roll-in altitude (ft AGL)</label>
        <input type="number" className={field} value={profile.rollInAltitude_ft ?? ''} onChange={num('rollInAltitude_ft')} />
      </div>
      <div>
        <label className={label}>Dive angle (°)</label>
        <input type="number" className={field} value={profile.diveAngle_deg ?? ''} onChange={num('diveAngle_deg')} />
      </div>
      <div>
        <label className={label}>Release altitude (ft AGL)</label>
        <input type="number" className={field} value={profile.releaseAltitude_ft ?? ''} onChange={num('releaseAltitude_ft')} />
      </div>
      <div>
        <label className={label}>Release speed (KTAS)</label>
        <input type="number" className={field} value={profile.releaseSpeed_ktas ?? ''} onChange={num('releaseSpeed_ktas')} />
      </div>
      <div>
        <label className={label}>Pull-out (G)</label>
        <input type="number" step="0.5" className={field} value={profile.pulloutG ?? ''} onChange={num('pulloutG')} />
      </div>
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
      <div>
        <label className={label}>Egress heading (°)</label>
        <input
          type="number"
          className={field}
          value={profile.egressHeading_deg ?? ''}
          placeholder={`Auto: ${Math.round(resolveEgressHeading(profile, profile.ingressHeading_deg))}°`}
          onChange={num('egressHeading_deg', true)}
        />
      </div>
    </div>
  );
}
