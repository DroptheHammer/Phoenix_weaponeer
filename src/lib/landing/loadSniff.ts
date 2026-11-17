/**
 * Telling what a person has handed the load box — a link, FragOrders JSON, a
 * saved mission, or something that can't be used — before anything is fetched
 * or parsed for real.
 *
 * This only decides which road the input takes. It never judges whether a link
 * or a mission is valid: the Rust `link_id` runs before any network request on
 * both platforms, and `validateMission` gates every saved mission. Keeping the
 * guess this small means the two can't drift apart.
 *
 * Pure text in, plain answers out, so it runs under the node checks.
 */

/**
 * The biggest file or paste the box will look at. The same number the link
 * fetch allows an answer to be (`MAX_BODY_BYTES` in fragorders_link.rs; a check
 * keeps the two equal), so a file the box accepts is one a link could have been.
 */
export const LOAD_MAX_BYTES = 25 * 1024 * 1024;

/** What to say to someone who hands over a `.miz`, which only the FragOrders tool can read. */
export const MIZ_ADVICE =
  "A .miz mission can't be opened directly. Run the FragOrders tool on it " +
  '(fragorders parse mission.miz > mission.json), then load the .json file it makes.';

export type RefusalReason =
  | 'empty'
  | 'too-large'
  | 'miz'
  | 'binary'
  | 'not-utf8'
  | 'not-json'
  | 'json-not-object'
  | 'unrecognised-json'
  | 'not-a-link'
  | 'several-links'
  | 'several-files'
  | 'not-a-mission-file';

export type LoadKind =
  | { kind: 'link'; url: string }
  /** `text` is the input as it came, never re-written, so the Rust parser sees what the user had. */
  | { kind: 'fragorders-json'; shape: 'link-payload' | 'cli-export'; text: string }
  | { kind: 'saved-mission'; text: string }
  | { kind: 'refused'; reason: RefusalReason; message: string };

type Refusal = { ok: false; reason: RefusalReason; message: string };

/** The words for each refusal, in one place so the box and the checks agree. */
export const REFUSAL_MESSAGES: Record<RefusalReason, string> = {
  empty: 'Nothing to load. Paste a FragOrders link, or drop a .json file.',
  'too-large': "That's too large to be a mission (the limit is 25 MB).",
  miz: MIZ_ADVICE,
  binary: "That file isn't text, so it can't be a mission.",
  'not-utf8': 'Save the file as UTF-8 and try again.',
  'not-json': "This isn't valid JSON.",
  'json-not-object': "This JSON isn't an object, so it can't be a mission or a FragOrders export.",
  'unrecognised-json':
    "This JSON isn't a FragOrders export, a FragOrders link payload, or a saved Phoenix Weaponeer mission.",
  'not-a-link': 'Paste a FragOrders link (fragorders.com/public_frag_order/…), or drop a .json file.',
  'several-links': 'That holds more than one FragOrders link. Paste one at a time.',
  'several-files': 'Drop or pick one file at a time.',
  // The desktop app reads a picked or dropped file only if it is named .json (a folder never), so
  // anything else is turned away by its name before a byte of it is read.
  'not-a-mission-file': "That isn't a .json file, so it can't be a mission or a FragOrders export.",
};

const refuse = (reason: RefusalReason): Refusal => ({ ok: false, reason, message: REFUSAL_MESSAGES[reason] });
const refused = (reason: RefusalReason): LoadKind => ({ kind: 'refused', reason, message: REFUSAL_MESSAGES[reason] });

/** How far into a file to look for a zero byte; a text file never has one. */
const BINARY_HEAD_BYTES = 1024;

/** A zip's first four bytes, which is what a `.miz` is whatever it is called. */
const isZip = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/**
 * Turn a file's bytes into text, or say why it can't be. Windows tools write
 * UTF-16 (PowerShell 5's `>` does), which would otherwise look like binary, so
 * a byte-order mark picks the decoder; everything else must be valid UTF-8.
 */
export function decodeLoadBytes(bytes: Uint8Array, name: string): { ok: true; text: string } | Refusal {
  if (bytes.length > LOAD_MAX_BYTES) return refuse('too-large');
  if (/\.miz$/i.test(name) || isZip(bytes)) return refuse('miz');

  const utf16 = bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
  // Looked for in the raw bytes, before decoding: nearly every picture or
  // archive is also invalid UTF-8, and would be told to "save as UTF-8", which
  // is no help to someone who dropped a card image by mistake. UTF-16 text is
  // full of zero bytes by nature, so it is the one thing exempt.
  if (!utf16 && bytes.subarray(0, BINARY_HEAD_BYTES).includes(0)) return refuse('binary');

  const label = utf16 ? (bytes[0] === 0xff ? 'utf-16le' : 'utf-16be') : 'utf-8';
  try {
    // Fatal, so a stray byte is refused rather than turned into a replacement
    // character that would corrupt a name inside the file. The decoder also
    // drops the byte-order mark itself.
    return { ok: true, text: new TextDecoder(label, { fatal: true }).decode(bytes) };
  } catch {
    return refuse('not-utf8');
  }
}

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/** Which kind of JSON object this is, by its own top-level keys — the same tests the Rust importers use. */
function shapeOfJson(obj: Record<string, unknown>): 'cli-export' | 'link-payload' | 'saved-mission' | 'unrecognised' {
  // `coalition` first: the Rust importer sends anything holding it down the CLI
  // road, even if it also has `plannedGroups`. Own keys only, so an inherited or
  // `__proto__` key in a hostile file can't pass for a real one.
  if (hasOwn(obj, 'coalition')) return 'cli-export';
  if (hasOwn(obj, 'plannedGroups')) return 'link-payload';
  const isMissionList = (key: string) => hasOwn(obj, key) && Array.isArray(obj[key]);
  if (hasOwn(obj, 'id') && typeof obj.id === 'string' && ['waypoints', 'flightMembers', 'attacks'].every(isMissionList)) {
    return 'saved-mission';
  }
  return 'unrecognised';
}

/** A FragOrders public link wherever it sits in a longer message. */
const EMBEDDED_LINK = /https?:\/\/(?:www\.)?fragorders\.com\/public_frag_order\/[^\s<>"')\]]+/gi;

/**
 * What a sentence or a chat leaves on the end of a link: full stops, commas,
 * brackets, quotes, and zero-width characters (which `\s` does not count). A
 * real link id is letters and digits, so none of these can be part of one.
 */
const TRAILING_MARKS = '.,;:!)]}\'"\u{200b}\u{200c}\u{200d}\u{2060}';

/** Taken off one character at a time, so a long run of marks cannot make the search slow. */
function withoutTrailingMarks(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING_MARKS.includes(url[end - 1])) end -= 1;
  return url.slice(0, end);
}

/** Whether the text, written as UTF-8, is longer than the limit, which is counted in bytes. */
function overLimit(text: string): boolean {
  // A character takes at most three bytes, so only text that could be near the
  // limit is worth counting exactly.
  if (text.length > LOAD_MAX_BYTES) return true;
  if (text.length * 3 <= LOAD_MAX_BYTES) return false;
  return new TextEncoder().encode(text).length > LOAD_MAX_BYTES;
}

/**
 * Decide what pasted or file text is. Never throws and never reaches the
 * network; the caller does what the answer says.
 */
export function classifyLoadText(text: string, opts?: { fromFile?: boolean }): LoadKind {
  // A leading byte-order mark would stop the Rust parser too, so it goes from
  // the text handed on; the rest of the input is left exactly as it was.
  const original = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmed = original.trim();
  if (trimmed === '') return refused('empty');
  if (overLimit(trimmed)) return refused('too-large');

  // Text that opens with a brace or a bracket is JSON only if it parses. A chat
  // message can open with a tag ("[Test Op] tonight: <link>") and still be a link.
  const opensLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (opensLikeJson) {
    let parsed: unknown;
    let parses = true;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parses = false;
    }
    if (parses) {
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return refused('json-not-object');
      const shape = shapeOfJson(parsed as Record<string, unknown>);
      if (shape === 'cli-export' || shape === 'link-payload') return { kind: 'fragorders-json', shape, text: original };
      if (shape === 'saved-mission') return { kind: 'saved-mission', text: original };
      return refused('unrecognised-json');
    }
  }
  // A file is never a link: a dropped file that isn't JSON is simply not JSON.
  // (Not the engine's own message: V8 and WebKit word it differently.)
  if (opts?.fromFile) return refused('not-json');

  const unwrapped = trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed;
  if (!/\s/.test(unwrapped) && /^https?:\/\//i.test(unwrapped)) return { kind: 'link', url: withoutTrailingMarks(unwrapped) };
  const found = [...new Set((unwrapped.match(EMBEDDED_LINK) ?? []).map(withoutTrailingMarks))];
  if (found.length === 1) return { kind: 'link', url: found[0] };
  if (found.length > 1) return refused('several-links');
  // Nothing to fetch: say what the text most looks like. A cut-off export still
  // has its "key": pairs; a chat message that merely opens with a tag has none,
  // and telling its sender about JSON would only puzzle them.
  return refused(opensLikeJson && /"\s*:/.test(trimmed) ? 'not-json' : 'not-a-link');
}
