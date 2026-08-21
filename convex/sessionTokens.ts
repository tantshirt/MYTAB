import { v } from "convex/values";
import { mutation } from "./_generated/server";
import {
  consumeActionToken,
  resolveSessionTokenByValue,
  revokeSessionToken,
} from "./lib/sessionTokenOps";
import { getCurrentUser, requireGroupMember } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

const TOKEN_ERRORS = new Set([
  "TOKEN_EXPIRED",
  "TOKEN_REVOKED",
  "TOKEN_CONSUMED",
  "TOKEN_NOT_FOUND",
  "TOKEN_TYPE_MISMATCH",
  "TOKEN_INVALID",
]);

function mapTokenError(error: unknown): never {
  if (error instanceof Error && TOKEN_ERRORS.has(error.message)) {
    throw new Error(error.message);
  }
  throw error;
}

/** Resolves a tab_session token and joins the caller as a participant (Stories 1.9, 2.6). */
export const resolveTabSession = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    let resolved;
    try {
      resolved = await resolveSessionTokenByValue(ctx, args.token, "tab_session");
    } catch (error) {
      mapTokenError(error);
    }

    await requireGroupMember(ctx, resolved.groupId);

    const tabId = resolved.subjectId as Id<"tabs">;
    const tab = await ctx.db.get(tabId);
    if (!tab) {
      throw new Error("TOKEN_NOT_FOUND");
    }

    const existingParticipant = await ctx.db
      .query("tabParticipants")
      .withIndex("by_tab_and_user", (q) => q.eq("tabId", tabId).eq("userId", user._id))
      .unique();

    if (!existingParticipant) {
      await ctx.db.insert("tabParticipants", {
        tabId,
        userId: user._id,
        telegramUserId: user.telegramUserId,
        joinedAt: Date.now(),
      });
    }

    return {
      tabId,
      groupId: resolved.groupId,
      tabName: tab.name,
      status: tab.status,
    };
  },
});

/** Revokes a session token immediately (Story 1.9 AC4). */
export const revokeToken = mutation({
  args: {
    tokenId: v.id("sessionTokens"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    const record = await ctx.db.get(args.tokenId);
    if (!record) {
      throw new Error("TOKEN_NOT_FOUND");
    }

    await requireGroupMember(ctx, record.groupId);
    await revokeSessionToken(ctx, args.tokenId);
    return { ok: true as const };
  },
});

/** Consumes a single-use action token (Story 1.9 AC6). */
export const consumeToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    let resolved;
    try {
      resolved = await resolveSessionTokenByValue(ctx, args.token, "action_token");
    } catch (error) {
      mapTokenError(error);
    }

    await requireGroupMember(ctx, resolved.groupId);
    await consumeActionToken(ctx, resolved.tokenId);

    return {
      subjectKind: resolved.subjectKind,
      subjectId: resolved.subjectId,
      groupId: resolved.groupId,
    };
  },
});
