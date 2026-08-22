import { MYTAB_COLORS, MYTAB_ELEVATION, MYTAB_RADIUS, MYTAB_TYPOGRAPHY } from "./tokens";

/**
 * Global CSS injected by MyTabThemeProvider.
 *
 * Three jobs:
 *  1. Reset + type roles (UX-DR2, UX-DR3).
 *  2. Tabular numerals globally, including inside form controls (POLISH-SPEC §2.3 invariant 3).
 *  3. The four control classes referenced across `features/bills/*` (POLISH-SPEC §6.3).
 *
 * Every value below traces to `lib/theme/tokens.ts`. No literal hex.
 *
 * NOTE: the control rules deliberately avoid the `font` shorthand. `font` resets
 * `font-variant-numeric` and `font-feature-settings` to their initial values, which would
 * strip tabular figures from every input and button — the exact opposite of DESIGN.md
 * "every numeral in the product is tabular".
 */
export const MYTAB_GLOBAL_CSS = `
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    overscroll-behavior-y: none;
  }

  body {
    -webkit-tap-highlight-color: transparent;
    text-size-adjust: 100%;
    -webkit-text-size-adjust: 100%;
  }

  :root {
    --mytab-font-family: ${MYTAB_TYPOGRAPHY.family};
    /* Wordmark only — the lockup. Never UI text. */
    --mytab-font-wordmark: var(--font-schibsted-grotesk), ${MYTAB_TYPOGRAPHY.family};
    --mytab-tracking-base: ${MYTAB_TYPOGRAPHY.baseTracking};

    --radius-sm: ${MYTAB_RADIUS.sm};
    --radius-md: ${MYTAB_RADIUS.md};
    --radius-lg: ${MYTAB_RADIUS.lg};
    --radius-full: ${MYTAB_RADIUS.full};

    --mytab-elevation-card: ${MYTAB_ELEVATION.cardShadow};
    --mytab-elevation-button-inset: ${MYTAB_ELEVATION.buttonInset};
    --mytab-elevation-sheet: ${MYTAB_ELEVATION.sheetShadow};

    font-variant-numeric: tabular-nums lining-nums;
    font-feature-settings: "tnum" 1, "lnum" 1;
  }

  html {
    font-family: var(--mytab-font-family);
    letter-spacing: var(--mytab-tracking-base);
    -webkit-font-smoothing: antialiased;
    background: ${MYTAB_COLORS.paper};
    color: ${MYTAB_COLORS.ink};
  }

  /* Form controls do not inherit type from the document by default; make them. */
  button,
  input,
  select,
  textarea {
    font-family: inherit;
    letter-spacing: inherit;
    font-variant-numeric: inherit;
    font-feature-settings: inherit;
  }

  .mytab-tabular,
  .mytab-tabular *,
  [data-mytab-amount] {
    font-variant-numeric: tabular-nums lining-nums;
    font-feature-settings: "tnum" 1, "lnum" 1;
  }

  .mytab-type-micro-label {
    font-size: ${MYTAB_TYPOGRAPHY.microLabel.size};
    font-weight: ${MYTAB_TYPOGRAPHY.microLabel.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.microLabel.tracking};
    text-transform: ${MYTAB_TYPOGRAPHY.microLabel.transform};
    color: ${MYTAB_COLORS.inkSubtle};
  }

  .mytab-type-amount-hero {
    font-size: ${MYTAB_TYPOGRAPHY.amountHero.size};
    font-weight: ${MYTAB_TYPOGRAPHY.amountHero.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.amountHero.tracking};
  }

  .mytab-type-amount-lg {
    font-size: ${MYTAB_TYPOGRAPHY.amountLg.size};
    font-weight: ${MYTAB_TYPOGRAPHY.amountLg.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.amountLg.tracking};
  }

  .mytab-type-amount-md {
    font-size: ${MYTAB_TYPOGRAPHY.amountMd.size};
    font-weight: ${MYTAB_TYPOGRAPHY.amountMd.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.amountMd.tracking};
  }

  .mytab-type-amount-row {
    font-size: ${MYTAB_TYPOGRAPHY.amountRow.size};
    font-weight: ${MYTAB_TYPOGRAPHY.amountRow.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.amountRow.tracking};
  }

  .mytab-type-title {
    font-size: ${MYTAB_TYPOGRAPHY.title.size};
    font-weight: ${MYTAB_TYPOGRAPHY.title.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.title.tracking};
  }

  .mytab-type-body {
    font-size: ${MYTAB_TYPOGRAPHY.body.size};
    font-weight: ${MYTAB_TYPOGRAPHY.body.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.body.tracking};
  }

  .mytab-type-label {
    font-size: ${MYTAB_TYPOGRAPHY.label.size};
    font-weight: ${MYTAB_TYPOGRAPHY.label.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.label.tracking};
  }

  .mytab-type-meta {
    font-size: ${MYTAB_TYPOGRAPHY.meta.size};
    font-weight: ${MYTAB_TYPOGRAPHY.meta.weight};
    letter-spacing: ${MYTAB_TYPOGRAPHY.meta.tracking};
    color: ${MYTAB_COLORS.inkMuted};
  }

  .mytab-card {
    background: ${MYTAB_COLORS.surface};
    border: 1px solid ${MYTAB_COLORS.border};
    box-shadow: var(--mytab-elevation-card);
    border-radius: var(--radius-md);
  }

  /* ---------------------------------------------------------------------
     Row layout — names truncate, amounts never do (POLISH-SPEC §2.3).
     --------------------------------------------------------------------- */

  .mytab-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 12px;
    align-items: baseline;
  }

  .mytab-row__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mytab-row__amount {
    flex: none;
    min-width: max-content;
    white-space: nowrap;
    text-align: right;
    font-variant-numeric: tabular-nums lining-nums;
    font-feature-settings: "tnum" 1, "lnum" 1;
  }

  /* ---------------------------------------------------------------------
     Focus — one visible ring, always colors/primary (POLISH-SPEC §6.3).
     --------------------------------------------------------------------- */

  .mytab-focus:focus-visible,
  .mytab-button-primary:focus-visible,
  .mytab-button-secondary:focus-visible,
  .mytab-link-button:focus-visible,
  .mytab-input:focus-visible {
    outline: 2px solid ${MYTAB_COLORS.primary};
    outline-offset: 2px;
  }

  /* ---------------------------------------------------------------------
     Controls. 44px minimum touch target everywhere; 52px on primary fields.
     --------------------------------------------------------------------- */

  .mytab-button-primary,
  .mytab-button-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 52px;
    padding: 0 20px;
    border-radius: ${MYTAB_RADIUS.sm};
    border: 1px solid transparent;
    font-family: var(--mytab-font-family);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: var(--mytab-tracking-base);
    text-align: center;
    text-decoration: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }

  /* Content-width variant, for chip rows and side-by-side inline actions. */
  .mytab-button-inline {
    width: auto;
    flex: none;
  }

  .mytab-button-primary {
    background: ${MYTAB_COLORS.primary};
    border-color: ${MYTAB_COLORS.primary};
    color: ${MYTAB_COLORS.surface};
    box-shadow: ${MYTAB_ELEVATION.buttonInset};
  }

  .mytab-button-primary:active:not(:disabled) {
    background: ${MYTAB_COLORS.primaryDeep};
    border-color: ${MYTAB_COLORS.primaryDeep};
  }

  .mytab-button-secondary {
    background: ${MYTAB_COLORS.surface};
    border-color: ${MYTAB_COLORS.border};
    color: ${MYTAB_COLORS.ink};
    box-shadow: none;
  }

  .mytab-button-secondary:active:not(:disabled) {
    background: ${MYTAB_COLORS.sunk};
    border-color: ${MYTAB_COLORS.borderStrong};
  }

  /* Disabled: paper fill + ink-muted label = 5.39:1, clears WCAG AA.
     Never a greyed-out blue, never border-fill (that pairing sits at 4.6:1). */
  .mytab-button-primary:disabled,
  .mytab-button-secondary:disabled,
  .mytab-button-primary[aria-disabled="true"],
  .mytab-button-secondary[aria-disabled="true"] {
    background: ${MYTAB_COLORS.paper};
    border-color: ${MYTAB_COLORS.border};
    color: ${MYTAB_COLORS.inkMuted};
    box-shadow: none;
    cursor: not-allowed;
  }

  .mytab-link-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    border-radius: ${MYTAB_RADIUS.sm};
    background: none;
    color: ${MYTAB_COLORS.primary};
    font-family: var(--mytab-font-family);
    font-size: ${MYTAB_TYPOGRAPHY.label.size};
    font-weight: ${MYTAB_TYPOGRAPHY.label.weight};
    line-height: 1.2;
    letter-spacing: var(--mytab-tracking-base);
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }

  .mytab-link-button:active:not(:disabled) {
    color: ${MYTAB_COLORS.primaryDeep};
  }

  .mytab-link-button:disabled,
  .mytab-link-button[aria-disabled="true"] {
    color: ${MYTAB_COLORS.inkMuted};
    cursor: not-allowed;
  }

  /* 16px is not negotiable — anything smaller triggers iOS focus-zoom. */
  .mytab-input {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 52px;
    padding: 15px 16px;
    border: 1px solid ${MYTAB_COLORS.border};
    border-radius: ${MYTAB_RADIUS.sm};
    background: ${MYTAB_COLORS.surface};
    color: ${MYTAB_COLORS.ink};
    font-family: var(--mytab-font-family);
    font-size: 16px;
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: var(--mytab-tracking-base);
    transition: border-color 120ms ease;
  }

  /* Secondary fields inside a dense editor — still above the 44px floor. */
  .mytab-input--compact {
    min-height: 44px;
    padding: 11px 14px;
  }

  input.mytab-input,
  textarea.mytab-input {
    -webkit-appearance: none;
    appearance: none;
  }

  select.mytab-input {
    padding-right: 40px;
  }

  .mytab-input:focus-visible,
  .mytab-input:focus {
    border-color: ${MYTAB_COLORS.primary};
  }

  .mytab-input:focus:not(:focus-visible) {
    outline: none;
  }

  .mytab-input::placeholder {
    color: ${MYTAB_COLORS.inkMuted};
    opacity: 1;
  }

  .mytab-input:disabled {
    background: ${MYTAB_COLORS.paper};
    border-color: ${MYTAB_COLORS.border};
    color: ${MYTAB_COLORS.inkMuted};
    cursor: not-allowed;
  }
`;
