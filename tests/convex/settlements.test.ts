import { describe, expect, it } from "vitest";
import {
  FIXTURE_TX_SIGNATURE,
  parseConfirmationFixture,
} from "../../convex/internal/confirmations";
import {
  extractUserSignature,
  fixtureMessageHash,
  hashMessageBytes,
  verifyPartialSignedMessage,
} from "../../convex/lib/solanaFixture";
import { sha256Hex } from "../../lib/crypto/convexCrypto";
import { USDC_MINT } from "../../lib/solana/constants";
import { buildTx, makeActors, signAs, toBase64 } from "../helpers/solanaTx";
import { coSignAndBroadcast } from "../../convex/internal/privy";
import {
  SETTLEMENT_FAILURE,
  SETTLEMENT_STATUS,
  canTransitionSettlementStatus,
} from "../../convex/lib/settlementState";
import { applySettlementOffset } from "../../convex/lib/settlementLedger";

describe("settlement message re-verification (Story 3.5 AC2)", () => {
  const actors = makeActors(20);
  const PAYER = actors.payer.publicKey.toBase58();
  const SPONSOR = actors.sponsor.publicKey.toBase58();

  function signed() {
    const tx = buildTx({ actors });
    const messageHash = sha256Hex(tx.message.serialize());
    signAs(tx, actors.payer);
    return { base64: toBase64(tx), messageHash };
  }

  it("accepts a genuinely signed transaction whose hash matches the stored one", () => {
    const { base64, messageHash } = signed();
    const result = verifyPartialSignedMessage({
      partialSignedTxBase64: base64,
      expectedMessageHash: messageHash,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects the string-marker payload the previous verifier accepted", () => {
    const result = verifyPartialSignedMessage({
      partialSignedTxBase64:
        "fixture-partial-signed-tx-v1::message=fixture-settlement-message-v1::userSig=fixture-user-signature-v1",
      expectedMessageHash: sha256Hex("fixture-settlement-message-v1"),
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("SIGNED_TX_DECODE_FAILED");
    }
  });

  it("rejects when the message hash changed after the quote", () => {
    const { base64 } = signed();
    const result = verifyPartialSignedMessage({
      partialSignedTxBase64: base64,
      expectedMessageHash: sha256Hex("tampered-message"),
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SETTLEMENT_FAILURE.MESSAGE_HASH_MISMATCH);
    }
  });

  it("returns a real base58 signature for duplicate detection", () => {
    const { base64, messageHash } = signed();
    const signature = extractUserSignature({
      partialSignedTxBase64: base64,
      expectedMessageHash: messageHash,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(signature).toBeTruthy();
    expect(signature).not.toContain("fixture");

    // An unverifiable payload yields null, never a fabricated marker string.
    expect(
      extractUserSignature({
        partialSignedTxBase64: "garbage",
        expectedMessageHash: messageHash,
        payerAddress: PAYER,
        sponsorAddress: SPONSOR,
      }),
    ).toBeNull();
  });
});

describe("sponsor co-sign and broadcast fixture (Story 3.5 AC3–AC4)", () => {
  it("returns a fixture signature without client broadcast", async () => {
    const result = await coSignAndBroadcast({
      intentId: "settlementIntents:1",
      partialSignedTxBase64: "fixture-partial-signed-tx-v1",
    });
    expect(result.signature).toBe(FIXTURE_TX_SIGNATURE);
    expect(result.fullySignedTxBase64).toContain("sponsorSig=");
  });
});

describe("confirmation parser fixture (Story 3.6 AC2–AC3)", () => {
  const expectation = {
    messageHash: fixtureMessageHash(),
    recipientAddress: "Recip1111111111111111111111111111111111111",
    outputMint: USDC_MINT,
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
