// Reads src/styles/tokens.css for the tools that cannot read a CSS variable at run time:
// vite.config.web.ts (the PWA's theme colour), scripts/design-check.tsx and geo-check.
// Paths are from the repo root, as in every script here (no import.meta.url: geo-check
// bundles this file as CommonJS, where it does not exist).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKENS = resolve('src/styles/tokens.css');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const declarations = (text) => {
  const out = {};
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return out;
};

/** Splits the file into what lies outside every @media block, and each @media block (query and body), braces balanced. */
function split(text) {
  const media = [];
  let top = '';
  let i = 0;
  for (;;) {
    const at = text.indexOf('@media', i);
    if (at < 0) {
      top += text.slice(i);
      break;
    }
    top += text.slice(i, at);
    const open = text.indexOf('{', at);
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    media.push({ query: text.slice(at + 6, open).trim().replace(/\s+/g, ' '), body: text.slice(open + 1, j - 1) });
    i = j;
  }
  return { top, media };
}

/** Every custom property the file declares outside any @media block: '--rgb-navy' -> '22 33 62' (comments dropped, spaces folded). */
export function readTokens(css = readFileSync(TOKENS, 'utf8')) {
  return declarations(split(stripComments(css)).top);
}

/** Every @media block, in file order: its query and the properties it overrides. */
export function readMedia(css = readFileSync(TOKENS, 'utf8')) {
  return split(stripComments(css)).media.map(({ query, body }) => ({ query, tokens: declarations(body) }));
}

/** The phone block: the @media block under exactly this query (useIsPhone's PHONE_QUERY). null when there is none. */
export function readPhone(query, css = readFileSync(TOKENS, 'utf8')) {
  return readMedia(css).find((m) => m.query === query) ?? null;
}

/** '--rgb-navy' -> '#16213e'. Follows one var() (--rgb-float is --rgb-navy). Throws if the token is not a channel list. */
export function hexOf(name, tokens = readTokens()) {
  let value = tokens[name];
  const ref = /^var\((--[\w-]+)\)$/.exec(value ?? '');
  if (ref) value = tokens[ref[1]];
  const m = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(value ?? '');
  if (!m) throw new Error(`token ${name} is not an rgb channel list: ${value}`);
  return '#' + m.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}
