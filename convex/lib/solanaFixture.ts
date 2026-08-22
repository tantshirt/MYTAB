/**
 * Settlement signature verification for the Convex runtime.
 *
 * Historically this module "verified" a partially signed transaction by parsing
 * a string marker (`::message=…::userSig=…`) out of the submitted payload. That
 * was not cryptography: any string containing the markers was accepted, and the
 * server then co-signed with the sponsor fee payer. Everything below performs
 * real ed25519 verification over the exact serialized message bytes.
 *
 * The fixture constants that remain are used only by explicitly guarded fixture
 * paths; none of them is reachable on a deployment.
 */

import { sha256Hex } from "../../lib/crypto/convexCrypto";
import { resolveUsdcMint } from "../../lib/solana/cluster";
import { assertFixturePathAllowed } from "../../lib/solana/runtimeGuard";
import {
  SIGNATURE_FAILURE,
  verifyPartialSignedTransaction,
  type SignatureFailureCode,
} from "../../lib/solana/verifyUserSignature";

export type SolanaSignatureFailureCode = SignatureFailureCode;

/** @deprecated name kept for existing failure-code comparisons. */
export type SolanaFixtureValidationFailure = SignatureFailureCode;

export { SIGNATURE_FAILURE };

/** USDC mint for the ACTIVE cluster — not a mainnet literal. */
export function expectedUsdcMint(): string {
  return resolveUsdcMint();
}

/** SHA-256 of message bytes, hex. Same function the intent hash is stored with. */
export function hashMessageBytes(messageBytes: string | Uint8Array): string {
  return sha256Hex(messageBytes);
}

export type VerifyUserSignedInput = {
  partialSignedTxBase64: string;
  expectedMessageHash: string;
  payerAddress: string;
  sponsorAddress: string;
  expectedSerializedMessageBase64?: string;
};

export type VerifyUserSignedResult =
  | { ok: true; messageHash: string; userSignature: string }
  | { ok: false; failureCode: SignatureFailureCode; detail?: string };

/**
 * Re-parses partially signed bytes and verifies the user's ed25519 signature
 * over the exact message the server built (AD-9, AD-10). A mismatch rejects —
 * there is no fall-through path.
 */
export function verifyPartialSignedMessage(
  input: VerifyUserSignedInput,
): VerifyUserSignedResult {
  const result = verifyPartialSignedTransaction({
    partialSignedTxBase64: input.partialSignedTxBase64,
    expectedMessageHash: input.expectedMessageHash,
    payerAddress: input.payerAddress,
    sponsorAddress: input.sponsorAddress,
    expectedSerializedMessageBase64: input.expectedSerializedMessageBase64,
  });

  if (!result.ok) {
    return {
      ok: false,
      failureCode: result.failureCode,
      ...(result.detail ? { detail: result.detail } : {}),
    };
  }

  return {
    ok: true,
    messageHash: result.messageHash,
    userSignature: result.userSignatureBase58,
  };
}

/**
 * The user's signature, base58, taken from the verified transaction. Callers must
 * verify first — this exists so replay detection compares a real signature rather
 * than a marker string.
 */
export function extractUserSignature(
  input: VerifyUserSignedInput,
): string | null {
  const result = verifyPartialSignedMessage(input);
  return result.ok ? result.userSignature : null;
}

// ---------------------------------------------------------------------------
// Fixture constants. Guarded accessors only — every consumer must prove that a
// fixture path is permitted on this runtime before it can read one.
// ---------------------------------------------------------------------------

const FIXTURE_MESSAGE_BYTES_VALUE = "fixture-settlement-message-v1";

export function fixtureMessageBytes(): string {
  assertFixturePathAllowed("solanaFixture.messageBytes");
  return FIXTURE_MESSAGE_BYTES_VALUE;
}

export function fixtureMessageHash(): string {
  assertFixturePathAllowed("solanaFixture.messageHash");
  return sha256Hex(FIXTURE_MESSAGE_BYTES_VALUE);
}
