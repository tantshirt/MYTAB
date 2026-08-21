import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { mintSessionToken, sweepExpiredSessionTokens } from "../lib/sessionTokenOps";
import type { Id } from "../_generated/dataModel";

/** Internal helper for HTTP deep-link token generation stub (Story 1.9). */
export const mintDeepLinkToken = internalMutation({
  args: {
    tabId: v.string(),
    groupId: v.string(),
  },
  handler: async (ctx, args) => {
    const tab = await ctx.db.get(args.tabId as Id<"tabs">);
    if (!tab) {
      return { ok: false as const, code: "TAB_NOT_FOUND" as const };
    }

    if (tab.groupId !== (args.groupId as Id<"groups">)) {
      return { ok: false as const, code: "GROUP_MISMATCH" as const };
    }

    const minted = await mintSessionToken(ctx, {
      tokenType: "tab_session",
      subjectKind: "tab",
      subjectId: tab._id,
      groupId: tab.groupId,
    });

    return {
      ok: true as const,
      token: minted.token,
      expiresAt: minted.expiresAt,
    };
  },
});

/** Sweeps expired session tokens on a schedule (Story 1.9 AC5). */
export const sweepExpiredTokens = internalMutation({
  args: {},
  handler: async (ctx) => {
    const swept = await sweepExpiredSessionTokens(ctx);
    return { swept };
  },
});
