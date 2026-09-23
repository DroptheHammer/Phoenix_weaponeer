import { useState } from 'react';
import type { Attack, AttackProfile, DbWeapon, DiveCCIPProfile, FuzeOption, LevelCCRPProfile, PopupCCIPProfile } from '../../types';
import {
  chooseEgress,
  chooseIngress,
  chooseIpCustom,
  chooseProfile,
  editProfile,
  ipFieldsOf,
  resetToProfile,
  setAttacker,
  setIp,
  setIpRadialDistance,
  setTarget,
  setWeapon,
  type AttackDraft,
  type DraftContext,
  type ResolvedDraft,
} from '../../lib/attackDraft';
import { loadoutWeapons } from '../../lib/autoBuildAttack';
import { weaponClassOf } from '../../lib/weaponClass';
import { formatCallsign } from '../../lib/callsign';
import { targetCandidates, ipCandidates, waypointLabel } from '../../lib/waypointOptions';
import { SliderField } from '../common/SliderField';
import { IpPicker } from './IpPicker';
import { PopupCCIPForm } from './forms/PopupCCIPForm';
import { DiveForm } from './forms/DiveForm';
import { LevelForm } from './forms/LevelForm';

export interface AircraftLite {
  id: string;
  name: string;
  dcs_module_name: string;
}

/** What a jet panel needs to know when the jet is one of a strike. */
export interface StrikeSeat {
  isLead: boolean;
  totOffset_s: number;
  onTotOffset: (s: number) => void;
  /** Attackers flying other jets in this strike; not offered here. */
  takenAttackerIds: string[];
}

interface JetPanelProps {
  draft: AttackDraft;
  resolved: ResolvedDraft;
  ctx: DraftContext;
  onChange: (draft: AttackDraft) => void;
  fuzeOptions: Map<string, FuzeOption[]>;
  aircraft: AircraftLite[];
  picking: boolean;
  onArmPick: () => void;
  /** Set when this jet is in a strike: the IP is the strike's, and the jet has a TOT offset. */
  seat?: StrikeSeat;
}

const select = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';
const fmtHdg = (h: number | undefined) => (h != null && Number.isFinite(h) ? `${Math.round(h).toString().padStart(3, '0')}°` : '---');
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * One jet's attack, as the planner edits it: the picks, the delivery and its
 * two big calls (which way in, which way out), and Customize with every
 * number. The standalone attack editor is this panel alone; a strike shows
 * one per jet.
 */
export function JetPanel({ draft, resolved, ctx, onChange, fuzeOptions, aircraft, picking, onArmPick, seat }: JetPanelProps) {
  const { mission, weapons } = ctx;
  const { build, target } = resolved;
  const [showCustomize, setShowCustomize] = useState(draft.customized);

  const flightMembers = mission.flightMembers.filter((fm) => !seat?.takenAttackerIds.includes(fm.id));
  // Every waypoint, not only `target`-typed ones: the type is our guess at the
  // creator's free-text name, and plenty of missions name nothing at all.
  const targetWaypoints = targetCandidates(mission.waypoints);
  const attacker = mission.flightMembers.find((fm) => fm.id === draft.attackerId);
  const ipWaypoints = ipCandidates(mission.waypoints, target?.id);
  // Weapon choices: what the attacker carries, else every A/G store.
  const carried = loadoutWeapons(attacker, weapons);
  const weaponChoices: DbWeapon[] = carried.length ? carried : weapons.filter((w) => weaponClassOf(w));

  const profile = resolved.profile;
  const runIn = resolved.runIn;
  const egress = (profile as { egressDirection?: string } | undefined)?.egressDirection ?? 'right';
  const ingressSideShown = runIn?.offsetTurn.direction;
  const angleOffIsAuto = draft.angleOffSide == null && !draft.customized;
  const autoNote = angleOffIsAuto ? ' · auto: away from the nearest threat' : '';
  const angleOffHint =
    !build.ipAnchor || build.directBearing == null
      ? 'No waypoint before the target in the route — pick one, or place a custom point, under Customize → Run in from'
      : !runIn
        ? ''
        : !runIn.closes
          ? `Check turn ${Math.round(runIn.offsetTurn.deg)}° at ${runIn.actionRange_nm} nm is too wide — the picture does not close; fix it in Customize`
          : `Route ${fmtHdg(runIn.directBearing)} to ${round1(runIn.actionRange_nm)} nm, turn ${runIn.offsetTurn.direction} ${Math.round(runIn.offsetTurn.deg)}° → ${fmtHdg(runIn.approachHeading)}; ${runIn.joinLabel} at ${runIn.joinRange_nm.toFixed(1)} nm ${runIn.joinTurn.direction} onto ${fmtHdg(runIn.attackHeading)}${autoNote}`;

  const edit = (next: AttackProfile) => onChange(editProfile(draft, next));

  return (
    <div className="space-y-4">
      {/* The picks */}
      <div className="space-y-3">
        <div>
          <label className={label}>{seat ? 'Target (this jet)' : 'Target'}</label>
          <select className={select} style={{ colorScheme: 'dark' }} value={draft.targetWaypointId} onChange={(e) => onChange(setTarget(draft, e.target.value))}>
            <option value="">Select target…</option>
            {targetWaypoints.map((wp) => (
              <option key={wp.id} value={wp.id}>{waypointLabel(wp)}</option>
            ))}
          </select>
          {target && <div className="text-xs text-gray-400 mt-1">Elev {Math.round(target.elevation_ft || 0).toLocaleString()} ft MSL</div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Attacker</label>
            <select className={select} style={{ colorScheme: 'dark' }} value={draft.attackerId} onChange={(e) => onChange(setAttacker(draft, e.target.value))}>
              <option value="">Select attacker…</option>
              {[...(attacker && !flightMembers.includes(attacker) ? [attacker] : []), ...flightMembers].map((fm) => {
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
              value={resolved.weaponId}
              onChange={(e) => onChange(setWeapon(draft, e.target.value))}
              disabled={!draft.attackerId}
            >
              <option value="">Select weapon…</option>
              {weaponChoices.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
        {seat && (
          <SliderField
            label={seat.isLead ? 'Over the target (lead: T+0)' : 'Over the target, seconds after the lead'}
            range={{ min: 0, max: 180, step: 5, unit: 's' }}
            value={seat.totOffset_s}
            disabled={seat.isLead}
            onChange={seat.onTotOffset}
          />
        )}
      </div>

      {/* The profile: what the pilot is choosing between */}
      {draft.attackerId && resolved.weaponId && (
        <div className="border border-gray-700 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Delivery</h3>
            {build.profile && (
              <span className={`text-xs px-2 py-0.5 rounded ${build.profile.verified ? 'bg-green-900 text-green-200' : 'bg-amber-900 text-amber-200'}`}>
                {build.profile.verified ? `Verified by ${build.profile.verifiedBy}` : 'ESTIMATED — not yet flown in DCS'}
              </span>
            )}
          </div>

          {build.candidates.length ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {build.candidates.map((p) => {
                const active = p.id === resolved.profileId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange(chooseProfile(draft, p.id))}
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
            ctx.profiles.length > 0 && <p className="text-sm text-amber-300 mb-3">No profile in the library for this aircraft and weapon yet.</p>
          )}

          {build.profile?.summary && <p className="text-sm text-gray-400 mb-3">{build.profile.summary}</p>}

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
                    onClick={() => onChange(chooseIngress(draft, side, resolved))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      ingressSideShown === side ? 'bg-dcs-blue border-blue-400 text-white' : 'bg-dcs-dark border-gray-600 text-gray-300 hover:border-gray-400'
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
                    onClick={() => onChange(chooseEgress(draft, side))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      egress === side ? 'bg-dcs-blue border-blue-400 text-white' : 'bg-dcs-dark border-gray-600 text-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {side === 'left' ? '◀ Left' : 'Right ▶'}
                  </button>
                ))}
              </div>
              {!draft.egressOverride && build.attack && <div className="text-xs text-gray-400 mt-1">Auto: away from the nearest threat</div>}
            </div>
          </div>
          <div className="text-xs text-gray-400 mt-2">{angleOffHint}</div>

          {profile && <KeyNumbers profile={profile} />}

          {/* These describe what auto-build did. Once the numbers are
              hand-edited they no longer describe what is on screen, so they
              are withdrawn rather than left to mislead. */}
          {!draft.customized && build.adjustments.length ? (
            <ul className="mt-3 text-sm text-amber-300 space-y-1">
              {build.adjustments.map((a) => <li key={a}>↑ {a}</li>)}
            </ul>
          ) : null}
        </div>
      )}

      {/* Weapon details + the numbers, behind Customize */}
      <div className="border border-gray-700 rounded-lg">
        <button type="button" onClick={() => setShowCustomize(!showCustomize)} className="w-full flex items-center justify-between px-3 py-3 text-left">
          <span className="font-semibold">
            {showCustomize ? '▾' : '▸'} Customize {draft.customized && <span className="text-xs text-amber-300 ml-2">edited from {build.profile?.name ?? 'profile'}</span>}
          </span>
          {draft.customized && (
            <span role="button" className="text-xs text-gray-400 hover:text-white" onClick={(e) => { e.stopPropagation(); onChange(resetToProfile(draft)); }}>
              reset to profile
            </span>
          )}
        </button>

        {showCustomize && (
          <div className="px-3 pb-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={label}>Fuze</label>
                <select className={select} style={{ colorScheme: 'dark' }} value={draft.fuzeId} onChange={(e) => onChange({ ...draft, fuzeId: e.target.value })} disabled={!resolved.weaponId}>
                  <option value="">Default</option>
                  {resolved.weaponId && fuzeOptions.get(resolved.weaponId)?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Release</label>
                <select className={select} style={{ colorScheme: 'dark' }} value={draft.releaseMode} onChange={(e) => onChange({ ...draft, releaseMode: e.target.value as Attack['releaseMode'] })}>
                  <option value="single">Single</option>
                  <option value="pair">Pair</option>
                  <option value="ripple">Ripple</option>
                </select>
              </div>
              <div>
                <label className={label}>Quantity</label>
                <input type="number" min="1" max="12" className={select} value={draft.releaseQuantity} onChange={(e) => onChange({ ...draft, releaseQuantity: parseInt(e.target.value) || 1 })} />
              </div>
            </div>

            {seat ? (
              <div className="text-xs text-gray-400">Run in from: the strike's IP — set on the Group tab for every jet.</div>
            ) : (
              <IpPicker
                mode={draft.ipMode}
                ipWaypointId={draft.ipWaypointId}
                customIp={draft.customIp}
                fields={ipFieldsOf(draft, resolved)}
                hasTarget={!!target}
                autoIpWaypoint={resolved.autoIpWaypoint}
                ipWaypoints={ipWaypoints}
                picking={picking}
                onAuto={() => onChange(setIp(draft, 'auto', mission))}
                onWaypoint={(id) => onChange(setIp(draft, 'waypoint', mission, id))}
                onCustom={() => onChange(chooseIpCustom(draft, resolved, mission))}
                onPlace={onArmPick}
                onRadialDistance={(change) => onChange(setIpRadialDistance(draft, resolved, mission, change))}
              />
            )}

            <ProfileForm profile={profile} targetElevation_ft={target?.elevation_ft ?? 0} weapon={resolved.weapon} directBearing_deg={build.directBearing} onChange={edit} />
          </div>
        )}
      </div>

      {/* Anything standing between the planner and a card */}
      <Problems resolved={resolved} />
    </div>
  );
}

/** The per-type Customize form, fed whatever profile will be saved. */
export function ProfileForm({
  profile,
  targetElevation_ft,
  weapon,
  directBearing_deg,
  onChange,
}: {
  profile: AttackProfile | undefined;
  targetElevation_ft: number;
  weapon: DbWeapon | undefined;
  directBearing_deg: number | undefined;
  onChange: (profile: AttackProfile) => void;
}) {
  if (profile?.type === 'dive_ccip') return <DiveForm profile={profile as DiveCCIPProfile} onChange={onChange} directBearing_deg={directBearing_deg} />;
  if (profile?.type === 'level_ccrp')
    return <LevelForm profile={profile as LevelCCRPProfile} targetElevation_ft={targetElevation_ft} onChange={onChange} directBearing_deg={directBearing_deg} />;
  if (profile?.type === 'popup_ccip')
    return (
      <PopupCCIPForm
        profile={profile as PopupCCIPProfile}
        targetElevation={targetElevation_ft}
        selectedWeapon={weapon ?? null}
        onChange={onChange}
        directBearing_deg={directBearing_deg}
      />
    );
  return null;
}

export function Problems({ resolved, prefix }: { resolved: ResolvedDraft; prefix?: string }) {
  return (
    <>
      {resolved.problems.length > 0 && (
        <ul className="text-sm text-yellow-300 border border-yellow-700 bg-yellow-900 bg-opacity-20 rounded p-3 space-y-1">
          {resolved.problems.map((p) => <li key={p}>• {prefix ? `${prefix}: ` : ''}{p}</li>)}
        </ul>
      )}
      {resolved.checks.length > 0 && (
        <div className="text-sm border border-red-800 bg-red-950 bg-opacity-40 rounded p-3 space-y-1">
          <div className="font-semibold text-red-300">{prefix ? `${prefix} will` : 'This attack will'} print with warnings:</div>
          {resolved.checks.map((c) => (
            <div key={c.text} className={c.level === 'error' ? 'text-red-400' : 'text-yellow-400'}>⚠ {c.text}</div>
          ))}
        </div>
      )}
    </>
  );
}

/** The numbers a pilot actually flies, in one line. */
export function KeyNumbers({ profile }: { profile: AttackProfile }) {
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
