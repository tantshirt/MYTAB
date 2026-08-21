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

  tips: defineTable({
    groupId: v.id("groups"),
    senderUserId: v.id("users"),
    recipientUserId: v.id("users"),
    amountAtomic: v.int64(),
    outputMint: v.string(),
    status: v.union(v.literal("open"), v.literal("settled")),
    settledAt: v.optional(v.number()),
    settlementIntentId: v.optional(v.id("settlementIntents")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id", ["groupId"])
    .index("by_recipient_user_id", ["recipientUserId"]),

  obligations: defineTable({
    groupId: v.id("groups"),
    debtorUserId: v.id("users"),
    amountAtomic: v.int64(),
    outputMint: v.string(),
    status: v.union(v.literal("open"), v.literal("settled")),
    settledAt: v.optional(v.number()),
    settlementIntentId: v.optional(v.id("settlementIntents")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id", ["groupId"])
    .index("by_debtor_user_id", ["debtorUserId"]),

  settlementIntents: defineTable({
    userId: v.id("users"),
    walletId: v.id("wallets"),
    groupId: v.id("groups"),
    targetKind: v.union(v.literal("tip"), v.literal("obligation")),
    tipId: v.optional(v.id("tips")),
    obligationId: v.optional(v.id("obligations")),
    recipientUserId: v.id("users"),
    recipientAddress: v.string(),
    inputMint: v.string(),
    outputMint: v.string(),
    maximumInputAtomic: v.int64(),
    minimumOutputAtomic: v.int64(),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("created"),
      v.literal("quoting"),
      v.literal("ready_for_signature"),
      v.literal("user_signed"),
      v.literal("submitted"),
      v.literal("unknown"),
      v.literal("confirmed"),
      v.literal("failed"),
      v.literal("expired"),
      v.literal("superseded"),
    ),
    messageHash: v.optional(v.string()),
    serializedMessage: v.optional(v.string()),
    blockhash: v.optional(v.string()),
    lastValidBlockHeight: v.optional(v.number()),
    partialSignedTx: v.optional(v.string()),
    userSignature: v.optional(v.string()),
    fullySignedTx: v.optional(v.string()),
    transactionSignature: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    sponsorReservationLamports: v.optional(v.int64()),
    policyVersion: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"])
    .index("by_tip_id", ["tipId"]),

  sponsorUsageBuckets: defineTable({
    policyVersion: v.string(),
    dimension: v.union(
      v.literal("user_day"),
      v.literal("wallet_day"),
      v.literal("group_day"),
      v.literal("daily_aggregate"),
      v.literal("global_epoch"),
    ),
    scopeKey: v.string(),
    windowKey: v.string(),
    reservedLamports: v.int64(),
    settledLamports: v.int64(),
    updatedAt: v.number(),
  }).index("by_dimension_scope_window", [
    "policyVersion",
    "dimension",
    "scopeKey",
    "windowKey",
  ]),

  sponsorReservations: defineTable({
    intentId: v.id("settlementIntents"),
    policyVersion: v.string(),
    reservedLamports: v.int64(),
    status: v.union(
      v.literal("active"),
      v.literal("released"),
      v.literal("settled"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_intent_id", ["intentId"]),

  settlements: defineTable({
    intentId: v.id("settlementIntents"),
    transactionSignature: v.string(),
    messageHash: v.string(),
    sponsorDebitLamports: v.int64(),
    confirmedAt: v.number(),
  })
    .index("by_intent_id", ["intentId"])
    .index("by_transaction_signature", ["transactionSignature"]),

  settlementLedgerEvents: defineTable({
    intentId: v.id("settlementIntents"),
    targetKind: v.union(v.literal("tip"), v.literal("obligation")),
    tipId: v.optional(v.id("tips")),
    obligationId: v.optional(v.id("obligations")),
    eventKind: v.literal("settlement_offset"),
    transactionSignature: v.string(),
    createdAt: v.number(),
  })
    .index("by_tip_id", ["tipId"])
    .index("by_obligation_id", ["obligationId"])
    .index("by_transaction_signature", ["transactionSignature"]),
});
