import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getViewerSubject } from "./identity";

export const UNAUTHORIZED = "UNAUTHORIZED";
export const TELEGRAM_CONTEXT_REQUIRED = "TELEGRAM_CONTEXT_REQUIRED";
export const NOT_GROUP_MEMBER = "NOT_GROUP_MEMBER";

type AuthCtx = QueryCtx | MutationCtx;

export class AuthError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AuthError";
  }
}

/** Requires a Privy-authenticated caller; throws UNAUTHORIZED when absent. */
export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new AuthError(UNAUTHORIZED);
  }
  return identity;
}

/** Resolves the acting user by Privy DID — the single lookup path (NFR-3). */
export async function getCurrentUser(ctx: AuthCtx): Promise<Doc<"users"> | null> {
  const privyDid = await getViewerSubject(ctx);
  if (!privyDid) {
    return null;
  }

  return ctx.db
    .query("users")
    .withIndex("by_privy_did", (q) => q.eq("privyDid", privyDid))
    .unique();
}

/** Requires a non-expired Telegram bootstrap context for mutations. */
export async function requireTelegramContext(ctx: AuthCtx): Promise<Doc<"telegramContexts">> {
  const identity = await requireIdentity(ctx);
  const context = await ctx.db
    .query("telegramContexts")
    .withIndex("by_privy_did", (q) => q.eq("privyDid", identity.subject))
    .unique();

  if (!context || context.expiresAt <= Date.now()) {
    throw new AuthError(TELEGRAM_CONTEXT_REQUIRED);
  }

  return context;
}

export type CurrentUserId = Id<"users">;

/** Requires an active group membership resolved from groupMembers — never client claims. */
export async function requireGroupMember(
  ctx: AuthCtx,
  groupId: Id<"groups">,
): Promise<Doc<"groupMembers">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const membership = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_telegram_user_id", (q) =>
      q.eq("groupId", groupId).eq("telegramUserId", user.telegramUserId),
    )
    .unique();

  if (!membership || membership.membershipStatus !== "active") {
    throw new AuthError(NOT_GROUP_MEMBER);
  }

  return membership;
}
