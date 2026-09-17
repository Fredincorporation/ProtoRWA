/**
 * Pretty-prints the minified Stitch screen HTML into `screens/formatted/`.
 *
 * The raw exports are single-line files, which makes them unreadable and
 * unpasteable. Formatting them once means every subsequent port can be done by
 * reading a real file rather than string-slicing.
 *
 * Usage: node design-source/format-screens.mjs
 */

import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const sourceDir = join(here, 'screens');
const outDir = join(sourceDir, 'formatted');

if (!existsSync(sourceDir)) {
  console.error(`No screens at ${sourceDir}. Run design-source/fetch-design.ps1 first.`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const files = readdirSync(sourceDir)
  .filter((name) => name.endsWith('.html'))
  .sort();

if (files.length === 0) {
  console.error('No .html files found.');
  process.exit(1);
}

const prettierBin = join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs');

let formatted = 0;
let skipped = 0;

for (const file of files) {
  const sourcePath = join(sourceDir, file);
  const targetPath = join(outDir, file);

  try {
    // Prettier's HTML parser needs `--parser` explicitly because the Stitch
    // exports are single-line and inference would not pick HTML.
    const output = execFileSync(
      process.execPath,
      [prettierBin, '--parser', 'html', '--print-width', '100', sourcePath],
      { maxBuffer: 64 * 1024 * 1024 },
    );

    writeFileSync(targetPath, output, 'utf8');
    formatted += 1;
    console.log(`  formatted ${file}`);
  } catch (error) {
    skipped += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  skipped ${file}: ${message.split('\n')[0]}`);
  }
}

console.log(`\nFormatted ${formatted} file(s), skipped ${skipped}.`);
console.log(`Output: design-source/screens/formatted/`);
