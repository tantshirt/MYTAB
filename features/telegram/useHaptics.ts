"use client";

import { useMemo } from "react";

/**
 * Haptics (POLISH-SPEC §2.8, EXPERIENCE "Haptics, three moments only").
 *
 * Exactly three moments are sanctioned, and they are named here rather than
 * exposed as raw Telegram styles so the call sites read as product events and
 * a fourth one cannot be added by accident:
 *
 * | Moment            | Telegram call                        |
 * |-------------------|--------------------------------------|
 * | claim / unclaim   | `impactOccurred('light')`            |
 * | lock bill         | `impactOccurred('medium')`           |
 * | payment confirmed | `notificationOccurred('success')`    |
 *
 * Nothing else vibrates. Explicitly not: tab switch, sheet open, sheet dismiss,
 * token selection, preset chip, chevron expand, copy-to-clipboard, errors, or
 * the arrival of someone else's claim.
 *
 * All three are suppressed under `prefers-reduced-motion: reduce` — the same
 * switch that suppresses motion (Accessibility Floor). That check lives in this
 * module and nowhere else, so there is exactly one place it can be got wrong.
 */

export type HapticStyle = "light" | "medium" | "success";

type TelegramHapticFeedback = {
  impactOccurred: (style: "light" | "medium" | "heavy") => void;
  notificationOccurred: (type: "success" | "warning" | "error") => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Fires one of the three sanctioned haptics. Safe to call anywhere: a no-op on
 * the server, outside Telegram, on a client without `HapticFeedback`, and under
 * Reduce Motion.
 *
 * Fire it optimistically, on the tap — a buzz 200ms after the finger lifts, on
 * server acknowledgement, reads as a bug.
 */
export function triggerHaptic(style: HapticStyle): void {
  if (typeof window === "undefined") {
    return;
  }
  if (prefersReducedMotion()) {
    return;
  }

  const haptics = window.Telegram?.WebApp?.HapticFeedback as
    | TelegramHapticFeedback
    | undefined;
  if (!haptics) {
    return;
  }

  try {
    if (style === "success") {
      haptics.notificationOccurred("success");
      return;
    }
    haptics.impactOccurred(style);
  } catch {
    // WebAppMethodUnsupported on an old client — a missing buzz is never worth
    // breaking a render for.
  }
}

export type Haptics = {
  /** Light impact, on the tap that claims or unclaims an item. */
  claimToggled: () => void;
  /** Medium impact, once, on accepting the lock confirmation — not on opening it. */
  billLocked: () => void;
  /**
   * Success notification, on the stepper's transition into `confirmed`.
   * Latch it with a `useRef` keyed by intent id so a re-render or a reconnect
   * cannot repeat it.
   */
  paymentConfirmed: () => void;
};

/** The three sanctioned moments, as stable callbacks. */
export function useHaptics(): Haptics {
  return useMemo<Haptics>(
    () => ({
      claimToggled: () => triggerHaptic("light"),
      billLocked: () => triggerHaptic("medium"),
      paymentConfirmed: () => triggerHaptic("success"),
    }),
    [],
  );
}
