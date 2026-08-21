import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    privyDid: v.string(),
    telegramUserId: v.string(),
    displayName: v.string(),
    username: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  })
    .index("by_privy_did", ["privyDid"])
    .index("by_telegram_user_id", ["telegramUserId"]),

  telegramContexts: defineTable({
    privyDid: v.string(),
    telegramUserId: v.string(),
    chatId: v.string(),
    groupId: v.string(),
    initDataHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_privy_did", ["privyDid"])
    .index("by_init_data_hash", ["initDataHash"]),

  wallets: defineTable({
    userId: v.id("users"),
    privyWalletId: v.string(),
    solanaAddress: v.string(),
    isEmbedded: v.boolean(),
    isDefaultReceiving: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_user_and_default", ["userId", "isDefaultReceiving"]),

  telegramUpdates: defineTable({
    botId: v.string(),
    updateId: v.number(),
    processedAt: v.number(),
    outcome: v.union(v.literal("processed"), v.literal("ignored"), v.literal("duplicate")),
  }).index("by_bot_and_update_id", ["botId", "updateId"]),

  groups: defineTable({
    telegramChatId: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    botIsAdmin: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_telegram_chat_id", ["telegramChatId"]),

  groupMembers: defineTable({
    groupId: v.id("groups"),
    telegramUserId: v.string(),
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
    verificationSource: v.union(
      v.literal("webhook"),
      v.literal("bootstrap"),
      v.literal("getChatMember"),
    ),
    verifiedAt: v.number(),
  })
    .index("by_group_id", ["groupId"])
    .index("by_group_and_telegram_user_id", ["groupId", "telegramUserId"])
    .index("by_telegram_user_id", ["telegramUserId"]),
});
