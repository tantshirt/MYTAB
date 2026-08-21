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
