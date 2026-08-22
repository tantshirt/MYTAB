/**
 * Real ed25519 verification of the user's partial signature (AD-9, AD-10, FR-S5).
 *
 * This replaces a string-marker "verification" (`::message=…::userSig=…`) that
 * accepted any payload shaped like the marker format. Nothing here trusts a
 * client-supplied field: the message bytes are re-derived from the submitted
 * transaction, the hash is recomputed, and the signature is checked against the
 * public key the SERVER holds for the payer.
 */

import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256Hex, timingSafeEqualHex } from "../crypto/convexCrypto";
import {
  base58ToBytes,
  base64ToBytes,
  bytesToBase58,
  decodeTransaction,
  isEmptySignature,
  TransactionDecodeError,
  type DecodedTransaction,
} from "./decodeTransaction";

export const SIGNATURE_FAILURE = {
  DECODE_FAILED: "SIGNED_TX_DECODE_FAILED",
  MESSAGE_HASH_MISMATCH: "MESSAGE_HASH_MISMATCH",
  MESSAGE_BYTES_MISMATCH: "MESSAGE_BYTES_MISMATCH",
  FEE_PAYER_MISMATCH: "FEE_PAYER_MISMATCH",
  SIGNER_SET_INVALID: "SIGNER_SET_INVALID",
  USER_SIGNATURE_MISSING: "USER_SIGNATURE_MISSING",
  USER_SIGNATURE_INVALID: "USER_SIGNATURE_INVALID",
  SPONSOR_SIGNATURE_PRESENT: "SPONSOR_SIGNATURE_PRESENT",
  PAYER_ADDRESS_INVALID: "PAYER_ADDRESS_INVALID",
} as const;

export type SignatureFailureCode =
  (typeof SIGNATURE_FAILURE)[keyof typeof SIGNATURE_FAILURE];

export type VerifyPartialSignatureInput = {
  /** Base64 transaction bytes as submitted by the client. */
  partialSignedTxBase64: string;
  /** Hash persisted when the intent moved to ready_for_signature. */
  expectedMessageHash: string;
  /** Payer's Solana address, read from the server-owned wallet record. */
  payerAddress: string;
  /** Sponsor fee-payer address, read from server configuration. */
  sponsorAddress: string;
  /**
   * The exact bytes the server built and stored. When present, the submitted
   * message must be byte-identical, not merely hash-equal.
   */
  expectedSerializedMessageBase64?: string;
};

export type VerifyPartialSignatureResult =
  | {
      ok: true;
      messageHash: string;
      /** Base58 of the user's 64-byte signature — used for replay detection. */
      userSignatureBase58: string;
      decoded: DecodedTransaction;
    }
  | { ok: false; failureCode: SignatureFailureCode; detail?: string };

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

/**
 * Verifies that `partialSignedTxBase64` is the server's own message, signed by
 * the expected user wallet and by nobody else.
 *
 * Rules, each with the attack it closes:
 *
 *  R1 decode — malformed / trailing bytes reject.
 *      Prevents a payload that this validator parses one way and a downstream
 *      broadcaster parses another.
 *  R2 message hash — recomputed over the submitted bytes, compared in constant
 *      time to the hash persisted at ready_for_signature.
 *      Prevents swapping a different transaction in after the quote.
 *  R3 message bytes — byte-identical to the stored message when available.
 *      Prevents a second preimage or an encoding variant that hashes alike.
 *  R4 fee payer — index 0 must be the sponsor.
 *      Prevents making some other account pay, or hiding the sponsor deeper in
 *      the key list where the signer-set check would still pass.
 *  R5 signer set — exactly {payer, sponsor}.
 *      Prevents adding a third required signer whose empty slot the chain will
 *      reject only after the sponsor has already signed, and prevents dropping
 *      the payer so the sponsor alone authorises the transfer.
 *  R6 user slot filled and cryptographically valid over the exact message bytes,
 *      under the payer's public key.
 *      Prevents an unsigned or forged submission — the original hole, where any
 *      string containing `::userSig=` was accepted.
 *  R7 sponsor slot empty.
 *      Prevents a client presenting a transaction that already claims a sponsor
 *      signature, and prevents replaying a fully signed transaction back through
 *      the co-sign path.
 */
export function verifyPartialSignedTransaction(
  input: VerifyPartialSignatureInput,
): VerifyPartialSignatureResult {
  let decoded: DecodedTransaction;
  try {
    decoded = decodeTransaction(base64ToBytes(input.partialSignedTxBase64));
  } catch (error) {
    return {
      ok: false,
      failureCode: SIGNATURE_FAILURE.DECODE_FAILED,
      detail:
        error instanceof TransactionDecodeError ? error.code : "unparseable",
    };
  }

  const { message, signatures } = decoded;

  // R2 — hash binding.
  const messageHash = sha256Hex(message.serialized);
  if (!timingSafeEqualHex(messageHash, input.expectedMessageHash)) {
    return { ok: false, failureCode: SIGNATURE_FAILURE.MESSAGE_HASH_MISMATCH };
  }

  // R3 — byte binding.
  if (input.expectedSerializedMessageBase64) {
    let expectedBytes: Uint8Array;
    try {
      const expectedTx = decodeTransaction(
        base64ToBytes(input.expectedSerializedMessageBase64),
      );
      expectedBytes = expectedTx.message.serialized;
    } catch {
      return {
        ok: false,
        failureCode: SIGNATURE_FAILURE.MESSAGE_BYTES_MISMATCH,
        detail: "stored message is not decodable",
      };
    }
    if (!bytesEqual(expectedBytes, message.serialized)) {
      return { ok: false, failureCode: SIGNATURE_FAILURE.MESSAGE_BYTES_MISMATCH };
    }
  }

  // R4 — fee payer.
  if (message.staticAccountKeys[0] !== input.sponsorAddress) {
    return { ok: false, failureCode: SIGNATURE_FAILURE.FEE_PAYER_MISMATCH };
  }

  // R5 — signer set is exactly {payer, sponsor}.
  const signerKeys = message.staticAccountKeys.slice(
    0,
    message.numRequiredSignatures,
  );
  const signerSet = new Set(signerKeys);
  if (
    message.numRequiredSignatures !== 2 ||
    signerSet.size !== 2 ||
    !signerSet.has(input.payerAddress) ||
    !signerSet.has(input.sponsorAddress)
  ) {
    return { ok: false, failureCode: SIGNATURE_FAILURE.SIGNER_SET_INVALID };
  }

  const payerIndex = signerKeys.indexOf(input.payerAddress);
  const sponsorIndex = signerKeys.indexOf(input.sponsorAddress);
  const userSignature = signatures[payerIndex];
  const sponsorSignature = signatures[sponsorIndex];

  if (!userSignature || isEmptySignature(userSignature)) {
    return { ok: false, failureCode: SIGNATURE_FAILURE.USER_SIGNATURE_MISSING };
  }

  // R7 — sponsor slot must still be empty.
  if (sponsorSignature && !isEmptySignature(sponsorSignature)) {
    return {
      ok: false,
      failureCode: SIGNATURE_FAILURE.SPONSOR_SIGNATURE_PRESENT,
    };
  }

  let payerKeyBytes: Uint8Array;
  try {
    payerKeyBytes = base58ToBytes(input.payerAddress);
  } catch {
    return { ok: false, failureCode: SIGNATURE_FAILURE.PAYER_ADDRESS_INVALID };
  }
  if (payerKeyBytes.length !== 32) {
    return { ok: false, failureCode: SIGNATURE_FAILURE.PAYER_ADDRESS_INVALID };
  }

  // R6 — real ed25519 verification over the exact signed bytes.
  // zip215:false is RFC8032 / FIPS 186-5 strict, matching ed25519-dalek
  // verify_strict as used by the Solana runtime. Being at least as strict as the
  // chain means we can only ever reject a transaction the chain would accept,
  // never the reverse.
  let valid = false;
  try {
    valid = ed25519.verify(userSignature, message.serialized, payerKeyBytes, {
      zip215: false,
    });
  } catch {
    valid = false;
  }

  if (!valid) {
    return { ok: false, failureCode: SIGNATURE_FAILURE.USER_SIGNATURE_INVALID };
  }

  return {
    ok: true,
    messageHash,
    userSignatureBase58: bytesToBase58(userSignature),
    decoded,
  };
}
