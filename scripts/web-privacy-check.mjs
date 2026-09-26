// The web build is published as it is, so check it before it goes anywhere:
// no personal paths (a user name is part of every home folder), nothing from
// the git-ignored private folders, no source maps (they would publish the
// source a second time, comments and all). Exits 1 with the findings.
// Run as part of `npm run build:web`, and in the Pages workflow.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'dist-web';

const FORBIDDEN = [
  [/\/Users\/[^/\s"']+/, 'a macOS home folder'],
  [/[A-Za-z]:\\+Users\\+[^\\\s"']+/, 'a Windows home folder'],
  [/\/home\/[^/\s"']+/, 'a Linux home folder'],
  [/\/root\//, 'the root home folder'],
  [/test-data\/private/, 'the private test data folder'],
  [/Other Items/, 'the private drop folder'],
  [/sourceMappingURL/, 'a source map reference'],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

const findings = [];
for (const path of files(root)) {
  if (path.endsWith('.map')) {
    findings.push(`${relative(root, path)}: a source map file`);
    continue;
  }
  // latin1 keeps every byte, so text inside the .wasm is found too.
  const text = readFileSync(path).toString('latin1');
  for (const [pattern, what] of FORBIDDEN) {
    const hit = text.match(pattern);
    if (hit) findings.push(`${relative(root, path)}: ${what} (${hit[0].slice(0, 60)})`);
  }
}

if (findings.length) {
  console.error(`Privacy check FAILED for ${root}:\n  ${findings.join('\n  ')}`);
  process.exit(1);
}
console.log(`Privacy check passed for ${root}.`);
