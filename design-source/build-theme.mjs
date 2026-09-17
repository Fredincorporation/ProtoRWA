/**
 * Builds the real design-token artefacts from the Stitch-extracted config.
 *
 *   design-source/design-tokens.json  (from extract-tokens.mjs)
 *        |
 *        +--> shared/src/design/tokens.ts        typed token objects
 *        +--> frontend/src/styles/theme.css      CSS custom properties
 *        +--> frontend/tailwind.tokens.ts        Tailwind theme.extend
 *
 * Stitch stores the type scale under `fontFamily` (named styles such as
 * `headline-md`), which is wrong for Tailwind - those belong in `fontSize`.
 * The generator normalizes that, so screens and theme agree on the same names.
 *
 * Usage: node design-source/build-theme.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const raw = JSON.parse(readFileSync(join(here, 'design-tokens.json'), 'utf8'));
const extend = raw.theme?.extend ?? {};

/**
 * Stitch splits each named type style across two keys:
 *
 *   fontFamily: { "body-md": ["Inter"] }
 *   fontSize:   { "body-md": ["14px", { lineHeight, fontWeight, letterSpacing }] }
 *
 * Tailwind expects one entry per style, so they are merged here. The concrete
 * font stacks (Space Grotesk / Inter / JetBrains Mono) are then derived from the
 * distinct families referenced by the scale, plus the base `sans` fallback.
 */
function mergeTypography(extend) {
  const scale = {};
  const families = {};

  const declared = extend.fontFamily ?? {};
  const sizes = extend.fontSize ?? {};

  for (const name of new Set([...Object.keys(declared), ...Object.keys(sizes)])) {
    const familySpec = declared[name];
    const sizeSpec = sizes[name];

    // Normalise the family reference to a stack.
    let stack;
    if (Array.isArray(familySpec)) stack = familySpec;
    else if (typeof familySpec === 'string') stack = [familySpec, 'sans-serif'];

    if (stack) {
      const slug = stack[0].toLowerCase().replace(/[^a-z0-9]+/g, '-');
      families[slug] = stack;
    }

    // Normalise the size/weight/leading spec.
    if (Array.isArray(sizeSpec)) {
      const [size, meta] = sizeSpec;
      scale[name] = meta ? [size, meta] : size;
    } else if (sizeSpec && typeof sizeSpec === 'object') {
      scale[name] = sizeSpec;
    }

    // Attach the resolved stack so a single class carries the whole style.
    if (stack && Array.isArray(scale[name])) {
      scale[name][1] = { ...scale[name][1], fontFamily: stack.join(', ') };
    }
  }

  // Base stacks used by the shell outside the named scale.
  families.sans = families['inter'] ?? ['Inter', 'system-ui', 'sans-serif'];
  families.display = families['space-grotesk'] ?? ['Space Grotesk', 'sans-serif'];
  families.mono = families['jetbrains-mono'] ?? ['JetBrains Mono', 'monospace'];

  return { families, sizes: scale };
}

const { families, sizes } = mergeTypography(extend);
const colors = extend.colors ?? {};
const spacing = extend.spacing ?? {};
const borderRadius = extend.borderRadius ?? {};

/* ------------------------------------------------------------------ *
 * 1. Typed token module for application code
 * ------------------------------------------------------------------ */

mkdirSync(join(root, 'shared', 'src', 'design'), { recursive: true });
mkdirSync(join(root, 'frontend', 'src', 'styles'), { recursive: true });

const tokensTs = `/**
 * GENERATED FILE - do not edit by hand.
 * Source: design-source/design-tokens.json (extracted from the Stitch project)
 * Regenerate: pnpm tokens:extract && pnpm tokens:build
 *
 * These are the exact tokens the ProtoRWA Asset Hub designs were authored with,
 * so components reference them symbolically instead of hardcoding hex values.
 */

export const colors = ${JSON.stringify(colors, null, 2)} as const;

export const spacing = ${JSON.stringify(spacing, null, 2)} as const;

export const borderRadius = ${JSON.stringify(borderRadius, null, 2)} as const;

export const fontFamilies = ${JSON.stringify(families, null, 2)} as const;

export const typeScale = ${JSON.stringify(sizes, null, 2)} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type TypeScaleToken = keyof typeof typeScale;
export type FontFamilyToken = keyof typeof fontFamilies;
`;

writeFileSync(join(root, 'shared', 'src', 'design', 'tokens.ts'), tokensTs, 'utf8');

/* ------------------------------------------------------------------ *
 * 2. Tailwind theme fragment
 * ------------------------------------------------------------------ */

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const cssVarEntries = Object.entries(colors).map(([name]) => `  --color-${kebab(name)}: var(--${kebab(name)});`);

/* Tailwind's theme types require mutable structures, so this fragment is
declared without `as const` - the readonly typing lives in shared/src/design. */
const tailwindTokens = `/**
 * GENERATED FILE - do not edit by hand.
 * Regenerate: pnpm tokens:extract && pnpm tokens:build
 *
 * Deliberately mutable: Tailwind's ThemeConfig rejects readonly arrays.
 */

export const colors: Record<string, string> = ${JSON.stringify(colors, null, 2)};

export const spacing: Record<string, string> = ${JSON.stringify(spacing, null, 2)};

export const borderRadius: Record<string, string> = ${JSON.stringify(borderRadius, null, 2)};

/** Named rather than inline so downstream code can reference the shape. */
export type TypeStyle = [
  string,
  { lineHeight?: string; letterSpacing?: string; fontWeight?: string; fontFamily?: string },
];

export const fontFamily = ${JSON.stringify(families, null, 2)} as unknown as Record<string, string[]>;

export const fontSize = ${JSON.stringify(sizes, null, 2)} as unknown as Record<string, TypeStyle>;
`;

writeFileSync(join(root, 'frontend', 'tailwind.tokens.ts'), tailwindTokens, 'utf8');

/* ------------------------------------------------------------------ *
 * 3. CSS custom properties (light/dark switchable surface)
 * ------------------------------------------------------------------ */

const rootVars = Object.entries(colors)
  .map(([name, value]) => `  --${kebab(name)}: ${value};`)
  .join('\n');

const themeCss = `/**
 * GENERATED FILE - do not edit by hand.
 * Regenerate: pnpm tokens:extract && pnpm tokens:build
 *
 * ProtoRWA ships dark-first: the designs were authored in dark mode, so the
 * dark values are the defaults and the semantic Tailwind names alias them.
 */

:root {
${rootVars}
}

@theme inline {
${cssVarEntries.join('\n')}
`;

writeFileSync(join(root, 'frontend', 'src', 'styles', 'theme.css'), themeCss, 'utf8');

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

console.log('Generated:');
console.log(`  shared/src/design/tokens.ts      (${Object.keys(colors).length} colors)`);
console.log(`  frontend/tailwind.tokens.ts      (${Object.keys(sizes).length} type styles)`);
console.log(`  frontend/src/styles/theme.css    (${Object.keys(colors).length} CSS vars)`);
console.log('');
console.log(`Font families: ${Object.keys(families).join(', ')}`);
console.log(`Type styles:   ${Object.keys(sizes).join(', ')}`);
