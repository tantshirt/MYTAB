import { describe, expect, it } from "vitest";
import {
  computeIntentExpiresAt,
  SETTLEMENT_INTENT_TTL_MS,
} from "../../convex/lib/intentQuoteTtl";
import { expireIntentIfPastDue } from "../../convex/lib/intentExpiry";
import { SETTLEMENT_STATUS } from "../../convex/lib/settlementState";
import { validateBeforeSponsorCoSign } from "../../lib/solana/validateTransactionMessage";
import {
  buildExactUsdcTransfer,
} from "../../lib/solana/buildExactUsdcTransfer";
import {
  FIXTURE_PAYER_WALLET_ADDRESS,
  FIXTURE_RECIPIENT_WALLET_ADDRESS,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
  USDC_MINT,
} from "../../lib/solana/constants";

describe("Story 6.4 — quote TTL and idempotency", () => {
  it("caps expiry at 60 seconds and stores integer milliseconds", () => {
    const now = 1_700_000_000_000;
    const expiresAt = computeIntentExpiresAt(now);
    expect(expiresAt - now).toBeLessThanOrEqual(SETTLEMENT_INTENT_TTL_MS);
    expect(Number.isInteger(expiresAt)).toBe(true);
  });

  it("expires intents on read and blocks sponsor co-sign", async () => {
    const intent = {
      _id: "settlementIntents:1",
      status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
      expiresAt: 100,
      updatedAt: 50,
    };

    const ctx = {
      db: {
        get: async () => null,
        patch: async (_id: string, patch: Record<string, unknown>) => {
          Object.assign(intent, patch);
        },
        query: () => ({
          withIndex: () => ({
            unique: async () => null,
          }),
        }),
      },
    };

    const updated = await expireIntentIfPastDue(ctx as never, intent as never, 200);
    expect(updated.status).toBe(SETTLEMENT_STATUS.EXPIRED);

    const built = buildExactUsdcTransfer({
      payerAddress: FIXTURE_PAYER_WALLET_ADDRESS,
      recipientAddress: FIXTURE_RECIPIENT_WALLET_ADDRESS,
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      amountAtomic: 1_000_000n,
      tipId: "tips:1",
      recipientAtaExists: true,
    });

    const validation = validateBeforeSponsorCoSign(built.serializedBase64, {
      routingKind: "exact_usdc",
      intent: {
        payerAddress: FIXTURE_PAYER_WALLET_ADDRESS,
        recipientAddress: FIXTURE_RECIPIENT_WALLET_ADDRESS,
        inputMint: USDC_MINT,
        outputMint: USDC_MINT,
        targetOutputAtomic: "1000000",
        maxInputAtomic: "1000000",
        minimumOutputAtomic: "1000000",
        status: SETTLEMENT_STATUS.EXPIRED,
        expiresAt: 100,
      },
      sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
      reservationActive: true,
      reservationOwnerIntentId: "settlementIntents:1",
      intentId: "settlementIntents:1",
      nowMs: 200,
    });

    expect(validation.ok).toBe(false);
  });
});
