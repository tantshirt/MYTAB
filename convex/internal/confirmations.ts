import type { Doc } from "../_generated/dataModel";
import {
  FIXTURE_MESSAGE_HASH,
  FIXTURE_USDC_MINT,
} from "../lib/solanaFixture";

export const FIXTURE_TX_SIGNATURE =
  "FixTureSig1111111111111111111111111111111111111111";

export type ParsedConfirmation = {
  success: true;
  transactionSignature: string;
  messageHash: string;
  recipientTokenAccount: string;
  mint: string;
  recipientDeltaAtomic: bigint;
  payerDebitAtomic: bigint;
  platformFeeAtomic: bigint;
  sponsorDebitLamports: bigint;
};

export type ConfirmationParseFailure = {
  success: false;
  failureCode: string;
};

export type ConfirmationParseResult =
  | ParsedConfirmation
  | ConfirmationParseFailure;

export type ConfirmationExpectation = {
  messageHash: string;
  recipientAddress: string;
  outputMint: string;
  minimumOutputAtomic: bigint;
  maximumInputAtomic: bigint;
  reservedSponsorLamports: bigint;
};

/** Fixture parser for finalized on-chain confirmation (Story 3.6 AC2). */
export function parseConfirmationFixture(
  transactionSignature: string,
  expectation: ConfirmationExpectation,
  fixtureKind: "valid" | "wrong_hash" | "failed_tx" = "valid",
): ConfirmationParseResult {
  if (fixtureKind === "failed_tx") {
    return { success: false, failureCode: "CONFIRMATION_TX_FAILED" };
  }

  if (fixtureKind === "wrong_hash") {
    return { success: false, failureCode: "CONFIRMATION_MESSAGE_HASH" };
  }

  if (transactionSignature !== FIXTURE_TX_SIGNATURE) {
    return { success: false, failureCode: "CONFIRMATION_SIGNATURE_UNKNOWN" };
  }

  if (expectation.messageHash !== FIXTURE_MESSAGE_HASH) {
    return { success: false, failureCode: "CONFIRMATION_MESSAGE_HASH" };
  }

  if (expectation.outputMint !== FIXTURE_USDC_MINT) {
    return { success: false, failureCode: "CONFIRMATION_MINT" };
  }

  const recipientDeltaAtomic = expectation.minimumOutputAtomic;
  const payerDebitAtomic = expectation.maximumInputAtomic;
  const sponsorDebitLamports = 500_000n;

  if (recipientDeltaAtomic < expectation.minimumOutputAtomic) {
    return { success: false, failureCode: "CONFIRMATION_RECIPIENT_DELTA" };
  }

  if (payerDebitAtomic > expectation.maximumInputAtomic) {
    return { success: false, failureCode: "CONFIRMATION_PAYER_DEBIT" };
  }

  if (sponsorDebitLamports > expectation.reservedSponsorLamports) {
    return { success: false, failureCode: "CONFIRMATION_SPONSOR_DEBIT" };
  }

  return {
    success: true,
    transactionSignature,
    messageHash: expectation.messageHash,
    recipientTokenAccount: `${expectation.recipientAddress}-ata`,
    mint: expectation.outputMint,
    recipientDeltaAtomic,
    payerDebitAtomic,
    platformFeeAtomic: 0n,
    sponsorDebitLamports,
  };
}

/** Builds the AD-11 expectation object from a persisted intent. */
export function buildConfirmationExpectation(
  intent: Doc<"settlementIntents">,
): ConfirmationExpectation {
  return {
    messageHash: intent.messageHash ?? "",
    recipientAddress: intent.recipientAddress,
    outputMint: intent.outputMint,
    minimumOutputAtomic: intent.minimumOutputAtomic,
    maximumInputAtomic: intent.maximumInputAtomic,
    reservedSponsorLamports:
      intent.sponsorReservationLamports ?? 3_000_000n,
  };
}
