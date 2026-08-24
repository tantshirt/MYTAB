import { describe, expect, it } from "vitest";
import {
  canExpireIntent,
  expireIntentIfPastDue,
  isIntentPastExpiry,
  sweepExpiredIntents,
} from "../../convex/lib/intentExpiry";
import { SETTLEMENT_STATUS } from "../../convex/lib/settlementState";
import { createFakeCtx } from "../helpers/convexFakeDb";

type IntentDoc = {
  _id: string;
  status: string;
  expiresAt: number;
  updatedAt: number;
};

function createExpiryStore(initialIntents: IntentDoc[] = []) {
  const intents = [...initialIntents];
  const reservations: Array<{ intentId: string; status: string }> = [];

  const ctx = {
    db: {
      get: async () => null,
      patch: async (id: string, patch: Partial<IntentDoc>) => {
        const index = intents.findIndex((row) => row._id === id);
        if (index >= 0) {
          intents[index] = { ...intents[index]!, ...patch };
        }
      },
      query: (table: string) => {
        if (table === "sponsorReservations") {
          return {
            withIndex: () => ({
              unique: async () => null,
            }),
          };
        }
        if (table === "providerConcurrencyLeases") {
          return { withIndex: () => ({ unique: async () => null }) };
        }

        if (table !== "settlementIntents") {
          throw new Error(`unexpected table ${table}`);
        }

        return {
          withIndex: (_index: string, filter: (q: { eq: (field: string, value: string) => unknown }) => unknown) => {
            const statusFilter = filter({
              eq: (_field: string, value: string) => value,
            }) as string;

            return {
              collect: async () =>
                intents.filter((intent) => intent.status === statusFilter),
            };
          },
        };
      },
    },
  };

  return { ctx: ctx as never, intents, reservations };
}

describe("Story 3.9 — intent expiry", () => {
  it("detects past-due intents in expirable statuses", () => {
    expect(canExpireIntent(SETTLEMENT_STATUS.READY_FOR_SIGNATURE)).toBe(true);
    expect(canExpireIntent(SETTLEMENT_STATUS.SUBMITTED)).toBe(false);
    expect(isIntentPastExpiry({ expiresAt: 100 }, 200)).toBe(true);
  });

  it("transitions stale ready_for_signature intents to expired", async () => {
    const { ctx, intents } = createExpiryStore([
      {
        _id: "intents:1",
        status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
        expiresAt: 100,
        updatedAt: 50,
      },
    ]);

    const updated = await expireIntentIfPastDue(
      ctx,
      intents[0] as never,
      200,
    );

    expect(updated.status).toBe(SETTLEMENT_STATUS.EXPIRED);
    expect(intents[0]?.status).toBe(SETTLEMENT_STATUS.EXPIRED);
  });

  it("releases sponsor and DFlow leases when an intent expires", async () => {
    const store = {
      settlementIntents: [{
        _id: "settlementIntents:1",
        userId: "users:payer",
        walletId: "wallets:payer",
        groupId: "groups:g1",
        status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
        expiresAt: 100,
        updatedAt: 50,
      }],
      sponsorReservations: [{
        _id: "sponsorReservations:1",
        intentId: "settlementIntents:1",
        status: "active",
        reservedLamports: 1_000_000n,
        createdAt: 1,
        updatedAt: 1,
      }],
      providerConcurrencyLeases: [{
        _id: "providerConcurrencyLeases:1",
        intentId: "settlementIntents:1",
        status: "active",
        userId: "users:payer",
        groupId: "groups:g1",
        windowKey: "2026-8-24-12",
        reservedAttempts: 5,
        usedAttempts: 0,
        createdAt: 1,
        updatedAt: 1,
      }],
      sponsorUsageBuckets: [],
      providerUsageBuckets: [],
    };
    const { ctx } = createFakeCtx(store);
    const updated = await expireIntentIfPastDue(
      ctx,
      store.settlementIntents[0] as never,
      200,
    );
    expect(updated.status).toBe(SETTLEMENT_STATUS.EXPIRED);
    expect(store.sponsorReservations[0]!.status).toBe("released");
    expect(store.providerConcurrencyLeases[0]!.status).toBe("released");
  });

  it("sweeps expired intents for the cron handler", async () => {
    const { ctx } = createExpiryStore([
      {
        _id: "intents:1",
        status: SETTLEMENT_STATUS.QUOTING,
        expiresAt: 100,
        updatedAt: 50,
      },
      {
        _id: "intents:2",
        status: SETTLEMENT_STATUS.QUOTING,
        expiresAt: 500,
        updatedAt: 50,
      },
    ]);

    const result = await sweepExpiredIntents(ctx, 200);
    expect(result.expiredCount).toBe(1);
    expect(result.scannedCount).toBe(2);
  });
});
