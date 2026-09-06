import type { DiveCCIPProfile } from '../../../types';
import { resolveEgressHeading } from '../../../lib/attackGeometry';

interface DiveFormProps {
  profile: DiveCCIPProfile;
  onChange: (profile: DiveCCIPProfile) => void;
}

const field = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';

/** The numbers behind a dive delivery, for planners who want to change them. */
export function DiveForm({ profile, onChange }: DiveFormProps) {
  const num = (key: keyof DiveCCIPProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...profile, [key]: parseFloat(e.target.value) });

  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className={label}>Ingress heading (°)</label>
        <input type="number" className={field} value={profile.ingressHeading_deg ?? ''} onChange={num('ingressHeading_deg')} />
      </div>
      <div>
        <label className={label}>Ingress altitude (ft AGL)</label>
        <input type="number" className={field} value={profile.ingressAltitude_ft ?? ''} placeholder={`${profile.rollInAltitude_ft}`} onChange={num('ingressAltitude_ft')} />
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
          onChange={num('egressHeading_deg')}
        />
      </div>
    </div>
  );
}
