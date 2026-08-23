/**
 * Open Phantom / Solflare / Backpack from a Telegram Mini App (U-10).
 *
 * Telegram `openLink` only reliably opens HTTPS. Universal links from that
 * browser often land on the wallet's website. The Mini App therefore opens
 * our `/wallet/open` hop; that page assigns the custom scheme / Android
 * intent. Do not invent a fourth named wallet.
 */

import { isNamedWalletProvider, type NamedWalletProvider } from "./providers";
import { UNIVERSAL_LINK_HOSTS } from "./universalLinks";

export const WALLET_OPEN_PATH = "/wallet/open";

export const NAMED_WALLET_SCHEME_BASE: Record<NamedWalletProvider, string> = {
  phantom: "phantom://v1",
  solflare: "solflare://ul/v1",
  backpack: "backpack://ul/v1",
};

/** Play-store application ids used in Android intent URLs. */
export const NAMED_WALLET_ANDROID_PACKAGE: Record<NamedWalletProvider, string> = {
  phantom: "app.phantom",
  solflare: "com.solflare.mobile",
  backpack: "app.backpack.mobile",
};

export const NAMED_WALLET_HTTPS_HOST: Record<NamedWalletProvider, string> = {
  phantom: "phantom.app",
  solflare: "solflare.com",
  backpack: "backpack.app",
};

const HTTPS_UL_PREFIX: Record<NamedWalletProvider, string> = {
  phantom: `${UNIVERSAL_LINK_HOSTS.phantom}/`,
  solflare: `${UNIVERSAL_LINK_HOSTS.solflare}/`,
  backpack: `${UNIVERSAL_LINK_HOSTS.backpack}/`,
};

export type NamedWalletOpenUrls = {
  provider: NamedWalletProvider;
  https: string;
  scheme: string;
  androidIntent: string;
};

export function providerFromUniversalLink(url: string): NamedWalletProvider | null {
  for (const provider of Object.keys(HTTPS_UL_PREFIX) as NamedWalletProvider[]) {
    if (url.startsWith(HTTPS_UL_PREFIX[provider])) {
      return provider;
    }
  }
  return null;
}

function pathAndQueryAfterHost(httpsUrl: string, provider: NamedWalletProvider): string | null {
  const prefix = HTTPS_UL_PREFIX[provider];
  if (!httpsUrl.startsWith(prefix)) {
    return null;
  }
  return httpsUrl.slice(UNIVERSAL_LINK_HOSTS[provider].length);
}

export function buildNamedWalletOpenUrls(httpsUrl: string): NamedWalletOpenUrls | null {
  const provider = providerFromUniversalLink(httpsUrl);
  if (!provider) {
    return null;
  }
  const suffix = pathAndQueryAfterHost(httpsUrl, provider);
  if (!suffix || !suffix.startsWith("/")) {
    return null;
  }

  const scheme = `${NAMED_WALLET_SCHEME_BASE[provider]}${suffix}`;
  const parsed = new URL(httpsUrl);
  const intentPath = `${parsed.pathname}${parsed.search}`;
  const androidIntent =
    `intent://${intentPath.slice(1)}#Intent;` +
    `scheme=https;host=${NAMED_WALLET_HTTPS_HOST[provider]};` +
    `package=${NAMED_WALLET_ANDROID_PACKAGE[provider]};end`;

  return { provider, https: httpsUrl, scheme, androidIntent };
}

export function isAllowedNamedWalletHttps(url: string): boolean {
  return buildNamedWalletOpenUrls(url) !== null;
}

export function parseWalletOpenSearch(search: string): NamedWalletOpenUrls | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const providerRaw = params.get("provider") ?? "";
  // URLSearchParams already decodes once. A second decodeURIComponent would
  // collapse `app_url=https%3A%2F%2F…` inside the wallet UL into a different URL.
  const httpsUrl = params.get("u") ?? "";
  if (!isNamedWalletProvider(providerRaw) || !httpsUrl) {
    return null;
  }
  const built = buildNamedWalletOpenUrls(httpsUrl);
  if (!built || built.provider !== providerRaw) {
    return null;
  }
  return built;
}

export function buildWalletOpenHopUrl(httpsUrl: string, origin = ""): string | null {
  const built = buildNamedWalletOpenUrls(httpsUrl);
  if (!built) {
    return null;
  }
  const base =
    origin || (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) {
    return null;
  }
  const params = new URLSearchParams({
    provider: built.provider,
    u: httpsUrl,
  });
  return `${base.replace(/\/$/, "")}${WALLET_OPEN_PATH}?${params.toString()}`;
}
