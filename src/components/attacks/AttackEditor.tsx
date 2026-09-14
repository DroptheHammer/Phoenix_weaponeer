import { useEffect, useMemo, useRef, useState } from 'react';
import { useMissionStore } from '../../stores/missionStore';
import { useProfileStore } from '../../stores/profileStore';
import { useUiStore } from '../../stores/uiStore';
import { Modal } from '../common/Modal';
import { PopupCCIPForm } from './forms/PopupCCIPForm';
import { DiveForm } from './forms/DiveForm';
import { LevelForm } from './forms/LevelForm';
import { autoBuildAttack, loadoutWeapons, resolveIp, inferIp } from '../../lib/autoBuildAttack';
import { initialIpChoice, ipFieldsFor, ipPointFromFields, seedCustomIp, type IpChoiceMode } from '../../lib/ipAnchor';
import { formatCoordinatesDMS } from '../../lib/coordinates';
import { runAttackChecks, hasErrors } from '../../lib/attackChecks';
import { type Side } from '../../lib/attackGeometry';
import { describeRunIn, type RunInSummary } from '../../lib/runIn';
import { applyFlank, applyEgress } from '../../lib/attackFlank';
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
 * Attack editor, auto-build first.
 *
 * Target, attacker and weapon are the pilot's picks; the aircraft's delivery
 * profile library supplies everything else and the result is complete with
 * no alerts. What the pilot sees on the basic path is the big decisions —
 * profile, which way and how far to angle off the IP→target line, which way
 * to egress — and the key numbers. Customize opens the full form for anyone
 * who wants to change them.
 */
export function AttackEditor({ attack, onClose, onSaved, weapons, fuzeOptions, aircraft, threatSystems = [] }: AttackEditorProps) {
  const { mission, addAttack, updateAttack, setFocusAttackId } = useMissionStore();
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

  // Customize: once the planner touches the numbers, auto-build stops overwriting them.
  // Where the run-in starts: Auto (the prior numeric waypoint), a chosen
  // waypoint, or a custom point placed on the map / dialed in as a radial and
  // distance off the target. Feeds autoBuildAttack, so the hint, the geometry
  // and the drawn picture all agree — the pick used to move only the drawing.
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
  /** Non-null only while the planner is typing; the displayed value re-derives from customIp otherwise. */
  const [ipFields, setIpFields] = useState<{ radial: string; distance: string } | null>(null);
  const mapPick = useUiStore((s) => s.mapPick);
  const requestMapPick = useUiStore((s) => s.requestMapPick);
  const setIpDraft = useUiStore((s) => s.setIpDraft);

  const [customized, setCustomized] = useState(Boolean(attack && (attack.customized || !attack.sourceProfileId)));
  const [showCustomize, setShowCustomize] = useState(Boolean(attack && (attack.customized || !attack.sourceProfileId)));
  const [customProfile, setCustomProfile] = useState<AttackProfile | undefined>(attack?.profile);
  // The three above are seeded from `attack` only once, at mount, via
  // useState's initializer form — if this editor instance is ever pointed at
  // a different attack without a full unmount (the normal path unmounts via
  // `showEditor &&`, but nothing here depends on that holding true in every
  // caller), they'd carry over stale until `startCustomizing`/`resetToProfile`
  // next ran. Re-derive explicitly whenever the attack being edited changes,
  // keyed on id alone so an unrelated re-render with a fresh `attack` object
  // reference (same attack, new store snapshot) doesn't stomp in-progress edits.
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

  const startCustomizing = () => {
    if (!customized) setCustomProfile(build?.attack?.profile);
    setCustomized(true);
    setShowCustomize(true);
  };

  const resetToProfile = () => {
    setCustomized(false);
    // `customized` and `showCustomize` move together everywhere else — the
    // toggle button always opens *into* customizing (startCustomizing) and
    // never shows the panel without it. Leaving showCustomize on here (its
    // only other caller is the delivery-mode switch below) broke that: the
    // panel stayed open with customized/customProfile cleared, so the
    // per-type form (gated on customized) vanished until the triangle was
    // toggled twice. Collapsing keeps the invariant, and here it just means
    // "Customize" again shows the plain auto-built summary until reopened.
    setShowCustomize(false);
    setCustomProfile(undefined);
    // The IP is part of what the profile decides, so resetting returns it to
    // the auto waypoint too — otherwise a hand-picked IP survived a reset and
    // quietly kept driving the geometry.
    setIpMode('auto');
    setIpWaypointId(undefined);
    setCustomIp(undefined);
    setIpFields(null);
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
  // rather than in each form — every profile type now carries the same
  // ipWaypointId/customIp fields (IpAnchorFields), so the write-through below
  // applies uniformly. When the profile has been customized it must be
  // written through as well, or `effectiveProfile` would save the old IP.
  //
  // Picking "Auto" while customized still writes a concrete waypoint id —
  // today's resolved one — rather than leaving it undefined: customizing
  // means freezing the numbers, the same way a hand-picked flank or egress
  // side survives further route edits instead of continuing to auto-track.
  //
  // Read through a ref updated every render, not the render's own closed-over
  // variables: `ipDraft.onMove` (below) is captured once when the effect
  // runs and invoked later, from a map drag, by which point `customized` or
  // `customProfile` may have moved on — a stale closure here would silently
  // drop the drag or clobber edits made since.
  const latest = useRef({ customized, customProfile, mission, selectedTarget });
  latest.current = { customized, customProfile, mission, selectedTarget };
  const writeIpThrough = (mode: IpChoiceMode, waypointId: string | undefined, point: Coordinates | undefined) => {
    const { customized, customProfile, mission, selectedTarget } = latest.current;
    if (!customized || !customProfile || !mission || !selectedTarget) return;
    const resolvedWaypointId = mode === 'custom' ? undefined : mode === 'waypoint' ? waypointId : resolveIp(mission, selectedTarget, undefined)?.id;
    setCustomProfile({ ...customProfile, ipWaypointId: resolvedWaypointId, customIp: mode === 'custom' ? point : undefined } as AttackProfile);
  };

  const chooseIpAuto = () => {
    setIpMode('auto');
    setIpWaypointId(undefined);
    setCustomIp(undefined);
    setIpFields(null);
    writeIpThrough('auto', undefined, undefined);
  };

  const chooseIpWaypoint = (id: string) => {
    const next = id || undefined;
    setIpMode('waypoint');
    setIpWaypointId(next);
    setCustomIp(undefined);
    setIpFields(null);
    writeIpThrough('waypoint', next, undefined);
  };

  const chooseIpCustomMode = () => {
    const seeded = customIp ?? (selectedTarget ? seedCustomIp(selectedTarget, build?.ipAnchor) : undefined);
    setIpMode('custom');
    setIpWaypointId(undefined);
    setCustomIp(seeded);
    setIpFields(null);
    writeIpThrough('custom', undefined, seeded);
  };

  const placeCustomIpOnMap = () => {
    if (!selectedTarget) return;
    requestMapPick({
      kind: 'customIp',
      prompt: 'Click the map to place the custom IP',
      onPick: (point) => {
        setIpMode('custom');
        setIpWaypointId(undefined);
        setCustomIp(point);
        setIpFields(null);
        writeIpThrough('custom', undefined, point);
      },
    });
  };

  const handleIpFieldChange = (field: 'radial' | 'distance', value: string) => {
    const current = ipFields ?? (customIp && selectedTarget ? ipFieldsFor(selectedTarget.coordinates, customIp) : { radial: '', distance: '' });
    const next = { ...current, [field]: value };
    setIpFields(next);
    if (!selectedTarget) return;
    const point = ipPointFromFields(selectedTarget.coordinates, next.radial, next.distance);
    if (point) {
      setCustomIp(point);
      writeIpThrough('custom', undefined, point);
    }
  };
  const handleIpFieldBlur = () => setIpFields(null);

  // The custom IP marker on the map, while it's being edited here: draws
  // draggable, and a drag calls straight back into setCustomIp via onMove
  // (see uiStore's MapPick/ipDraft doc comment) rather than the map writing
  // the point back through a second channel.
  useEffect(() => {
    if (ipMode !== 'custom' || !customIp) {
      setIpDraft(null);
      return;
    }
    setIpDraft({
      attackId: attack?.id ?? null,
      point: customIp,
      onMove: (point) => {
        setCustomIp(point);
        setIpFields(null);
        writeIpThrough('custom', undefined, point);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipMode, customIp, attack?.id]);
  useEffect(() => () => setIpDraft(null), [setIpDraft]);

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
    if (attack) {
      updateAttack(attack.id, data);
      setFocusAttackId(attack.id);
    } else {
      setFocusAttackId(addAttack(data));
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

  // How far off the direct line the attack arrives. The azimuth split between
  // two attackers is what the leg is really buying, but it reads off the map
  // once two attacks are plotted — naming it here only puzzles someone
  // planning a single ship.
  const legHint =
    runIn?.legLength_nm != null
      ? `Leg ${runIn.legLength_nm.toFixed(1)} nm${runIn.legTime_s ? ` (${Math.round(runIn.legTime_s)} s)` : ''} · axis ${Math.round(runIn.axisOffset_deg ?? 0)}° off the line`
      : undefined;

  return (
    <Modal title={attack ? 'Edit Attack' : 'Add Attack'} onClose={onClose} widthClass="w-[860px]" hidden={!!mapPick}>
      <div className="space-y-5">
        {/* The picks */}
        <div className="grid grid-cols-3 gap-4">
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

            {/* The two big calls, side by side: which way to come in, which way to leave.
                The degrees and the raw heading are in Customize. */}
            <div className="grid grid-cols-2 gap-4">
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
                <div className="text-xs text-gray-400 mt-1">
                  <div>{angleOffHint}</div>
                  {legHint && <div>{legHint}</div>}
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

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-3">
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

                  {ipMode === 'custom' && selectedTarget && (() => {
                    const fields = ipFields ?? (customIp ? ipFieldsFor(selectedTarget.coordinates, customIp) : { radial: '', distance: '' });
                    const runInHeading = fields.radial ? Math.round((Number(fields.radial) + 180) % 360) : undefined;
                    return (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={placeCustomIpOnMap}
                          className="w-full py-1.5 rounded-lg text-sm border border-gray-600 bg-dcs-dark text-gray-200 hover:border-gray-400 transition-colors"
                        >
                          📍 Place on map
                        </button>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Radial from target (°)</label>
                            <input
                              type="text"
                              className={select}
                              value={fields.radial}
                              onChange={(e) => handleIpFieldChange('radial', e.target.value)}
                              onBlur={handleIpFieldBlur}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Distance (nm)</label>
                            <input
                              type="text"
                              className={select}
                              value={fields.distance}
                              onChange={(e) => handleIpFieldChange('distance', e.target.value)}
                              onBlur={handleIpFieldBlur}
                            />
                          </div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {customIp
                            ? `${runInHeading != null ? `→ run-in ${runInHeading.toString().padStart(3, '0')}° · ` : ''}${formatCoordinatesDMS(customIp)}`
                            : 'Click "Place on map", or type a radial and distance from the target.'}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="text-xs text-gray-400 mt-1">
                    Defaults to the waypoint before the target; pick a waypoint or drop a custom point to override.
                  </div>
                </div>
              </div>

              {customized && customProfile?.type === 'dive_ccip' && (
                <DiveForm profile={customProfile as DiveCCIPProfile} onChange={setCustomProfile} directBearing_deg={build?.directBearing} />
              )}
              {customized && customProfile?.type === 'level_ccrp' && (
                <LevelForm profile={customProfile as LevelCCRPProfile} targetElevation_ft={selectedTarget?.elevation_ft ?? 0} onChange={setCustomProfile} directBearing_deg={build?.directBearing} />
              )}
              {customized && customProfile?.type === 'popup_ccip' && (
                <PopupCCIPForm
                  profile={customProfile as PopupCCIPProfile}
                  targetElevation={selectedTarget?.elevation_ft || 0}
                  selectedWeapon={selectedWeapon ?? null}
                  onChange={setCustomProfile}
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
