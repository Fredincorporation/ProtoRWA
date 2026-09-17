/**
 * GENERATED FILE - do not edit by hand.
 * Regenerate: pnpm tokens:extract && pnpm tokens:build
 *
 * Deliberately mutable: Tailwind's ThemeConfig rejects readonly arrays.
 */

export const colors: Record<string, string> = {
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
};

export const spacing: Record<string, string> = {
  "space-xl": "2.5rem",
  "space-xs": "0.25rem",
  "space-md": "1rem",
  "space-sm": "0.5rem",
  "space-lg": "1.5rem",
  "gutter": "1.5rem",
  "margin": "2.5rem",
  "margin-mobile": "1rem",
  "gutter-mobile": "1rem"
};

export const borderRadius: Record<string, string> = {
  "DEFAULT": "0.125rem",
  "lg": "0.25rem",
  "xl": "0.5rem",
  "full": "0.75rem"
};

/** Named rather than inline so downstream code can reference the shape. */
export type TypeStyle = [
  string,
  { lineHeight?: string; letterSpacing?: string; fontWeight?: string; fontFamily?: string },
];

export const fontFamily = {
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
} as unknown as Record<string, string[]>;

export const fontSize = {
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
} as unknown as Record<string, TypeStyle>;
