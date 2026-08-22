/**
 * Every §4 string that more than one surface needs, in one place.
 *
 * POLISH-SPEC §4.0 — the four rules that generate all of them:
 *   1. A failure names its next action in the same breath.
 *   2. Never apologise, never explain the mechanism.
 *   3. Numbers are never rounded and never blanked.
 *   4. No state ships as a spinner over correct data.
 *
 * Surface-specific copy stays with its surface (`features/you/copy.ts` is the
 * pattern); this module is only what is genuinely shared.
 */
export const STATE_COPY = {
  /** §4.4 — one offline treatment, everywhere. */
  offline: "You're offline. We'll catch up.",
  /** §4.4 — the sub-line under every control offline disables. */
  needsConnection: "Needs a connection.",
  /**
   * §4.5 — the standalone-browser write lock. Reads work; every mutation is
   * disabled, and every disabled control repeats this sentence on its own
   * sub-line rather than going silent.
   */
  outsideTelegram: "Open this in Telegram to make changes.",
  /**
   * §4.5 — a *different* case: authenticated, inside Telegram, but launched
   * without a group. Never conflate it with the write lock above.
   */
  noGroupContext: "Open My Tab from a Telegram group to start a tab.",
  /** The one retry label in the product. */
  retry: "Try again",
} as const;
