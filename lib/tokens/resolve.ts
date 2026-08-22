/**
 * Turning cache rows plus a requested mint set into answers and a work list.
 *
 * Kept pure and out of Convex so the whole decision table — cache hit, stale
 * hit, negative hit, cross-cluster row, never-seen mint — is testable without a
 * database or a network. The Convex functions are deliberately thin wrappers
 * over these two calls.
 *
 * The shape of the answer matters as much as its content. Every mint the caller
 * asked about comes back with an explicit status, in the order asked. A payment
 * sheet must be able to tell "USDC, verified" from "we have never heard of this
 * mint" from "the registry is down", because those are three different things
 * to render and only the first may be paid from.
 */

import type { SolanaCluster } from "../solana/cluster";
import { canonicalMetadata, canonicalTokenByMint } from "./canonical";
import { classifyFreshness } from "./policy";
import {
  TOKEN_METADATA_FAILURE,
  TOKEN_SOURCE,
  isPlausibleMint,
  isValidDecimals,
  type RawTokenListEntry,
  type TokenLookupResult,
  type TokenMetadata,
  type TokenSource,
} from "./types";

/**
 * A cache row, in the shape the Convex table stores it.
 *
 * Mirrors the `tokenMetadata` table rather than importing its generated type,
 * so this module stays runnable in a plain unit test.
 */
export type TokenCacheRow = {
  cluster: SolanaCluster;
  mint: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoUri?: string;
  verified: boolean;
  source: TokenSource;
  existsOnChain?: boolean;
  fetchedAt: number;
  decimalsVerifiedAt?: number;
  updatedAt: number;
};

/** True when the row is a negative entry — asked, and no registry lists it. */
export function isNegativeRow(row: TokenCacheRow): boolean {
  return row.symbol === undefined || row.decimals === undefined;
}

/** Converts a positive cache row into the public metadata shape. */
export function metadataFromRow(row: TokenCacheRow): TokenMetadata | null {
  if (row.symbol === undefined || row.name === undefined || row.decimals === undefined) {
    return null;
  }
  return {
    mint: row.mint,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    logoURI: row.logoUri ?? null,
    verified: row.verified,
    provenance: {
      source: row.source,
      cluster: row.cluster,
      fetchedAt: row.fetchedAt,
      decimalsVerifiedAt: row.decimalsVerifiedAt ?? null,
    },
  };
}

export type ResolveInput = {
  /** Mints the caller asked about, in the order it wants them back. */
  requested: readonly string[];
  /** Rows already in the cache. Rows for other clusters are ignored, not trusted. */
  cached: readonly TokenCacheRow[];
  cluster: SolanaCluster;
  now: number;
  /** Drop unverified tokens from the results entirely. */
  verifiedOnly?: boolean;
};

export type ResolveOutput = {
  results: TokenLookupResult[];
  /** Mints with no usable row: worth a registry fetch. */
  missingMints: string[];
  /** Mints with a row past its freshness window: worth a background refresh. */
  staleMints: string[];
  /** Mints whose decimals have never been proven against the chain. */
  unprovenMints: string[];
};

/**
 * Answers a batch from cache and reports what needs fetching.
 *
 * Never performs I/O and never fails: an unusable input mint produces an
 * `unavailable` result rather than an exception, because one malformed mint in
 * a wallet listing should not blank the whole sheet.
 */
export function resolveFromCache(input: ResolveInput): ResolveOutput {
  const byMint = new Map<string, TokenCacheRow>();
  for (const row of input.cached) {
    // A row from another cluster is not stale data, it is the wrong token.
    // Dropping it here means it can never be served, only overwritten.
    if (row.cluster === input.cluster) {
      byMint.set(row.mint, row);
    }
  }

  const results: TokenLookupResult[] = [];
  const missingMints: string[] = [];
  const staleMints: string[] = [];
  const unprovenMints: string[] = [];
  const seen = new Set<string>();

  for (const mint of input.requested) {
    if (seen.has(mint)) {
      continue;
    }
    seen.add(mint);

    if (!isPlausibleMint(mint)) {
      results.push({
        status: "unavailable",
        mint,
        code: TOKEN_METADATA_FAILURE.UNKNOWN_MINT,
      });
      continue;
    }

    const row = byMint.get(mint);

    if (!row) {
      // The pins answer for a mint the registry has never been asked about.
      // This is what makes devnet USDC nameable with no registry at all.
      const pin = canonicalTokenByMint(mint, input.cluster);
      if (pin) {
        results.push({
          status: "ok",
          metadata: canonicalMetadata({
            token: pin,
            cluster: input.cluster,
            fetchedAt: input.now,
          }),
        });
        // Still queued: the pin supplies the label, but only a chain read can
        // supply the decimals proof the transact gate requires.
        missingMints.push(mint);
        unprovenMints.push(mint);
        continue;
      }
      missingMints.push(mint);
      results.push({ status: "unknown", mint, existsOnChain: false, decimals: null });
      continue;
    }

    if (isNegativeRow(row)) {
      // Known-unlisted. Chain decimals, when we have them, are enough for the
      // sheet to render an amount beside a truncated mint — and not enough for
      // `assertTransactable`, which is the intended asymmetry.
      if (classifyFreshness(rowProvenance(row), input.now) !== "fresh") {
        staleMints.push(mint);
      }
      results.push({
        status: "unknown",
        mint,
        existsOnChain: row.existsOnChain === true,
        decimals: isValidDecimals(row.decimals) ? row.decimals : null,
      });
      continue;
    }

    const metadata = metadataFromRow(row);
    if (!metadata) {
      missingMints.push(mint);
      results.push({
        status: "unavailable",
        mint,
        code: TOKEN_METADATA_FAILURE.SOURCE_MALFORMED,
      });
      continue;
    }

    const freshness = classifyFreshness(metadata, input.now);
    if (freshness !== "fresh") {
      staleMints.push(mint);
    }
    if (metadata.provenance.decimalsVerifiedAt === null) {
      unprovenMints.push(mint);
    }

    if (freshness === "expired") {
      // A record this old is not evidence of anything. Refusing it is what
      // makes a silently-broken refresh visible instead of indefinitely served.
      results.push({ status: "unavailable", mint, code: TOKEN_METADATA_FAILURE.STALE });
      continue;
    }

    if (input.verifiedOnly && !metadata.verified) {
      // Deliberately reported as unavailable-because-unverified rather than
      // omitted: a sheet that silently drops a token the payer can see in their
      // wallet looks broken. It should say why.
      results.push({
        status: "unavailable",
        mint,
        code: TOKEN_METADATA_FAILURE.UNVERIFIED,
      });
      continue;
    }

    results.push({ status: "ok", metadata });
  }

  return { results, missingMints, staleMints, unprovenMints };
}

/** Minimal metadata-shaped view of a row, for the freshness helpers. */
function rowProvenance(row: TokenCacheRow): TokenMetadata {
  return {
    mint: row.mint,
    symbol: row.symbol ?? "",
    name: row.name ?? "",
    decimals: row.decimals ?? 0,
    logoURI: row.logoUri ?? null,
    verified: row.verified,
    provenance: {
      source: row.source,
      cluster: row.cluster,
      fetchedAt: row.fetchedAt,
      decimalsVerifiedAt: row.decimalsVerifiedAt ?? null,
    },
  };
}

export type ChainReconciliation = {
  /** Entries whose decimals the chain confirmed, or did not contradict. */
  entries: RawTokenListEntry[];
  /** Mints where the registry and the chain disagreed. Never transactable. */
  conflicts: Array<{ mint: string; listDecimals: number; chainDecimals: number }>;
};

/**
 * Drops registry entries the chain contradicts.
 *
 * A conflict is a rejection for that mint, but not for the batch. `assertDecimals-
 * MatchChain` throws, which is right on the single-mint transact path and wrong
 * here: one bad registry row would blank every token in a payer's wallet. The
 * offending mint is removed instead, so it falls through to a negative row —
 * unverified, unnamed, and refused by `assertTransactable` — while its
 * neighbours are unaffected.
 *
 * A mint the chain says is not a mint at all is also dropped. Whatever the
 * registry believes it listed, there is nothing there to transact.
 */
export function reconcileEntriesWithChain(input: {
  entries: readonly RawTokenListEntry[];
  chainDecimals: ReadonlyMap<string, number | null>;
}): ChainReconciliation {
  const entries: RawTokenListEntry[] = [];
  const conflicts: ChainReconciliation["conflicts"] = [];

  for (const entry of input.entries) {
    if (!input.chainDecimals.has(entry.mint)) {
      // Never read. The entry is kept for display; the absent proof is what
      // keeps it off the transact path.
      entries.push(entry);
      continue;
    }
    const chain = input.chainDecimals.get(entry.mint);
    if (chain === null || chain === undefined) {
      conflicts.push({ mint: entry.mint, listDecimals: entry.decimals, chainDecimals: -1 });
      continue;
    }
    if (chain !== entry.decimals) {
      conflicts.push({
        mint: entry.mint,
        listDecimals: entry.decimals,
        chainDecimals: chain,
      });
      continue;
    }
    entries.push(entry);
  }

  return { entries, conflicts };
}

export type BuildRowsInput = {
  /** The mints that were asked about — the domain of the result. */
  requested: readonly string[];
  /** Registry entries, already reconciled against the pins. */
  entries: readonly RawTokenListEntry[];
  /**
   * Chain-read decimals per mint. `null` means the account was read and is not
   * a mint; absent means it was not read.
   */
  chainDecimals: ReadonlyMap<string, number | null>;
  cluster: SolanaCluster;
  now: number;
};

/**
 * Builds the rows to upsert after a refresh.
 *
 * Every requested mint produces a row, including the ones no registry listed —
 * that negative row is what stops a payer's obscure token from re-triggering a
 * registry call on every render.
 *
 * Decimals are written from the chain when the chain was read, and a registry
 * value that disagrees is not silently overwritten: the caller reconciles that
 * with `assertDecimalsMatchChain` before it gets here, so a mismatch has
 * already thrown. What arrives here has either been proven or never checked.
 */
export function buildTokenRows(input: BuildRowsInput): TokenCacheRow[] {
  const entryByMint = new Map(input.entries.map((entry) => [entry.mint, entry]));
  const rows: TokenCacheRow[] = [];

  for (const mint of new Set(input.requested)) {
    if (!isPlausibleMint(mint)) {
      continue;
    }

    const proven = input.chainDecimals.get(mint);
    const provenDecimals = typeof proven === "number" ? proven : undefined;
    const chainWasRead = input.chainDecimals.has(mint);
    const pin = canonicalTokenByMint(mint, input.cluster);
    const entry = entryByMint.get(mint);

    const base = {
      cluster: input.cluster,
      mint,
      existsOnChain: chainWasRead ? proven !== null : undefined,
      fetchedAt: input.now,
      decimalsVerifiedAt: provenDecimals === undefined ? undefined : input.now,
      updatedAt: input.now,
    };

    if (pin) {
      rows.push({
        ...base,
        symbol: pin.symbol,
        name: pin.name,
        decimals: pin.decimals,
        logoUri: entry?.logoURI ?? undefined,
        verified: true,
        source: TOKEN_SOURCE.CLUSTER_PIN,
      });
      continue;
    }

    if (entry) {
      rows.push({
        ...base,
        symbol: entry.symbol,
        name: entry.name,
        decimals: entry.decimals,
        logoUri: entry.logoURI ?? undefined,
        verified: entry.verified,
        source: TOKEN_SOURCE.JUPITER,
      });
      continue;
    }

    // Negative row. `verified: false` is not a judgement about the token, it is
    // the only honest value: nobody vouched for it.
    rows.push({
      ...base,
      decimals: provenDecimals,
      verified: false,
      source: TOKEN_SOURCE.CHAIN,
    });
  }

  return rows;
}
