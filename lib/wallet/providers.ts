/**
 * Named external wallets (D-28) plus the unnamed wallet-standard admission.
 * Do not invent a fourth named wallet (U-10).
 */

export const EXTERNAL_WALLET_PROVIDERS = [
  "phantom",
  "solflare",
  "backpack",
  "standard",
] as const;

export type ExternalWalletProvider = (typeof EXTERNAL_WALLET_PROVIDERS)[number];

export const NAMED_WALLET_PROVIDERS = ["phantom", "solflare", "backpack"] as const;

export type NamedWalletProvider = (typeof NAMED_WALLET_PROVIDERS)[number];

export const NAMED_WALLET_LABELS: Record<NamedWalletProvider, string> = {
  phantom: "Phantom",
  solflare: "Solflare",
  backpack: "Backpack",
};

export function isExternalWalletProvider(value: string): value is ExternalWalletProvider {
  return (EXTERNAL_WALLET_PROVIDERS as readonly string[]).includes(value);
}

export function isNamedWalletProvider(value: string): value is NamedWalletProvider {
  return (NAMED_WALLET_PROVIDERS as readonly string[]).includes(value);
}

/** Map a wallet-standard name onto a stored provider. Unknown names become `standard`. */
export function providerFromWalletName(name: string): ExternalWalletProvider {
  const lowered = name.trim().toLowerCase();
  if (lowered.includes("phantom")) {
    return "phantom";
  }
  if (lowered.includes("solflare")) {
    return "solflare";
  }
  if (lowered.includes("backpack")) {
    return "backpack";
  }
  return "standard";
}
