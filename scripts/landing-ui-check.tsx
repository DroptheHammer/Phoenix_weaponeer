/**
 * Checks for the front page, "Choose your flight" and the Flight overview's pieces: markup rendered to plain
 * HTML in node (react-dom/server), and scans of the source files. Run by geo-check after overview-check.
 *
 * Beside each check, "Red when" is the one-line change that turns it red, and "Seen" is the FAIL line it
 * printed.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FragOrdersData } from '../src/types/fragorders.types';
import type { Mission } from '../src/types/mission.types';
import { JetCard } from '../src/components/landing/JetCard';
import { RecentCardItem, RecentMissions } from '../src/components/landing/RecentMissions';
import { W } from '../src/components/landing/words';
import { FlightRow, FragOrdersPreview } from '../src/components/import/FragOrdersPreview';
import { recentCardFrom, type RecentCard, type RecentKey, type ThumbnailInput } from '../src/lib/landing/recentCards';
import { CARD_PICTURE } from '../src/lib/landing/thumbnailPlan';
import { useLocalMissionStore } from '../src/stores/localMissionStore';
import { useUiStore } from '../src/stores/uiStore';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const src = (f: string) => readFileSync(f, 'utf8');

// ─── The jet card ────────────────────────────────────────────────────────────
// One planned jet with a known store and an unknown one, and ESTIMATED on its attack.
const card = renderToStaticMarkup(createElement(JetCard, {
  jet: {
    key: 'm1', position: 1, callsign: 'Testcall 1-1', role: 'Flight Lead',
    stores: [{ quantity: 2, name: 'Mk-84 LDGP', known: true }, { quantity: 1, name: 'AGM-45B Shrike ARM', known: false }],
    foot: { state: 'planned', lead: '#1 · T+0s', profile: 'Maverick 8k level', estimated: true, more: 0 },
  },
}));
// Red when (JetCard): the quantity cell's `flagged ? 'text-warn' : 'text-qty'` becomes `'text-ink'`; or the ESTIMATED chip's `tone="estimated"` becomes `tone="warn"`.
// Seen: FAIL UI1 quantities in their own colour, an unknown store amber with its words, ESTIMATED a tag of its own  <td class="… font-mono font-medium pr-3 text-ink"> <td class="… font-mono font-medium pr-3 text-ink">
//         (the quantity cell as 'text-ink')
//       FAIL UI1 quantities in their own colour, an unknown store amber with its words, ESTIMATED a tag of its own  <td class="… text-qty"> <td class="… text-warn">
//         (the chip as tone="warn": the quantities were right, the ESTIMATED half failed)
const qtyCells = card.match(/<td class="[^"]*font-mono[^"]*">/g) ?? [];
ok('UI1 quantities in their own colour, an unknown store amber with its words, ESTIMATED a tag of its own',
  qtyCells.length === 2 && qtyCells[0].includes('text-qty') && qtyCells[1].includes('text-warn') && card.includes('Not in the weapon table') &&
    /border-control[^>]*>(<svg[\s\S]*?<\/svg>)?ESTIMATED</.test(card) && !/text-warn[^>]*>[^<]*ESTIMATED/.test(card),
  qtyCells.join(' '));

// ─── Choose your flight says nothing about threats the author hid ────────────
// The chooser is drawn here as the phone's sheet: the desktop's dialog is a portal, which plain markup cannot show,
// and both draw the same warnings and notices from the same variables. Two threats the author hid (one matched, one
// with no database row) and one with no database row that anyone may see.
const flight = { name: 'Testcall', callsign: 'Testcall 1-1', aircraft_type: 'F-16C_50', waypoints: [], units: [{ name: 'u1', callsign: 'Testcall11', onboard_num: null, loadout: [] }] };
const threat = (unit_type: string, group_name: string, system_id: string | null, hidden_on_planner: boolean, hidden_on_map: boolean) => ({
  unit_type, group_name, position: { lat: 36.1, lon: -115.1 }, system_id, system_name: system_id ? '2K12 Kub' : null,
  confidence: system_id ? 'High' : 'Unknown', hidden_on_planner, hidden_on_map,
});
const chooserData = (threats: ReturnType<typeof threat>[], notices: string[] = []) => ({
  theater: 'nevada', theater_display_name: 'Test Nevada', projection_verified: true, bullseye: { lat: 36, lon: -115 },
  player_groups: [flight], threats, trigger_zones: [], warnings: [], notices, source: null,
}) as unknown as FragOrdersData;
const chooserMarkup = (data: FragOrdersData, reveal = { onPlanner: false, onMap: false }) => {
  // A server render reads the store's initial state, not its current one (zustand hands React the initial state as
  // the server snapshot), so that is where the Settings switches are set, and put back.
  const initial = useUiStore.getInitialState();
  const before = initial.revealHidden;
  initial.revealHidden = reveal;
  try {
    return renderToStaticMarkup(createElement(FragOrdersPreview, { data, aircraft: [{ id: 'f16c', name: 'F-16C Viper' }], onBack: () => {}, onImport: () => {}, phone: true }));
  } finally {
    initial.revealHidden = before;
  }
};
const hiddenThreats = [threat('SA-6 Kub STR', 'FAKE-HIDDEN-GROUP', 'sa6', true, false), threat('FAKE-HIDDEN-UNKNOWN', 'g', null, false, true)];
const step = chooserMarkup(chooserData([...hiddenThreats, threat('FAKE-SEEN-UNKNOWN', 'g2', null, false, false)]));
// Only words a planner could read are searched: the classes and the decorative icons' aria-hidden are left out.
const readable = (markup: string) => markup.replace(/aria-hidden="true"|class="[^"]*"/g, '');
// Red when (FragOrdersPreview): the unmatched threats are worked out from `data.threats` instead of the view
// (`threatView.unmatchedTypes` becomes `data.threats.filter((t) => t.system_id === null).map((t) => t.unit_type)`).
// Seen: FAIL UI3 the step names only threats the planner may see, and says nothing about hidden ones
//         (the warning then also listed FAKE-HIDDEN-UNKNOWN; UI3b failed with it: same as none false, warning true, hidden names true)
ok('UI3 the step names only threats the planner may see, and says nothing about hidden ones',
  step.includes('FAKE-SEEN-UNKNOWN') && !step.includes('FAKE-HIDDEN') && !/hidden|probable|location unknown/i.test(readable(step)) &&
    step.includes('Choose your flight') && step.includes('Testcall 1') && step.includes('Import Testcall 1'));
// A link whose threats are all hidden carries the link's notice ("no enemy air defences"), as a link with none does: with
// nothing revealed the step reads exactly like the step for no threats, notice included. With a switch on in Settings the
// planner sees the threat listed elsewhere, and the notice goes, as before.
// Red when (FragOrdersPreview): the notices are printed from `data.notices` instead of the view (`threatView.notices.map` becomes `data.notices.map`).
// Seen: FAIL UI3b with every threat hidden the step reads as for a mission with none, the link's notice included, and a revealed threat takes the notice away  same as none true, notice true, warning false, hidden names false, notice when revealed true, both switches name the unmatched one true
//         (a threat the planner has revealed is listed, yet the step still printed "no enemy air defences"; UI3 stayed green)
const NO_THREATS_NOTICE = 'This link shows no enemy air defences. The mission may have none, or its publisher chose not to share them.';
const allHidden = chooserMarkup(chooserData(hiddenThreats, [NO_THREATS_NOTICE]));
const noneAtAll = chooserMarkup(chooserData([], [NO_THREATS_NOTICE]));
const revealed = chooserMarkup(chooserData(hiddenThreats, [NO_THREATS_NOTICE]), { onPlanner: true, onMap: false });
// Both switches on: the planner now sees all three, so the one with no database row is named in the warning.
const revealedBoth = chooserMarkup(chooserData(hiddenThreats, [NO_THREATS_NOTICE]), { onPlanner: true, onMap: true });
ok('UI3b with every threat hidden the step reads as for a mission with none, the link\'s notice included, and a revealed threat takes the notice away',
  allHidden === noneAtAll && allHidden.includes(NO_THREATS_NOTICE) && !allHidden.includes('import warning') && !allHidden.includes('FAKE-HIDDEN') &&
    !revealed.includes(NO_THREATS_NOTICE) && revealedBoth.includes('FAKE-HIDDEN-UNKNOWN') && !revealedBoth.includes(NO_THREATS_NOTICE),
  `same as none ${allHidden === noneAtAll}, notice ${allHidden.includes(NO_THREATS_NOTICE)}, warning ${allHidden.includes('import warning')}, hidden names ${allHidden.includes('FAKE-HIDDEN')}, notice when revealed ${revealed.includes(NO_THREATS_NOTICE)}, both switches name the unmatched one ${revealedBoth.includes('FAKE-HIDDEN-UNKNOWN')}`);

// ─── The chooser's phone sheet and its rows ──────────────────────────────────
// A sticky bar stands at the very top of its scroller, so any padding above it is a strip where the rows scrolling by
// show. The sheet's scroll body therefore has no top padding, and the gap above the filter is the bar's own.
// Red when (FragOrdersPreview): `px-4 pb-4 [scroll-padding-top:80px]` on the sheet's scroll body gets its `pt-1` back.
// Seen: FAIL UI9 nothing peeks above the phone sheet's filter: the scroll body has no top padding, and the filter bar carries the gap  scroll body "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1 [scroll-padding-top:80px]"; bar "sticky top-0 z-[2] -mx-4 bg-surface-navy px-4 pb-2 pt-3 shadow-[0_1px_0_var(--c-line)]"
//         (and with the bar's `pt-3` taken back to `py-2` while the scroll body is right: the bar then read "… px-4 py-2 shadow-…", and the filter sat 4 px higher than before)
const scrollBody = /class="([^"]*overscroll-contain[^"]*)"/.exec(step)?.[1] ?? '';
const filterBar = /class="([^"]*sticky top-0[^"]*)"/.exec(step)?.[1] ?? '';
ok('UI9 nothing peeks above the phone sheet\'s filter: the scroll body has no top padding, and the filter bar carries the gap',
  scrollBody.includes('overflow-y-auto') && !/(^|\s)(p|py|pt)-/.test(scrollBody) && /(^|\s)pt-3(\s|$)/.test(filterBar) && /(^|\s)sticky(\s|$)/.test(filterBar),
  `scroll body "${scrollBody}"; bar "${filterBar}"`);

// The chosen flight keeps its fill under the mouse: both fills set the background, and the hover one would win, so the
// hover fill is only on the rows that are not chosen. (The desktop's dialog is a portal that plain markup cannot show,
// so the row is drawn on its own.)
// Red when (FlightRow): `!phone && !chosen && 'hover:bg-tint-2'` becomes `!phone && 'hover:bg-tint-2'`.
// Seen: FAIL UI11 the chosen flight keeps its fill under the mouse; the rows that are not chosen still show hover  chosen "flex cursor-pointer … min-h-tap px-3 hover:bg-tint-2 bg-accent-soft"; other "flex cursor-pointer … min-h-tap px-3 hover:bg-tint-2"; phone chosen "flex cursor-pointer … min-h-12 px-4 py-1 bg-accent-soft"
const flightRow = (chosen: boolean, phone: boolean) => {
  const html = renderToStaticMarkup(createElement(FlightRow, {
    flight: { index: 0, label: 'Venom 1', jets: 4, aircraftId: 'f16c', aircraftName: 'F-16C Viper', hasProfiles: true }, chosen, phone, onChoose: () => {}, onOpen: () => {},
  }));
  return /<label class="([^"]*)"/.exec(html)?.[1] ?? '';
};
const deskChosen = flightRow(true, false);
const deskOther = flightRow(false, false);
const phoneChosen = flightRow(true, true);
ok('UI11 the chosen flight keeps its fill under the mouse; the rows that are not chosen still show hover',
  /(^|\s)bg-accent-soft(\s|$)/.test(deskChosen) && !/hover:/.test(deskChosen) && /(^|\s)hover:bg-tint-2(\s|$)/.test(deskOther) && !/bg-accent-soft/.test(deskOther)
    && /(^|\s)bg-accent-soft(\s|$)/.test(phoneChosen) && !/hover:/.test(phoneChosen),
  `chosen "${deskChosen}"; other "${deskOther}"; phone chosen "${phoneChosen}"`);

// When the flight list's code cannot be fetched, App says so and offers the way back. That failure is remembered until
// the app is reloaded, so "press Load again" alone would show the same words again.
// Red when (words.ts): `chooserFailed` goes back to 'The flight list could not be opened. Go back and press Load again.'
// Seen: FAIL UI8 the words when the flight list cannot open say to reload the app first  The flight list could not be opened. Go back and press Load again.
ok('UI8 the words when the flight list cannot open say to reload the app first',
  W.chooserFailed === 'The flight list could not be opened. Reload the app, then press Load again.', W.chooserFailed);

// ─── Recent missions ─────────────────────────────────────────────────────────
// A saved mission to put on cards: a flight of one with a target, nothing a hidden threat could hide in.
const savedMission = {
  id: 'ui-m1', name: 'Test Mission', date: '2026-01-01', theater: 'nevada', bullseye: { lat: 36.2, lon: -115.0 },
  notes: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  waypoints: [{ id: 'w1', steerpoint: 1, name: 'WP1', type: 'target', coordinates: { lat: 36.5, lon: -115.2 }, elevation_ft: 2000 }],
  threats: [], flightMembers: [{ id: 'f1', callsign: 'Testcall 1-1', position: 1, role: 'flight_lead', aircraftId: 'f16c', loadout: [] }], attacks: [],
} as unknown as Mission;
const recentsMarkup = (storageError: string | null) => {
  // As for the chooser above: a server render reads the store's initial state, which is where the failure is set, and put back.
  const initial = useLocalMissionStore.getInitialState();
  const before = initial.error;
  initial.error = storageError;
  try {
    return renderToStaticMarkup(createElement(RecentMissions, {
      openMission: savedMission, onContinue: () => {}, onOpenFile: () => {}, onOpenLocal: () => {},
      aircraft: [{ id: 'f16c', name: 'F-16C Viper' }], typeOf: new Map<string, string>(), phone: false, web: true,
    }));
  } finally {
    initial.error = before;
  }
};
// With the amber line saying the plan was NOT saved, the grey line saying it is saved automatically would contradict it.
// Red when (RecentMissions): `{web && !shownError && <p …>{W.recentWebFine}</p>}` loses its `!shownError &&`.
// Seen: FAIL UI6 the amber autosave failure and the grey "saved automatically" line are never shown together  failed: amber true, grey true; fine: amber false, grey true
const AUTOSAVE_FAILED = 'Autosave failed — use Export .json to keep this plan: QuotaExceededError';
const failedRecents = recentsMarkup(AUTOSAVE_FAILED);
const fineRecents = recentsMarkup(null);
ok('UI6 the amber autosave failure and the grey "saved automatically" line are never shown together',
  failedRecents.includes(AUTOSAVE_FAILED) && !failedRecents.includes(W.recentWebFine) && !fineRecents.includes('Autosave failed') && fineRecents.includes(W.recentWebFine),
  `failed: amber ${failedRecents.includes(AUTOSAVE_FAILED)}, grey ${failedRecents.includes(W.recentWebFine)}; fine: amber ${fineRecents.includes('Autosave failed')}, grey ${fineRecents.includes(W.recentWebFine)}`);

// A card for a saved file is told from another copy of the same mission by its file name (the small grey line under the
// mission's name; the folder is not printed), and the card's tooltip is the full path. A browser-stored mission has no file.
const cardMarkup = (card: RecentCard) =>
  renderToStaticMarkup(createElement(RecentCardItem, {
    card, isLive: false, now: new Date('2026-06-01T00:00:00Z'),
    theaterName: (id) => id, aircraftName: (id) => id, typeOf: new Map<string, string>(),
    asking: false, onOpen: () => {}, onForget: () => {}, onAsk: () => {}, onCancelAsk: () => {}, onDelete: () => {},
  }));
const aCard = (key: Parameters<typeof recentCardFrom>[1]) => cardMarkup(recentCardFrom(savedMission, key, () => null));
const FILE_PATH = 'C:\\dcs\\plans\\Strike Two.json';
const fileCard = aCard({ source: 'file', path: FILE_PATH });
const browserCard = aCard({ source: 'browser', id: 'ui-m1', name: 'Test Mission', savedAt: '2026-01-01T00:00:00Z' });
const textOf = (markup: string) => markup.replace(/<[^>]*>/g, '');
// Red when (RecentCardItem): the file name line `{fileName && <span …>{fileName}</span>}` is deleted, or the card button loses `title={filePath ?? undefined}`.
// Seen: FAIL UI7 a saved-file card names its file under the mission's name and gives the full path as its tooltip; a browser card has neither  name line false, path tooltip true, folder printed false, browser card line false, tooltip false
//         (the name line deleted)
//       FAIL UI7 a saved-file card names its file under the mission's name and gives the full path as its tooltip; a browser card has neither  name line true, path tooltip false, folder printed false, browser card line false, tooltip false
//         (the tooltip deleted)
const nameLine = />Strike Two\.json<\/span>/.test(fileCard);
const pathTooltip = fileCard.includes(`<button type="button" title="${FILE_PATH}"`);
ok('UI7 a saved-file card names its file under the mission\'s name and gives the full path as its tooltip; a browser card has neither',
  nameLine && pathTooltip && !textOf(fileCard).includes('dcs') && !/>[^<]*\.json<\/span>/.test(browserCard) && !/<button type="button" title=/.test(browserCard),
  `name line ${nameLine}, path tooltip ${pathTooltip}, folder printed ${textOf(fileCard).includes('dcs')}, browser card line ${/>[^<]*\.json<\/span>/.test(browserCard)}, tooltip ${/<button type="button" title=/.test(browserCard)}`);
// The × on a file card says the file is not deleted (its tooltip), and its spoken name is still the mission's.
// Red when (RecentCardItem): the file card's `label={W.recentForgetTitle}` becomes `label={W.recentForget(title)}` (the tooltip loses the words), or the `aria-labelledby` is taken out (the name loses the mission's).
// Seen: FAIL UI7b the × on a saved-file card says the file is not deleted and is still named for its mission; a browser card's says Delete  tooltip "Remove Test Mission from recent missions", name "Remove Test Mission from recent missions"; browser card name "Delete Test Mission"
//         (the tooltip as `W.recentForget(title)`: the tooltip lost the words)
//       FAIL UI7b the × on a saved-file card says the file is not deleted and is still named for its mission; a browser card's says Delete  tooltip "Remove from this list (the file is not deleted)", name "Remove from this list (the file is not deleted)"; browser card name "Delete Test Mission"
//         (`aria-labelledby` taken out: the spoken name became the tooltip's words, with no mission in it)
const lastButtonOf = (markup: string) => (markup.match(/<button[^>]*>/g) ?? []).slice(-1)[0] ?? '';
// What a screen reader speaks for a button: the text its aria-labelledby points at, else its aria-label.
const spokenName = (markup: string) => {
  const tag = lastButtonOf(markup);
  const pointsAt = /aria-labelledby="([^"]*)"/.exec(tag)?.[1];
  const target = pointsAt ? new RegExp(`id="${pointsAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]*)<`).exec(markup)?.[1] : undefined;
  return target ?? /aria-label="([^"]*)"/.exec(tag)?.[1] ?? '(none)';
};
const tooltipOf = (markup: string) => /title="([^"]*)"/.exec(lastButtonOf(markup))?.[1] ?? '(none)';
ok('UI7b the × on a saved-file card says the file is not deleted and is still named for its mission; a browser card\'s says Delete',
  tooltipOf(fileCard) === W.recentForgetTitle && spokenName(fileCard) === W.recentForget('Test Mission') && spokenName(browserCard) === W.recentDelete('Test Mission') && !browserCard.includes('not deleted'),
  `tooltip "${tooltipOf(fileCard)}", name "${spokenName(fileCard)}"; browser card name "${spokenName(browserCard)}"`);

// A card's route picture is planned 16:9, and a short window shows it 2:1 with `slice`, which crops (height - width / 2) / 2
// off the top and the bottom. A dot on the frame's edge must still be whole, outline and all. The circles are read out of
// the card's own markup (centre, radius, outline), so this holds the card to its picture's margin, not just the number
// the margin is written as: landing-check (T6) holds the number. Two routes that reach the frame: a waypoint on the
// south edge with a threat (the widest dot) on the north edge, and a waypoint on each.
// Red when (RecentCardItem's picture): `planThumbnail(card.thumbnail, CARD_PICTURE, { paddingPx: CARD_PICTURE.marginPx })` loses its third argument, so the planner's own 12 px margin is used.
// Seen: FAIL UI12 every dot the card draws lies whole inside the part of its picture that a short window keeps, for a route that reaches the frame's edge  south waypoint, north threat: 3 dots, cut y 12.00, y 168.00, y 12.00 to 168.00 of 180, cropped to 2:1 true; waypoint on each edge: 3 dots, cut y 168.00, y 12.00, y 12.00 to 168.00 of 180, cropped to 2:1 true
//         (with the card's margin gone, landing-check's T6 stayed green: it plans a picture of its own and never looks at the card)
const edgeKey: RecentKey = { source: 'file', path: '/plans/edge.json' };
const pictureOf = (thumbnail: ThumbnailInput) =>
  cardMarkup({ status: 'ok', key: edgeKey, name: 'Edge', theaterId: 'nevada', lastEdited: null, flights: [], attackCount: 0, thumbnail });
const wp = (lat: number, steerpoint: number) => ({ lat, lon: -116.0, steerpoint });
const edgePictures: Array<[string, ThumbnailInput]> = [
  ['south waypoint, north threat', { waypoints: [wp(36.0, 1), wp(36.4, 2)], threats: [{ lat: 37.0, lon: -116.0, systemId: 'sa2' }], fallbackCenter: null, realWorld: false }],
  ['waypoint on each edge', { waypoints: [wp(36.0, 1), wp(36.2, 2), wp(36.5, 3)], threats: [], fallbackCenter: null, realWorld: false }],
];
const pictureReport = edgePictures.map(([name, thumbnail]) => {
  const markup = pictureOf(thumbnail);
  const svg = /<svg [^>]*>/.exec(markup)?.[0] ?? '';
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)?.map(Number) ?? [0, 0, 0];
  const keptTop = (h - w / 2) / 2;
  const number = (tag: string, attribute: string) => Number(new RegExp(`\\s${attribute}="([^"]*)"`).exec(tag)?.[1]);
  const dots = (markup.match(/<circle [^>]*>/g) ?? []).map((tag) => {
    const [cx, cy, r, outline] = [number(tag, 'cx'), number(tag, 'cy'), number(tag, 'r'), number(tag, 'stroke-width')];
    const reach = r + outline / 2;
    return { cy, cut: !(cy - reach >= keptTop - 1e-9 && cy + reach <= h - keptTop + 1e-9 && cx - reach >= -1e-9 && cx + reach <= w + 1e-9) };
  });
  const ys = dots.map((d) => d.cy);
  const reachesEdge = dots.length > 0 && Math.abs(Math.min(...ys) - CARD_PICTURE.marginPx) < 0.5 && Math.abs(Math.max(...ys) - (h - CARD_PICTURE.marginPx)) < 0.5;
  const cropped = /preserveAspectRatio="xMidYMid slice"/.test(svg) && /short:aspect-\[2\/1\]/.test(svg);
  return { name, ok: cropped && reachesEdge && dots.every((d) => !d.cut) && dots.length === (thumbnail.waypoints.length + thumbnail.threats.length), text: `${name}: ${dots.length} dots, cut ${dots.filter((d) => d.cut).map((d) => `y ${d.cy.toFixed(2)}`).join(', ') || 'none'}, y ${Math.min(...ys).toFixed(2)} to ${Math.max(...ys).toFixed(2)} of ${h}, cropped to 2:1 ${cropped}` };
});
ok('UI12 every dot the card draws lies whole inside the part of its picture that a short window keeps, for a route that reaches the frame\'s edge',
  pictureReport.every((r) => r.ok), pictureReport.map((r) => r.text).join('; '));

// ─── The front page's pieces are wired to what they are checked for ──────────
// LoadBox closes its load gate when it leaves the screen (and opens it again on a second mount), and sends every load
// through runLoad, which checks the gate before it hands an answer over: a link still being fetched when the planner
// goes to the map answers nothing. The gate itself is proved by landing-check (L14); this is the box's use of it.
// Red when (LoadBox): the effect's `return () => gate.close();` is deleted (the box then never closes the gate).
// Seen: FAIL UI5 the load box closes its load gate when it leaves the screen, and every load goes through runLoad  closes on leaving false, runLoad true
//         (the effect left as `gate.open();` alone)
const loadBox = src('src/components/landing/LoadBox.tsx');
const closesGate = /useEffect\(\(\) => \{\s*gate\.open\(\);\s*return \(\) => gate\.close\(\);\s*\}, \[gate\]\);/.test(loadBox);
const viaRunLoad = /await runLoad\(gate, source, platformLoadDeps,/.test(loadBox) && !/\bgate\.isLatest\b/.test(loadBox);
ok('UI5 the load box closes its load gate when it leaves the screen, and every load goes through runLoad',
  closesGate && viaRunLoad, `closes on leaving ${closesGate}, runLoad ${viaRunLoad}`);
// On the phone the front page's header is the app's name, so App takes its title and its unsaved dot from phoneHeader
// (proved by landing-check, H1), not from the open mission directly.
// Red when (App): `dirty={header.dirty}` on PhoneShell becomes `dirty={Boolean(mission && isDirty)}`.
// Seen: FAIL UI10 the phone shell takes its title and its unsaved dot from phoneHeader  title true, dirty false
const app = src('src/App.tsx');
const titleFromHeader = /<PhoneShell<PanelType>\s+title=\{header\.title\}/.test(app);
const dotFromHeader = /<PhoneShell<PanelType>[^>]*?\sdirty=\{header\.dirty\}/.test(app);
ok('UI10 the phone shell takes its title and its unsaved dot from phoneHeader',
  /const header = phoneHeader\(/.test(app) && titleFromHeader && dotFromHeader, `title ${titleFromHeader}, dirty ${dotFromHeader}`);

// ─── What the front page's and the chooser's own files may write ─────────────
// The chooser is held to the same rules as the landing components.
const files = ['src/components/import/FragOrdersPreview.tsx', ...readdirSync('src/components/landing').map((f) => `src/components/landing/${f}`)];
// The front page, the chooser and the overview never read or word a hidden-threat count, a "probable threats" line or an
// "author hid" tag: the app says nothing about threats the author hid unless Settings reveals them.
// Red when: `const probableCount = 0;` is added to FragOrdersPreview.tsx (or `summary.threats.probableCount` read in a landing file).
// Seen: FAIL X2 the front page, the step and the overview never read or word a hidden-threat count  src/components/import/FragOrdersPreview.tsx
const talk = files.filter((f) => /probable|revealedCount|hiddenCount|isHiddenByAuthor|location unknown|hidden by (the mission )?author/i.test(src(f)));
ok('X2 the front page, the step and the overview never read or word a hidden-threat count', talk.length === 0, talk.join(', '));
// Colour comes from the tokens (text-ink, bg-surface-navy, text-qty, ...), never a hex, a colour function or a Tailwind
// palette class, so the screens follow the design system if it changes.
// Red when: `text-gray-400` (or any hex) is written in a landing file, say in the jet card, or in the chooser.
// Seen: FAIL X3 no raw colour in the landing components and the chooser (tokens only)  src/components/landing/JetCard.tsx:26
//         (the role line as `text-gray-400`)
//       FAIL X3 no raw colour in the landing components and the chooser (tokens only)  src/components/landing/words.ts:80
//         (a `// #86efac` comment after the Qty word)
//       FAIL X3 no raw colour in the landing components and the chooser (tokens only)  src/components/import/FragOrdersPreview.tsx:77
//         (the chooser's unverified-coordinates notice as `text-amber-300`)
const PALETTE = /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/\d{1,3})?\b/;
const raw = files.flatMap((f) => src(f).split('\n').map((l, i) => [f, i + 1, l] as const)).filter(([, , l]) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l) || PALETTE.test(l)).map(([f, n]) => `${f}:${n}`);
ok('X3 no raw colour in the landing components and the chooser (tokens only)', raw.length === 0, raw.join(', '));
// A comment in a committed file must make sense to someone who has only the repo: none may point at a git-ignored
// file a reader cannot open, and no width query may stand in for a height one (Tailwind's max-[…] is max-WIDTH).
// Red when: a comment in JetCard.tsx points at such a file by name and line, say "efb2.html .jet (:574-609)" (or a landing file gets `max-[819px]:mt-4`).
// Seen: FAIL X8 no landing file or chooser points at a git-ignored file, and none writes a height rule as a width query  src/components/landing/JetCard.tsx
//         (a `// efb2.html .jet (:574-609)` comment; the same with `max-[819px]:min-h-11` on the header row)
//       FAIL X8 no landing file or chooser points at a git-ignored file, and none writes a height rule as a width query  scripts/overview-check.ts
//         (one of those words added to that file's header comment)
//       FAIL X8 no landing file or chooser points at a git-ignored file, and none writes a height rule as a width query  src/components/import/FragOrdersPreview.tsx
//         (a comment above the chooser's props pointing at such a file by name and line, as above)
const pointers = [...files, 'scripts/overview-check.ts'].filter((f) => /efb2|critique|BRIEF-V2|v2-facts|mockup|Other Items|max-\[819px\]:/i.test(src(f)));
ok('X8 no landing file or chooser points at a git-ignored file, and none writes a height rule as a width query', pointers.length === 0, pointers.join(', '));

// ─── The planner map's markers, rings and route ──────────────────────────────
// mapMarkers.ts is pinned whole: its code with comments and spacing taken out, hashed. The two icon functions are
// MapView's own, moved verbatim (compared with MapView's text from before the move, comments and spacing aside);
// the ring and route values are the ones MapView wrote inline. Any colour, size, weight or dash in either palette
// changes the hash. The map's look is protected: a change here is the owner's decision, made with this hash.
// Red when (mapMarkers.ts): the target waypoint's `'bg-red-500'` becomes `'bg-red-600'` (or MapView's ring pathOptions or route colour are written inline again).
// Seen: FAIL X4 the planner map draws its markers, rings and route only through mapMarkers.ts, and that code is unchanged  735dc6c28d00ae0f
//         (the target as 'bg-red-600': the hash moved)
//       FAIL X4 the planner map draws its markers, rings and route only through mapMarkers.ts, and that code is unchanged  b249e936535ba9ce
//         (`color="#3B82F6"` written again beside `{...ROUTE_LINE}` in MapView.tsx: the hash held, MapView's half failed)
const MARKERS_CODE_SHA256 = 'b249e936535ba9ce';
const codeOf = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
const mv = src('src/components/map/MapView.tsx');
const markersHash = createHash('sha256').update(codeOf(src('src/components/map/mapMarkers.ts'))).digest('hex').slice(0, 16);
ok('X4 the planner map draws its markers, rings and route only through mapMarkers.ts, and that code is unchanged',
  /from '\.\/mapMarkers'/.test(mv) && !/const create(Waypoint|Threat)Icon|'#EF4444'|"#3B82F6"|fillOpacity/.test(mv) && markersHash === MARKERS_CODE_SHA256,
  markersHash);

// ─── The height variants ─────────────────────────────────────────────────────
// The height variants are variants, not screens: one object-valued screen switches every max-* and min-* variant
// off (Tailwind 3.4 warns "complex-screen-config" and generates nothing), the editors' `max-md:` with them.
// Tailwind's own `max-[…]:` is a WIDTH query, so a window-height rule can only be written with these two. The
// probe runs in a child process: it reads tailwind.config.js, and Tailwind's plugin is async.
// Red when (tailwind.config.js): `screens: { tall: { raw: '(min-height: 860px)' } }` is added to theme.extend.
// Seen: FAIL X9 tall: and short: are height queries, and the width variants still work  {"tall:min-h-11":"@media (min-height: 860px) min-height:2.75rem","short:mt-1":"@media (max-height: 819px) margin-top:0.25rem","max-md:hidden":null,"max-[1279px]:block":null}
//         (Tailwind also printed: warn - The `min-*` and `max-*` variants are not supported with a `screens` configuration containing objects.)
// Red when (tailwind-probe.mjs): the `at +` is taken out of `const body = at + rule.nodes…` (the probe stops printing the @media, so a width query cannot be told from a height one).
// Seen: FAIL X9 tall: and short: are height queries, and the width variants still work  {"tall:min-h-11":"min-height:2.75rem","short:mt-1":"margin-top:0.25rem","max-md:hidden":"display:none","max-[1279px]:block":"display:block"}
const probe = JSON.parse(execFileSync(process.execPath, ['scripts/tailwind-probe.mjs', 'tall:min-h-11', 'short:mt-1', 'max-md:hidden', 'max-[1279px]:block'], { encoding: 'utf8' })) as Record<string, string | null>;
ok('X9 tall: and short: are height queries, and the width variants still work',
  probe['tall:min-h-11']?.startsWith('@media (min-height: 860px)') === true && probe['short:mt-1']?.startsWith('@media (max-height: 819px)') === true &&
    probe['max-md:hidden'] !== null && probe['max-[1279px]:block']?.startsWith('@media (max-width: 1279px)') === true,
  JSON.stringify(probe));
