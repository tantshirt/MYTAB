import { describe, expect, it } from "vitest";
import { solveTargetOutputQuote } from "../../lib/dflow/quoteSolver";
import { DFLOW_SOLVER_DEADLINE_MS, DFLOW_SOLVER_MAX_REQUESTS } from "../../lib/dflow/constants";
import {
  FIXTURE_PAYER_WALLET_ADDRESS,
  FIXTURE_RECIPIENT_WALLET_ADDRESS,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
  USDC_MINT,
  WRAPPED_SOL_MINT,
} from "../../lib/solana/constants";
import { buildDflowFixtureQuote } from "../../lib/dflow/fixture";
import { reserveDflowBudget, settleDflowBudget } from "../../convex/lib/providerBudget";

describe("Story 6.3 — bounded quote solver", () => {
  const baseInput = {
    inputMint: WRAPPED_SOL_MINT,
    outputMint: USDC_MINT,
    inputAmountAtomic: 100_000_000n,
    minimumOutputAtomic: 10_000_000n,
    sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
    destinationWallet: FIXTURE_RECIPIENT_WALLET_ADDRESS,
    payerAddress: FIXTURE_PAYER_WALLET_ADDRESS,
  };

  it("finds a quote whose otherAmountThreshold covers the obligation", () => {
    const result = solveTargetOutputQuote(baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(BigInt(result.quote.otherAmountThreshold)).toBeGreaterThanOrEqual(10_000_000n);
      expect(result.requestCount).toBeLessThanOrEqual(DFLOW_SOLVER_MAX_REQUESTS);
    }
  });

  it("fails with a stable code when the request budget is exhausted", () => {
    let calls = 0;
    const result = solveTargetOutputQuote({
      ...baseInput,
      minimumOutputAtomic: 999_999_999_999n,
      requestQuote: () => {
        calls += 1;
        return buildDflowFixtureQuote({ ...baseInput, inputAmountAtomic: 1n });
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["SOLVER_REQUEST_LIMIT", "SOLVER_NO_COVERING_QUOTE"]).toContain(result.failureCode);
    }
    expect(calls).toBeLessThanOrEqual(DFLOW_SOLVER_MAX_REQUESTS);
  });

  it("fails when the wall-clock deadline is exceeded", () => {
    let now = 1_000;
    const result = solveTargetOutputQuote({
      ...baseInput,
      now: () => {
        now += DFLOW_SOLVER_DEADLINE_MS;
        return now;
      },
      requestQuote: () => buildDflowFixtureQuote({ ...baseInput, inputAmountAtomic: 1n }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("SOLVER_DEADLINE");
    }
  });
});

describe("Story 6.3 — provider budget reservation", () => {
  it("reserves four attempts and releases unused tokens on settle", async () => {
    const buckets: Array<Record<string, unknown>> = [];
    const leases: Array<Record<string, unknown>> = [];
    let nextId = 1;

    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: (
            _index: string,
            builder: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
          ) => {
            const filters: Record<string, unknown> = {};
            const filterBuilder = {
              eq: (field: string, value: unknown) => {
                filters[field] = value;
                return filterBuilder;
              },
            };
            builder(filterBuilder);

            const rows =
              table === "providerUsageBuckets"
                ? buckets.filter((row) =>
                    Object.entries(filters).every(([field, value]) => row[field] === value),
                  )
                : leases.filter((row) =>
                    Object.entries(filters).every(([field, value]) => row[field] === value),
                  );

            return {
              unique: async () => rows[0] ?? null,
              collect: async () => rows,
            };
          },
        }),
        insert: async (_table: string, doc: Record<string, unknown>) => {
          const id = `row:${nextId++}`;
          if (_table === "providerUsageBuckets") buckets.push({ _id: id, ...doc });
          if (_table === "providerConcurrencyLeases") leases.push({ _id: id, ...doc });
          return id;
        },
        patch: async (id: string, patch: Record<string, unknown>) => {
          for (const collection of [buckets, leases]) {
            const index = collection.findIndex((row) => row._id === id);
            if (index >= 0) {
              collection[index] = { ...collection[index]!, ...patch };
            }
          }
        },
      },
    };

    const reserved = await reserveDflowBudget(ctx as never, {
      userId: "users:1" as never,
      groupId: "groups:1" as never,
      intentId: "settlementIntents:1" as never,
    });

    expect(reserved.ok).toBe(true);
    if (reserved.ok) {
      expect(reserved.reservedAttempts).toBe(4);
      await settleDflowBudget(ctx as never, {
        intentId: "settlementIntents:1" as never,
        userId: "users:1" as never,
        groupId: "groups:1" as never,
        windowKey: reserved.windowKey,
        reservedAttempts: reserved.reservedAttempts,
        usedAttempts: 2,
      });

      const userBucket = buckets.find((row) => row.dimension === "user_hour");
      expect(userBucket?.reservedAttempts).toBe(2);
      expect(userBucket?.settledAttempts).toBe(2);
    }
  });
});
