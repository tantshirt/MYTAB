import {
  MYTAB_COLORS,
  MYTAB_ELEVATION,
  MYTAB_RADIUS,
  MYTAB_SPACING,
  MYTAB_TYPOGRAPHY,
} from "./tokens";

/**
 * Splices the Thai face in directly behind the Latin one.
 *
 * Font fallback is per glyph, not per element: Instrument Sans carries no Thai
 * at all, so every Thai codepoint walks past it to the next family that has the
 * glyph. Putting Noto Sans Thai second means that family is ours, with metrics
 * we measured, instead of whatever the platform installs (POLISH-SPEC §2.2).
 *
 * Consumed by `--mytab-font-family-thai`, never by `--mytab-font-family`. The
 * difference matters more than it looks: **Instrument Sans has no U+0E3F either**,
 * so `฿1,840.00` — which is on nearly every screen in the product — contains a
 * Thai codepoint. Splice the Thai face into the global stack and every amount
 * row at `line-height: normal` takes Noto's taller line box: measured in Chrome,
 * a 20px/600 line grows 23px → 30px. That is a product-wide rhythm change nobody
 * asked for, so the Thai stack is opt-in, on the elements that hold *names*, and
 * names never contain ฿.
 */
export function withThaiFallback(stack: string): string {
  const families = stack.split(",").map((one) => one.trim());
  return [families[0], "var(--font-noto-thai)", ...families.slice(1)].join(", ");
}

/**
 * What a name-bearing element asks for. Degrades to the Latin stack when the
 * binding has not landed, rather than to an invalid `font-family`.
 */
const THAI_STACK = "var(--mytab-font-family-thai, var(--mytab-font-family))";

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
    /*
     * clip, never hidden.
     *
     * Both stop a horizontal scrollbar, but overflow-x: hidden makes the
     * element a SCROLL CONTAINER, and CSS then computes the other axis from
     * visible to auto. On body — whose height is its content — that produces a
     * scrollport that can never scroll, and every position: sticky descendant
     * resolves against it instead of the viewport. Measured in Chrome at HEAD:
     * the tab bar and the sticky claim footer sat at the BOTTOM OF THE
     * DOCUMENT and moved 1:1 with the scroll, i.e. they were never pinned at
     * all. overflow: clip is not a scroll container, leaves overflow-y alone,
     * and clips exactly the same.
     */
    overflow-x: clip;
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
    --mytab-elevation-button-pressed: ${MYTAB_ELEVATION.buttonPressed};
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

  /*
   * The value column when it carries WORDS rather than a figure — "Covered by
   * My Tab" is the only such value in the product. The base rule pins
   * min-width to max-content and forbids wrapping, which is exactly right for
   * an amount and exactly wrong for a sentence: at 320px with the platform
   * text setting at 200% that sentence pushed the row 9px past the viewport.
   * A sentence may wrap. An amount still may not.
   */
  .mytab-row__amount--text {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  /* ---------------------------------------------------------------------
     Names — the one place Thai and Latin share a line (DESIGN.md, *Typography*).

     A scanned receipt puts ต้มยำกุ้ง and "Pad Thai" in the same column, so these
     two classes are where the Thai face is switched on. Nowhere else: they mark
     elements that hold a *name*, and a name never carries the ฿ that would drag
     the Thai line box onto every amount in the product.

     .mytab-name swaps the family and nothing else, for elements already at
     line-height: normal. normal is content-scoped and measures correctly for
     both scripts — a Latin-only tab name at 20px/600 is 23px tall whether or not
     the Thai family is in its stack, because the face is subset to Thai and so
     carries unicode-range: U+0E01-0E5B, …; the same element holding Thai grows
     to 30px, which is the marks getting their room. Pinning a number on those
     would loosen Latin to buy space Thai already has.

     .mytab-item-name additionally pins the line box, for the two elements that
     already had a tight explicit one. Measured in Chrome at 15px/500 with Noto
     Sans Thai, the canonical fixture strings draw ink 12.71px above the baseline
     and 3.91px below; a line-height: 1.2 box gives 14px and 4px, which clips —
     12 ink pixels lost on ต้มยำกุ้ง under the platform fallback face. At 1.45 the
     box is 21.75px and the marks clear by 3.29px above and 1.84px below.
     --------------------------------------------------------------------- */

  .mytab-name,
  .mytab-item-name {
    font-family: ${THAI_STACK};
  }

  .mytab-item-name {
    line-height: 1.45;
  }

  /* ---------------------------------------------------------------------
     Screen-reader-only text. Semantic colour never travels alone (EXPERIENCE,
     *Accessibility Floor*), so a dot or a tint always has a word beside it that
     only assistive technology reads. The standard 1px-clip pattern, defined
     once here rather than re-inlined at each call site.
     --------------------------------------------------------------------- */

  .mytab-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
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
    user-select: none;
    -webkit-user-select: none;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .mytab-button-primary,
    .mytab-button-secondary {
      transition: none;
    }
  }

  /* ---------------------------------------------------------------------
     A row of equal chips where every chip has to clear the 44px touch floor.

     The gap is spacing/2, and compresses to spacing/1 below the 390px design
     width: six 44px chips plus five 8px gaps need 304px, and a 320px screen
     offers 288 after its gutters. The gap gives way, never the target — and
     only on the screens that cannot afford it, so the 390px design is
     untouched. Wrapping is the last resort past that, for the largest
     platform text setting.
     --------------------------------------------------------------------- */

  .mytab-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: ${MYTAB_SPACING["2"]};
  }

  @media (max-width: 359px) {
    .mytab-chip-row {
      gap: ${MYTAB_SPACING["1"]};
    }
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
    box-shadow: ${MYTAB_ELEVATION.buttonPressed};
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

  /*
   * 16px is not negotiable — anything smaller triggers iOS focus-zoom.
   *
   * The vertical padding and the line box are a measured pair. A tab name and a
   * merchant name are typed here and are routinely Thai. At the previous
   * padding: 15px + line-height: 1.2 the content box was 20px against a
   * baseline 16px down and 4.18px of Thai descender — 0.18px short, and Chrome
   * dropped 4 ink pixels off ผัดไทยกุ้งสด. 13px of padding with a 1.4 line box
   * gives 24px of content and 1.82px of clearance.
   *
   * Nothing a Latin user can see moves: the control is still 52px, the type is
   * still 16px, and because the line box stays centred the Latin baseline lands
   * on the same pixel row as before (32px from the top of the control, measured
   * both ways).
   */
  .mytab-input {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 52px;
    padding: 13px 16px;
    border: 1px solid ${MYTAB_COLORS.border};
    border-radius: ${MYTAB_RADIUS.sm};
    background: ${MYTAB_COLORS.surface};
    color: ${MYTAB_COLORS.ink};
    /* A tab name, a merchant and an item name are all typed into this control,
       and all three are routinely Thai. */
    font-family: ${THAI_STACK};
    font-size: 16px;
    font-weight: 500;
    line-height: 1.4;
    letter-spacing: var(--mytab-tracking-base);
    transition: border-color 120ms ease;
  }

  /* Secondary fields inside a dense editor — still above the 44px floor, and
     the same 24px content box, so Thai clears here too. */
  .mytab-input--compact {
    min-height: 44px;
    padding: 9px 14px;
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
