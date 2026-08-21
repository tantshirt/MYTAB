import type { PrivyClientConfig } from "@privy-io/react-auth";

/** Public Privy app id — the only client-side Privy secret (AD-19). */
export function getPrivyAppId(): string | null {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  return appId && appId.length > 0 ? appId : null;
}

/** True when NEXT_PUBLIC_PRIVY_APP_ID is absent — local dev and tests use fixture auth. */
export function isPrivyFixtureMode(): boolean {
  return getPrivyAppId() === null;
}

/** Convex deployment URL for the browser client, or null when unset. */
export function getConvexUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  return url && url.length > 0 ? url : null;
}

/** True when NEXT_PUBLIC_CONVEX_URL is absent — local dev skips the Convex client. */
export function isConvexFixtureMode(): boolean {
  return getConvexUrl() === null;
}

/** True when Privy or Convex fixture mode is active (mock viewer, no JWT bridge). */
export function isConvexAuthFixtureMode(): boolean {
  return isPrivyFixtureMode() || isConvexFixtureMode();
}

/**
 * Privy client config for zero-click Telegram login with an embedded Solana wallet.
 * No external wallet connectors in P0 (FR-A1, FR-W1).
 */
export function createPrivyConfig(): PrivyClientConfig {
  return {
    loginMethods: ["telegram"],
    appearance: {
      showWalletLoginFirst: false,
      walletChainType: "solana-only",
    },
    embeddedWallets: {
      solana: {
        createOnLogin: "users-without-wallets",
      },
    },
  };
}

/**
 * Resolves the Privy app id or returns a fail-closed fixture placeholder.
 * Callers must branch on {@link isPrivyFixtureMode} before mounting PrivyProvider.
 */
export function resolvePrivyAppId(): string {
  return getPrivyAppId() ?? "privy-fixture-app-id";
}
