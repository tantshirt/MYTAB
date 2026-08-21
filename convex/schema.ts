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
});
