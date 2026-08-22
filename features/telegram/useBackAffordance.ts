"use client";

import { useEffect } from "react";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";
import { BOT_API_VERSION, safeInvoke, versionAtLeast } from "./telegramChrome";

type BackButtonHandler = () => void;

type TelegramBackButton = {
  show: () => void;
  hide: () => void;
  onClick: (handler: BackButtonHandler) => void;
  offClick: (handler: BackButtonHandler) => void;
};

/** The live `WebApp.BackButton`, or `null` on a client that has no usable one. */
function readBackButton(): TelegramBackButton | null {
  if (typeof window === "undefined") {
    return null;
  }
  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    return null;
  }
  // BackButton landed with the same release as the header-colour key (6.1).
  if (!versionAtLeast(webApp, BOT_API_VERSION.headerColorKey)) {
    return null;
  }
  const backButton = webApp.BackButton as TelegramBackButton | undefined;
  if (
    !backButton ||
    typeof backButton.show !== "function" ||
    typeof backButton.onClick !== "function"
  ) {
    return null;
  }
  return backButton;
}

export type BackAffordance = {
  /**
   * `true` only when Telegram's own BackButton is unavailable. The two are
   * never both on screen (EXPERIENCE, §2.4).
   */
  showInAppChevron: boolean;
};

export type UseBackAffordanceOptions = {
  /** What "back" means on this surface. Keep it referentially stable. */
  onBack: BackButtonHandler;
  /** Set `false` to suspend the affordance without unmounting the surface. */
  enabled?: boolean;
};

/**
 * The single back affordance (POLISH-SPEC §2.4).
 *
 * Inside Telegram this drives the native `BackButton` and returns
 * `showInAppChevron: false`, so the surface draws no chevron of its own and the
 * header row becomes title-only. Outside Telegram — or on a client too old to
 * have a BackButton — it returns `true` and the surface renders the 24px
 * chevron at the 16px gutter.
 *
 * Android's system back gesture is already mapped to `BackButton` by Telegram,
 * so there is nothing extra to handle.
 *
 * Never call this on the three tab roots: they have no back. `AppShellRoot`
 * asserts `BackButton.hide()` there so a stale button cannot survive a
 * navigation out of a deeper surface.
 */
export function useBackAffordance({
  onBack,
  enabled = true,
}: UseBackAffordanceOptions): BackAffordance {
  const { isTelegramWebApp } = useTelegramRuntime();

  useEffect(() => {
    if (!isTelegramWebApp || !enabled) {
      return;
    }
    const backButton = readBackButton();
    if (!backButton) {
      return;
    }

    safeInvoke("BackButton.show", () => backButton.show());
    safeInvoke("BackButton.onClick", () => backButton.onClick(onBack));

    return () => {
      safeInvoke("BackButton.offClick", () => backButton.offClick(onBack));
      safeInvoke("BackButton.hide", () => backButton.hide());
    };
  }, [isTelegramWebApp, enabled, onBack]);

  // Outside Telegram there is no native control to defer to, so the surface
  // draws its own. Inside Telegram the chevron is dropped even on the tick
  // before the effect has run: `isTelegramWebApp` is what decides, not whether
  // `show()` has already landed.
  return { showInAppChevron: !isTelegramWebApp };
}

/**
 * Asserts the BackButton is hidden while `active` (POLISH-SPEC §2.4).
 *
 * Used by the shell on the three tab roots. A surface that navigates to a tab
 * root by replacing history rather than unmounting cleanly would otherwise
 * leave a back arrow pointing at nothing.
 */
export function useHiddenTelegramBackButton(active: boolean): void {
  const { isTelegramWebApp } = useTelegramRuntime();

  useEffect(() => {
    if (!active || !isTelegramWebApp) {
      return;
    }
    const backButton = readBackButton();
    if (!backButton) {
      return;
    }
    safeInvoke("BackButton.hide", () => backButton.hide());
  }, [active, isTelegramWebApp]);
}
