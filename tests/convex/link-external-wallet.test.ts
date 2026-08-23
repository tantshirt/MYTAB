import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { WALLET_LINK_ARG_KEYS, linkExternalWalletCore } from "../../convex/lib/walletChallenge";
import {
  WALLET_LINK_FAILURE,
  buildWalletLinkMessage,
  encodeSignatureBase58,
} from "../../lib/wallet/challenge";
import { bytesToBase58 } from "../../lib/solana/decodeTransaction";
import { WalletError } from "../../convex/lib/walletSync";
import { createFakeCtx, fakeId } from "../helpers/convexFakeDb";

function keypair() {
  const secretKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  return { secretKey, address: bytesToBase58(publicKey) };
}

function signMessage(message: string, secretKey: Uint8Array): string {
  return encodeSignatureBase58(ed25519.sign(new TextEncoder().encode(message), secretKey));
}

function makeCtx(options?: { subject?: string; otherUserWallet?: { address: string } }) {
  const aliceId = fakeId<"users">("users:alice");
  const bobId = fakeId<"users">("users:bob");
  const now = Date.now();
  const expiresAt = now + 60_000;
  const store = {
    users: [
      {
        _id: aliceId,
        privyDid: "did:privy:alice",
        telegramUserId: "1",
        displayName: "Alice",
      },
      {
        _id: bobId,
        privyDid: "did:privy:bob",
        telegramUserId: "2",
        displayName: "Bob",
      },
    ],
    walletLinkChallenges: [
      {
        _id: "walletLinkChallenges:1",
        userId: aliceId,
        nonce: "nonce-alice",
        expiresAt,
        createdAt: now,
      },
    ],
    wallets: options?.otherUserWallet
      ? [
          {
            _id: "wallets:bob",
            userId: bobId,
            kind: "external" as const,
            provider: "phantom" as const,
            solanaAddress: options.otherUserWallet.address,
            isEmbedded: false,
            isDefaultReceiving: true,
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [],
  };

  const { ctx } = createFakeCtx(store, {
    subject: options?.subject ?? "did:privy:alice",
    tokenIdentifier: "privy.io|did:privy:alice",
  });

  return { ctx, expiresAt };
}

describe("linkExternalWallet — D-21 / H7", () => {
  it("has no address argument", () => {
    expect(WALLET_LINK_ARG_KEYS).not.toContain("solanaAddress");
    expect(WALLET_LINK_ARG_KEYS).not.toContain("address");
    expect(WALLET_LINK_ARG_KEYS).not.toContain("publicKey");
    expect([...WALLET_LINK_ARG_KEYS]).toEqual([
      "challengeId",
      "signedMessage",
      "signature",
      "provider",
    ]);
  });

  it("writes the address recovered from a verified signature", async () => {
    const { ctx, expiresAt } = makeCtx();
    const keys = keypair();
    const message = buildWalletLinkMessage({
      userId: "users:alice",
      nonce: "nonce-alice",
      expiresAt,
      publicKey: keys.address,
    });

    const result = await linkExternalWalletCore(ctx, {
      challengeId: fakeId("walletLinkChallenges:1"),
      signedMessage: message,
      signature: signMessage(message, keys.secretKey),
      provider: "phantom",
    });

    expect(result.created).toBe(true);
    expect(result.solanaAddress).toBe(keys.address);
  });

  it("refuses a tampered signature", async () => {
    const { ctx, expiresAt } = makeCtx();
    const keys = keypair();
    const other = keypair();
    const message = buildWalletLinkMessage({
      userId: "users:alice",
      nonce: "nonce-alice",
      expiresAt,
      publicKey: keys.address,
    });

    await expect(
      linkExternalWalletCore(ctx, {
        challengeId: fakeId("walletLinkChallenges:1"),
        signedMessage: message,
        signature: signMessage(message, other.secretKey),
        provider: "phantom",
      }),
    ).rejects.toMatchObject({ code: WALLET_LINK_FAILURE.SIGNATURE_INVALID });
  });

  it("refuses replay of a consumed challenge", async () => {
    const { ctx, expiresAt } = makeCtx();
    const keys = keypair();
    const message = buildWalletLinkMessage({
      userId: "users:alice",
      nonce: "nonce-alice",
      expiresAt,
      publicKey: keys.address,
    });
    const args = {
      challengeId: fakeId<"walletLinkChallenges">("walletLinkChallenges:1"),
      signedMessage: message,
      signature: signMessage(message, keys.secretKey),
      provider: "phantom" as const,
    };

    await linkExternalWalletCore(ctx, args);
    await expect(linkExternalWalletCore(ctx, args)).rejects.toMatchObject({
      code: WALLET_LINK_FAILURE.CHALLENGE_CONSUMED,
    });
  });

  it("refuses a stranger signing against another user's challenge", async () => {
    const { ctx, expiresAt } = makeCtx({ subject: "did:privy:bob" });
    const keys = keypair();
    const message = buildWalletLinkMessage({
      userId: "users:alice",
      nonce: "nonce-alice",
      expiresAt,
      publicKey: keys.address,
    });

    await expect(
      linkExternalWalletCore(ctx, {
        challengeId: fakeId("walletLinkChallenges:1"),
        signedMessage: message,
        signature: signMessage(message, keys.secretKey),
        provider: "phantom",
      }),
    ).rejects.toMatchObject({ code: WALLET_LINK_FAILURE.CHALLENGE_USER_MISMATCH });
  });

  it("refuses linking an address that already belongs to another user", async () => {
    const keys = keypair();
    const { ctx, expiresAt } = makeCtx({ otherUserWallet: { address: keys.address } });
    const message = buildWalletLinkMessage({
      userId: "users:alice",
      nonce: "nonce-alice",
      expiresAt,
      publicKey: keys.address,
    });

    await expect(
      linkExternalWalletCore(ctx, {
        challengeId: fakeId("walletLinkChallenges:1"),
        signedMessage: message,
        signature: signMessage(message, keys.secretKey),
        provider: "phantom",
      }),
    ).rejects.toBeInstanceOf(WalletError);
  });
});
