/**
 * Telegram Mini App chrome control (POLISH-SPEC §2.1, §2.6).
 *
 * Every Bot API method used here landed in a different release, and the Telegram
 * client throws `WebAppMethodUnsupported` when an unknown method is invoked. Each
 * call is therefore gated on `WebApp.isVersionAtLeast()` and wrapped so that an
 * older client degrades silently instead of breaking the render.
 *
 * Browser-safe: no `window` access at module scope.
 */

import { MYTAB_COLORS } from "@/lib/theme/tokens";
import type { TelegramWebApp } from "./TelegramRuntimeProvider";

/** Bot API version in which each capability became available. */
export const BOT_API_VERSION = {
  /** setHeaderColor with a themeParams key ("bg_color" | "secondary_bg_color"). */
  headerColorKey: "6.1",
  /** setBackgroundColor accepts #RRGGBB or a themeParams key. */
  backgroundColor: "6.1",
  /** disableClosingConfirmation / enableClosingConfirmation. */
  closingConfirmation: "6.2",
  /** setHeaderColor accepts an arbitrary #RRGGBB value. */
  headerColorHex: "6.9",
  /** disableVerticalSwipes / enableVerticalSwipes. */
  verticalSwipes: "7.7",
  /** setBottomBarColor and SecondaryButton. */
  bottomBarColor: "7.10",
  /** safeAreaInset / contentSafeAreaInset and their change events. */
  safeArea: "8.0",
} as const;

/** The two bottom-bar values the product uses — never more (§2.1). */
export type BottomBarSurface = "surface" | "paper";

export const BOTTOM_BAR_COLORS: Record<BottomBarSurface, string> = {
  surface: MYTAB_COLORS.surface,
  paper: MYTAB_COLORS.paper,
};

function compareVersions(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = Number.parseInt(left[i] ?? "0", 10) || 0;
    const r = Number.parseInt(right[i] ?? "0", 10) || 0;
    if (l !== r) {
      return l > r ? 1 : -1;
    }
  }
  return 0;
}

/**
 * `WebApp.isVersionAtLeast` where available, with a local comparison against
 * `WebApp.version` as a fallback. Never throws.
 */
export function versionAtLeast(
  webApp: Pick<TelegramWebApp, "version" | "isVersionAtLeast"> | null | undefined,
  target: string,
): boolean {
  if (!webApp) {
    return false;
  }
  try {
    if (typeof webApp.isVersionAtLeast === "function") {
      return Boolean(webApp.isVersionAtLeast(target));
    }
  } catch {
    // Fall through to the local comparison.
  }
  return compareVersions(webApp.version ?? "6.0", target) >= 0;
}

/** Runs a Mini App method, swallowing WebAppMethodUnsupported and friends. */
export function safeInvoke(label: string, run: () => void): boolean {
  try {
    run();
    return true;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug(`[telegram] ${label} unsupported on this client`, error);
    }
    return false;
  }
}

function hexToRgb(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const int = Number.parseInt(match[1]!, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/**
 * On Bot API 6.1–6.8 `setHeaderColor` accepts only `bg_color` or
 * `secondary_bg_color`. Pick whichever of the two the client currently paints
 * closest to paper so the seam is as small as the old client allows.
 */
export function nearestThemeColorKey(
  themeParams: Record<string, unknown> | null | undefined,
  target: string = MYTAB_COLORS.paper,
): "bg_color" | "secondary_bg_color" {
  const goal = hexToRgb(target);
  if (!goal || !themeParams) {
    return "bg_color";
  }

  let bestKey: "bg_color" | "secondary_bg_color" = "bg_color";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const key of ["bg_color", "secondary_bg_color"] as const) {
    const raw = themeParams[key];
    if (typeof raw !== "string") {
      continue;
    }
    const rgb = hexToRgb(raw);
    if (!rgb) {
      continue;
    }
    const distance =
      (rgb[0] - goal[0]) ** 2 + (rgb[1] - goal[1]) ** 2 + (rgb[2] - goal[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = key;
    }
  }

  return bestKey;
}

/**
 * Bottom-bar colour is per-surface (§2.1) but the value has to survive a
 * `themeChanged` re-assert, so the current desire is held here rather than in
 * React state.
 */
let desiredBottomBarColor: string = BOTTOM_BAR_COLORS.surface;

export function getDesiredBottomBarColor(): string {
  return desiredBottomBarColor;
}

export function applyBottomBarColor(
  webApp: TelegramWebApp | null | undefined,
  color: string,
): void {
  desiredBottomBarColor = color;
  if (!webApp || typeof webApp.setBottomBarColor !== "function") {
    return;
  }
  if (!versionAtLeast(webApp, BOT_API_VERSION.bottomBarColor)) {
    return;
  }
  safeInvoke("setBottomBarColor", () => webApp.setBottomBarColor!(color));
}

/**
 * Everything the app asserts about Telegram's own chrome. Idempotent — called at
 * bootstrap and again on every `themeChanged`, because Telegram re-asserts its
 * own colours when the user switches theme.
 *
 * The app is light-mode only and unconditionally paper; `themeParams` is read
 * only to choose the least-bad key on pre-6.9 clients.
 */
export function applyTelegramChrome(webApp: TelegramWebApp | null | undefined): void {
  if (!webApp) {
    return;
  }

  // Header — arbitrary hex needs 6.9; 6.1–6.8 accept only themeParams keys.
  if (typeof webApp.setHeaderColor === "function") {
    if (versionAtLeast(webApp, BOT_API_VERSION.headerColorHex)) {
      safeInvoke("setHeaderColor(hex)", () => webApp.setHeaderColor!(MYTAB_COLORS.paper));
    } else if (versionAtLeast(webApp, BOT_API_VERSION.headerColorKey)) {
      const key = nearestThemeColorKey(webApp.themeParams);
      safeInvoke("setHeaderColor(key)", () => webApp.setHeaderColor!(key));
    }
  }

  // Background — accepts #RRGGBB from 6.1.
  if (
    typeof webApp.setBackgroundColor === "function" &&
    versionAtLeast(webApp, BOT_API_VERSION.backgroundColor)
  ) {
    safeInvoke("setBackgroundColor", () => webApp.setBackgroundColor!(MYTAB_COLORS.paper));
  }

  // Bottom bar — 7.10.
  applyBottomBarColor(webApp, desiredBottomBarColor);

  // Vertical swipe-to-close — 7.7. Not cosmetic: without this a downward drag
  // mid-claim minimises the app and loses the in-flight input.
  if (
    typeof webApp.disableVerticalSwipes === "function" &&
    versionAtLeast(webApp, BOT_API_VERSION.verticalSwipes)
  ) {
    safeInvoke("disableVerticalSwipes", () => webApp.disableVerticalSwipes!());
  }

  // Closing confirmation — 6.2. Never enabled: Payment Progress promises that
  // closing is safe, so a confirmation dialog would make that copy a lie.
  if (
    typeof webApp.disableClosingConfirmation === "function" &&
    versionAtLeast(webApp, BOT_API_VERSION.closingConfirmation)
  ) {
    safeInvoke("disableClosingConfirmation", () => webApp.disableClosingConfirmation!());
  }

  // The product never shows Telegram's own buttons (§2.5). Assert hidden so a
  // stale button from a previous session cannot survive.
  if (webApp.MainButton && typeof webApp.MainButton.hide === "function") {
    safeInvoke("MainButton.hide", () => webApp.MainButton!.hide());
  }
  if (
    webApp.SecondaryButton &&
    typeof webApp.SecondaryButton.hide === "function" &&
    versionAtLeast(webApp, BOT_API_VERSION.bottomBarColor)
  ) {
    safeInvoke("SecondaryButton.hide", () => webApp.SecondaryButton!.hide());
  }

  // Always expanded, never fullscreen (§2.6).
  if (typeof webApp.expand === "function") {
    safeInvoke("expand", () => webApp.expand());
  }
}
