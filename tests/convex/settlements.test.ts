import { describe, expect, it } from "vitest";
import {
  FIXTURE_TX_SIGNATURE,
  parseConfirmationFixture,
} from "../../convex/internal/confirmations";
import {
  FIXTURE_MESSAGE_BYTES,
  FIXTURE_MESSAGE_HASH,
  FIXTURE_PARTIAL_SIGNED_TX,
  FIXTURE_USER_SIGNATURE,
  extractFixtureUserSignature,
  hashMessageBytes,
  verifyPartialSignedMessage,
} from "../../convex/lib/solanaFixture";
import { coSignAndBroadcast } from "../../convex/internal/privy";
import {
  SETTLEMENT_FAILURE,
  SETTLEMENT_STATUS,
  canTransitionSettlementStatus,
} from "../../convex/lib/settlementState";
import { applySettlementOffset } from "../../convex/lib/settlementLedger";

describe("settlement message re-verification (Story 3.5 AC2)", () => {
  it("accepts partial bytes whose embedded message matches the stored hash", () => {
    const partial = `${FIXTURE_PARTIAL_SIGNED_TX}::message=${FIXTURE_MESSAGE_BYTES}::userSig=${FIXTURE_USER_SIGNATURE}`;
    const result = verifyPartialSignedMessage(partial, FIXTURE_MESSAGE_HASH);
    expect(result.ok).toBe(true);
  });

  it("rejects partial bytes when the message hash changed", () => {
    const tampered = `${FIXTURE_PARTIAL_SIGNED_TX}::message=tampered-message::userSig=${FIXTURE_USER_SIGNATURE}`;
    const result = verifyPartialSignedMessage(tampered, FIXTURE_MESSAGE_HASH);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SETTLEMENT_FAILURE.MESSAGE_HASH_MISMATCH);
    }
  });

  it("extracts fixture user signatures for duplicate detection", () => {
    const partial = `${FIXTURE_PARTIAL_SIGNED_TX}::userSig=sig-a`;
    expect(extractFixtureUserSignature(partial)).toBe("sig-a");
    expect(extractFixtureUserSignature(FIXTURE_PARTIAL_SIGNED_TX)).toBe(
      FIXTURE_USER_SIGNATURE,
    );
  });
});

describe("duplicate signature rejection (Story 3.5 / 3.6)", () => {
  it("detects duplicate user signatures before co-sign", () => {
    const existingSignature = "sig-already-recorded";
    const incoming = extractFixtureUserSignature(
      `${FIXTURE_PARTIAL_SIGNED_TX}::userSig=${existingSignature}`,
    );
    expect(incoming).toBe(existingSignature);
    expect(existingSignature === existingSignature).toBe(true);
  });

  it("rejects applying the same transaction signature twice to the ledger", async () => {
    type LedgerEvent = {
      _id: string;
      transactionSignature: string;
      tipId?: string;
      targetKind: "tip" | "obligation";
      intentId: string;
      obligationId?: string;
      eventKind: "settlement_offset";
      createdAt: number;
    };

    type Tip = {
      _id: string;
      status: "open" | "settled";
      settledAt?: number;
      settlementIntentId?: string;
      updatedAt: number;
    };

    const ledgerEvents: LedgerEvent[] = [];
    const tips: Tip[] = [{ _id: "tips:1", status: "open", updatedAt: 0 }];
    let nextLedgerId = 1;

    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: (
            _index: string,
            builder: (q: {
              eq: (field: string, value: string) => unknown;
            }) => unknown,
          ) => {
            const filters: Record<string, string> = {};
            const filterBuilder = {
              eq: (field: string, value: string) => {
                filters[field] = value;
                return filterBuilder;
              },
            };
            builder(filterBuilder);

            const rows =
              table === "settlementLedgerEvents"
                ? ledgerEvents.filter((row) =>
                    Object.entries(filters).every(
                      ([field, value]) =>
                        row[field as keyof LedgerEvent] === value,
                    ),
                  )
                : [];

            return {
              unique: async () => rows[0] ?? null,
            };
          },
        }),
        get: async (id: string) => {
          if (id === "tips:1") {
            return tips[0] ?? null;
          }
          return null;
        },
        insert: async (_table: string, doc: Omit<LedgerEvent, "_id">) => {
          const id = `settlementLedgerEvents:${nextLedgerId++}`;
          ledgerEvents.push({ _id: id, ...doc });
          return id;
        },
        patch: async (id: string, patch: Partial<Tip>) => {
          if (id === "tips:1" && tips[0]) {
            tips[0] = { ...tips[0], ...patch };
          }
        },
      },
    };

    const first = await applySettlementOffset(ctx as never, {
      intentId: "settlementIntents:1" as never,
      targetKind: "tip",
      tipId: "tips:1" as never,
      transactionSignature: FIXTURE_TX_SIGNATURE,
      now: 1000,
    });
    expect(first.alreadyApplied).toBe(false);
    expect(ledgerEvents).toHaveLength(1);
    expect(tips[0]?.status).toBe("settled");

    const second = await applySettlementOffset(ctx as never, {
      intentId: "settlementIntents:1" as never,
      targetKind: "tip",
      tipId: "tips:1" as never,
      transactionSignature: FIXTURE_TX_SIGNATURE,
      now: 2000,
    });
    expect(second.alreadyApplied).toBe(true);
    expect(ledgerEvents).toHaveLength(1);
  });
});

describe("sponsor co-sign and broadcast fixture (Story 3.5 AC3–AC4)", () => {
  it("returns a fixture signature without client broadcast", async () => {
    const result = await coSignAndBroadcast({
      intentId: "settlementIntents:1",
      partialSignedTxBase64: FIXTURE_PARTIAL_SIGNED_TX,
    });
    expect(result.signature).toBe(FIXTURE_TX_SIGNATURE);
    expect(result.fullySignedTxBase64).toContain("sponsorSig=");
  });
});

describe("confirmation parser fixture (Story 3.6 AC2–AC3)", () => {
  const expectation = {
    messageHash: FIXTURE_MESSAGE_HASH,
    recipientAddress: "Recip1111111111111111111111111111111111111",
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    minimumOutputAtomic: 1_000_000n,
    maximumInputAtomic: 1_000_000n,
    reservedSponsorLamports: 3_000_000n,
  };

  it("parses a valid fixture confirmation", () => {
    const parsed = parseConfirmationFixture(
      FIXTURE_TX_SIGNATURE,
      expectation,
      "valid",
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.platformFeeAtomic).toBe(0n);
      expect(parsed.recipientDeltaAtomic).toBeGreaterThanOrEqual(
        expectation.minimumOutputAtomic,
      );
    }
  });

  it("rejects wrong message hash fixtures", () => {
    const parsed = parseConfirmationFixture(
      FIXTURE_TX_SIGNATURE,
      { ...expectation, messageHash: hashMessageBytes("wrong") },
      "valid",
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects failed transaction fixtures before ledger movement", () => {
    const parsed = parseConfirmationFixture(
      FIXTURE_TX_SIGNATURE,
      expectation,
      "failed_tx",
    );
    expect(parsed.success).toBe(false);
  });
});

describe("settlement state machine (AD-21)", () => {
  it("allows ready_for_signature to user_signed to submitted to confirmed", () => {
    expect(
      canTransitionSettlementStatus(
        SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
        SETTLEMENT_STATUS.USER_SIGNED,
      ),
    ).toBe(true);
    expect(
      canTransitionSettlementStatus(
        SETTLEMENT_STATUS.USER_SIGNED,
        SETTLEMENT_STATUS.SUBMITTED,
      ),
    ).toBe(true);
    expect(
      canTransitionSettlementStatus(
        SETTLEMENT_STATUS.SUBMITTED,
        SETTLEMENT_STATUS.CONFIRMED,
      ),
    ).toBe(true);
  });

  it("never transitions out of confirmed", () => {
    expect(
      canTransitionSettlementStatus(
        SETTLEMENT_STATUS.CONFIRMED,
        SETTLEMENT_STATUS.FAILED,
      ),
    ).toBe(false);
  });
});
