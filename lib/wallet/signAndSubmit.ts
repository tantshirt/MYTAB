/**
 * Isolated client-signed submit helper for external wallets (Phase 2).
 *
 * The prepared transaction is signed locally, then handed to
 * `settlements.recordUserSigned`. That mutation reads the payer off
 * `intent.walletId` and runs the unchanged validation gate. This helper
 * never invents a success — a missing signature or a refused submit throws.
 *
 * Phase 3 wires the DFlow picker; this is the seam it calls.
 */

import { bytesToBase64 } from "../crypto/convexCrypto";

export type SignPreparedTransaction = (transactionBytes: Uint8Array) => Promise<Uint8Array>;

export type SubmitUserSigned = (input: {
  intentId: string;
  partialSignedTxBase64: string;
}) => Promise<{ intentId: string; status: string }>;

export const SIGN_AND_SUBMIT_FAILURE = {
  SIGN_FAILED: "EXTERNAL_SIGN_FAILED",
  EMPTY_SIGNATURE: "EXTERNAL_SIGN_EMPTY",
  SUBMIT_FAILED: "EXTERNAL_SUBMIT_FAILED",
} as const;

export class SignAndSubmitError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "SignAndSubmitError";
  }
}

export type SignAndSubmitPreparedIntentInput = {
  intentId: string;
  /** Base64 of the server-built transaction the wallet must sign. */
  preparedTxBase64: string;
  signTransaction: SignPreparedTransaction;
  submit: SubmitUserSigned;
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Sign the server-prepared transaction and submit the partial-signed bytes.
 * Does not broadcast, does not skip the gate, does not stub success.
 */
export async function signAndSubmitPreparedIntent(
  input: SignAndSubmitPreparedIntentInput,
): Promise<{ intentId: string; status: string }> {
  let signed: Uint8Array;
  try {
    signed = await input.signTransaction(decodeBase64(input.preparedTxBase64));
  } catch (error) {
    throw new SignAndSubmitError(
      SIGN_AND_SUBMIT_FAILURE.SIGN_FAILED,
      error instanceof Error ? error.message : undefined,
    );
  }

  if (signed.length === 0) {
    throw new SignAndSubmitError(SIGN_AND_SUBMIT_FAILURE.EMPTY_SIGNATURE);
  }

  try {
    return await input.submit({
      intentId: input.intentId,
      partialSignedTxBase64: bytesToBase64(signed),
    });
  } catch (error) {
    throw new SignAndSubmitError(
      SIGN_AND_SUBMIT_FAILURE.SUBMIT_FAILED,
      error instanceof Error ? error.message : undefined,
    );
  }
}
