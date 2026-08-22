"use client";

import { useEffect, useState } from "react";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type AppSafeArea = SafeAreaInsets & {
  /**
   * The inset free of *Telegram's own* chrome (header, bottom bar). Distinct
   * from the device inset above, which is notch/home-indicator only.
   * Bot API 8.0; falls back to the device inset on older clients.
   */
  content: SafeAreaInsets;
};

const ZERO_INSETS: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

const ZERO_SAFE_AREA: AppSafeArea = { ...ZERO_INSETS, content: ZERO_INSETS };

const EDGES = ["top", "bottom", "left", "right"] as const;
type Edge = (typeof EDGES)[number];

/**
 * A single hidden probe, created once and kept, used only to resolve
 * `env(safe-area-inset-*)` on clients that do not inject Telegram's CSS
 * variables. The previous implementation built and destroyed one on every
 * resize event.
 */
let envProbe: HTMLDivElement | null = null;

function getEnvProbe(): HTMLDivElement | null {
  if (typeof document === "undefined" || !document.body) {
    return null;
  }
  if (envProbe?.isConnected) {
    return envProbe;
  }
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.dataset.mytabSafeAreaProbe = "";
  probe.style.cssText = [
    "position:fixed",
    "top:env(safe-area-inset-top, 0px)",
    "bottom:env(safe-area-inset-bottom, 0px)",
    "left:env(safe-area-inset-left, 0px)",
    "right:env(safe-area-inset-right, 0px)",
    "visibility:hidden",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");
  document.body.appendChild(probe);
  envProbe = probe;
  return probe;
}

function readEnvInsets(): SafeAreaInsets {
  const probe = getEnvProbe();
  if (!probe) {
    return ZERO_INSETS;
  }
  const rect = probe.getBoundingClientRect();
  return {
    top: Math.max(0, rect.top),
    bottom: Math.max(0, window.innerHeight - rect.bottom),
    left: Math.max(0, rect.left),
    right: Math.max(0, window.innerWidth - rect.right),
  };
}

/** Telegram injects `--tg-safe-area-inset-*` / `--tg-content-safe-area-inset-*` natively (Bot API 8.0). */
function readCssVar(styles: CSSStyleDeclaration, name: string): number | null {
  const raw = styles.getPropertyValue(name).trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function pickNumber(...candidates: Array<number | null | undefined>): number | null {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.max(0, candidate);
    }
  }
  return null;
}

/**
 * Resolves both insets, preferring Telegram's native CSS variables, then the
 * JS payload, then the `env()` probe. Safe to call outside Telegram.
 */
export function readSafeArea(): AppSafeArea {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return ZERO_SAFE_AREA;
  }

  const webApp = window.Telegram?.WebApp;
  const styles = getComputedStyle(document.documentElement);
  const envInsets = readEnvInsets();

  const device = { ...ZERO_INSETS };
  const content = { ...ZERO_INSETS };

  for (const edge of EDGES) {
    const deviceValue = pickNumber(
      readCssVar(styles, `--tg-safe-area-inset-${edge}`),
      webApp?.safeAreaInset?.[edge as Edge],
      envInsets[edge],
    );
    device[edge] = deviceValue ?? 0;

    const contentValue = pickNumber(
      readCssVar(styles, `--tg-content-safe-area-inset-${edge}`),
      webApp?.contentSafeAreaInset?.[edge as Edge],
    );
    // Pre-8.0 clients expose no content inset at all; the device inset is the
    // closest truth available there.
    content[edge] = contentValue ?? device[edge];
  }

  return { ...device, content };
}

function sameInsets(a: SafeAreaInsets, b: SafeAreaInsets): boolean {
  return EDGES.every((edge) => a[edge] === b[edge]);
}

function sameSafeArea(a: AppSafeArea, b: AppSafeArea): boolean {
  return sameInsets(a, b) && sameInsets(a.content, b.content);
}

/**
 * Reads Telegram's device and content safe-area insets, with an `env()`
 * fallback, and re-reads on every event that can change them: Telegram's own
 * `safeAreaChanged` / `contentSafeAreaChanged` / `viewportChanged`, plus
 * rotation and window resize (POLISH-SPEC §2.7).
 *
 * State only changes when a value actually changes, so a stream of viewport
 * ticks does not re-render consumers.
 */
export function useSafeAreaInsets(): AppSafeArea {
  // Re-subscribe once the SDK has been found by the runtime provider's poll.
  const { isTelegramWebApp } = useTelegramRuntime();
  const [safeArea, setSafeArea] = useState<AppSafeArea>(ZERO_SAFE_AREA);

  useEffect(() => {
    let rafId = 0;
    let timeoutId = 0;

    const sync = () => {
      const next = readSafeArea();
      setSafeArea((previous) => (sameSafeArea(previous, next) ? previous : next));
    };

    sync();
    // Telegram publishes its CSS variables slightly after the SDK appears, and
    // `expand()` moves the content inset — re-read once the frame settles.
    rafId = window.requestAnimationFrame(sync);
    timeoutId = window.setTimeout(sync, 300);

    const webApp = window.Telegram?.WebApp;
    const events = ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged"] as const;
    for (const event of events) {
      webApp?.onEvent?.(event, sync);
    }
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      for (const event of events) {
        webApp?.offEvent?.(event, sync);
      }
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [isTelegramWebApp]);

  return safeArea;
}
