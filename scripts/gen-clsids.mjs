// Regenerates crates/core/src/parsers/clsid_data.rs: DCS store CLSID -> DCS
// display name.
//
// The FragOrders CLI writes a jet's pylons as CLSIDs ("{40EF17B7-F508-45de-8566-
// 6FFECC0C1AB8}", "{HB_F4E_MK-82_6x}", "LAU-115_2*LAU-127_AIM-120C"), where the
// public link writes display names ("Mk-82 - 500lb GP Bomb LD"). The import's
// store rules read display names, so this table is the bridge. Nothing here is
// typed by hand: every CLSID and name comes from one of two public sources, each
// pinned to a commit so a regeneration is a deliberate, reviewable bump.
//
// 1. pydcs `dcs/weapons_data.py`: DCS's own stores, exported from the game. Each
//    entry pairs a "clsid" with a "name".
// 2. The A-4E-C community mod (Community-A-4E/community-a4e-c): its own stores,
//    which pydcs does not carry. The mod's weapon file builds many names in Lua,
//    so they are rebuilt here from the same patterns, for the shapes listed in
//    `modStores` below, and nothing else. Whatever the mod builds some other way
//    (the `make_cbu_a4e_multi` dispenser racks and the BLU bomblet groups, which
//    its aircraft file does not list) is left out, never guessed. The aircraft
//    file's own pylon lists are read as a check: every CLSID in them must end up
//    named, and any that is not is printed.
//
// Where the two disagree about a CLSID, pydcs wins and the conflict is printed.
//
// Run: npm run gen-clsids, then cargo test (the store_mapping tests check the
// table's order and a sample of names). The script fetches over the network; the
// Rust build never does. Behind an HTTP proxy, Node 24+ needs NODE_USE_ENV_PROXY=1.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PYDCS_SHA = '5ddcc63a2dcd661e16b14f7aa43219b93044855d';
const A4E_SHA = '34c1ef439581234ee24d4bde2e13a54999ebaa5a';

const PYDCS_URL = `https://raw.githubusercontent.com/pydcs/dcs/${PYDCS_SHA}/dcs/weapons_data.py`;
const A4E_BASE = `https://raw.githubusercontent.com/Community-A-4E/community-a4e-c/${A4E_SHA}/A-4E-C`;
const A4E_WEAPONS_URL = `${A4E_BASE}/Weapons/A4E_Weapons.lua`;
const A4E_AIRCRAFT_URL = `${A4E_BASE}/A-4E-C.lua`;

const OUT = fileURLToPath(new URL('../crates/core/src/parsers/clsid_data.rs', import.meta.url));

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return response.text();
}

// ---------------------------------------------------------------- pydcs

/** The body of a Python string literal. Python keeps an unknown escape such as
 * `\*` as a backslash and the character, which is what pydcs itself reads. */
function pythonString(literal) {
  return literal.slice(1, -1).replace(/\\(.)/g, (all, c) => {
    if (c === '"' || c === "'" || c === '\\') return c;
    if (/[xuUN0-7abfnrtv]/.test(c)) throw new Error(`unhandled Python escape ${all} in ${literal}`);
    return all;
  });
}

function parsePydcs(source) {
  const line = /^    \w+ = \{"clsid": ("(?:[^"\\]|\\.)*"), "name": ("(?:[^"\\]|\\.)*"), "weight": [^}]*\}$/;
  const entries = [];
  for (const text of source.split('\n')) {
    if (!text.startsWith('    ') || !text.includes('"clsid"')) continue;
    const match = text.match(line);
    if (!match) throw new Error(`pydcs line not understood: ${text.slice(0, 160)}`);
    entries.push({ clsid: pythonString(match[1]), name: pythonString(match[2]) });
  }
  if (entries.length < 1000) throw new Error(`only ${entries.length} pydcs entries parsed`);

  // The file's own index, `weapon_ids`, lists every CLSID once: it must agree.
  const indexed = new Set();
  for (const text of source.split('\n')) {
    const match = text.match(/^    ("(?:[^"\\]|\\.)*"): Weapons\.\w+,?$/);
    if (match) indexed.add(pythonString(match[1]));
  }
  const parsed = new Set(entries.map((entry) => entry.clsid));
  if (parsed.size !== entries.length) throw new Error('duplicate CLSID in pydcs entries');
  if (indexed.size !== parsed.size || [...indexed].some((clsid) => !parsed.has(clsid))) {
    throw new Error(`pydcs entries (${parsed.size}) and its weapon_ids index (${indexed.size}) disagree`);
  }
  return entries;
}

// ------------------------------------------------------------------ Lua
//
// Just enough Lua to read the A-4E-C weapon file: comments, strings, balanced
// brackets, and `key = value` tables. Anything it does not understand throws or
// is reported, so a mod update cannot slip in a wrong name unnoticed.

/** The source with comments (`--`, `--[[ ]]`) blanked out; strings kept whole. */
function stripLuaComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '-' && src[i + 1] === '-') {
      const long = src.slice(i + 2).match(/^\[(=*)\[/);
      if (long) {
        const close = `]${long[1]}]`;
        const end = src.indexOf(close, i + 2 + long[0].length);
        if (end < 0) throw new Error('unterminated Lua block comment');
        out += ' ';
        i = end + close.length;
      } else {
        while (i < src.length && src[i] !== '\n') i += 1;
      }
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** The index of the bracket that closes the one at `open`. */
function matchingBracket(src, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i += 1;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
    } else if (pairs[c]) {
      stack.push(pairs[c]);
    } else if (c === ')' || c === '}' || c === ']') {
      if (stack.pop() !== c) throw new Error(`unbalanced bracket at ${i}`);
      if (stack.length === 0) return i;
    }
  }
  throw new Error(`no closing bracket for ${open}`);
}

/** A Lua string literal's value. */
function luaString(literal) {
  return literal.slice(1, -1).replace(/\\(.)/g, (all, c) => {
    if (c === '"' || c === "'" || c === '\\') return c;
    throw new Error(`unhandled Lua escape ${all} in ${literal}`);
  });
}

/** Splits a table body on its top-level commas and semicolons. */
function splitTopLevel(body) {
  const items = [];
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '"' || c === "'") {
      i += 1;
      while (i < body.length && body[i] !== c) i += body[i] === '\\' ? 2 : 1;
    } else if (c === '(' || c === '{' || c === '[') {
      i = matchingBracket(body, i);
    } else if (c === ',' || c === ';') {
      items.push(body.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  items.push(body.slice(start));
  return items.map((item) => item.trim()).filter(Boolean);
}

/** `{ key = value, ["key"] = value }` as a Map of key to the value's text. */
function fieldMap(tableText) {
  const text = tableText.trim();
  if (!text.startsWith('{') || matchingBracket(text, 0) !== text.length - 1) {
    throw new Error(`not a Lua table: ${text.slice(0, 80)}`);
  }
  const fields = new Map();
  for (const item of splitTopLevel(text.slice(1, -1))) {
    const match = item.match(/^(?:\[\s*("(?:[^"\\]|\\.)*")\s*\]|([A-Za-z_]\w*))\s*=(?!=)\s*([\s\S]*)$/);
    if (match) fields.set(match[1] ? luaString(match[1]) : match[2], match[3].trim());
  }
  return fields;
}

/** The table a global or local is assigned: `NAME = {`, `local NAME =\n{`. */
function tableAssignedTo(src, name) {
  const found = new RegExp(`(?:^|\\n)[ \\t]*(?:local[ \\t]+)?${name}[ \\t]*=\\s*\\{`).exec(src);
  if (!found) return null;
  const open = found.index + found[0].length - 1;
  return src.slice(open, matchingBracket(src, open) + 1);
}

/** A field's text as a string value: `"x"`, `_("x")`, or `NAME.displayName`
 * where NAME is a table in the file. Null for anything else (built in code). */
function stringValue(src, valueText) {
  const text = valueText.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return luaString(text);
  const wrapped = text.match(/^_\(\s*("(?:[^"\\]|\\.)*")\s*\)$/);
  if (wrapped) return luaString(wrapped[1]);
  const reference = text.match(/^([A-Za-z_]\w*)\.displayName$/);
  if (reference) {
    const table = tableAssignedTo(src, reference[1]);
    const display = table && fieldMap(table).get('displayName');
    return display === undefined ? null : stringValue(src, display);
  }
  return null;
}

/** A `["key"] = { name = ... }` table in the file, as key to the fields' Map. */
function keyedTable(src, name) {
  const table = tableAssignedTo(src, name);
  if (!table) throw new Error(`table ${name} not found in the mod's weapon file`);
  const keyed = new Map();
  for (const [key, value] of fieldMap(table)) {
    if (value.startsWith('{')) keyed.set(key, fieldMap(value));
  }
  return keyed;
}

// ------------------------------------------------------------- the A-4E-C

/**
 * The stores the mod's weapon file defines, as { clsid, name } plus a list of
 * what was seen but not rebuilt. The shapes read, each exactly as the mod's
 * Lua builds its name:
 *
 *  - `declare_loadout({ CLSID = "..", displayName = .. })` with a literal CLSID
 *    and a literal name (or one taken from another table's `displayName`);
 *  - `rackme_a4e(element, count, side)`: a bomb on a TER or MER, CLSID
 *    `{<element>_<TER|MER>_<count>_<L|C|R>}`, name `<count> x <bomb name> (TER|MER)`;
 *  - `CreateRocketLoadout(key)`: a rocket pod on a TER, four racks per pod;
 *  - `CreateDispenserLoadout(key)`: a cluster dispenser, alone and on a TER;
 *  - `LoadAGM45(.., name, clsid)` and `aim_9_with_adapter(clsid, variant)`.
 *
 * Not rebuilt: `make_cluster_group_loadout` and `make_cbu_a4e_multi`, whose
 * names depend on submunition tables that are computed in code.
 */
function modStores(weaponsLua) {
  const src = stripLuaComments(weaponsLua);
  const stores = [];
  const add = (clsid, name, how) => stores.push({ clsid, name, how });
  const sides = { '-1': 'L', 0: 'C', 1: 'R' };
  const sideLetter = (side) => {
    if (!(side in sides)) throw new Error(`unexpected rack side ${side}`);
    return sides[side];
  };

  // 1. declare_loadout({ ... }), or declare_loadout(name) of a table assigned
  //    elsewhere, with a literal CLSID and a name.
  let literalTables = 0;
  const addTable = (tableText) => {
    const fields = fieldMap(tableText);
    const clsid = fields.get('CLSID');
    const clsidLiteral = clsid && /^"(?:[^"\\]|\\.)*"$/.test(clsid) ? luaString(clsid) : null;
    const name = fields.has('displayName') ? stringValue(src, fields.get('displayName')) : null;
    if (clsidLiteral && name) {
      add(clsidLiteral, name, 'literal');
      literalTables += 1;
    }
  };
  for (const call of src.matchAll(/declare_loadout\(\s*\{/g)) {
    const open = call.index + call[0].length - 1;
    addTable(src.slice(open, matchingBracket(src, open) + 1));
  }
  for (const call of src.matchAll(/declare_loadout\(\s*([A-Za-z_]\w*)\s*\)/g)) {
    const table = tableAssignedTo(src, call[1]);
    if (table) addTable(table);
  }

  // 2. Bombs on TER and MER racks.
  const bombs = keyedTable(src, 'bomb_data');
  for (const call of src.matchAll(/rackme_a4e\(\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(-?\d+)\s*\)/g)) {
    const [, element, countText, sideText] = call;
    const count = Number(countText);
    const bomb = bombs.get(element);
    if (!bomb) throw new Error(`rackme_a4e: no bomb_data entry for ${element}`);
    const name = stringValue(src, bomb.get('name') ?? '');
    if (!name) throw new Error(`rackme_a4e: bomb_data ${element} has no readable name`);
    if (count < 1 || count > 6) throw new Error(`rackme_a4e: count ${count}`);
    const rack = count <= 3 ? 'TER' : 'MER'; // rackme_a4e: bru_42 up to 3, bru_41 up to 6
    add(`{${element}_${rack}_${count}_${sideLetter(Number(sideText))}}`, `${count} x ${name} (${rack})`, 'rack');
  }

  // 3. Rocket pods on a TER (bru_42_lau): 3 centre, then 2 centre, left, right.
  const rockets = keyedTable(src, 'rocket_data');
  for (const call of src.matchAll(/CreateRocketLoadout\(\s*"([^"]+)"\s*\)/g)) {
    const pod = rockets.get(call[1]);
    if (!pod) throw new Error(`CreateRocketLoadout: no rocket_data entry for ${call[1]}`);
    const name = stringValue(src, pod.get('name') ?? '');
    if (!name) throw new Error(`CreateRocketLoadout: ${call[1]} has no readable name`);
    for (const [count, side] of [[3, 0], [2, 0], [2, -1], [2, 1]]) {
      add(`{${call[1]}_TER_${count}_${sideLetter(side)}}`, `${count} x ${name} (TER)`, 'rocket');
    }
  }

  // 4. Cluster dispensers, alone and two on a TER (left, right).
  const dispensers = keyedTable(src, 'new_dispenser_data');
  for (const call of src.matchAll(/CreateDispenserLoadout\(\s*"([^"]+)"\s*\)/g)) {
    const dispenser = dispensers.get(call[1]);
    if (!dispenser) throw new Error(`CreateDispenserLoadout: no new_dispenser_data entry for ${call[1]}`);
    const name = stringValue(src, dispenser.get('name') ?? '');
    if (!name) throw new Error(`CreateDispenserLoadout: ${call[1]} has no readable name`);
    add(`{C_A4E_${call[1]}_2x_TER_L}`, `2 x ${name} (TER)`, 'dispenser');
    add(`{C_A4E_${call[1]}_2x_TER_R}`, `2 x ${name} (TER)`, 'dispenser');
    add(`{C_A4E_${call[1]}}`, name, 'dispenser');
  }

  // 5. The Shrike on its LAU-34, and the TCTS pod on a LAU-7 adapter.
  for (const call of src.matchAll(/LoadAGM45\(\s*\w+\s*,\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*\)/g)) {
    add(luaString(call[2]), luaString(call[1]), 'agm45');
  }
  const aim9 = keyedTable(src, 'aim9_variants');
  for (const call of src.matchAll(/aim_9_with_adapter\(\s*("(?:[^"\\]|\\.)*")\s*,\s*"([^"]+)"\s*\)/g)) {
    const variant = aim9.get(call[2]);
    const display = variant && stringValue(src, variant.get('display_name') ?? '');
    if (!display) throw new Error(`aim_9_with_adapter: no readable display_name for ${call[2]}`);
    add(luaString(call[1]), `LAU-7 with ${display}`, 'adapter');
  }

  return { stores, literalTables };
}

/** The CLSIDs the aircraft file lists for its pylons. `"..side.."` is a rack's
 * left or right side. Whatever is built any other way is counted, not read. */
function aircraftClsids(aircraftLua) {
  const src = stripLuaComments(aircraftLua);
  const clsids = new Set();
  let other = 0;

  // The pylon lists are `get_<place>_weapons( side )` functions, called once per
  // side ("L", "R", or "C" for the centreline).
  const sidesOf = new Map();
  for (const call of src.matchAll(/(get_\w+_weapons)\(\s*"([A-Z])"\s*\)/g)) {
    sidesOf.set(call[1], [...(sidesOf.get(call[1]) ?? []), call[2]]);
  }

  const part = '(?:"(?:[^"\\\\]|\\\\.)*"|[A-Za-z_]\\w*)';
  const expression = new RegExp(`CLSID\\s*=\\s*(${part}(?:\\s*\\.\\.\\s*${part})*)`, 'g');
  for (const chunk of src.split(/(?=local function get_\w+_weapons)/)) {
    const owner = chunk.match(/^local function (get_\w+_weapons)/);
    const sides = owner ? sidesOf.get(owner[1]) ?? [] : [];
    for (const match of chunk.matchAll(expression)) {
      const parts = match[1].match(new RegExp(part, 'g'));
      const sided = parts.includes('side');
      if (!parts.every((p) => p.startsWith('"') || p === 'side') || (sided && sides.length === 0)) {
        other += 1;
        continue;
      }
      for (const side of sided ? sides : [null]) {
        clsids.add(parts.map((p) => (p === 'side' ? side : luaString(p))).join(''));
      }
    }
  }
  return { clsids, other };
}

// ----------------------------------------------------------------- output

const rustString = (text) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

async function main() {
  const [pydcsSource, weaponsLua, aircraftLua] = await Promise.all([
    fetchText(PYDCS_URL),
    fetchText(A4E_WEAPONS_URL),
    fetchText(A4E_AIRCRAFT_URL),
  ]);

  const pydcs = parsePydcs(pydcsSource);
  const table = new Map(pydcs.map((entry) => [entry.clsid, entry.name]));
  console.log(`pydcs            ${pydcs.length} stores`);

  // The mod's stores, one name per CLSID, merged in under pydcs.
  const { stores: mod, literalTables } = modStores(weaponsLua);
  const byHow = {};
  const modNames = new Map();
  for (const store of mod) {
    byHow[store.how] = (byHow[store.how] ?? 0) + 1;
    if (modNames.has(store.clsid) && modNames.get(store.clsid) !== store.name) {
      throw new Error(`the mod gives ${store.clsid} two names`);
    }
    modNames.set(store.clsid, store.name);
  }
  let added = 0;
  let agree = 0;
  const conflicts = [];
  for (const [clsid, name] of modNames) {
    if (!table.has(clsid)) {
      table.set(clsid, name);
      added += 1;
    } else if (table.get(clsid) === name) {
      agree += 1;
    } else {
      conflicts.push({ clsid, pydcs: table.get(clsid), mod: name });
    }
  }
  console.log(`A-4E-C           ${modNames.size} stores rebuilt (${JSON.stringify(byHow)}; ${literalTables} literal tables)`);
  console.log(`                 ${added} new, ${agree} the same as pydcs, ${conflicts.length} conflicting (pydcs kept)`);
  for (const { clsid, pydcs: theirs, mod: ours } of conflicts) {
    console.log(`  CONFLICT ${clsid}: pydcs ${JSON.stringify(theirs)} / mod ${JSON.stringify(ours)}`);
  }

  // How much of the aircraft's own pylon list the table now covers.
  const { clsids: listed, other } = aircraftClsids(aircraftLua);
  listed.delete('<CLEAN>'); // an empty pylon, not a store
  const unresolved = [...listed].filter((clsid) => !table.has(clsid)).sort();
  console.log(
    `A-4E-C.lua lists ${listed.size} CLSIDs (+${other} built in code): ${listed.size - unresolved.length} named, ${unresolved.length} not`,
  );
  for (const clsid of unresolved) console.log(`  UNRESOLVED ${clsid}`);

  const sorted = [...table].sort((a, b) => Buffer.compare(Buffer.from(a[0]), Buffer.from(b[0])));
  const lines = [
    '//! GENERATED by `scripts/gen-clsids.mjs`. Do not edit by hand; re-run `npm run gen-clsids`.',
    '//!',
    '//! DCS store CLSID to DCS display name, for the FragOrders CLI import. Sorted by',
    '//! CLSID, so a lookup can binary-search it. Sources, each pinned to a commit:',
    `//! - pydcs \`dcs/weapons_data.py\` at ${PYDCS_SHA} (${pydcs.length} stores);`,
    `//! - the A-4E-C community mod (Community-A-4E/community-a4e-c) at ${A4E_SHA}:`,
    `//!   \`A-4E-C/Weapons/A4E_Weapons.lua\` (${added} stores pydcs lacks, rebuilt from the`,
    "//!   mod's own Lua patterns) and `A-4E-C/A-4E-C.lua` (its pylon lists, read to check",
    `//!   coverage: ${unresolved.length} of the ${listed.size} CLSIDs it lists have no name here).`,
    `//! ${sorted.length} entries. Where the sources disagree pydcs wins (${conflicts.length} did).`,
    '',
    '#[rustfmt::skip]',
    'pub static CLSID_NAMES: &[(&str, &str)] = &[',
  ];
  for (const [clsid, name] of sorted) {
    lines.push(`    ("${rustString(clsid)}", "${rustString(name)}"),`);
  }
  lines.push('];', '');

  const text = lines.join('\n');
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${sorted.length} entries, ${Buffer.byteLength(text)} bytes`);
}

await main();
