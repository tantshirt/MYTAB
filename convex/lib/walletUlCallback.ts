import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { WALLET_LINK_CHALLENGE_TTL_MS } from "../../lib/wallet/challenge";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./auth";

export type RecordWalletUlCallbackArgs = {
  challengeId: Id<"walletLinkChallenges">;
  data?: string;
  nonce?: string;
  encryptionPublicKey?: string;
  errorCode?: string;
  now?: number;
};

export type RecordWalletUlCallbackResult = { ok: true } | { ok: false };

/**
 * Unauthenticated record of a Phantom/Solflare/Backpack callback blob.
 * Missing, consumed, or expired challenge is the same refusal — no existence leak.
 */
export async function recordWalletUlCallbackCore(
  ctx: MutationCtx,
  args: RecordWalletUlCallbackArgs,
): Promise<RecordWalletUlCallbackResult> {
  const now = args.now ?? Date.now();
  let row;
  try {
    row = await ctx.db.get(args.challengeId);
  } catch {
    return { ok: false };
  }

  if (!row || row.consumedAt !== undefined || row.expiresAt <= now) {
    return { ok: false };
  }

  if (args.errorCode && args.errorCode.trim().length > 0) {
    await ctx.db.patch(row._id, {
      ulErrorCode: args.errorCode.trim(),
      ulRecordedAt: now,
    });
    return { ok: true };
  }

  const data = args.data?.trim() ?? "";
  const nonce = args.nonce?.trim() ?? "";
  const encryptionPublicKey = args.encryptionPublicKey?.trim() ?? "";
  if (!data || !nonce || !encryptionPublicKey) {
    return { ok: false };
  }

  await ctx.db.patch(row._id, {
    ulData: data,
    ulNonce: nonce,
    ulEncryptionPublicKey: encryptionPublicKey,
    ulRecordedAt: now,
  });
  return { ok: true };
}

export type WalletUlSessionFields = {
  ulSecret?: string;
  ulPending?: string;
};

export type WalletUlCallbackView =
  | ({ status: "pending" } & WalletUlSessionFields)
  | ({ status: "error"; errorCode: string } & WalletUlSessionFields)
  | ({
      status: "ready";
      data: string;
      nonce: string;
      encryptionPublicKey: string;
    } & WalletUlSessionFields);

function sessionFields(row: {
  ulSecret?: string;
  ulPending?: string;
}): WalletUlSessionFields {
  return {
    ...(row.ulSecret ? { ulSecret: row.ulSecret } : {}),
    ...(row.ulPending ? { ulPending: row.ulPending } : {}),
  };
}

/**
 * Authenticated read. Strangers and the wrong user see the same null as a
 * missing challenge.
 */
export async function readWalletUlCallbackCore(
  ctx: QueryCtx,
  challengeId: Id<"walletLinkChallenges">,
): Promise<WalletUlCallbackView | null> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    return null;
  }

  let row;
  try {
    row = await ctx.db.get(challengeId);
  } catch {
    return null;
  }

  if (!row || row.userId !== user._id) {
    return null;
  }
  if (row.consumedAt !== undefined || row.expiresAt <= Date.now()) {
    return null;
  }
  if (
    row.ulReadAt !== undefined &&
    row.ulRecordedAt !== undefined &&
    row.ulReadAt === row.ulRecordedAt
  ) {
    return { status: "pending", ...sessionFields(row) };
  }
  if (row.ulErrorCode) {
    return { status: "error", errorCode: row.ulErrorCode, ...sessionFields(row) };
  }
  if (!row.ulData || !row.ulNonce || !row.ulEncryptionPublicKey) {
    return { status: "pending", ...sessionFields(row) };
  }
  return {
    status: "ready",
    data: row.ulData,
    nonce: row.ulNonce,
    encryptionPublicKey: row.ulEncryptionPublicKey,
    ...sessionFields(row),
  };
}

export async function storeWalletUlSessionCore(
  ctx: MutationCtx,
  args: {
    challengeId: Id<"walletLinkChallenges">;
    secret: string;
    pending: string;
    now?: number;
  },
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const secret = args.secret.trim();
  const pending = args.pending.trim();
  if (!secret || !pending) {
    return { ok: false };
  }

  let row;
  try {
    row = await ctx.db.get(args.challengeId);
  } catch {
    return { ok: false };
  }

  const now = args.now ?? Date.now();
  if (!row || row.userId !== user._id || row.consumedAt !== undefined || row.expiresAt <= now) {
    return { ok: false };
  }

  await ctx.db.patch(row._id, {
    ulSecret: secret,
    ulPending: pending,
    expiresAt: now + WALLET_LINK_CHALLENGE_TTL_MS,
  });
  return { ok: true };
}

export async function consumeWalletUlCallbackCore(
  ctx: MutationCtx,
  challengeId: Id<"walletLinkChallenges">,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  let row;
  try {
    row = await ctx.db.get(challengeId);
  } catch {
    return { ok: false };
  }

  if (!row || row.userId !== user._id || row.ulRecordedAt === undefined) {
    return { ok: false };
  }

  await ctx.db.patch(row._id, { ulReadAt: row.ulRecordedAt });
  return { ok: true };
}
