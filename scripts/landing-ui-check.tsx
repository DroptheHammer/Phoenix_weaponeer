/**
 * Checks for the front page, "Choose your flight" and the Flight overview's pieces: markup rendered to plain
 * HTML in node (react-dom/server), and scans of the source files. Run by geo-check after overview-check.
 *
 * Beside each check, "Red when" is the one-line change that turns it red, and "Seen" is the FAIL line it
 * printed.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};
const src = (f: string) => readFileSync(f, 'utf8');

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
