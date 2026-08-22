/**
 * Token metadata types — the shape everything else in `lib/tokens` agrees on.
 *
 * The product settles in USDC but a payer may pay *from* any token they hold,
 * so a payment sheet has to name those tokens. DFlow's `/tokens` endpoint
 * carries mints and decimals and nothing else (4.59M entries, 215 MB, no
 * pagination — see `docs/dflow-api-reference.md` §7.1), so symbols, names,
 * logos and above all *verification* have to come from a curated registry.
 *
 * Three rules shape every type here:
 *
 *  1. **Decimals are chain truth, not list metadata.** A registry's `decimals`
 *     is a claim. The mint account's byte 44 is the fact. Any mint we are about
 *     to transact carries `decimalsVerifiedAt` proving the two agreed, and a
 *     disagreement is a rejection — a decimals error is an amount wrong by
 *     orders of magnitude, not a cosmetic defect.
 *  2. **Verification is a safety property.** Solana lets anyone mint a token
 *     called "USDC". `verified` is the bit that separates Circle's mint from a
 *     lookalike, and the payment sheet defaults to verified-only.
 *  3. **Provenance travels with the data.** Every record says which source it
 *     came from, which cluster it belongs to, and when it was fetched, so a
 *     stale or cross-cluster record can be detected rather than trusted.
 */

import type { SolanaCluster } from "../solana/cluster";

/**
 * Where a metadata record came from.
 *
 * `cluster_pin` outranks everything: those entries are compiled into
 * `lib/solana/cluster.ts` and are the definition of correct for this product.
 * A registry that disagrees with a pin is wrong, and saying so is the whole
 * point of tracking the source.
 */
export const TOKEN_SOURCE = {
  /** Hard-pinned in `lib/solana/cluster.ts`. Authoritative; never overridable. */
  CLUSTER_PIN: "cluster_pin",
  /** Jupiter Token API V2 — the curated Solana registry. */
  JUPITER: "jupiter",
  /** Read directly off the mint account (decimals; Token-2022 metadata). */
  CHAIN: "chain",
} as const;

export type TokenSource = (typeof TOKEN_SOURCE)[keyof typeof TOKEN_SOURCE];

/** Why we believe a record, and how old that belief is. */
export type TokenProvenance = {
  source: TokenSource;
  /**
   * The cluster this record describes. Load-bearing: devnet USDC and mainnet
   * USDC are different mints, and a mainnet list served to devnet would name
   * the wrong one. Every read asserts this matches the active cluster.
   */
  cluster: SolanaCluster;
  /** When the record was fetched from its source (epoch ms). */
  fetchedAt: number;
  /**
   * When `decimals` was last proven equal to the mint account on chain.
   * `null` means never — such a record may be *displayed* but must not be
   * used to scale an amount we are about to transact.
   */
  decimalsVerifiedAt: number | null;
};

/**
 * One token, as the rest of the app sees it.
 *
 * `decimals` is used for display scaling only. Amounts stay integer atomic
 * units end to end; this number tells a formatter where to put the point, and
 * is never itself multiplied into a float.
 */
export type TokenMetadata = {
  /** Base58 mint address. The identity — symbol and name are labels. */
  mint: string;
  symbol: string;
  name: string;
  /** 0-18. Chain truth once `provenance.decimalsVerifiedAt` is set. */
  decimals: number;
  /**
   * Logo URL, or null when the source carries none.
   *
   * NOTE: `DESIGN.md` line 246 bans token logos from the UI ("Don't put a
   * token logo, a price chart, a portfolio value, or a network selector
   * anywhere") and line 223 repeats it for the token chip. The data is exposed
   * because the product owner asked for it; whether any surface renders it is
   * a design decision, not this module's.
   */
  logoURI: string | null;
  /**
   * True only when the source vouches for this mint as the genuine token of
   * that name. Anything false is a lookalike candidate and must be visibly
   * marked wherever it appears.
   */
  verified: boolean;
  provenance: TokenProvenance;
};

export const TOKEN_METADATA_FAILURE = {
  /** No record for this mint in the cache, and the registry does not list it. */
  UNKNOWN_MINT: "TOKEN_METADATA_UNKNOWN_MINT",
  /** The registry could not be reached or answered unusably. */
  SOURCE_UNAVAILABLE: "TOKEN_METADATA_SOURCE_UNAVAILABLE",
  /** The registry answered, but not in the documented shape. */
  SOURCE_MALFORMED: "TOKEN_METADATA_SOURCE_MALFORMED",
  /** Cached record is older than the freshness window for its use. */
  STALE: "TOKEN_METADATA_STALE",
  /** Record belongs to a different cluster than the one we are running on. */
  CLUSTER_MISMATCH: "TOKEN_METADATA_CLUSTER_MISMATCH",
  /** The registry contradicted a mint pinned in `lib/solana/cluster.ts`. */
  CANONICAL_CONFLICT: "TOKEN_METADATA_CANONICAL_CONFLICT",
  /** List decimals and mint-account decimals disagree. Never transact. */
  DECIMALS_MISMATCH: "TOKEN_METADATA_DECIMALS_MISMATCH",
  /** Decimals have not been proven against chain for a mint we would transact. */
  DECIMALS_UNVERIFIED: "TOKEN_METADATA_DECIMALS_UNVERIFIED",
  /** The mint account does not exist, or is not an SPL mint at all. */
  NOT_A_MINT: "TOKEN_METADATA_NOT_A_MINT",
  /** Known and on chain, but unverified — refused on a verified-only path. */
  UNVERIFIED: "TOKEN_METADATA_UNVERIFIED",
} as const;

export type TokenMetadataFailureCode =
  (typeof TOKEN_METADATA_FAILURE)[keyof typeof TOKEN_METADATA_FAILURE];

export class TokenMetadataError extends Error {
  constructor(
    readonly code: TokenMetadataFailureCode,
    detail?: string,
    /** Present when the failure is attributable to one mint. */
    readonly mint?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "TokenMetadataError";
  }
}

/**
 * What a caller gets back for a mint it asked about.
 *
 * Deliberately a discriminated union rather than `TokenMetadata | null`: the
 * payment sheet renders "unknown token" and "list is down" differently, and
 * both differently again from "known but unverified". Collapsing them to null
 * is how a UI ends up showing a bare mint address and letting the user pay.
 */
export type TokenLookupResult =
  | { status: "ok"; metadata: TokenMetadata }
  | {
      status: "unknown";
      mint: string;
      /** True when the mint account exists on chain but no registry lists it. */
      existsOnChain: boolean;
      /** Chain decimals, when we managed to read them. Enough to display. */
      decimals: number | null;
    }
  | { status: "unavailable"; mint: string; code: TokenMetadataFailureCode };

/** A registry entry before it has been reconciled against pins and chain. */
export type RawTokenListEntry = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string | null;
  verified: boolean;
};

/** Bounds on a decimals value, checked before it can scale anything. */
export const MIN_TOKEN_DECIMALS = 0;
/** SPL mints cannot exceed u8 in the account, and no real token exceeds 18. */
export const MAX_TOKEN_DECIMALS = 18;

export function isValidDecimals(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_TOKEN_DECIMALS &&
    value <= MAX_TOKEN_DECIMALS
  );
}

/** Base58, 32 bytes — 32 to 44 characters, no 0/O/I/l. */
const BASE58_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isPlausibleMint(value: unknown): value is string {
  return typeof value === "string" && BASE58_MINT.test(value);
}
