import type { IpAnchorFields, Strike } from '../../types';
import type { DraftContext, ResolvedDraft } from '../../lib/attackDraft';
import { ipFieldsFor, ipPointFromFields, seedCustomIp } from '../../lib/ipAnchor';
import { formatCallsign } from '../../lib/callsign';
import { targetCandidates, ipCandidates, waypointLabel } from '../../lib/waypointOptions';
import { fragClearTime_s } from '../../lib/strike';
import {
  assignFlanks,
  chooseStrikeProfile,
  groupEdit,
  leadSideOf,
  newJet,
  respace,
  setStrikeTarget,
  sortJets,
  type Jet,
} from '../../lib/strikeDraft';
import { strikeFlank } from '../../lib/strike';
import { chooseIngress, resolveDraft } from '../../lib/attackDraft';
import { SliderField } from '../common/SliderField';
import { IpPicker } from './IpPicker';
import { ProfileForm, Problems, type AircraftLite } from './JetPanel';
import { JET_COLORS } from './JetStrip';

interface GroupPanelProps {
  strike: Strike;
  jets: Jet[];
  resolved: ResolvedDraft[];
  ctx: DraftContext;
  aircraft: AircraftLite[];
  onStrike: (strike: Strike) => void;
  onJets: (jets: Jet[]) => void;
  onStrikeIp: (ip: IpAnchorFields) => void;
  picking: boolean;
  onArmPick: () => void;
}

const select = 'w-full bg-gray-700 text-white p-2 rounded border border-gray-600';
const label = 'block text-sm font-medium mb-1';

/**
 * What the jets of a strike share: the target, who is flying, which side the
 * lead takes (the others mirror it), the spacing over the target, the IP, the
 * profile, and the numbers — a number changed here reaches every jet flying
 * the same delivery, each keeping its own side.
 */
export function GroupPanel({ strike, jets, resolved, ctx, aircraft, onStrike, onJets, onStrikeIp, picking, onArmPick }: GroupPanelProps) {
  const { mission } = ctx;
  const lead = jets[0];
  const leadResolved = resolved[0];
  const leadTarget = leadResolved?.target;
  const strikeTargetId = lead?.draft.targetWaypointId ?? '';
  const leadSide = leadSideOf(jets, ctx);
  const frag = Math.max(0, ...resolved.map((r) => fragClearTime_s(r.weapon)));

  const toggleMember = (memberId: string) => {
    const inStrike = jets.some((j) => j.draft.attackerId === memberId);
    if (inStrike) {
      // Offsets count from the lead, so if the lead left, the next jet becomes T+0.
      const remaining = jets.filter((j) => j.draft.attackerId !== memberId);
      const base = remaining[0]?.totOffset_s ?? 0;
      onJets(remaining.map((j) => ({ ...j, totOffset_s: j.totOffset_s - base })));
      return;
    }
    const added = sortJets([...jets, newJet(mission, memberId, strikeTargetId, strike.ip)], mission);
    const index = added.findIndex((j) => j.draft.attackerId === memberId);
    const side = strikeFlank(index, leadSide ?? 'right');
    onJets(
      added.map((j, i) =>
        i === index
          ? { ...j, draft: chooseIngress(j.draft, side, resolveDraft(j.draft, ctx)), totOffset_s: index * strike.spacing_s }
          : j,
      ),
    );
  };

  const ipFields = strike.ip.customIp && leadTarget ? ipFieldsFor(leadTarget.coordinates, strike.ip.customIp) : undefined;
  const ipMode = strike.ip.customIp ? 'custom' : strike.ip.ipWaypointId ? 'waypoint' : 'auto';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Strike</label>
          <input className={select} value={strike.name} onChange={(e) => onStrike({ ...strike, name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Target</label>
          <select
            className={select}
            style={{ colorScheme: 'dark' }}
            value={strikeTargetId}
            onChange={(e) => onJets(assignFlanks(setStrikeTarget(jets, strikeTargetId, e.target.value), ctx))}
          >
            <option value="">Select target…</option>
            {targetCandidates(mission.waypoints).map((wp) => (
              <option key={wp.id} value={wp.id}>{waypointLabel(wp)}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>Jets</label>
        {/* One per row on a phone, so a callsign never breaks across lines, and each row is a thumb's height. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[...mission.flightMembers]
            .sort((a, b) => a.position - b.position)
            .map((fm) => {
              const index = jets.findIndex((j) => j.draft.attackerId === fm.id);
              const ac = aircraft.find((a) => a.id === fm.aircraftId);
              return (
                <label key={fm.id} className="flex items-center gap-2 text-sm bg-dcs-dark rounded px-2 py-1.5 max-md:min-h-[44px] cursor-pointer">
                  <input type="checkbox" checked={index >= 0} onChange={() => toggleMember(fm.id)} disabled={index === 0 && jets.length === 1} />
                  {index >= 0 && <span className="w-2.5 h-2.5 rounded-full" style={{ background: JET_COLORS[index % JET_COLORS.length] }} />}
                  <span>{formatCallsign(fm.callsign)}</span>
                  <span className="text-xs text-gray-400 truncate">{ac?.name ?? fm.aircraftId}</span>
                </label>
              );
            })}
        </div>
        {jets.length < 2 && <div className="text-xs text-amber-300 mt-1">A strike needs at least two jets.</div>}
      </div>

      {/* One column on a phone: a slider squeezed into half its width can't be dragged. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={label}>Lead in from</label>
          <div className="flex gap-2">
            {(['left', 'right'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => onJets(assignFlanks(jets, ctx, side))}
                disabled={!strikeTargetId}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  leadSide === side ? 'bg-dcs-blue border-blue-400 text-white' : 'bg-dcs-dark border-gray-600 text-gray-300 hover:border-gray-400'
                }`}
              >
                {side === 'left' ? '◀ Left' : 'Right ▶'}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-400 mt-1">#2 mirrors the lead; #3 and #4 repeat the pair. Flip one jet on its own tab.</div>
        </div>
        <SliderField
          label="Spacing over the target"
          range={{ min: 0, max: 120, step: 5, unit: 's' }}
          value={strike.spacing_s}
          onChange={(s) => {
            onStrike({ ...strike, spacing_s: s });
            onJets(respace(jets, s));
          }}
          hint={frag > 0 ? `Frag clears in ~${frag} s (est.)` : undefined}
        />
      </div>

      <IpPicker
        mode={ipMode}
        ipWaypointId={strike.ip.ipWaypointId}
        customIp={strike.ip.customIp}
        fields={ipFields}
        hasTarget={!!leadTarget}
        autoIpWaypoint={leadResolved?.autoIpWaypoint}
        ipWaypoints={ipCandidates(mission.waypoints, leadTarget?.id)}
        picking={picking}
        onAuto={() => onStrikeIp({})}
        onWaypoint={(id) => onStrikeIp(id ? { ipWaypointId: id } : {})}
        onCustom={() => leadTarget && onStrikeIp({ customIp: strike.ip.customIp ?? seedCustomIp(leadTarget, leadResolved.build.ipAnchor) })}
        onPlace={onArmPick}
        onRadialDistance={(change) => {
          if (!leadTarget || !ipFields) return;
          const point = ipPointFromFields(
            leadTarget.coordinates,
            change.radial != null ? String(change.radial) : ipFields.radial,
            change.distance != null ? String(change.distance) : ipFields.distance,
          );
          if (point) onStrikeIp({ customIp: point });
        }}
        note="Every jet runs in from here. Auto: each jet from the waypoint before its own target."
      />

      {leadResolved && leadResolved.build.candidates.length > 0 && (
        <div>
          <label className={label}>Profile</label>
          <div className="flex flex-wrap gap-2">
            {leadResolved.build.candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onJets(chooseStrikeProfile(jets, p.id, ctx))}
                title={p.summary}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  p.id === leadResolved.profileId ? 'bg-dcs-accent border-dcs-accent text-white' : 'bg-dcs-dark border-gray-600 text-gray-200 hover:border-gray-400'
                }`}
              >
                {p.name} <span className="text-xs opacity-70">· {p.deliveryMode}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {leadResolved?.profile && (
        <div className="border border-gray-700 rounded-lg p-3 space-y-3">
          <div>
            <h3 className="font-semibold">Numbers for the whole strike</h3>
            <div className="text-xs text-gray-400">
              Shown for the lead. A change reaches every jet flying this delivery; each keeps its own side, IP bearing and egress.
            </div>
          </div>
          <ProfileForm
            profile={leadResolved.profile}
            targetElevation_ft={leadTarget?.elevation_ft ?? 0}
            weapon={leadResolved.weapon}
            directBearing_deg={leadResolved.build.directBearing}
            onChange={(next) => onJets(groupEdit(jets, next, ctx))}
          />
        </div>
      )}

      {jets.map((j, i) => {
        const fm = mission.flightMembers.find((m) => m.id === j.draft.attackerId);
        return <Problems key={i} resolved={resolved[i]} prefix={fm ? formatCallsign(fm.callsign) : `#${i + 1}`} />;
      })}
    </div>
  );
}
