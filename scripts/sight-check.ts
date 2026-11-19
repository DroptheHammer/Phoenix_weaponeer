/**
 * Checks for the sight tables (crates/core/data/sight_tables.json) and the
 * lookup that turns an attack into a sight figure (src/lib/sightTables.ts,
 * src/lib/airspeed.ts). Run by geo-check as an import.
 *
 * These numbers reach a kneeboard card, so each check is one that can fail:
 * the worked examples were set out before the lookup was written, and the
 * data is pinned by count and by sum per table.
 */
import { readFileSync } from 'node:fs';
import { iasToTas_kt, tasToIas_kt } from '../src/lib/airspeed';
import { SIGHT_SOURCES, SIGHT_TABLES, lookupSight, tableFor, type SightLookup } from '../src/lib/sightTables';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};

// ─── Airspeed: gauge speed against true airspeed, standard day ───────────────
{
  // [gauge kt, height ft, true kt] as the tables' own attacks need them.
  const pairs: [number, number, number][] = [
    [450, 5000, 480], [450, 3000, 468], [400, 4000, 422], [420, 3000, 437], [475, 500, 478], [500, 5000, 532], [500, 500, 503],
  ];
  const off = pairs.filter(([ias, h, tas]) => Math.abs(iasToTas_kt(ias, h) - tas) > 0.5 || Math.abs(tasToIas_kt(iasToTas_kt(ias, h), h) - ias) > 1e-6);
  ok('sight [ST1]: gauge speed turns into true airspeed as the standard day gives it (450 at 5,000 ft is 480 true), and back again exactly',
     off.length === 0 && Math.abs(tasToIas_kt(450, 4500) - 424.3) < 0.1 && Math.abs(tasToIas_kt(300, 0) - 300) < 1e-6,
     off.map((p) => p.join('/')).join('; '));
  ok('sight [ST2]: a day 15 °C warmer makes the same true airspeed read lower on the gauge',
     tasToIas_kt(450, 4500, 15) < tasToIas_kt(450, 4500) - 5, `${tasToIas_kt(450, 4500, 15).toFixed(1)} against ${tasToIas_kt(450, 4500).toFixed(1)}`);
}

// ─── The data: every figure is the one read off the page ─────────────────────
{
  // Per table: printed points, how many are figures, and the figures' sum. A changed, added or lost figure moves a sum.
  const PINNED: Record<string, [number, number, number]> = {
    'f5e.mk82ld': [77, 76, 5287],
    'f5e.mk82se': [77, 57, 6317],
    'f4e.ld': [3, 3, 240],
    'f4e.hd': [2, 2, 245],
    'f1.samp250ld': [18, 18, 2730],
    'a4ec.ld': [4, 4, 230],
  };
  const got = SIGHT_TABLES.map((t) => {
    const figs = t.cells.filter((c) => c.value != null);
    return `${t.id} ${t.cells.length}/${figs.length}/${figs.reduce((s, c) => s + (c.value ?? 0), 0)}`;
  });
  const want = Object.entries(PINNED).map(([id, [n, f, sum]]) => `${id} ${n}/${f}/${sum}`);
  ok('sight [ST3]: the six tables hold the printed points as read (count, figures and their sum per table)', got.join('; ') === want.join('; '), got.join('; '));

  const reference = JSON.parse(readFileSync('crates/core/data/reference.json', 'utf8')) as { aircraft_weapons: { aircraft_id: string; weapon_id: string }[] };
  const carried = (ac: string, w: string) => reference.aircraft_weapons.some((r) => r.aircraft_id === ac && r.weapon_id === w);
  const bad: string[] = [];
  for (const t of SIGHT_TABLES) {
    if (!SIGHT_SOURCES[t.source]) bad.push(`${t.id}: no source`);
    for (const w of [...t.weapons, ...t.stand_in]) if (!carried(t.aircraft, w)) bad.push(`${t.id}: ${t.aircraft} does not carry ${w}`);
    if (t.weapons.some((w) => t.stand_in.includes(w))) bad.push(`${t.id}: a bomb is both the table's own and a stand-in`);
    for (const c of t.cells) {
      const fig = c.value != null;
      if (fig === (c.mark != null)) bad.push(`${t.id}: a point must be a figure or a mark, not both or neither`);
      if (fig && (c.value! < 0 || c.value! > 400)) bad.push(`${t.id}: ${c.value} is not a sight setting`);
      if (c.mark != null && c.mark !== '>200') bad.push(`${t.id}: unknown mark ${c.mark}`);
      if (t.dial_max_mils != null && fig && c.value! > t.dial_max_mils) bad.push(`${t.id}: ${c.value} is over the sight's own limit`);
    }
  }
  for (const [id, s] of Object.entries(SIGHT_SOURCES)) if (!s.title || !s.site || !s.takes || !s.rests_on) bad.push(`${id}: a source needs a title, a site, what the app takes and what it rests on`);
  ok('sight [ST4]: every table names a source, every bomb it lists is one its jet carries, and every point is a figure from 0 to 400 or a ">200" mark', bad.length === 0, bad.slice(0, 4).join('; '));
}

// ─── The lookup: the worked examples, set out before the code was written ────
{
  const T = (id: string) => SIGHT_TABLES.find((t) => t.id === id)!;
  const at = (dive_deg: number, height_ft: number, speed_ktas: number, targetElevation_ft = 0) => ({ dive_deg, height_ft, speed_ktas, targetElevation_ft });
  const gauge = (dive_deg: number, height_ft: number, kias: number) => at(dive_deg, height_ft, iasToTas_kt(kias, height_ft));
  const say = (r: SightLookup) => (r.kind === 'none' ? `none ${r.noneReason}` : `${r.kind} ${r.mils}`);
  // [what, table, attack, what must come out, borrowed by another bomb]
  const cases: [string, string, ReturnType<typeof at>, string, boolean?][] = [
    ['F-5E 30° / 5,000 ft / 480 true', 'f5e.mk82ld', at(30, 5000, 480), 'table 118'],
    ['the same over a 2,000 ft target', 'f5e.mk82ld', at(30, 5000, 480, 2000), 'beyond 118'],
    ['F-5E 30° / 4,500 ft / 450 true', 'f5e.mk82ld', at(30, 4500, 450), 'beyond 121'],
    ['F-5E 45° / 6,500 ft / 450 true', 'f5e.mk82ld', at(45, 6500, 450), 'none outside'],
    ['F-5E 45° / 5,000 ft / 532 true', 'f5e.mk82ld', at(45, 5000, 532), 'table 49'],
    ['F-5E 15° / 3,000 ft / 410 on the gauge, beside a ">200" cell', 'f5e.mk82ld', gauge(15, 3000, 410), 'none marked'],
    ['F-5E 15° / 2,900 ft / 400 on the gauge, under a ">200" cell', 'f5e.mk82ld', gauge(15, 2900, 400), 'none marked'],
    ['a Mk-84 borrowing the F-5E Mk-82 table on a printed point', 'f5e.mk82ld', at(30, 5000, 480), 'between 118', true],
    ['F-5E Snakeye laydown 500 ft / 478 true', 'f5e.mk82se', at(0, 500, 478), 'table 185'],
    ['F-5E Snakeye 500 ft / 420 on the gauge', 'f5e.mk82se', gauge(0, 500, 420), 'none marked'],
    ['F-5E Snakeye 500 ft / 404 on the gauge, on a ">200" cell', 'f5e.mk82se', gauge(0, 500, 404), 'none dial'],
    ['F-5E Snakeye 500 ft / 446 on the gauge', 'f5e.mk82se', gauge(0, 500, 446), 'table 196'],
    ['F-5E Snakeye on the 30° dive', 'f5e.mk82se', at(30, 4500, 450), 'none outside'],
    ['F-4E 30° / 3,000 ft / 400 on the gauge over a sea-level target', 'f4e.ld', gauge(30, 3000, 400), 'between 90'],
    ['F-4E 30° / 3,000 ft / 440 true over a 4,000 ft target', 'f4e.ld', at(30, 3000, 440, 4000), 'table 80'],
    ['F-4E 30° / 4,500 ft / 450 true', 'f4e.ld', at(30, 4500, 450), 'none outside'],
    ['F-4E 45° / 6,500 ft / 450 true', 'f4e.ld', at(45, 6500, 450), 'none outside'],
    ['F-4E Snakeye laydown 500 ft / 500 true', 'f4e.hd', at(0, 500, 500), 'between 135'],
    ['F-4E Snakeye laydown 500 ft / 503 true', 'f4e.hd', at(0, 500, 503), 'between 134'],
    ['the same at 500 true over a 2,000 ft target', 'f4e.hd', at(0, 500, 500, 2000), 'none outside'],
    ['Mirage F1 20° / 3,000 ft / 437 true', 'f1.samp250ld', at(20, 3000, 437), 'table 185'],
    ['Mirage F1 20° / 3,500 ft / 437 true', 'f1.samp250ld', at(20, 3500, 437), 'between 202'],
    ['Mirage F1 20° / 4,500 ft / 450 true', 'f1.samp250ld', at(20, 4500, 450), 'beyond 225'],
    ['Mirage F1 25° / 4,000 ft / 443 true', 'f1.samp250ld', at(25, 4000, 443), 'beyond 190'],
    ['Mirage F1 25° / 4,000 ft / 437 true, outside on two axes', 'f1.samp250ld', at(25, 4000, 437), 'none outside'],
    ['Mirage F1 30° / 4,500 ft / 450 true', 'f1.samp250ld', at(30, 4500, 450), 'none outside'],
    ['A-4E-C 30° / 3,500 ft / 450 on the gauge', 'a4ec.ld', gauge(30, 3500, 450), 'beyond 52'],
    ['A-4E-C 45° / 4,500 ft / 400 on the gauge', 'a4ec.ld', gauge(45, 4500, 400), 'beyond 48'],
    ['A-4E-C 30° / 3,000 ft / 450 on the gauge over a 2,000 ft target', 'a4ec.ld', at(30, 3000, iasToTas_kt(450, 5000), 2000), 'between 36'],
    ['A-4E-C 30° / 3,000 ft / 468 true', 'a4ec.ld', at(30, 3000, 468), 'table 40'],
    ['A-4E-C 45° / 4,000 ft / 422 true', 'a4ec.ld', at(45, 4000, 422), 'table 40'],
    ['A-4E-C 30° / 4,000 ft / 400 true', 'a4ec.ld', at(30, 4000, 400), 'none outside'],
    ['A-4E-C 45° / 5,500 ft / 420 true', 'a4ec.ld', at(45, 5500, 420), 'none outside'],
  ];
  const wrong = cases.filter(([, id, q, want, borrowed]) => say(lookupSight(T(id), q, !!borrowed)) !== want).map(([what, id, q, want, borrowed]) => `${what}: ${say(lookupSight(T(id), q, !!borrowed))}, not ${want}`);
  ok(`sight [ST5]: the ${cases.length} worked examples come out as set down: the document's figure on a printed point, an estimate between or one step beyond, no figure further out or beside a ">200" cell`,
     wrong.length === 0, wrong.slice(0, 3).join('; '));

  // Every printed figure, flown as printed over a sea-level target, comes back as itself. The F-4E pack prints its own
  // true airspeeds, which a sea-level target does not give at those gauge speeds: its figures are asked for over the
  // target height where gauge and true airspeed agree with the page.
  let figures = 0;
  const lost: string[] = [];
  for (const t of SIGHT_TABLES) {
    for (const c of t.cells) {
      if (c.value == null) continue;
      figures++;
      let elevation = 0;
      if (c.speed_ktas != null) {
        while (elevation < 8000 && tasToIas_kt(c.speed_ktas, elevation + c.height_ft) > c.speed_kias) elevation += 50;
      }
      const r = lookupSight(t, { dive_deg: c.dive_deg, height_ft: c.height_ft, speed_ktas: c.speed_ktas ?? iasToTas_kt(c.speed_kias, c.height_ft), targetElevation_ft: elevation });
      if (r.kind !== 'table' || r.mils !== c.value) lost.push(`${t.id} ${c.dive_deg}°/${c.height_ft}/${c.speed_kias}: ${say(r)}, not ${c.value}`);
    }
  }
  ok('sight [ST6]: every one of the 160 printed figures comes back as itself when the attack is flown as printed', figures === 160 && lost.length === 0, `${figures} figures; ${lost.slice(0, 3).join('; ')}`);

  // A worked figure never prints over the sight's own limit, and never below zero.
  let over = 0;
  for (const t of SIGHT_TABLES) {
    for (let dive = 0; dive <= 60; dive += 5) for (let h = 300; h <= 7000; h += 350) for (let v = 350; v <= 600; v += 25) {
      const r = lookupSight(t, at(dive, h, v));
      if (r.mils != null && (r.mils < 0 || (t.dial_max_mils != null && r.mils > t.dial_max_mils))) over++;
      if (r.kind === 'none' && r.mils != null) over++;
    }
  }
  ok('sight [ST7]: across a sweep of dives, heights and speeds no table gives a figure below zero or over its sight\'s limit, and "no figure" carries none', over === 0, `${over} bad`);

  const own = tableFor('f5e', 'mk82');
  const borrowed = tableFor('f5e', 'mk84');
  ok('sight [ST8]: a bomb the document names gets its table as its own, a slick bomb it does not name borrows it, a retarded bomb never borrows, and a jet with no table gets none',
     own?.table.id === 'f5e.mk82ld' && own.standIn === false && borrowed?.table.id === 'f5e.mk82ld' && borrowed.standIn === true &&
     tableFor('f5e', 'mk82se')?.table.id === 'f5e.mk82se' && tableFor('f4e', 'mk82air') === null && tableFor('f1', 'samp250hd') === null && tableFor('f16c', 'mk82') === null);
}
