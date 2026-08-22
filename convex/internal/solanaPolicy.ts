/**
 * Sponsor policy entry points for the settlement pipeline (AD-10, AD-17).
 *
 * `verifyTransactionAllowlistsFixture()` used to return `{ ok: true }`
 * unconditionally, immediately before the sponsor fee payer co-signed. It has
 * been replaced by `verifyTransactionAllowlists`, which decodes the transaction
 * and runs the full pre-sponsor manifest gate. There is no remaining code path
 * that reaches the sponsor key without that gate returning ok.
 *
 * This module deliberately no longer re-exports FIXTURE_* symbols: a deployed
 * Convex module should not carry fixture constants in its public surface.
 */

import type { Doc } from "../_generated/dataModel";
import { hashMessageBytes, verifyPartialSignedMessage } from "../lib/solanaFixture";
import { isSponsorPaused } from "../sponsorPolicy";
import {
  validateBeforeSponsorCoSign,
  type SettlementIntentValidationContext,
  type ValidationResult,
} from "../../lib/solana/validateTransactionMessage";

export { hashMessageBytes, verifyPartialSignedMessage };

export type SolanaValidationFailure =
  | "MESSAGE_HASH_MISMATCH"
  | "ALLOWLIST_VIOLATION";

type IntentValidationContext = Omit<SettlementIntentValidationContext, "gate">;

/** Builds validation context from a persisted settlement intent (AD-10). */
export function buildValidationContext(
  intent: Doc<"settlementIntents">,
  payerAddress: string,
  sponsorAddress: string,
  overrides: Partial<IntentValidationContext> & {
    blockhash: string;
    lastValidBlockHeight: number;
    status: string;
  },
): IntentValidationContext {
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

/**
 * The real pre-sponsor gate. Runs the full AD-10 manifest against the bytes that
 * are about to be co-signed and broadcast. Any failure rejects; nothing here can
 * return ok without decoding the transaction.
 */
export function verifyTransactionAllowlists(
  serializedBase64: string,
  context: IntentValidationContext,
): ValidationResult {
  return validateBeforeSponsorCoSign(serializedBase64, context);
}

/** Re-exports validation helpers when lib/solana is available (Story 3.4). */
export async function loadSolanaValidation() {
  return import("../../lib/solana/validateTransactionMessage");
}

export async function loadSponsorPolicyManifest() {
  return import("../../lib/solana/sponsorPolicyManifest");
}
