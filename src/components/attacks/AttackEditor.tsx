import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useMissionStore } from '../../stores/missionStore';
import { useVisibleMission } from '../../hooks/useVisibleMission';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useProfileStore } from '../../stores/profileStore';
import { Modal } from '../common/Modal';
import { SideProfileView } from './SideProfileView';
import { JetPanel, type AircraftLite } from './JetPanel';
import { GroupPanel } from './GroupPanel';
import { JetStrip, JET_COLORS } from './JetStrip';
import { AttackPreviewMap, type PreviewAttack } from '../map/AttackPreviewMap';
import { draftAttackData, draftFromAttack, draftIpAnchor, resolveDraft, setIp, type DraftContext, type ResolvedDraft } from '../../lib/attackDraft';
import { newJet, newStrike, jetsOfStrike, respace, sortJets, setStrikeIp, strikeIpOf, syncJetIp, assignFlanks, leadSideOf, type Jet } from '../../lib/strikeDraft';
import { attackSpeedOf, coneGrade, fmtStrikeTime, strikeFlank, strikeOf, strikeReadout, type StrikeJet } from '../../lib/strike';
import { buildAttackPicture } from '../../lib/attackPicture';
import { resolveEgressHeading } from '../../lib/attackGeometry';
import { formatCallsign } from '../../lib/callsign';
import type { RunInSummary } from '../../lib/runIn';
import type { Attack, AttackProfile, Coordinates, DbWeapon, FuzeOption, IpAnchorFields, Mission, Strike } from '../../types';

interface ThreatSystemLite {
  id: string;
  max_range_nm: number;
}

interface AttackEditorProps {
  /** The attack to edit. A strike member opens its whole strike. */
  attack?: Attack;
  /** Open as a new strike with the flight's jets. */
  startStrike?: boolean;
  onClose: () => void;
  onSaved?: () => void;
  weapons: DbWeapon[];
  fuzeOptions: Map<string, FuzeOption[]>;
  aircraft: AircraftLite[];
  threatSystems?: ThreatSystemLite[];
}

const NO_THREAT_SYSTEMS: ThreatSystemLite[] = [];

interface EditorInit {
  strike?: Strike;
  jets: Jet[];
  tab: 'group' | number;
}

function initialState(mission: Mission | null, attack: Attack | undefined, startStrike: boolean | undefined): EditorInit {
  const existing = mission && attack ? strikeOf(mission, attack.strikeId) : undefined;
  if (mission && existing) {
    const jets = jetsOfStrike(mission, existing);
    return { strike: existing, jets, tab: Math.max(0, jets.findIndex((j) => j.attackId === attack!.id)) };
  }
  if (mission && startStrike) {
    const members = [...mission.flightMembers].sort((a, b) => a.position - b.position).slice(0, 4);
    const strike = newStrike(mission, members[0]?.id, uuidv4());
    return { strike, jets: respace(members.map((m) => newJet(mission, m.id, '', strike.ip)), strike.spacing_s), tab: 'group' };
  }
  return { jets: [{ draft: draftFromAttack(attack, mission), attackId: attack?.id, totOffset_s: 0 }], tab: 0 };
}

/**
 * Attack editor, auto-build first, with the attack drawn live beside it.
 *
 * Target, attacker and weapon are the pilot's picks; the aircraft's delivery
 * profile library supplies everything else and the result is complete with
 * no alerts. Customize opens every number as a slider.
 *
 * A strike is the same editor with one tab per jet and a Group tab for what
 * the jets share — the IP, the spacing, the lead's side (#2 mirrors it), and
 * numbers that reach every jet at once. The map shows every jet: the selected
 * one in full, the others as tracks in their own colours.
 */
export function AttackEditor({ attack, startStrike, onClose, onSaved, weapons, fuzeOptions, aircraft, threatSystems = NO_THREAT_SYSTEMS }: AttackEditorProps) {
  const { addAttack, updateAttack, saveStrike, setFocusAttackId } = useMissionStore();
  // Auto-build is threat-aware, so it must only ever see threats this planner
  // may see, or the geometry would give a hidden SAM's position away. The
  // preview map draws its rings from the same filtered mission.
  const mission = useVisibleMission();
  const profiles = useProfileStore((s) => s.profiles);
  const isPhone = useIsPhone();

  const [init] = useState(() => initialState(mission, attack, startStrike));
  const [strike, setStrike] = useState<Strike | undefined>(init.strike);
  const [jets, setJets] = useState<Jet[]>(init.jets);
  const [tab, setTab] = useState<'group' | number>(init.tab);
  /** Armed by "Place on map": the next click on the preview map drops the custom IP. */
  const [picking, setPicking] = useState(false);

  const ctx = useMemo<DraftContext | null>(
    () => (mission ? { mission, weapons, profiles, threatSystems } : null),
    [mission, weapons, profiles, threatSystems],
  );
  const resolved: ResolvedDraft[] = useMemo(() => (ctx ? jets.map((j) => resolveDraft(j.draft, ctx)) : []), [jets, ctx]);
  const selectedIndex = tab === 'group' ? 0 : Math.min(tab, jets.length - 1);

  // Every jet as it would save, and where its run-in starts.
  const drafts = useMemo(
    () =>
      jets.map((j, i) => {
        const data = mission ? draftAttackData(j.draft, resolved[i], mission.attacks.find((a) => a.id === j.attackId), mission.attacks.length + 1 + i) : undefined;
        const attackShape: Attack | undefined = data ? { ...data, id: j.attackId ?? `draft-${i}` } : undefined;
        return { data, attack: attackShape, ipAnchor: mission ? draftIpAnchor(attackShape, mission) : undefined };
      }),
    [jets, resolved, mission],
  );

  if (!mission || !ctx) return null;

  const callsignOf = (j: Jet, i: number) => {
    const fm = mission.flightMembers.find((m) => m.id === j.draft.attackerId);
    return fm ? formatCallsign(fm.callsign) : `Jet ${i + 1}`;
  };

  const updateJet = (i: number, draft: Jet['draft']) =>
    setJets(jets.map((j, k) => (k === i ? { ...j, draft: strike ? syncJetIp(draft, strike.ip, mission) : draft } : j)));

  const onStrikeIp = (ip: IpAnchorFields) => {
    if (!strike) return;
    setStrike({ ...strike, ip });
    setJets(setStrikeIp(jets, ip, mission));
    setPicking(false);
  };

  const placeCustomIp = (point: Coordinates) => {
    setPicking(false);
    if (strike) onStrikeIp({ customIp: point });
    else updateJet(0, setIp(jets[0].draft, 'custom', mission, undefined, point));
  };
  const customIp = strike ? strike.ip.customIp : jets[0]?.draft.ipMode === 'custom' ? jets[0].draft.customIp : undefined;

  /** Turn a single attack into a strike: this jet leads, the next pilot in the flight joins on the other side. */
  const makeStrike = () => {
    const lead = jets[0];
    const s = { ...newStrike(mission, lead.draft.attackerId, uuidv4()), ip: strikeIpOf(lead.draft) };
    const taken = new Set(jets.map((j) => j.draft.attackerId));
    const next = [...mission.flightMembers].sort((a, b) => a.position - b.position).find((m) => !taken.has(m.id));
    const js = next ? sortJets([...jets, newJet(mission, next.id, lead.draft.targetWaypointId, s.ip)], mission) : jets;
    // Keep the jet being edited on the side it already flies; the pattern
    // (lead's side, then mirrored) is worked out around it.
    const mySide = leadSideOf(jets, ctx) ?? 'right';
    const myIndex = js.findIndex((j) => j.draft === lead.draft);
    const leadSide = strikeFlank(myIndex, mySide);
    setStrike(s);
    setJets(respace(assignFlanks(js, ctx, leadSide), s.spacing_s));
    setTab('group');
  };

  const allSavable = jets.length > 0 && drafts.every((d, i) => d.data && resolved[i].canSave);
  const canSave = allSavable && (!strike || jets.length >= 2);

  const handleSave = () => {
    if (!canSave) return;
    if (strike) {
      const ids = saveStrike(
        strike,
        jets.map((j, i) => ({ id: j.attackId, data: drafts[i].data!, totOffset_s: i === 0 ? 0 : j.totOffset_s })),
      );
      setFocusAttackId(ids[selectedIndex] ?? ids[0]);
    } else {
      const data = drafts[0].data!;
      if (attack) {
        updateAttack(attack.id, data);
        setFocusAttackId(attack.id);
      } else {
        setFocusAttackId(addAttack(data));
      }
    }
    onSaved?.();
    onClose();
  };

  // Escape (or ×) while waiting for a map click backs out of the click, not the editor.
  const handleClose = () => (picking ? setPicking(false) : onClose());

  const previews: PreviewAttack[] = drafts.flatMap((d, i) =>
    d.attack ? [{ attack: d.attack, ipAnchor: d.ipAnchor, selected: i === selectedIndex, color: strike ? JET_COLORS[i % JET_COLORS.length] : undefined }] : [],
  );
  const selected = resolved[selectedIndex];

  const title = strike ? (jets.some((j) => j.attackId) ? 'Edit Strike' : 'Add Strike') : attack ? 'Edit Attack' : 'Add Attack';
  const modalTitle = strike ? `${title} — ${strike.name}` : title;

  // The pieces both layouts share; only where they sit differs.
  const jetStrip = strike && (
    <JetStrip
      labels={jets.map(callsignOf)}
      selected={tab}
      onSelect={setTab}
      blocked={jets.map((_, i) => !drafts[i].data || !resolved[i].canSave)}
    />
  );

  const controls =
    strike && tab === 'group' ? (
      <GroupPanel
        strike={strike}
        jets={jets}
        resolved={resolved}
        ctx={ctx}
        aircraft={aircraft}
        onStrike={setStrike}
        onJets={(js) => {
          setJets(js);
          if (tab !== 'group' && tab >= js.length) setTab('group');
        }}
        onStrikeIp={onStrikeIp}
        picking={picking}
        onArmPick={() => setPicking(true)}
      />
    ) : (
      jets[selectedIndex] && (
        <JetPanel
          key={selectedIndex}
          draft={jets[selectedIndex].draft}
          resolved={selected}
          ctx={ctx}
          onChange={(d) => updateJet(selectedIndex, d)}
          fuzeOptions={fuzeOptions}
          aircraft={aircraft}
          picking={picking}
          onArmPick={() => setPicking(true)}
          seat={
            strike
              ? {
                  isLead: selectedIndex === 0,
                  totOffset_s: jets[selectedIndex].totOffset_s,
                  onTotOffset: (s) => setJets(jets.map((j, k) => (k === selectedIndex ? { ...j, totOffset_s: s } : j))),
                  takenAttackerIds: jets.filter((_, k) => k !== selectedIndex).map((j) => j.draft.attackerId),
                }
              : undefined
          }
        />
      )
    );

  const canMakeStrike = !strike && mission.flightMembers.length > 1 && !!jets[0]?.draft.targetWaypointId;
  const saveLabel = strike ? 'Save strike' : `${attack ? 'Update' : 'Save'} attack`;

  const previewMap = (
    <AttackPreviewMap
      attacks={previews}
      targetWaypoint={selected?.target}
      waypoints={mission.waypoints}
      threats={mission.threats}
      threatSystems={threatSystems}
      flightMembers={mission.flightMembers}
      customIp={customIp}
      onMoveCustomIp={placeCustomIp}
      picking={picking}
      onPick={placeCustomIp}
      onCancelPick={() => setPicking(false)}
    />
  );

  const strikeReadout = strike && jets.length > 1 && (
    <StrikeReadoutStrip
      jets={jets.map<StrikeJet>((j, i) => {
        const a = drafts[i].attack;
        const target = resolved[i].target;
        return {
          label: `#${i + 1}`,
          picture: a && target ? buildAttackPicture(a, drafts[i].ipAnchor, target) : undefined,
          speed_ktas: resolved[i].profile ? attackSpeedOf(resolved[i].profile!) : undefined,
          totOffset_s: i === 0 ? 0 : j.totOffset_s,
          weapon: resolved[i].weapon,
        };
      })}
    />
  );

  const sideView = <SideProfileView attack={drafts[selectedIndex]?.attack} targetElevation_ft={selected?.target?.elevation_ft ?? 0} />;

  if (isPhone) {
    return (
      <Modal title={modalTitle} onClose={handleClose} fill>
        <PhoneEditorLayout
          map={previewMap}
          readout={selected?.runIn && selected.profile ? <RunInReadout runIn={selected.runIn} profile={selected.profile} chips /> : null}
          sideView={sideView}
          jetStrip={jetStrip}
          strikeReadout={strikeReadout}
          controls={controls}
          tabs={strike ? ['group', ...jets.map((_, i) => i)] : undefined}
          tab={tab}
          onTab={setTab}
          actions={
            <>
              {canMakeStrike && (
                <button type="button" onClick={makeStrike} className="mr-auto min-h-[44px] px-3 rounded text-sm border border-gray-600 text-gray-200">
                  + Wingman
                </button>
              )}
              {strike && jets.length < 2 && <span className="mr-auto text-xs text-amber-300">Add a second jet on the Group tab</span>}
              <button onClick={onClose} className="min-h-[44px] px-4 rounded bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className={`min-h-[44px] px-4 rounded transition-colors ${canSave ? 'bg-dcs-accent hover:bg-red-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
              >
                {saveLabel}
              </button>
            </>
          }
        />
      </Modal>
    );
  }

  return (
    <Modal title={modalTitle} onClose={handleClose} fill>
      <div className="flex h-full gap-4">
        {/* ── Controls ── */}
        <div className="w-[460px] shrink-0 flex flex-col min-h-0">
          {jetStrip}
          <div className="flex-1 overflow-y-auto pr-2">{controls}</div>

          <div className="flex items-center justify-end gap-3 pt-3 mt-3 border-t border-gray-700">
            {canMakeStrike && (
              <button
                type="button"
                onClick={makeStrike}
                className="mr-auto px-3 py-2 rounded text-sm border border-gray-600 text-gray-200 hover:border-gray-400"
                title="Plan this with the rest of the flight: shared IP, mirrored split, spacing over the target"
              >
                + Wingman (strike)
              </button>
            )}
            {strike && jets.length < 2 && <span className="mr-auto text-xs text-amber-300">Add a second jet on the Group tab</span>}
            <button onClick={onClose} className="px-6 py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={`px-6 py-2 rounded transition-colors ${canSave ? 'bg-dcs-accent hover:bg-red-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
            >
              {saveLabel}
            </button>
          </div>
        </div>

        {/* ── The attack, live ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-700">{previewMap}</div>
          {strikeReadout}
          {selected?.runIn && selected.profile && <RunInReadout runIn={selected.runIn} profile={selected.profile} />}
          <div className="h-[220px] shrink-0 rounded-lg overflow-hidden border border-gray-700">{sideView}</div>
        </div>
      </div>
    </Modal>
  );
}

/** A sideways swipe at least this long, and mostly sideways, moves between jets. */
const SWIPE_MIN_PX = 60;

interface PhoneEditorLayoutProps {
  map: ReactNode;
  readout: ReactNode;
  sideView: ReactNode;
  jetStrip: ReactNode;
  strikeReadout: ReactNode;
  controls: ReactNode;
  /** A strike's tabs in order (Group, then each jet); undefined for a single attack. */
  tabs?: ('group' | number)[];
  tab: 'group' | number;
  onTab: (tab: 'group' | number) => void;
  actions: ReactNode;
}

/**
 * The attack editor on a phone, one column top to bottom: the map pinned at
 * the top so a slider's effect is always in sight, the run-in numbers as a
 * chip row under it, the side view folded away until asked for, then the
 * controls scrolling beneath, and Save/Cancel fixed at the bottom. (The Modal
 * pads the page clear of the home bar, so the bar sits above it.)
 *
 * In a strike, a sideways swipe over the controls moves to the next or
 * previous tab. A swipe that starts on a slider or a box is that control's,
 * and a mostly-vertical drag is a scroll, so neither changes jet.
 *
 * Held sideways there is so little height that the map and the controls
 * can't both have a useful share of it, so landscape gives the controls the
 * whole screen and folds the map behind a "Show map" toggle instead. The map
 * itself stays mounted the whole time (just hidden), so Leaflet never has to
 * rebuild — it only needs telling its box changed size (`ResizeWatcher` in
 * `AttackPreviewMap` already does that off a `ResizeObserver`).
 */
function PhoneEditorLayout({ map, readout, sideView, jetStrip, strikeReadout, controls, tabs, tab, onTab, actions }: PhoneEditorLayoutProps) {
  const [showSide, setShowSide] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // A new tab is a new page of controls: start it at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    const onControl = (e.target as HTMLElement).closest('input, select, textarea');
    swipeStart.current = tabs && e.touches.length === 1 && !onControl ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || !tabs) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
    const next = tabs.indexOf(tab) + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < tabs.length) onTab(tabs[next]);
  };

  return (
    <div className="h-full flex flex-col landscape:relative">
      {/* Landscape only: the map's fold/unfold control, always reachable at
          the top regardless of whether the map is currently showing. */}
      <button
        type="button"
        onClick={() => setShowMap((v) => !v)}
        className="hidden landscape:flex shrink-0 h-9 items-center justify-center gap-1 text-sm border-b border-gray-700 bg-dcs-navy text-gray-200"
        aria-expanded={showMap}
      >
        {showMap ? '▴ Hide map' : '▾ Show map'}
      </button>

      {/* ── The attack, live: always on in portrait; in landscape it's
          folded away by default and overlays back in over the controls. ── */}
      <div
        className={`shrink-0 flex flex-col border-gray-700 ${
          showMap
            ? 'landscape:absolute landscape:inset-x-0 landscape:top-9 landscape:z-[2000] landscape:max-h-[calc(100%-2.25rem)] landscape:overflow-y-auto landscape:bg-dcs-navy landscape:shadow-2xl'
            : 'landscape:hidden'
        }`}
      >
        <div className="shrink-0 h-[35dvh] min-h-[160px] landscape:h-[200px] border-b border-gray-700">{map}</div>

        <div className="shrink-0 flex items-center gap-2 pl-3 pr-2 py-1 border-b border-gray-700">
          <div className="flex-1 min-w-0">{readout ?? <span className="text-xs text-gray-500">No run-in yet</span>}</div>
          <button
            type="button"
            onClick={() => setShowSide(!showSide)}
            className={`shrink-0 min-h-[44px] px-3 rounded-lg text-sm border transition-colors ${
              showSide ? 'bg-dcs-blue border-blue-400 text-white' : 'bg-dcs-dark border-gray-600 text-gray-300'
            }`}
            aria-expanded={showSide}
          >
            Side view {showSide ? '▾' : '▸'}
          </button>
        </div>
        {showSide && <div className="shrink-0 h-[150px] border-b border-gray-700">{sideView}</div>}
      </div>

      {/* ── Controls ── */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {jetStrip && <div className="shrink-0 px-3 py-2 border-b border-gray-700">{jetStrip}</div>}

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-3"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {strikeReadout}
          {controls}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-3 py-2 border-t border-gray-700 bg-dcs-navy">{actions}</div>
      </div>
    </div>
  );
}

/**
 * The strike as the defender and the flight lead see it: how far apart the
 * jets arrive in azimuth (graded against a fire-control cone), when each is
 * over the target and when it leaves the IP, and anything that doesn't
 * deconflict.
 */
function StrikeReadoutStrip({ jets }: { jets: StrikeJet[] }) {
  const r = strikeReadout(jets);
  const gradeColor = { good: 'text-green-400', marginal: 'text-amber-300', inside: 'text-red-400' } as const;
  return (
    <div className="shrink-0 rounded-lg px-3 py-2 bg-dcs-dark space-y-1">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {r.splits.map((s) => (
          <div key={`${s.a}${s.b}`}>
            <span className="text-gray-400">Split {s.a}–{s.b} </span>
            <span className={`font-mono ${gradeColor[coneGrade(s.deg)]}`}>{Math.round(s.deg)}°</span>
          </div>
        ))}
        {r.pushes.map((p, i) => (
          <div key={p.label}>
            <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: JET_COLORS[i % JET_COLORS.length] }} />
            <span className="text-gray-400">{p.label} TOT </span>
            <span className="font-mono text-gray-100">{fmtStrikeTime(p.tot_s)}</span>
            {p.push_s != null && (
              <>
                <span className="text-gray-400"> · push IP </span>
                <span className="font-mono text-gray-100">{fmtStrikeTime(p.push_s)}</span>
              </>
            )}
          </div>
        ))}
        <div className="text-gray-500">times est., relative to the lead's TOT</div>
      </div>
      {r.warnings.map((w) => (
        <div key={w} className="text-xs text-amber-300">⚠ {w}</div>
      ))}
    </div>
  );
}

/**
 * The run-in's numbers in one strip under the map, so they move with the
 * slider being dragged: where the turn is, where the attack starts, which way
 * it points, and for level, what the offset leg costs.
 *
 * `chips`: the phone's version, one row of chips that scrolls sideways, so
 * the numbers take one line under the map however many there are.
 */
function RunInReadout({ runIn, profile, chips = false }: { runIn: RunInSummary; profile: AttackProfile; chips?: boolean }) {
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

  if (chips) {
    return (
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar py-1">
        {cells.map(([k, v]) => (
          <div key={k} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${runIn.closes ? 'bg-dcs-dark' : 'bg-red-950'}`}>
            <span className="text-gray-400">{k} </span>
            <span className="font-mono text-gray-100">{v}</span>
          </div>
        ))}
      </div>
    );
  }

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
