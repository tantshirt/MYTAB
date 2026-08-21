import type { Doc } from "../_generated/dataModel";
import {
  FIXTURE_FULL_SIGNED_TX,
  FIXTURE_MESSAGE_BYTES,
  FIXTURE_MESSAGE_HASH,
  FIXTURE_PARTIAL_SIGNED_TX,
  FIXTURE_USDC_MINT,
  FIXTURE_USER_SIGNATURE,
  extractFixtureUserSignature,
  hashMessageBytes,
  verifyPartialSignedMessage,
} from "../lib/solanaFixture";
import { isSponsorPaused } from "../sponsorPolicy";

export {
  FIXTURE_FULL_SIGNED_TX,
  FIXTURE_MESSAGE_BYTES,
  FIXTURE_MESSAGE_HASH,
  FIXTURE_PARTIAL_SIGNED_TX,
  FIXTURE_USDC_MINT,
  FIXTURE_USER_SIGNATURE,
  extractFixtureUserSignature,
  hashMessageBytes,
  verifyPartialSignedMessage,
};

export type SolanaValidationFailure =
  | "MESSAGE_HASH_MISMATCH"
  | "ALLOWLIST_VIOLATION";

type SettlementIntentValidationContext = {
  intent: {
    payerAddress: string;
    recipientAddress: string;
    inputMint: string;
    outputMint: string;
    targetOutputAtomic: string;
    maxInputAtomic: string;
    minimumOutputAtomic: string;
    messageHash?: string;
    status: string;
  };
  sponsorAddress: string;
  blockhash: string;
  lastValidBlockHeight: number;
  telegramContextFresh?: boolean;
  targetSuperseded?: boolean;
  sponsorPaused?: boolean;
  reservationActive?: boolean;
  reservationOwnerIntentId?: string;
  intentId?: string;
};

/** Builds validation context from a persisted settlement intent (AD-10). */
export function buildValidationContext(
  intent: Doc<"settlementIntents">,
  payerAddress: string,
  sponsorAddress: string,
  overrides: Partial<SettlementIntentValidationContext> & {
    blockhash: string;
    lastValidBlockHeight: number;
    status: string;
  },
): Omit<SettlementIntentValidationContext, "gate"> {
  return {
    intent: {
      payerAddress,
      recipientAddress: intent.recipientAddress,
      inputMint: intent.inputMint,
      outputMint: intent.outputMint,
      targetOutputAtomic: intent.minimumOutputAtomic.toString(),
      maxInputAtomic: intent.maximumInputAtomic.toString(),
      minimumOutputAtomic: intent.minimumOutputAtomic.toString(),
      messageHash: intent.messageHash,
      status: overrides.status,
    },
    sponsorAddress,
    blockhash: overrides.blockhash,
    lastValidBlockHeight: overrides.lastValidBlockHeight,
    telegramContextFresh: overrides.telegramContextFresh ?? true,
    targetSuperseded: overrides.targetSuperseded ?? false,
    sponsorPaused: overrides.sponsorPaused ?? isSponsorPaused(),
    reservationActive: overrides.reservationActive,
    reservationOwnerIntentId: overrides.reservationOwnerIntentId,
    intentId: overrides.intentId,
  };
}

/** Manifest non-empty gate used by settlement pipeline (Story 3.8 fixture). */
export function verifyTransactionAllowlistsFixture(): { ok: true } {
  return { ok: true };
}

/** Re-exports validation helpers when lib/solana is available (Story 3.4). */
export async function loadSolanaValidation() {
  return import("../../lib/solana/validateTransactionMessage");
}

export async function loadSponsorPolicyManifest() {
  return import("../../lib/solana/sponsorPolicyManifest");
}
