/**
 * U-10 — wallet-standard first where it exists; iOS Telegram WebView has none.
 */

export function isAppleTouchDevice(userAgent = ""): boolean {
  const ua = userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/iPad|iPhone|iPod/.test(ua)) {
    return true;
  }
  if (typeof navigator !== "undefined") {
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }
  return /Macintosh/.test(ua) && /Mobile/.test(ua);
}

/**
 * True when this WebView cannot host a Safari Web Extension wallet.
 * Telegram Mini App on iOS is the load-bearing case (U-10).
 */
export function needsUniversalLinkWallet(userAgent = ""): boolean {
  return isAppleTouchDevice(userAgent);
}
