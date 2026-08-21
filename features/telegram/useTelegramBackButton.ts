"use client";

import { useEffect } from "react";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

type BackButtonHandler = () => void;

/**
 * Wires Telegram BackButton with a single back control (Story 2.8 AC2).
 */
export function useTelegramBackButton(onBack: BackButtonHandler, enabled = true) {
  const { isTelegramWebApp } = useTelegramRuntime();

  useEffect(() => {
    if (!isTelegramWebApp || !enabled) {
      return;
    }

    const webApp = window.Telegram?.WebApp as
      | {
          BackButton?: {
            show: () => void;
            hide: () => void;
            onClick: (handler: BackButtonHandler) => void;
            offClick: (handler: BackButtonHandler) => void;
          };
        }
      | undefined;

    const backButton = webApp?.BackButton;
    if (!backButton) {
      return;
    }

    backButton.show();
    backButton.onClick(onBack);

    return () => {
      backButton.offClick(onBack);
      backButton.hide();
    };
  }, [isTelegramWebApp, enabled, onBack]);
}

export type HapticStyle = "light" | "medium" | "success";

/**
 * Sanctioned haptic moments only (Story 2.8 AC3).
 */
export function triggerTelegramHaptic(style: HapticStyle): void {
  if (typeof window === "undefined") {
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    return;
  }

  const webApp = window.Telegram?.WebApp as
    | {
        HapticFeedback?: {
          impactOccurred: (style: "light" | "medium" | "heavy") => void;
          notificationOccurred: (type: "success" | "warning" | "error") => void;
        };
      }
    | undefined;

  if (!webApp?.HapticFeedback) {
    return;
  }

  if (style === "success") {
    webApp.HapticFeedback.notificationOccurred("success");
    return;
  }

  webApp.HapticFeedback.impactOccurred(style);
}
