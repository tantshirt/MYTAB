import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { randomBase64Url } from "../../lib/crypto/convexCrypto";
import {
  WALLET_LINK_CHALLENGE_TTL_MS,
  WALLET_LINK_FAILURE,
  buildWalletLinkMessagePrefix,
  verifyWalletLinkSignature,
} from "../../lib/wallet/challenge";
import { isExternalWalletProvider } from "../../lib/wallet/providers";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./auth";
import { WalletError } from "./walletSync";
import {
  findWalletBySolanaAddress,
  upsertExternalWallet,
} from "./walletSync";

export const WALLET_LINK_ARG_KEYS = [
  "challengeId",
  "signedMessage",
  "signature",
  "provider",
] as const;

export type IssueWalletLinkChallengeResult = {
  challengeId: Id<"walletLinkChallenges">;
  nonce: string;
  expiresAt: number;
  userId: string;
  messagePrefix: string;
};

export async function issueWalletLinkChallenge(
  ctx: MutationCtx,
): Promise<IssueWalletLinkChallengeResult> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("walletLinkChallenges")
    .withIndex("by_user_id", (q) => q.eq("userId", user._id))
    .collect();

  for (const row of existing) {
    if (row.consumedAt === undefined && row.expiresAt > now) {
      await ctx.db.patch(row._id, { consumedAt: now });
    }
  }

  const nonce = randomBase64Url(32);
  const expiresAt = now + WALLET_LINK_CHALLENGE_TTL_MS;
  const challengeId = await ctx.db.insert("walletLinkChallenges", {
    userId: user._id,
    nonce,
    expiresAt,
    createdAt: now,
  });

  return {
    challengeId,
    nonce,
    expiresAt,
    userId: user._id,
    messagePrefix: buildWalletLinkMessagePrefix({
      userId: user._id,
      nonce,
      expiresAt,
    }),
  };
}

export type LinkExternalWalletArgs = {
  challengeId: Id<"walletLinkChallenges">;
  signedMessage: string;
  signature: string;
  provider: string;
};

export async function linkExternalWalletCore(
  ctx: MutationCtx,
  args: LinkExternalWalletArgs,
): Promise<{ walletId: Id<"wallets">; created: boolean; solanaAddress: string }> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  if (!isExternalWalletProvider(args.provider)) {
    throw new WalletError(WALLET_LINK_FAILURE.PROVIDER_INVALID);
  }

  const challenge = await ctx.db.get(args.challengeId);
  if (!challenge) {
    throw new WalletError(WALLET_LINK_FAILURE.CHALLENGE_NOT_FOUND);
  }

  if (challenge.userId !== user._id) {
    throw new WalletError(WALLET_LINK_FAILURE.CHALLENGE_USER_MISMATCH);
  }

  const now = Date.now();
  if (challenge.consumedAt !== undefined) {
    throw new WalletError(WALLET_LINK_FAILURE.CHALLENGE_CONSUMED);
  }
  if (challenge.expiresAt <= now) {
    throw new WalletError(WALLET_LINK_FAILURE.CHALLENGE_EXPIRED);
  }

  const verification = verifyWalletLinkSignature({
    signedMessage: args.signedMessage,
    signatureBase58: args.signature.trim(),
    expected: {
      userId: user._id,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    },
  });
  if (!verification.ok) {
    throw new WalletError(verification.failureCode);
  }

  const owned = await findWalletBySolanaAddress(ctx, verification.publicKey);
  if (owned && owned.userId !== user._id) {
    throw new WalletError(WALLET_LINK_FAILURE.ADDRESS_OWNED_ELSEWHERE);
  }

  await ctx.db.patch(challenge._id, { consumedAt: now });

  const result = await upsertExternalWallet(
    ctx,
    user._id,
    verification.publicKey,
    args.provider,
  );

  return { ...result, solanaAddress: verification.publicKey };
}
