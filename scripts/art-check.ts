/**
 * Checks for the app's pictures (the icon set, the tab icon, the loading
 * splash). Run by geo-check as an import.
 *
 * The repo is public and a picture can carry a name, a place or a tool's
 * signature inside it where no text search looks. Every picture is
 * re-encoded before it is committed (docs/ARTWORK.md); this holds that none
 * carries a metadata chunk or a marker of where it was made.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SPLASH_SECONDS_DEFAULT, SPLASH_SECONDS_MAX, cleanSplashSeconds, splashWait_ms } from '../src/lib/splash';

const ok = (name: string, cond: boolean, detail = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) process.exitCode = 1;
};

const PICTURE = /\.(png|webp|icns|ico|jpe?g|gif)$/i;
function pictures(path: string): string[] {
  if (statSync(path).isFile()) return PICTURE.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => pictures(join(path, name)));
}

/** A PNG's chunk names, read from its own structure (a name that only happens to occur in pixel data is not a chunk). */
function pngChunks(bytes: Buffer): string[] {
  const names: string[] = [];
  for (let i = 8; i + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(i);
    names.push(bytes.toString('latin1', i + 4, i + 8));
    i += 12 + length;
  }
  return names;
}

/** A WebP's chunk names. */
function webpChunks(bytes: Buffer): string[] {
  const names: string[] = [];
  for (let i = 12; i + 8 <= bytes.length; ) {
    const length = bytes.readUInt32LE(i + 4);
    names.push(bytes.toString('latin1', i, i + 4));
    i += 8 + length + (length % 2);
  }
  return names;
}

// Chunks that can hold text, a date, a camera's or a tool's record, or a colour profile with a maker's name.
const PNG_METADATA = ['tEXt', 'iTXt', 'zTXt', 'eXIf', 'iCCP', 'tIME'];
const WEBP_METADATA = ['EXIF', 'XMP ', 'ICCP'];
// Markers of a maker or a machine, wherever they sit (the icon containers hold PNGs inside them).
const MARKERS = /c2pa|caBX|OpenAI|ChatGPT|Qwen|Gemini|Picasa|Photoshop|Exif\0|tEXt|iTXt|zTXt|eXIf|iCCP|tIME|\/Users\/|\/home\/|C:\\Users/;

{
  const files = ['app-icon.png', 'public', 'src-tauri/icons'].flatMap(pictures).sort();
  const found: string[] = [];
  for (const file of files) {
    const bytes = readFileSync(file);
    const isPng = bytes.toString('latin1', 1, 4) === 'PNG';
    const isWebp = bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
    if (isPng) {
      const bad = pngChunks(bytes).filter((c) => PNG_METADATA.includes(c));
      if (bad.length) found.push(`${file}: ${[...new Set(bad)].join(', ')}`);
    } else if (isWebp) {
      const bad = webpChunks(bytes).filter((c) => WEBP_METADATA.includes(c));
      if (bad.length) found.push(`${file}: ${[...new Set(bad)].join(', ')}`);
    } else {
      const hit = MARKERS.exec(bytes.toString('latin1'));
      if (hit) found.push(`${file}: ${JSON.stringify(hit[0])}`);
    }
    if (/\.jpe?g$/i.test(file)) found.push(`${file}: a JPEG is not re-encoded art (use PNG or WebP)`);
  }
  ok('art [ART1]: no committed picture (the icon set, the tab icon, the splash) carries a metadata chunk or a marker of a tool, a person or a machine',
     files.length >= 40 && found.length === 0, `${files.length} pictures read; ${found.slice(0, 4).join('; ') || 'none flagged'}`);
}

{
  // The splash is plain HTML painted with the first frame, on the window's own colour, and the app takes it away when loading ends.
  const html = readFileSync('index.html', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const splashBytes = statSync('public/splash.webp').size;
  const parts = {
    inline: /<div\s+id="splash"[^>]*background-color: #1a1a2e/.test(html) && html.indexOf('id="splash"') < html.indexOf('id="root"'),
    page: /<html lang="en" style="background-color: #1a1a2e">/.test(html),
    picture: /<img src="\/splash\.webp" alt=""/.test(html),
    hidden: /aria-hidden="true"/.test(html),
    goes: /if \(!loading\) hideSplash\(useSettingsStore\.getState\(\)\.settings\.splashSeconds\);/.test(app),
    small: splashBytes < 300 * 1024,
  };
  ok('art [ART2]: the loading splash is in the page itself over the window\'s own colour (so nothing flashes white), is hidden from screen readers, weighs under 300 KB, and goes when loading has ended and the time set in Settings is up',
     Object.values(parts).every(Boolean), `${JSON.stringify(parts)}; ${splashBytes} bytes`);
}

{
  // The splash time (Settings): 2 seconds unless set, any tenth from 0 to 10, never longer; and how long the splash
  // still has to stay, given how long the page has been open. The Rust side keeps the same rule (settings.rs).
  const cleaned = [undefined, null, '', 'abc', NaN, Infinity, -3, 0, '0', 0.04, 0.05, 1.25, '3.14', 2, 10, 10.04, 11, 600].map((v) => cleanSplashSeconds(v));
  const want = [2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0.1, 1.3, 3.1, 2, 10, 10, 10, 10];
  const waits = [splashWait_ms(0, 2), splashWait_ms(350, 2), splashWait_ms(2000, 2), splashWait_ms(5000, 2), splashWait_ms(40, 0), splashWait_ms(0, 99), splashWait_ms(100, 0.5)];
  const wantWaits = [2000, 1650, 0, 0, 0, 10000, 400];
  ok('art [ART3]: the splash time is 2 seconds unless set, is kept to tenths between 0 and 10 seconds, and the splash waits out only what is left of it (nothing at 0, nothing when loading took longer)',
     SPLASH_SECONDS_DEFAULT === 2 && SPLASH_SECONDS_MAX === 10 && cleaned.join() === want.join() && waits.join() === wantWaits.join(),
     `cleaned ${cleaned.join()}; waits ${waits.join()}`);
}
