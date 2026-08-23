/**
 * U-10 — wallet-standard first where it is injected. Telegram Mini App is a
 * WebView on every OS and has no Safari extension wallets.
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

export function isTelegramWebView(userAgent = ""): boolean {
  if (typeof window !== "undefined") {
    const webApp = (window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram
      ?.WebApp;
    if (webApp && typeof webApp.initData === "string" && webApp.initData.length > 0) {
      return true;
    }
  }
  const ua = userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /Telegram/i.test(ua);
}

/**
 * True when we must use Phantom / Solflare / Backpack universal links.
 * Injected wallet-standard wins first at the call site. Telegram WebView
 * (iOS and Android) and iOS Safari have no injection.
 */
export function needsUniversalLinkWallet(
  userAgent = "",
  telegramWebView?: boolean,
): boolean {
  if (telegramWebView ?? isTelegramWebView(userAgent)) {
    return true;
  }
  return isAppleTouchDevice(userAgent);
}
