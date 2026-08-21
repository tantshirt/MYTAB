import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  ACTION_TOKEN_TTL_MS,
  TAB_SESSION_TTL_MS,
  assertTokenActive,
  assertTokenType,
  generateOpaqueToken,
  hashSessionToken,
  type SessionSubjectKind,
  type SessionTokenType,
} from "./sessionTokenSync";

export type MintSessionTokenInput = {
  tokenType: SessionTokenType;
  subjectKind: SessionSubjectKind;
  subjectId: string;
  groupId: Id<"groups">;
  now?: number;
};

export type MintSessionTokenResult = {
  token: string;
  tokenId: Id<"sessionTokens">;
  expiresAt: number;
};

/** Mints an opaque session token and persists its hash (Story 1.9 AC1). */
export async function mintSessionToken(
  ctx: MutationCtx,
  input: MintSessionTokenInput,
): Promise<MintSessionTokenResult> {
  const now = input.now ?? Date.now();
  const token = generateOpaqueToken();
  const tokenHash = hashSessionToken(token);
  const ttl = input.tokenType === "tab_session" ? TAB_SESSION_TTL_MS : ACTION_TOKEN_TTL_MS;
  const expiresAt = now + ttl;

  const tokenId = await ctx.db.insert("sessionTokens", {
    tokenHash,
    tokenType: input.tokenType,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    groupId: input.groupId,
    status: "active",
    expiresAt,
    createdAt: now,
  });

  return { token, tokenId, expiresAt };
}

export type ResolvedSessionToken = {
  tokenId: Id<"sessionTokens">;
  tokenType: SessionTokenType;
  subjectKind: SessionSubjectKind;
  subjectId: string;
  groupId: Id<"groups">;
  expiresAt: number;
};

/** Resolves a presented token to exactly one session subject (Story 1.9 AC2). */
export async function resolveSessionTokenByValue(
  ctx: MutationCtx,
  token: string,
  expectedType: SessionTokenType,
  now = Date.now(),
): Promise<ResolvedSessionToken> {
  if (!token || token.trim().length === 0) {
    throw new Error("TOKEN_INVALID");
  }

  const tokenHash = hashSessionToken(token.trim());
  const record = await ctx.db
    .query("sessionTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();

  if (!record) {
    throw new Error("TOKEN_NOT_FOUND");
  }

  assertTokenType(record.tokenType, expectedType);
  assertTokenActive(record.status, record.expiresAt, now);

  return {
    tokenId: record._id,
    tokenType: record.tokenType,
    subjectKind: record.subjectKind,
    subjectId: record.subjectId,
    groupId: record.groupId,
    expiresAt: record.expiresAt,
  };
}

/** Revokes a token immediately with no grace window (Story 1.9 AC4). */
export async function revokeSessionToken(
  ctx: MutationCtx,
  tokenId: Id<"sessionTokens">,
  now = Date.now(),
): Promise<void> {
  const record = await ctx.db.get(tokenId);
  if (!record || record.status !== "active") {
    return;
  }
  await ctx.db.patch(tokenId, {
    status: "revoked",
    revokedAt: now,
  });
}

/** Marks a single-use action token consumed (Story 1.9 AC6). */
export async function consumeActionToken(
  ctx: MutationCtx,
  tokenId: Id<"sessionTokens">,
  now = Date.now(),
): Promise<void> {
  const record = await ctx.db.get(tokenId);
  if (!record || record.tokenType !== "action_token") {
    throw new Error("TOKEN_TYPE_MISMATCH");
  }
  assertTokenActive(record.status, record.expiresAt, now);
  await ctx.db.patch(tokenId, {
    status: "consumed",
    consumedAt: now,
  });
}

/** Sweeps expired active tokens to expired status (Story 1.9 AC5). */
export async function sweepExpiredSessionTokens(
  ctx: MutationCtx,
  now = Date.now(),
): Promise<number> {
  const expired = await ctx.db
    .query("sessionTokens")
    .withIndex("by_status_and_expires", (q) =>
      q.eq("status", "active").lte("expiresAt", now),
    )
    .collect();

  await Promise.all(
    expired.map((row) =>
      ctx.db.patch(row._id, {
        status: "expired",
      }),
    ),
  );

  return expired.length;
}
