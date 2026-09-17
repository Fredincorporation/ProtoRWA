/**
 * Extracts the Tailwind theme config embedded in each Stitch screen and reports
 * whether the design tokens are consistent across the project.
 *
 * Stitch emits `<script id="tailwind-config">tailwind.config = {...}</script>`.
 * A single shared config means the token layer can be lifted verbatim into the
 * real Tailwind theme; divergence means tokens must be reconciled first.
 *
 * Usage: node design-source/extract-tokens.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const screensDir = join(here, 'screens');

const CONFIG_RE = /<script id="tailwind-config">([\s\S]*?)<\/script>/;

/** Evaluate the `tailwind.config = {...}` literal without executing page scripts. */
function parseConfig(source) {
  const match = source.match(CONFIG_RE);
  if (!match) return null;

  const js = match[1]
    .replace(/^\s*tailwind\.config\s*=\s*/, '')
    .trim()
    .replace(/;\s*$/, '');

  // Config is a plain object literal; evaluate it in isolation.
  return new Function(`"use strict"; return (${js});`)();
}

function signature(config) {
  const extend = config?.theme?.extend ?? {};
  const keys = (obj) => (obj ? Object.keys(obj).sort() : []);
  return JSON.stringify(
    {
      colors: keys(extend.colors),
      spacing: keys(extend.spacing),
      borderRadius: keys(extend.borderRadius),
      fontFamily: keys(extend.fontFamily),
      fontSize: keys(extend.fontSize),
    },
    null,
    0,
  );
}

const groups = new Map();
const perScreen = [];

for (const file of readdirSync(screensDir).filter((f) => f.endsWith('.html')).sort()) {
  const source = readFileSync(join(screensDir, file), 'utf8');
  const config = parseConfig(source);
  if (!config) {
    perScreen.push({ file, hasConfig: false });
    continue;
  }

  const sig = signature(config);
  if (!groups.has(sig)) groups.set(sig, { config, files: [] });
  groups.get(sig).files.push(file);

  perScreen.push({
    file,
    hasConfig: true,
    colorCount: Object.keys(config.theme?.extend?.colors ?? {}).length,
    fontFamily: config.theme?.extend?.fontFamily,
    fontSize: config.theme?.extend?.fontSize,
    spacing: config.theme?.extend?.spacing,
    borderRadius: config.theme?.extend?.borderRadius,
  });
}

console.log(`Scanned ${perScreen.length} screens`);
console.log(`Distinct token signatures: ${groups.size}\n`);

let i = 0;
for (const [sig, { config, files }] of groups) {
  i += 1;
  const extend = config.theme?.extend ?? {};
  const summary = JSON.parse(sig);
  console.log(`--- group ${i}: ${files.length} screens ---`);
  console.log(`  colors:   ${summary.colors.length}`);
  console.log(`  spacing:  ${summary.spacing.join(', ') || '(none)'}`);
  console.log(`  radius:   ${summary.borderRadius.join(', ') || '(none)'}`);
  console.log(`  families: ${summary.fontFamily.join(', ') || '(none)'}`);
  console.log(`  sizes:    ${summary.fontSize.length}`);
  console.log('');
}

// Emit the richest config as the canonical token source.
const richest = [...groups.values()].sort(
  (a, b) =>
    Object.keys(b.config.theme?.extend?.colors ?? {}).length -
    Object.keys(a.config.theme?.extend?.colors ?? {}).length,
)[0];

if (richest) {
  writeFileSync(
    join(here, 'design-tokens.json'),
    `${JSON.stringify(richest.config, null, 2)}\n`,
    'utf8',
  );
  console.log(`Wrote design-tokens.json (${richest.files.length} screens share it)`);
}

writeFileSync(join(here, 'token-audit.json'), `${JSON.stringify(perScreen, null, 2)}\n`, 'utf8');
console.log('Wrote token-audit.json');
