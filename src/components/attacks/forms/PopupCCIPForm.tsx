import type { PopupCCIPProfile, Waypoint, DbWeapon } from '../../../types';
import { resolveEgressHeading } from '../../../lib/attackGeometry';
import { applyPopupPlan, popupPlanOf, DEFAULT_TRACKING_TIME_S, DEFAULT_PULL_G, FT_PER_NM } from '../../../lib/popupPlanning';
import { weaponFloor_ft } from '../../../lib/autoBuildAttack';
import { ActionPointFields } from './ActionPointFields';

interface PopupCCIPFormProps {
  profile: PopupCCIPProfile;
  ipWaypoints: Waypoint[];
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

/**
 * The numbers behind a pop-up, for planners who want to change them.
 *
 * The inputs are the handbook's: dive angle, release altitude (a floor),
 * speed, tracking time, G — plus the action point and check turn that anchor
 * the run-in on the route. Everything in the grey panel is derived from them
 * and is what the card prints and the map draws. See docs/DELIVERY_PLANNING.md.
 */
export function PopupCCIPForm({ profile, ipWaypoints, targetElevation, selectedWeapon, onChange, directBearing_deg }: PopupCCIPFormProps) {
  const set = (patch: Partial<PopupCCIPProfile>) => onChange(applyPopupPlan({ ...profile, ...patch }, directBearing_deg));
  const num = (key: keyof PopupCCIPProfile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) set({ [key]: v } as Partial<PopupCCIPProfile>);
  };

  const plan = popupPlanOf(profile);
  const floor = weaponFloor_ft(selectedWeapon ?? undefined);
  const closes = profile.geometryCloses ?? true;

  return (
    <div className="space-y-4">
      {/* The run-in on the route */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={label}>Run in from</label>
          <select
            className={field}
            style={{ colorScheme: 'dark' }}
            value={profile.ipWaypointId || ''}
            onChange={(e) => set({ ipWaypointId: e.target.value })}
          >
            <option value="">Select waypoint…</option>
            {ipWaypoints.map((wp) => (
              <option key={wp.id} value={wp.id}>STPT {wp.steerpoint} — {wp.name} ({wp.type})</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Attack heading (°)</label>
          <input
            type="number"
            className={field}
            value={profile.runInHeading_deg != null ? Math.round(profile.runInHeading_deg) : ''}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange({ ...profile, runInHeading_deg: v });
            }}
          />
          <div className="text-xs text-gray-400 mt-1">
            Set by the geometry — approach {fmtHdg(profile.approachHeading_deg)}, pull down {profile.offsetDirection === 'left' ? 'right' : 'left'}{' '}
            {profile.pullDownTurn_deg != null ? `${Math.round(profile.pullDownTurn_deg)}°` : ''}
          </div>
        </div>
        <div>
          <label className={label}>Hard deck (ft AGL)</label>
          <input type="number" className={field} value={profile.minAltitude_ft ?? ''} onChange={num('minAltitude_ft')} />
        </div>
        <ActionPointFields
          value={{ actionRange_nm: profile.actionRange_nm, offsetTurn_deg: profile.offsetAngle_deg, side: profile.offsetDirection }}
          joinLabel="pull down"
          joinRange_nm={profile.turnInRange_nm}
          attackHeading={closes ? profile.runInHeading_deg : undefined}
          directBearing_deg={directBearing_deg}
          onChange={(v) => set({ actionRange_nm: v.actionRange_nm, offsetAngle_deg: v.offsetTurn_deg, offsetDirection: v.side })}
        />
      </div>

      {/* The handbook's inputs */}
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className={label}>Dive angle (°)</label>
          <input type="number" className={field} value={profile.diveAngle_deg ?? ''} onChange={num('diveAngle_deg')} />
        </div>
        <div>
          <label className={label}>Release by (ft AGL)</label>
          <input type="number" className={field} value={profile.releaseAltitude_ft ?? ''} onChange={num('releaseAltitude_ft')} />
          {floor > 0 && (
            <div className={`text-xs mt-1 ${profile.releaseAltitude_ft < floor ? 'text-red-400' : 'text-gray-400'}`}>
              Weapon floor {ft(floor)}
            </div>
          )}
        </div>
        <div>
          <label className={label}>Speed (KTAS)</label>
          <input type="number" className={field} value={profile.runInSpeed_ktas ?? ''} onChange={num('runInSpeed_ktas')} />
        </div>
        <div>
          <label className={label}>Run-in altitude (ft AGL)</label>
          <input type="number" className={field} value={profile.runInAltitude_ft ?? ''} onChange={num('runInAltitude_ft')} />
        </div>
        <div>
          <label className={label}>Tracking time (s)</label>
          <input type="number" step="0.5" className={field} value={profile.trackingTime_s ?? DEFAULT_TRACKING_TIME_S} onChange={num('trackingTime_s')} />
        </div>
        <div>
          <label className={label}>Pull (G)</label>
          <input type="number" step="0.5" className={field} value={profile.pullG ?? DEFAULT_PULL_G} onChange={num('pullG')} />
          <div className="text-xs text-gray-400 mt-1">Pull-up and pull-down</div>
        </div>
      </div>

      {/* What follows from them */}
      <div className={`rounded p-3 text-sm font-mono text-gray-200 grid grid-cols-2 gap-x-6 gap-y-1 ${closes ? 'bg-dcs-dark' : 'bg-red-950'}`}>
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
      <div className="grid grid-cols-3 gap-4">
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
        <div>
          <label className={label}>Egress heading (°)</label>
          <input
            type="number"
            className={field}
            value={profile.egressHeading_deg ?? ''}
            placeholder={profile.runInHeading_deg != null ? `Auto: ${fmtHdg(resolveEgressHeading(profile, profile.runInHeading_deg))}` : 'Auto'}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              set({ egressHeading_deg: Number.isFinite(v) ? v : undefined });
            }}
          />
        </div>
      </div>
    </div>
  );
}
