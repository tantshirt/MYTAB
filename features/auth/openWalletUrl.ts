import { buildWalletOpenHopUrl } from "@/lib/wallet/openNamedWallet";

/**
 * Leave Telegram for a named wallet. Prefer our HTTPS hop so the installed
 * app opens; fall back to the raw URL only when it is not a named host.
 */
export function openWalletUrl(url: string): void {
  const hop = buildWalletOpenHopUrl(url);
  const target = hop ?? url;
  const webApp = window.Telegram?.WebApp as { openLink?: (href: string) => void } | undefined;
  if (typeof webApp?.openLink === "function") {
    webApp.openLink(target);
    return;
  }
  window.location.assign(target);
}
