/**
 * The gate between "we have some metadata" and "we may move money".
 *
 * Every refusal here is a case where the alternative — showing the mint address
 * and continuing — is how a payer signs for a token nobody vouched for, or an
 * amount scaled by an exponent nobody checked.
 */

import { describe, expect, it } from "vitest";
import {
  DECIMALS_PROOF_MAX_AGE_MS,
  TOKEN_METADATA_FRESH_MS,
  TOKEN_METADATA_MAX_AGE_MS,
  assertTransactable,
  classifyFreshness,
  isDecimalsProofValid,
  shouldRefresh,
} from "../../lib/tokens/policy";
import {
  TOKEN_METADATA_FAILURE,
  TOKEN_SOURCE,
  TokenMetadataError,
  type TokenMetadata,
} from "../../lib/tokens/types";
import { getClusterConfig } from "../../lib/solana/cluster";
import {
  cryptoAmountForToken,
  formatTokenAmount,
  formatTokenAmountWithSymbol,
  truncateMint,
} from "../../lib/tokens/display";

const NOW = 1_800_000_000_000;
const USDC = getClusterConfig("mainnet-beta").usdcMint;

function meta(overrides: Partial<TokenMetadata> = {}): TokenMetadata {
  return {
    mint: USDC,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: null,
    verified: true,
    provenance: {
      source: TOKEN_SOURCE.JUPITER,
      cluster: "mainnet-beta",
      fetchedAt: NOW - 1000,
      decimalsVerifiedAt: NOW - 1000,
    },
    ...overrides,
  };
}

function withProvenance(
  overrides: Partial<TokenMetadata["provenance"]>,
): TokenMetadata {
  const base = meta();
  return { ...base, provenance: { ...base.provenance, ...overrides } };
}

const gate = { now: NOW, cluster: "mainnet-beta" as const };

describe("freshness classification", () => {
  it("moves fresh -> stale -> expired at the documented boundaries", () => {
    expect(classifyFreshness(withProvenance({ fetchedAt: NOW }), NOW)).toBe("fresh");
    expect(
      classifyFreshness(
        withProvenance({ fetchedAt: NOW - TOKEN_METADATA_FRESH_MS + 1 }),
        NOW,
      ),
    ).toBe("fresh");
    expect(
      classifyFreshness(withProvenance({ fetchedAt: NOW - TOKEN_METADATA_FRESH_MS }), NOW),
    ).toBe("stale");
    expect(
      classifyFreshness(
        withProvenance({ fetchedAt: NOW - TOKEN_METADATA_MAX_AGE_MS }),
        NOW,
      ),
    ).toBe("expired");
  });

  it("treats a future timestamp as fresh rather than as an outage", () => {
    expect(classifyFreshness(withProvenance({ fetchedAt: NOW + 60_000 }), NOW)).toBe(
      "fresh",
    );
  });

  it("asks for a refresh as soon as a record stops being fresh", () => {
    expect(shouldRefresh(withProvenance({ fetchedAt: NOW }), NOW)).toBe(false);
    expect(
      shouldRefresh(withProvenance({ fetchedAt: NOW - TOKEN_METADATA_FRESH_MS }), NOW),
    ).toBe(true);
  });
});

describe("decimals proof", () => {
  it("is invalid when it was never taken", () => {
    expect(isDecimalsProofValid(withProvenance({ decimalsVerifiedAt: null }), NOW)).toBe(
      false,
    );
  });

  it("expires on the documented window", () => {
    expect(
      isDecimalsProofValid(
        withProvenance({ decimalsVerifiedAt: NOW - DECIMALS_PROOF_MAX_AGE_MS + 1 }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isDecimalsProofValid(
        withProvenance({ decimalsVerifiedAt: NOW - DECIMALS_PROOF_MAX_AGE_MS }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("assertTransactable", () => {
  it("returns the proven decimals so the caller cannot scale with anything else", () => {
    expect(assertTransactable(meta(), gate)).toBe(6);
  });

  it("refuses a missing record rather than falling back to a mint address", () => {
    expect(() => assertTransactable(null, gate)).toThrow(
      TOKEN_METADATA_FAILURE.UNKNOWN_MINT,
    );
    expect(() => assertTransactable(undefined, gate)).toThrow(
      TOKEN_METADATA_FAILURE.UNKNOWN_MINT,
    );
  });

  it("refuses metadata fetched for the other cluster", () => {
    expect(() =>
      assertTransactable(withProvenance({ cluster: "devnet" }), gate),
    ).toThrow(TOKEN_METADATA_FAILURE.CLUSTER_MISMATCH);
  });

  it("refuses an unverified token by default", () => {
    let thrown: unknown;
    try {
      assertTransactable(meta({ verified: false }), gate);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as TokenMetadataError).code).toBe(TOKEN_METADATA_FAILURE.UNVERIFIED);
  });

  it("allows an unverified token only under an explicit opt-in", () => {
    expect(
      assertTransactable(meta({ verified: false }), { ...gate, allowUnverified: true }),
    ).toBe(6);
  });

  it("refuses when decimals were never proven against the chain", () => {
    expect(() =>
      assertTransactable(withProvenance({ decimalsVerifiedAt: null }), gate),
    ).toThrow(TOKEN_METADATA_FAILURE.DECIMALS_UNVERIFIED);
  });

  it("refuses an expired record even when everything else is in order", () => {
    expect(() =>
      assertTransactable(
        withProvenance({ fetchedAt: NOW - TOKEN_METADATA_MAX_AGE_MS - 1 }),
        gate,
      ),
    ).toThrow(TOKEN_METADATA_FAILURE.STALE);
  });

  it("tolerates a merely stale record — a late cron is not a payment failure", () => {
    expect(
      assertTransactable(
        withProvenance({ fetchedAt: NOW - TOKEN_METADATA_FRESH_MS - 1 }),
        gate,
      ),
    ).toBe(6);
  });
});

describe("display scaling", () => {
  it("scales with BigInt, not with a float that loses the low digits", () => {
    const nineDecimals = meta({ symbol: "SOL", decimals: 9 });
    // Well inside u64, and well outside what a double can hold exactly.
    const atomic = 1_844_674_407_370_955_161n;
    expect(formatTokenAmount(nineDecimals, atomic)).toBe("1,844,674,407.370955161");
    // The float route corrupts the last three digits before any formatter could
    // round them back. This is why nothing on this path touches Number().
    expect((Number(atomic) / 1e9).toFixed(9)).toBe("1844674407.370955229");
  });

  it("keeps full precision for USDC", () => {
    expect(formatTokenAmount(meta(), 1_840_000_000n)).toBe("1,840.000000");
    expect(formatTokenAmountWithSymbol(meta(), 1_840_000_000n)).toBe("1,840.000000 USDC");
  });

  it("marks an unverified token in the rendered string", () => {
    expect(formatTokenAmountWithSymbol(meta({ verified: false }), 1n)).toContain(
      "(unverified)",
    );
  });

  it("carries the token's decimals into the CryptoAmount", () => {
    expect(cryptoAmountForToken(meta({ decimals: 0 }), "7").decimals).toBe(0);
    expect(formatTokenAmount(meta({ decimals: 0 }), "7")).toBe("7");
    expect(formatTokenAmount(meta({ decimals: 0 }), "1234567")).toBe("1,234,567");
  });

  it("truncates a mint without making two mints look alike", () => {
    expect(truncateMint(USDC)).toBe("EPjF…Dt1v");
    expect(truncateMint("short")).toBe("short");
  });
});
