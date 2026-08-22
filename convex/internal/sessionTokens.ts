import { internalMutation } from "../_generated/server";
import { sweepExpiredSessionTokens } from "../lib/sessionTokenOps";

/*
 * `mintDeepLinkToken` used to live here (INVITE-FLOW §9.11 B1). It minted a
 * `tab_session` for any tab whose id and group id the caller could name, with
 * no membership and no organizer check, and `POST /telegram/deep-link` handed
 * the raw token straight back. It is gone. Minting an invite now runs through
 * `convex/sessionTokens.ts`, which reads the organizer off the stored tab and
 * proves live membership before it mints anything (§1.4).
 */

/** Sweeps expired session tokens on a schedule (Story 1.9 AC5). */
export const sweepExpiredTokens = internalMutation({
  args: {},
  handler: async (ctx) => {
    const swept = await sweepExpiredSessionTokens(ctx);
    return { swept };
  },
});
