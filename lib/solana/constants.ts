import { PublicKey, Keypair } from "@solana/web3.js";
import { createHash } from "node:crypto";

/** Mainnet USDC mint — locked for P0 settlement (AD-22). */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Wrapped SOL mint at the DFlow router boundary (FR-T4). */
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const COMPUTE_BUDGET_PROGRAM_ID =
  "ComputeBudget111111111111111111111111111111";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export const USDC_DECIMALS = 6;

export const PLATFORM_FEE_BPS = 0;

/** sponsor-v1 per-intent lamport caps (AD-17). */
export const SPONSOR_V1_POLICY_VERSION = "sponsor-v1";
export const SPONSOR_MAX_LAMPORTS_PER_INTENT = 3_000_000;
export const SPONSOR_MAX_PRIORITY_FEE_LAMPORTS = 250_000;
export const SPONSOR_MAX_ATA_RENT_LAMPORTS = 2_500_000;
export const SPONSOR_MAX_COMPUTE_UNITS = 1_400_000;
export const SPONSOR_MAX_ATA_CREATES = 1;

/** Fixture blockhash used when SOLANA_RPC_URL is absent. */
export const FIXTURE_BLOCKHASH = "11111111111111111111111111111111";
export const FIXTURE_LAST_VALID_BLOCK_HEIGHT = 999_999_999;

function fixtureAddress(label: string): string {
  const seed = createHash("sha256").update(`mytab-fixture:${label}`).digest().subarray(0, 32);
  return Keypair.fromSeed(seed).publicKey.toBase58();
}

/** Fixture payer wallet aligned with convex/internal/privy.ts. */
export const FIXTURE_PAYER_WALLET_ADDRESS = fixtureAddress("mytab-fixture-payer");

/** Fixture recipient wallet for offline builds/tests. */
export const FIXTURE_RECIPIENT_WALLET_ADDRESS = fixtureAddress("mytab-fixture-recipient");

/** Fixture sponsor wallet when PRIVY_SPONSOR_WALLET_ADDRESS is absent. */
export const FIXTURE_SPONSOR_WALLET_ADDRESS = fixtureAddress("mytab-fixture-sponsor");

/** Typical ATA creation rent in fixture mode (within sponsor cap). */
export const FIXTURE_ATA_RENT_LAMPORTS = 2_039_280;
