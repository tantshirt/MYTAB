import { describe, expect, it } from "vitest";
import {
  SPONSOR_FAILURE,
  evaluateSponsorReservation,
  getSponsorCaps,
  isSponsorPaused,
  type SponsorUsageSnapshot,
} from "../../convex/sponsorPolicy";
import { TOKEN_PROGRAM_ID, USDC_MINT } from "../../lib/solana/constants";

const EMPTY_USAGE: SponsorUsageSnapshot = {
  userDayReserved: 0n,
  walletDayReserved: 0n,
  groupDayReserved: 0n,
  dailyAggregateReserved: 0n,
  globalEpochReserved: 0n,
};

const ALLOWLIST = {
  programId: TOKEN_PROGRAM_ID,
  // Cluster-resolved, never a mainnet literal.
  mint: USDC_MINT,
  recipientAddress: "Recip1111111111111111111111111111111111111",
  instructionKind: "transferChecked",
};

function evaluateAtUsage(
  cap: bigint,
  dimension: keyof SponsorUsageSnapshot,
  environment: "production" | "development" = "production",
) {
  const increment = 1n;
  const atLimitMinusOne = cap - increment;
  const atLimit = cap;
  const atLimitPlusOne = cap + increment;

  const cases = [
    { label: "limit-1", current: atLimitMinusOne, expectOk: true },
    { label: "limit", current: atLimit, expectOk: false },
    { label: "limit+1", current: atLimitPlusOne, expectOk: false },
  ] as const;

  return cases.map(({ label, current, expectOk }) => {
    const usage: SponsorUsageSnapshot = {
      ...EMPTY_USAGE,
      [dimension]: current,
    };

    const result = evaluateSponsorReservation({
      environment,
      reservedLamports: increment,
      usage,
      allowlist: ALLOWLIST,
      paused: false,
    });

    return { label, result, expectOk };
  });
}

describe("sponsor-v1 caps (Story 3.8 AC1, AC7)", () => {
  const prodCaps = getSponsorCaps("production");

  it("enforces per-transaction cap at exactly the limit", () => {
    const under = evaluateSponsorReservation({
      environment: "production",
      reservedLamports: prodCaps.perTransactionLamports,
      usage: EMPTY_USAGE,
      allowlist: ALLOWLIST,
    });
    expect(under.ok).toBe(true);

    const over = evaluateSponsorReservation({
      environment: "production",
      reservedLamports: prodCaps.perTransactionLamports + 1n,
      usage: EMPTY_USAGE,
      allowlist: ALLOWLIST,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.failureCode).toBe(SPONSOR_FAILURE.CAP_PER_TRANSACTION);
    }
  });

  it.each([
    ["perUserDay", "perUserDayLamports", "userDayReserved", SPONSOR_FAILURE.CAP_PER_USER_DAY],
    ["perWalletDay", "perWalletDayLamports", "walletDayReserved", SPONSOR_FAILURE.CAP_PER_WALLET_DAY],
    ["perGroupDay", "perGroupDayLamports", "groupDayReserved", SPONSOR_FAILURE.CAP_PER_GROUP_DAY],
    ["dailyAggregate", "dailyAggregateLamports", "dailyAggregateReserved", SPONSOR_FAILURE.CAP_DAILY_AGGREGATE],
    ["globalEpoch", "globalEpochLamports", "globalEpochReserved", SPONSOR_FAILURE.CAP_GLOBAL_EPOCH],
  ] as const)(
    "production %s: limit-1 passes, limit and limit+1 reject",
    (_name, capKey, usageKey, failureCode) => {
      const cap = prodCaps[capKey];
      const results = evaluateAtUsage(cap, usageKey, "production");

      expect(results[0]?.expectOk).toBe(true);
      expect(results[0]?.result.ok).toBe(true);

      for (const blocked of results.slice(1)) {
        expect(blocked.result.ok).toBe(false);
        if (!blocked.result.ok) {
          expect(blocked.result.failureCode).toBe(failureCode);
        }
      }
    },
  );

  it("development caps are lower than production for user-day", () => {
    const devCaps = getSponsorCaps("development");
    expect(devCaps.perUserDayLamports < prodCaps.perUserDayLamports).toBe(true);

    const atDevLimit = evaluateSponsorReservation({
      environment: "development",
      reservedLamports: 1n,
      usage: {
        ...EMPTY_USAGE,
        userDayReserved: devCaps.perUserDayLamports,
      },
      allowlist: ALLOWLIST,
    });
    expect(atDevLimit.ok).toBe(false);
  });
});

describe("sponsor kill switch (Story 3.8 AC4)", () => {
  it("blocks reservation when SPONSOR_PAUSE is enabled", () => {
    expect(isSponsorPaused({ SPONSOR_PAUSE: "true" })).toBe(true);
    expect(isSponsorPaused({ SPONSOR_PAUSE: "1" })).toBe(true);
    expect(isSponsorPaused({})).toBe(false);

    const paused = evaluateSponsorReservation({
      environment: "production",
      reservedLamports: 1n,
      usage: EMPTY_USAGE,
      allowlist: ALLOWLIST,
      paused: true,
    });
    expect(paused.ok).toBe(false);
    if (!paused.ok) {
      expect(paused.failureCode).toBe(SPONSOR_FAILURE.PAUSED);
    }
  });
});

describe("sponsor allowlists (Story 3.8 AC2)", () => {
  it("rejects non-allowlisted mint", () => {
    const result = evaluateSponsorReservation({
      environment: "production",
      reservedLamports: 1n,
      usage: EMPTY_USAGE,
      allowlist: {
        ...ALLOWLIST,
        mint: "BadMint1111111111111111111111111111111111",
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SPONSOR_FAILURE.ALLOWLIST_MINT);
    }
  });
});
