/**
 * The pins in lib/solana/cluster.ts outrank any registry.
 *
 * The scenario under test is a real drain pattern: a mint that is not Circle's
 * shows up in a token list wearing the symbol "USDC". If the payment sheet
 * renders it as USDC, a payer approves it. These tests assert that cannot
 * happen, and that a registry contradicting a pinned mint fails the whole
 * refresh instead of being quietly preferred or quietly overridden.
 */

import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  assertSnapshotAgreesWithCanonical,
  canonicalMetadata,
  canonicalTokenByMint,
  canonicalTokensFor,
  mergeCanonicalWithListEntry,
  reconcileWithCanonical,
  reservedSymbols,
} from "../../lib/tokens/canonical";
import { getClusterConfig } from "../../lib/solana/cluster";
import {
  TOKEN_METADATA_FAILURE,
  TOKEN_SOURCE,
  TokenMetadataError,
  type RawTokenListEntry,
} from "../../lib/tokens/types";

const MAINNET_USDC = getClusterConfig("mainnet-beta").usdcMint;
const DEVNET_USDC = getClusterConfig("devnet").usdcMint;
const WSOL = getClusterConfig("mainnet-beta").wrappedSolMint;
const IMPOSTOR = Keypair.generate().publicKey.toBase58();

function entry(overrides: Partial<RawTokenListEntry>): RawTokenListEntry {
  return {
    mint: IMPOSTOR,
    symbol: "TEST",
    name: "Test Token",
    decimals: 6,
    logoURI: null,
    verified: true,
    ...overrides,
  };
}

describe("canonical pins", () => {
  it("pins a different USDC mint per cluster", () => {
    expect(MAINNET_USDC).not.toBe(DEVNET_USDC);
    expect(canonicalTokenByMint(MAINNET_USDC, "mainnet-beta")?.symbol).toBe("USDC");
    expect(canonicalTokenByMint(DEVNET_USDC, "devnet")?.symbol).toBe("USDC");
  });

  it("does not recognise the other cluster's USDC", () => {
    expect(canonicalTokenByMint(MAINNET_USDC, "devnet")).toBeUndefined();
    expect(canonicalTokenByMint(DEVNET_USDC, "mainnet-beta")).toBeUndefined();
  });

  it("pins USDC at 6 decimals, matching the settlement path's assumption", () => {
    for (const cluster of ["devnet", "mainnet-beta"] as const) {
      const usdc = canonicalTokensFor(cluster).find((t) => t.symbol === "USDC");
      expect(usdc?.decimals).toBe(getClusterConfig(cluster).usdcDecimals);
      expect(usdc?.decimals).toBe(6);
    }
  });

  it("reserves USDC and SOL to their pinned mints", () => {
    const reserved = reservedSymbols("mainnet-beta");
    expect(reserved.get("USDC")).toBe(MAINNET_USDC);
    expect(reserved.get("SOL")).toBe(WSOL);
  });
});

describe("reconcileWithCanonical", () => {
  it("strips the symbol from a lookalike and forces it unverified", () => {
    const result = reconcileWithCanonical({
      entry: entry({ mint: IMPOSTOR, symbol: "USDC", name: "USD Coin", verified: true }),
      cluster: "mainnet-beta",
    });
    expect(result.verified).toBe(false);
    expect(result.symbol).not.toBe("USDC");
    expect(result.symbol).toContain("unverified");
  });

  it("catches a lookalike whatever the case of its symbol", () => {
    for (const symbol of ["usdc", "Usdc", "uSdC"]) {
      const result = reconcileWithCanonical({
        entry: entry({ mint: IMPOSTOR, symbol, verified: true }),
        cluster: "mainnet-beta",
      });
      expect(result.verified).toBe(false);
    }
  });

  it("lets the pin overwrite a registry's label for the real mint", () => {
    const result = reconcileWithCanonical({
      entry: entry({
        mint: MAINNET_USDC,
        symbol: "usd-coin",
        name: "Whatever The List Says",
        decimals: 6,
        verified: false,
        logoURI: "https://example.test/usdc.png",
      }),
      cluster: "mainnet-beta",
    });
    expect(result.symbol).toBe("USDC");
    expect(result.name).toBe("USD Coin");
    // A registry may not de-verify the mint this product settles in.
    expect(result.verified).toBe(true);
    // ...but it may still contribute the one field the pin does not carry.
    expect(result.logoURI).toBe("https://example.test/usdc.png");
  });

  it("FAILS LOUDLY when a registry disagrees with a pin about decimals", () => {
    let thrown: unknown;
    try {
      reconcileWithCanonical({
        entry: entry({ mint: MAINNET_USDC, symbol: "USDC", decimals: 9 }),
        cluster: "mainnet-beta",
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TokenMetadataError);
    expect((thrown as TokenMetadataError).code).toBe(
      TOKEN_METADATA_FAILURE.CANONICAL_CONFLICT,
    );
    expect((thrown as TokenMetadataError).message).toContain("cluster.ts");
  });

  it("leaves an ordinary unrelated token alone", () => {
    const input = entry({ symbol: "BONK", name: "Bonk", decimals: 5 });
    expect(reconcileWithCanonical({ entry: input, cluster: "mainnet-beta" })).toEqual(
      input,
    );
  });
});

describe("assertSnapshotAgreesWithCanonical", () => {
  const goodMainnet: RawTokenListEntry[] = [
    entry({ mint: MAINNET_USDC, symbol: "USDC", decimals: 6 }),
    entry({ mint: WSOL, symbol: "SOL", decimals: 9 }),
  ];

  it("accepts a snapshot that carries the pinned mints correctly", () => {
    expect(() =>
      assertSnapshotAgreesWithCanonical({
        entries: goodMainnet,
        cluster: "mainnet-beta",
      }),
    ).not.toThrow();
  });

  it("rejects a mainnet snapshot served for devnet, and the reverse", () => {
    // The mainnet list contains no devnet USDC; that omission is the tell.
    expect(() =>
      assertSnapshotAgreesWithCanonical({
        entries: [entry({ mint: WSOL, symbol: "SOL", decimals: 9 })],
        cluster: "mainnet-beta",
      }),
    ).toThrow(TOKEN_METADATA_FAILURE.CANONICAL_CONFLICT);
  });

  it("exempts devnet, whose test mints no public registry lists", () => {
    expect(() =>
      assertSnapshotAgreesWithCanonical({
        entries: [entry({ mint: WSOL, symbol: "SOL", decimals: 9 })],
        cluster: "devnet",
      }),
    ).not.toThrow();
  });

  it("still rejects a devnet snapshot that names a pinned mint with wrong decimals", () => {
    expect(() =>
      assertSnapshotAgreesWithCanonical({
        entries: [entry({ mint: WSOL, symbol: "SOL", decimals: 6 })],
        cluster: "devnet",
      }),
    ).toThrow(TOKEN_METADATA_FAILURE.CANONICAL_CONFLICT);
  });
});

describe("canonicalMetadata", () => {
  it("is verified, source-tagged, and initially unproven against chain", () => {
    const pin = canonicalTokensFor("mainnet-beta")[0]!;
    const meta = canonicalMetadata({
      token: pin,
      cluster: "mainnet-beta",
      fetchedAt: 1_000,
    });
    expect(meta.verified).toBe(true);
    expect(meta.provenance.source).toBe(TOKEN_SOURCE.CLUSTER_PIN);
    expect(meta.provenance.cluster).toBe("mainnet-beta");
    expect(meta.provenance.decimalsVerifiedAt).toBeNull();
    expect(meta.logoURI).toBeNull();
  });

  it("takes a logo from the registry without taking anything else", () => {
    const pin = canonicalTokensFor("mainnet-beta")[0]!;
    const base = canonicalMetadata({ token: pin, cluster: "mainnet-beta", fetchedAt: 1 });
    const merged = mergeCanonicalWithListEntry({
      canonical: base,
      entry: entry({
        mint: pin.mint,
        symbol: "FAKE",
        name: "Fake",
        decimals: 9,
        verified: false,
        logoURI: "https://example.test/logo.png",
      }),
    });
    expect(merged.logoURI).toBe("https://example.test/logo.png");
    expect(merged.symbol).toBe("USDC");
    expect(merged.decimals).toBe(6);
    expect(merged.verified).toBe(true);
  });
});
