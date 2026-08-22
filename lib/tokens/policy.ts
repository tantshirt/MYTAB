/**
 * Freshness windows and the fail-closed gate for transacting a token.
 *
 * Two different questions get two different answers here, and conflating them
 * is the mistake this module exists to prevent:
 *
 *  - *May I show this token to the user?* Lenient. A day-old symbol is fine;
 *    refusing to render a name because a cron missed a beat is a worse product
 *    than a slightly stale label.
 *  - *May I move money denominated in this token?* Strict. The mint must be
 *    known, verified, on the active cluster, and its decimals must have been
 *    proven against the chain. Anything short of that is a rejection — never a
 *    "show the mint address and continue", which is precisely how a payer ends
 *    up approving a lookalike.
 *
 * Note on decimals and time: a mint's decimals are fixed at `InitializeMint`
 * and the SPL Token program provides no instruction to change them, so a proof
 * does not decay in reality. The re-proof window below is not about the chain
 * changing its mind; it is about not trusting a cache row indefinitely, since
 * the row is the mutable part.
 */

import { resolveCluster, type SolanaCluster } from "../solana/cluster";
import {
  TOKEN_METADATA_FAILURE,
  TokenMetadataError,
  type TokenMetadata,
} from "./types";

/**
 * Below this age a cached record is served as-is with no refresh attempt.
 * Symbols, names and logos are near-static; six hours is generous and keeps
 * the registry request rate near zero.
 */
export const TOKEN_METADATA_FRESH_MS = 6 * 60 * 60 * 1000;

/**
 * Above this age a record is no longer served for display at all. A week of
 * silence means the refresh path is broken, and a broken refresh should surface
 * as a visible degradation rather than as indefinitely-served old data.
 */
export const TOKEN_METADATA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a chain decimals proof stands before the transact gate demands a
 * fresh one. Thirty days: long enough that the settlement path essentially
 * never blocks on it, short enough that a corrupted row cannot live forever.
 */
export const DECIMALS_PROOF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type Freshness = "fresh" | "stale" | "expired";

export function classifyFreshness(
  metadata: TokenMetadata,
  now: number,
  windows: { freshMs?: number; maxAgeMs?: number } = {},
): Freshness {
  const freshMs = windows.freshMs ?? TOKEN_METADATA_FRESH_MS;
  const maxAgeMs = windows.maxAgeMs ?? TOKEN_METADATA_MAX_AGE_MS;
  const age = now - metadata.provenance.fetchedAt;

  // A clock skew that puts the record in the future is treated as fresh rather
  // than as an error; the alternative is an outage caused by a drifting clock.
  if (age < freshMs) {
    return "fresh";
  }
  if (age < maxAgeMs) {
    return "stale";
  }
  return "expired";
}

/** True when a background refresh should be attempted for this record. */
export function shouldRefresh(metadata: TokenMetadata, now: number): boolean {
  return classifyFreshness(metadata, now) !== "fresh";
}

export function isDecimalsProofValid(
  metadata: TokenMetadata,
  now: number,
  maxAgeMs: number = DECIMALS_PROOF_MAX_AGE_MS,
): boolean {
  const provenAt = metadata.provenance.decimalsVerifiedAt;
  if (provenAt === null) {
    return false;
  }
  return now - provenAt < maxAgeMs;
}

export type TransactGateOptions = {
  now: number;
  cluster?: SolanaCluster;
  /**
   * Allow an unverified mint through. Off by default and intended only for a
   * path where the user has explicitly acknowledged the risk on an unverified
   * token — never as a convenience to make a test pass.
   */
  allowUnverified?: boolean;
  decimalsProofMaxAgeMs?: number;
};

/**
 * The gate every path that is about to build a transaction must pass through.
 *
 * Throws `TokenMetadataError` on refusal, returns the proven decimals on
 * success. Returning the decimals rather than a boolean is deliberate: the
 * caller needs that number to scale the display amount, and taking it from the
 * gate's return value makes it impossible to scale with an unproven one.
 */
export function assertTransactable(
  metadata: TokenMetadata | null | undefined,
  options: TransactGateOptions,
): number {
  const cluster = options.cluster ?? resolveCluster();

  if (!metadata) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.UNKNOWN_MINT,
      "no metadata for the mint being transacted",
    );
  }

  if (metadata.provenance.cluster !== cluster) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.CLUSTER_MISMATCH,
      `${metadata.mint} metadata is for ${metadata.provenance.cluster}, running on ${cluster}`,
      metadata.mint,
    );
  }

  if (!options.allowUnverified && !metadata.verified) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.UNVERIFIED,
      `${metadata.mint} (${metadata.symbol}) is not a verified token`,
      metadata.mint,
    );
  }

  if (!isDecimalsProofValid(metadata, options.now, options.decimalsProofMaxAgeMs)) {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.DECIMALS_UNVERIFIED,
      `${metadata.mint} decimals have not been proven against the chain recently enough`,
      metadata.mint,
    );
  }

  if (classifyFreshness(metadata, options.now) === "expired") {
    throw new TokenMetadataError(
      TOKEN_METADATA_FAILURE.STALE,
      `${metadata.mint} metadata is older than the maximum age`,
      metadata.mint,
    );
  }

  return metadata.decimals;
}
