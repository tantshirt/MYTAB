import { MYTAB_COLORS, MYTAB_TYPOGRAPHY } from "./tokens";

/** Global CSS injected by MyTabThemeProvider — tabular numerals and type roles (UX-DR2, UX-DR3). */
export const MYTAB_GLOBAL_CSS = `
  :root {
    --mytab-font-family: ${MYTAB_TYPOGRAPHY.family};
    --mytab-tracking-base: ${MYTAB_TYPOGRAPHY.baseTracking};
  }

  html {
    font-family: var(--mytab-font-family);
    letter-spacing: var(--mytab-tracking-base);
    -webkit-font-smoothing: antialiased;
    background: ${MYTAB_COLORS.paper};
    color: ${MYTAB_COLORS.ink};
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
    box-shadow: var(--mytab-elevation-card, 0 1px 2px rgba(10,32,56,0.045));
    border-radius: var(--radius-md, 12px);
  }
`;
