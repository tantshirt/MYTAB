import { describe, expect, it } from "vitest";
import {
  buildExactUsdcTransfer,
  parseVersionedTransactionBase64,
} from "../../lib/solana/buildExactUsdcTransfer";
import {
  FIXTURE_PAYER_WALLET_ADDRESS,
  FIXTURE_RECIPIENT_WALLET_ADDRESS,
  FIXTURE_SPONSOR_WALLET_ADDRESS,
} from "../../lib/solana/constants";
import {
  runDualGateValidation,
  validateBeforeClientExposure,
  validateBeforeSponsorCoSign,
} from "../../lib/solana/validateTransactionMessage";
import { SPONSOR_POLICY_V1 } from "../../lib/solana/sponsorPolicyManifest";
import { SETTLEMENT_STATUS } from "../../convex/lib/settlementState";

const PAYER = FIXTURE_PAYER_WALLET_ADDRESS;
const RECIPIENT = FIXTURE_RECIPIENT_WALLET_ADDRESS;

function buildValidFixtureTx(recipientAtaExists = true) {
  return buildExactUsdcTransfer({
    payerAddress: PAYER,
    recipientAddress: RECIPIENT,
    sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
    amountAtomic: 1_000_000n,
    tipId: "tips:validate",
    recipientAtaExists,
  });
}

function baseContext(status: string) {
  const built = buildValidFixtureTx();
  return {
    intent: {
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      targetOutputAtomic: "1000000",
      maxInputAtomic: "1000000",
      minimumOutputAtomic: "1000000",
      status,
    },
    sponsorAddress: FIXTURE_SPONSOR_WALLET_ADDRESS,
    blockhash: built.blockhash,
    lastValidBlockHeight: built.lastValidBlockHeight,
    telegramContextFresh: true,
    targetSuperseded: false,
    sponsorPaused: false,
    intentId: "settlementIntents:1",
  };
}

describe("Story 3.4 — sponsor-v1 manifest", () => {
  it("defines a non-empty program and mint allowlist", () => {
    expect(SPONSOR_POLICY_V1.version).toBe("sponsor-v1");
    expect(SPONSOR_POLICY_V1.allowedPrograms.length).toBeGreaterThan(0);
    expect(SPONSOR_POLICY_V1.allowedMints).toContain(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    );
    expect(SPONSOR_POLICY_V1.platformFeeBps).toBe(0);
  });
});

describe("Story 3.4 — validateTransactionMessage dual gate", () => {
  it("passes a valid fixture transaction at both gates", () => {
    const built = buildValidFixtureTx();
    const context = baseContext(SETTLEMENT_STATUS.READY_FOR_SIGNATURE);
    const gates = runDualGateValidation(built.serializedBase64, context);

    expect(gates.preClient.ok).toBe(true);
    expect(gates.preSponsor.ok).toBe(true);
  });

  it("runs the same validator before client exposure and before sponsor co-sign", () => {
    const built = buildValidFixtureTx();
    const context = baseContext(SETTLEMENT_STATUS.READY_FOR_SIGNATURE);

    const preClient = validateBeforeClientExposure(built.serializedBase64, context);
    const preSponsor = validateBeforeSponsorCoSign(built.serializedBase64, {
      ...context,
      reservationActive: true,
      reservationOwnerIntentId: context.intentId,
    });

    expect(preClient.ok).toBe(true);
    expect(preSponsor.ok).toBe(true);
  });
});

describe("Story 3.4 — mutation rejection fixtures", () => {
  it("rejects stale blockhash", () => {
    const built = buildValidFixtureTx();
    const result = validateBeforeClientExposure(built.serializedBase64, {
      ...baseContext(SETTLEMENT_STATUS.QUOTING),
      blockhash: "11111111111111111111111111111112",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BLOCKHASH_STALE");
    }
  });

  it("rejects when sponsor is paused", () => {
    const built = buildValidFixtureTx();
    const result = validateBeforeClientExposure(built.serializedBase64, {
      ...baseContext(SETTLEMENT_STATUS.QUOTING),
      sponsorPaused: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SPONSOR_PAUSED");
    }
  });

  it("rejects missing reservation at pre-sponsor gate", () => {
    const built = buildValidFixtureTx();
    const result = validateBeforeSponsorCoSign(built.serializedBase64, {
      ...baseContext(SETTLEMENT_STATUS.READY_FOR_SIGNATURE),
      reservationActive: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RESERVATION_MISSING");
    }
  });

  it("rejects self payment", () => {
    const built = buildValidFixtureTx();
    const context = baseContext(SETTLEMENT_STATUS.QUOTING);
    const result = validateBeforeClientExposure(built.serializedBase64, {
      ...context,
      intent: { ...context.intent, recipientAddress: PAYER },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("SELF_PAYMENT");
    }
  });

  it("rejects an increased transfer amount after bytes are returned", () => {
    const built = buildValidFixtureTx();
    const tx = parseVersionedTransactionBase64(built.serializedBase64);
    for (const compiled of tx.message.compiledInstructions) {
      const programKey =
        tx.message.staticAccountKeys[compiled.programIdIndex]?.toBase58();
      if (programKey === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" && compiled.data[0] === 3) {
        const data = Buffer.from(compiled.data);
        data.writeBigUInt64LE(9_000_000n, 1);
        compiled.data = new Uint8Array(data);
      }
    }
    const tampered = Buffer.from(tx.serialize()).toString("base64");

    const result = validateBeforeClientExposure(tampered, baseContext(SETTLEMENT_STATUS.QUOTING));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("MAX_INPUT_EXCEEDED");
    }
  });
});

describe("Story 3.4 — platform fee policy", () => {
  it("asserts zero platform fee in manifest", () => {
    expect(SPONSOR_POLICY_V1.platformFeeBps).toBe(0);
  });
});
