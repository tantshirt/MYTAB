/**
 * Sponsor caps and kill switch, exercised through the real reservation path
 * (`reserveSponsorBudget`) rather than the pure evaluator, so the test proves
 * the enforcement that actually runs before broadcast (AD-17, NFR-4).
 */

import { describe, expect, it } from "vitest";
import {
  readSponsorUsageSnapshot,
  releaseSponsorReservation,
  reserveSponsorBudget,
} from "../../convex/lib/sponsorReservation";
import {
  SPONSOR_FAILURE,
  SPONSOR_POLICY_VERSION,
  getSponsorCaps,
  isSponsorPaused,
} from "../../convex/sponsorPolicy";
import { USDC_MINT } from "../../lib/solana/constants";

type Row = Record<string, unknown> & { _id: string };

/** Minimal in-memory stand-in for the Convex mutation ctx used by the module. */
function makeCtx() {
  const tables: Record<string, Row[]> = {
    sponsorUsageBuckets: [],
    sponsorReservations: [],
    settlementIntents: [],
  };
  let nextId = 1;

  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: (
          _index: string,
          builder: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
        ) => {
          const filters: Record<string, unknown> = {};
          const q = {
            eq: (field: string, value: unknown) => {
              filters[field] = value;
              return q;
            },
          };
          builder(q);
          const rows = (tables[table] ?? []).filter((row) =>
            Object.entries(filters).every(([field, value]) => row[field] === value),
          );
          return { unique: async () => rows[0] ?? null };
        },
      }),
      get: async (id: string) => {
        for (const rows of Object.values(tables)) {
          const found = rows.find((row) => row._id === id);
          if (found) {
            return found;
          }
        }
        return null;
      },
      insert: async (table: string, doc: Record<string, unknown>) => {
        const id = `${table}:${nextId++}`;
        (tables[table] ??= []).push({ _id: id, ...doc });
        return id;
      },
      patch: async (id: string, patch: Record<string, unknown>) => {
        for (const rows of Object.values(tables)) {
          const index = rows.findIndex((row) => row._id === id);
          if (index >= 0) {
            rows[index] = { ...rows[index]!, ...patch };
            return;
          }
        }
      },
    },
  };

  return { ctx, tables };
}

const IDS = {
  intent: "settlementIntents:1",
  userId: "users:1",
  walletId: "wallets:1",
  groupId: "groups:1",
} as const;

function args(overrides: Record<string, unknown> = {}) {
  return {
    intentId: IDS.intent,
    userId: IDS.userId,
    walletId: IDS.walletId,
    groupId: IDS.groupId,
    environment: "production" as const,
    recipientAddress: "Recip1111111111111111111111111111111111111",
    outputMint: USDC_MINT,
    now: Date.UTC(2026, 7, 22, 12, 0, 0),
    ...overrides,
  };
}

describe("sponsor reservation — happy path", () => {
  it("reserves across all six dimensions and is idempotent per intent", async () => {
    const { ctx, tables } = makeCtx();

    const first = await reserveSponsorBudget(ctx as never, args() as never);
    expect(first.ok).toBe(true);

    expect(tables.sponsorUsageBuckets).toHaveLength(5);
    expect(tables.sponsorReservations).toHaveLength(1);
    expect(tables.sponsorReservations[0]!.policyVersion).toBe(
      SPONSOR_POLICY_VERSION,
    );

    // Re-running before co-sign must not double-count.
    const second = await reserveSponsorBudget(ctx as never, args() as never);
    expect(second.ok).toBe(true);
    expect(tables.sponsorUsageBuckets).toHaveLength(5);

    const usage = await readSponsorUsageSnapshot(ctx as never, {
      userId: IDS.userId as never,
      walletId: IDS.walletId as never,
      groupId: IDS.groupId as never,
      now: args().now,
    });
    const caps = getSponsorCaps("production");
    expect(usage.userDayReserved).toBe(caps.maxSponsorDebitPerIntentLamports);
  });

  it("releases a reservation back to every bucket", async () => {
    const { ctx, tables } = makeCtx();
    await ctx.db.insert("settlementIntents", {
      userId: IDS.userId,
      walletId: IDS.walletId,
      groupId: IDS.groupId,
    });
    const intentId = tables.settlementIntents[0]!._id;

    await reserveSponsorBudget(
      ctx as never,
      args({ intentId }) as never,
    );
    await releaseSponsorReservation(ctx as never, intentId as never, args().now);

    const usage = await readSponsorUsageSnapshot(ctx as never, {
      userId: IDS.userId as never,
      walletId: IDS.walletId as never,
      groupId: IDS.groupId as never,
      now: args().now,
    });
    expect(usage.userDayReserved).toBe(0n);
    expect(usage.globalEpochReserved).toBe(0n);
    expect(tables.sponsorReservations[0]!.status).toBe("released");
  });
});

describe("sponsor reservation — cap breach fails closed", () => {
  it("refuses a per-transaction amount above the cap and writes nothing", async () => {
    const { ctx, tables } = makeCtx();
    const caps = getSponsorCaps("production");

    const result = await reserveSponsorBudget(
      ctx as never,
      args({ reservedLamports: caps.perTransactionLamports + 1n }) as never,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SPONSOR_FAILURE.CAP_PER_TRANSACTION);
    }
    // Fail closed: no bucket incremented, no reservation row created.
    expect(tables.sponsorUsageBuckets).toHaveLength(0);
    expect(tables.sponsorReservations).toHaveLength(0);
  });

  it("refuses once the user's daily budget is exhausted", async () => {
    const { ctx, tables } = makeCtx();
    const caps = getSponsorCaps("production");
    const perIntent = caps.maxSponsorDebitPerIntentLamports;
    const fitting = caps.perUserDayLamports / perIntent;

    for (let i = 0n; i < fitting; i += 1n) {
      const result = await reserveSponsorBudget(
        ctx as never,
        args({ intentId: `settlementIntents:${i}` }) as never,
      );
      expect(result.ok).toBe(true);
    }

    const overflow = await reserveSponsorBudget(
      ctx as never,
      args({ intentId: "settlementIntents:overflow" }) as never,
    );
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.failureCode).toBe(SPONSOR_FAILURE.CAP_PER_USER_DAY);
    }

    const reservationCount = tables.sponsorReservations.length;
    expect(BigInt(reservationCount)).toBe(fitting);

    const usage = await readSponsorUsageSnapshot(ctx as never, {
      userId: IDS.userId as never,
      walletId: IDS.walletId as never,
      groupId: IDS.groupId as never,
      now: args().now,
    });
    expect(usage.userDayReserved).toBeLessThanOrEqual(caps.perUserDayLamports);
  });

  it("refuses a mint that is not the configured cluster USDC", async () => {
    const { ctx, tables } = makeCtx();
    const result = await reserveSponsorBudget(
      ctx as never,
      args({ outputMint: "So11111111111111111111111111111111111111112" }) as never,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SPONSOR_FAILURE.ALLOWLIST_MINT);
    }
    expect(tables.sponsorUsageBuckets).toHaveLength(0);
  });

  it("uses a separate window per UTC day", async () => {
    const { ctx } = makeCtx();
    const day1 = Date.UTC(2026, 7, 22, 23, 59, 0);
    const day2 = Date.UTC(2026, 7, 23, 0, 1, 0);

    await reserveSponsorBudget(ctx as never, args({ now: day1 }) as never);
    const usageDay2 = await readSponsorUsageSnapshot(ctx as never, {
      userId: IDS.userId as never,
      walletId: IDS.walletId as never,
      groupId: IDS.groupId as never,
      now: day2,
    });
    expect(usageDay2.userDayReserved).toBe(0n);
    // The epoch bucket is not windowed and must still carry the reservation.
    expect(usageDay2.globalEpochReserved).toBeGreaterThan(0n);
  });
});

describe("sponsor kill switch", () => {
  it("blocks a reservation while paused and writes nothing", async () => {
    const { ctx, tables } = makeCtx();
    const result = await reserveSponsorBudget(
      ctx as never,
      args({ paused: true }) as never,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SPONSOR_FAILURE.PAUSED);
    }
    expect(tables.sponsorUsageBuckets).toHaveLength(0);
    expect(tables.sponsorReservations).toHaveLength(0);
  });

  it("leaves reads working while paused", async () => {
    const { ctx } = makeCtx();
    await reserveSponsorBudget(ctx as never, args() as never);

    // readSponsorUsageSnapshot is the read path used by dashboards and by the
    // confirmation/reconciliation poller; pause must not affect it.
    const usage = await readSponsorUsageSnapshot(ctx as never, {
      userId: IDS.userId as never,
      walletId: IDS.walletId as never,
      groupId: IDS.groupId as never,
      now: args().now,
    });
    expect(usage.userDayReserved).toBeGreaterThan(0n);

    const blocked = await reserveSponsorBudget(
      ctx as never,
      args({ intentId: "settlementIntents:2", paused: true }) as never,
    );
    expect(blocked.ok).toBe(false);

    // And the read is still consistent afterwards.
    const after = await readSponsorUsageSnapshot(ctx as never, {
      userId: IDS.userId as never,
      walletId: IDS.walletId as never,
      groupId: IDS.groupId as never,
      now: args().now,
    });
    expect(after.userDayReserved).toBe(usage.userDayReserved);
  });

  it("reads the kill switch from the environment", () => {
    expect(isSponsorPaused({ SPONSOR_PAUSE: "true" })).toBe(true);
    expect(isSponsorPaused({ SPONSOR_PAUSE: "1" })).toBe(true);
    expect(isSponsorPaused({ SPONSOR_PAUSE: "yes" })).toBe(true);
    expect(isSponsorPaused({ SPONSOR_PAUSE: "no" })).toBe(false);
    expect(isSponsorPaused({})).toBe(false);
  });
});
