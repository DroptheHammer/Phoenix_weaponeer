// What does the project's Tailwind config make of these classes? Prints one JSON object:
// { "<class>": "<its rule as CSS text>" | null }, null when the class generates nothing.
// Run by scripts/design-check.tsx in a child process (Tailwind's plugin is async, and the check script is not).
//
//   node scripts/tailwind-probe.mjs bg-dcs-navy/80 bg-red-500 hover:bg-blue-600
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import config from '../tailwind.config.js';

const classes = process.argv.slice(2).flatMap((a) => a.split(/\s+/)).filter(Boolean);
const result = await postcss([tailwindcss({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] })]).process(
  '@tailwind utilities;',
  { from: undefined },
);

const escape = (c) => c.replace(/[^\w-]/g, (ch) => '\\' + ch);
const found = Object.fromEntries(classes.map((c) => [c, null]));
result.root.walkRules((rule) => {
  for (const c of classes) {
    const sel = '.' + escape(c);
    if (rule.selector === sel || rule.selector.startsWith(sel + ':') || rule.selector.startsWith(sel + ' ')) {
      const body = rule.nodes.map((n) => `${n.prop}:${n.value}`).join(';');
      found[c] = found[c] ? `${found[c]} | ${body}` : body;
    }
  }
});
console.log(JSON.stringify(found));
