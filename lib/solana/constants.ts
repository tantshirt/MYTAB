import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256Bytes } from "../crypto/convexCrypto";
import { bytesToBase58 } from "./decodeTransaction";
import {
  getClusterConfig,
  resolveCluster,
  resolveDflowAggregatorProgramId,
  resolveUsdcMint,
  resolveWrappedSolMint,
  type SolanaCluster,
} from "./cluster";

export {
  resolveCluster,
  resolveUsdcMint,
  resolveWrappedSolMint,
  resolveDflowAggregatorProgramId,
  getClusterConfig,
  type SolanaCluster,
};

/**
 * USDC mint for the ACTIVE cluster (AD-22).
 *
 * Never a hardcoded mainnet literal: `SOLANA_CLUSTER` selects it, and every
 * allowlist rule asserts "exactly the configured mint for this cluster". A
 * transaction carrying the other cluster's mint is a rejection, not a warning.
 */
export const USDC_MINT: string = resolveUsdcMint();

/** Wrapped SOL at the DFlow router boundary (FR-T4). Same on every cluster. */
export const WRAPPED_SOL_MINT: string = resolveWrappedSolMint();

/** DFlow Aggregator v4 for the active cluster, read from config, never inlined. */
export const DFLOW_AGGREGATOR_PROGRAM_ID: string =
  resolveDflowAggregatorProgramId();

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const COMPUTE_BUDGET_PROGRAM_ID =
  "ComputeBudget111111111111111111111111111111";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const SYSVAR_RENT_PUBKEY =
  "SysvarRent111111111111111111111111111111111";

export const USDC_DECIMALS = 6;

export const PLATFORM_FEE_BPS = 0;

/** sponsor-v1 per-intent lamport caps (AD-17). Integer lamports only. */
export const SPONSOR_V1_POLICY_VERSION = "sponsor-v1";
export const SPONSOR_MAX_LAMPORTS_PER_INTENT = 3_000_000;
export const SPONSOR_MAX_PRIORITY_FEE_LAMPORTS = 250_000;
export const SPONSOR_MAX_ATA_RENT_LAMPORTS = 2_500_000;
export const SPONSOR_MAX_COMPUTE_UNITS = 1_400_000;
export const SPONSOR_MAX_ATA_CREATES = 1;

/**
 * Chain default compute-unit budget when no SetComputeUnitLimit is present:
 * 200,000 CU per instruction, capped at the per-transaction maximum. Used to
 * price a priority fee whose CU limit an attacker deliberately omitted.
 */
export const DEFAULT_COMPUTE_UNITS_PER_INSTRUCTION = 200_000;

/** Rent-exempt minimum for a 165-byte SPL token account. */
export const ATA_RENT_LAMPORTS = 2_039_280;

/** @deprecated fixture-era alias; identical value, kept for existing callers. */
export const FIXTURE_ATA_RENT_LAMPORTS = ATA_RENT_LAMPORTS;

/** Deterministic blockhash used only by explicitly enabled fixture builds. */
export const FIXTURE_BLOCKHASH = "11111111111111111111111111111111";
export const FIXTURE_LAST_VALID_BLOCK_HEIGHT = 999_999_999;

/**
 * Deterministic fixture wallet addresses.
 *
 * These are real ed25519 public keys derived from a fixed seed so that fixture
 * transactions are byte-identical to production ones. Nobody holds the private
 * key material, and every path that resolves one of these as a live address is
 * behind `assertFixturePathAllowed`.
 */
function fixtureAddress(label: string): string {
  const seed = sha256Bytes(`mytab-fixture:${label}`).slice(0, 32);
  return bytesToBase58(ed25519.getPublicKey(seed));
}

export const FIXTURE_PAYER_WALLET_ADDRESS = fixtureAddress("mytab-fixture-payer");
export const FIXTURE_RECIPIENT_WALLET_ADDRESS = fixtureAddress(
  "mytab-fixture-recipient",
);
export const FIXTURE_SPONSOR_WALLET_ADDRESS = fixtureAddress(
  "mytab-fixture-sponsor",
);
