/**
 * Checks for the data layer under the front page (src/lib/landing/): what the
 * load box makes of what it is given, the mission file gate it shares with
 * Open, the summary of an open mission, and the recent mission cards with their
 * little route pictures. Run by geo-check as its last import, so the release
 * gate covers it.
 *
 * Beside each check, "Red when" is the one-line change to the real module that
 * turns it red, and "Seen" is the line it printed when that change was made, so
 * a check that cannot fail is easy to spot.
 *
 * The files loaded here are the synthetic ones in test-data, and every name and
 * link id is made up.
 *
 * geo-check imports this file, and imports run before the rest of that file:
 * these checks must leave the shared stores as they found them.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { FragOrdersData } from '../src/types/fragorders.types';
import type { Mission } from '../src/types/mission.types';
import type { DbWeapon } from '../src/types/weapon.types';
import { validateMission } from '../src/lib/validateMission';
import { autoBuildAttack } from '../src/lib/autoBuildAttack';
import { calculateDestination } from '../src/lib/coordinates';
import { lonLatToTile, tileNwCorner } from '../src/lib/kneeboardBasemap';
import { MISSION_FILE_GONE } from '../src/lib/missionFile';
import { threatListView } from '../src/lib/threatVisibility';
import { useTheaterStore, type TheaterInfo } from '../src/stores/theaterStore';
import { useUiStore } from '../src/stores/uiStore';
import { classifyLoadText, decodeLoadBytes, LOAD_MAX_BYTES, MIZ_ADVICE } from '../src/lib/landing/loadSniff';
import { routeLoad, latestGate, runLoad, type LoadDeps, type LoadOutcome, type LoadSource } from '../src/lib/landing/loadRouter';
import { phoneHeader } from '../src/lib/landing/phoneHeader';
import { summarizeMission, theaterStateOf, type SummaryRefs } from '../src/lib/landing/missionSummary';
import {
  MAX_RECENT_PEEKS, MAX_THUMB_THREATS, peekRecent, peekRecents, recentCardFrom, recentKeyId, recentKeys, STRICT_REVEAL,
  type PeekDeps, type RecentCard, type RecentKey,
} from '../src/lib/landing/recentCards';
import { CARD_PICTURE, planThumbnail, type ThumbnailInput } from '../src/lib/landing/thumbnailPlan';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};

const fixture = (file: string) => readFileSync(`test-data/${file}`, 'utf8');
const LINK = 'https://fragorders.com/public_frag_order/FAKEFAKEFAKE0000';

// ─── What the load box makes of text ─────────────────────────────────────────
// Red when (loadSniff, shapeOfJson): `if (hasOwn(obj, 'coalition'))` tests 'plannedGroups' instead.
// Seen: FAIL L1 nevada_SYNTHETIC_link_payload.json is a link payload, and its text is handed on untouched
// Seen: FAIL L1 nevada_SYNTHETIC_loaded_jets.json is a link payload, and its text is handed on untouched
// Seen: FAIL L1 nevada_SYNTHETIC_cli_loaded_jets.json is a FragOrders CLI export, and its text is handed on untouched
// Seen: FAIL L1 sinai_SYNTHETIC_banner_check.json is a FragOrders CLI export, and its text is handed on untouched
// Seen: FAIL L1 test_fragorders.json is a FragOrders CLI export, and its text is handed on untouched
// Seen: FAIL L1 sandbox_mission.json is a FragOrders CLI export, and its text is handed on untouched
const linkPayloads = ['nevada_SYNTHETIC_link_payload.json', 'nevada_SYNTHETIC_loaded_jets.json'];
const cliExports = ['nevada_SYNTHETIC_cli_loaded_jets.json', 'sinai_SYNTHETIC_banner_check.json', 'test_fragorders.json', 'sandbox_mission.json'];
for (const file of linkPayloads) {
  const text = fixture(file);
  const kind = classifyLoadText(text);
  ok(`L1 ${file} is a link payload, and its text is handed on untouched`,
    kind.kind === 'fragorders-json' && kind.shape === 'link-payload' && kind.text === text, JSON.stringify({ ...kind, text: undefined }));
}
for (const file of cliExports) {
  const text = fixture(file);
  const kind = classifyLoadText(text);
  ok(`L1 ${file} is a FragOrders CLI export, and its text is handed on untouched`,
    kind.kind === 'fragorders-json' && kind.shape === 'cli-export' && kind.text === text, JSON.stringify({ ...kind, text: undefined }));
}
// A paste can carry a byte-order mark (the Rust parser would stop on it); a file's decoder drops its own.
// Red when (classifyLoadText): `const original = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;` becomes `const original = text;`.
// Seen: FAIL L1 nevada_SYNTHETIC_link_payload.json: a pasted byte-order mark is not handed on to the parser
// Seen: FAIL L1 nevada_SYNTHETIC_cli_loaded_jets.json: a pasted byte-order mark is not handed on to the parser
for (const file of [linkPayloads[0], cliExports[0]]) {
  const text = fixture(file);
  const kind = classifyLoadText('\u{feff}' + text);
  ok(`L1 ${file}: a pasted byte-order mark is not handed on to the parser`,
    kind.kind === 'fragorders-json' && kind.text === text);
}

// The same tests as the Rust importer: `coalition` wins, and only own keys count.
const kindOf = (text: string) => classifyLoadText(text);
const shapeOf = (text: string) => {
  const kind = kindOf(text);
  return kind.kind === 'fragorders-json' ? kind.shape : kind.kind === 'refused' ? kind.reason : kind.kind;
};
// Red when (shapeOfJson): the coalition test gains `&& !hasOwn(obj, 'plannedGroups')`.
// Seen: FAIL L2 both keys: coalition is checked first, as the Rust importer does
ok('L2 both keys: coalition is checked first, as the Rust importer does', shapeOf('{"plannedGroups":[],"coalition":{}}') === 'cli-export');
// Red when: the same change as the L1 checks above (the coalition test looks for 'plannedGroups').
// Seen: FAIL L2 coalition beside an id is still a CLI export
ok('L2 coalition beside an id is still a CLI export', shapeOf('{"coalition":{},"id":"x"}') === 'cli-export');
// Red when (shapeOfJson): its last line returns 'link-payload' instead of 'unrecognised'.
// Seen: FAIL L2 an empty object is not recognised
// Seen: FAIL L2 a __proto__ key does not pass for an id
// Seen: FAIL L2 an id and one list is not enough for a saved mission
ok('L2 an empty object is not recognised', shapeOf('{}') === 'unrecognised-json');
// Red when (classifyLoadText): the line that tests `Array.isArray(parsed)` refuses with 'not-json' instead of 'json-not-object'.
// Seen: FAIL L2 a list is not an object
ok('L2 a list is not an object', shapeOf('[]') === 'json-not-object');
const brokenJson = kindOf('{"id":');
let engineMessage = '';
try { JSON.parse('{"id":'); } catch (e) { engineMessage = (e as Error).message; }
// Red when (REFUSAL_MESSAGES): the 'not-json' wording becomes the engine's own, `'SyntaxError: Unexpected end of JSON input'`.
// Seen: FAIL L2 broken JSON is "not-json" in our words, never the engine's  {"kind":"refused","reason":"not-json","message":"SyntaxError: Unexpected end of JSON input"}
ok('L2 broken JSON is "not-json" in our words, never the engine\'s',
  brokenJson.kind === 'refused' && brokenJson.reason === 'not-json' && engineMessage !== '' && !brokenJson.message.includes(engineMessage),
  JSON.stringify(brokenJson));
ok('L2 a __proto__ key does not pass for an id', shapeOf('{"__proto__":{"id":"x"},"waypoints":[]}') === 'unrecognised-json');
ok('L2 an id and one list is not enough for a saved mission', shapeOf('{"id":"x","waypoints":[]}') === 'unrecognised-json');

const m1 = {
  id: 'test-m1', name: 'Test Mission', date: '2026-01-01', theater: 'nevada', bullseye: { lat: 36.2, lon: -115.0 },
  notes: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  waypoints: [{ id: 'w1', steerpoint: 1, name: 'WP1', type: 'target', coordinates: { lat: 36.5, lon: -115.2 }, elevation_ft: 2000 }],
  threats: [],
  flightMembers: [{ id: 'f1', callsign: 'Testcall 1-1', position: 1, role: 'flight_lead', aircraftId: 'f16c', loadout: [] }],
  attacks: [],
};
const m1Text = JSON.stringify(m1);

// Red when (shapeOfJson): the saved-mission branch returns 'unrecognised'.
// Seen: FAIL L3 a saved mission is recognised as one, text unchanged
ok('L3 a saved mission is recognised as one, text unchanged',
  (() => { const k = classifyLoadText(m1Text); return k.kind === 'saved-mission' && k.text === m1Text; })());

// ─── The load box's backends, played by stand-ins ────────────────────────────
type Spy = { calls: string[]; deps: LoadDeps };
const fakeData = { theater: 'nevada' } as unknown as FragOrdersData;
/** Stand-in backends that record every call, and fail with `failWith` when told to. */
const spyDeps = (failWith?: string): Spy => {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      fetchLink: (url) => { calls.push(`fetchLink ${url}`); return failWith === undefined ? Promise.resolve(fakeData) : Promise.reject(failWith); },
      parseFragOrders: (json) => { calls.push(`parseFragOrders ${json}`); return failWith === undefined ? Promise.resolve(fakeData) : Promise.reject(failWith); },
    },
  };
};
/** A file source whose reads are counted, so a refusal before reading can be seen. */
const fileSource = (name: string, bytes: Uint8Array, path: string | null = null, size = bytes.length) => {
  const reads = { count: 0 };
  const source: LoadSource = {
    kind: 'file', name, size, path,
    bytes: async () => { reads.count += 1; return bytes; },
  };
  return { source, reads };
};
const utf8 = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));

// ─── Links ───────────────────────────────────────────────────────────────────
const linkUrl = (text: string, opts?: { fromFile?: boolean }) => {
  const kind = classifyLoadText(text, opts);
  return kind.kind === 'link' ? kind.url : kind.kind === 'refused' ? kind.reason : kind.kind;
};
// Red when (classifyLoadText): the single-token branch returns `url: unwrapped.toLowerCase()`.
// Seen: FAIL L6 the exact public link is a link  https://fragorders.com/public_frag_order/fakefakefake0000
ok('L6 the exact public link is a link', linkUrl(LINK) === LINK, linkUrl(LINK));
// Red when: `const unwrapped = trimmed;` (the angle brackets are no longer taken off).
// Seen: FAIL L6 a link in angle brackets is taken out of them
ok('L6 a link in angle brackets is taken out of them',
  linkUrl('<http://www.fragorders.com/public_frag_order/FAKEFAKEFAKE0000>') === 'http://www.fragorders.com/public_frag_order/FAKEFAKEFAKE0000'
    && linkUrl('<http://example.invalid/x>') === 'http://example.invalid/x');
// Red when: EMBEDDED_LINK looks for fragorders.org.
// Seen: FAIL L6 a link inside a sentence is the token  not-a-link
ok('L6 a link inside a sentence is the token', linkUrl(`see <${LINK}> tonight`) === LINK, linkUrl(`see <${LINK}> tonight`));
// Red when: `if (found.length === 1)` becomes `>= 1`, so the first of several wins.
// Seen: FAIL L6 two different links are refused, not guessed
ok('L6 two different links are refused, not guessed', linkUrl(`${LINK} and ${LINK}X`) === 'several-links');
// Red when: the matches are no longer de-duplicated (`new Set` removed).
// Seen: FAIL L6 the same link twice is one link
ok('L6 the same link twice is one link', linkUrl(`${LINK} ${LINK}`) === LINK);
// Red when: the single-token test accepts only `https://`.
// Seen: FAIL L6 any single http(s) token goes on to the Rust check
ok('L6 any single http(s) token goes on to the Rust check', linkUrl('http://example.invalid/x') === 'http://example.invalid/x');
// Red when: the last line refuses with 'empty' instead of 'not-a-link'.
// Seen: FAIL L6 plain words are not a link
ok('L6 plain words are not a link', linkUrl('hello') === 'not-a-link');
// Red when: EMBEDDED_LINK makes its scheme optional, `(?:https?:\/\/)?`.
// Seen: FAIL L6 a link with no scheme is not a link
ok('L6 a link with no scheme is not a link', linkUrl('fragorders.com/public_frag_order/FAKEFAKEFAKE0000') === 'not-a-link');
// Red when: the empty test looks at the untrimmed text (`original === ''`).
// Seen: FAIL L6 nothing, and only spaces, are empty
ok('L6 nothing, and only spaces, are empty', linkUrl('') === 'empty' && linkUrl('   ') === 'empty');

// A chat message can open with a tag, a Markdown label or a brace and still hold one link.
// Red when (classifyLoadText): `if (parses) {` becomes `if (true) {`, so text that opens with a bracket or a brace is always refused as JSON.
// Seen: FAIL L6 a message that opens with a tag, a label or a brace still holds its link  json-not-object | json-not-object | json-not-object
ok('L6 a message that opens with a tag, a label or a brace still holds its link',
  linkUrl(`[TEST OP] Tonight's frag: ${LINK}`) === LINK && linkUrl(`[Mission 3](${LINK})`) === LINK && linkUrl(`{Testcall flight} ${LINK}`) === LINK,
  [`[TEST OP] ${LINK}`, `[Mission 3](${LINK})`, `{Testcall flight} ${LINK}`].map((t) => linkUrl(t)).join(' | '));
// Red when: `if (parses) {` becomes `if (false) {`, so well-formed JSON is searched for links like any other text.
// Seen: FAIL L6 JSON that parses is JSON, even with a link inside it
ok('L6 JSON that parses is JSON, even with a link inside it',
  linkUrl(`["${LINK}"]`) === 'json-not-object' && linkUrl(`{"url":"${LINK}"}`) === 'unrecognised-json');
// With no link to fetch, a cut-off export (it still has "key": pairs) is told it is not valid JSON;
// a chat message that merely opens with a tag or a brace is asked for a link, like any other text.
// Red when: the last line refuses with `'not-a-link'` whatever the text looked like.
// Seen: FAIL L6 with no link, a cut-off export is "not JSON" and a chat message that opens with a tag is "not a link"  not-a-link | not-a-link | not-a-link | not-a-link | not-a-link
// (L2's broken-JSON check goes red with it.)
// Red when: the `"key":` test is dropped (`opensLikeJson ? 'not-json' : 'not-a-link'`).
// Seen: FAIL L6 with no link, a cut-off export is "not JSON" and a chat message that opens with a tag is "not a link"  not-json | not-json | not-json | not-json | not-a-link
{
  const cases = ['{"id":', '[{"coalition": {', '[TEST OP] see you tonight', '{Testcall flight} hello', '(no link here)'].map((t) => linkUrl(t));
  ok('L6 with no link, a cut-off export is "not JSON" and a chat message that opens with a tag is "not a link"',
    cases.join(' | ') === 'not-json | not-json | not-a-link | not-a-link | not-a-link', cases.join(' | '));
}
// Red when: `if (found.length > 1) return refused('several-links');` is removed, so the tag's two links reach the last line.
// Seen: FAIL L6 a tagged message with two links is still too many links
ok('L6 a tagged message with two links is still too many links', linkUrl(`[Plan] ${LINK} and ${LINK}X`) === 'several-links');

// What a sentence leaves on the end of a link is not part of it (the Rust check only lets letters and digits through).
const trailingMarks = ['.', ',', ';', ':', '!', ')', ']', '}', "'", '"', '.)', '!!', '\u{200b}', '\u{200c}', '\u{200d}', '\u{2060}'];
const notClean = (make: (mark: string) => string) => trailingMarks.filter((mark) => linkUrl(make(mark)) !== LINK);
// Red when (classifyLoadText): the single-token branch returns `url: unwrapped`, with the marks still on it.
// Seen: FAIL L6 a mark after a bare link is not part of the link  [".",",",";",":","!",")","]","}","'","\"",".)","!!", and the four zero-width ones]
ok('L6 a mark after a bare link is not part of the link', notClean((mark) => LINK + mark).length === 0, JSON.stringify(notClean((mark) => LINK + mark)));
// Red when: the matches are not cleaned (`.map(withoutTrailingMarks)` is removed from the `found` line).
// Seen: FAIL L6 a mark after a link inside a sentence is not part of the link  [".",",",";",":","!","}",".)","!!", and the four zero-width ones]
ok('L6 a mark after a link inside a sentence is not part of the link',
  notClean((mark) => `see ${LINK}${mark} tonight`).length === 0 && linkUrl(`${LINK}. And again ${LINK}`) === LINK,
  JSON.stringify(notClean((mark) => `see ${LINK}${mark} tonight`)));
// A long run of marks is cleared in one pass: a search that backed up from each mark in turn would take hours on the second input.
// Red when: `withoutTrailingMarks` takes off one mark only (its `while` becomes an `if`).
// Seen: FAIL L6 a run of marks goes, and so does a very long one, quickly  0 ms
const runStarted = Date.now();
const longRun = linkUrl(LINK + '.'.repeat(200_000));
const longBody = linkUrl(LINK + '.'.repeat(200_000) + 'x');
ok('L6 a run of marks goes, and so does a very long one, quickly',
  linkUrl(`${LINK}.)..!`) === LINK && longRun === LINK && longBody === LINK + '.'.repeat(200_000) + 'x' && Date.now() - runStarted < 500,
  `${Date.now() - runStarted} ms`);

// Red when: the `opts?.fromFile` test is replaced with `false`.
// Seen: FAIL L7 a file holding a link is not JSON, never a link
ok('L7 a file holding a link is not JSON, never a link', linkUrl(LINK, { fromFile: true }) === 'not-json');
// Red when: the same change.
// Seen: FAIL L7 a file that opens with a tag is not JSON either
ok('L7 a file that opens with a tag is not JSON either',
  linkUrl(`[TEST OP] ${LINK}`, { fromFile: true }) === 'not-json' && linkUrl(`{Testcall flight} ${LINK}`, { fromFile: true }) === 'not-json');

// ─── Bytes ───────────────────────────────────────────────────────────────────
const reasonOf = (r: ReturnType<typeof decodeLoadBytes>) => (r.ok ? 'ok' : r.reason);
const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
// Red when (decodeLoadBytes): the zip-header test is dropped from the .miz line.
// Seen: FAIL L8 a zip is a .miz whatever it is called
ok('L8 a zip is a .miz whatever it is called', reasonOf(decodeLoadBytes(zipHead, 'm.json')) === 'miz');
// Red when: the name test is dropped from the .miz line.
// Seen: FAIL L8 a file named .miz is refused with the advice
const miz = decodeLoadBytes(utf8('{}'), 'x.miz');
ok('L8 a file named .miz is refused with the advice', !miz.ok && miz.reason === 'miz' && miz.message === MIZ_ADVICE);

const payloadText = fixture('nevada_SYNTHETIC_link_payload.json');
const payloadBytes = utf8(payloadText);
const withBom = (bom: number[], body: Uint8Array) => new Uint8Array([...bom, ...body]);
const le = new Uint8Array(Buffer.from(payloadText, 'utf16le'));
const be = new Uint8Array(Buffer.from(le).swap16());
const encodings: Array<[string, Uint8Array]> = [
  ['UTF-8 with a byte-order mark', withBom([0xef, 0xbb, 0xbf], payloadBytes)],
  ['UTF-16 little-endian', withBom([0xff, 0xfe], le)],
  ['UTF-16 big-endian', withBom([0xfe, 0xff], be)],
];
// Red when: the decoder is made with `ignoreBOM: true`, so the mark stays in the text.
// Seen: FAIL L8 UTF-8 with a byte-order mark decodes to the same link payload
// Seen: FAIL L8 UTF-16 little-endian decodes to the same link payload
// Seen: FAIL L8 UTF-16 big-endian decodes to the same link payload
// Red when (decodeLoadBytes): `!utf16 &&` is dropped from the zero-byte test, so UTF-16's own zero bytes read as binary.
// Seen: FAIL L8 UTF-16 little-endian decodes to the same link payload  That file isn't text, so it can't be a mission.
// Seen: FAIL L8 UTF-16 big-endian decodes to the same link payload  That file isn't text, so it can't be a mission.
for (const [label, bytes] of encodings) {
  const decoded = decodeLoadBytes(bytes, 'm.json');
  const kind = decoded.ok ? classifyLoadText(decoded.text, { fromFile: true }) : null;
  ok(`L8 ${label} decodes to the same link payload`,
    decoded.ok && decoded.text === payloadText && kind?.kind === 'fragorders-json' && kind.shape === 'link-payload', decoded.ok ? '' : decoded.message);
}
// Red when: the decoder is made with `fatal: false`.
// Seen: FAIL L8 bytes that are not UTF-8 are refused in plain words
ok('L8 bytes that are not UTF-8 are refused in plain words',
  (() => { const r = decodeLoadBytes(new Uint8Array([0xc3, 0x28]), 'm.json'); return !r.ok && r.reason === 'not-utf8' && r.message === 'Save the file as UTF-8 and try again.'; })());
// Red when: the binary test looks for byte 1 instead of byte 0 (`.includes(0)` becomes `.includes(1)`).
// Seen: FAIL L8 a zero byte near the start means binary
ok('L8 a zero byte near the start means binary', reasonOf(decodeLoadBytes(new Uint8Array([0x7b, 0x22, 0x61, 0x00, 0x22]), 'm.json')) === 'binary');
// A dropped card picture is told it is not text, not to "save it as UTF-8".
const binaryHeads: Array<[string, number[]]> = [
  ['a PNG picture', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]],
  ['a JPEG picture', [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]],
  ['a gzip archive', [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]],
];
// Red when: the same change as the check above (the zero-byte test looks for byte 1), or the test is put after the decode, so the decoder's own refusal comes first.
// Seen: FAIL L8 a PNG picture is not text, and does not ask for UTF-8  not-utf8
// Seen: FAIL L8 a JPEG picture is not text, and does not ask for UTF-8  not-utf8
// Seen: FAIL L8 a gzip archive is not text, and does not ask for UTF-8  not-utf8
for (const [label, head] of binaryHeads) {
  const r = decodeLoadBytes(new Uint8Array(head), 'card.png');
  ok(`L8 ${label} is not text, and does not ask for UTF-8`,
    !r.ok && r.reason === 'binary' && r.message === "That file isn't text, so it can't be a mission.", r.ok ? 'decoded' : r.reason);
}
// Red when: the head is longer than 1024 bytes (`const BINARY_HEAD_BYTES = 1025;`).
// Seen: FAIL L8 only the first 1024 bytes are looked at for a zero byte  binary / binary
const nulAt = (index: number) => { const bytes = new Uint8Array(2000).fill(0x20); bytes[index] = 0; return reasonOf(decodeLoadBytes(bytes, 'm.json')); };
ok('L8 only the first 1024 bytes are looked at for a zero byte', nulAt(1023) === 'binary' && nulAt(1024) === 'ok', `${nulAt(1023)} / ${nulAt(1024)}`);
// Red when: the size test becomes `bytes.length > LOAD_MAX_BYTES * 2`.
// Seen: FAIL L8 a file over the limit is too large
ok('L8 a file over the limit is too large', reasonOf(decodeLoadBytes(new Uint8Array(LOAD_MAX_BYTES + 1), 'm.json')) === 'too-large');
// Red when: the size test becomes `bytes.length >= LOAD_MAX_BYTES`.
// Seen: FAIL L8 a file exactly at the limit is not too large
ok('L8 a file exactly at the limit is not too large', reasonOf(decodeLoadBytes(new Uint8Array(LOAD_MAX_BYTES).fill(0x20), 'm.json')) === 'ok');

// Pasted text is held to the limit in bytes, as a file is, not in characters.
// 'é' is two bytes, so half the limit in characters is the whole limit in bytes.
const accents = (chars: number) => '{"a":"' + 'é'.repeat(chars) + '"}';
const justOver = accents(LOAD_MAX_BYTES / 2);
const exactly = accents((LOAD_MAX_BYTES - 8) / 2);
const textReason = (text: string) => { const kind = classifyLoadText(text); return kind.kind === 'refused' ? kind.reason : kind.kind; };
// Red when (loadSniff, overLimit): the exact count is dropped (its last line becomes `return false;`), so only the number of characters is compared.
// Seen: FAIL L8 pasted text is counted in bytes: over the limit by a few bytes is too large  unrecognised-json
ok('L8 pasted text is counted in bytes: over the limit by a few bytes is too large',
  Buffer.byteLength(justOver, 'utf8') > LOAD_MAX_BYTES && justOver.length < LOAD_MAX_BYTES && textReason(justOver) === 'too-large', textReason(justOver));
// Red when: the exact count's test becomes `>= LOAD_MAX_BYTES`.
// Seen: FAIL L8 pasted text exactly at the limit is not too large  too-large
ok('L8 pasted text exactly at the limit is not too large',
  Buffer.byteLength(exactly, 'utf8') === LOAD_MAX_BYTES && textReason(exactly) === 'unrecognised-json', textReason(exactly));

// ─── The size limit is the link fetch's ──────────────────────────────────────
// Red when: LOAD_MAX_BYTES becomes `24 * 1024 * 1024`.
// Seen: FAIL L13 LOAD_MAX_BYTES is the link fetch's MAX_BODY_BYTES  26214400 vs 25165824
const bodyLimit = /pub const MAX_BODY_BYTES: u64 = ([0-9 *]+);/.exec(readFileSync('crates/core/src/fragorders_link.rs', 'utf8'));
const bodyBytes = bodyLimit ? bodyLimit[1].split('*').reduce((product, part) => product * Number(part.trim()), 1) : NaN;
ok('L13 LOAD_MAX_BYTES is the link fetch\'s MAX_BODY_BYTES', bodyBytes === LOAD_MAX_BYTES, `${bodyBytes} vs ${LOAD_MAX_BYTES}`);

// ─── Newest load wins ────────────────────────────────────────────────────────
// Red when (latestGate): `isLatest` becomes `() => true`.
// Seen: FAIL L11 a newer load makes the older one stale
const gate = latestGate();
const t1 = gate.next();
const t2 = gate.next();
ok('L11 a newer load makes the older one stale', !gate.isLatest(t1) && gate.isLatest(t2));

// ─── The summary of an open mission ──────────────────────────────────────────
const f16cProfiles = JSON.parse(readFileSync('src-tauri/resources/profiles/f16c.json', 'utf8'));
const mk84 = {
  id: 'mk84', name: 'Mk-84 LDGP', category: 'bomb_unguided', guidance: 'none', weight_lbs: 2000, frag_min_safe_alt_ft: 1500, carried_by: ['f16c'],
} as unknown as DbWeapon;
const targetPos = { lat: 37.15, lon: -116.83 };
const wpTarget = { id: 'w-tgt', steerpoint: 8, name: 'TGT1', type: 'target', coordinates: targetPos, elevation_ft: 4000 };
const wpFeeder = { id: 'w-ip', steerpoint: 7, name: 'STPT 7', type: 'nav', coordinates: calculateDestination(targetPos, 68, 15.3), elevation_ft: 5000 };
const jet = (id: string, callsign: string, position: number, role: string, loadout: unknown[] = []) =>
  ({ id, callsign, position, role, aircraftId: 'f16c', loadout });
const wingJets = [
  jet('f1', 'Testcall 1-1', 1, 'flight_lead', [{ weaponType: 'Mk-84 LDGP', quantity: 2, weaponId: 'mk84' }]),
  jet('f2', 'Testcall 1-2', 2, 'wingman'),
];
// A real attack, built the way the app builds one, so the card it makes is the real card.
const built = autoBuildAttack({
  mission: { waypoints: [wpFeeder, wpTarget], flightMembers: wingJets, threats: [], attacks: [] },
  targetWaypointId: wpTarget.id, attackerId: 'f1', weapons: [mk84], profiles: f16cProfiles, threatSystems: [],
  overrides: { weaponId: 'mk84', profileId: 'f16c.dive.ccip30' },
} as never);
// No bundled profile has been flown in DCS yet, so each builds an ESTIMATED attack. A flown one is
// not, and that is the attack the "ready" checks need; the estimated case is made from it below.
const diveAttack = { ...built.attack!, id: 'a1', sequenceNumber: 1, estimated: false };

/** A mission to summarise: m1's header, a two-jet flight with one attack, and whatever `parts` replace. */
const summaryMission = (parts: Record<string, unknown> = {}): Mission =>
  ({
    ...structuredClone(m1), waypoints: [structuredClone(wpFeeder), structuredClone(wpTarget)], flightMembers: structuredClone(wingJets),
    attacks: [structuredClone(diveAttack)], threats: [], strikes: [], ...parts,
  }) as unknown as Mission;

const system = (id: string, name: string, nato: string | null) => ({ id, name, nato_designation: nato, threat_type: 'SAM', max_range_nm: 20 });
const refsOf = (parts: Partial<SummaryRefs> = {}): SummaryRefs => ({
  threatSystems: [system('sa10', 'S-300PS', 'SA-10 Grumble'), system('sa6', '2K12 Kub', 'SA-6 Gainful'), system('sa2', 'S-75 Dvina', 'SA-2 Guideline'), system('sa8', '9K33 Osa', null)],
  aircraft: [{ id: 'f16c', name: 'F-16C Viper' }],
  weapons: [mk84],
  fuzeOptions: new Map(),
  ...parts,
});
const theaterInfo = (id: string, verified: boolean): TheaterInfo =>
  ({ dcs_name: id, id, display_name: `Test ${id}`, supported: true, verified, default_center: { lat: 36.5, lon: -115.2 } });
/** Run `fn` with the theater list set, and put it back as it was (geo-check's own checks expect it empty). */
const withTheaters = <T>(theaters: Record<string, TheaterInfo>, fn: () => T): T => {
  const before = useTheaterStore.getState().theaters;
  useTheaterStore.setState({ theaters });
  try {
    return fn();
  } finally {
    useTheaterStore.setState({ theaters: before });
  }
};
const verifiedNevada: Record<string, TheaterInfo> = { nevada: theaterInfo('nevada', true) };
const summarize = (mission: Mission, reveal = STRICT_REVEAL, refs = refsOf(), theaters = verifiedNevada) =>
  withTheaters(theaters, () => summarizeMission(mission, reveal, refs));
const threatAt = (id: string, systemId: string, lat: number, lon: number, extra: Record<string, unknown> = {}) =>
  ({ id, systemId, position: { lat, lon }, status: 'active', source: 'mission', ...extra });

// A threat the author hid leaves no mark on the summary: none of its words, and nothing that tells the mission
// from the same mission with that threat taken out.
// Red when (summarizeMission): `const visible = visibleMission(mission, reveal);` becomes `const visible = mission;`.
// Seen: FAIL S1 nothing the author hid reaches the summary: not as text, and the summary is the same as without that threat  {"name":"Test Mission","lastEdited":"2026-01-01T00:00:00Z","theater":{"id":"nevada","displayName":"Test nevada","state":"verified"},"targets":[{"waypointId":"w- ...
const leakMission = summaryMission({
  threats: [threatAt('leak-t1', 'sa10', 12.3456789, 98.7654321, { notes: 'FAKE-GROUP-NOTE', hiddenOnPlanner: true, hiddenOnMap: true })],
  notes: 'FAKE-NOTES-LINE',
});
const leakSummary = summarize(leakMission);
const leakText = JSON.stringify(leakSummary);
const leakWithoutIt = JSON.stringify(summarize(summaryMission({ threats: [], notes: 'FAKE-NOTES-LINE' })));
ok('S1 nothing the author hid reaches the summary: not as text, and the summary is the same as without that threat',
  ['12.3456789', '98.7654321', 'FAKE-GROUP-NOTE', 'leak-t1', 'FAKE-NOTES-LINE'].every((secret) => !leakText.includes(secret))
    && leakSummary.threats.visibleCount === 0 && leakSummary.threats.bySystem.length === 0 && leakText === leakWithoutIt,
  leakText.slice(0, 160));

// The card is built from what the planner may see. Nothing on today's card depends on a hidden threat in a way
// that shows in the summary, so this plants a trap: the hidden threat's system has no usable range, which breaks
// the card's numbers (and so blocks the attack) only if that threat reaches the card. It stands 5 nm from the target.
const nearTarget = calculateDestination(targetPos, 90, 5);
const noRangeRefs = refsOf({ threatSystems: refsOf().threatSystems.map((s) => (s.id === 'sa10' ? { ...s, max_range_nm: NaN } : s)) });
const hiddenNearby = summaryMission({ threats: [threatAt('leak-t1', 'sa10', nearTarget.lat, nearTarget.lon, { hiddenOnPlanner: true })] });
const hiddenAttack = summarize(hiddenNearby, STRICT_REVEAL, noRangeRefs).attacks[0];
const revealedAttack = summarize(hiddenNearby, { onPlanner: true, onMap: false }, noRangeRefs).attacks[0];
// Red when (summarizeMission): `buildKneeboardCard(visible, attack.id, ...)` becomes `buildKneeboardCard(mission, attack.id, ...)`.
// Seen: FAIL S1 a hidden threat beside the target never reaches the card, and would break it if it did  ["blocked","blocked","error"]
ok('S1 a hidden threat beside the target never reaches the card, and would break it if it did',
  hiddenAttack.status === 'ready' && revealedAttack.status === 'blocked' && revealedAttack.blockedBy === 'error',
  JSON.stringify([hiddenAttack.status, revealedAttack.status, revealedAttack.blockedBy]));

// Threats as the threat list counts them: three anyone sees (two from the mission, one planning), and three the
// author hid, one by each flag and one by both. Each hidden one is hidden unless a caller passes `{}`, which is
// the same threat in plain view, so a summary can be compared with the summary of a mission that never hid it.
const shownThreats = [
  threatAt('t1', 'sa2', 36.1, -115.1), threatAt('t2', 'sa2', 36.2, -115.2),
  threatAt('t3', 'sa8', 36.3, -115.3, { source: 'planning' }),
];
const hiddenOne = (flags: Record<string, unknown> = { hiddenOnPlanner: true }) => threatAt('h1', 'sa10', 36.4, -115.4, flags);
const hiddenTwo = (flags: Record<string, unknown> = { hiddenOnMap: true }) => threatAt('h2', 'sa10', 36.5, -115.5, flags);
const hiddenThree = (flags: Record<string, unknown> = { hiddenOnPlanner: true, hiddenOnMap: true }) => threatAt('h3', 'sa6', 36.6, -115.6, flags);
const counted = summaryMission({ threats: [...shownThreats, hiddenOne(), hiddenTwo(), hiddenThree()] });
const tallies = (list: Array<{ systemId: string; count: number }>) => list.map((t) => `${t.systemId}:${t.count}`).join(',');
const asText = (summary: ReturnType<typeof summarize>) => JSON.stringify(summary);
const strict = summarize(counted);
const planner = summarize(counted, { onPlanner: true, onMap: false });
const both = summarize(counted, { onPlanner: true, onMap: true });
// With nothing revealed, the three hidden threats are not in the summary at all: it is the summary of the mission
// that never had them, and `threats` holds these four fields and no other (a count of the hidden ones would be a fifth).
// Red when (summarizeMission): a field that counts the hidden ones is added to `threats`, `hiddenCount: mission.threats.length - visible.threats.length,`.
// Seen: FAIL S2 nothing revealed: three visible, two from the mission, one planning, by system sa2:2,sa8:1; the same as the mission without the hidden three; no other field  {"visibleCount":3,"fromMission":2,"planning":1,"bySystem":[{"systemId":"sa2","name":"S-75 Dvina","nato":"SA-2 Guideline","count":2},{"systemId":"sa8","name":"9K33 Osa","nato":null,"count":1}],"hiddenCount":3}
// (S1's first check goes red with it, and S2's planner-switch check too.) A field that says nothing, `hiddenCount: 0,`, equals itself on
// both sides of the comparison, so only the list of keys catches it; that was seen red on its own.
ok('S2 nothing revealed: three visible, two from the mission, one planning, by system sa2:2,sa8:1; the same as the mission without the hidden three; no other field',
  strict.threats.visibleCount === 3 && strict.threats.fromMission === 2 && strict.threats.planning === 1
    && tallies(strict.threats.bySystem) === 'sa2:2,sa8:1'
    && asText(strict) === asText(summarize(summaryMission({ threats: shownThreats })))
    && Object.keys(strict.threats).sort().join() === 'bySystem,fromMission,planning,visibleCount', JSON.stringify(strict.threats));
// The planner's switch brings back the one threat it hides, and then that threat is just another: the summary is the
// one for the mission where its flag was never set and the other two are not there.
// Red when (summarizeMission): `visibleMission(mission, reveal)` ignores the reveal (`visibleMission(mission, { onPlanner: false, onMap: false })`).
// Seen: FAIL S2 the planner switch: four visible; the same as that threat in plain view with the other two not there  {"visibleCount":3,"fromMission":2,"planning":1,"bySystem":[{"systemId":"sa2","name":"S-75 Dvina","nato":"SA-2 Guideline","count":2},{"systemId":"sa8","name":"9K33 Osa","nato":null,"count":1}]}
ok('S2 the planner switch: four visible; the same as that threat in plain view with the other two not there',
  planner.threats.visibleCount === 4
    && asText(planner) === asText(summarize(summaryMission({ threats: [...shownThreats, hiddenOne({})] }))), JSON.stringify(planner.threats));
// Red when: the same change as the check above.
// Seen: FAIL S2 both switches: six visible; the same as every threat in plain view  {"visibleCount":3,"fromMission":2,"planning":1,"bySystem":[{"systemId":"sa2","name":"S-75 Dvina","nato":"SA-2 Guideline","count":2},{"systemId":"sa8","name":"9K33 Osa","nato":null,"count":1}]}
ok('S2 both switches: six visible; the same as every threat in plain view',
  both.threats.visibleCount === 6
    && asText(both) === asText(summarize(summaryMission({ threats: [...shownThreats, hiddenOne({}), hiddenTwo({}), hiddenThree({})] }))), JSON.stringify(both.threats));
// Red when (summarizeMission): `fromMission` and `planning` count `mission.threats` in place of `visible.threats`.
// Seen: FAIL S2 the summary counts what the threat list counts, under each of the four switch settings  {"onPlanner":false,"onMap":false}: summary 5 + 1, list 2 + 1; {"onPlanner":true,"onMap":false}: summary 5 + 1, list 3 + 1; {"onPlanner":false,"onMap":true}: summary 5 + 1, list 3 + 1
const switchSettings = [{ onPlanner: false, onMap: false }, { onPlanner: true, onMap: false }, { onPlanner: false, onMap: true }, { onPlanner: true, onMap: true }];
const unlike = switchSettings.flatMap((reveal) => {
  const list = threatListView((counted as Mission).threats, reveal);
  const { fromMission, planning } = summarize(counted, reveal).threats;
  return fromMission === list.fromMission.length && planning === list.planning.length
    ? [] : [`${JSON.stringify(reveal)}: summary ${fromMission} + ${planning}, list ${list.fromMission.length} + ${list.planning.length}`];
});
ok('S2 the summary counts what the threat list counts, under each of the four switch settings', unlike.length === 0, unlike.join('; '));
// Red when (tally): `name: system?.name ?? systemId` becomes `name: systemId`, or `nato: system?.nato_designation ?? null` ends `?? ''`.
// Seen: FAIL S2 a system is named from the table, with its NATO name when it has one
ok('S2 a system is named from the table, with its NATO name when it has one',
  strict.threats.bySystem[0].name === 'S-75 Dvina' && strict.threats.bySystem[0].nato === 'SA-2 Guideline' && strict.threats.bySystem[1].nato === null);
// Red when (tally): `name: system?.name ?? systemId` ends `?? ''`.
// Seen: FAIL S2 a system the table does not know is named by its id
ok('S2 a system the table does not know is named by its id',
  summarize(counted, STRICT_REVEAL, refsOf({ threatSystems: [] })).threats.bySystem[0].name === 'sa2');

// Targets are what the attacks aim at, whatever the waypoint is called or typed.
const unnamedNav = { id: 'w-nav', steerpoint: 3, name: '', type: 'nav', coordinates: calculateDestination(targetPos, 90, 5), elevation_ft: 3000 };
const spareTarget = { id: 'w-spare', steerpoint: 5, name: 'TGT2', type: 'target', coordinates: calculateDestination(targetPos, 180, 5), elevation_ft: 3000 };
const onNav = summarize(summaryMission({
  waypoints: [wpFeeder, unnamedNav, spareTarget, wpTarget].map((w) => structuredClone(w)),
  attacks: [
    { ...structuredClone(diveAttack), targetWaypointId: 'w-nav' },
    { ...structuredClone(diveAttack), id: 'a2', sequenceNumber: 2, attackerId: 'f2' },
  ],
}));
// Red when (summarizeMission): the targets are filtered with `.filter((w) => targeted.has(w.id) && w.type === 'target')`.
// Seen: FAIL S3 an unnamed nav waypoint an attack aims at is a target, labelled by its number  [{"waypointId":"w-tgt","steerpoint":8,"label":"Waypoint 8 — TGT1","attackIds":["a2"]}]
ok('S3 an unnamed nav waypoint an attack aims at is a target, labelled by its number',
  onNav.targets.map((t) => `${t.steerpoint}:${t.label}:${t.attackIds}`).join('|') === '3:Waypoint 3:a1|8:Waypoint 8 — TGT1:a2', JSON.stringify(onNav.targets));
// Red when: the hints are built from every `target`-typed waypoint (`.filter((w) => w.type === 'target')`), `targeted` no longer excluded.
// Seen: FAIL S3 a target-typed waypoint no attack uses is only a hint, and one an attack uses is not  [{"waypointId":"w-spare","steerpoint":5,"label":"Waypoint 5 — TGT2"},{"waypointId":"w-tgt","steerpoint":8,"label":"Waypoint 8 — TGT1"}]
ok('S3 a target-typed waypoint no attack uses is only a hint, and one an attack uses is not',
  onNav.targetHints.map((h) => h.label).join() === 'Waypoint 5 — TGT2', JSON.stringify(onNav.targetHints));
const allNav = summarize(summaryMission({ waypoints: [wpFeeder, wpTarget].map((w) => ({ ...structuredClone(w), type: 'nav' })) }));
// Red when: the targets are filtered by `w.type === 'target'` (the first S3 change).
// Seen: FAIL S3 with no target-typed waypoint at all, the attacks still name their targets  []
ok('S3 with no target-typed waypoint at all, the attacks still name their targets',
  allNav.targets.length === 1 && allNav.targets[0].steerpoint === 8 && allNav.targetHints.length === 0, JSON.stringify(allNav.targets));

// Readiness: the card's own verdict, on the visible mission.
const statusOf = (attack: unknown, parts: Record<string, unknown> = {}, refs = refsOf(), theaters = verifiedNevada) => {
  const summary = summarize(summaryMission({ attacks: [attack], ...parts }), STRICT_REVEAL, refs, theaters);
  return summary.attacks[0];
};
// Red when (summarizeMission): `if (!attacker) return ...` becomes `if (!attacker && false) return ...`, so a missing attacker reaches the card and reads 'error'.
// Seen: FAIL S4 an attack whose pilot is gone is blocked, and says why  {"id":"a1","sequence":1,"attackerCallsign":null,"targetLabel":"Waypoint 8 — TGT1","weaponName":"Mk-84 LDGP","strike":null,"estimated":false,"status":"blocked","blockedBy":"error","reasons":[]}
const ghostPilot = statusOf({ ...diveAttack, attackerId: 'ghost' });
ok('S4 an attack whose pilot is gone is blocked, and says why',
  ghostPilot.status === 'blocked' && ghostPilot.blockedBy === 'no-attacker' && ghostPilot.attackerCallsign === null, JSON.stringify(ghostPilot));
// Red when: `if (!target) return ...` becomes `if (!target && false) return ...`.
// Seen: FAIL S4 an attack whose target is gone is blocked, and says why  {"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1","targetLabel":null,"weaponName":"Mk-84 LDGP","strike":null,"estimated":false,"status":"blocked","blockedBy":"error","reasons":[]}
const ghostTarget = statusOf({ ...diveAttack, targetWaypointId: 'ghost' });
ok('S4 an attack whose target is gone is blocked, and says why',
  ghostTarget.status === 'blocked' && ghostTarget.blockedBy === 'no-target' && ghostTarget.targetLabel === null, JSON.stringify(ghostTarget));
// Red when: `if (!card || hasBrokenNumber(card)) return ...` loses its second half, so an attack with an empty profile reads ready.
// Seen: FAIL S4 an attack the card cannot be built from is never ready, and the summary does not throw  [{"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1","targetLabel":"Waypoint 8 — TGT1","weaponName":"Mk-84 LDGP","strike":null,"estimated":false,"status":"ready","reasons":[]},{"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1", ...
const brokenProfile = { ...diveAttack, profile: new Proxy({}, { get: () => { throw new Error('boom'); } }) };
let thrown = '';
let hollow: ReturnType<typeof statusOf> | undefined;
let broken: ReturnType<typeof statusOf> | undefined;
try {
  hollow = statusOf({ ...diveAttack, profile: {} });
  broken = statusOf(brokenProfile);
} catch (e) {
  thrown = String(e);
}
ok('S4 an attack the card cannot be built from is never ready, and the summary does not throw',
  thrown === '' && hollow?.status !== 'ready' && broken?.status === 'blocked' && broken.blockedBy === 'error', thrown || JSON.stringify([hollow, broken]));

const complete = statusOf(diveAttack);
// Red when (summarizeMission): `status: aboutTheAttack.length > 0 ? 'caution' : 'ready'` becomes `status: 'caution'`.
// Seen: FAIL S5 a complete dive on a verified theater is ready, with nothing to say  {"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1","targetLabel":"Waypoint 8 — TGT1","weaponName":"Mk-84 LDGP","strike":null,"estimated":false,"status":"caution","reasons":[]}
ok('S5 a complete dive on a verified theater is ready, with nothing to say',
  complete.status === 'ready' && complete.reasons.length === 0 && complete.weaponName === 'Mk-84 LDGP' && complete.attackerCallsign === 'Testcall 1-1'
    && complete.targetLabel === 'Waypoint 8 — TGT1' && complete.sequence === 1 && !complete.estimated, JSON.stringify(complete));
const estimated = statusOf({ ...diveAttack, estimated: true });
// Red when: `estimated: Boolean(attack.estimated)` becomes `estimated: false`.
// Seen: FAIL S5 an estimated profile is a caution, and says ESTIMATED  {"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1","targetLabel":"Waypoint 8 — TGT1","weaponName":"Mk-84 LDGP","strike":null,"estimated":false,"status":"caution","reasons":["ESTIMATED — 30° Dive CCIP has not been flown in DCS; ver ...
ok('S5 an estimated profile is a caution, and says ESTIMATED',
  estimated.status === 'caution' && estimated.estimated && estimated.reasons.some((r) => r.includes('ESTIMATED')), JSON.stringify(estimated));
const unknownWeapon = statusOf({ ...diveAttack, weaponId: 'no-such-weapon' });
// Red when: `if (refs.weapons.length > 0 && !refs.weapons.some(...)) reasons.push(...)` becomes `if (false && ...)`, so the line is never pushed.
// Seen: FAIL S5 a weapon the table does not hold is a caution  {"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1","targetLabel":"Waypoint 8 — TGT1","weaponName":null,"strike":null,"estimated":false,"status":"ready","reasons":[]}
ok('S5 a weapon the table does not hold is a caution',
  unknownWeapon.status === 'caution' && unknownWeapon.weaponName === null && unknownWeapon.reasons.includes('Weapon not in the weapon table'), JSON.stringify(unknownWeapon));
const notLoaded = statusOf({ ...diveAttack, weaponId: 'no-such-weapon' }, {}, refsOf({ weapons: [] }));
// Red when: the "not in the table" line no longer waits for `refs.weapons.length > 0` (that test is removed).
// Seen: FAIL S5 while the weapon table is still loading, nothing is called unknown  {"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1","targetLabel":"Waypoint 8 — TGT1","weaponName":null,"strike":null,"estimated":false,"status":"caution","reasons":["Weapon not in the weapon table"]}
ok('S5 while the weapon table is still loading, nothing is called unknown', !notLoaded.reasons.includes('Weapon not in the weapon table'), JSON.stringify(notLoaded));
const unverified = statusOf(diveAttack, {}, refsOf(), { nevada: theaterInfo('nevada', false) });
// Red when (summarizeMission): `const aboutTheAttack = info?.verified ? reasons : reasons.slice(1);` becomes `= reasons;`.
// Seen: FAIL S5 an unverified theater is said once, in the reasons, and does not make a clean attack a caution  {"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1","targetLabel":"Waypoint 8 — TGT1","weaponName":"Mk-84 LDGP","strike":null,"estimated":false,"status":"caution","reasons":["Test nevada: ma ...
ok('S5 an unverified theater is said once, in the reasons, and does not make a clean attack a caution',
  unverified.status === 'ready' && unverified.reasons.length === 1 && unverified.reasons[0].includes('unverified'), JSON.stringify(unverified));
const unlisted = statusOf(diveAttack, {}, refsOf(), {});
// Red when: the same change as the check above.
// Seen: FAIL S5 a theater the list does not hold is treated as unverified, the same way  {"id":"a1","sequence":1,"attackerCallsign":"Testcall 1-1","targetLabel":"Waypoint 8 — TGT1","weaponName":"Mk-84 LDGP","strike":null,"estimated":false,"status":"caution","reasons":["nevada: map projection unverified — co ...
ok('S5 a theater the list does not hold is treated as unverified, the same way',
  unlisted.status === 'ready' && unlisted.reasons[0]?.includes('unverified') === true, JSON.stringify(unlisted));
// Red when: `const aboutTheAttack = info?.verified ? reasons : reasons.slice(1);` becomes `= reasons.slice(1);`, so a verified theater loses its first real reason.
// Seen: FAIL S5 on a verified theater the first reason is not thrown away
ok('S5 on a verified theater the first reason is not thrown away', statusOf({ ...diveAttack, estimated: true }).status === 'caution');

// Flights.
const loadoutJets = [
  jet('f3', 'Testcall 1-3', 3, 'wingman', [{ weaponType: 'Mk-84 LDGP', quantity: 2, weaponId: 'mk84' }, { weaponType: 'Mystery Store', quantity: 1 }]),
  jet('f1', 'Testcall 1-1', 1, 'flight_lead'),
  jet('f2', 'Testcall 1-2', 2, 'element_lead'),
];
const crew = summarize(summaryMission({ flightMembers: loadoutJets }));
// Red when (summarizeMission): the position `.sort(...)` on the flight members becomes `.sort(() => 0)`.
// Seen: FAIL S6 the flight is listed by position, whatever order the file kept  ["f3","f1","f2"]
ok('S6 the flight is listed by position, whatever order the file kept',
  crew.flights.map((j) => j.position).join() === '1,2,3' && crew.flights[0].callsign === 'Testcall 1-1' && crew.flights[0].flight === 'Testcall 1'
    && crew.flights[1].role === 'element_lead' && crew.flights[0].attackIds.join() === 'a1', JSON.stringify(crew.flights.map((j) => j.memberId)));
// Red when: `known: refs.weapons.length === 0 ? null : weapon !== undefined` becomes `known: weapon !== undefined`.
// Seen: FAIL S6 a loadout line is known or not, and null while the weapon table has not loaded
ok('S6 a loadout line is known or not, and null while the weapon table has not loaded',
  JSON.stringify(crew.flights[2].loadout.map((l) => l.known)) === '[true,false]'
    && crew.flights[2].loadout[1].name === 'Mystery Store' && crew.flights[2].loadout[0].name === 'Mk-84 LDGP'
    && JSON.stringify(summarize(summaryMission({ flightMembers: loadoutJets }), STRICT_REVEAL, refsOf({ weapons: [] })).flights[2].loadout.map((l) => l.known)) === '[null,null]');
// Red when: `aircraftName` is `member.aircraftId` always (the table lookup is dropped).
// Seen: FAIL S6 the aircraft is named from the table, or by its id when the table has not got it
ok('S6 the aircraft is named from the table, or by its id when the table has not got it',
  crew.flights[0].aircraftName === 'F-16C Viper' && summarize(summaryMission(), STRICT_REVEAL, refsOf({ aircraft: [] })).flights[0].aircraftName === 'f16c');
// Red when: `jetsWithoutAttack: flights.filter((jet) => !attackers.has(jet.memberId))` becomes `flights.filter(() => true)`, which lists every jet.
// Seen: FAIL S6 a jet no attack names is listed as idle, and the rest are not  Testcall 1-1,Testcall 1-2,Testcall 1-3
ok('S6 a jet no attack names is listed as idle, and the rest are not',
  crew.readiness.jetsWithoutAttack.join() === 'Testcall 1-2,Testcall 1-3' && summarize(summaryMission()).readiness.jetsWithoutAttack.join() === 'Testcall 1-2',
  crew.readiness.jetsWithoutAttack.join());
// Red when: `ready: tallyOf('ready')` becomes `ready: 0`.
// Seen: FAIL S6 the readiness counts add up to the attacks
ok('S6 the readiness counts add up to the attacks',
  complete.status === 'ready' && summarize(summaryMission()).readiness.ready === 1
    && summarize(summaryMission({ attacks: [{ ...structuredClone(diveAttack), attackerId: 'ghost' }] })).readiness.blocked === 1);

// Theaters.
const unverifiedTheater = theaterInfo('kola', false);
// Red when (theaterStateOf): `info.verified ? 'verified' : 'unverified'` is swapped, to `? 'unverified' : 'verified'`.
// Seen: FAIL S7 the theater's state: real world, unknown, verified, unverified
ok('S7 the theater\'s state: real world, unknown, verified, unverified',
  theaterStateOf('real_world', undefined) === 'real_world' && theaterStateOf('real_world', theaterInfo('real_world', false)) === 'real_world'
    && theaterStateOf('atlantis', undefined) === 'unknown' && theaterStateOf('nevada', theaterInfo('nevada', true)) === 'verified'
    && theaterStateOf('kola', unverifiedTheater) === 'unverified');
const namedTheater = summarize(summaryMission({ theater: 'kola' }), STRICT_REVEAL, refsOf(), { kola: unverifiedTheater });
const unnamedTheater = summarize(summaryMission({ theater: 'atlantis' }), STRICT_REVEAL, refsOf(), {});
// Red when (summarizeMission): `displayName: info?.display_name ?? mission.theater` ends `?? ''`; the swap above fails it too (its state).
// Seen: FAIL S7 the theater is named from the list, and by its id when the list lacks it
ok('S7 the theater is named from the list, and by its id when the list lacks it',
  namedTheater.theater.displayName === 'Test kola' && namedTheater.theater.state === 'unverified'
    && unnamedTheater.theater.displayName === 'atlantis' && unnamedTheater.theater.state === 'unknown');
// Red when: `lastEdited` is `mission.updatedAt` with no `Date.parse` test.
// Seen: FAIL S7 the date it was last edited is the saved one, and nothing when it is not a date
ok('S7 the date it was last edited is the saved one, and nothing when it is not a date',
  summarize(summaryMission()).lastEdited === '2026-01-01T00:00:00Z' && summarize(summaryMission({ updatedAt: 'garbage' })).lastEdited === null);

// Strikes.
const twoJetStrike = { id: 's1', name: 'Testcall 1 strike', ip: {}, spacing_s: 30 };
const withStrikes = summarize(summaryMission({
  strikes: [twoJetStrike],
  attacks: [{ ...structuredClone(diveAttack), strikeId: 's1' }, { ...structuredClone(diveAttack), id: 'a2', sequenceNumber: 2, attackerId: 'f2', strikeId: 'ghost' }],
}));
// Red when (summarizeMission): `const strike = strikeOf(visible, attack.strikeId);` becomes `const strike = attack.strikeId ? { id: attack.strikeId, name: '' } : undefined;`.
// Seen: FAIL S8 an attack whose strike is gone has no strike, and one whose strike exists names it  [{"id":"s1","name":""},{"id":"ghost","name":""}]
ok('S8 an attack whose strike is gone has no strike, and one whose strike exists names it',
  withStrikes.attacks[0].strike?.name === 'Testcall 1 strike' && withStrikes.attacks[1].strike === null, JSON.stringify(withStrikes.attacks.map((a) => a.strike)));
// Red when: the strikes are listed with `.filter((s) => strikeMembers(visible, s.id).length > 1)` before the `.map`.
// Seen: FAIL S8 a strike with one member is still a strike  []
ok('S8 a strike with one member is still a strike',
  withStrikes.strikes.length === 1 && withStrikes.strikes[0].memberAttackIds.join() === 'a1' && withStrikes.strikes[0].spacing_s === 30, JSON.stringify(withStrikes.strikes));
// Red when: the attacks are not sorted (`const attacks = [...visible.attacks];`).
// Seen: FAIL S8 the attacks are listed by their own number, an unnumbered one last
ok('S8 the attacks are listed by their own number, an unnumbered one last',
  summarize(summaryMission({
    attacks: [{ ...structuredClone(diveAttack), id: 'late', sequenceNumber: undefined }, { ...structuredClone(diveAttack), id: 'second', sequenceNumber: 2 }, { ...structuredClone(diveAttack), id: 'first', sequenceNumber: 1 }],
  })).attacks.map((a) => a.id).join() === 'first,second,late');

// ─── Recent cards ────────────────────────────────────────────────────────────
const NEVADA_CENTER = { lat: 36.5, lon: -115.2 };
const centerOf = () => NEVADA_CENTER;
const fileKey: RecentKey = { source: 'file', path: 'a/b/plan.json' };
const FAR_THREAT = { lat: 12.3456789, lon: 98.7654321 };
const hiddenMission = summaryMission({
  notes: 'FAKE-NOTES-LINE',
  threats: [
    threatAt('vis-1', 'sa2', 36.7777777, -115.4444444),
    threatAt('leak-t1', 'sa10', FAR_THREAT.lat, FAR_THREAT.lon, { notes: 'FAKE-GROUP-NOTE', hiddenOnPlanner: true, hiddenOnMap: true }),
    threatAt('leak-t2', 'sa6', FAR_THREAT.lat, FAR_THREAT.lon, { notes: 'FAKE-GROUP-NOTE', hiddenOnMap: true }),
  ],
});
const okCard = (card: RecentCard) => (card.status === 'ok' ? card : null);

// Red when (recentCardFrom): `visibleMission(mission, STRICT_REVEAL)` is given `{ onPlanner: true, onMap: true }`
// (the thumbnail's threats read from `mission.threats` instead of `visible.threats` does the same).
// Seen: FAIL R1 a card holds no hidden position, id or note, and no mission  {"status":"ok","key":{"source":"file","path":"a/b/plan.json"},"name":"Test Mission","theaterId":"nevada","lastEdited":"2026-01-01T0 ...
const strictCard = recentCardFrom(hiddenMission, fileKey, centerOf);
const cardText = JSON.stringify(strictCard);
const secretsAbsent = (text: string) => ['12.3456789', '98.7654321', 'FAKE-GROUP-NOTE', 'leak-t1', 'leak-t2', 'FAKE-NOTES-LINE', 'sa10', 'sa6'].every((secret) => !text.includes(secret));
ok('R1 a card holds no hidden position, id or note, and no mission',
  secretsAbsent(cardText) && !('mission' in strictCard) && okCard(strictCard)?.thumbnail.threats.length === 1
    && okCard(strictCard)?.thumbnail.threats[0].lat === 36.7777777, cardText.slice(0, 200));
// Red when: `recentCardFrom` gains a fourth parameter, `reveal: HiddenReveal`, with no default
// (a parameter with a default would leave `.length` at three, so only a required one is caught by this check).
// Seen: FAIL R1 the card is made from three things only, with no say over what is revealed
ok('R1 the card is made from three things only, with no say over what is revealed', recentCardFrom.length === 3);
// Red when: the same change as the first R1 check.
// Seen: FAIL R1 a card made while the Admin switches are on is still strict  {"status":"ok","key":{"source":"file","path":"a/b/plan.json"},"name":"Test Mission","theaterId":"nevada","lastEdited":"2026-01-01T0 ...
const revealBefore = useUiStore.getState().revealHidden;
let whileRevealed = '';
try {
  useUiStore.setState({ revealHidden: { onPlanner: true, onMap: true } });
  whileRevealed = JSON.stringify(recentCardFrom(hiddenMission, fileKey, centerOf));
} finally {
  useUiStore.setState({ revealHidden: revealBefore });
}
ok('R1 a card made while the Admin switches are on is still strict', whileRevealed !== '' && secretsAbsent(whileRevealed), whileRevealed.slice(0, 200));

// Red when (recentKeys): the web branch returns `recentPaths.map((path): RecentKey => ({ source: 'file', path }))` instead of the entries.
// Seen: FAIL R3 the desktop lists its files in order, the browser its own entries, and neither the other's
const entries = [
  { id: 'e1', name: 'First', theater: 'nevada', attackCount: 1, savedAt: '2026-05-02T10:00:00Z' },
  { id: 'e2', name: 'Second', theater: 'nevada', attackCount: 0, savedAt: '2026-05-01T10:00:00Z' },
];
const desktopKeys = recentKeys(false, ['p/one.json', 'p/two.json'], entries);
const webKeys = recentKeys(true, ['p/one.json', 'p/two.json'], entries);
ok('R3 the desktop lists its files in order, the browser its own entries, and neither the other\'s',
  desktopKeys.map(recentKeyId).join() === 'file:p/one.json,file:p/two.json' && webKeys.map(recentKeyId).join() === 'browser:e1,browser:e2'
    && webKeys[0].source === 'browser' && webKeys[0].name === 'First' && recentKeys(true, ['p/one.json'], []).length === 0
    && recentKeys(false, [], entries).length === 0);
// Red when (recentKeyId): a file's id is `'file:'` alone, without its path.
// Seen: FAIL R3 every card has its own id, even when a file and an entry share a name
ok('R3 every card has its own id, even when a file and an entry share a name',
  new Set([...recentKeys(false, ['same'], []), ...recentKeys(true, [], [{ ...entries[0], id: 'same' }])].map(recentKeyId)).size === 2
    && new Set(desktopKeys.map(recentKeyId)).size === 2);

// Red when (recentCardFrom): `lastEdited` ignores `savedAt` (`[savedAt, mission.updatedAt].find(finiteTime)` becomes `[mission.updatedAt].find(finiteTime)`).
// Seen: FAIL R5 a browser card says when the browser saved it, a file card when the mission says it was edited
const browserKey: RecentKey = { source: 'browser', id: 'e1', name: 'First', savedAt: '2026-05-02T10:00:00Z' };
const fromBrowser = okCard(recentCardFrom(summaryMission(), browserKey, centerOf));
const fromFile = okCard(recentCardFrom(summaryMission(), fileKey, centerOf));
ok('R5 a browser card says when the browser saved it, a file card when the mission says it was edited',
  fromBrowser?.lastEdited === '2026-05-02T10:00:00Z' && fromFile?.lastEdited === '2026-01-01T00:00:00Z');
// Red when: `finiteTime` is `typeof text === 'string'` alone, with no `Number.isFinite(Date.parse(text))`.
// Seen: FAIL R5 a time that is not a time is no time at all
ok('R5 a time that is not a time is no time at all',
  okCard(recentCardFrom(summaryMission({ updatedAt: 'garbage' }), fileKey, centerOf))?.lastEdited === null
    && okCard(recentCardFrom(summaryMission({ updatedAt: 'garbage' }), { ...browserKey, savedAt: 'garbage' }, centerOf))?.lastEdited === null
    && okCard(recentCardFrom(summaryMission(), { ...browserKey, savedAt: 'garbage' }, centerOf))?.lastEdited === '2026-01-01T00:00:00Z');
// Red when: the flights are grouped by the whole callsign (`const group = member.callsign;`).
// Seen: FAIL R5 two jets of one flight are one group of two, and the card counts the attacks  [{"group":"Testcall 1-1","aircraftIds":["f16c"],"jets":1},{"group":"Testcall 1-2","aircraftIds":["f16c"],"jets":1}]
ok('R5 two jets of one flight are one group of two, and the card counts the attacks',
  fromFile?.flights.length === 1 && fromFile.flights[0].group === 'Testcall 1' && fromFile.flights[0].jets === 2
    && fromFile.flights[0].aircraftIds.join() === 'f16c' && fromFile.attackCount === 1 && fromFile.name === 'Test Mission' && fromFile.theaterId === 'nevada',
  JSON.stringify(fromFile?.flights));
// Red when: `realWorld: isRealWorld(mission)` becomes `realWorld: false`.
// Seen: FAIL R5 the card knows nothing it was not asked for: a theater with no centre, a real-world mission
ok('R5 the card knows nothing it was not asked for: a theater with no centre, a real-world mission',
  okCard(recentCardFrom(summaryMission(), fileKey, () => null))?.thumbnail.fallbackCenter === null
    && okCard(recentCardFrom(summaryMission({ theater: 'real_world' }), fileKey, centerOf))?.thumbnail.realWorld === true
    && fromFile?.thumbnail.realWorld === false);

// Red when (recentCardFrom): the problems are joined as they are, with the values (`check.problems.map(withoutValues).join('; ')` loses its `.map`).
// Seen: FAIL R2 an unusable file is said so without echoing what was wrong in it  Not a usable mission file — Mission: notes must be text (got {"secret":"FAKE-NOTES-LINE"}); Threat 1: not a real position (got {"lat":36.5,"lon":190.5})
const echoing = recentCardFrom(summaryMission({ threats: [threatAt('x', 'sa2', 36.5, 190.5, { notes: 'FAKE-GROUP-NOTE', hiddenOnPlanner: true })], notes: { secret: 'FAKE-NOTES-LINE' } }), fileKey, centerOf);
ok('R2 an unusable file is said so without echoing what was wrong in it',
  echoing.status === 'unreadable' && echoing.message.startsWith('Not a usable mission file — ') && echoing.message.includes('not a real position')
    && !echoing.message.includes('190.5') && !echoing.message.includes('FAKE-NOTES-LINE'), echoing.status === 'unreadable' ? echoing.message : echoing.status);

// ─── The little route picture ────────────────────────────────────────────────
const SIZE = { width: 320, height: 200 };
const pad = 12;
const farNorth = calculateDestination({ lat: 36.5, lon: -115.2 }, 0, 200);
const routeMission = summaryMission({
  waypoints: [
    { id: 'r1', steerpoint: 1, name: 'A', type: 'nav', coordinates: { lat: 36.0, lon: -117.0 }, elevation_ft: 0 },
    { id: 'r2', steerpoint: 2, name: 'B', type: 'nav', coordinates: { lat: 36.8, lon: -116.0 }, elevation_ft: 0 },
    { id: 'r3', steerpoint: 3, name: 'C', type: 'target', coordinates: { lat: 37.5, lon: -114.5 }, elevation_ft: 0 },
  ],
  attacks: [],
  threats: [threatAt('t1', 'sa2', 36.4, -115.6)],
});
const routeCard = okCard(recentCardFrom(routeMission, fileKey, centerOf))!;
const routePlan = planThumbnail(routeCard.thumbnail, SIZE);
const inside = (p: { x: number; y: number }) => p.x >= pad - 0.5 && p.x <= SIZE.width - pad + 0.5 && p.y >= pad - 0.5 && p.y <= SIZE.height - pad + 0.5;
// Red when (planThumbnail): `const s = Math.min(Math.min(availW / spanX, availH / spanY), ...)` takes the larger of the two (`Math.max`).
// Seen: FAIL T2 every waypoint and threat lands inside the padding, and the route keeps its order  [{"x":12.000000000000597,"y":210.8330010961798,"steerpoint":1},{"x":130.4000000000013,"y":93.15088422961553,"steerpoint":2},{"x":308.00000000000057, ...
ok('T2 every waypoint and threat lands inside the padding, and the route keeps its order',
  routePlan.waypoints.length === 3 && routePlan.threats.length === 1 && [...routePlan.waypoints, ...routePlan.threats].every(inside)
    && routePlan.route.length === 3 && routePlan.route.every(([x, y], i) => x === routePlan.waypoints[i].x && y === routePlan.waypoints[i].y)
    && routePlan.waypoints.map((w) => w.steerpoint).join() === '1,2,3' && !routePlan.empty, JSON.stringify(routePlan.waypoints));
// Red when (recentCardFrom): the thumbnail's waypoints gain the bullseye (`[...visible.waypoints, { coordinates: mission.bullseye, steerpoint: 0 }]`).
// Seen: FAIL T2 moving the bullseye changes nothing in the card or the picture
const movedBullseye = okCard(recentCardFrom({ ...routeMission, bullseye: { lat: 56.2, lon: -95.0 } }, fileKey, centerOf))!;
ok('T2 moving the bullseye changes nothing in the card or the picture',
  isDeepStrictEqual(movedBullseye, routeCard) && isDeepStrictEqual(planThumbnail(movedBullseye.thumbnail, SIZE), routePlan));
// Red when (planThumbnail): the minimum span is not applied (`const minSpan = minSpanNm / nmPerUnit;` becomes `const minSpan = 0;`).
// Seen: FAIL T2 one point alone still shows ten miles of ground, and never zooms past the map's own limit  [{"x":160,"y":100,"steerpoint":1}]
const alone = planThumbnail({ waypoints: [{ lat: 36.5, lon: -115.2, steerpoint: 1 }], threats: [], fallbackCenter: null, realWorld: false }, SIZE);
const shownNm = (plan: { pxPerNm: number }) => (Math.min(SIZE.width, SIZE.height) - 2 * pad) / plan.pxPerNm;
ok('T2 one point alone still shows ten miles of ground, and never zooms past the map\'s own limit',
  Math.abs(shownNm(alone) - 10) < 1e-6 && alone.scaleZoom <= 11 && alone.waypoints.length === 1
    && Math.abs(alone.waypoints[0].x - SIZE.width / 2) < 1e-6 && Math.abs(alone.waypoints[0].y - SIZE.height / 2) < 1e-6, JSON.stringify(alone.waypoints));
// Red when: the zoom cap is dropped (`Math.min(Math.min(availW / spanX, availH / spanY), TILE_PX * 2 ** MAX_SCALE_ZOOM)` becomes `Math.min(availW / spanX, availH / spanY)`).
// Seen: FAIL T2 on a very large picture the zoom stops at the map's limit  14.303572653042952
const huge = planThumbnail({ waypoints: [{ lat: 36.5, lon: -115.2, steerpoint: 1 }], threats: [], fallbackCenter: null, realWorld: false }, { width: 4000, height: 3000 });
ok('T2 on a very large picture the zoom stops at the map\'s limit', huge.scaleZoom <= 11 + 1e-9 && huge.scaleZoom > 10.9, String(huge.scaleZoom));
// Red when: the tile count is not limited (`planBasemap(nw, se, pxPerNm, latC, maxTiles)` ends `1000)`).
// Seen: FAIL T2 the tiles are few, and between them cover all four corners of the picture  6 / 6
const tilesCover = (plan: ReturnType<typeof planThumbnail>, corner: [number, number]) =>
  plan.tiles.some(({ rect }) => rect.x <= corner[0] && corner[0] <= rect.x + rect.w && rect.y <= corner[1] && corner[1] <= rect.y + rect.h);
const corners: Array<[number, number]> = [[0, 0], [SIZE.width, 0], [0, SIZE.height], [SIZE.width, SIZE.height]];
const fewTiles = planThumbnail(routeCard.thumbnail, SIZE, { maxTiles: 4 });
ok('T2 the tiles are few, and between them cover all four corners of the picture',
  routePlan.tiles.length > 0 && routePlan.tiles.length <= 9 && fewTiles.tiles.length > 0 && fewTiles.tiles.length <= 4
    && corners.every((c) => tilesCover(routePlan, c) && tilesCover(fewTiles, c)) && routePlan.tilesOmitted === null,
  `${routePlan.tiles.length} / ${fewTiles.tiles.length}`);
// The tiles are planned for the whole picture, not for the box round the points. The route above is nearly
// square, so the box round it reaches the corners of its picture anyway; a flat route in a tall picture does not.
const routeOf = (points: Array<[number, number]>): ThumbnailInput =>
  ({ waypoints: points.map(([lat, lon], i) => ({ lat, lon, steerpoint: i + 1 })), threats: [], fallbackCenter: null, realWorld: false });
const flatRoute = routeOf([[36.5, -117], [36.5, -114]]);
const tallRoute = routeOf([[35, -115.2], [38, -115.2]]);
const pictures = [{ width: 320, height: 200 }, { width: 200, height: 600 }, { width: 600, height: 600 }];
const uncovered = [['flat', flatRoute], ['tall', tallRoute]].flatMap(([name, input]) => pictures.flatMap((picture) => {
  const plan = planThumbnail(input as ThumbnailInput, picture);
  const cornersOf: Array<[number, number]> = [[0, 0], [picture.width, 0], [0, picture.height], [picture.width, picture.height]];
  return plan.tiles.length > 0 && cornersOf.every((c) => tilesCover(plan, c)) ? [] : [`${name} ${picture.width}x${picture.height}`];
}));
// Red when (planThumbnail): the tile corners are taken from the box round the points
// (`tileNwCorner(minX, minY, 0)` and `tileNwCorner(maxX, maxY, 0)` in place of the two lines that use the picture's own edges).
// Seen: FAIL T2 a flat route in a tall picture, and a tall one in a wide picture, still have tiles to every corner  ["flat 320x200","flat 200x600","flat 600x600","tall 320x200","tall 200x600","tall 600x600"]
ok('T2 a flat route in a tall picture, and a tall one in a wide picture, still have tiles to every corner', uncovered.length === 0, JSON.stringify(uncovered));
// Red when: the tile's key `tileKey(tile)` becomes `String(tile.x)`.
// Seen: FAIL T2 tiles are named z/x/y, once each
ok('T2 tiles are named z/x/y, once each',
  routePlan.tiles.every((t) => t.key === `${t.tile.z}/${t.tile.x}/${t.tile.y}`) && new Set(routePlan.tiles.map((t) => t.key)).size === routePlan.tiles.length);

// A waypoint standing on a tile's corner is on that corner's pixel: one conversion places both.
// Red when (planThumbnail): the waypoints are given one pixel to the right of the shared conversion (`x: waypointPx[i][0] + 1`).
// Seen: FAIL T3 a waypoint on a tile's corner lands on the corner's pixel  {"dot":{"x":69.92965181696398,"y":118.2590650603317,"steerpoint":99},"rect":{"x":69,"y":118,"w":132,"h":132}}
const manyTiles = { ...routeCard.thumbnail };
const wide = planThumbnail(manyTiles, SIZE, { maxTiles: 48 });
const inBox = (c: { lat: number; lon: number }) => c.lat > 36.0 && c.lat < 37.5 && c.lon > -117.0 && c.lon < -114.5;
const inner = wide.tiles.find((t) => inBox(tileNwCorner(t.tile.x, t.tile.y, t.tile.z)));
const cornerAt = inner ? tileNwCorner(inner.tile.x, inner.tile.y, inner.tile.z) : { lat: 0, lon: 0 };
const withCorner = planThumbnail({ ...manyTiles, waypoints: [...manyTiles.waypoints, { lat: cornerAt.lat, lon: cornerAt.lon, steerpoint: 99 }] }, SIZE, { maxTiles: 48 });
const sameTile = withCorner.tiles.find((t) => t.key === inner?.key);
const dot = withCorner.waypoints[withCorner.waypoints.length - 1];
ok('T3 a waypoint on a tile\'s corner lands on the corner\'s pixel',
  inner != null && sameTile != null && withCorner.scaleZoom === wide.scaleZoom
    && Math.abs(dot.x - sameTile.rect.x) <= 0.5 && Math.abs(dot.y - sameTile.rect.y) <= 0.5,
  JSON.stringify({ dot, rect: sameTile?.rect }));
// The threats go through the same conversion, each from its own place in the list.
// Red when (planThumbnail): the threats' pixels are all taken from the first one (`pxOf(threatWorld[i])` becomes `pxOf(threatWorld[0])`).
// Seen: FAIL T3 a threat on a tile's corner lands on the corner's pixel, wherever it stands in the list  {"threatDot":{"x":174.101215202536,"y":141.4011795250921,"systemId":"sa6"},"rect":{"x":69,"y":118,"w":132,"h":132}}
const withThreat = planThumbnail({ ...manyTiles, threats: [...manyTiles.threats, { lat: cornerAt.lat, lon: cornerAt.lon, systemId: 'sa6' }] }, SIZE, { maxTiles: 48 });
const threatTile = withThreat.tiles.find((t) => t.key === inner?.key);
const threatDot = withThreat.threats[withThreat.threats.length - 1];
ok('T3 a threat on a tile\'s corner lands on the corner\'s pixel, wherever it stands in the list',
  threatTile != null && withThreat.threats.length === 2 && withThreat.scaleZoom === wide.scaleZoom && threatDot.systemId === 'sa6'
    && Math.abs(threatDot.x - threatTile.rect.x) <= 0.5 && Math.abs(threatDot.y - threatTile.rect.y) <= 0.5,
  JSON.stringify({ threatDot, rect: threatTile?.rect }));

// Red when (planThumbnail): the real-world test is dropped from the tile condition (`if (!input.realWorld && withBasemap)` becomes `if (withBasemap)`).
// Seen: FAIL T4 a mission on a real place gets no tiles, and keeps its dots
const realWorldPlan = planThumbnail({ ...routeCard.thumbnail, realWorld: true }, SIZE);
ok('T4 a mission on a real place gets no tiles, and keeps its dots',
  realWorldPlan.tiles.length === 0 && realWorldPlan.tilesOmitted === 'real-world' && realWorldPlan.waypoints.length === 3 && realWorldPlan.threats.length === 1);
// Red when: `const withBasemap = opts.basemap !== false;` becomes `const withBasemap = true;`.
// Seen: FAIL T4 a picture without a map says so
const noMapPlan = planThumbnail(routeCard.thumbnail, SIZE, { basemap: false });
ok('T4 a picture without a map says so', noMapPlan.tiles.length === 0 && noMapPlan.tilesOmitted === 'basemap-off' && noMapPlan.waypoints.length === 3);
// Red when: `tilesOmitted = tiles.length === 0 ? 'too-many' : null;` becomes `tilesOmitted = null;`.
// Seen: FAIL T4 a frame too wide to cover in a few tiles asks for none, and says too many  null
const wholeWorld = planThumbnail({
  waypoints: [{ lat: 60, lon: -170, steerpoint: 1 }, { lat: -50, lon: 170, steerpoint: 2 }], threats: [], fallbackCenter: null, realWorld: false,
}, SIZE, { maxTiles: 2 });
ok('T4 a frame too wide to cover in a few tiles asks for none, and says too many', wholeWorld.tiles.length === 0 && wholeWorld.tilesOmitted === 'too-many', wholeWorld.tilesOmitted ?? 'null');

// Red when (planThumbnail): the fallback is ignored (`const fallback = ... ? worldOf(...) : null;` starts `false ?`).
// Seen: FAIL T5 no points but a centre to fall back on: an empty picture of that place  {"empty":true,"tiles":0}
const emptyAtFallback = planThumbnail({ waypoints: [], threats: [], fallbackCenter: NEVADA_CENTER, realWorld: false }, SIZE);
const middle = lonLatToTile(NEVADA_CENTER.lat, NEVADA_CENTER.lon, emptyAtFallback.tiles[0]?.tile.z ?? 0);
const middleTile = emptyAtFallback.tiles.find((t) => t.tile.x === Math.floor(middle.x) && t.tile.y === Math.floor(middle.y));
ok('T5 no points but a centre to fall back on: an empty picture of that place',
  emptyAtFallback.empty && emptyAtFallback.waypoints.length === 0 && emptyAtFallback.tiles.length > 0 && Math.abs(shownNm(emptyAtFallback) - 10) < 1e-6
    && middleTile != null && Math.abs(middleTile.rect.x + (middle.x - Math.floor(middle.x)) * middleTile.rect.w - SIZE.width / 2) < 1
    && Math.abs(middleTile.rect.y + (middle.y - Math.floor(middle.y)) * middleTile.rect.h - SIZE.height / 2) < 1,
  JSON.stringify({ empty: emptyAtFallback.empty, tiles: emptyAtFallback.tiles.length }));
// Red when: `if (!fallback) return nothing;` becomes `if (!fallback) throw new Error('nothing to frame');`.
// Seen: FAIL T5 nothing to frame at all is an empty picture, not an error  Error: nothing to frame
let nothingPlan: ReturnType<typeof planThumbnail> | undefined;
let nothingError = '';
try {
  nothingPlan = planThumbnail({ waypoints: [], threats: [], fallbackCenter: null, realWorld: false }, SIZE);
} catch (e) {
  nothingError = String(e);
}
ok('T5 nothing to frame at all is an empty picture, not an error',
  nothingError === '' && nothingPlan?.empty === true && nothingPlan.tiles.length === 0 && nothingPlan.route.length === 0, nothingError);
// Red when: the threats are not cut to MAX_THUMB_THREATS (`input.threats.slice(0, MAX_THUMB_THREATS).filter(isPosition)` loses its `.slice`).
// Seen: FAIL T5 ten thousand threats are cut to the limit, and quickly  10000 in 3 ms
const crowd = Array.from({ length: 10_000 }, (_, i) => ({ lat: 36 + (i % 100) / 100, lon: -116 + Math.floor(i / 100) / 100, systemId: 'sa2' }));
const started = Date.now();
const crowded = planThumbnail({ waypoints: [{ lat: 36.5, lon: -115.2, steerpoint: 1 }], threats: crowd, fallbackCenter: null, realWorld: false }, SIZE);
const took = Date.now() - started;
ok('T5 ten thousand threats are cut to the limit, and quickly', crowded.threats.length === MAX_THUMB_THREATS && took < 100, `${crowded.threats.length} in ${took} ms`);
// Red when: `clampLat` returns its argument unchanged (`const clampLat = (lat: number): number => lat;`).
// Seen: FAIL T5 the poles do not break the arithmetic  [{"x":161,"y":null,"steerpoint":1},{"x":161,"y":null,"steerpoint":2}]
const finite = (plan: ReturnType<typeof planThumbnail>) =>
  [plan.scaleZoom, plan.pxPerNm, ...plan.route.flat(), ...plan.waypoints.flatMap((w) => [w.x, w.y]), ...plan.tiles.flatMap((t) => [t.rect.x, t.rect.y, t.rect.w, t.rect.h])].every(Number.isFinite);
const poles = planThumbnail({
  waypoints: [{ lat: 90, lon: 0, steerpoint: 1 }, { lat: -90, lon: 10, steerpoint: 2 }], threats: [{ lat: 90, lon: 180, systemId: 'sa2' }], fallbackCenter: null, realWorld: false,
}, SIZE);
ok('T5 the poles do not break the arithmetic', finite(poles) && poles.waypoints.length === 2 && finite(routePlan), JSON.stringify(poles.waypoints));
// Red when: `isPosition` always answers true.
// Seen: FAIL T5 a point that is not a position is left out, not drawn as NaN
ok('T5 a point that is not a position is left out, not drawn as NaN',
  planThumbnail({ waypoints: [{ lat: NaN, lon: 1, steerpoint: 1 }, { lat: 36.5, lon: -115.2, steerpoint: 2 }], threats: [], fallbackCenter: null, realWorld: false }, SIZE).waypoints.length === 1);

// The card plans its picture 16:9 (CARD_PICTURE); a short window shows it 2:1, which crops (180 - 160) / 2 = 10 off the
// top and the bottom. A point standing on the frame's edge must still show its whole circle, outline included, so the
// check plans the picture the way the card does and looks for a dot that the 2:1 crop would cut. Two routes that reach
// the frame: the route above, and one with a waypoint on the south edge and a threat (the widest dot) on the north edge.
// This plans the picture itself, so it holds the margin's number; that the card uses it is held by landing-ui-check (UI12),
// which reads the circles out of the card's own markup.
// Red when (CARD_PICTURE): `marginPx: 16` becomes `marginPx: 12` (the planner's own default margin).
// Seen: FAIL T6 a dot on the frame's edge keeps its whole circle when a short window crops the picture to 2:1  route cut: waypoint 1 at y 168.00, waypoint 3 at y 12.00; edge cut: waypoint 1 at y 168.00, threat 1 at y 12.00; edge reaches the frame true
const cardPlanOf = (input: ThumbnailInput) => planThumbnail(input, CARD_PICTURE, { paddingPx: CARD_PICTURE.marginPx });
const keptTop = (CARD_PICTURE.height - CARD_PICTURE.width / 2) / 2;
const keptBottom = CARD_PICTURE.height - keptTop;
const dotsOf = (plan: ReturnType<typeof planThumbnail>) => [
  ...plan.waypoints.map((w, i) => ({ name: `waypoint ${i + 1}`, x: w.x, y: w.y, r: CARD_PICTURE.dot.waypoint + CARD_PICTURE.dot.outline / 2 })),
  ...plan.threats.map((t, i) => ({ name: `threat ${i + 1}`, x: t.x, y: t.y, r: CARD_PICTURE.dot.threat + CARD_PICTURE.dot.outline / 2 })),
];
const cutDots = (plan: ReturnType<typeof planThumbnail>) =>
  dotsOf(plan).filter((d) => d.y - d.r < keptTop - 1e-9 || d.y + d.r > keptBottom + 1e-9 || d.x - d.r < -1e-9 || d.x + d.r > CARD_PICTURE.width + 1e-9);
const edgeRoute: ThumbnailInput = {
  waypoints: [{ lat: 36.0, lon: -116.0, steerpoint: 1 }, { lat: 36.4, lon: -116.0, steerpoint: 2 }],
  threats: [{ lat: 37.0, lon: -116.0, systemId: 'sa2' }],
  fallbackCenter: null, realWorld: false,
};
const routeOnCard = cardPlanOf(routeCard.thumbnail);
const edgeOnCard = cardPlanOf(edgeRoute);
const reachesEdge = (plan: ReturnType<typeof planThumbnail>) => {
  const ys = dotsOf(plan).map((d) => d.y);
  return Math.abs(Math.min(...ys) - CARD_PICTURE.marginPx) < 0.5 && Math.abs(Math.max(...ys) - (CARD_PICTURE.height - CARD_PICTURE.marginPx)) < 0.5;
};
const cutNames = (plan: ReturnType<typeof planThumbnail>) => cutDots(plan).map((d) => `${d.name} at y ${d.y.toFixed(2)}`).join(', ');
ok('T6 a dot on the frame\'s edge keeps its whole circle when a short window crops the picture to 2:1',
  reachesEdge(routeOnCard) && reachesEdge(edgeOnCard) && routeOnCard.waypoints.length === 3 && edgeOnCard.threats.length === 1
    && cutDots(routeOnCard).length === 0 && cutDots(edgeOnCard).length === 0,
  `route cut: ${cutNames(routeOnCard) || 'none'}; edge cut: ${cutNames(edgeOnCard) || 'none'}; edge reaches the frame ${reachesEdge(edgeOnCard)}`);

// What the phone's header shows: the mission's name only on the map, and the red unsaved dot only beside that name.
// On the front page with a mission open and unsaved, the header is the app's own name: no dot there.
// Red when (phoneHeader): `dirty: named && unsaved` becomes `dirty: unsaved`.
// Seen: FAIL H1 the phone's header shows the unsaved dot only beside the mission's name  {"onMap":{"title":"Venom 1 - Plan","dirty":true},"onFront":{"title":"Phoenix Weaponeer","dirty":true},"cleanOnMap":{"title":"Venom 1 - Plan","dirty":false},"noMission":{"title":"Phoenix Weaponeer","dirty":true}}
//         (on the front page with a mission open and unsaved, and with no mission at all, the dot was shown beside the app's name)
{
  const shown = {
    onMap: phoneHeader('Venom 1 - Plan', true, true, 'Phoenix Weaponeer'),
    onFront: phoneHeader('Venom 1 - Plan', false, true, 'Phoenix Weaponeer'),
    cleanOnMap: phoneHeader('Venom 1 - Plan', true, false, 'Phoenix Weaponeer'),
    noMission: phoneHeader(null, true, true, 'Phoenix Weaponeer'),
  };
  ok('H1 the phone\'s header shows the unsaved dot only beside the mission\'s name',
    shown.onMap.title === 'Venom 1 - Plan' && shown.onMap.dirty && shown.onFront.title === 'Phoenix Weaponeer' && !shown.onFront.dirty
      && !shown.cleanOnMap.dirty && shown.noMission.title === 'Phoenix Weaponeer' && !shown.noMission.dirty, JSON.stringify(shown));
}
// On the Flight overview the phone's header is the flight and its jets, over the mission's line; the mission's name
// is only in that smaller line, so no dot there either. A flight with no jets is its name alone. Unsaved work is said in
// words instead of a dot, FIRST in that second line (a phone cuts a line at its right end), and not at all when saved.
// Red when (phoneHeader): the overview's branch (`if (missionName !== null && !onMap && overview) { … }`) is deleted.
// Seen: FAIL H2 on the Flight overview the phone's header is the flight over the mission's line, with no dot  {"overview":{"title":"Phoenix Weaponeer","dirty":false},"noJets":{"title":"Phoenix Weaponeer","dirty":false},"onMap":{"title":"Venom 1 - Plan","dirty":true}}
// Red when (phoneHeader, the words): `const subtitle = unsaved ? [unsavedWords, overview.sub].filter(Boolean).join(' · ') : overview.sub;` becomes `const subtitle = overview.sub;`.
// Seen: FAIL H2 …  {"overview":{"title":"Venom 1 · 4 × F-16C Viper","subtitle":"Venom 1 - Plan · Test Nevada · edited today, 14:20","dirty":false},"saved":{…,"subtitle":"Venom 1 - Plan · Test Nevada · edited today, 14:20","dirty":false},"noLine":{"title":"Venom 1 · 4 × F-16C Viper","dirty":false},…
//         (with unsaved work the second line carried no words)
//       FAIL H2 …  {"overview":{…,"subtitle":"Venom 1 - Plan · Test Nevada · edited today, 14:20 · Not exported","dirty":false},"saved":{…},"noLine":{"title":"Venom 1 · 4 × F-16C Viper","subtitle":"Unsaved changes","dirty…
//         (the words put last in the line instead of first)
{
  const where = { title: 'Venom 1', aircraft: '4 × F-16C Viper', sub: 'Venom 1 - Plan · Test Nevada · edited today, 14:20' };
  const shown = {
    overview: phoneHeader('Venom 1 - Plan', false, true, 'Phoenix Weaponeer', where, 'Not exported'),
    saved: phoneHeader('Venom 1 - Plan', false, false, 'Phoenix Weaponeer', where, 'Not exported'),
    noLine: phoneHeader('Venom 1 - Plan', false, true, 'Phoenix Weaponeer', { ...where, sub: '' }, 'Unsaved changes'),
    noJets: phoneHeader('Venom 1 - Plan', false, false, 'Phoenix Weaponeer', { title: 'Venom 1 - Plan', aircraft: '', sub: 'Venom 1 - Plan · Test Nevada' }),
    onMap: phoneHeader('Venom 1 - Plan', true, true, 'Phoenix Weaponeer', null),
  };
  ok('H2 on the Flight overview the phone\'s header is the flight over the mission\'s line, with no dot; unsaved work is said in words first in that line',
    shown.overview.title === 'Venom 1 · 4 × F-16C Viper' && shown.overview.subtitle === `Not exported · ${where.sub}` && !shown.overview.dirty
      && shown.saved.subtitle === where.sub && !shown.saved.dirty && shown.noLine.subtitle === 'Unsaved changes' && !shown.noLine.dirty
      && shown.noJets.title === 'Venom 1 - Plan' && shown.noJets.subtitle === 'Venom 1 - Plan · Test Nevada' && shown.onMap.title === 'Venom 1 - Plan' && shown.onMap.dirty && shown.onMap.subtitle === undefined,
    JSON.stringify(shown));
}
// On the map the phone's header, given the place, has a second line: the place, then the words that stand beside the dot
// ("Test Nevada · Not exported"); the place alone when saved; the words alone while the place is not known; nothing when
// there is neither. The dot stays beside the mission's name. The place belongs to the mission, so the front page's header
// (the app's name) and the overview's second line never take it.
// Red when (phoneHeader): `[place, unsaved ? unsavedWords : '']` becomes `[place]` (the words leave the map's line).
// Seen: FAIL H3 on the map the phone's header has a second line: the place, then the unsaved words beside the dot; the front page and the overview never take the place  {"unsaved":{"title":"Venom 1 - Plan","subtitle":"Test Nevada","dirty":true},"saved":{…},"noPlace":{"title":"Venom 1 - Plan","dirty":true},"nothing":{…},…
//         (an unsaved map said only the place, and with no place said nothing)
// Red when (phoneHeader): `named && place !== null` becomes `place !== null` (the front page's header would carry the mission's place under the app's name).
// Seen: FAIL H3 …  {…,"onFront":{"title":"Phoenix Weaponeer","subtitle":"Test Nevada · Not exported","dirty":false},"noMission":{"title":"Phoenix Weaponeer","subtitle":"Test Nevada · Not exported","dirty":false},…
//         (the place and the unsaved words under the app's own name)
{
  const where = { title: 'Venom 1', aircraft: '4 × F-16C Viper', sub: 'Venom 1 - Plan · Test Nevada · edited today, 14:20' };
  const onMap = (unsaved: boolean, place: string | null) => phoneHeader('Venom 1 - Plan', true, unsaved, 'Phoenix Weaponeer', null, 'Not exported', place);
  const shown = {
    unsaved: onMap(true, 'Test Nevada'),
    saved: onMap(false, 'Test Nevada'),
    noPlace: onMap(true, ''),
    nothing: onMap(false, ''),
    notGiven: onMap(true, null),
    onFront: phoneHeader('Venom 1 - Plan', false, true, 'Phoenix Weaponeer', null, 'Not exported', 'Test Nevada'),
    noMission: phoneHeader(null, true, true, 'Phoenix Weaponeer', null, 'Not exported', 'Test Nevada'),
    overview: phoneHeader('Venom 1 - Plan', false, true, 'Phoenix Weaponeer', where, 'Not exported', 'Test Nevada'),
  };
  ok('H3 on the map the phone\'s header has a second line: the place, then the unsaved words beside the dot; the front page and the overview never take the place',
    shown.unsaved.title === 'Venom 1 - Plan' && shown.unsaved.subtitle === 'Test Nevada · Not exported' && shown.unsaved.dirty
      && shown.saved.subtitle === 'Test Nevada' && !shown.saved.dirty && shown.noPlace.subtitle === 'Not exported' && shown.nothing.subtitle === undefined
      && shown.notGiven.subtitle === undefined && shown.onFront.title === 'Phoenix Weaponeer' && shown.onFront.subtitle === undefined
      && shown.noMission.subtitle === undefined && shown.overview.subtitle === `Not exported · ${where.sub}`,
    JSON.stringify(shown));
}

// A hidden threat 200 miles off cannot move the frame, a tile, or a dot.
const withFar = summaryMission({ ...routeMission, threats: [...routeMission.threats, threatAt('far', 'sa10', farNorth.lat, farNorth.lon, { hiddenOnMap: true })] });
// Red when (recentCardFrom): the thumbnail's threats come from `mission.threats`, not the visible ones (`threats: mission.threats.slice(...)`).
// Seen: FAIL T1 a hidden threat 200 miles away changes nothing in the picture  5.670881880015103 vs 7.046566280711348
const planWithout = planThumbnail(routeCard.thumbnail, SIZE);
const planWith = planThumbnail(okCard(recentCardFrom(withFar, fileKey, centerOf))!.thumbnail, SIZE);
ok('T1 a hidden threat 200 miles away changes nothing in the picture',
  isDeepStrictEqual(planWith, planWithout) && planWith.tiles.length > 0 && planWith.scaleZoom === planWithout.scaleZoom,
  `${planWith.scaleZoom} vs ${planWithout.scaleZoom}`);

// ─── What this layer may touch ───────────────────────────────────────────────
const landingSources = (): Array<{ file: string; text: string }> =>
  ['src/lib/landing', 'src/components/landing']
    .filter((dir) => existsSync(dir))
    .flatMap((dir) => readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ file: `${dir}/${f}`, text: readFileSync(`${dir}/${f}`, 'utf8') })));
const sources = landingSources();
const offenders = (words: string[], among = sources) =>
  among.filter(({ text }) => words.some((word) => text.includes(word))).map(({ file }) => file);
// Red when: any file under src/lib/landing/ mentions one of these (a line `// localStorage` added to loadRouter.ts does it).
// Seen: FAIL X1 nothing under the front page stores, exports or draws to an image  src/lib/landing/loadRouter.ts
const forbidden = ['localStorage', 'sessionStorage', 'indexedDB', 'caches.', 'toDataURL', 'toBlob', 'saveLocalMission', 'writeSettings'];
ok('X1 nothing under the front page stores, exports or draws to an image',
  sources.length >= 6 && offenders(forbidden).length === 0, offenders(forbidden).join());
// Red when: recentCards.ts or thumbnailPlan.ts mentions the reveal setting (a line `// useUiStore` added to recentCards.ts does it).
// Seen: FAIL X1 the recent cards and their pictures never look at the reveal setting  src/lib/landing/recentCards.ts
const noReveal = sources.filter(({ file }) => /(recentCards|thumbnailPlan)\.ts$/.test(file));
ok('X1 the recent cards and their pictures never look at the reveal setting',
  noReveal.length === 2 && offenders(['revealHidden', 'useUiStore'], noReveal).length === 0, offenders(['revealHidden', 'useUiStore'], noReveal).join());
// Red when: any other file under src/lib/landing/ imports '@platform' (`import { platform } from '@platform';` added to missionSummary.ts).
// Seen: FAIL X1 only platformBindings reaches the platform  src/lib/landing/missionSummary.ts,src/lib/landing/platformBindings.ts
// Red when: a front page component imports it too (`import { platform } from '@platform';` added to src/components/landing/LoadBox.tsx).
// Seen: FAIL X1 only platformBindings reaches the platform  src/lib/landing/platformBindings.ts,src/components/landing/LoadBox.tsx
const importsPlatform = sources.filter(({ text }) => /['"]@platform['"]/.test(text)).map(({ file }) => file);
ok('X1 only platformBindings reaches the platform', importsPlatform.length === 1 && importsPlatform[0].endsWith('/platformBindings.ts'), importsPlatform.join());
// The two modules that are plain maths and text stay free of the app: the picture's planner takes only the basemap
// arithmetic and a type, and the text sniffer takes nothing, so neither can drag the stores or the platform in with it.
const importsOf = (file: string): string[] => {
  const text = sources.find((s) => s.file.endsWith(`/${file}`))?.text ?? '';
  return [...text.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]).sort();
};
// Red when: thumbnailPlan.ts imports from anything else (an `import { MISSION_FILE_GONE } from '../missionFile';` line added to it does it),
// or loadSniff.ts imports anything at all.
// Seen: FAIL X1 the picture's planner and the text sniffer import nothing of the app  thumbnailPlan.ts: ../../types/waypoint.types,../kneeboardBasemap,../missionFile; loadSniff.ts:
ok('X1 the picture\'s planner and the text sniffer import nothing of the app',
  importsOf('thumbnailPlan.ts').join() === '../../types/waypoint.types,../kneeboardBasemap' && importsOf('loadSniff.ts').length === 0,
  `thumbnailPlan.ts: ${importsOf('thumbnailPlan.ts')}; loadSniff.ts: ${importsOf('loadSniff.ts')}`);

async function run() {
  const l3 = await routeLoad({ kind: 'text', text: m1Text }, spyDeps().deps);
  // Red when: the same change as the L3 check above (the saved-mission branch of shapeOfJson returns 'unrecognised').
  // Seen: FAIL L3 a pasted saved mission comes back as that mission, with no path  {"kind":"error","message":"This JSON isn't a FragOrders export, a FragOrders link payload, or a saved Phoenix Weaponeer ...
  ok('L3 a pasted saved mission comes back as that mission, with no path',
    l3.kind === 'saved-mission' && l3.mission.id === 'test-m1' && l3.path === null, JSON.stringify(l3).slice(0, 120));

  // Red when (loadRouter): `const check = { ok: true as const, mission: JSON.parse(kind.text) as Mission };`, so validateMission is skipped.
  // Seen: FAIL L4 a steerpoint carrying HTML is refused, and the error names the steerpoint  {"kind":"saved-mission","mission":{"id":"test-m1", ...
  const hostile = structuredClone(m1);
  (hostile.waypoints[0] as Record<string, unknown>).steerpoint = '<img src=x onerror=1>';
  const l4 = await routeLoad({ kind: 'text', text: JSON.stringify(hostile) }, spyDeps().deps);
  ok('L4 a steerpoint carrying HTML is refused, and the error names the steerpoint',
    l4.kind === 'error' && l4.message.startsWith('Not a usable mission file — ') && l4.message.includes('steerpoint'), JSON.stringify(l4));

  // Red when (validateMission): the key list goes back to ['id', 'name', 'theater'].
  // Seen: FAIL L5 a mission without notes is refused, as the Rust side would  {"ok":true,"mission":{"id":"test-m1", ...
  // Seen: FAIL L5 a mission without updatedAt is refused, as the Rust side would  {"ok":true,"mission":{"id":"test-m1", ...
  for (const key of ['notes', 'updatedAt']) {
    const missing = structuredClone(m1) as Record<string, unknown>;
    delete missing[key];
    const check = validateMission(missing);
    const routed = await routeLoad({ kind: 'text', text: JSON.stringify(missing) }, spyDeps().deps);
    ok(`L5 a mission without ${key} is refused, as the Rust side would`,
      !check.ok && check.problems.some((p) => p.includes(key)) && routed.kind === 'error', JSON.stringify(check));
  }

  // ─── What is never read, and never called ──────────────────────────────────
  // Red when (loadRouter): the size test is replaced with `false`.
  // Seen: FAIL L9 a file over the limit is refused without being read  {"kind":"error","message":"This JSON isn't a FragOrders export, ...
  const big = fileSource('m.json', utf8('{}'), null, LOAD_MAX_BYTES + 1);
  const bigOutcome = await routeLoad(big.source, spyDeps().deps);
  ok('L9 a file over the limit is refused without being read',
    bigOutcome.kind === 'error' && bigOutcome.reason === 'too-large' && big.reads.count === 0, JSON.stringify(bigOutcome));
  // Red when: the .miz name test is replaced with `false`.
  // Seen: FAIL L9 a .miz is refused without being read  {"kind":"error","message":"A .miz mission can't be opened directly. ...
  const mizFile = fileSource('m.miz', zipHead);
  const mizOutcome = await routeLoad(mizFile.source, spyDeps().deps);
  ok('L9 a .miz is refused without being read',
    mizOutcome.kind === 'error' && mizOutcome.reason === 'miz' && mizFile.reads.count === 0, JSON.stringify(mizOutcome));
  // Red when: `sources.length !== 1` becomes `< 1`, so the first of several is taken.
  // Seen: FAIL L9 no sources, or two, is "one file at a time", and nothing is called or read  [{"kind":"error","message":"Drop or pick one file at a time.","reason":"several-files"},{"kind":"saved-mission", ...
  const spy = spyDeps();
  const one = fileSource('a.json', utf8(m1Text));
  const two = fileSource('b.json', utf8(m1Text));
  const none = await routeLoad([], spy.deps);
  const several = await routeLoad([one.source, two.source], spy.deps);
  ok('L9 no sources, or two, is "one file at a time", and nothing is called or read',
    none.kind === 'error' && none.reason === 'several-files' && several.kind === 'error' && several.reason === 'several-files'
      && spy.calls.length === 0 && one.reads.count === 0 && two.reads.count === 0, JSON.stringify([none, several]));
  // Red when: `Array.isArray(input) ? input : [input]` becomes `Array.isArray(input) ? [] : [input]`.
  // Seen: FAIL L9 a list of exactly one source is that source
  const single = await routeLoad([fileSource('a.json', utf8(m1Text)).source], spyDeps().deps);
  ok('L9 a list of exactly one source is that source', single.kind === 'saved-mission');

  // ─── Which backend each kind of input reaches ──────────────────────────────
  // Red when: the link case calls `deps.parseFragOrders(kind.url)`.
  // Seen: FAIL L10 a link calls only fetchLink, with the link  ["parseFragOrders https://fragorders.com/public_frag_order/FAKEFAKEFAKE0000"]
  const linkSpy = spyDeps();
  const linkOutcome = await routeLoad({ kind: 'text', text: ` ${LINK}\n` }, linkSpy.deps);
  ok('L10 a link calls only fetchLink, with the link',
    linkOutcome.kind === 'fragorders' && linkOutcome.via === 'link' && linkOutcome.data === fakeData
      && linkSpy.calls.length === 1 && linkSpy.calls[0] === `fetchLink ${LINK}`, JSON.stringify(linkSpy.calls));
  // Red when (classifyLoadText): the matches are not cleaned (`.map(withoutTrailingMarks)` is removed from the `found` line).
  // Seen: FAIL L10 a link at the end of a sentence reaches the fetch without its full stop  fetchLink https://fragorders.com/public_frag_order/FAKEFAKEFAKE0000.
  const sentenceSpy = spyDeps();
  const sentenceOutcome = await routeLoad({ kind: 'text', text: `Tonight's frag is ${LINK}.` }, sentenceSpy.deps);
  ok('L10 a link at the end of a sentence reaches the fetch without its full stop',
    sentenceOutcome.kind === 'fragorders' && sentenceSpy.calls.join() === `fetchLink ${LINK}`, sentenceSpy.calls.join());
  // Red when: the JSON case calls `deps.parseFragOrders(kind.text.trim())`.
  // Seen: FAIL L10 link-payload JSON calls only parseFragOrders, with the original text
  // Seen: FAIL L10 cli-export JSON calls only parseFragOrders, with the original text
  for (const [file, via] of [['nevada_SYNTHETIC_link_payload.json', 'link-payload'], ['test_fragorders.json', 'cli-export']] as const) {
    const text = fixture(file);
    const jsonSpy = spyDeps();
    const outcome = await routeLoad({ kind: 'text', text }, jsonSpy.deps);
    ok(`L10 ${via} JSON calls only parseFragOrders, with the original text`,
      outcome.kind === 'fragorders' && outcome.via === via && jsonSpy.calls.length === 1 && jsonSpy.calls[0] === `parseFragOrders ${text}`);
  }
  // The parser is given the pasted text without a leading byte-order mark and otherwise as it came.
  // Red when (classifyLoadText): `const original = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;` becomes `const original = text;`.
  // Seen: FAIL L10 a pasted byte-order mark does not reach the parser
  const bomSpy = spyDeps();
  await routeLoad({ kind: 'text', text: '\u{feff}' + payloadText }, bomSpy.deps);
  ok('L10 a pasted byte-order mark does not reach the parser', bomSpy.calls.length === 1 && bomSpy.calls[0] === `parseFragOrders ${payloadText}`);
  // Red when: the saved-mission case first calls `deps.parseFragOrders(kind.text)`.
  // Seen: FAIL L10 a saved mission calls neither backend  ["parseFragOrders {\"id\":\"test-m1\", ...
  const savedSpy = spyDeps();
  await routeLoad({ kind: 'text', text: m1Text }, savedSpy.deps);
  ok('L10 a saved mission calls neither backend', savedSpy.calls.length === 0, JSON.stringify(savedSpy.calls));
  // Red when: the catch returns `'Error: ' + String(e)`.
  // Seen: FAIL L10 a backend rejection comes back as its own words  [{"kind":"error","message":"Error: boom"},{"kind":"error","message":"Error: boom"}]
  const boomLink = await routeLoad({ kind: 'text', text: LINK }, spyDeps('boom').deps);
  const boomJson = await routeLoad({ kind: 'text', text: payloadText }, spyDeps('boom').deps);
  ok('L10 a backend rejection comes back as its own words',
    JSON.stringify(boomLink) === '{"kind":"error","message":"boom"}' && JSON.stringify(boomJson) === '{"kind":"error","message":"boom"}',
    JSON.stringify([boomLink, boomJson]));

  // ─── A file's path ─────────────────────────────────────────────────────────
  // Red when: the saved-mission outcome is built with `path: null`.
  // Seen: FAIL L12 a file source path reaches the saved-mission outcome  {"kind":"saved-mission","mission":{"id":"test-m1", ...
  const pathed = await routeLoad(fileSource('b.json', utf8(m1Text), 'a/b.json').source, spyDeps().deps);
  ok('L12 a file source path reaches the saved-mission outcome',
    pathed.kind === 'saved-mission' && pathed.path === 'a/b.json' && pathed.mission.id === 'test-m1', JSON.stringify(pathed).slice(0, 100));
  // Red when: the path becomes `source.path ?? source.name`.
  // Seen: FAIL L12 a dropped file has no path
  const noPath = await routeLoad(fileSource('b.json', utf8(m1Text), null).source, spyDeps().deps);
  ok('L12 a dropped file has no path', noPath.kind === 'saved-mission' && noPath.path === null);

  // ─── A load that outlives the front page ───────────────────────────────────
  // The answer of a load goes to the box only while the box is on the screen. Leaving the front page while a link
  // is being fetched (Open now, a recent mission, Create new mission) closes the gate; the answer, when it comes,
  // must not open "Choose your flight" over the map or replace the open mission. A box that comes back (React's
  // development double-mount, a second visit) loads again.
  // Two loads on one gate: the second one's answer is the one delivered, and the older one's is dropped, whichever
  // answers first. The two links answer with different theaters, so the log says which load was delivered.
  // Red when (latestGate): `close: () => { closed = true; }` does nothing (`close: () => {}`).
  // Seen: FAIL L14 an answer that arrives after the box has gone is dropped, only the newest of two loads is answered, and a box that comes back loads again  {"open":["fragorders nevada"],"closedBefore":["fragorders nevada"],"startedAfter":["fragorders nevada"],"olderAnswersFirst":["fragorders caucasus"],"newerAnswersFirst":["fragorders caucasus"],"afterOpen":["fragorders nevada"]}
  //         (the answer of the load that was running when the gate closed was still delivered, and so was one that started after it)
  // Red when (latestGate): `open: () => { closed = false; }` does nothing (`open: () => {}`), so a box that comes back stays shut.
  // Seen: FAIL L14 an answer that arrives after the box has gone is dropped, only the newest of two loads is answered, and a box that comes back loads again  {"open":["fragorders nevada"],"closedBefore":[],"startedAfter":[],"olderAnswersFirst":["fragorders caucasus"],"newerAnswersFirst":["fragorders caucasus"],"afterOpen":[]}
  // Red when (latestGate): the older load of two is the one delivered (`isLatest: (token) => !closed && token === Math.min(latest, 1)`).
  // Seen: FAIL L14 an answer that arrives after the box has gone is dropped, only the newest of two loads is answered, and a box that comes back loads again  {"open":["fragorders nevada"],"closedBefore":[],"startedAfter":[],"olderAnswersFirst":["fragorders nevada"],"newerAnswersFirst":["fragorders nevada"],"afterOpen":["fragorders nevada"]}
  //         (a gate that delivers the first load and drops the second: both of the two-load cases name the wrong theater)
  // Every link answers with a theater of its own, so a log of what was delivered says WHICH load's answer it was.
  const slowLink = (theater: string) => {
    const data = { theater } as unknown as FragOrdersData;
    let answer: (data: FragOrdersData) => void = () => { throw new Error('the link was never asked for'); };
    const deps: LoadDeps = {
      fetchLink: () => new Promise<FragOrdersData>((resolve) => { answer = resolve; }),
      parseFragOrders: async () => data,
    };
    return { deps, answer: () => answer(data) };
  };
  const answersInto = (log: string[]) => (outcome: LoadOutcome) => {
    log.push(outcome.kind === 'fragorders' ? `fragorders ${outcome.data.theater}` : outcome.kind);
  };
  const textLoad = (gate: ReturnType<typeof latestGate>, link: ReturnType<typeof slowLink>, log: string[]) =>
    runLoad(gate, { kind: 'text', text: LINK }, link.deps, answersInto(log));
  const gateLog = {
    open: [] as string[], closedBefore: [] as string[], startedAfter: [] as string[],
    olderAnswersFirst: [] as string[], newerAnswersFirst: [] as string[], afterOpen: [] as string[],
  };
  const openGate = latestGate();
  const openLoad = slowLink('nevada');
  const openRun = textLoad(openGate, openLoad, gateLog.open);
  openLoad.answer();
  await openRun;
  const goneGate = latestGate();
  const goneLoad = slowLink('nevada');
  const goneRun = textLoad(goneGate, goneLoad, gateLog.closedBefore);
  goneGate.close();
  goneLoad.answer();
  await goneRun;
  const lateLoad = slowLink('nevada');
  const lateRun = textLoad(goneGate, lateLoad, gateLog.startedAfter);
  lateLoad.answer();
  await lateRun;
  // Two loads on one gate, the second started while the first was still out: only the second's answer is delivered,
  // whichever of the two answers comes first.
  for (const olderFirst of [true, false]) {
    const gate = latestGate();
    const older = slowLink('nevada');
    const newer = slowLink('caucasus');
    const log = olderFirst ? gateLog.olderAnswersFirst : gateLog.newerAnswersFirst;
    const runs = [textLoad(gate, older, log), textLoad(gate, newer, log)];
    if (olderFirst) { older.answer(); newer.answer(); } else { newer.answer(); older.answer(); }
    await Promise.all(runs);
  }
  const returnedGate = latestGate();
  returnedGate.close();
  returnedGate.open();
  const againLoad = slowLink('nevada');
  const againRun = textLoad(returnedGate, againLoad, gateLog.afterOpen);
  againLoad.answer();
  await againRun;
  const wantLog: typeof gateLog = {
    open: ['fragorders nevada'], closedBefore: [], startedAfter: [],
    olderAnswersFirst: ['fragorders caucasus'], newerAnswersFirst: ['fragorders caucasus'], afterOpen: ['fragorders nevada'],
  };
  ok('L14 an answer that arrives after the box has gone is dropped, only the newest of two loads is answered, and a box that comes back loads again',
    JSON.stringify(gateLog) === JSON.stringify(wantLog), JSON.stringify(gateLog));

  // ─── Reading a recent mission without opening it ───────────────────────────
  const peeks = peekSpy();
  const goodRaw = JSON.parse(JSON.stringify(hiddenMission));
  peeks.files.set('C:\\dcs\\plans\\strike.json', goodRaw);
  peeks.rejects.set('locked.json', 'EACCES locked.json');
  peeks.files.set('hostile.json', { ...structuredClone(m1), waypoints: [{ ...m1.waypoints[0], steerpoint: '<img src=x onerror=1>' }] });
  peeks.local.set('e1', goodRaw);
  const peek = (key: RecentKey) => peekRecent(key, peeks.deps, centerOf);
  const good = await peek({ source: 'file', path: 'C:\\dcs\\plans\\strike.json' });
  // Red when (peekRecent): the file branch calls `deps.loadLocalMission(key.path)` instead of `deps.readMission(key.path)`.
  // Seen: FAIL R2 a readable file makes a card, from the file and nothing else  loadLocalMission C:\dcs\plans\strike.json
  ok('R2 a readable file makes a card, from the file and nothing else',
    good.status === 'ok' && good.name === 'Test Mission' && peeks.calls.join() === 'readMission C:\\dcs\\plans\\strike.json', peeks.calls.join());
  // Red when: `message === MISSION_FILE_GONE` compares with `'never'`, so the rejection reads as unreadable.
  // Seen: FAIL R2 a file that has been moved or deleted is missing, named by its file name  {"status":"unreadable","key":{"source":"file","path":"x/y/gone.json"},"label":"gone.json","message":"That mission file has been moved or deleted."}
  const gone = await peek({ source: 'file', path: 'x/y/gone.json' });
  ok('R2 a file that has been moved or deleted is missing, named by its file name',
    gone.status === 'missing' && gone.label === 'gone.json', JSON.stringify(gone));
  // Red when: the catch returns `message: 'unreadable'` instead of `message`.
  // Seen: FAIL R2 a file that cannot be read is unreadable, in the system's words  {"status":"unreadable","key":{"source":"file","path":"locked.json"},"label":"locked.json","message":"unreadable"}
  const locked = await peek({ source: 'file', path: 'locked.json' });
  ok('R2 a file that cannot be read is unreadable, in the system\'s words',
    locked.status === 'unreadable' && locked.message === 'EACCES locked.json' && locked.label === 'locked.json', JSON.stringify(locked));
  // Red when: `if (raw === null || raw === undefined) return ...` becomes `if (false as boolean) return ...`, so `recentCardFrom(null, ...)` reports an unusable file.
  // Seen: FAIL R2 an entry the browser no longer holds is missing, named by its name  {"status":"unreadable","key":{"source":"browser","id":"nope","name":"Old plan","savedAt":"2026-01-01T00:00:00Z"},"label":"Old plan","message":"Not a usable mission ...
  const dropped = await peek({ source: 'browser', id: 'nope', name: 'Old plan', savedAt: '2026-01-01T00:00:00Z' });
  ok('R2 an entry the browser no longer holds is missing, named by its name',
    dropped.status === 'missing' && dropped.label === 'Old plan', JSON.stringify(dropped));
  const stored = await peek({ source: 'browser', id: 'e1', name: 'First', savedAt: '2026-05-02T10:00:00Z' });
  // Red when: `lastEdited` ignores the browser's `savedAt` (the change made for the R5 check above).
  // Seen: FAIL R2 an entry the browser holds makes a card, read by its id
  ok('R2 an entry the browser holds makes a card, read by its id', stored.status === 'ok' && stored.lastEdited === '2026-05-02T10:00:00Z' && peeks.calls.includes('loadLocalMission e1'));
  // Red when (recentCardFrom): the check is skipped (`const check = { ok: true as const, mission: raw as Mission };`) and the record goes straight to the card.
  // Seen: FAIL R2 a record that is not a mission is unreadable, and never reaches a card  {"status":"ok","key":{"source":"file","path":"hostile.json"},"name":"Test Mission","theaterId":"nevada","lastEdited":"2026-01-01T00:00:00Z","flights":[{"group":
  const notAMission = await peek({ source: 'file', path: 'hostile.json' });
  ok('R2 a record that is not a mission is unreadable, and never reaches a card',
    notAMission.status === 'unreadable' && notAMission.message.startsWith('Not a usable mission file — ') && notAMission.message.includes('steerpoint')
      && !notAMission.message.includes('<img'), JSON.stringify(notAMission));
  // Red when: the missing branch of peekRecent also calls `deps.forgetRecentMission(...)`.
  // Seen: FAIL R2 reading a missing file does not take it off the recent list  readMission C:\dcs\plans\strike.json,readMission x/y/gone.json,forgetRecentMission gone.json,readMission locked.json,loadLocalMission nope,loadLocalMission e1,readMission ...
  ok('R2 reading a missing file does not take it off the recent list',
    gone.status === 'missing' && !peeks.calls.some((call) => call.startsWith('forgetRecentMission')), peeks.calls.join());

  // ─── The run of reads ──────────────────────────────────────────────────────
  const manyKeys = Array.from({ length: 20 }, (_, i): RecentKey => ({ source: 'file', path: `plan${i}.json` }));
  const runPeeks = peekSpy();
  for (const key of manyKeys) runPeeks.files.set((key as { path: string }).path, goodRaw);
  const delivered: RecentCard[] = [];
  // Red when (peekRecents): `keys.slice(0, MAX_RECENT_PEEKS)` becomes `keys`.
  // Seen: FAIL R4 twenty keys give twelve cards, in order, a frame apart  20 cards, 19 frames
  await peekRecents(manyKeys, runPeeks.deps, centerOf, (card) => delivered.push(card), () => false);
  ok('R4 twenty keys give twelve cards, in order, a frame apart',
    delivered.length === MAX_RECENT_PEEKS && delivered.map((c) => recentKeyId(c.key)).join() === manyKeys.slice(0, 12).map(recentKeyId).join()
      && runPeeks.calls.filter((c) => c === 'nextFrame').length === 11, `${delivered.length} cards, ${runPeeks.calls.filter((c) => c === 'nextFrame').length} frames`);
  // The frame comes between two reads, so each read starts on a frame of its own.
  // Red when: `if (i > 0) await deps.nextFrame();` never waits (`if (i < 0)`).
  // Seen: FAIL R4 a frame comes between one read and the next  readMission plan0.json|readMission plan1.json|readMission plan2.json|readMission plan3.json|readMission plan4.json
  const order = runPeeks.calls.slice(0, 5).join('|');
  ok('R4 a frame comes between one read and the next', order === 'readMission plan0.json|nextFrame|readMission plan1.json|nextFrame|readMission plan2.json', order);
  const cancelledRun = peekSpy();
  for (const key of manyKeys) cancelledRun.files.set((key as { path: string }).path, goodRaw);
  const got: RecentCard[] = [];
  // Red when (peekRecents): the cancel test is lost (a line `isCancelled = () => false;` at the top).
  // Seen: FAIL R4 a run that is cancelled after three cards hands over three and reads no more  20 cards, 39 calls
  await peekRecents(manyKeys, cancelledRun.deps, centerOf, (card) => got.push(card), () => got.length >= 3);
  ok('R4 a run that is cancelled after three cards hands over three and reads no more',
    got.length === 3 && cancelledRun.calls.filter((c) => c.startsWith('readMission')).length === 3, `${got.length} cards, ${cancelledRun.calls.length} calls`);
  // Red when: the `if (isCancelled()) return;` between the read and `onCard(card)` is removed, so a card that was being read is still handed over.
  // Seen: FAIL R4 a card that finishes after the page is left is not handed over
  let left = false;
  const late: RecentCard[] = [];
  const slow = peekSpy();
  slow.files.set('slow.json', goodRaw);
  slow.deps.readMission = async (path) => { left = true; return slow.files.get(path); };
  await peekRecents([{ source: 'file', path: 'slow.json' }], slow.deps, centerOf, (card) => late.push(card), () => left);
  ok('R4 a card that finishes after the page is left is not handed over', late.length === 0);
}

/** Stand-ins for reading recent missions: files by path, browser entries by id, every call recorded. */
function peekSpy() {
  const calls: string[] = [];
  const files = new Map<string, unknown>();
  const local = new Map<string, unknown>();
  const rejects = new Map<string, unknown>();
  const deps: PeekDeps & { forgetRecentMission: (path: string) => void } = {
    readMission: async (path) => {
      calls.push(`readMission ${path}`);
      if (rejects.has(path)) throw rejects.get(path);
      if (!files.has(path)) throw MISSION_FILE_GONE;
      return files.get(path);
    },
    loadLocalMission: async (id) => {
      calls.push(`loadLocalMission ${id}`);
      return local.get(id) ?? null;
    },
    nextFrame: async () => { calls.push('nextFrame'); },
    // Not part of the deps the cards are given: here only to catch a read that tries it.
    forgetRecentMission: (path) => { calls.push(`forgetRecentMission ${path}`); },
  };
  return { calls, files, local, rejects, deps };
}

// The async checks run once the synchronous ones have; a crash counts as a failure.
run().catch((error) => ok('landing-check ran to the end', false, String(error)));
