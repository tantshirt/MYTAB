"use client";

import { useEffect, useState } from "react";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

const ZERO_INSETS: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Reads Telegram safe-area insets with CSS env() fallback (Story 2.8 AC1).
 */
export function useSafeAreaInsets(): SafeAreaInsets {
  const { isTelegramWebApp } = useTelegramRuntime();
  const [insets, setInsets] = useState<SafeAreaInsets>(ZERO_INSETS);

  useEffect(() => {
    if (!isTelegramWebApp) {
      setInsets(ZERO_INSETS);
      return;
    }

    const readInsets = () => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);right:env(safe-area-inset-right);visibility:hidden;pointer-events:none;";
      document.body.appendChild(probe);
      const rect = probe.getBoundingClientRect();
      document.body.removeChild(probe);

      const webApp = window.Telegram?.WebApp as
        | { safeAreaInset?: Partial<SafeAreaInsets> }
        | undefined;

      setInsets({
        top: webApp?.safeAreaInset?.top ?? rect.top,
        bottom: webApp?.safeAreaInset?.bottom ?? Math.max(0, window.innerHeight - rect.bottom),
        left: webApp?.safeAreaInset?.left ?? rect.left,
        right: webApp?.safeAreaInset?.right ?? Math.max(0, window.innerWidth - rect.right),
      });
    };

    readInsets();
    window.addEventListener("resize", readInsets);
    return () => window.removeEventListener("resize", readInsets);
  }, [isTelegramWebApp]);

  return insets;
}
