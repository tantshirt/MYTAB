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
import { createTipIntentCore } from "./lib/settlementIntentSync";
import {
  SETTLEMENT_FAILURE,
  SETTLEMENT_STATUS,
  assertSettlementTransition,
} from "./lib/settlementState";
import { applySettlementOffset, isTargetAlreadySettled } from "./lib/settlementLedger";
import {
  releaseSponsorReservation,
  reserveSponsorBudget,
} from "./lib/sponsorReservation";
import {
  SPONSOR_POLICY_VERSION,
  isSponsorPaused,
  resolveSponsorEnvironment,
} from "./sponsorPolicy";
import {
  FIXTURE_MESSAGE_BYTES,
  FIXTURE_MESSAGE_HASH,
  FIXTURE_PARTIAL_SIGNED_TX,
  extractFixtureUserSignature,
  verifyPartialSignedMessage,
} from "./lib/solanaFixture";
import {
  FIXTURE_TX_SIGNATURE,
} from "./internal/confirmations";

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
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await createTipIntentCore(ctx, {
      groupId: args.groupId,
      recipientUserId: args.recipientUserId,
      amountAtomic: args.amountAtomic,
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
    const { intent } = await requireIntentOwner(ctx, args.intentId);
    return {
      intentId: intent._id,
      status: intent.status,
      failureCode: intent.failureCode ?? null,
      transactionSignature: intent.transactionSignature ?? null,
    };
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
    const { intent } = await requireIntentOwner(ctx, args.intentId);

    if (intent.status !== SETTLEMENT_STATUS.READY_FOR_SIGNATURE) {
      throw new AuthError(SETTLEMENT_FAILURE.INVALID_STATUS);
    }

    if (!intent.messageHash) {
      throw new AuthError(SETTLEMENT_FAILURE.MESSAGE_HASH_MISMATCH);
    }

    const verification = verifyPartialSignedMessage(
      args.partialSignedTxBase64,
      intent.messageHash,
    );
    if (!verification.ok) {
      throw new AuthError(verification.failureCode);
    }

    const userSignature = extractFixtureUserSignature(args.partialSignedTxBase64);
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
      messageHash: FIXTURE_MESSAGE_HASH,
      serializedMessage: FIXTURE_MESSAGE_BYTES,
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

    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.CONFIRMED);

    const now = Date.now();
    await ctx.db.insert("settlements", {
      intentId: intent._id,
      transactionSignature: args.transactionSignature,
      messageHash: intent.messageHash ?? FIXTURE_MESSAGE_HASH,
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

    return { intentId: intent._id, status: SETTLEMENT_STATUS.CONFIRMED, alreadyConfirmed: false };
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

/** Ensures sponsor reservation immediately before co-sign (Story 3.8 AC6). */
export const ensureSponsorReservationInternal = internalMutation({
  args: { intentId: v.id("settlementIntents") },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      return { ok: false as const, failureCode: "INTENT_NOT_FOUND" };
    }

    return reserveSponsorBudget(ctx, {
      intentId: intent._id,
      userId: intent.userId,
      walletId: intent.walletId,
      groupId: intent.groupId,
      environment: resolveSponsorEnvironment(),
      recipientAddress: intent.recipientAddress,
      outputMint: intent.outputMint,
      paused: isSponsorPaused(),
    });
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
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
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

export const FIXTURE_PARTIAL_TX = FIXTURE_PARTIAL_SIGNED_TX;
export const FIXTURE_BROADCAST_SIGNATURE = FIXTURE_TX_SIGNATURE;
