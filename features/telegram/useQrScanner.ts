"use client";

import { useCallback, useState } from "react";
import { resolveStartParamDestination } from "./useStartParamRoute";
import { useTelegramRuntime } from "./TelegramRuntimeProvider";

export const QR_SCAN_FAILURE = {
  UNAVAILABLE: "QR_SCANNER_UNAVAILABLE",
  MALFORMED: "QR_INVITE_MALFORMED",
} as const;

/** Accepts only a My Tab-style Telegram Mini App URL with an opaque tab token. */
export function tabTokenFromScannedQr(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.hostname !== "t.me") return null;
    const startParam = url.searchParams.get("startapp");
    if (!startParam) return null;
    const destination = resolveStartParamDestination(startParam);
    return destination.kind === "tab-token" ? destination.token : null;
  } catch {
    return null;
  }
}

export function tabPathForScannedToken(token: string): string {
  return `/tabs/${encodeURIComponent(token)}`;
}

type QrScannerApp = {
  showScanQrPopup?: (params: { text?: string }, callback: (data: string) => boolean | void) => void;
  closeScanQrPopup?: () => void;
};

/** Native popup lifecycle, extracted so capability/error/close/forward are executable tests. */
export function runQrScan(
  app: QrScannerApp | undefined,
  onToken: (token: string) => void,
  setError: (error: string | null) => void,
): boolean {
  if (!app?.showScanQrPopup) {
    setError("QR scanning is unavailable here. Open My Tab in Telegram and try again.");
    return false;
  }
  setError(null);
  try {
    app.showScanQrPopup({ text: "Scan a My Tab invite" }, (data) => {
      const token = tabTokenFromScannedQr(data);
      let closeFailed = false;
      try {
        app.closeScanQrPopup?.();
      } catch {
        closeFailed = true;
      }
      if (!token) {
        setError("That QR is not a My Tab invite. Ask for a new invite and scan again.");
        return true;
      }
      if (closeFailed) {
        setError("The scanner could not close cleanly. Your invite is still opening.");
      }
      try {
        onToken(token);
      } catch {
        setError("Couldn't open that invite. Try scanning it again.");
      }
      return true;
    });
  } catch {
    setError("Could not open the QR scanner. Close My Tab and try again.");
    return false;
  }
  return true;
}

/** The shipped popup-to-router boundary used by the home-page scan control. */
export function runInviteQrScan(
  app: QrScannerApp | undefined,
  push: (path: string) => void,
  setError: (error: string | null) => void,
): boolean {
  return runQrScan(app, (token) => push(tabPathForScannedToken(token)), setError);
}

export function useQrScanner(push: (path: string) => void): {
  available: boolean;
  scan: () => void;
  error: string | null;
} {
  const runtime = useTelegramRuntime();
  const [error, setError] = useState<string | null>(null);
  const available =
    runtime.isTelegramWebApp &&
    runtime.isVersionAtLeast("6.4") &&
    typeof window !== "undefined" &&
    typeof window.Telegram?.WebApp?.showScanQrPopup === "function";

  const scan = useCallback(() => {
    const app = window.Telegram?.WebApp;
    runInviteQrScan(available ? app : undefined, push, setError);
  }, [available, push]);

  return { available, scan, error };
}
