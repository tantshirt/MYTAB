import {
  FIXTURE_BLOCKHASH,
  FIXTURE_LAST_VALID_BLOCK_HEIGHT,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
} from "./constants";

export type FixtureBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
};

/** True when no live Solana RPC URL is configured — offline build/validate only. */
export function isSolanaFixtureMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.SOLANA_RPC_URL?.trim();
}

/** Resolves the Privy-managed sponsor fee-payer address for the active environment. */
export function resolveSponsorWalletAddress(env: NodeJS.ProcessEnv = process.env): string {
  const configured =
    env.PRIVY_SPONSOR_WALLET_ADDRESS?.trim() ??
    env.PRIVY_SPONSOR_ADDRESS?.trim();
  if (configured) {
    return configured;
  }
  return FIXTURE_SPONSOR_WALLET_ADDRESS;
}

/** Returns a deterministic blockhash pair for fixture builds (no RPC). */
export function resolveFixtureBlockhash(): FixtureBlockhash {
  return {
    blockhash: FIXTURE_BLOCKHASH,
    lastValidBlockHeight: FIXTURE_LAST_VALID_BLOCK_HEIGHT,
  };
}
