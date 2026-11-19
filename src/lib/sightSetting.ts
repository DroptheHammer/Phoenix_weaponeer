/**
 * The sight setting a manual bomb attack prints: which figure, and its words
 * on the card and in the editor.
 *
 * Order: the pilot's own figure; a squadron profile's own number (while the
 * attack is still on that profile's numbers); the jet's table (sightTables.ts);
 * otherwise no figure, said in plain words. The card never names a document
 * or an author: credits are in the About dialog.
 */
import type { AttackProfile } from '../types/attack.types';
import type { DeliveryModeCode, WeaponClass } from '../types/profile.types';
import { SIGHT_SOURCES, lookupSight, tableFor, type SightLookup, type SightTable } from './sightTables';

export const SIGHT_OWN_RANGE = { min: 0, max: 400 };
/** The A-4E-C's computed dive: the mod's kneeboard has the sight at zero and the computer does the rest. */
const CP741_PROFILE_ID = 'a4ec.dive.cp741';

export type SightFigureKind = 'table' | 'est' | 'own' | 'profile' | 'cp741' | 'none';

export interface SightFigure {
  kind: SightFigureKind;
  mils?: number;
  /** The card's header words: "SIGHT 118 mils", "SIGHT 121 mils (est.)", "SIGHT — no figure (outside table)". */
  cardText: string;
  /** True when there is a number to set: the card adds "set before IP". */
  settable: boolean;
  /** The editor's key line: "Sight 121 mils (est. near F-5E table), set before IP". */
  editorText: string;
  /** One or two plain sentences for the editor: what the figure rests on, or why there is none. */
  hint: string;
  /** What the table gives without the pilot's own figure (for the box's placeholder). */
  auto?: SightFigure;
  /** The speed on the gauge the table was read at. */
  kias?: number;
  /** The document's own recovery warning applies to this figure. */
  rcvr?: boolean;
}

export interface SightInput {
  aircraftId: string;
  weaponId: string;
  weaponClass?: WeaponClass;
  deliveryMode?: DeliveryModeCode;
  sourceProfileId?: string;
  profile: AttackProfile;
  /** The target's height above sea level; a missing one counts as 0. */
  targetElevation_ft?: number;
  customized?: boolean;
  /** The pilot's own figure. */
  own_mils?: number;
  /** A squadron profile file's own number. */
  profile_mils?: number;
}

const usable = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= SIGHT_OWN_RANGE.min && v <= SIGHT_OWN_RANGE.max;

function figure(kind: SightFigureKind, mils: number, cardTag: string, editorTag: string, hint: string): SightFigure {
  const n = Math.round(mils);
  return {
    kind,
    mils: n,
    cardText: `SIGHT ${n} mils${cardTag ? ` (${cardTag})` : ''}`,
    settable: true,
    editorText: `Sight ${n} mils${editorTag ? ` (${editorTag})` : ''}, set before IP`,
    hint,
  };
}

function noFigure(cardWhy: string, editorWhy: string, hint: string): SightFigure {
  return {
    kind: 'none',
    cardText: `SIGHT — no figure${cardWhy ? ` (${cardWhy})` : ''}`,
    settable: false,
    editorText: `Sight: no figure${editorWhy ? `, ${editorWhy}` : ''} (type yours under Customize)`,
    hint,
  };
}

/** What the attack asks the table: dive, release height above the target, true airspeed. */
function attackNumbers(profile: AttackProfile, targetElevation_ft: number): { dive_deg: number; height_ft: number; speed_ktas: number } | null {
  if (profile.type === 'dive_ccip') return { dive_deg: profile.diveAngle_deg, height_ft: profile.releaseAltitude_ft, speed_ktas: profile.releaseSpeed_ktas };
  // A level release is saved above sea level; the tables are above the target.
  if (profile.type === 'level_ccrp') return { dive_deg: 0, height_ft: profile.releaseAltitude_ft - targetElevation_ft, speed_ktas: profile.releaseSpeed_ktas };
  return null;
}

function fromTable(table: SightTable, standIn: boolean, r: SightLookup): SightFigure {
  const rests = SIGHT_SOURCES[table.source]?.rests_on ?? '';
  const jet = table.tag.replace(/ table$/, '');
  const gauge = `${Math.round(r.kias)} kt on the gauge`;
  const withKias = (f: SightFigure): SightFigure => ({ ...f, kias: r.kias, ...(r.rcvr ? { rcvr: true } : {}) });
  if (r.kind === 'table') {
    return withKias(figure('table', r.mils!, '', table.tag, `The ${table.tag}'s own figure for this dive, height and ${gauge} (credited under About). ${rests}`));
  }
  if (r.kind === 'between' || r.kind === 'beyond') {
    const where = r.kind === 'between' ? 'from' : 'near';
    const how = standIn
      ? `Worked from the ${table.tag}, which is printed for another bomb (${table.store}); a different bomb falls a little differently.`
      : r.kind === 'between'
        ? `Worked between the ${table.tag}'s printed points, at ${gauge}.`
        : `Worked one step beyond the ${table.tag}'s printed points, at ${gauge}.`;
    return withKias(figure('est', r.mils!, 'est.', `est. ${where} ${table.tag}`, `${how} An estimate: the table's author has not checked it. ${rests}`));
  }
  const limit = r.dialMax_mils ?? table.dial_max_mils;
  if (r.noneReason === 'dial') {
    return withKias(noFigure(`over ${limit} mils`, `over the ${jet}'s ${limit}-mil limit`, `This attack needs more depression than the ${jet}'s sight can be set to (${limit} mils), by the ${table.tag}. Release lower, faster or steeper.`));
  }
  if (r.noneReason === 'marked') {
    return withKias(noFigure(`near ${limit}-mil limit`, `next to a point the ${table.tag} marks over ${limit} mils`, `The ${table.tag} marks the neighbouring point as over the sight's ${limit}-mil limit, so no figure can be worked here. Release lower, faster or steeper.`));
  }
  return withKias(noFigure('outside table', `outside the ${table.tag}`, `The ${table.tag} (${table.store}) has no printed point near this dive, height and ${gauge}. Type your own figure, or move the attack onto the table's own settings.`));
}

/**
 * The sight setting for an attack, or null when the attack has none to set
 * (not a manual delivery, not a bomb, or a level laydown nothing gives a
 * figure for).
 */
export function sightFigure(input: SightInput): SightFigure | null {
  const bomb = input.weaponClass === 'bomb_ld' || input.weaponClass === 'bomb_hd';
  if (input.sourceProfileId === CP741_PROFILE_ID && bomb) {
    return figure('cp741', 0, 'CP-741', 'CP-741', 'The CP-741/A computer releases the bomb; the mod\'s kneeboard has the sight at 0 mils for it.');
  }
  if (input.deliveryMode !== 'MAN' || !bomb) return null;

  const elevation = input.targetElevation_ft ?? 0;
  const numbers = attackNumbers(input.profile, elevation);
  let auto: SightFigure | null = null;
  if (usable(input.profile_mils) && !input.customized) {
    auto = figure('profile', input.profile_mils, 'profile', 'profile', 'The number this squadron profile carries, for the profile\'s own settings.');
  } else if (numbers) {
    const found = tableFor(input.aircraftId, input.weaponId);
    if (found) auto = fromTable(found.table, found.standIn, lookupSight(found.table, { ...numbers, targetElevation_ft: elevation }, found.standIn));
    else if (numbers.dive_deg > 0) auto = noFigure('no table', 'no table for this bomb', 'No sight table is on file for this jet with this bomb. Type your own figure.');
  }
  if (usable(input.own_mils)) {
    return { ...figure('own', input.own_mils, 'own', 'own', 'Your own figure. It stays until you clear it, whatever else you change.'), ...(auto ? { auto } : {}) };
  }
  return auto;
}
