import type { Auth } from "convex/server";

type IdentityCtx = {
  auth: Auth;
};

/** Returns the Privy DID (`sub`) for the authenticated caller, or null. */
export async function getViewerSubject(ctx: IdentityCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}
