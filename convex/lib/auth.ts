import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getViewerSubject } from "./identity";

export const UNAUTHORIZED = "UNAUTHORIZED";
export const TELEGRAM_CONTEXT_REQUIRED = "TELEGRAM_CONTEXT_REQUIRED";

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
