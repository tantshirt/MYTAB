"use client";

import { useEffect, useState } from "react";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

export type ViewportState = {
  width: number;
  height: number;
  stableHeight: number;
  isExpanded: boolean;
};

const DEFAULT_VIEWPORT: ViewportState = {
  width: 390,
  height: 700,
  stableHeight: 700,
  isExpanded: false,
};

/**
 * Tracks Telegram viewport changes so sticky footers stay attached (Story 2.8 AC1).
 */
export function useTelegramViewport(): ViewportState {
  const { isTelegramWebApp } = useTelegramRuntime();
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);

  useEffect(() => {
    if (!isTelegramWebApp) {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        stableHeight: window.innerHeight,
        isExpanded: false,
      });
      return;
    }

    const webApp = window.Telegram?.WebApp as
      | {
          viewportHeight?: number;
          viewportStableHeight?: number;
          isExpanded?: boolean;
          onEvent?: (event: string, handler: () => void) => void;
          offEvent?: (event: string, handler: () => void) => void;
        }
      | undefined;

    const sync = () => {
      setViewport({
        width: window.innerWidth,
        height: webApp?.viewportHeight ?? window.innerHeight,
        stableHeight: webApp?.viewportStableHeight ?? window.innerHeight,
        isExpanded: webApp?.isExpanded ?? false,
      });
    };

    sync();
    webApp?.onEvent?.("viewportChanged", sync);
    window.addEventListener("resize", sync);

    return () => {
      webApp?.offEvent?.("viewportChanged", sync);
      window.removeEventListener("resize", sync);
    };
  }, [isTelegramWebApp]);

  return viewport;
}
