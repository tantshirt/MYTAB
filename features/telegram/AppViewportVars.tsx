"use client";

import { useEffect } from "react";
import { useSafeAreaInsets } from "./useSafeAreaInsets";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";
import { useTelegramViewport } from "./useTelegramViewport";

/**
 * Keeps `--app-pad-top`, `--app-pad-bottom` and `--app-height` accurate
 * (POLISH-SPEC §2.7).
 *
 * `MYTAB_VIEWPORT_CSS` already defines all three declaratively, which is what
 * makes them correct before hydration and in a plain browser. This component
 * exists for the clients that expose the numbers through JS but not through CSS
 * variables — Telegram Desktop and Web notably lag on `--tg-*` injection — and
 * writes resolved pixel values onto the root element in that case.
 *
 * It renders nothing, so the viewport ticks that re-render it cost nothing.
 */
export function AppViewportVars(): null {
  const { isTelegramWebApp } = useTelegramRuntime();
  const safeArea = useSafeAreaInsets();
  const viewport = useTelegramViewport();

  useEffect(() => {
    const root = document.documentElement;

    const write = (name: string, value: string | null) => {
      if (value === null) {
        root.style.removeProperty(name);
      } else {
        root.style.setProperty(name, value);
      }
    };

    write("--app-pad-top", `${safeArea.content.top}px`);
    write("--app-pad-bottom", `${safeArea.bottom}px`);
    write("--app-pad-left", `${Math.max(safeArea.left, safeArea.content.left)}px`);
    write("--app-pad-right", `${Math.max(safeArea.right, safeArea.content.right)}px`);

    // Outside Telegram the stable height is just `window.innerHeight`, which
    // freezes while a mobile browser's address bar animates. Let CSS `100dvh`
    // own that case instead.
    write(
      "--app-height",
      isTelegramWebApp && viewport.stableHeight > 0 ? `${viewport.stableHeight}px` : null,
    );

    return () => {
      for (const name of [
        "--app-pad-top",
        "--app-pad-bottom",
        "--app-pad-left",
        "--app-pad-right",
        "--app-height",
      ]) {
        root.style.removeProperty(name);
      }
    };
  }, [isTelegramWebApp, safeArea, viewport]);

  return null;
}
