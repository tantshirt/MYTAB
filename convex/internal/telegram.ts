import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const bindTelegramIdentity = internalMutation({
  args: {
    privyDid: v.string(),
    telegramUserId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    chatId: v.string(),
    groupId: v.string(),
    initDataHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existingByHash = await ctx.db
      .query("telegramContexts")
      .withIndex("by_init_data_hash", (q) => q.eq("initDataHash", args.initDataHash))
      .unique();

    if (existingByHash && existingByHash.privyDid !== args.privyDid) {
      console.warn("[telegram/bootstrap] initData replay rejected", {
        initDataHash: args.initDataHash,
        existingPrivyDid: existingByHash.privyDid,
        attemptedPrivyDid: args.privyDid,
      });
      return { ok: false as const, code: "INIT_DATA_REPLAY" as const };
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_privy_did", (q) => q.eq("privyDid", args.privyDid))
      .unique();

    let userId = existingUser?._id;
    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        telegramUserId: args.telegramUserId,
        displayName: args.displayName,
        username: args.username,
        avatarUrl: args.avatarUrl,
      });
    } else {
      userId = await ctx.db.insert("users", {
        privyDid: args.privyDid,
        telegramUserId: args.telegramUserId,
        displayName: args.displayName,
        username: args.username,
        avatarUrl: args.avatarUrl,
      });
    }

    const existingContext = await ctx.db
      .query("telegramContexts")
      .withIndex("by_privy_did", (q) => q.eq("privyDid", args.privyDid))
      .unique();

    const contextFields = {
      privyDid: args.privyDid,
      telegramUserId: args.telegramUserId,
      chatId: args.chatId,
      groupId: args.groupId,
      initDataHash: args.initDataHash,
      expiresAt: args.expiresAt,
    };

    if (existingContext) {
      await ctx.db.patch(existingContext._id, contextFields);
    } else {
      await ctx.db.insert("telegramContexts", contextFields);
    }

    return { ok: true as const, userId };
  },
});
