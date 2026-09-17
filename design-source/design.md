---
name: ProtoRWA
colors:
  surface: '#0f141c'
  surface-dim: '#0f141c'
  surface-bright: '#343942'
  surface-container-lowest: '#090e16'
  surface-container-low: '#171c24'
  surface-container: '#1b2028'
  surface-container-high: '#252a33'
  surface-container-highest: '#30353e'
  on-surface: '#dee2ee'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dee2ee'
  inverse-on-surface: '#2c3139'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0f141c'
  on-background: '#dee2ee'
  surface-variant: '#30353e'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
The design system reflects a precision-engineered convergence of physical manufacturing and institutional decentralized finance. It serves an audience of institutional allocators, hardware innovators, and accredited decentralized asset underwriters. 

The aesthetic is Modern Industrial Fintech: an uncompromising, sleek dark architecture composed of deep graphite and slate surfaces, structural hairline dividers, and vivid fiscal accents. It borrows the exactitude of industrial schematics and combines it with the velocity of on-chain liquidity engines. The interface evokes rigorous mechanical integrity, verified chain-of-custody, and financial permanence—entirely avoiding frivolous consumer crypto tropes in favor of an institutional terminal feel.

## Colors
The palette is built on deep structural slate tones that enforce high contrast and clear visual priority across data-dense dashboards:

- **Primary (`#10B981` — Precision Mint/Emerald):** Highlights positive capital formation, funded states, APY yields, and verified physical asset verification.
- **Secondary (`#06B6D4` — Cyan Telemetry):** Denotes smart contract telemetry, protocol bridges (Arbitrum & Robinhood Chain execution), and automated legal escrow events.
- **Tertiary (`#F59E0B` — Industrial Amber):** Serves operational states requiring attention: active governance voting, pending oracle sign-offs, and pre-production manufacture windows.
- **Neutral (`#0F141C` — Obsidian Slate):** Forms the foundational canvas, paired with step-up container tones (`#161E2E`, `#1F293D`) and low-opacity white boundaries (`rgba(255, 255, 255, 0.08)`).
- **Functional Status Colors:** Escrow (`#818CF8`), Live Production (`#10B981`), Secondary Market Active (`#38BDF8`), Halted/Terminated (`#EF4444`).

## Typography
Typography is treated as an instrument of precision. The system deploys a tripartite hierarchy:

1. **Space Grotesk (Display & Headlines):** Delivers clean, engineered authority for asset titles, unit totals, and key metrics.
2. **Inter (Body Text):** Provides ultra-neutral, legibility-first reading for technical hardware specs, prospectus clauses, and governance writeups.
3. **JetBrains Mono (Labels, Identifiers, & Metrics):** Reserved for on-chain contract addresses, ledger telemetry, escrow stage indices, and currency counters. All monetary values and progress percentages must use tabular numerals.

## Layout & Spacing
The layout follows a 12-column responsive fluid grid with strict mathematical cadence.

- **Desktop (1280px+):** 12 columns, `1.5rem` gutters, `2.5rem` minimum canvas padding. Data grids can collapse into split 8/4 views for asset analytics versus order entry.
- **Tablet (768px - 1279px):** 8 columns, `1.25rem` gutters, `1.5rem` margin. Side rails collapse to tabbed drawers or stacked sections.
- **Mobile (< 768px):** 4 columns, `1rem` gutters, `1rem` margin. Complex multi-stage tables reflow into vertically stacked modular cards.
- **Spacing Principle:** Consistent internal rhythm uses the 4px base (`0.25rem`). Tight vertical metrics group related hardware data points, while outer boundaries enforce distinct structural zones.

## Elevation & Depth
Elevation in this design system avoids heavy drop shadows, relying instead on structural surface layering and fine optical boundaries:

- **Surface 0 (Base Canvas):** `#0B0F17` — Deepest matte ground.
- **Surface 1 (Modules & Panes):** `#111823` with a 1px solid hairline border `rgba(255, 255, 255, 0.07)`.
- **Surface 2 (Interactive Cards & Drawers):** `#16202E` with a 1px border `rgba(255, 255, 255, 0.12)`.
- **Surface 3 (Overlays & Dialogs):** `#1C283A` backed by an active backdrop filter (`blur(16px)` at `rgba(11, 15, 23, 0.85)`).
- **Luminescence & Glow:** Ambient directional glows are reserved strictly for active on-chain states, using an extra-diffuse mint bloom (`box-shadow: 0 0 24px -4px rgba(16, 185, 129, 0.25)`).

## Shapes
To emphasize physical manufacturing and machined hardware precision, the shape system operates at a crisp, low-radius curvature (`roundedness: 1`).

- **Inputs, Badges, and Small Controls:** `0.25rem` (4px).
- **Cards, Panels, and Data Modules:** `0.5rem` (8px).
- **Modals and Command Sheets:** `0.75rem` (12px).
- **Pills / Status Dots:** Circular or fully rounded capsules are permitted only for operational status pills (e.g., `Escrow`, `Live`) to cleanly set them apart from structural blocks.

## Components

### Buttons
- **Primary:** Filled with Emerald (`#10B981`), text in dark canvas (`#0B0F17`), weight `600`, radius `0.25rem`. Hover introduces a subtle top highlight and mint glow.
- **Secondary / Ghost:** Transparent background, `1px` border in `rgba(255, 255, 255, 0.15)`, text in `#E2E8F0`. Hover shifts background to `rgba(255, 255, 255, 0.04)` and border to mint.
- **Destructive:** Bordered in `rgba(239, 68, 68, 0.4)`, text in `#EF4444`.

### Status Badges
Engineered capsules displaying lifecycle phases:
- **Escrow:** Indigo-tinted background (`rgba(129, 140, 248, 0.12)`), text `#818CF8`, with a pulsing 4px indicator dot.
- **Live / Active:** Mint background (`rgba(16, 185, 129, 0.12)`), text `#10B981`.
- **Voting:** Amber background (`rgba(245, 158, 11, 0.12)`), text `#F59E0B`.
- All badges use `label-sm` in `JetBrains Mono` with uppercase tracking.

### Modular Cards
Modular asset cards anchor the platform. Each card features:
- A structural technical header containing the asset serial number, chain badge (Arbitrum / Robinhood Chain), and manufacturing SKU.
- A high-contrast metric row (Yield, Total Value Locked, Min Investment) rendered in `JetBrains Mono`.
- Subdued hairline dividers (`rgba(255, 255, 255, 0.06)`).

### Milestone Progress Timelines
Multi-step hardware deployment tracks:
- Displays physical production milestones: `Component Sourcing` → `Assembly` → `QA & Oracle Verification` → `Tokenized Custody` → `Yield Distribution`.
- Completed steps connect via a solid 2px emerald line; pending steps show a segmented, low-contrast dashed line.

### Token Claim Metrics & Input Fields
- **Input Fields:** Recessed `#0C1118` backgrounds with `1px` borders in `rgba(255, 255, 255, 0.12)`, shifting to `#10B981` on focus. Built-in maximum balance tokens and currency indicators aligned to the right.
- **Claim Modules:** Clear dual-readout panels displaying Unclaimed Rewards against Vested Total, coupled with single-click batch claim execution.

### Checkboxes & Radio Controls
Squared `0.25rem` boxes with high-contrast emerald fills upon selection, accompanied by crisp SVG checkmarks in charcoal.
