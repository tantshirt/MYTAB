import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { AuthError } from "./lib/auth";
import { requireIntentOwner } from "./lib/intentAuth";
import { createTipIntentCore, refreshTipIntentCore } from "./lib/settlementIntentSync";
import { USDC_MINT } from "../lib/solana/constants";
import { createObligationIntentCore, refreshObligationIntentCore, normalizeInputMint } from "./lib/settlementObligationSync";
import {
  countTabSettlementProgress,
  emitObligationSettlementActivity,
  queuePaymentProgressUpdate,
} from "./lib/paymentConfirmationNotify";
import { reserveDflowBudget, settleDflowBudget } from "./lib/providerBudget";
import {
  SETTLEMENT_FAILURE,
  SETTLEMENT_STATUS,
  assertSettlementTransition,
} from "./lib/settlementState";
import { expireIntentIfPastDue } from "./lib/intentExpiry";
import { applySettlementOffset, isTargetAlreadySettled } from "./lib/settlementLedger";
import {
  releaseSponsorReservation,
  reserveSponsorBudget,
} from "./lib/sponsorReservation";
import {
  SPONSOR_FAILURE,
  SPONSOR_POLICY_VERSION,
  isSponsorPaused,
  resolveSponsorEnvironment,
} from "./sponsorPolicy";
import {
  fixtureMessageBytes,
  fixtureMessageHash,
  verifyPartialSignedMessage,
} from "./lib/solanaFixture";
import { assertFixturePathAllowed } from "../lib/solana/runtimeGuard";
import { resolveSponsorWalletAddress } from "../lib/solana/fixture";

export {
  SETTLEMENT_FAILURE,
  SETTLEMENT_STATUS,
} from "./lib/settlementState";

/** Creates a server-owned tip settlement intent then schedules the build action (Story 3.2). */
export const createTipIntent = mutation({
  args: {
    groupId: v.id("groups"),
    recipientUserId: v.id("users"),
    amountAtomic: v.int64(),
    displayAmountThbMinor: v.optional(v.int64()),
    note: v.optional(v.string()),
    reaction: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await createTipIntentCore(ctx, {
      groupId: args.groupId,
      recipientUserId: args.recipientUserId,
      amountAtomic: args.amountAtomic,
      displayAmountThbMinor: args.displayAmountThbMinor,
      note: args.note,
      reaction: args.reaction,
      idempotencyKey: args.idempotencyKey,
    });

    if (result.created) {
      await ctx.scheduler.runAfter(0, internal.internal.solana.buildExactUsdcTransferAction, {
        intentId: result.intentId,
      });
    }

    return result;
  },
});

/** Returns a settlement intent readable status and failure code (Story 3.6 AC6). */
export const getIntent = query({
  args: { intentId: v.id("settlementIntents") },
  handler: async (ctx, args) => {
    const { intent: ownedIntent } = await requireIntentOwner(ctx, args.intentId);

    const now = Date.now();
    const intent =
      ownedIntent.expiresAt <= now &&
      (ownedIntent.status === SETTLEMENT_STATUS.CREATED ||
        ownedIntent.status === SETTLEMENT_STATUS.QUOTING ||
        ownedIntent.status === SETTLEMENT_STATUS.READY_FOR_SIGNATURE)
        ? { ...ownedIntent, status: SETTLEMENT_STATUS.EXPIRED as typeof ownedIntent.status }
        : ownedIntent;

    return {
      intentId: intent._id,
      status: intent.status,
      failureCode: intent.failureCode ?? null,
      transactionSignature: intent.transactionSignature ?? null,
      expiresAt: intent.expiresAt,
    };
  },
});

/** Persists expiry transition on read paths that mutate (Story 3.9 AC2). */
export const syncIntentExpiry = mutation({
  args: { intentId: v.id("settlementIntents") },
  handler: async (ctx, args) => {
    const { intent } = await requireIntentOwner(ctx, args.intentId);
    const updated = await expireIntentIfPastDue(ctx, intent);
    return {
      intentId: updated._id,
      status: updated.status,
      expiresAt: updated.expiresAt,
    };
  },
});

/** Recreates a quote against the same tip after expiry or failure (Story 3.9 AC4). */
export const refreshTipIntent = mutation({
  args: {
    tipId: v.id("tips"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await refreshTipIntentCore(ctx, args);

    if (result.created) {
      await ctx.scheduler.runAfter(0, internal.internal.solana.buildExactUsdcTransferAction, {
        intentId: result.intentId,
      });
    }

    return result;
  },
});

/** Creates a server-owned obligation settlement intent (Story 6.1). */
export const createObligationIntent = mutation({
  args: {
    obligationId: v.id("obligations"),
    inputMint: v.string(),
    idempotencyKey: v.string(),
    roundUpAtomic: v.optional(v.int64()),
  },
  handler: async (ctx, args) => {
    const normalizedMint = normalizeInputMint(args.inputMint);
    const result = await createObligationIntentCore(ctx, {
      obligationId: args.obligationId,
      inputMint: normalizedMint,
      idempotencyKey: args.idempotencyKey,
      roundUpAtomic: args.roundUpAtomic,
    });

    if (result.created) {
      const buildAction =
        normalizedMint === USDC_MINT
          ? internal.internal.solana.buildExactUsdcTransferAction
          : internal.internal.dflow.buildDflowSettlementAction;
      await ctx.scheduler.runAfter(0, buildAction, {
        intentId: result.intentId,
      });
    }

    return result;
  },
});

/** Refreshes an obligation intent after expiry, failure, or stale revision (Story 6.6 AC4). */
export const refreshObligationIntent = mutation({
  args: {
    obligationId: v.id("obligations"),
    inputMint: v.string(),
    idempotencyKey: v.string(),
    roundUpAtomic: v.optional(v.int64()),
  },
  handler: async (ctx, args) => {
    const normalizedMint = normalizeInputMint(args.inputMint);
    const result = await refreshObligationIntentCore(ctx, {
      obligationId: args.obligationId,
      inputMint: normalizedMint,
      idempotencyKey: args.idempotencyKey,
      roundUpAtomic: args.roundUpAtomic,
    });

    if (result.created) {
      const buildAction =
        normalizedMint === USDC_MINT
          ? internal.internal.solana.buildExactUsdcTransferAction
          : internal.internal.dflow.buildDflowSettlementAction;
      await ctx.scheduler.runAfter(0, buildAction, {
        intentId: result.intentId,
      });
    }

    return result;
  },
});

/**
 * Client submits partially signed bytes after Privy sign-only approval (Story 3.5 AC1).
 * Convex re-verifies the message hash and schedules sponsor co-sign + broadcast.
 */
export const recordUserSigned = mutation({
  args: {
    intentId: v.id("settlementIntents"),
    partialSignedTxBase64: v.string(),
  },
  handler: async (ctx, args) => {
    const { intent: ownedIntent } = await requireIntentOwner(ctx, args.intentId);
    const intent = await expireIntentIfPastDue(ctx, ownedIntent);

    if (intent.status === SETTLEMENT_STATUS.EXPIRED) {
      throw new AuthError(SETTLEMENT_FAILURE.INVALID_STATUS);
    }

    if (intent.status !== SETTLEMENT_STATUS.READY_FOR_SIGNATURE) {
      throw new AuthError(SETTLEMENT_FAILURE.INVALID_STATUS);
    }

    if (!intent.messageHash) {
      throw new AuthError(SETTLEMENT_FAILURE.MESSAGE_HASH_MISMATCH);
    }

    // The payer public key is read from the server-owned wallet record, never
    // from the submitted payload: verifying a signature against a key the client
    // supplies proves nothing.
    const wallet = await ctx.db.get(intent.walletId);
    if (!wallet) {
      throw new AuthError("PAYER_WALLET_REQUIRED");
    }

    const sponsorAddress = resolveSponsorWalletAddress();

    const verification = verifyPartialSignedMessage({
      partialSignedTxBase64: args.partialSignedTxBase64,
      expectedMessageHash: intent.messageHash,
      payerAddress: wallet.solanaAddress,
      sponsorAddress,
      expectedSerializedMessageBase64: intent.serializedMessage,
    });
    if (!verification.ok) {
      throw new AuthError(verification.failureCode);
    }

    const userSignature = verification.userSignature;
    if (intent.userSignature && intent.userSignature === userSignature) {
      throw new AuthError(SETTLEMENT_FAILURE.DUPLICATE_USER_SIGNATURE);
    }

    const now = Date.now();
    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.USER_SIGNED);

    await ctx.db.patch(intent._id, {
      status: SETTLEMENT_STATUS.USER_SIGNED,
      partialSignedTx: args.partialSignedTxBase64,
      userSignature,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.internal.settlementPipeline.processUserSignedPipeline, {
      intentId: intent._id,
    });

    return { intentId: intent._id, status: SETTLEMENT_STATUS.USER_SIGNED };
  },
});

/** Internal fixture helper: moves intent to ready_for_signature with sponsor reservation. */
export const markReadyForSignatureInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
  },
  handler: async (ctx, args) => {
    // This helper writes fixture message bytes onto a real intent. It must never
    // run on a deployment — a fixture hash there would make every later
    // verification compare against a value no wallet ever signed.
    assertFixturePathAllowed("settlements.markReadyForSignatureInternal");

    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      throw new AuthError("INTENT_NOT_FOUND");
    }

    if (intent.status !== SETTLEMENT_STATUS.QUOTING) {
      throw new AuthError(SETTLEMENT_FAILURE.INVALID_STATUS);
    }

    const reservation = await reserveSponsorBudget(ctx, {
      intentId: intent._id,
      userId: intent.userId,
      walletId: intent.walletId,
      groupId: intent.groupId,
      environment: resolveSponsorEnvironment(),
      recipientAddress: intent.recipientAddress,
      outputMint: intent.outputMint,
      paused: isSponsorPaused(),
    });

    if (!reservation.ok) {
      await ctx.db.patch(intent._id, {
        status: SETTLEMENT_STATUS.FAILED,
        failureCode: reservation.failureCode,
        updatedAt: Date.now(),
      });
      return { ok: false as const, failureCode: reservation.failureCode };
    }

    const now = Date.now();
    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.READY_FOR_SIGNATURE);

    await ctx.db.patch(intent._id, {
      status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
      messageHash: fixtureMessageHash(),
      serializedMessage: fixtureMessageBytes(),
      sponsorReservationLamports: reservation.reservedLamports,
      policyVersion: SPONSOR_POLICY_VERSION,
      updatedAt: now,
    });

    return { ok: true as const, status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE };
  },
});

/** Records broadcast result — client never broadcasts (Story 3.5 AC4). */
export const markSubmittedInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    transactionSignature: v.string(),
    fullySignedTx: v.string(),
    ambiguous: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      throw new AuthError("INTENT_NOT_FOUND");
    }

    const duplicate = await ctx.db
      .query("settlements")
      .withIndex("by_transaction_signature", (q) =>
        q.eq("transactionSignature", args.transactionSignature),
      )
      .unique();

    if (duplicate) {
      throw new AuthError(SETTLEMENT_FAILURE.DUPLICATE_TRANSACTION_SIGNATURE);
    }

    const nextStatus = args.ambiguous
      ? SETTLEMENT_STATUS.UNKNOWN
      : SETTLEMENT_STATUS.SUBMITTED;
    assertSettlementTransition(intent.status, nextStatus);

    const now = Date.now();
    await ctx.db.patch(intent._id, {
      status: nextStatus,
      transactionSignature: args.transactionSignature,
      fullySignedTx: args.fullySignedTx,
      updatedAt: now,
    });

    if (!args.ambiguous) {
      await ctx.scheduler.runAfter(0, internal.internal.settlementPipeline.processConfirmationPipeline, {
        intentId: intent._id,
        transactionSignature: args.transactionSignature,
      });
    }

    return { intentId: intent._id, status: nextStatus };
  },
});

/** Applies parsed confirmation to ledger exactly once (Story 3.6 AC3). */
export const applyConfirmedInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    transactionSignature: v.string(),
    sponsorDebitLamports: v.int64(),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      throw new AuthError("INTENT_NOT_FOUND");
    }

    if (intent.status === SETTLEMENT_STATUS.CONFIRMED) {
      return { intentId: intent._id, status: intent.status, alreadyConfirmed: true };
    }

    const existingSettlement = await ctx.db
      .query("settlements")
      .withIndex("by_transaction_signature", (q) =>
        q.eq("transactionSignature", args.transactionSignature),
      )
      .unique();

    if (existingSettlement) {
      return { intentId: intent._id, status: SETTLEMENT_STATUS.CONFIRMED, alreadyConfirmed: true };
    }

    // A confirmed settlement must carry the hash of the message that was
    // actually signed. Substituting a fixture hash here would let a settlement
    // row exist that no transaction can be reconciled against.
    if (!intent.messageHash) {
      throw new AuthError(SETTLEMENT_FAILURE.MESSAGE_HASH_MISMATCH);
    }

    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.CONFIRMED);

    const now = Date.now();
    await ctx.db.insert("settlements", {
      intentId: intent._id,
      transactionSignature: args.transactionSignature,
      messageHash: intent.messageHash,
      billSnapshotHash: intent.billSnapshotHash,
      sponsorDebitLamports: args.sponsorDebitLamports,
      confirmedAt: now,
    });

    await applySettlementOffset(ctx, {
      intentId: intent._id,
      targetKind: intent.targetKind,
      tipId: intent.tipId,
      obligationId: intent.obligationId,
      transactionSignature: args.transactionSignature,
      now,
    });

    const reservation = await ctx.db
      .query("sponsorReservations")
      .withIndex("by_intent_id", (q) => q.eq("intentId", intent._id))
      .unique();

    if (reservation && reservation.status === "active") {
      await ctx.db.patch(reservation._id, {
        status: "settled",
        updatedAt: now,
      });
    }

    await ctx.db.patch(intent._id, {
      status: SETTLEMENT_STATUS.CONFIRMED,
      transactionSignature: args.transactionSignature,
      updatedAt: now,
    });

    if (intent.targetKind === "tip" && intent.tipId) {
      const tip = await ctx.db.get(intent.tipId);
      if (tip) {
        const sender = await ctx.db.get(tip.senderUserId);
        const recipient = await ctx.db.get(tip.recipientUserId);
        const displayAmountThbMinor = tip.displayAmountThbMinor ?? tip.amountAtomic;

        await ctx.scheduler.runAfter(0, internal.internal.settlementScheduler.enqueueTipConfirmation, {
          tipId: tip._id,
          groupId: tip.groupId,
          senderDisplayName: sender?.displayName ?? "Someone",
          recipientDisplayName: recipient?.displayName ?? "Someone",
          displayAmountThbMinor,
        });
      }
    }

    if (intent.targetKind === "obligation" && intent.obligationId && intent.tabId) {
      await emitObligationSettlementActivity(ctx, {
        groupId: intent.groupId,
        tabId: intent.tabId,
        obligationId: intent.obligationId,
        intentId: intent._id,
        transactionSignature: args.transactionSignature,
        now,
      });

      const progress = await countTabSettlementProgress(ctx, intent.tabId);
      await queuePaymentProgressUpdate(ctx, {
        tabId: intent.tabId,
        groupId: intent.groupId,
        settledCount: progress.settledCount,
        totalCount: progress.totalCount,
        billCompleted: progress.billCompleted,
      });

      if (progress.billCompleted) {
        const tab = await ctx.db.get(intent.tabId);
        if (tab && tab.status === "locked") {
          await ctx.db.patch(intent.tabId, {
            status: "settled",
            updatedAt: now,
          });
        }
      }
    }

    return { intentId: intent._id, status: SETTLEMENT_STATUS.CONFIRMED, alreadyConfirmed: false };
  },
});

export const getTabInternal = internalQuery({
  args: { tabId: v.id("tabs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.tabId);
  },
});

export const reserveDflowBudgetInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    userId: v.id("users"),
    groupId: v.id("groups"),
  },
  handler: async (ctx, args) => {
    return reserveDflowBudget(ctx, args);
  },
});

export const settleDflowBudgetInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    userId: v.id("users"),
    groupId: v.id("groups"),
    windowKey: v.string(),
    reservedAttempts: v.number(),
    usedAttempts: v.number(),
  },
  handler: async (ctx, args) => {
    await settleDflowBudget(ctx, args);
    return { ok: true as const };
  },
});

/** Persists a validated DFlow quote (Story 6.2 AC3). */
export const applyDflowQuoteInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    serializedMessage: v.string(),
    messageHash: v.string(),
    blockhash: v.string(),
    lastValidBlockHeight: v.number(),
    sponsorExposureLamports: v.int64(),
    quotedOtherAmountThreshold: v.int64(),
    dflowContextSlot: v.number(),
    maximumInputAtomic: v.int64(),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.status !== SETTLEMENT_STATUS.QUOTING) {
      throw new AuthError(SETTLEMENT_FAILURE.INVALID_STATUS);
    }

    const reservation = await reserveSponsorBudget(ctx, {
      intentId: intent._id,
      userId: intent.userId,
      walletId: intent.walletId,
      groupId: intent.groupId,
      environment: resolveSponsorEnvironment(),
      recipientAddress: intent.recipientAddress,
      outputMint: intent.outputMint,
      reservedLamports: args.sponsorExposureLamports,
      paused: isSponsorPaused(),
    });

    if (!reservation.ok) {
      await ctx.db.patch(intent._id, {
        status: SETTLEMENT_STATUS.FAILED,
        failureCode: reservation.failureCode,
        updatedAt: Date.now(),
      });
      return { ok: false as const, failureCode: reservation.failureCode };
    }

    const now = Date.now();
    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.READY_FOR_SIGNATURE);

    await ctx.db.patch(intent._id, {
      status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
      messageHash: args.messageHash,
      serializedMessage: args.serializedMessage,
      blockhash: args.blockhash,
      lastValidBlockHeight: args.lastValidBlockHeight,
      quotedOtherAmountThreshold: args.quotedOtherAmountThreshold,
      dflowContextSlot: args.dflowContextSlot,
      maximumInputAtomic: args.maximumInputAtomic,
      sponsorReservationLamports: reservation.reservedLamports,
      policyVersion: SPONSOR_POLICY_VERSION,
      updatedAt: now,
    });

    return { ok: true as const, status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE };
  },
});

export const getIntentInternal = internalQuery({
  args: { intentId: v.id("settlementIntents") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.intentId);
  },
});

export const getWalletInternal = internalQuery({
  args: { walletId: v.id("wallets") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.walletId);
  },
});

/** Moves created -> quoting before the Node build action runs (Story 3.3). */
export const markQuotingInternal = internalMutation({
  args: { intentId: v.id("settlementIntents") },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.status !== SETTLEMENT_STATUS.CREATED) {
      throw new AuthError(SETTLEMENT_FAILURE.INVALID_STATUS);
    }

    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.QUOTING);
    await ctx.db.patch(args.intentId, {
      status: SETTLEMENT_STATUS.QUOTING,
      updatedAt: Date.now(),
    });

    return { ok: true as const };
  },
});

/**
 * Persists validated transaction bytes, hash, and sponsor reservation (Story 3.3 AC4, 3.4 AC2).
 */
export const applyQuotedTransactionInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    serializedMessage: v.string(),
    messageHash: v.string(),
    blockhash: v.string(),
    lastValidBlockHeight: v.number(),
    sponsorExposureLamports: v.int64(),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.status !== SETTLEMENT_STATUS.QUOTING) {
      throw new AuthError(SETTLEMENT_FAILURE.INVALID_STATUS);
    }

    const reservation = await reserveSponsorBudget(ctx, {
      intentId: intent._id,
      userId: intent.userId,
      walletId: intent.walletId,
      groupId: intent.groupId,
      environment: resolveSponsorEnvironment(),
      recipientAddress: intent.recipientAddress,
      outputMint: intent.outputMint,
      reservedLamports: args.sponsorExposureLamports,
      paused: isSponsorPaused(),
    });

    if (!reservation.ok) {
      await ctx.db.patch(intent._id, {
        status: SETTLEMENT_STATUS.FAILED,
        failureCode: reservation.failureCode,
        updatedAt: Date.now(),
      });
      return { ok: false as const, failureCode: reservation.failureCode };
    }

    const now = Date.now();
    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.READY_FOR_SIGNATURE);

    await ctx.db.patch(intent._id, {
      status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
      messageHash: args.messageHash,
      serializedMessage: args.serializedMessage,
      blockhash: args.blockhash,
      lastValidBlockHeight: args.lastValidBlockHeight,
      sponsorReservationLamports: reservation.reservedLamports,
      policyVersion: SPONSOR_POLICY_VERSION,
      updatedAt: now,
    });

    return { ok: true as const, status: SETTLEMENT_STATUS.READY_FOR_SIGNATURE };
  },
});

/**
 * Ensures the sponsor reservation immediately before co-sign (Story 3.8 AC6, AD-17).
 *
 * Rechecks, in this order and all fail-closed: the kill switch, the policy
 * version the reservation was made under, and every budget dimension. The kill
 * switch is rechecked here as well as in the calling action because an operator
 * may flip it between the two, and this mutation is the last transactional point
 * before the sponsor key is used.
 */
export const ensureSponsorReservationInternal = internalMutation({
  args: { intentId: v.id("settlementIntents") },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      return { ok: false as const, failureCode: "INTENT_NOT_FOUND" };
    }

    if (isSponsorPaused()) {
      return { ok: false as const, failureCode: SPONSOR_FAILURE.PAUSED };
    }

    if (intent.policyVersion !== SPONSOR_POLICY_VERSION) {
      return { ok: false as const, failureCode: "SPONSOR_POLICY_VERSION_MISMATCH" };
    }

    const reservation = await reserveSponsorBudget(ctx, {
      intentId: intent._id,
      userId: intent.userId,
      walletId: intent.walletId,
      groupId: intent.groupId,
      environment: resolveSponsorEnvironment(),
      recipientAddress: intent.recipientAddress,
      outputMint: intent.outputMint,
      reservedLamports: intent.sponsorReservationLamports,
      paused: isSponsorPaused(),
    });

    if (!reservation.ok) {
      return reservation;
    }

    return {
      ok: true as const,
      reservedLamports: reservation.reservedLamports,
      reservationOwnerIntentId: intent._id as string,
    };
  },
});

export const markFailedInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    failureCode: v.string(),
    releaseReservation: v.boolean(),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      return { ok: false as const };
    }

    if (
      intent.status === SETTLEMENT_STATUS.CONFIRMED ||
      intent.status === SETTLEMENT_STATUS.EXPIRED ||
      intent.status === SETTLEMENT_STATUS.SUPERSEDED
    ) {
      return { ok: false as const };
    }

    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.FAILED);

    const now = Date.now();
    if (args.releaseReservation) {
      await releaseSponsorReservation(ctx, args.intentId, now);
    }

    await ctx.db.patch(intent._id, {
      status: SETTLEMENT_STATUS.FAILED,
      failureCode: args.failureCode,
      updatedAt: now,
    });

    return { ok: true as const };
  },
});

/** Fixture seed helper for tests and local development. */
export const seedFixtureIntentInternal = internalMutation({
  args: {
    userId: v.id("users"),
    walletId: v.id("wallets"),
    groupId: v.id("groups"),
    recipientUserId: v.id("users"),
    recipientAddress: v.string(),
    tipId: v.optional(v.id("tips")),
    idempotencyKey: v.string(),
    minimumOutputAtomic: v.int64(),
    maximumInputAtomic: v.int64(),
  },
  handler: async (ctx, args): Promise<Id<"settlementIntents">> => {
    assertFixturePathAllowed("settlements.seedFixtureIntentInternal");
    const now = Date.now();

    const existing = await ctx.db
      .query("settlementIntents")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    if (
      args.tipId &&
      (await isTargetAlreadySettled(ctx, {
        targetKind: "tip",
        tipId: args.tipId,
      }))
    ) {
      throw new AuthError(SETTLEMENT_FAILURE.TARGET_ALREADY_SETTLED);
    }

    return ctx.db.insert("settlementIntents", {
      userId: args.userId,
      walletId: args.walletId,
      groupId: args.groupId,
      targetKind: "tip",
      tipId: args.tipId,
      recipientUserId: args.recipientUserId,
      recipientAddress: args.recipientAddress,
      inputMint: USDC_MINT,
      outputMint: USDC_MINT,
      maximumInputAtomic: args.maximumInputAtomic,
      minimumOutputAtomic: args.minimumOutputAtomic,
      idempotencyKey: args.idempotencyKey,
      status: SETTLEMENT_STATUS.QUOTING,
      policyVersion: SPONSOR_POLICY_VERSION,
      expiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    });
  },
});

