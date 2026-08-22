"use client";

import { useEffect, useState } from "react";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

export type ViewportState = {
  width: number;
  height: number;
  /**
   * Telegram's `viewportStableHeight`. Telegram's own docs warn that
   * `viewportHeight` cannot smoothly follow the window border, so this is the
   * value a sticky footer and the shell height must be built on (§2.7).
   */
  stableHeight: number;
  isExpanded: boolean;
  /** Whether the numbers above came from Telegram rather than the window. */
  isTelegram: boolean;
};

const DEFAULT_VIEWPORT: ViewportState = {
  width: 390,
  height: 700,
  stableHeight: 700,
  isExpanded: false,
  isTelegram: false,
};

function readCssPx(name: string): number | null {
  if (typeof document === "undefined") {
    return null;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sameViewport(a: ViewportState, b: ViewportState): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.stableHeight === b.stableHeight &&
    a.isExpanded === b.isExpanded &&
    a.isTelegram === b.isTelegram
  );
}

/**
 * Tracks Telegram viewport changes so the shell height and sticky footers stay
 * attached (Story 2.8 AC1, POLISH-SPEC §2.7).
 */
export function useTelegramViewport(): ViewportState {
  const { isTelegramWebApp } = useTelegramRuntime();
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);

  useEffect(() => {
    const sync = () => {
      const webApp = window.Telegram?.WebApp;
      const inTelegram = Boolean(webApp);

      const height =
        (inTelegram ? webApp?.viewportHeight : null) ??
        readCssPx("--tg-viewport-height") ??
        window.innerHeight;
      const stableHeight =
        (inTelegram ? webApp?.viewportStableHeight : null) ??
        readCssPx("--tg-viewport-stable-height") ??
        window.innerHeight;

      const next: ViewportState = {
        width: window.innerWidth,
        height,
        stableHeight,
        isExpanded: webApp?.isExpanded ?? false,
        isTelegram: inTelegram,
      };
      setViewport((previous) => (sameViewport(previous, next) ? previous : next));
    };

    sync();
    const rafId = window.requestAnimationFrame(sync);

    const webApp = window.Telegram?.WebApp;
    webApp?.onEvent?.("viewportChanged", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      window.cancelAnimationFrame(rafId);
      webApp?.offEvent?.("viewportChanged", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [isTelegramWebApp]);

  return viewport;
}
