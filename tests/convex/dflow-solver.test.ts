import { describe, expect, it } from "vitest";
import {
  solveTargetOutputQuote,
  SOLVER_OVERSHOOT_BPS,
  type SolvedQuote,
} from "../../lib/dflow/quoteSolver";
import {
  DFLOW_SOLVER_DEADLINE_MS,
  DFLOW_SOLVER_MAX_REQUESTS,
} from "../../lib/dflow/constants";
import {
  reserveDflowBudget,
  settleDflowBudget,
  withDflowBudgetSettlement,
} from "../../convex/lib/providerBudget";

/**
 * There is no ExactOut on `/order` — it takes an INPUT amount only — so the
 * input must be searched for against the exact USDC the recipient is owed.
 *
 * The router stand-in below prices at a fixed rate and applies a slippage
 * haircut, so `guaranteedOutputAtomic` (the ENFORCED `otherAmountThreshold`) is
 * strictly below the mid-price `outAmount`. Solving against the enforced number
 * is the whole point: bracketing on `outAmount` would let us promise a recipient
 * an amount nothing guarantees.
 */
const TARGET_USDC = 12_500_000n; // $12.50, six decimals
const LAMPORTS_PER_USDC_ATOM = 10n; // 1 USDC atom costs 10 lamports at mid
const SLIPPAGE_BPS = 20n;

type Quote = { outAmountEstimate: bigint };

function router(options: { calls?: bigint[] } = {}) {
  return async (inputAtomic: bigint): Promise<SolvedQuote<Quote> | null> => {
    options.calls?.push(inputAtomic);
    const mid = inputAtomic / LAMPORTS_PER_USDC_ATOM;
    // The enforced floor sits below the estimate, exactly as DFlow's does.
    const enforced = (mid * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    return {
      inputAtomic,
      guaranteedOutputAtomic: enforced,
      payload: { outAmountEstimate: mid },
    };
  };
}

describe("spec-6-3 — bounded solver brackets input against the ENFORCED output", () => {
  it("finds an input whose otherAmountThreshold covers the locked target", async () => {
    const calls: bigint[] = [];
    const result = await solveTargetOutputQuote({
      targetOutputAtomic: TARGET_USDC,
      maxInputAtomic: 1_000_000_000n,
      initialInputAtomic: 1_000_000_000n,
      requestQuote: router({ calls }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.guaranteedOutputAtomic).toBeGreaterThanOrEqual(TARGET_USDC);
      expect(result.requestCount).toBeLessThanOrEqual(DFLOW_SOLVER_MAX_REQUESTS);
    }
    expect(calls.length).toBeLessThanOrEqual(DFLOW_SOLVER_MAX_REQUESTS);
  });

  it("converges downward instead of overspending the payer's input", async () => {
    const calls: bigint[] = [];
    const result = await solveTargetOutputQuote({
      // Start 10x too high; the rate from the first quote should scale it down.
      targetOutputAtomic: TARGET_USDC,
      maxInputAtomic: 10_000_000_000n,
      initialInputAtomic: 10_000_000_000n,
      requestQuote: router({ calls }),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const naive = TARGET_USDC * LAMPORTS_PER_USDC_ATOM;
      // Within the slippage haircut plus the solver's own headroom.
      const ceiling =
        (naive * (10_000n + SLIPPAGE_BPS + SOLVER_OVERSHOOT_BPS + 5n)) / 10_000n;
      expect(result.quote.inputAtomic).toBeLessThanOrEqual(ceiling);
      expect(result.quote.guaranteedOutputAtomic).toBeGreaterThanOrEqual(TARGET_USDC);
    }
    expect(calls[0]).toBe(10_000_000_000n);
    expect(calls[1]!).toBeLessThan(calls[0]!);
  });

  it("never returns a quote whose enforced threshold falls short", async () => {
    const result = await solveTargetOutputQuote({
      targetOutputAtomic: TARGET_USDC,
      maxInputAtomic: 1_000_000_000n,
      initialInputAtomic: 1_000_000_000n,
      // A router that always undershoots by one atom must never be accepted.
      requestQuote: async (inputAtomic) => ({
        inputAtomic,
        guaranteedOutputAtomic: TARGET_USDC - 1n,
        payload: { outAmountEstimate: TARGET_USDC * 2n },
      }),
    });
    expect(result.ok).toBe(false);
  });

  it("refuses to exceed the input cap the payer authorised", async () => {
    const result = await solveTargetOutputQuote({
      targetOutputAtomic: TARGET_USDC,
      // Only a tenth of what the target costs at this rate.
      maxInputAtomic: TARGET_USDC,
      initialInputAtomic: TARGET_USDC,
      requestQuote: router(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("SOLVER_INPUT_CAP_EXCEEDED");
    }
  });

  it("stops at the request limit rather than hammering a rate-limited API", async () => {
    let calls = 0;
    const result = await solveTargetOutputQuote({
      targetOutputAtomic: TARGET_USDC,
      maxInputAtomic: 10n ** 18n,
      initialInputAtomic: 1_000_000_000n,
      requestQuote: async (inputAtomic) => {
        calls += 1;
        // Always one atom short, at any size: the solver keeps scaling up by a
        // hair and can only ever exhaust its budget. It must stop at four.
        return {
          inputAtomic,
          guaranteedOutputAtomic: TARGET_USDC - 1n,
          payload: { outAmountEstimate: TARGET_USDC },
        };
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("SOLVER_REQUEST_LIMIT");
    }
    expect(calls).toBe(DFLOW_SOLVER_MAX_REQUESTS);
  });

  it("fails when the wall-clock deadline is exceeded", async () => {
    let now = 1_000;
    const result = await solveTargetOutputQuote({
      targetOutputAtomic: TARGET_USDC,
      maxInputAtomic: 10n ** 18n,
      initialInputAtomic: 1n,
      now: () => {
        now += DFLOW_SOLVER_DEADLINE_MS;
        return now;
      },
      requestQuote: router(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("SOLVER_DEADLINE");
    }
  });

  it("treats a router error as fatal, not as a size to retry around", async () => {
    let calls = 0;
    const result = await solveTargetOutputQuote({
      targetOutputAtomic: TARGET_USDC,
      maxInputAtomic: 10n ** 18n,
      initialInputAtomic: 1_000_000_000n,
      requestQuote: async () => {
        calls += 1;
        throw new Error("DFLOW_RESPONSE_SIGNATURE_INVALID");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("SOLVER_QUOTE_FAILED");
    }
    expect(calls).toBe(1);
  });

  it("steps up past a size the router cannot price at all", async () => {
    const seen: bigint[] = [];
    const result = await solveTargetOutputQuote({
      targetOutputAtomic: TARGET_USDC,
      maxInputAtomic: 10_000_000_000n,
      initialInputAtomic: 1_000n,
      requestQuote: async (inputAtomic) => {
        seen.push(inputAtomic);
        // `route_not_found` below a venue minimum.
        if (inputAtomic < 1_000_000n) {
          return null;
        }
        return router()(inputAtomic);
      },
    });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[1]).toBeGreaterThan(seen[0]!);
    expect(result.ok).toBe(false);
  });
});

describe("DFlow budget lease finalization", () => {
  it("settles on an early successful return", async () => {
    let settlements = 0;
    await expect(withDflowBudgetSettlement(
      async () => ({ ok: false as const, failureCode: "EARLY_EXIT" }),
      async () => { settlements += 1; },
    )).resolves.toEqual({ ok: false, failureCode: "EARLY_EXIT" });
    expect(settlements).toBe(1);
  });

  it("settles on a thrown provider error and preserves the error", async () => {
    let settlements = 0;
    await expect(withDflowBudgetSettlement(
      async () => { throw new Error("provider down"); },
      async () => { settlements += 1; },
    )).rejects.toThrow("provider down");
    expect(settlements).toBe(1);
  });
});

describe("Story 6.3 — provider budget reservation", () => {
  it("reserves the four solver attempts plus one output-pricing attempt", async () => {
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
      expect(reserved.reservedAttempts).toBe(5);
      await expect(reserveDflowBudget(ctx as never, {
        userId: "users:1" as never,
        groupId: "groups:1" as never,
        intentId: "settlementIntents:1" as never,
      })).resolves.toMatchObject({ ok: false, failureCode: "PROVIDER_LEASE_ACTIVE" });
      await settleDflowBudget(ctx as never, {
        intentId: "settlementIntents:1" as never,
        userId: "users:1" as never,
        groupId: "groups:1" as never,
        windowKey: reserved.windowKey,
        reservedAttempts: reserved.reservedAttempts,
        usedAttempts: 2,
      });
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
