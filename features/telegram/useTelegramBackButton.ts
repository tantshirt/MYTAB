"use client";

import { useBackAffordance } from "./useBackAffordance";

/**
 * Back-compatible alias for {@link useBackAffordance} (Story 2.8 AC2).
 *
 * The implementation moved to `useBackAffordance.ts`, which is the one hook
 * POLISH-SPEC §2.4 asks for; this wrapper stays so existing call sites do not
 * have to change in the same pass. New surfaces should call
 * `useBackAffordance` directly and use its `showInAppChevron` to decide whether
 * to draw the in-app chevron — the two controls are never both on screen.
 *
 * `triggerTelegramHaptic` used to live here and now lives in `useHaptics.ts`
 * (POLISH-SPEC §2.8, §2.10 item 6).
 */
export function useTelegramBackButton(onBack: () => void, enabled = true): void {
  useBackAffordance({ onBack, enabled });
}

export { useBackAffordance } from "./useBackAffordance";
export type { BackAffordance, UseBackAffordanceOptions } from "./useBackAffordance";
