/**
 * GENERATED FILE - do not edit by hand.
 * Source: design-source/design-tokens.json (extracted from the Stitch project)
 * Regenerate: pnpm tokens:extract && pnpm tokens:build
 *
 * These are the exact tokens the ProtoRWA Asset Hub designs were authored with,
 * so components reference them symbolically instead of hardcoding hex values.
 */

export const colors = {
  "on-background": "#dee2ee",
  "surface-dim": "#0f141c",
  "on-tertiary-fixed": "#2a1700",
  "error-container": "#93000a",
  "on-secondary": "#003640",
  "on-primary-fixed-variant": "#005236",
  "tertiary-fixed-dim": "#ffb95f",
  "on-surface": "#dee2ee",
  "primary-container": "#10b981",
  "secondary-fixed-dim": "#4cd7f6",
  "error": "#ffb4ab",
  "on-surface-variant": "#bbcabf",
  "primary-fixed-dim": "#4edea3",
  "on-secondary-container": "#00424e",
  "on-secondary-fixed": "#001f26",
  "primary-fixed": "#6ffbbe",
  "background": "#0f141c",
  "surface-container-high": "#252a33",
  "on-tertiary": "#472a00",
  "inverse-primary": "#006c49",
  "secondary-fixed": "#acedff",
  "primary": "#4edea3",
  "secondary-container": "#03b5d3",
  "surface-variant": "#30353e",
  "on-primary-fixed": "#002113",
  "inverse-on-surface": "#2c3139",
  "outline-variant": "#3c4a42",
  "on-secondary-fixed-variant": "#004e5c",
  "inverse-surface": "#dee2ee",
  "surface-bright": "#343942",
  "surface": "#0f141c",
  "secondary": "#4cd7f6",
  "tertiary-fixed": "#ffddb8",
  "surface-tint": "#4edea3",
  "surface-container": "#1b2028",
  "tertiary": "#ffb95f",
  "tertiary-container": "#e29100",
  "outline": "#86948a",
  "on-error": "#690005",
  "on-primary-container": "#00422b",
  "surface-container-low": "#171c24",
  "on-tertiary-fixed-variant": "#653e00",
  "surface-container-lowest": "#090e16",
  "on-error-container": "#ffdad6",
  "on-primary": "#003824",
  "surface-container-highest": "#30353e",
  "on-tertiary-container": "#523200"
} as const;

export const spacing = {
  "space-xl": "2.5rem",
  "space-xs": "0.25rem",
  "space-md": "1rem",
  "space-sm": "0.5rem",
  "space-lg": "1.5rem",
  "gutter": "1.5rem",
  "margin": "2.5rem",
  "margin-mobile": "1rem",
  "gutter-mobile": "1rem"
} as const;

export const borderRadius = {
  "DEFAULT": "0.125rem",
  "lg": "0.25rem",
  "xl": "0.5rem",
  "full": "0.75rem"
} as const;

export const fontFamilies = {
  "inter": [
    "Inter"
  ],
  "space-grotesk": [
    "Space Grotesk"
  ],
  "jetbrains-mono": [
    "JetBrains Mono"
  ],
  "sans": [
    "Inter"
  ],
  "display": [
    "Space Grotesk"
  ],
  "mono": [
    "JetBrains Mono"
  ]
} as const;

export const typeScale = {
  "body-sm": [
    "12px",
    {
      "lineHeight": "16px",
      "fontWeight": "400",
      "fontFamily": "Inter"
    }
  ],
  "display-lg": [
    "48px",
    {
      "lineHeight": "56px",
      "letterSpacing": "-0.02em",
      "fontWeight": "700",
      "fontFamily": "Space Grotesk"
    }
  ],
  "body-md": [
    "14px",
    {
      "lineHeight": "20px",
      "fontWeight": "400",
      "fontFamily": "Inter"
    }
  ],
  "display-lg-mobile": [
    "36px",
    {
      "lineHeight": "44px",
      "letterSpacing": "-0.02em",
      "fontWeight": "700",
      "fontFamily": "Space Grotesk"
    }
  ],
  "label-md": [
    "12px",
    {
      "lineHeight": "16px",
      "letterSpacing": "0.04em",
      "fontWeight": "500",
      "fontFamily": "JetBrains Mono"
    }
  ],
  "headline-lg": [
    "32px",
    {
      "lineHeight": "40px",
      "letterSpacing": "-0.01em",
      "fontWeight": "600",
      "fontFamily": "Space Grotesk"
    }
  ],
  "label-sm": [
    "10px",
    {
      "lineHeight": "14px",
      "letterSpacing": "0.06em",
      "fontWeight": "600",
      "fontFamily": "JetBrains Mono"
    }
  ],
  "headline-sm": [
    "20px",
    {
      "lineHeight": "28px",
      "fontWeight": "600",
      "fontFamily": "Space Grotesk"
    }
  ],
  "headline-md": [
    "24px",
    {
      "lineHeight": "32px",
      "fontWeight": "600",
      "fontFamily": "Space Grotesk"
    }
  ],
  "label-lg": [
    "14px",
    {
      "lineHeight": "20px",
      "letterSpacing": "0.02em",
      "fontWeight": "500",
      "fontFamily": "JetBrains Mono"
    }
  ],
  "body-lg": [
    "16px",
    {
      "lineHeight": "24px",
      "fontWeight": "400",
      "fontFamily": "Inter"
    }
  ],
  "headline-lg-mobile": [
    "26px",
    {
      "lineHeight": "34px",
      "letterSpacing": "-0.01em",
      "fontWeight": "600",
      "fontFamily": "Space Grotesk"
    }
  ]
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type TypeScaleToken = keyof typeof typeScale;
export type FontFamilyToken = keyof typeof fontFamilies;
