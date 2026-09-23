import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMissionStore } from '../../stores/missionStore';
import { useVisibleMission } from '../../hooks/useVisibleMission';
import { useProfileStore } from '../../stores/profileStore';
import { Modal } from '../common/Modal';
import { SliderField } from '../common/SliderField';
import { PopupCCIPForm } from './forms/PopupCCIPForm';
import { DiveForm } from './forms/DiveForm';
import { LevelForm } from './forms/LevelForm';
import { SideProfileView } from './SideProfileView';
import { AttackPreviewMap } from '../map/AttackPreviewMap';
import { autoBuildAttack, loadoutWeapons, resolveIp, inferIp } from '../../lib/autoBuildAttack';
import { attackIpAnchor, initialIpChoice, ipFieldsFor, ipPointFromFields, seedCustomIp, type IpChoiceMode } from '../../lib/ipAnchor';
import { formatCoordinatesDMS } from '../../lib/coordinates';
import { runAttackChecks, hasErrors } from '../../lib/attackChecks';
import { resolveEgressHeading, type Side } from '../../lib/attackGeometry';
import { describeRunIn, type RunInSummary } from '../../lib/runIn';
import { applyFlank, applyEgress, moveIp } from '../../lib/attackFlank';
import { IP_KNOB_RANGES } from '../../lib/customizeKnobs';
import { weaponClassOf } from '../../lib/weaponClass';
import { formatCallsign } from '../../lib/callsign';
import { targetCandidates, ipCandidates, waypointLabel } from '../../lib/waypointOptions';
import type {
  Attack,
  AttackProfile,
  Coordinates,
  DiveCCIPProfile,
  IpAnchorFields,
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
  onSaved?: () => void;
  weapons: DbWeapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
  aircraft: Aircraft[];
  threatSystems?: ThreatSystemLite[];
}

const select = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';

/**
 * Attack editor, auto-build first, with the attack drawn live beside it.
 *
 * Target, attacker and weapon are the pilot's picks; the aircraft's delivery
 * profile library supplies everything else and the result is complete with
 * no alerts. What the pilot sees on the basic path is the big decisions —
 * profile, which way and how far to angle off the IP→target line, which way
 * to egress — and the key numbers. Customize opens every number as a slider.
 *
 * The right-hand side is this one attack on its own map, with the side view
 * under it, both drawn from the attack exactly as Save would write it — so a
 * planner sees what a number does while dragging it, not after.
 */
export function AttackEditor({ attack, onClose, onSaved, weapons, fuzeOptions, aircraft, threatSystems = [] }: AttackEditorProps) {
  const { addAttack, updateAttack, setFocusAttackId } = useMissionStore();
  // Auto-build is threat-aware, so it must only ever see threats this planner
  // may see, or the geometry would give a hidden SAM's position away. The
  // preview map draws its rings from the same filtered mission.
  const mission = useVisibleMission();
  const profiles = useProfileStore((s) => s.profiles);
  const profilesLoaded = useProfileStore((s) => s.loaded);

  // The pilot's picks
  const [targetWaypointId, setTargetWaypointId] = useState(attack?.targetWaypointId ?? '');
  const [attackerId, setAttackerId] = useState(attack?.attackerId ?? '');
  const [weaponId, setWeaponId] = useState(attack?.weaponId ?? '');
  const [profileId, setProfileId] = useState<string | undefined>(attack?.sourceProfileId);
  // A saved attack re-opens with the run-in it was built with — action point,
  // check turn, flank — so the toggle shows what its card says and auto-build
  // reproduces its heading.
  const saved =
    attack && !attack.customized
      ? (attack.profile as { actionRange_nm?: number; offsetAngle_deg?: number; offsetDirection?: Side; offsetLegRatio?: number })
      : undefined;
  // Constants, not state: the editor remounts for each open, so these never
  // change during a session. They were useState values whose setters were never
  // called, which read as though the run-in could be re-seeded mid-edit.
  const actionRangeOverride = saved?.actionRange_nm;
  const offsetLegRatioOverride = saved?.offsetLegRatio;
  const offsetTurnOverride = saved?.offsetAngle_deg;
  const [angleOffSide, setAngleOffSide] = useState<Side | undefined>(saved?.offsetDirection);
  const [egressOverride, setEgressOverride] = useState<'left' | 'right' | undefined>(undefined);

  // Weapon details
  const [fuzeId, setFuzeId] = useState(attack?.fuzeId ?? '');
  const [releaseQuantity, setReleaseQuantity] = useState(attack?.releaseQuantity ?? 1);
  const [releaseMode, setReleaseMode] = useState<Attack['releaseMode']>(attack?.releaseMode ?? 'single');

  // Where the run-in starts: Auto (the prior numeric waypoint), a chosen
  // waypoint, or a custom point placed on the preview map / dialed in as a
  // radial and distance off the target. Feeds autoBuildAttack, so the hint,
  // the geometry and the drawn picture all agree.
  const initialIpFor = () =>
    mission
      ? initialIpChoice(
          mission.waypoints,
          mission.waypoints.find((wp) => wp.id === attack?.targetWaypointId),
          (attack?.profile as IpAnchorFields | undefined) ?? {},
        )
      : { mode: 'auto' as const };
  const [ipMode, setIpMode] = useState<IpChoiceMode>(() => initialIpFor().mode);
  const [ipWaypointId, setIpWaypointId] = useState<string | undefined>(() => initialIpFor().ipWaypointId);
  const [customIp, setCustomIp] = useState<Coordinates | undefined>(() => initialIpFor().customIp);
  /** Armed by "Place on map": the next click on the preview map drops the custom IP. */
  const [picking, setPicking] = useState(false);

  // Customize: once the planner changes a number, auto-build stops overwriting
  // the profile. Opening the panel alone changes nothing.
  const [customized, setCustomized] = useState(Boolean(attack && (attack.customized || !attack.sourceProfileId)));
  const [showCustomize, setShowCustomize] = useState(Boolean(attack && (attack.customized || !attack.sourceProfileId)));
  const [customProfile, setCustomProfile] = useState<AttackProfile | undefined>(attack?.profile);
  // The three above are seeded from `attack` only once, at mount, via
  // useState's initializer form — if this editor instance is ever pointed at
  // a different attack without a full unmount (the normal path unmounts via
  // `showEditor &&`, but nothing here depends on that holding true in every
  // caller), they'd carry over stale until the next edit or reset. Re-derive
  // explicitly whenever the attack being edited changes, keyed on id alone so
  // an unrelated re-render with a fresh `attack` object reference (same
  // attack, new store snapshot) doesn't stomp in-progress edits.
  const attackId = attack?.id;
  useEffect(() => {
    setCustomized(Boolean(attack && (attack.customized || !attack.sourceProfileId)));
    setShowCustomize(Boolean(attack && (attack.customized || !attack.sourceProfileId)));
    setCustomProfile(attack?.profile);
  }, [attackId]);

  const flightMembers = mission?.flightMembers ?? [];
  // Every waypoint, not only `target`-typed ones: the type is our guess at the
  // creator's free-text name, and plenty of missions name nothing at all.
  const targetWaypoints = targetCandidates(mission?.waypoints ?? []);
  const attacker = flightMembers.find((fm) => fm.id === attackerId);
  const selectedTarget = mission?.waypoints.find((wp) => wp.id === targetWaypointId);
  // Any waypoint can be the one the jet flies in from — the previous target,
  // for a chained attack, or anything else the planner picks off the map. The
  // default is still the prior numeric waypoint, applied by `resolveIp`.
  const ipWaypoints = ipCandidates(mission?.waypoints ?? [], selectedTarget?.id);
  // What "Auto" resolves to. Deliberately `inferIp`, not `build.ipWaypoint`:
  // once an override is set the build resolves to the override, and labelling
  // the Auto option with that would have it claim auto meant the planner's pick.
  const autoIpWaypoint = mission && selectedTarget ? inferIp(mission, selectedTarget) : undefined;

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
        actionRange_nm: actionRangeOverride,
        offsetLegRatio: offsetLegRatioOverride,
        offsetTurn_deg: offsetTurnOverride,
        angleOffSide,
        ipWaypointId: ipMode === 'waypoint' ? ipWaypointId : undefined,
        customIp: ipMode === 'custom' ? customIp : undefined,
        egressDirection: egressOverride,
      },
    });
  }, [mission, targetWaypointId, attackerId, weapons, profiles, threatSystems, weaponId, profileId, actionRangeOverride, offsetLegRatioOverride, offsetTurnOverride, angleOffSide, ipMode, ipWaypointId, customIp, egressOverride]);

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

  const checks = effectiveProfile
    ? runAttackChecks({
        profileType: profileType ?? 'popup_ccip',
        profile: effectiveProfile,
        weapon: selectedWeapon ?? null,
        targetElevation_ft: selectedTarget?.elevation_ft,
        weaponClass: selectedWeapon ? weaponClassOf(selectedWeapon) : undefined,
        allowedClasses: build?.profile?.weaponClasses,
        sourceProfileName: build?.profile?.name,
        directBearing_deg: build?.directBearing,
      })
    : [];

  const problems = build?.problems ?? [];
  const canSave = Boolean(mission && effectiveProfile && profileType && problems.length === 0 && !hasErrors(checks));

  // A form's change is the planner's first (or next) hand edit: from here on
  // the profile is theirs, and auto-build no longer rewrites it.
  const editProfile = (next: AttackProfile) => {
    setCustomized(true);
    setCustomProfile(next);
  };

  const resetToProfile = () => {
    setCustomized(false);
    setCustomProfile(undefined);
    // The IP is part of what the profile decides, so resetting returns it to
    // the auto waypoint too — otherwise a hand-picked IP survived a reset and
    // quietly kept driving the geometry.
    setIpMode('auto');
    setIpWaypointId(undefined);
    setCustomIp(undefined);
    setPicking(false);
  };

  // Picking a flank is not a reason to throw away hand-typed numbers. When the
  // profile has been customized, apply the change to it; otherwise auto-build
  // will pick it up from the override.
  const chooseIngress = (side: Side) => {
    setAngleOffSide(side);
    if (customized && customProfile) {
      setCustomProfile(applyFlank(customProfile, side, build?.directBearing, selectedTarget?.elevation_ft ?? 0));
    }
  };
  const chooseEgress = (side: 'left' | 'right') => {
    setEgressOverride(side);
    if (customized && customProfile) setCustomProfile(applyEgress(customProfile, side));
  };

  // The IP belongs to the attack, not to one profile type, so it lives here
  // rather than in each form — every profile type carries the same
  // ipWaypointId/customIp fields (IpAnchorFields). When the profile has been
  // customized the new IP must be written into it, headings and all
  // (`moveIp`), or `effectiveProfile` would save the new IP with the old
  // heading, and the card would print a heading its own picture disagrees with.
  //
  // Picking "Auto" while customized still writes a concrete waypoint id —
  // today's resolved one — rather than leaving it undefined: customizing
  // means freezing the numbers, the same way a hand-picked flank or egress
  // side survives further route edits instead of continuing to auto-track.
  //
  // Read through a ref updated every render: a marker drag calls back through
  // a handler the map captured earlier, by which point `customized` or
  // `customProfile` may have moved on.
  const latest = useRef({ customized, customProfile, mission, selectedTarget });
  latest.current = { customized, customProfile, mission, selectedTarget };
  const writeIpThrough = (mode: IpChoiceMode, waypointId: string | undefined, point: Coordinates | undefined) => {
    const { customized, customProfile, mission, selectedTarget } = latest.current;
    if (!customized || !customProfile || !mission || !selectedTarget) return;
    const resolvedWaypointId = mode === 'custom' ? undefined : mode === 'waypoint' ? waypointId : resolveIp(mission, selectedTarget, undefined)?.id;
    setCustomProfile(
      moveIp(customProfile, { ipWaypointId: resolvedWaypointId, customIp: mode === 'custom' ? point : undefined }, mission.waypoints, selectedTarget),
    );
  };

  const chooseIpAuto = () => {
    setIpMode('auto');
    setIpWaypointId(undefined);
    setCustomIp(undefined);
    setPicking(false);
    writeIpThrough('auto', undefined, undefined);
  };

  const chooseIpWaypoint = (id: string) => {
    const next = id || undefined;
    setIpMode('waypoint');
    setIpWaypointId(next);
    setCustomIp(undefined);
    setPicking(false);
    writeIpThrough('waypoint', next, undefined);
  };

  const chooseIpCustomMode = () => {
    const seeded = customIp ?? (selectedTarget ? seedCustomIp(selectedTarget, build?.ipAnchor) : undefined);
    setIpMode('custom');
    setIpWaypointId(undefined);
    setCustomIp(seeded);
    writeIpThrough('custom', undefined, seeded);
  };

  // A drag of the IP marker, a click while picking, or a radial/distance change.
  const placeCustomIp = useCallback((point: Coordinates) => {
    setIpMode('custom');
    setIpWaypointId(undefined);
    setCustomIp(point);
    setPicking(false);
    writeIpThrough('custom', undefined, point);
    // writeIpThrough reads everything it needs through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ipFields = customIp && selectedTarget ? ipFieldsFor(selectedTarget.coordinates, customIp) : undefined;
  const setIpRadial = (radial: number) => {
    if (!selectedTarget || !ipFields) return;
    const point = ipPointFromFields(selectedTarget.coordinates, String(radial), ipFields.distance);
    if (point) placeCustomIp(point);
  };
  const setIpDistance = (distance: number) => {
    if (!selectedTarget || !ipFields) return;
    const point = ipPointFromFields(selectedTarget.coordinates, ipFields.radial, String(distance));
    if (point) placeCustomIp(point);
  };

  // The attack exactly as Save would write it. The preview map and the side
  // view draw this, so what is on screen is what gets saved.
  const draftData = useMemo((): Omit<Attack, 'id'> | undefined => {
    if (!mission || !effectiveProfile || !profileType) return undefined;
    const base = build?.attack;
    return {
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
  }, [mission, effectiveProfile, profileType, build?.attack, targetWaypointId, attackerId, weaponId, fuzeId, releaseQuantity, releaseMode, attack, customized]);
  const draftAttack = useMemo((): Attack | undefined => (draftData ? { ...draftData, id: attack?.id ?? 'draft' } : undefined), [draftData, attack?.id]);
  const draftIpAnchor = useMemo(() => (draftAttack && mission ? attackIpAnchor(mission.waypoints, draftAttack) : undefined), [draftAttack, mission]);

  const handleSave = () => {
    if (!canSave || !draftData) return;
    if (attack) {
      updateAttack(attack.id, draftData);
      setFocusAttackId(attack.id);
    } else {
      setFocusAttackId(addAttack(draftData));
    }
    onSaved?.();
    onClose();
  };

  const fmtHdg = (h: number | undefined) => (h != null && Number.isFinite(h) ? `${Math.round(h).toString().padStart(3, '0')}°` : '---');
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const egress = (effectiveProfile as { egressDirection?: string } | undefined)?.egressDirection ?? 'right';

  // The run-in as it will be flown, read off whatever profile will be saved,
  // so a customized attack shows its own story and the toggle stays honest.
  const runIn: RunInSummary | undefined =
    effectiveProfile && build?.directBearing != null
      ? describeRunIn(effectiveProfile, build.directBearing, selectedTarget?.elevation_ft ?? 0)
      : build?.runIn;
  const ingressSideShown: Side | undefined = runIn?.offsetTurn.direction;
  const angleOffIsAuto = angleOffSide == null && !customized;
  const autoNote = angleOffIsAuto ? ' · auto: away from the nearest threat' : '';
  const angleOffHint =
    !build?.ipAnchor || build.directBearing == null
      ? 'No waypoint before the target in the route — pick one, or place a custom point, under Customize → Run in from'
      : !runIn
        ? ''
        : !runIn.closes
          ? `Check turn ${Math.round(runIn.offsetTurn.deg)}° at ${runIn.actionRange_nm} nm is too wide — the picture does not close; fix it in Customize`
          : `Route ${fmtHdg(runIn.directBearing)} to ${round1(runIn.actionRange_nm)} nm, turn ${runIn.offsetTurn.direction} ${Math.round(runIn.offsetTurn.deg)}° → ${fmtHdg(runIn.approachHeading)}; ${runIn.joinLabel} at ${runIn.joinRange_nm.toFixed(1)} nm ${runIn.joinTurn.direction} onto ${fmtHdg(runIn.attackHeading)}${autoNote}`;

  // Escape (or ×) while waiting for a map click backs out of the click, not the editor.
  const handleClose = () => (picking ? setPicking(false) : onClose());

  return (
    <Modal title={attack ? 'Edit Attack' : 'Add Attack'} onClose={handleClose} fill>
      <div className="flex h-full gap-4">
        {/* ── Controls ── */}
        <div className="w-[460px] shrink-0 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {/* The picks */}
            <div className="space-y-3">
              <div>
                <label className={label}>Target</label>
                <select className={select} style={{ colorScheme: 'dark' }} value={targetWaypointId} onChange={(e) => setTargetWaypointId(e.target.value)}>
                  <option value="">Select target…</option>
                  {targetWaypoints.map((wp) => (
                    <option key={wp.id} value={wp.id}>{waypointLabel(wp)}</option>
                  ))}
                </select>
                {selectedTarget && <div className="text-xs text-gray-400 mt-1">Elev {Math.round(selectedTarget.elevation_ft || 0).toLocaleString()} ft MSL</div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
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
            </div>

            {/* The profile: what the pilot is choosing between */}
            {attackerId && weaponId && (
              <div className="border border-gray-700 rounded-lg p-3">
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

                {/* The two big calls, side by side: which way to come in, which way to leave.
                    The degrees and the raw heading are in Customize. */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Ingress from</label>
                    <div className="flex gap-2">
                      {(['left', 'right'] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          onClick={() => chooseIngress(side)}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            ingressSideShown === side
                              ? 'bg-dcs-blue border-blue-400 text-white'
                              : 'bg-dcs-dark border-gray-600 text-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {side === 'left' ? '◀ Left' : 'Right ▶'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={label}>Egress</label>
                    <div className="flex gap-2">
                      {(['left', 'right'] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          onClick={() => chooseEgress(side)}
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
                <div className="text-xs text-gray-400 mt-2">{angleOffHint}</div>

                {effectiveProfile && <KeyNumbers profile={effectiveProfile} />}

                {/* These describe what auto-build did. Once the numbers are
                    hand-edited they no longer describe what is on screen, so they
                    are withdrawn rather than left to mislead. */}
                {!customized && build?.adjustments.length ? (
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
                onClick={() => setShowCustomize(!showCustomize)}
                className="w-full flex items-center justify-between px-3 py-3 text-left"
              >
                <span className="font-semibold">{showCustomize ? '▾' : '▸'} Customize {customized && <span className="text-xs text-amber-300 ml-2">edited from {build?.profile?.name ?? 'profile'}</span>}</span>
                {customized && (
                  <span role="button" className="text-xs text-gray-400 hover:text-white" onClick={(e) => { e.stopPropagation(); resetToProfile(); }}>
                    reset to profile
                  </span>
                )}
              </button>

              {showCustomize && (
                <div className="px-3 pb-4 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={label}>Fuze</label>
                      <select className={select} style={{ colorScheme: 'dark' }} value={fuzeId} onChange={(e) => setFuzeId(e.target.value)} disabled={!weaponId}>
                        <option value="">Default</option>
                        {weaponId && fuzeOptions.get(weaponId)?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Release</label>
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

                  <div>
                    <label className={label}>Run in from (IP)</label>
                    <div className="flex gap-2 mb-2">
                      {([
                        ['auto', 'Auto'],
                        ['waypoint', 'Waypoint'],
                        ['custom', 'Custom point'],
                      ] as const).map(([mode, text]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => (mode === 'auto' ? chooseIpAuto() : mode === 'waypoint' ? chooseIpWaypoint(ipWaypointId ?? '') : chooseIpCustomMode())}
                          disabled={!selectedTarget}
                          className={`flex-1 py-1.5 rounded-lg text-sm border transition-colors ${
                            ipMode === mode ? 'bg-dcs-blue border-blue-400 text-white' : 'bg-dcs-dark border-gray-600 text-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {text}
                        </button>
                      ))}
                    </div>

                    {ipMode === 'auto' && (
                      <div className="text-xs text-gray-400">
                        {autoIpWaypoint ? `Auto — ${waypointLabel(autoIpWaypoint)}` : 'Auto — no prior waypoint'}
                      </div>
                    )}

                    {ipMode === 'waypoint' && (
                      <select
                        className={select}
                        style={{ colorScheme: 'dark' }}
                        value={ipWaypointId ?? ''}
                        onChange={(e) => chooseIpWaypoint(e.target.value)}
                        disabled={!selectedTarget}
                      >
                        <option value="">
                          {autoIpWaypoint ? `Auto — ${waypointLabel(autoIpWaypoint)}` : 'Auto — no prior waypoint'}
                        </option>
                        {ipWaypoints.map((wp) => (
                          <option key={wp.id} value={wp.id}>{waypointLabel(wp)}</option>
                        ))}
                      </select>
                    )}

                    {ipMode === 'custom' && selectedTarget && (
                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={() => setPicking(true)}
                          className={`w-full py-1.5 rounded-lg text-sm border transition-colors ${
                            picking ? 'bg-dcs-accent border-dcs-accent text-white' : 'border-gray-600 bg-dcs-dark text-gray-200 hover:border-gray-400'
                          }`}
                        >
                          📍 {picking ? 'Click the map…' : 'Place on map'}
                        </button>
                        <SliderField
                          label="Radial from target"
                          range={IP_KNOB_RANGES.radial_deg}
                          value={ipFields ? Number(ipFields.radial) : undefined}
                          onChange={setIpRadial}
                          disabled={!ipFields}
                        />
                        <SliderField
                          label="Distance"
                          range={IP_KNOB_RANGES.distance_nm}
                          value={ipFields ? Number(ipFields.distance) : undefined}
                          onChange={setIpDistance}
                          disabled={!ipFields}
                        />
                        <div className="text-xs text-gray-400">
                          {customIp && ipFields
                            ? `→ run-in ${Math.round((Number(ipFields.radial) + 180) % 360).toString().padStart(3, '0')}° · ${formatCoordinatesDMS(customIp)} · drag the IP on the map to move it`
                            : 'Click "Place on map", then drag the IP marker or use the sliders.'}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-gray-400 mt-1">
                      Defaults to the waypoint before the target; pick a waypoint or drop a custom point to override.
                    </div>
                  </div>

                  {effectiveProfile?.type === 'dive_ccip' && (
                    <DiveForm profile={effectiveProfile as DiveCCIPProfile} onChange={editProfile} directBearing_deg={build?.directBearing} />
                  )}
                  {effectiveProfile?.type === 'level_ccrp' && (
                    <LevelForm profile={effectiveProfile as LevelCCRPProfile} targetElevation_ft={selectedTarget?.elevation_ft ?? 0} onChange={editProfile} directBearing_deg={build?.directBearing} />
                  )}
                  {effectiveProfile?.type === 'popup_ccip' && (
                    <PopupCCIPForm
                      profile={effectiveProfile as PopupCCIPProfile}
                      targetElevation={selectedTarget?.elevation_ft || 0}
                      selectedWeapon={selectedWeapon ?? null}
                      onChange={editProfile}
                      directBearing_deg={build?.directBearing}
                    />
                  )}
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
          </div>

          <div className="flex justify-end gap-3 pt-3 mt-3 border-t border-gray-700">
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

        {/* ── The attack, live ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-700">
            <AttackPreviewMap
              attack={draftAttack}
              ipAnchor={draftIpAnchor}
              targetWaypoint={selectedTarget}
              waypoints={mission?.waypoints ?? []}
              threats={mission?.threats ?? []}
              threatSystems={threatSystems}
              flightMembers={flightMembers}
              customIp={ipMode === 'custom' ? customIp : undefined}
              onMoveCustomIp={placeCustomIp}
              picking={picking}
              onPick={placeCustomIp}
              onCancelPick={() => setPicking(false)}
            />
          </div>
          {runIn && effectiveProfile && <RunInReadout runIn={runIn} profile={effectiveProfile} />}
          <div className="h-[220px] shrink-0 rounded-lg overflow-hidden border border-gray-700">
            <SideProfileView attack={draftAttack} targetElevation_ft={selectedTarget?.elevation_ft ?? 0} />
          </div>
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
      text = `Roll in ${ft(profile.rollInAltitude_ft)} AGL · ${profile.diveAngle_deg}° dive · Release by ${ft(profile.releaseAltitude_ft)} AGL @ ${Math.round(profile.releaseSpeed_ktas)} kt · ${profile.pulloutG} G`;
      break;
    case 'level_ccrp':
      text = `Level ${ft(profile.releaseAltitude_ft)} MSL @ ${Math.round(profile.releaseSpeed_ktas)} kt`;
      break;
    case 'popup_ccip':
      text = `Run-in ${ft(profile.runInAltitude_ft)} AGL @ ${profile.runInSpeed_ktas} kt · Pop ${profile.popDistance_nm.toFixed(1)} nm · Climb ${Math.round(profile.climbAngle_deg)}° to ${ft(profile.apexAltitude_ft)} · Pull down ${ft(profile.rollInAltitude_ft)} · ${profile.diveAngle_deg}° dive · Release by ${ft(profile.releaseAltitude_ft)} AGL`;
      break;
    default:
      text = '';
  }
  return <div className="mt-3 text-sm font-mono text-gray-200 bg-dcs-dark rounded px-3 py-2">{text}</div>;
}

/**
 * The run-in's numbers in one strip under the map, so they move with the
 * slider being dragged: where the turn is, where the attack starts, which way
 * it points, and for level, what the offset leg costs.
 */
function RunInReadout({ runIn, profile }: { runIn: RunInSummary; profile: AttackProfile }) {
  const hdg = (h: number) => `${Math.round(((h % 360) + 360) % 360).toString().padStart(3, '0')}°`;
  const egressProfile = profile as { egressDirection?: 'left' | 'right' | 'straight'; egressHeading_deg?: number };
  const cells: [string, string][] = [
    ['Route', hdg(runIn.directBearing)],
    ['Action point', `${runIn.actionRange_nm.toFixed(1)} nm`],
    ['Check turn', `${runIn.offsetTurn.direction === 'left' ? 'L' : 'R'} ${Math.round(runIn.offsetTurn.deg)}° → ${hdg(runIn.approachHeading)}`],
    [runIn.joinLabel.replace(/^./, (c) => c.toUpperCase()), `${runIn.joinRange_nm.toFixed(1)} nm`],
    ['Attack hdg', runIn.closes ? hdg(runIn.attackHeading) : 'does not close'],
    ['Egress', hdg(resolveEgressHeading(egressProfile, runIn.attackHeading))],
  ];
  if (runIn.legLength_nm != null) cells.push(['Offset leg', `${runIn.legLength_nm.toFixed(1)} nm${runIn.legTime_s ? ` · ${Math.round(runIn.legTime_s)} s` : ''}`]);
  if (runIn.axisOffset_deg != null) cells.push(['Axis off line', `${Math.round(runIn.axisOffset_deg)}°`]);
  if (runIn.angleOff_deg != null) cells.push(['Angle-off', `${Math.round(runIn.angleOff_deg)}°`]);

  return (
    <div className={`shrink-0 rounded-lg px-3 py-2 flex flex-wrap gap-x-5 gap-y-1 ${runIn.closes ? 'bg-dcs-dark' : 'bg-red-950'}`}>
      {cells.map(([k, v]) => (
        <div key={k} className="text-xs">
          <span className="text-gray-400">{k} </span>
          <span className="font-mono text-gray-100">{v}</span>
        </div>
      ))}
    </div>
  );
}
