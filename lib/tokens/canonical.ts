/**
 * The mints this product pins, and the rule that no list may contradict them.
 *
 * `lib/solana/cluster.ts` compiles in the USDC mint per cluster and the wrapped
 * SOL mint. Those are not "our best guess at USDC" — they are the definition of
 * USDC for My Tab: the settlement path validates every payout against
 * `resolveUsdcMint()`, so if a registry ever named a different address as USDC,
 * the registry would be describing a token this product will not accept.
 *
 * The failure mode being closed here is specific. A lookalike mint carrying the
 * symbol "USDC" is a classic Solana drain: the payer sees a familiar label,
 * approves, and sends value to a worthless token. Two guards stop it:
 *
 *  1. **Symbol squatting** — any *other* mint claiming a pinned symbol is
 *     stripped of that symbol and forced unverified, whatever the list says.
 *  2. **Pin contradiction** — a list entry for a pinned *mint* whose decimals
 *     disagree with the pin fails loudly. That is a corrupt registry, and
 *     silently preferring our value would hide it.
 *
 * The pins also solve a bootstrapping problem: devnet USDC
 * (`4zMMC9...ncDU`) is a test mint that no mainnet registry lists. Without a
 * pin, devnet would have no metadata for the one token it must settle in.
 */

import {
  getClusterConfig,
  resolveCluster,
  type SolanaCluster,
} from "../solana/cluster";
import {
  TOKEN_METADATA_FAILURE,
  TOKEN_SOURCE,
  TokenMetadataError,
  type RawTokenListEntry,
  type TokenMetadata,
} from "./types";

/**
 * Wrapped SOL is the same mint on every cluster and is universally listed, so
 * only its label is pinned; its decimals still come from the pin because the
 * value is a protocol constant, not a registry opinion.
 */
const WRAPPED_SOL_DECIMALS = 9;

export type CanonicalToken = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
};

/**
 * The pinned set for a cluster.
 *
 * Deliberately tiny. A pin is a promise that this product will reject anything
 * that disagrees, so only mints the settlement path already asserts against
 * belong here.
 */
export function canonicalTokensFor(cluster: SolanaCluster): CanonicalToken[] {
  const config = getClusterConfig(cluster);
  return [
    {
      mint: config.usdcMint,
      symbol: "USDC",
      name: cluster === "devnet" ? "USD Coin (Devnet)" : "USD Coin",
      decimals: config.usdcDecimals,
    },
    {
      mint: config.wrappedSolMint,
      symbol: "SOL",
      name: "Solana",
      decimals: WRAPPED_SOL_DECIMALS,
    },
  ];
}

export function canonicalTokenByMint(
  mint: string,
  cluster: SolanaCluster = resolveCluster(),
): CanonicalToken | undefined {
  return canonicalTokensFor(cluster).find((token) => token.mint === mint);
}

/** Symbols that only their pinned mint may use. Upper-cased for comparison. */
export function reservedSymbols(cluster: SolanaCluster): Map<string, string> {
  const reserved = new Map<string, string>();
  for (const token of canonicalTokensFor(cluster)) {
    reserved.set(token.symbol.toUpperCase(), token.mint);
  }
  return reserved;
}

/**
 * Turns a pin into a metadata record.
 *
 * `verified: true` and no logo. The pin's authority is that the settlement path
 * enforces it, which is a stronger claim than any registry's tag; and there is
 * no logo to carry because a compiled-in URL would be one more thing to rot.
 * A logo, if a surface ever wants one, arrives from the registry entry for the
 * same mint via {@link mergeCanonicalWithListEntry}.
 */
export function canonicalMetadata(input: {
  token: CanonicalToken;
  cluster: SolanaCluster;
  fetchedAt: number;
  logoURI?: string | null;
  decimalsVerifiedAt?: number | null;
}): TokenMetadata {
  return {
    mint: input.token.mint,
    symbol: input.token.symbol,
    name: input.token.name,
    decimals: input.token.decimals,
    logoURI: input.logoURI ?? null,
    verified: true,
    provenance: {
      source: TOKEN_SOURCE.CLUSTER_PIN,
      cluster: input.cluster,
      fetchedAt: input.fetchedAt,
      decimalsVerifiedAt: input.decimalsVerifiedAt ?? null,
    },
  };
}

/**
 * Reconciles one registry entry against the pins.
 *
 * Returns the entry to store. Throws only when the registry contradicts a pin
 * on a *pinned mint* — that is a corrupt or wrong-cluster list and continuing
 * would mean quietly transacting against data we have just proven unreliable.
 *
 * A squatted symbol does NOT throw. Lookalikes are expected background noise on
 * a permissionless chain; there are thousands, and one appearing in the list is
 * not evidence the list is broken. It is neutralised in place instead: the
 * symbol is replaced with a non-confusable form and `verified` is forced false.
 */
export function reconcileWithCanonical(input: {
  entry: RawTokenListEntry;
  cluster: SolanaCluster;
}): RawTokenListEntry {
  const { entry, cluster } = input;
  const pin = canonicalTokenByMint(entry.mint, cluster);

  if (pin) {
    if (entry.decimals !== pin.decimals) {
      throw new TokenMetadataError(
        TOKEN_METADATA_FAILURE.CANONICAL_CONFLICT,
        `${entry.mint} is pinned as ${pin.symbol} with ${pin.decimals} decimals ` +
          `but the registry reports ${entry.decimals}. The pin in lib/solana/cluster.ts ` +
          `is authoritative; the registry is wrong or is for another cluster.`,
        entry.mint,
      );
    }
    // The pin wins on symbol, name and verification; the registry may still
    // contribute a logo, which is the one field a pin does not carry.
    return {
      mint: pin.mint,
      symbol: pin.symbol,
      name: pin.name,
      decimals: pin.decimals,
      logoURI: entry.logoURI,
      verified: true,
    };
  }

  const reservedMint = reservedSymbols(cluster).get(entry.symbol.toUpperCase());
  if (reservedMint && reservedMint !== entry.mint) {
    // Not the pinned mint, but wearing its symbol. Strip the disguise.
    return {
      ...entry,
      symbol: `${entry.symbol.toUpperCase()} (unverified)`,
      verified: false,
    };
  }

  return entry;
}

/**
 * Asserts a whole registry snapshot agrees with the pins before any of it is
 * cached. Fails the entire refresh rather than storing a half-trusted list.
 *
 * Also asserts the pinned mints are actually *present*: a mainnet list served
 * to devnet would contain neither devnet USDC nor a devnet-shaped anything, and
 * "the list simply omits our settlement token" is exactly the cross-cluster
 * mix-up this check exists to catch. Devnet pins are exempt — no public
 * registry lists devnet test mints, and requiring it would make devnet
 * permanently unrefreshable.
 */
export function assertSnapshotAgreesWithCanonical(input: {
  entries: readonly RawTokenListEntry[];
  cluster: SolanaCluster;
}): void {
  const byMint = new Map(input.entries.map((entry) => [entry.mint, entry]));

  for (const pin of canonicalTokensFor(input.cluster)) {
    const entry = byMint.get(pin.mint);
    if (!entry) {
      if (input.cluster === "devnet") {
        continue;
      }
      throw new TokenMetadataError(
        TOKEN_METADATA_FAILURE.CANONICAL_CONFLICT,
        `registry snapshot omits pinned mint ${pin.mint} (${pin.symbol}) on ${input.cluster}; ` +
          `this is very likely the wrong cluster's list`,
        pin.mint,
      );
    }
    if (entry.decimals !== pin.decimals) {
      throw new TokenMetadataError(
        TOKEN_METADATA_FAILURE.CANONICAL_CONFLICT,
        `registry says ${pin.mint} has ${entry.decimals} decimals; the pin says ${pin.decimals}`,
        pin.mint,
      );
    }
  }
}

/** Applies a registry logo to a pinned token without letting it change anything else. */
export function mergeCanonicalWithListEntry(input: {
  canonical: TokenMetadata;
  entry: RawTokenListEntry | undefined;
}): TokenMetadata {
  if (!input.entry) {
    return input.canonical;
  }
  return { ...input.canonical, logoURI: input.entry.logoURI };
}
