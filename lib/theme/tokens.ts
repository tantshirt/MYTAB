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
  /*
   * Bottom sheets rise from the bottom edge, so the shadow must fall UPWARD onto
   * the content being obscured. The previous `0 8px 32px` cast it downward, off
   * the bottom of the screen, where it is invisible (POLISH-SPEC §1.8).
   */
  sheetShadow: "0 -8px 32px rgba(10,32,56,0.12)",
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
  /*
   * The column cap, not the design width. 390px is the artboard width; capping
   * every device at it left 40px of dead paper each side of a 430px phone and
   * shrank the amount budget for no reason. `min(100%, 480px)` means the cap
   * only bites above 480px — a phone gets the whole screen, Desktop still gets
   * a centred single column (POLISH-SPEC §2.10 item 5).
   */
  maxColumnWidth: "min(100%, 480px)",
} as const;

export const MYTAB_AVATAR_TINTS = [
  MYTAB_COLORS.avatar1,
  MYTAB_COLORS.avatar2,
  MYTAB_COLORS.avatar3,
  MYTAB_COLORS.avatar4,
  MYTAB_COLORS.avatar5,
] as const;

/**
 * Deterministic avatar tint from a user id (UX-DR46).
 *
 * FNV-1a with a final avalanche mix. The previous `hash * 31 + charCode`
 * distributed badly for ids sharing a long prefix (`user_maya`, `user_andre`,
 * …), which is exactly the shape real ids have.
 *
 * Use this for a lone avatar. For a SET of people shown together, use
 * `avatarTintsForGroup` — see the note there.
 */
export function avatarTintForUserId(userId: string): string {
  return MYTAB_AVATAR_TINTS[avatarTintIndex(userId)]!;
}

function avatarTintIndex(userId: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) % MYTAB_AVATAR_TINTS.length;
}

/**
 * Tints for a group of people rendered together — a presence stack, a member
 * strip, a claim row's claimants.
 *
 * A per-id hash CANNOT guarantee distinctness: five people into five tints are
 * all-distinct only 120/5^5 = 3.8% of the time, so a hashed stack of the demo
 * cast reliably shows two identical bubbles. DESIGN.md asks for "a row of five
 * [that] reads as one family", which requires the five to be told apart.
 *
 * Each person keeps their hashed tint where it is free; collisions take the next
 * free tint. Sorting the ids first makes the result depend only on the SET, not
 * on render order — so an avatar never changes colour when someone else joins.
 * Beyond five members repeats are unavoidable and resume in the same order.
 */
export function avatarTintsForGroup(userIds: readonly string[]): Map<string, string> {
  const assigned = new Map<string, string>();
  const taken = new Set<number>();
  const ordered = [...new Set(userIds)].sort();

  const claim = (userId: string, preferred: number) => {
    for (let step = 0; step < MYTAB_AVATAR_TINTS.length; step++) {
      const index = (preferred + step) % MYTAB_AVATAR_TINTS.length;
      if (!taken.has(index)) {
        taken.add(index);
        assigned.set(userId, MYTAB_AVATAR_TINTS[index]!);
        return true;
      }
    }
    return false;
  };

  for (const userId of ordered) {
    if (!claim(userId, avatarTintIndex(userId))) {
      // More people than tints — start the cycle again rather than leaving gaps.
      taken.clear();
      claim(userId, avatarTintIndex(userId));
    }
  }

  return assigned;
}
