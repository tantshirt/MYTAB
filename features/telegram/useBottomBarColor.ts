"use client";

import { useEffect } from "react";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";
import {
  BOTTOM_BAR_COLORS,
  applyBottomBarColor,
  type BottomBarSurface,
} from "./telegramChrome";

/**
 * Sets the colour of the strip between the app and the home indicator
 * (POLISH-SPEC §2.1).
 *
 * Exactly two values are legal:
 * - `"surface"` (#FFFFFF) — surfaces whose bottom-most element is a tab bar or
 *   a sticky footer.
 * - `"paper"` (#F4F7FA) — the three surfaces that end in canvas.
 *
 * The value is per-surface and sticky: a surface that forgets to call this
 * inherits the previous one, which is the failure mode to test for. `AppShell`
 * calls it for every surface so none can forget.
 *
 * Bot API 7.10 — a silent no-op on older clients and outside Telegram. The
 * value is recorded either way, so the `themeChanged` re-assert in
 * `applyTelegramChrome` uses the current surface's colour and not a stale one.
 */
export function useBottomBarColor(surface: BottomBarSurface): void {
  const { isTelegramWebApp } = useTelegramRuntime();
  const color = BOTTOM_BAR_COLORS[surface];

  useEffect(() => {
    applyBottomBarColor(window.Telegram?.WebApp, color);
  }, [color, isTelegramWebApp]);
}

export type { BottomBarSurface };
