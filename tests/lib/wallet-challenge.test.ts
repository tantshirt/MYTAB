import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToBase58 } from "@/lib/solana/decodeTransaction";
import {
  WALLET_LINK_FAILURE,
  buildWalletLinkMessage,
  encodeSignatureBase58,
  verifyWalletLinkSignature,
} from "@/lib/wallet/challenge";

function keypair() {
  const secretKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  return { secretKey, publicKey, address: bytesToBase58(publicKey) };
}

describe("wallet-link challenge verify", () => {
  const expected = { userId: "users:1", nonce: "abc", expiresAt: 1_700_000_000_000 };

  it("recovers the pubkey from a valid signed message", () => {
    const keys = keypair();
    const signedMessage = buildWalletLinkMessage({ ...expected, publicKey: keys.address });
    const signature = encodeSignatureBase58(
      ed25519.sign(new TextEncoder().encode(signedMessage), keys.secretKey),
    );

    expect(
      verifyWalletLinkSignature({ signedMessage, signatureBase58: signature, expected }),
    ).toEqual({ ok: true, publicKey: keys.address });
  });

  it("refuses a message whose key line was swapped", () => {
    const keys = keypair();
    const other = keypair();
    const signedMessage = buildWalletLinkMessage({ ...expected, publicKey: keys.address });
    const signature = encodeSignatureBase58(
      ed25519.sign(new TextEncoder().encode(signedMessage), keys.secretKey),
    );
    const tampered = buildWalletLinkMessage({ ...expected, publicKey: other.address });

    expect(
      verifyWalletLinkSignature({
        signedMessage: tampered,
        signatureBase58: signature,
        expected,
      }),
    ).toEqual({ ok: false, failureCode: WALLET_LINK_FAILURE.SIGNATURE_INVALID });
  });
});
