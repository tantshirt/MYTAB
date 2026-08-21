import { defineTheme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import { MYTAB_COLORS, MYTAB_ELEVATION, MYTAB_TYPOGRAPHY } from "./tokens";

/**
 * My Tab Astryx theme — extends neutral with the full DESIGN.md token set.
 * Light mode only; no dark variant (AC1).
 */
export const myTabTheme = defineTheme({
  name: "mytab",
  extends: neutralTheme,
  typography: {
    body: {
      family: "Instrument Sans",
      fallbacks: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      weight: "normal",
    },
    heading: {
      weight: "semibold",
    },
  },
  radius: {
    base: 4,
    multiplier: 2.5,
  },
  color: {
    accent: MYTAB_COLORS.primary,
    neutralStyle: "cool",
  },
  tokens: {
    "--color-background-body": MYTAB_COLORS.paper,
    "--color-background-surface": MYTAB_COLORS.surface,
    "--color-background-muted": MYTAB_COLORS.sunk,
    "--color-background-card": MYTAB_COLORS.surface,
    "--color-text-primary": MYTAB_COLORS.ink,
    "--color-text-secondary": MYTAB_COLORS.inkMuted,
    "--color-accent": MYTAB_COLORS.primary,
    "--color-accent-muted": MYTAB_COLORS.primarySoft,
    "--color-success": MYTAB_COLORS.settled,
    "--color-success-muted": MYTAB_COLORS.settledSoft,
    "--color-error": MYTAB_COLORS.owed,
    "--color-error-muted": MYTAB_COLORS.owedSoft,
    "--color-warning": MYTAB_COLORS.warning,
    "--color-warning-muted": MYTAB_COLORS.warningSoft,
    "--radius-inner": "10px",
    "--radius-element": "12px",
    "--radius-container": "20px",
    "--spacing-1": "4px",
    "--spacing-2": "8px",
    "--spacing-3": "12px",
    "--spacing-4": "16px",
    "--spacing-5": "20px",
    "--spacing-6": "24px",
    "--spacing-7": "32px",
    "--spacing-8": "48px",
  },
  components: {
    button: {
      base: {
        boxShadow: MYTAB_ELEVATION.buttonInset,
        fontFamily: MYTAB_TYPOGRAPHY.family,
      },
    },
  },
});
