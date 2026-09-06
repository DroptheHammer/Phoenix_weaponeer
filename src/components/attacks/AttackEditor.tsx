import { useEffect, useMemo, useState } from 'react';
import { useMissionStore } from '../../stores/missionStore';
import { useProfileStore } from '../../stores/profileStore';
import { useAttackCalculator } from '../../hooks/useAttackCalculator';
import { Modal } from '../common/Modal';
import { PopupCCIPForm } from './forms/PopupCCIPForm';
import { DiveForm } from './forms/DiveForm';
import { LevelForm } from './forms/LevelForm';
import { autoBuildAttack, loadoutWeapons } from '../../lib/autoBuildAttack';
import { runAttackChecks, hasErrors } from '../../lib/attackChecks';
import { weaponClassOf } from '../../lib/weaponClass';
import { formatCallsign } from '../../lib/callsign';
import type {
  Attack,
  AttackProfile,
  DiveCCIPProfile,
  LevelCCRPProfile,
  PopupCCIPProfile,
  DbWeapon,
  FuzeOption,
} from '../../types';

interface Aircraft {
  id: string;
  name: string;
  dcs_module_name: string;
}

interface ThreatSystemLite {
  id: string;
  max_range_nm: number;
}

interface AttackEditorProps {
  attack?: Attack;
  onClose: () => void;
  weapons: DbWeapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
  aircraft: Aircraft[];
  threatSystems?: ThreatSystemLite[];
}

const select = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';

/**
 * Attack editor, auto-build first.
 *
 * Target, attacker and weapon are the pilot's picks; the aircraft's delivery
 * profile library supplies everything else and the result is complete with
 * no alerts. What the pilot sees on the basic path is the big decisions —
 * profile, heading, which way to egress — and the key numbers. Customize
 * opens the full form for anyone who wants to change them.
 */
export function AttackEditor({ attack, onClose, weapons, fuzeOptions, aircraft, threatSystems = [] }: AttackEditorProps) {
  const { mission, addAttack, updateAttack } = useMissionStore();
  const profiles = useProfileStore((s) => s.profiles);
  const profilesLoaded = useProfileStore((s) => s.loaded);
  const { calculatePopupCCIP, result: calcResult, error: calcError } = useAttackCalculator();

  // The pilot's picks
  const [targetWaypointId, setTargetWaypointId] = useState(attack?.targetWaypointId ?? '');
  const [attackerId, setAttackerId] = useState(attack?.attackerId ?? '');
  const [weaponId, setWeaponId] = useState(attack?.weaponId ?? '');
  const [profileId, setProfileId] = useState<string | undefined>(attack?.sourceProfileId);
  const [headingOverride, setHeadingOverride] = useState<number | undefined>(() => {
    const p = attack?.profile as { runInHeading_deg?: number; ingressHeading_deg?: number } | undefined;
    return attack?.customized ? undefined : (p?.runInHeading_deg ?? undefined);
  });
  const [egressOverride, setEgressOverride] = useState<'left' | 'right' | undefined>(undefined);

  // Weapon details
  const [fuzeId, setFuzeId] = useState(attack?.fuzeId ?? '');
  const [releaseQuantity, setReleaseQuantity] = useState(attack?.releaseQuantity ?? 1);
  const [releaseMode, setReleaseMode] = useState<Attack['releaseMode']>(attack?.releaseMode ?? 'single');

  // Customize: once the planner touches the numbers, auto-build stops overwriting them.
  const [customized, setCustomized] = useState(Boolean(attack && (attack.customized || !attack.sourceProfileId)));
  const [showCustomize, setShowCustomize] = useState(Boolean(attack && (attack.customized || !attack.sourceProfileId)));
  const [customProfile, setCustomProfile] = useState<AttackProfile | undefined>(attack?.profile);

  const flightMembers = mission?.flightMembers ?? [];
  const targetWaypoints = mission?.waypoints.filter((wp) => wp.type === 'target') ?? [];
  const ipWaypoints = mission?.waypoints.filter((wp) => wp.type === 'ip') ?? [];
  const attacker = flightMembers.find((fm) => fm.id === attackerId);
  const selectedTarget = mission?.waypoints.find((wp) => wp.id === targetWaypointId);

  // Weapon choices: what the attacker carries, else every A/G store.
  const carried = loadoutWeapons(attacker, weapons);
  const weaponChoices = carried.length ? carried : weapons.filter((w) => weaponClassOf(w));
  const selectedWeapon = weapons.find((w) => w.id === weaponId);

  const build = useMemo(() => {
    if (!mission) return null;
    return autoBuildAttack({
      mission,
      targetWaypointId,
      attackerId,
      weapons,
      profiles,
      threatSystems,
      overrides: {
        weaponId: weaponId || undefined,
        profileId,
        runInHeading_deg: headingOverride,
        egressDirection: egressOverride,
      },
    });
  }, [mission, targetWaypointId, attackerId, weapons, profiles, threatSystems, weaponId, profileId, headingOverride, egressOverride]);

  // Keep the pick lists honest as the picks change.
  useEffect(() => {
    if (!weaponId && build?.weapon) setWeaponId(build.weapon.id);
  }, [build?.weapon, weaponId]);
  useEffect(() => {
    if (build?.profile && profileId !== build.profile.id && !build.candidates.some((p) => p.id === profileId)) {
      setProfileId(build.profile.id);
    }
  }, [build?.profile, build?.candidates, profileId]);

  // The profile that will be saved: auto-built unless the planner has customized it.
  const effectiveProfile: AttackProfile | undefined = customized ? customProfile : build?.attack?.profile;
  const profileType = effectiveProfile?.type ?? build?.attack?.profileType;

  // Popup Customize still leans on the Rust calculator for its derived numbers.
  const triggerCalculation = () => {
    const p = customProfile as Partial<PopupCCIPProfile> | undefined;
    if (!selectedTarget || !selectedWeapon || !p || p.type !== 'popup_ccip') return;
    if (!p.runInAltitude_ft || !p.runInSpeed_ktas || !p.popDistance_nm || !p.apexAltitude_ft || !p.diveAngle_deg) return;
    calculatePopupCCIP({
      target_elevation_ft: selectedTarget.elevation_ft || 0,
      run_in_altitude_agl: p.runInAltitude_ft,
      run_in_speed_ktas: p.runInSpeed_ktas,
      pop_distance_nm: p.popDistance_nm,
      apex_altitude_agl: p.apexAltitude_ft,
      dive_angle_deg: p.diveAngle_deg,
      weapon_id: weaponId,
    });
  };

  const checks = effectiveProfile
    ? runAttackChecks({
        profileType: profileType ?? 'popup_ccip',
        profile: effectiveProfile,
        weapon: selectedWeapon ?? null,
        targetElevation_ft: selectedTarget?.elevation_ft,
        weaponClass: selectedWeapon ? weaponClassOf(selectedWeapon) : undefined,
        allowedClasses: build?.profile?.weaponClasses,
        sourceProfileName: build?.profile?.name,
      })
    : [];

  const problems = build?.problems ?? [];
  const canSave = Boolean(mission && effectiveProfile && profileType && problems.length === 0 && !hasErrors(checks));

  const startCustomizing = () => {
    if (!customized) setCustomProfile(build?.attack?.profile);
    setCustomized(true);
    setShowCustomize(true);
  };

  const resetToProfile = () => {
    setCustomized(false);
    setCustomProfile(undefined);
  };

  const handleSave = () => {
    if (!canSave || !mission || !effectiveProfile || !profileType) return;
    const base = build?.attack;
    const data: Omit<Attack, 'id'> = {
      targetWaypointId,
      attackerId,
      profileType,
      profile: effectiveProfile,
      weaponId,
      fuzeId: fuzeId || undefined,
      releaseQuantity,
      releaseMode,
      sequenceNumber: attack?.sequenceNumber ?? mission.attacks.length + 1,
      notes: attack?.notes,
      sourceProfileId: base?.sourceProfileId ?? attack?.sourceProfileId,
      sourceProfileName: base?.sourceProfileName ?? attack?.sourceProfileName,
      deliveryMode: base?.deliveryMode ?? attack?.deliveryMode,
      estimated: base?.estimated ?? attack?.estimated,
      sightDepression_mils: base?.sightDepression_mils ?? attack?.sightDepression_mils,
      procedure: base?.procedure ?? attack?.procedure,
      customized: customized || undefined,
    };
    if (attack) updateAttack(attack.id, data);
    else addAttack(data);
    onClose();
  };

  const headingText = build?.attackHeading != null ? `${Math.round(build.attackHeading).toString().padStart(3, '0')}°` : '---';
  const egress = (effectiveProfile as { egressDirection?: string } | undefined)?.egressDirection ?? 'right';

  return (
    <Modal title={attack ? 'Edit Attack' : 'Add Attack'} onClose={onClose} widthClass="w-[860px]">
      <div className="space-y-5">
        {/* The picks */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>Target</label>
            <select className={select} style={{ colorScheme: 'dark' }} value={targetWaypointId} onChange={(e) => setTargetWaypointId(e.target.value)}>
              <option value="">Select target…</option>
              {targetWaypoints.map((wp) => (
                <option key={wp.id} value={wp.id}>STPT {wp.steerpoint} — {wp.name}</option>
              ))}
            </select>
            {selectedTarget && <div className="text-xs text-gray-400 mt-1">Elev {Math.round(selectedTarget.elevation_ft || 0).toLocaleString()} ft MSL</div>}
          </div>
          <div>
            <label className={label}>Attacker</label>
            <select
              className={select}
              style={{ colorScheme: 'dark' }}
              value={attackerId}
              onChange={(e) => { setAttackerId(e.target.value); setWeaponId(''); setProfileId(undefined); resetToProfile(); }}
            >
              <option value="">Select attacker…</option>
              {flightMembers.map((fm) => {
                const ac = aircraft.find((a) => a.id === fm.aircraftId);
                return <option key={fm.id} value={fm.id}>{formatCallsign(fm.callsign)} — {ac?.name ?? fm.aircraftId}</option>;
              })}
            </select>
          </div>
          <div>
            <label className={label}>Weapon {carried.length ? <span className="text-xs text-gray-400">(from loadout)</span> : null}</label>
            <select
              className={select}
              style={{ colorScheme: 'dark' }}
              value={weaponId}
              onChange={(e) => { setWeaponId(e.target.value); setFuzeId(''); setProfileId(undefined); resetToProfile(); }}
              disabled={!attackerId}
            >
              <option value="">Select weapon…</option>
              {weaponChoices.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* The profile: what the pilot is choosing between */}
        {attackerId && weaponId && (
          <div className="border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Delivery</h3>
              {build?.profile && (
                <span className={`text-xs px-2 py-0.5 rounded ${build.profile.verified ? 'bg-green-900 text-green-200' : 'bg-amber-900 text-amber-200'}`}>
                  {build.profile.verified ? `Verified by ${build.profile.verifiedBy}` : 'ESTIMATED — not yet flown in DCS'}
                </span>
              )}
            </div>

            {build?.candidates.length ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {build.candidates.map((p) => {
                  const active = p.id === build.profile?.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setProfileId(p.id); resetToProfile(); }}
                      title={p.summary}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        active ? 'bg-dcs-accent border-dcs-accent text-white' : 'bg-dcs-dark border-gray-600 text-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {p.name} <span className="text-xs opacity-70">· {p.deliveryMode}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              profilesLoaded && <p className="text-sm text-amber-300 mb-3">No profile in the library for this aircraft and weapon yet.</p>
            )}

            {build?.profile?.summary && <p className="text-sm text-gray-400 mb-3">{build.profile.summary}</p>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Attack heading</label>
                <input
                  type="number"
                  className={select}
                  value={headingOverride ?? ''}
                  placeholder={build?.ipWaypoint ? `Auto ${headingText} from ${build.ipWaypoint.name}` : `Auto ${headingText}`}
                  onChange={(e) => { const v = parseFloat(e.target.value); setHeadingOverride(Number.isFinite(v) ? v : undefined); resetToProfile(); }}
                />
              </div>
              <div>
                <label className={label}>Egress</label>
                <div className="flex gap-2">
                  {(['left', 'right'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => { setEgressOverride(side); resetToProfile(); }}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        egress === side ? 'bg-dcs-blue border-blue-400 text-white' : 'bg-dcs-dark border-gray-600 text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {side === 'left' ? '◀ Left' : 'Right ▶'}
                    </button>
                  ))}
                </div>
                {!egressOverride && build?.attack && <div className="text-xs text-gray-400 mt-1">Auto: away from the nearest threat</div>}
              </div>
            </div>

            {effectiveProfile && <KeyNumbers profile={effectiveProfile} />}

            {build?.adjustments.length ? (
              <ul className="mt-3 text-sm text-amber-300 space-y-1">
                {build.adjustments.map((a) => <li key={a}>↑ {a}</li>)}
              </ul>
            ) : null}
          </div>
        )}

        {/* Weapon details + the numbers, behind Customize */}
        <div className="border border-gray-700 rounded-lg">
          <button
            type="button"
            onClick={() => (showCustomize ? setShowCustomize(false) : startCustomizing())}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="font-semibold">{showCustomize ? '▾' : '▸'} Customize {customized && <span className="text-xs text-amber-300 ml-2">edited from {build?.profile?.name ?? 'profile'}</span>}</span>
            {customized && (
              <span role="button" className="text-xs text-gray-400 hover:text-white" onClick={(e) => { e.stopPropagation(); resetToProfile(); }}>
                reset to profile
              </span>
            )}
          </button>

          {showCustomize && (
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={label}>Fuze</label>
                  <select className={select} style={{ colorScheme: 'dark' }} value={fuzeId} onChange={(e) => setFuzeId(e.target.value)} disabled={!weaponId}>
                    <option value="">Default</option>
                    {weaponId && fuzeOptions.get(weaponId)?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Release mode</label>
                  <select className={select} style={{ colorScheme: 'dark' }} value={releaseMode} onChange={(e) => setReleaseMode(e.target.value as Attack['releaseMode'])}>
                    <option value="single">Single</option>
                    <option value="pair">Pair</option>
                    <option value="ripple">Ripple</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Quantity</label>
                  <input type="number" min="1" max="12" className={select} value={releaseQuantity} onChange={(e) => setReleaseQuantity(parseInt(e.target.value) || 1)} />
                </div>
              </div>

              {customized && customProfile?.type === 'dive_ccip' && (
                <DiveForm profile={customProfile as DiveCCIPProfile} onChange={setCustomProfile} />
              )}
              {customized && customProfile?.type === 'level_ccrp' && (
                <LevelForm profile={customProfile as LevelCCRPProfile} targetElevation_ft={selectedTarget?.elevation_ft ?? 0} onChange={setCustomProfile} />
              )}
              {customized && customProfile?.type === 'popup_ccip' && (
                <PopupCCIPForm
                  profile={customProfile as Partial<PopupCCIPProfile>}
                  ipWaypoints={ipWaypoints}
                  targetElevation={selectedTarget?.elevation_ft || 0}
                  selectedWeapon={selectedWeapon ?? null}
                  onChange={(p) => setCustomProfile(p as PopupCCIPProfile)}
                  calculatorResult={calcResult}
                  onCalculate={triggerCalculation}
                  calculatedAttackHeading={build?.attackHeading ?? null}
                />
              )}
              {calcError && <div className="text-sm text-red-400">Calculation failed: {calcError}</div>}
            </div>
          )}
        </div>

        {/* Anything standing between the planner and a card */}
        {problems.length > 0 && (
          <ul className="text-sm text-yellow-300 border border-yellow-700 bg-yellow-900 bg-opacity-20 rounded p-3 space-y-1">
            {problems.map((p) => <li key={p}>• {p}</li>)}
          </ul>
        )}
        {checks.length > 0 && (
          <div className="text-sm border border-red-800 bg-red-950 bg-opacity-40 rounded p-3 space-y-1">
            <div className="font-semibold text-red-300">This attack will print with warnings:</div>
            {checks.map((c) => (
              <div key={c.text} className={c.level === 'error' ? 'text-red-400' : 'text-yellow-400'}>⚠ {c.text}</div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
          <button onClick={onClose} className="px-6 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-6 py-2 rounded transition-colors ${canSave ? 'bg-dcs-accent hover:bg-red-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
          >
            {attack ? 'Update' : 'Save'} attack
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** The numbers a pilot actually flies, in one line. */
function KeyNumbers({ profile }: { profile: AttackProfile }) {
  const ft = (v: number) => `${Math.round(v).toLocaleString()} ft`;
  let text: string;
  switch (profile.type) {
    case 'dive_ccip':
      text = `Roll in ${ft(profile.rollInAltitude_ft)} AGL · ${profile.diveAngle_deg}° dive · Release ${ft(profile.releaseAltitude_ft)} AGL @ ${Math.round(profile.releaseSpeed_ktas)} kt · ${profile.pulloutG} G`;
      break;
    case 'level_ccrp':
      text = `Level ${ft(profile.releaseAltitude_ft)} MSL @ ${Math.round(profile.releaseSpeed_ktas)} kt`;
      break;
    case 'popup_ccip':
      text = `Run-in ${ft(profile.runInAltitude_ft)} AGL @ ${profile.runInSpeed_ktas} kt · Pop ${profile.popDistance_nm} nm · Apex ${ft(profile.apexAltitude_ft)} · ${profile.diveAngle_deg}° · Release ${ft(profile.releaseAltitude_ft)} AGL`;
      break;
    default:
      text = '';
  }
  return <div className="mt-3 text-sm font-mono text-gray-200 bg-dcs-dark rounded px-3 py-2">{text}</div>;
}
