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
    // When the bot's administrator status was last proven against Telegram
    // rather than inferred from a webhook. Older than five minutes is stale
    // for a privileged action (binding decision 2).
    botAdminCheckedAt: v.optional(v.number()),
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
    displayAmountThbMinor: v.optional(v.int64()),
    outputMint: v.string(),
    note: v.optional(v.string()),
    reaction: v.optional(v.string()),
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
    tabId: v.id("tabs"),
    tabRevision: v.number(),
    debtorUserId: v.id("users"),
    creditorUserId: v.id("users"),
    displayAmountThbMinor: v.int64(),
    billSnapshotHash: v.string(),
    amountAtomic: v.int64(),
    outputMint: v.string(),
    status: v.union(v.literal("open"), v.literal("settled"), v.literal("superseded")),
    settledAt: v.optional(v.number()),
    supersededAt: v.optional(v.number()),
    settlementIntentId: v.optional(v.id("settlementIntents")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id", ["groupId"])
    .index("by_debtor_user_id", ["debtorUserId"])
    .index("by_tab_id", ["tabId"]),

  settlementIntents: defineTable({
    userId: v.id("users"),
    walletId: v.id("wallets"),
    groupId: v.id("groups"),
    tabId: v.optional(v.id("tabs")),
    tabRevision: v.optional(v.number()),
    targetKind: v.union(v.literal("tip"), v.literal("obligation")),
    tipId: v.optional(v.id("tips")),
    obligationId: v.optional(v.id("obligations")),
    billSnapshotHash: v.optional(v.string()),
    roundUpAtomic: v.optional(v.int64()),
    excessOutputAtomic: v.optional(v.int64()),
    dflowContextSlot: v.optional(v.number()),
    quotedOtherAmountThreshold: v.optional(v.int64()),
    routingKind: v.optional(
      v.union(v.literal("exact_usdc"), v.literal("dflow_sync")),
    ),
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
    .index("by_tip_id", ["tipId"])
    .index("by_obligation_id", ["obligationId"]),

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

  providerUsageBuckets: defineTable({
    operation: v.literal("dflow_quote"),
    dimension: v.union(
      v.literal("user_hour"),
      v.literal("group_hour"),
      v.literal("global_hour"),
    ),
    scopeKey: v.string(),
    windowKey: v.string(),
    reservedAttempts: v.number(),
    settledAttempts: v.number(),
    updatedAt: v.number(),
  }).index("by_operation_dimension_scope_window", [
    "operation",
    "dimension",
    "scopeKey",
    "windowKey",
  ]),

  providerConcurrencyLeases: defineTable({
    operation: v.literal("dflow_solver"),
    scopeKey: v.string(),
    intentId: v.id("settlementIntents"),
    status: v.union(v.literal("active"), v.literal("released")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_intent_id", ["intentId"])
    .index("by_operation_scope", ["operation", "scopeKey"]),

  settlements: defineTable({
    intentId: v.id("settlementIntents"),
    transactionSignature: v.string(),
    messageHash: v.string(),
    billSnapshotHash: v.optional(v.string()),
    excessOutputAtomic: v.optional(v.int64()),
    sponsorDebitLamports: v.int64(),
    confirmedAt: v.number(),
  })
    .index("by_intent_id", ["intentId"])
    .index("by_transaction_signature", ["transactionSignature"]),

  telegramOutboundMessages: defineTable({
    // Optional because the row is keyed by `dedupeKey`; `tipId` is the subject
    // for the only one-shot message kind that exists (the tip confirmation).
    tipId: v.optional(v.id("tips")),
    groupId: v.id("groups"),
    // The unique delivery key. Every message kind must produce a stable value
    // here, because it is the only thing standing between a retry and a
    // duplicate post in a live group.
    dedupeKey: v.optional(v.string()),
    kind: v.literal("tip_confirmation"),
    messageText: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("sending"),
      v.literal("posted"),
      v.literal("failed"),
    ),
    // Delivery lease — a claim fences the commit so a slow retry can never
    // overwrite a newer worker's result.
    claimId: v.optional(v.string()),
    claimExpiresAt: v.optional(v.number()),
    attemptCount: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    telegramMessageId: v.optional(v.number()),
    postedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tip_id", ["tipId"])
    .index("by_dedupe_key", ["dedupeKey"]),

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

  sessionTokens: defineTable({
    tokenHash: v.string(),
    tokenType: v.union(v.literal("tab_session"), v.literal("action_token")),
    subjectKind: v.union(v.literal("tab"), v.literal("tip"), v.literal("balance")),
    subjectId: v.string(),
    groupId: v.id("groups"),
    status: v.union(
      v.literal("active"),
      v.literal("consumed"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_status_and_expires", ["status", "expiresAt"])
    .index("by_subject", ["subjectKind", "subjectId"]),

  fxSnapshots: defineTable({
    baseCurrency: v.literal("THB"),
    quoteMint: v.string(),
    direction: v.literal("USDC_ATOMIC_PER_THB_MINOR"),
    numeratorAtomic: v.int64(),
    denominatorMinor: v.int64(),
    provider: v.string(),
    providerAsOf: v.number(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
    policyVersion: v.string(),
    isFixture: v.boolean(),
  }).index("by_provider_as_of", ["provider", "providerAsOf"]),

  tabs: defineTable({
    groupId: v.id("groups"),
    organizerTelegramUserId: v.string(),
    name: v.string(),
    merchantName: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("locked"),
      v.literal("settled"),
      v.literal("closed"),
    ),
    defaultCurrency: v.optional(v.string()),
    // INVITE-FLOW §1.5 — the bound that replaces `getChatMember` for a tab with
    // no chat. Absent means `{ kind: "chat" }`: bounded by the Telegram chat's
    // own membership, which is every tab that exists today.
    seatPolicy: v.optional(
      v.union(
        v.object({ kind: v.literal("chat") }),
        v.object({ kind: v.literal("fixed"), seats: v.number() }),
      ),
    ),
    recipientAsset: v.optional(v.string()),
    payerUserId: v.optional(v.id("users")),
    recipientUserId: v.optional(v.id("users")),
    fxSnapshotId: v.optional(v.id("fxSnapshots")),
    revision: v.optional(v.number()),
    itemSubtotalMinor: v.optional(v.int64()),
    taxMinor: v.optional(v.int64()),
    serviceMinor: v.optional(v.int64()),
    discountMinor: v.optional(v.int64()),
    groupTipMinor: v.optional(v.int64()),
    billTotalMinor: v.optional(v.int64()),
    lockedRevision: v.optional(v.number()),
    lockSnapshotId: v.optional(v.id("billLockSnapshots")),
    lockedAt: v.optional(v.number()),
    adjustmentOrderPolicy: v.optional(
      v.array(
        v.union(
          v.literal("service"),
          v.literal("tax"),
          v.literal("discount"),
          v.literal("group_tip"),
        ),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group_id", ["groupId"])
    .index("by_group_and_status", ["groupId", "status"])
    .index("by_group_and_organizer", ["groupId", "organizerTelegramUserId"]),

  items: defineTable({
    tabId: v.id("tabs"),
    name: v.string(),
    quantity: v.number(),
    unitPriceMinor: v.number(),
    lineTotalMinor: v.number(),
    allocationMode: v.optional(
      v.union(
        v.literal("full"),
        v.literal("equal"),
        v.literal("quantity"),
        v.literal("percentage"),
        v.literal("fixed"),
      ),
    ),
    sortOrder: v.number(),
    source: v.union(v.literal("manual"), v.literal("receipt")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tab_id", ["tabId"])
    .index("by_tab_and_sort", ["tabId", "sortOrder"]),

  adjustments: defineTable({
    tabId: v.id("tabs"),
    kind: v.union(
      v.literal("service"),
      v.literal("tax"),
      v.literal("discount"),
      v.literal("group_tip"),
    ),
    calculation: v.union(v.literal("fixed"), v.literal("percentage")),
    valueMinorOrBps: v.number(),
    percentageBase: v.optional(
      v.union(
        v.literal("item_subtotal"),
        v.literal("after_service_charge"),
        v.literal("after_tax"),
        v.literal("pre_discount_total"),
        v.literal("after_discount"),
      ),
    ),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_tab_id", ["tabId"]),

  allocations: defineTable({
    tabId: v.id("tabs"),
    itemId: v.id("items"),
    userId: v.id("users"),
    revision: v.number(),
    mode: v.union(
      v.literal("full"),
      v.literal("equal"),
      v.literal("quantity"),
      v.literal("percentage"),
      v.literal("fixed"),
    ),
    shareNumerator: v.optional(v.number()),
    shareDenominator: v.optional(v.number()),
    quantity: v.optional(v.number()),
    percentageBps: v.optional(v.number()),
    fixedMinor: v.optional(v.int64()),
    amountMinor: v.int64(),
    roundingMinor: v.int64(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tab_id", ["tabId"])
    .index("by_item_id", ["itemId"])
    .index("by_tab_and_user", ["tabId", "userId"]),

  adjustmentAllocations: defineTable({
    tabId: v.id("tabs"),
    adjustmentId: v.id("adjustments"),
    userId: v.id("users"),
    revision: v.number(),
    kind: v.union(
      v.literal("service"),
      v.literal("tax"),
      v.literal("discount"),
      v.literal("group_tip"),
    ),
    amountMinor: v.int64(),
    roundingMinor: v.int64(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tab_id", ["tabId"])
    .index("by_adjustment_id", ["adjustmentId"]),

  billLockSnapshots: defineTable({
    tabId: v.id("tabs"),
    revision: v.number(),
    payloadJson: v.string(),
    billTotalMinor: v.int64(),
    recipientUserId: v.id("users"),
    recipientAsset: v.string(),
    fxNumeratorAtomic: v.int64(),
    fxDenominatorMinor: v.int64(),
    fxProvider: v.string(),
    fxPolicyVersion: v.string(),
    createdAt: v.number(),
  })
    .index("by_tab_id", ["tabId"])
    .index("by_tab_and_revision", ["tabId", "revision"]),

  obligationEvents: defineTable({
    obligationId: v.id("obligations"),
    tabId: v.id("tabs"),
    tabRevision: v.number(),
    eventKind: v.union(v.literal("superseded"), v.literal("settlement_offset")),
    actorUserId: v.optional(v.id("users")),
    settlementIntentId: v.optional(v.id("settlementIntents")),
    createdAt: v.number(),
  })
    .index("by_obligation_id", ["obligationId"])
    .index("by_tab_id", ["tabId"]),

  tabParticipants: defineTable({
    tabId: v.id("tabs"),
    userId: v.id("users"),
    telegramUserId: v.string(),
    joinedAt: v.number(),
  })
    .index("by_tab_id", ["tabId"])
    .index("by_tab_and_user", ["tabId", "userId"]),

  // Exactly one row per tab — the canonical group card that is edited in place
  // (FR-N4). `by_tab_id` is the uniqueness path and the delivery lease lives on
  // the same row, so claiming, committing, and recovering are all one
  // transactional read-modify-write.
  telegramStatusMessages: defineTable({
    tabId: v.id("tabs"),
    chatId: v.string(),
    // Absent until the first post lands. Absent also means "post", not "edit".
    messageId: v.optional(v.number()),
    eventVersion: v.number(),
    event: v.optional(
      v.union(
        v.literal("tab_opened"),
        v.literal("bill_ready"),
        v.literal("payment_confirmed"),
        v.literal("bill_completed"),
      ),
    ),
    renderedText: v.optional(v.string()),
    deliveredVersion: v.optional(v.number()),
    deliveredText: v.optional(v.string()),
    deliveryState: v.optional(v.union(v.literal("idle"), v.literal("claimed"))),
    claimId: v.optional(v.string()),
    claimExpiresAt: v.optional(v.number()),
    // Set to the claim id that already posted a replacement. A claim may
    // recover a deleted card exactly once.
    replacementClaimId: v.optional(v.string()),
    replacementReservedAt: v.optional(v.number()),
    replacementCount: v.optional(v.number()),
    attemptCount: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    peopleCount: v.optional(v.number()),
    billTotalMinor: v.optional(v.int64()),
    claimedItemCount: v.optional(v.number()),
    totalItemCount: v.optional(v.number()),
    settledObligationCount: v.optional(v.number()),
    totalObligationCount: v.optional(v.number()),
    lastEditedAt: v.number(),
  }).index("by_tab_id", ["tabId"]),

  tabCreationCounts: defineTable({
    scopeKind: v.union(v.literal("user"), v.literal("group")),
    scopeKey: v.string(),
    dayKey: v.string(),
    count: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_day", ["scopeKind", "scopeKey", "dayKey"]),

  activityEvents: defineTable({
    groupId: v.id("groups"),
    tabId: v.optional(v.id("tabs")),
    actorUserId: v.optional(v.id("users")),
    type: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_group_id", ["groupId"])
    .index("by_group_and_created", ["groupId", "createdAt"]),

  obligationLedgerEvents: defineTable({
    groupId: v.id("groups"),
    tabId: v.id("tabs"),
    obligationId: v.string(),
    billId: v.string(),
    debtorUserId: v.id("users"),
    creditorUserId: v.id("users"),
    amountMinor: v.int64(),
    eventKind: v.union(
      v.literal("settlement_offset"),
      v.literal("waiver_offset"),
      v.literal("cash_offset"),
      v.literal("cash_proposed"),
    ),
    confirmed: v.boolean(),
    actorUserId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
    linkedProposalId: v.optional(v.id("obligationLedgerEvents")),
    createdAt: v.number(),
  })
    .index("by_group_id", ["groupId"])
    .index("by_obligation_id", ["obligationId"]),

  /**
   * Token metadata cache (symbols, names, decimals, logos, verification).
   *
   * Server-side only, and never shipped whole. The registry this is populated
   * from is megabytes; the Mini App's First Load JS is already the product's
   * weak point, and a payer on restaurant wifi must not download a token list
   * to read the word "USDC". Reads go through `api.tokens.getTokenMetadata`,
   * which takes an explicit set of mints and returns only those rows.
   *
   * Keyed by (cluster, mint). The cluster is part of the key rather than a
   * filter because devnet USDC and mainnet USDC are different addresses, and a
   * row from the wrong cluster is not stale data — it is the wrong token.
   *
   * A row with no `symbol` is a NEGATIVE cache entry: we asked, and no registry
   * lists this mint. It is kept so a payer holding an obscure token does not
   * re-trigger a registry fetch on every render, and so the sheet can tell
   * "unlisted but real" apart from "never looked".
   */
  tokenMetadata: defineTable({
    cluster: v.union(v.literal("devnet"), v.literal("mainnet-beta")),
    mint: v.string(),
    /** Absent for a negative entry — the mint is in no registry we consulted. */
    symbol: v.optional(v.string()),
    name: v.optional(v.string()),
    /**
     * Chain truth once `decimalsVerifiedAt` is set; until then it is the
     * registry's claim and must not scale an amount we are about to transact.
     */
    decimals: v.optional(v.number()),
    logoUri: v.optional(v.string()),
    /** Never true for a mint the registry does not vouch for. */
    verified: v.boolean(),
    source: v.union(
      v.literal("cluster_pin"),
      v.literal("jupiter"),
      v.literal("chain"),
    ),
    /** Absent when the mint account has not been read yet. */
    existsOnChain: v.optional(v.boolean()),
    fetchedAt: v.number(),
    /** When `decimals` was last proven equal to the mint account. */
    decimalsVerifiedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_cluster_and_mint", ["cluster", "mint"])
    .index("by_cluster_and_fetched", ["cluster", "fetchedAt"]),

  /**
   * One row per cluster recording the health of the registry fetch path.
   *
   * Exists so "the list is unavailable" is an observable state rather than an
   * inference from rows quietly ageing. It also carries the cooldown that stops
   * a render loop from turning every cache miss into an outbound request.
   */
  tokenSourceStatus: defineTable({
    cluster: v.union(v.literal("devnet"), v.literal("mainnet-beta")),
    source: v.union(v.literal("jupiter")),
    lastSuccessAt: v.optional(v.number()),
    lastAttemptAt: v.number(),
    lastFailureAt: v.optional(v.number()),
    lastFailureCode: v.optional(v.string()),
    consecutiveFailures: v.number(),
    /** No outbound fetch is attempted before this instant. */
    cooldownUntil: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_cluster_and_source", ["cluster", "source"]),

  receiptImports: defineTable({
    tabId: v.id("tabs"),
    uploadedBy: v.id("users"),
    storageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("ticketed"),
      v.literal("uploaded"),
      v.literal("extracting"),
      v.literal("needs_review"),
      v.literal("confirmed"),
      v.literal("failed"),
      v.literal("rejected"),
      v.literal("deleted"),
    ),
    uploadTicketHash: v.optional(v.string()),
    ticketExpiresAt: v.optional(v.number()),
    extraction: v.optional(v.any()),
    rawExtraction: v.optional(v.any()),
    fieldConfidence: v.optional(v.any()),
    reconciliation: v.optional(v.any()),
    modelMetadata: v.optional(v.any()),
    failureCode: v.optional(v.string()),
    warnings: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tab_id", ["tabId"])
    .index("by_status", ["status"]),
});
