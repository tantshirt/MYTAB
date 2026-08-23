import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { processTelegramUpdate } from "../lib/telegramUpdateSync";

const normalizedUpdateValidator = v.union(
  v.object({
    kind: v.literal("message"),
    updateId: v.number(),
    chatId: v.string(),
    chatType: v.union(v.literal("private"), v.literal("group"), v.literal("supergroup")),
    fromId: v.string(),
    messageId: v.number(),
    command: v.union(v.string(), v.null()),
    commandArg: v.union(v.string(), v.null()),
    chatTitle: v.optional(v.string()),
    fromDisplayName: v.string(),
    fromUsername: v.optional(v.string()),
    fromAvatarUrl: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("chat_member"),
    updateId: v.number(),
    chatId: v.string(),
    userId: v.string(),
    chatTitle: v.optional(v.string()),
    displayName: v.string(),
    username: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    role: v.union(
      v.literal("creator"),
      v.literal("administrator"),
      v.literal("member"),
      v.literal("restricted"),
      v.literal("left"),
      v.literal("kicked"),
      v.literal("unknown"),
    ),
    membershipStatus: v.union(
      v.literal("active"),
      v.literal("left"),
      v.literal("kicked"),
      v.literal("restricted"),
    ),
  }),
  v.object({
    kind: v.literal("my_chat_member"),
    updateId: v.number(),
    chatId: v.string(),
    chatTitle: v.optional(v.string()),
    botIsAdmin: v.boolean(),
  }),
  v.object({
    kind: v.literal("unsupported"),
    updateId: v.number(),
  }),
);

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

export const processUpdate = internalMutation({
  args: {
    botId: v.string(),
    update: normalizedUpdateValidator,
  },
  handler: async (ctx, args) => {
    return processTelegramUpdate(ctx, args.botId, args.update);
  },
});

export { resolveGroupFromChat } from "../lib/groupSync";
