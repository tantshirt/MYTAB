import { describe, expect, it } from "vitest";
import {
  canExpireIntent,
  expireIntentIfPastDue,
  isIntentPastExpiry,
  sweepExpiredIntents,
} from "../../convex/lib/intentExpiry";
import { SETTLEMENT_STATUS } from "../../convex/lib/settlementState";

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
