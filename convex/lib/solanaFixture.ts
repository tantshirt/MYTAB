import { createHash } from "node:crypto";

export const FIXTURE_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const FIXTURE_MESSAGE_BYTES = "fixture-settlement-message-v1";
export const FIXTURE_MESSAGE_HASH = createHash("sha256")
  .update(FIXTURE_MESSAGE_BYTES)
  .digest("hex");
export const FIXTURE_PARTIAL_SIGNED_TX = "fixture-partial-signed-tx-v1";
export const FIXTURE_FULL_SIGNED_TX = "fixture-full-signed-tx-v1";
export const FIXTURE_USER_SIGNATURE = "fixture-user-signature-v1";

export type SolanaFixtureValidationFailure = "MESSAGE_HASH_MISMATCH";

function readFixtureSegment(payload: string, key: string): string | null {
  const marker = `::${key}=`;
  const start = payload.indexOf(marker);
  if (start < 0) {
    return null;
  }
  const valueStart = start + marker.length;
  const nextMarker = payload.indexOf("::", valueStart);
  return nextMarker >= 0
    ? payload.slice(valueStart, nextMarker)
    : payload.slice(valueStart);
}

/** Deterministic hash for fixture message bytes (Story 3.5 AC2). */
export function hashMessageBytes(messageBytes: string): string {
  return createHash("sha256").update(messageBytes).digest("hex");
}

/** Re-parses partially signed bytes and rejects message changes (AD-10 stub). */
export function verifyPartialSignedMessage(
  partialSignedTxBase64: string,
  expectedMessageHash: string,
): { ok: true } | { ok: false; failureCode: SolanaFixtureValidationFailure } {
  const messageBytes =
    readFixtureSegment(partialSignedTxBase64, "message") ??
    FIXTURE_MESSAGE_BYTES;

  const actualHash = hashMessageBytes(messageBytes);
  if (actualHash !== expectedMessageHash) {
    return { ok: false, failureCode: "MESSAGE_HASH_MISMATCH" };
  }

  return { ok: true };
}

/** Extracts the user signature marker from fixture partial bytes. */
export function extractFixtureUserSignature(
  partialSignedTxBase64: string,
): string {
  return (
    readFixtureSegment(partialSignedTxBase64, "userSig") ??
    FIXTURE_USER_SIGNATURE
  );
}
