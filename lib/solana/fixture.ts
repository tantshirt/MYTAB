import {
  FIXTURE_BLOCKHASH,
  FIXTURE_LAST_VALID_BLOCK_HEIGHT,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
} from "./constants";
import {
  assertFixturePathAllowed,
  fixturePathAllowed,
} from "./runtimeGuard";

export type FixtureBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
};

/**
 * True only when fixture mode is explicitly enabled AND this is not a real
 * deployment. A missing `SOLANA_RPC_URL` no longer implies fixture mode — that
 * silent degradation is what let a stub stand in for chain state on a deployed
 * environment.
 */
export function isSolanaFixtureMode(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return fixturePathAllowed(env);
}

/**
 * Resolves the Privy-managed sponsor fee-payer address.
 *
 * Fails closed: with no configured sponsor address this throws
 * `LIVE_CREDENTIAL_MISSING` rather than quietly substituting a fixture wallet
 * that nobody funds and nobody can sign with.
 */
export function resolveSponsorWalletAddress(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured =
    env.PRIVY_SPONSOR_WALLET_ADDRESS?.trim() ||
    env.PRIVY_SPONSOR_ADDRESS?.trim();
  if (configured) {
    return configured;
  }
  assertFixturePathAllowed("solana.resolveSponsorWalletAddress", env);
  return FIXTURE_SPONSOR_WALLET_ADDRESS;
}

/** Deterministic blockhash pair for fixture builds. Guarded — never on a deployment. */
export function resolveFixtureBlockhash(
  env: Record<string, string | undefined> = process.env,
): FixtureBlockhash {
  assertFixturePathAllowed("solana.resolveFixtureBlockhash", env);
  return {
    blockhash: FIXTURE_BLOCKHASH,
    lastValidBlockHeight: FIXTURE_LAST_VALID_BLOCK_HEIGHT,
  };
}
