import type { LevelCCRPProfile } from '../../../types';

interface LevelFormProps {
  profile: LevelCCRPProfile;
  targetElevation_ft: number;
  onChange: (profile: LevelCCRPProfile) => void;
}

const field = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';

/** The numbers behind a level delivery. Altitude is MSL — what the pilot reads. */
export function LevelForm({ profile, targetElevation_ft, onChange }: LevelFormProps) {
  const num = (key: keyof LevelCCRPProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...profile, [key]: parseFloat(e.target.value) });

  const agl = Math.round((profile.releaseAltitude_ft ?? 0) - targetElevation_ft);

  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <label className={label}>Ingress heading (°)</label>
        <input type="number" className={field} value={profile.ingressHeading_deg ?? ''} onChange={num('ingressHeading_deg')} />
      </div>
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
        <label className={label}>Egress heading (°)</label>
        <input
          type="number"
          className={field}
          value={profile.egressHeading_deg ?? ''}
          placeholder={`Auto: straight ahead ${Math.round(profile.ingressHeading_deg ?? 0)}°`}
          onChange={num('egressHeading_deg')}
        />
      </div>
    </div>
  );
}
