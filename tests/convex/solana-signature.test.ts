/**
 * Real ed25519 verification of the user's partial signature.
 *
 * The behaviour being replaced accepted any string containing `::userSig=`.
 * Every case below submits something a hostile client could construct and
 * asserts the verifier rejects it.
 */

import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256Hex } from "../../lib/crypto/convexCrypto";
import {
  SIGNATURE_FAILURE,
  verifyPartialSignedTransaction,
} from "../../lib/solana/verifyUserSignature";
import { verifyPartialSignedMessage } from "../../convex/lib/solanaFixture";
import {
  decodeTransactionBase64,
  base58ToBytes,
} from "../../lib/solana/decodeTransaction";
import { buildTx, makeActors, signAs, toBase64 } from "../helpers/solanaTx";

const actors = makeActors(10);
const PAYER = actors.payer.publicKey.toBase58();
const SPONSOR = actors.sponsor.publicKey.toBase58();

function signedFixture() {
  const tx = buildTx({ actors });
  const messageHash = sha256Hex(tx.message.serialize());
  const unsignedBase64 = toBase64(tx);
  signAs(tx, actors.payer);
  return { base64: toBase64(tx), messageHash, unsignedBase64 };
}

function verify(base64: string, messageHash: string, overrides = {}) {
  return verifyPartialSignedTransaction({
    partialSignedTxBase64: base64,
    expectedMessageHash: messageHash,
    payerAddress: PAYER,
    sponsorAddress: SPONSOR,
    ...overrides,
  });
}

describe("valid signature", () => {
  it("accepts a genuine signature over the exact message bytes", () => {
    const { base64, messageHash } = signedFixture();
    const result = verify(base64, messageHash);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageHash).toBe(messageHash);
      expect(result.userSignatureBase58.length).toBeGreaterThan(80);
    }
  });

  it("binds the signature to the stored message bytes, not just the hash", () => {
    const { base64, messageHash, unsignedBase64 } = signedFixture();
    const result = verify(base64, messageHash, {
      expectedSerializedMessageBase64: unsignedBase64,
    });
    expect(result.ok).toBe(true);
  });

  it("returns a distinct signature per message for replay detection", () => {
    const first = signedFixture();
    const tx = buildTx({ actors, amount: 2_000_000n });
    signAs(tx, actors.payer);
    const secondHash = sha256Hex(tx.message.serialize());
    const a = verify(first.base64, first.messageHash);
    const b = verify(toBase64(tx), secondHash);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.userSignatureBase58).not.toBe(b.userSignatureBase58);
    }
  });
});

describe("the marker-format hole is closed", () => {
  it("rejects the old fixture marker string outright", () => {
    // This exact payload used to be accepted and co-signed.
    const legacy =
      "fixture-partial-signed-tx-v1::message=fixture-settlement-message-v1::userSig=fixture-user-signature-v1";
    const result = verify(legacy, sha256Hex("fixture-settlement-message-v1"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SIGNATURE_FAILURE.DECODE_FAILED);
    }
  });

  it("rejects arbitrary base64 that is not a transaction", () => {
    const result = verify(
      Buffer.from("hello world hello world").toString("base64"),
      "0".repeat(64),
    );
    expect(result.ok).toBe(false);
  });
});

describe("signature forgery and omission", () => {
  it("rejects an unsigned transaction", () => {
    const tx = buildTx({ actors });
    const messageHash = sha256Hex(tx.message.serialize());
    const result = verify(toBase64(tx), messageHash);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SIGNATURE_FAILURE.USER_SIGNATURE_MISSING);
    }
  });

  it("rejects a random 64-byte blob in the signature slot", () => {
    const tx = buildTx({ actors });
    const messageHash = sha256Hex(tx.message.serialize());
    const index = tx.message.staticAccountKeys.findIndex((key) =>
      key.equals(actors.payer.publicKey),
    );
    tx.signatures[index] = new Uint8Array(64).fill(7);
    const result = verify(toBase64(tx), messageHash);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SIGNATURE_FAILURE.USER_SIGNATURE_INVALID);
    }
  });

  it("rejects a signature made by a different key", () => {
    // Attack: an attacker signs with their own wallet and submits it as the
    // victim's approval.
    const tx = buildTx({ actors });
    const messageHash = sha256Hex(tx.message.serialize());
    const index = tx.message.staticAccountKeys.findIndex((key) =>
      key.equals(actors.payer.publicKey),
    );
    tx.signatures[index] = ed25519.sign(
      tx.message.serialize(),
      actors.attacker.secretKey.slice(0, 32),
    );
    const result = verify(toBase64(tx), messageHash);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SIGNATURE_FAILURE.USER_SIGNATURE_INVALID);
    }
  });

  it("rejects a valid signature over a DIFFERENT message", () => {
    // Attack: harvest a signature from one approval and staple it onto another
    // transaction whose hash the server is expecting.
    const good = buildTx({ actors });
    const other = buildTx({ actors, amount: 5_000_000n });
    const otherSignature = ed25519.sign(
      other.message.serialize(),
      actors.payer.secretKey.slice(0, 32),
    );
    const index = good.message.staticAccountKeys.findIndex((key) =>
      key.equals(actors.payer.publicKey),
    );
    good.signatures[index] = otherSignature;
    const result = verify(toBase64(good), sha256Hex(good.message.serialize()));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SIGNATURE_FAILURE.USER_SIGNATURE_INVALID);
    }
  });

  it("rejects a transaction that already carries a sponsor signature", () => {
    // Attack: present a fully signed transaction so the pipeline records a
    // broadcast the sponsor never authorised, or replay one already broadcast.
    const { messageHash } = signedFixture();
    const tx = buildTx({ actors });
    signAs(tx, actors.payer);
    signAs(tx, actors.sponsor);
    const result = verify(toBase64(tx), messageHash);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(
        SIGNATURE_FAILURE.SPONSOR_SIGNATURE_PRESENT,
      );
    }
  });
});

describe("message binding", () => {
  it("rejects when the recomputed hash differs from the persisted hash", () => {
    const { base64 } = signedFixture();
    const result = verify(base64, sha256Hex("something else entirely"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SIGNATURE_FAILURE.MESSAGE_HASH_MISMATCH);
    }
  });

  it("rejects when the submitted bytes differ from the stored bytes", () => {
    const { base64, messageHash } = signedFixture();
    const different = buildTx({ actors, amount: 3_000_000n });
    const result = verify(base64, messageHash, {
      expectedSerializedMessageBase64: toBase64(different),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(
        SIGNATURE_FAILURE.MESSAGE_BYTES_MISMATCH,
      );
    }
  });

  it("rejects a fee payer that is not the sponsor", () => {
    const tx = buildTx({ actors, feePayer: actors.payer.publicKey });
    const messageHash = sha256Hex(tx.message.serialize());
    signAs(tx, actors.payer);
    const result = verify(toBase64(tx), messageHash);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SIGNATURE_FAILURE.FEE_PAYER_MISMATCH);
    }
  });

  it("rejects when the payer is not in the signer set", () => {
    const tx = buildTx({
      actors,
      authority: actors.sponsor.publicKey,
      source: base58ToBytes(SPONSOR) && undefined,
    });
    const messageHash = sha256Hex(tx.message.serialize());
    const result = verify(toBase64(tx), messageHash);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe(SIGNATURE_FAILURE.SIGNER_SET_INVALID);
    }
  });
});

describe("convex wrapper", () => {
  it("exposes the same verdict through convex/lib/solanaFixture", () => {
    const { base64, messageHash } = signedFixture();
    const ok = verifyPartialSignedMessage({
      partialSignedTxBase64: base64,
      expectedMessageHash: messageHash,
      payerAddress: PAYER,
      sponsorAddress: SPONSOR,
    });
    expect(ok.ok).toBe(true);

    const bad = verifyPartialSignedMessage({
      partialSignedTxBase64: base64,
      expectedMessageHash: messageHash,
      payerAddress: actors.attacker.publicKey.toBase58(),
      sponsorAddress: SPONSOR,
    });
    expect(bad.ok).toBe(false);
  });
});

describe("wire decoder strictness", () => {
  it("round-trips the exact signed message bytes", () => {
    const { base64 } = signedFixture();
    const decoded = decodeTransactionBase64(base64);
    const tx = buildTx({ actors });
    expect(Buffer.from(decoded.message.serialized).toString("base64")).toBe(
      Buffer.from(tx.message.serialize()).toString("base64"),
    );
  });

  it("rejects trailing bytes", () => {
    const { base64 } = signedFixture();
    const bytes = Buffer.from(base64, "base64");
    const padded = Buffer.concat([bytes, Buffer.from([0, 0])]);
    expect(() =>
      decodeTransactionBase64(padded.toString("base64")),
    ).toThrow(/TRAILING_BYTES/);
  });

  it("rejects a truncated payload", () => {
    const { base64 } = signedFixture();
    const bytes = Buffer.from(base64, "base64");
    expect(() =>
      decodeTransactionBase64(bytes.subarray(0, bytes.length - 5).toString("base64")),
    ).toThrow(/TX_DECODE_/);
  });
});
