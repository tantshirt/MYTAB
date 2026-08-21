/**
 * My Tab design tokens — sole visual authority from DESIGN.md (UX-DR1).
 * All surfaces consume these values; no hardcoded hex outside this module.
 */

export const MYTAB_COLORS = {
  paper: "#F4F7FA",
  surface: "#FFFFFF",
  sunk: "#EDF2F7",
  ink: "#0A2038",
  inkMuted: "#55677D",
  inkSubtle: "#61748B",
  border: "#DFE7EF",
  borderStrong: "#C6D2DE",
  primary: "#1E51D2",
  primarySoft: "#E7EDFC",
  primaryDeep: "#17409F",
  tip: "#A85F2E",
  tipSoft: "#F8EDE4",
  settled: "#0B7561",
  settledSoft: "#E1F0EC",
  owed: "#B32B44",
  owedSoft: "#FBE9EC",
  warning: "#9A6209",
  warningSoft: "#FBF1E0",
  avatar1: "#B0603E",
  avatar2: "#1E51D2",
  avatar3: "#0B7561",
  avatar4: "#9A6209",
  avatar5: "#55677D",
} as const;

export const MYTAB_RADIUS = {
  sm: "10px",
  md: "12px",
  lg: "20px",
  full: "999px",
} as const;

export const MYTAB_SPACING = {
  "1": "4px",
  "2": "8px",
  "3": "12px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "7": "32px",
  "8": "48px",
} as const;

export const MYTAB_ELEVATION = {
  cardShadow: "0 1px 2px rgba(10,32,56,0.045)",
  buttonInset: "inset 0 -1px 0 rgba(10,32,56,0.24)",
  sheetShadow: "0 8px 32px rgba(10,32,56,0.12)",
} as const;

export const MYTAB_TYPOGRAPHY = {
  family:
    'var(--font-instrument-sans), "Instrument Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
  baseTracking: "-0.006em",
  microLabel: { size: "11px", weight: 600, tracking: "0.07em", transform: "uppercase" as const },
  amountHero: { size: "42px", weight: 600, tracking: "-0.032em" },
  amountLg: { size: "34px", weight: 600, tracking: "-0.028em" },
  amountMd: { size: "24px", weight: 600, tracking: "-0.02em" },
  amountRow: { size: "15px", weight: 500, tracking: "-0.006em" },
  title: { size: "20px", weight: 600, tracking: "-0.018em" },
  body: { size: "15px", weight: 400, tracking: "-0.006em" },
  label: { size: "13px", weight: 500, tracking: "-0.006em" },
  meta: { size: "13px", weight: 400, tracking: "-0.006em" },
} as const;

export const MYTAB_LAYOUT = {
  gutter: MYTAB_SPACING["4"],
  cardPadding: MYTAB_SPACING["5"],
  maxColumnWidth: "390px",
} as const;

export const MYTAB_AVATAR_TINTS = [
  MYTAB_COLORS.avatar1,
  MYTAB_COLORS.avatar2,
  MYTAB_COLORS.avatar3,
  MYTAB_COLORS.avatar4,
  MYTAB_COLORS.avatar5,
] as const;

/** Deterministic avatar tint from a user id string (UX-DR46). */
export function avatarTintForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return MYTAB_AVATAR_TINTS[hash % MYTAB_AVATAR_TINTS.length]!;
}
