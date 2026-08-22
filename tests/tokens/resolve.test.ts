/**
 * The cache decision table, and what a payment sheet is told in each case.
 *
 * The five states that matter — hit, stale hit, expired hit, negative hit,
 * never-seen — must stay distinguishable all the way to the caller. Collapsing
 * any of them into "no metadata, show the mint address" is the failure this
 * module is built to prevent.
 */

import { describe, expect, it } from "vitest";
import {
  buildTokenRows,
  isNegativeRow,
  metadataFromRow,
  reconcileEntriesWithChain,
  resolveFromCache,
  type TokenCacheRow,
} from "../../lib/tokens/resolve";
import {
  TOKEN_METADATA_FAILURE,
  TOKEN_SOURCE,
  type RawTokenListEntry,
} from "../../lib/tokens/types";
import {
  TOKEN_METADATA_FRESH_MS,
  TOKEN_METADATA_MAX_AGE_MS,
  assertTransactable,
} from "../../lib/tokens/policy";
import { getClusterConfig } from "../../lib/solana/cluster";

const NOW = 1_800_000_000_000;
const USDC = getClusterConfig("mainnet-beta").usdcMint;
const DEVNET_USDC = getClusterConfig("devnet").usdcMint;
const WSOL = getClusterConfig("mainnet-beta").wrappedSolMint;
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const OBSCURE = "5EHZz9Qsw8AhQqSJTGjBkVLcbUeAeCVDLXbFLFvpump";

function row(overrides: Partial<TokenCacheRow> = {}): TokenCacheRow {
  return {
    cluster: "mainnet-beta",
    mint: BONK,
    symbol: "Bonk",
    name: "Bonk",
    decimals: 5,
    verified: true,
    source: TOKEN_SOURCE.JUPITER,
    fetchedAt: NOW - 1000,
    decimalsVerifiedAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...overrides,
  };
}

const base = { cluster: "mainnet-beta" as const, now: NOW };

describe("resolveFromCache", () => {
  it("serves a fresh hit and asks for no refresh", () => {
    const out = resolveFromCache({ ...base, requested: [BONK], cached: [row()] });
    expect(out.results[0]).toMatchObject({ status: "ok" });
    expect(out.missingMints).toEqual([]);
    expect(out.staleMints).toEqual([]);
  });

  it("serves a stale hit AND queues a refresh — a late cron is not an outage", () => {
    const stale = row({ fetchedAt: NOW - TOKEN_METADATA_FRESH_MS - 1 });
    const out = resolveFromCache({ ...base, requested: [BONK], cached: [stale] });
    expect(out.results[0]!.status).toBe("ok");
    expect(out.staleMints).toEqual([BONK]);
  });

  it("REFUSES an expired hit rather than serving indefinitely-old data", () => {
    const expired = row({ fetchedAt: NOW - TOKEN_METADATA_MAX_AGE_MS - 1 });
    const out = resolveFromCache({ ...base, requested: [BONK], cached: [expired] });
    expect(out.results[0]).toEqual({
      status: "unavailable",
      mint: BONK,
      code: TOKEN_METADATA_FAILURE.STALE,
    });
  });

  it("reports a never-seen mint as unknown and queues it", () => {
    const out = resolveFromCache({ ...base, requested: [OBSCURE], cached: [] });
    expect(out.results[0]).toEqual({
      status: "unknown",
      mint: OBSCURE,
      existsOnChain: false,
      decimals: null,
    });
    expect(out.missingMints).toEqual([OBSCURE]);
  });

  it("distinguishes 'exists on chain but in no list' from 'never heard of it'", () => {
    const negative = row({
      mint: OBSCURE,
      symbol: undefined,
      name: undefined,
      decimals: 9,
      verified: false,
      source: TOKEN_SOURCE.CHAIN,
      existsOnChain: true,
    });
    const out = resolveFromCache({ ...base, requested: [OBSCURE], cached: [negative] });
    expect(out.results[0]).toEqual({
      status: "unknown",
      mint: OBSCURE,
      // Real token, nobody vouches for it, and we know how to scale its amount.
      existsOnChain: true,
      decimals: 9,
    });
    expect(isNegativeRow(negative)).toBe(true);
  });

  it("does not re-fetch a fresh negative row", () => {
    const negative = row({ mint: OBSCURE, symbol: undefined, decimals: undefined });
    const out = resolveFromCache({ ...base, requested: [OBSCURE], cached: [negative] });
    expect(out.missingMints).toEqual([]);
    expect(out.staleMints).toEqual([]);
  });

  it("NEVER serves a row belonging to the other cluster", () => {
    const wrongCluster = row({ mint: USDC, cluster: "devnet", symbol: "USDC" });
    const out = resolveFromCache({ ...base, requested: [USDC], cached: [wrongCluster] });
    // Falls through to the pin, which is right for this mint on mainnet.
    expect(out.results[0]).toMatchObject({ status: "ok" });
    if (out.results[0]!.status === "ok") {
      expect(out.results[0]!.metadata.provenance.cluster).toBe("mainnet-beta");
    }
  });

  it("names a pinned mint with no cache row and no registry at all", () => {
    // This is devnet's entire situation: no registry lists its USDC.
    const out = resolveFromCache({
      requested: [DEVNET_USDC],
      cached: [],
      cluster: "devnet",
      now: NOW,
    });
    expect(out.results[0]).toMatchObject({ status: "ok" });
    if (out.results[0]!.status === "ok") {
      expect(out.results[0]!.metadata.symbol).toBe("USDC");
      expect(out.results[0]!.metadata.provenance.source).toBe(TOKEN_SOURCE.CLUSTER_PIN);
    }
    // Nameable, and still not payable until a chain read proves the decimals.
    expect(out.unprovenMints).toContain(DEVNET_USDC);
    if (out.results[0]!.status === "ok") {
      expect(() =>
        assertTransactable(out.results[0]!.status === "ok" ? out.results[0]!.metadata : null, {
          now: NOW,
          cluster: "devnet",
        }),
      ).toThrow(TOKEN_METADATA_FAILURE.DECIMALS_UNVERIFIED);
    }
  });

  it("reports an unverified token as unverified rather than silently dropping it", () => {
    const shady = row({ mint: OBSCURE, symbol: "usdc1", name: "usdc1", verified: false });
    const out = resolveFromCache({
      ...base,
      requested: [OBSCURE],
      cached: [shady],
      verifiedOnly: true,
    });
    expect(out.results[0]).toEqual({
      status: "unavailable",
      mint: OBSCURE,
      code: TOKEN_METADATA_FAILURE.UNVERIFIED,
    });
  });

  it("passes an unverified token through when verifiedOnly is off", () => {
    const shady = row({ mint: OBSCURE, symbol: "usdc1", verified: false });
    const out = resolveFromCache({
      ...base,
      requested: [OBSCURE],
      cached: [shady],
      verifiedOnly: false,
    });
    expect(out.results[0]!.status).toBe("ok");
  });

  it("returns one result per distinct mint, in the order asked", () => {
    const out = resolveFromCache({
      ...base,
      requested: [WSOL, BONK, WSOL],
      cached: [row()],
    });
    expect(out.results.map((r) => (r.status === "ok" ? r.metadata.mint : r.mint))).toEqual([
      WSOL,
      BONK,
    ]);
  });

  it("survives a garbage mint without blanking the batch", () => {
    const out = resolveFromCache({
      ...base,
      requested: ["not-a-mint", BONK],
      cached: [row()],
    });
    expect(out.results[0]).toEqual({
      status: "unavailable",
      mint: "not-a-mint",
      code: TOKEN_METADATA_FAILURE.UNKNOWN_MINT,
    });
    expect(out.results[1]!.status).toBe("ok");
  });

  it("flags a row whose decimals were never proven", () => {
    const unproven = row({ decimalsVerifiedAt: undefined });
    const out = resolveFromCache({ ...base, requested: [BONK], cached: [unproven] });
    expect(out.unprovenMints).toEqual([BONK]);
    expect(out.results[0]!.status).toBe("ok");
    const metadata = metadataFromRow(unproven)!;
    expect(() => assertTransactable(metadata, base)).toThrow(
      TOKEN_METADATA_FAILURE.DECIMALS_UNVERIFIED,
    );
  });
});

describe("reconcileEntriesWithChain", () => {
  function entry(overrides: Partial<RawTokenListEntry> = {}): RawTokenListEntry {
    return {
      mint: BONK,
      symbol: "Bonk",
      name: "Bonk",
      decimals: 5,
      logoURI: null,
      verified: true,
      ...overrides,
    };
  }

  it("keeps an entry the chain confirms", () => {
    const out = reconcileEntriesWithChain({
      entries: [entry()],
      chainDecimals: new Map([[BONK, 5]]),
    });
    expect(out.entries).toHaveLength(1);
    expect(out.conflicts).toEqual([]);
  });

  it("DROPS an entry the chain contradicts, without losing its neighbours", () => {
    const out = reconcileEntriesWithChain({
      entries: [entry(), entry({ mint: WSOL, symbol: "SOL", decimals: 9 })],
      chainDecimals: new Map([
        [BONK, 9],
        [WSOL, 9],
      ]),
    });
    expect(out.entries.map((e) => e.mint)).toEqual([WSOL]);
    expect(out.conflicts).toEqual([
      { mint: BONK, listDecimals: 5, chainDecimals: 9 },
    ]);
  });

  it("drops an entry the chain says is not a mint at all", () => {
    const out = reconcileEntriesWithChain({
      entries: [entry()],
      chainDecimals: new Map([[BONK, null]]),
    });
    expect(out.entries).toEqual([]);
    expect(out.conflicts).toHaveLength(1);
  });

  it("keeps an unread entry for display, unproven", () => {
    const out = reconcileEntriesWithChain({
      entries: [entry()],
      chainDecimals: new Map(),
    });
    expect(out.entries).toHaveLength(1);
    expect(out.conflicts).toEqual([]);
  });
});

describe("buildTokenRows", () => {
  const chain = new Map<string, number | null>([
    [USDC, 6],
    [BONK, 5],
    [OBSCURE, 9],
  ]);

  it("stamps a chain proof only when the chain was actually read", () => {
    const rows = buildTokenRows({
      requested: [BONK, WSOL],
      entries: [
        { mint: BONK, symbol: "Bonk", name: "Bonk", decimals: 5, logoURI: null, verified: true },
      ],
      chainDecimals: new Map([[BONK, 5]]),
      cluster: "mainnet-beta",
      now: NOW,
    });
    const bonk = rows.find((r) => r.mint === BONK)!;
    const wsol = rows.find((r) => r.mint === WSOL)!;
    expect(bonk.decimalsVerifiedAt).toBe(NOW);
    expect(wsol.decimalsVerifiedAt).toBeUndefined();
  });

  it("lets the pin win over the registry, keeping only its logo", () => {
    const rows = buildTokenRows({
      requested: [USDC],
      entries: [
        {
          mint: USDC,
          symbol: "WRONG",
          name: "Wrong",
          decimals: 6,
          logoURI: "https://example.test/l.png",
          verified: false,
        },
      ],
      chainDecimals: chain,
      cluster: "mainnet-beta",
      now: NOW,
    });
    expect(rows[0]).toMatchObject({
      symbol: "USDC",
      verified: true,
      source: TOKEN_SOURCE.CLUSTER_PIN,
      logoUri: "https://example.test/l.png",
      decimals: 6,
    });
  });

  it("writes a negative row for a mint no registry listed", () => {
    const rows = buildTokenRows({
      requested: [OBSCURE],
      entries: [],
      chainDecimals: chain,
      cluster: "mainnet-beta",
      now: NOW,
    });
    expect(rows[0]!.symbol).toBeUndefined();
    expect(rows[0]).toMatchObject({
      mint: OBSCURE,
      decimals: 9,
      verified: false,
      existsOnChain: true,
      source: TOKEN_SOURCE.CHAIN,
    });
    expect(metadataFromRow(rows[0]!)).toBeNull();
  });

  it("records existsOnChain: false for an address that is not a mint", () => {
    const rows = buildTokenRows({
      requested: [OBSCURE],
      entries: [],
      chainDecimals: new Map([[OBSCURE, null]]),
      cluster: "mainnet-beta",
      now: NOW,
    });
    expect(rows[0]).toMatchObject({ existsOnChain: false, decimals: undefined });
  });

  it("produces one row per requested mint and skips garbage", () => {
    const rows = buildTokenRows({
      requested: [BONK, BONK, "garbage"],
      entries: [],
      chainDecimals: chain,
      cluster: "mainnet-beta",
      now: NOW,
    });
    expect(rows).toHaveLength(1);
  });
});
