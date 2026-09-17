import type { Config } from 'tailwindcss';

import { borderRadius, colors, fontFamily, fontSize, spacing } from './tailwind.tokens';

/**
 * Token lookups are typed as possibly-undefined because this project enables
 * `noUncheckedIndexedAccess`. The generated token file is the single source of
 * truth, so a missing key is a build-time bug - `must()` fails loudly instead of
 * silently emitting `undefined` into the theme.
 */
function must(token: Record<string, string>, key: string): string {
  const value = token[key];
  if (value === undefined) {
    throw new Error(`Missing design token "${key}". Run: pnpm tokens:extract && pnpm tokens:build`);
  }
  return value;
}

function must2(token: Record<string, string[]>, key: string): string[] {
  const value = token[key];
  if (value === undefined) {
    throw new Error(`Missing font family "${key}". Run: pnpm tokens:extract && pnpm tokens:build`);
  }
  return value;
}

/**
 * Tailwind config for ProtoRWA.
 *
 * Design tokens in `tailwind.tokens.ts` are GENERATED from the Stitch project
 * (see design-source/build-theme.mjs), so the palette and type scale here are
 * the ones the designs were authored with - not approximations.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ...colors,
        // Semantic aliases so components read intent, not raw palette names.
        canvas: must(colors, 'background'),
        panel: must(colors, 'surface-container'),
        'panel-high': must(colors, 'surface-container-high'),
        'panel-highest': must(colors, 'surface-container-highest'),
        'panel-low': must(colors, 'surface-container-low'),
        'panel-lowest': must(colors, 'surface-container-lowest'),
        ink: must(colors, 'on-surface'),
        'ink-muted': must(colors, 'on-surface-variant'),
        brand: must(colors, 'primary'),
        'brand-container': must(colors, 'primary-container'),
        'on-brand': must(colors, 'on-primary'),
        accent: must(colors, 'secondary'),
        warn: must(colors, 'tertiary'),
        danger: must(colors, 'error'),
        'danger-container': must(colors, 'error-container'),
      },
      fontFamily: {
        // The CSS variables are provided by next/font (app/layout.tsx), so the
        // self-hosted files win over the generic fallback stack.
        sans: ['var(--font-body)', ...must2(fontFamily, 'sans')],
        display: ['var(--font-display)', ...must2(fontFamily, 'display')],
        mono: ['var(--font-mono)', ...must2(fontFamily, 'mono')],
      },
      fontSize: {
        ...fontSize,
        // The Stitch designs reach for arbitrary pixel sizes (text-[44px],
        // text-[28px]) rather than the token scale for hero/marketing copy.
        // Naming them here keeps screens free of magic numbers while preserving
        // the exact rendered sizes. Values taken from the source markup.
        'display-xl': ['44px', { lineHeight: '52px', fontWeight: '700', letterSpacing: '-0.02em' }],
        'display-md': ['28px', { lineHeight: '36px', fontWeight: '600' }],
        'body-lg-relaxed': ['16px', { lineHeight: '26px', fontWeight: '400' }],
      },
      spacing,
      borderRadius: {
        ...borderRadius,
        DEFAULT: borderRadius.DEFAULT ?? '0.25rem',
      },
      backgroundImage: {
        // Subtle emerald wash used behind hero and stat sections.
        'brand-glow':
          'radial-gradient(60% 60% at 50% 0%, rgba(78, 222, 163, 0.18) 0%, rgba(15, 20, 28, 0) 100%)',
        'grid-fade':
          'linear-gradient(to bottom, rgba(48, 53, 62, 0.4) 1px, transparent 1px), linear-gradient(to right, rgba(48, 53, 62, 0.4) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
