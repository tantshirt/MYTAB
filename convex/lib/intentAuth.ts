import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./auth";

export const INTENT_NOT_OWNED = "INTENT_NOT_OWNED";

type IntentCtx = QueryCtx | MutationCtx;

/** Verifies the authenticated user owns the settlement intent (NFR-3, Story 3.2 AC5). */
export async function requireIntentOwner(
  ctx: IntentCtx,
  intentId: Id<"settlementIntents">,
): Promise<{ user: Doc<"users">; intent: Doc<"settlementIntents"> }> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const intent = await ctx.db.get(intentId);
  if (!intent || intent.userId !== user._id) {
    throw new AuthError(INTENT_NOT_OWNED);
  }

  return { user, intent };
}
