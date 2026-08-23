import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./lib/auth";
import { requireIntentOwner } from "./lib/intentAuth";
import { createTipIntentCore, refreshTipIntentCore } from "./lib/settlementIntentSync";
import {
  USDC_DECIMALS,
  USDC_MINT,
  WRAPPED_SOL_MINT,
} from "../lib/solana/constants";
import {
  createSolanaRpcClient,
  type SolanaRpcClient,
} from "../lib/solana/rpc";
import {
  decodeTokenAccount,
  deriveRecipientUsdcAta,
} from "../lib/solana/tokenAccount";
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
  isTerminalSettlementStatus,
} from "./lib/settlementState";
import { expireIntentIfPastDue } from "./lib/intentExpiry";
import { OBLIGATION_NOT_FOUND } from "./obligations";
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
import {
  assembleObligationQuote,
  classifyBalanceRead,
  formatThbLabel,
  formatUsdcLabel,
  type ObligationQuoteResult,
} from "../lib/settlement/obligationQuote";
import { getDefaultReceivingWalletForUser } from "./lib/walletSync";

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

    const recipient = await ctx.db.get(intent.recipientUserId);
    const recipientName = recipient?.displayName ?? "them";

    let amountLabel: string | null = null;
    let billName: string | null = null;
    let tabHref = "/";
    const guaranteedAtomic = intent.quotedOtherAmountThreshold ?? intent.minimumOutputAtomic;
    const recipientReceivesLabel = formatUsdcLabel(guaranteedAtomic);

    const obligation = intent.obligationId ? await ctx.db.get(intent.obligationId) : null;
    if (obligation) {
      amountLabel = formatThbLabel(obligation.displayAmountThbMinor);
      const tab = await ctx.db.get(obligation.tabId);
      if (tab) {
        billName = tab.name;
        const card = await ctx.db
          .query("telegramStatusMessages")
          .withIndex("by_tab_id", (q) => q.eq("tabId", tab._id))
          .first();
        if (card?.deepLinkToken) {
          tabHref = `/tabs/${card.deepLinkToken}`;
        }
      }
    }

    const payerWallet = intent.walletId ? await ctx.db.get(intent.walletId) : null;

    return {
      intentId: intent._id,
      status: intent.status,
      failureCode: intent.failureCode ?? null,
      transactionSignature: intent.transactionSignature ?? null,
      expiresAt: intent.expiresAt,
      recipientName,
      amountLabel,
      billName,
      tabHref,
      recipientReceivesLabel,
      walletKind: payerWallet?.kind ?? null,
      walletProvider: payerWallet?.provider ?? null,
      preparedTxBase64: intent.serializedMessage ?? null,
      targetKind: intent.targetKind,
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
      groupId: intent.groupId ?? intent.userId,
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

/**
 * Records the transaction signature BEFORE the broadcast (AD-11, decision 8).
 *
 * A fully signed Solana transaction's id is simply its first signature, so it
 * is knowable the instant the sponsor signs and before anything is sent. Writing
 * it down first is what makes an unobservable send recoverable: if the action
 * dies mid-broadcast, the intent still carries the signature that reconciliation
 * needs to look up on chain.
 *
 * Deliberately does not move the status. Nothing has been broadcast yet, and
 * `user_signed` is already a state that blocks reopen/replacement.
 */
export const markBroadcastPendingInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    transactionSignature: v.string(),
    fullySignedTx: v.string(),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      throw new AuthError("INTENT_NOT_FOUND");
    }

    // Exactly-once on the signature: the unique index on `settlements` is the
    // ultimate guard, but catching a foreign owner here means we never even
    // attempt a broadcast whose signature another intent already claimed.
    const conflict = await findSignatureOwner(ctx, args.transactionSignature);
    if (conflict && conflict !== intent._id) {
      throw new AuthError(SETTLEMENT_FAILURE.DUPLICATE_TRANSACTION_SIGNATURE);
    }

    if (
      intent.transactionSignature &&
      intent.transactionSignature !== args.transactionSignature
    ) {
      // The same intent producing two different signatures means the message
      // changed underneath us — the one thing that could double-pay.
      throw new AuthError(SETTLEMENT_FAILURE.DUPLICATE_TRANSACTION_SIGNATURE);
    }

    await ctx.db.patch(intent._id, {
      transactionSignature: args.transactionSignature,
      fullySignedTx: args.fullySignedTx,
      updatedAt: Date.now(),
    });

    return { intentId: intent._id, status: intent.status };
  },
});

/**
 * The intent that already owns a transaction signature, if any.
 *
 * `settlements.by_transaction_signature` is a unique index, so this is the
 * authoritative exactly-once check: a signature can appear in the ledger under
 * exactly one intent, ever.
 */
async function findSignatureOwner(
  ctx: MutationCtx,
  transactionSignature: string,
): Promise<Id<"settlementIntents"> | null> {
  const settlement = await ctx.db
    .query("settlements")
    .withIndex("by_transaction_signature", (q) =>
      q.eq("transactionSignature", transactionSignature),
    )
    .unique();
  return settlement ? settlement.intentId : null;
}

/**
 * Records the broadcast result — the client never broadcasts (Story 3.5 AC4).
 *
 * Idempotent by construction, because this mutation runs on a path that can be
 * retried by the Convex scheduler after the broadcast already happened:
 *
 *  - re-entry with the SAME signature on an intent that is already
 *    `submitted`/`unknown`/`confirmed` returns the current state instead of
 *    throwing. A retry is not a second payment.
 *  - a signature owned by a DIFFERENT intent still throws. That is the genuine
 *    double-pay signal and it must never be swallowed.
 *
 * `ambiguous` means the send could not be observed. Per AD-21 the transition
 * table has no `user_signed -> unknown` edge, and rightly so: we did submit,
 * we simply cannot see the outcome. So an ambiguous send walks
 * `user_signed -> submitted -> unknown`, both legal edges, and schedules
 * reconciliation rather than a confirmation read.
 */
export const markSubmittedInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    transactionSignature: v.string(),
    fullySignedTx: v.string(),
    ambiguous: v.optional(v.boolean()),
    ambiguityDetail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      throw new AuthError("INTENT_NOT_FOUND");
    }

    const owner = await findSignatureOwner(ctx, args.transactionSignature);
    if (owner && owner !== intent._id) {
      throw new AuthError(SETTLEMENT_FAILURE.DUPLICATE_TRANSACTION_SIGNATURE);
    }

    const alreadyRecorded =
      intent.transactionSignature === args.transactionSignature &&
      (intent.status === SETTLEMENT_STATUS.SUBMITTED ||
        intent.status === SETTLEMENT_STATUS.UNKNOWN ||
        intent.status === SETTLEMENT_STATUS.CONFIRMED);

    if (alreadyRecorded) {
      // Idempotent replay of a step that already happened.
      return { intentId: intent._id, status: intent.status, alreadyRecorded: true };
    }

    const now = Date.now();
    assertSettlementTransition(intent.status, SETTLEMENT_STATUS.SUBMITTED);
    await ctx.db.patch(intent._id, {
      status: SETTLEMENT_STATUS.SUBMITTED,
      transactionSignature: args.transactionSignature,
      fullySignedTx: args.fullySignedTx,
      updatedAt: now,
    });

    if (args.ambiguous) {
      assertSettlementTransition(
        SETTLEMENT_STATUS.SUBMITTED,
        SETTLEMENT_STATUS.UNKNOWN,
      );
      await ctx.db.patch(intent._id, {
        status: SETTLEMENT_STATUS.UNKNOWN,
        // Not a failure code — the intent is not failed. It records WHY the
        // observation was ambiguous so an operator can read the history.
        failureCode: args.ambiguityDetail ?? "BROADCAST_UNOBSERVED",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        RECONCILE_FIRST_DELAY_MS,
        internal.internal.settlementPipeline.reconcileSettlementIntent,
        { intentId: intent._id, attempt: 0 },
      );
      return { intentId: intent._id, status: SETTLEMENT_STATUS.UNKNOWN };
    }

    await ctx.scheduler.runAfter(0, internal.internal.settlementPipeline.processConfirmationPipeline, {
      intentId: intent._id,
      transactionSignature: args.transactionSignature,
    });

    return { intentId: intent._id, status: SETTLEMENT_STATUS.SUBMITTED };
  },
});

/**
 * Moves a submitted intent to `unknown` when the chain could not be observed.
 *
 * Never `failed`: decision 8 is explicit that a submission timeout is not a
 * failure. `unknown` keeps the sponsor reservation held and keeps the target
 * blocked from reopen, and a late confirmation still completes normally.
 */
export const markUnknownInternal = internalMutation({
  args: {
    intentId: v.id("settlementIntents"),
    reason: v.string(),
    scheduleAttempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) {
      return { ok: false as const, failureCode: "INTENT_NOT_FOUND" };
    }

    if (intent.status === SETTLEMENT_STATUS.CONFIRMED) {
      return { ok: true as const, status: intent.status };
    }

    const now = Date.now();
    if (intent.status !== SETTLEMENT_STATUS.UNKNOWN) {
      assertSettlementTransition(intent.status, SETTLEMENT_STATUS.UNKNOWN);
      await ctx.db.patch(intent._id, {
        status: SETTLEMENT_STATUS.UNKNOWN,
        failureCode: args.reason,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(intent._id, { failureCode: args.reason, updatedAt: now });
    }

    const attempt = args.scheduleAttempt;
    if (attempt !== undefined && attempt < RECONCILE_MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(
        reconcileDelayMs(attempt),
        internal.internal.settlementPipeline.reconcileSettlementIntent,
        { intentId: intent._id, attempt: attempt + 1 },
      );
    }

    return { ok: true as const, status: SETTLEMENT_STATUS.UNKNOWN };
  },
});

/** First reconciliation poll after an ambiguous broadcast. */
export const RECONCILE_FIRST_DELAY_MS = 5_000;

/**
 * Reconciliation runs for 24 hours (AD-11). Backoff doubles from 5s and caps at
 * 30 minutes; 60 attempts on that curve spans just over a day.
 */
export const RECONCILE_MAX_ATTEMPTS = 60;

export function reconcileDelayMs(attempt: number): number {
  return Math.min(RECONCILE_FIRST_DELAY_MS * 2 ** attempt, 30 * 60_000);
}

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
      if (existingSettlement.intentId !== intent._id) {
        // The same on-chain transaction cannot settle two intents. This is the
        // "late or duplicate confirmation after replacement" case in AD-11: it
        // freezes rather than silently applying a second offset.
        throw new AuthError(SETTLEMENT_FAILURE.DUPLICATE_TRANSACTION_SIGNATURE);
      }
      // Idempotent late confirmation: the ledger already moved for this exact
      // signature and this exact intent, so this is a replay, not a payment.
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

    if (
      intent.targetKind === "obligation" &&
      intent.obligationId &&
      intent.tabId &&
      intent.groupId
    ) {
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
      groupId: intent.groupId ?? intent.userId,
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
      groupId: intent.groupId ?? intent.userId,
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
      groupId: intent.groupId ?? intent.userId,
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


// ---------------------------------------------------------------------------
// Payment Sheet — the quote half of one obligation
// ---------------------------------------------------------------------------

/**
 * Server-owned facts the Payment Sheet's quote needs, minus wallet balances.
 *
 * Authorization is **debtor only**, and every party is read off the stored
 * obligation row rather than out of the arguments. `obligations.get` admits the
 * creditor and other tab participants because Bill Review is a shared read;
 * this is not that. It exposes the payer's own locked price and, through its
 * caller, the payer's wallet balances, so anyone who is not the payer has no
 * business here — including the creditor.
 */
export const getObligationQuoteBaseInternal = internalQuery({
  args: { obligationId: v.id("obligations") },
  handler: async (ctx, args) => {
    // Identity is derived from the authenticated session, never from an
    // argument. A sibling mutation set shipped with a client-supplied
    // `creditorUserId` and let any group member act on someone else's
    // receivable; nothing here reads a party from `args`.
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new AuthError(UNAUTHORIZED);
    }

    const obligation = await ctx.db.get(args.obligationId);
    if (!obligation) {
      throw new AuthError(OBLIGATION_NOT_FOUND);
    }

    if (obligation.debtorUserId !== user._id) {
      // Deny by default. Not "creditor may peek", not "participants may read".
      throw new AuthError(UNAUTHORIZED);
    }

    const tab = await ctx.db.get(obligation.tabId);
    if (!tab) {
      throw new AuthError(OBLIGATION_NOT_FOUND);
    }

    const payerWallet = await getDefaultReceivingWalletForUser(ctx, user._id);

    // Prefer the intent the obligation points at; fall back to the live
    // non-terminal one, then to the most recent attempt so a failed quote can
    // still explain itself.
    const intents = await ctx.db
      .query("settlementIntents")
      .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
      .collect();

    const linked = obligation.settlementIntentId
      ? (intents.find((row) => row._id === obligation.settlementIntentId) ?? null)
      : null;
    const nonTerminal =
      intents.find((row) => !isTerminalSettlementStatus(row.status)) ?? null;
    const newest =
      intents.length === 0
        ? null
        : intents.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    const intent = nonTerminal ?? linked ?? newest;

    const fx = tab.fxSnapshotId ? await ctx.db.get(tab.fxSnapshotId) : null;
    const recipient = await ctx.db.get(obligation.creditorUserId);

    const currentRevision = tab.lockedRevision ?? tab.revision ?? 0;

    return {
      obligationId: obligation._id,
      payerAddress: payerWallet?.solanaAddress ?? null,
      walletKind: payerWallet?.kind ?? null,
      walletProvider: payerWallet?.provider ?? null,
      outputMint: obligation.outputMint,
      obligationAmountAtomic: obligation.amountAtomic,
      displayAmountThbMinor: obligation.displayAmountThbMinor,
      tabName: tab.name,
      recipientName: recipient?.displayName ?? "",
      recipientId: obligation.creditorUserId,
      // The bill moved under the quote — the sheet must refresh before paying.
      staleRevision:
        obligation.tabRevision !== currentRevision ||
        (intent?.tabRevision !== undefined && intent.tabRevision !== currentRevision),
      rateNumeratorAtomic: fx?.numeratorAtomic ?? null,
      rateDenominatorMinor: fx?.denominatorMinor ?? null,
      intent:
        intent === null
          ? null
          : {
              _id: intent._id,
              status: intent.status,
              inputMint: intent.inputMint,
              outputMint: intent.outputMint,
              maximumInputAtomic: intent.maximumInputAtomic,
              minimumOutputAtomic: intent.minimumOutputAtomic,
              quotedOtherAmountThreshold: intent.quotedOtherAmountThreshold ?? null,
              roundUpAtomic: intent.roundUpAtomic ?? null,
              excessOutputAtomic: intent.excessOutputAtomic ?? null,
              expiresAt: intent.expiresAt,
              failureCode: intent.failureCode ?? null,
              transactionSignature: intent.transactionSignature ?? null,
              serializedMessage: intent.serializedMessage ?? null,
            },
    };
  },
});

export type QuoteTokenRow = {
  mint: string;
  symbol: string;
  decimals: number;
  balanceAtomic: bigint;
  /** Locked amount of THIS mint the payment needs, when one has been quoted. */
  requiredAtomic: bigint | null;
  /**
   * `true`/`false` only when we can prove it. `null` means the token has no
   * locked price yet, so affordability is genuinely unknown and the UI must not
   * disable it on a guess.
   *
   * EXPERIENCE requires an unaffordable token to stay visible with its balance
   * shown — never hidden — so the person can see why it is disabled.
   */
  affordable: boolean | null;
};

/** Mints the payer may settle from, with their display metadata. */
const QUOTE_TOKENS: ReadonlyArray<{ mint: string; symbol: string; decimals: number }> =
  Object.freeze([
    { mint: USDC_MINT, symbol: "USDC", decimals: USDC_DECIMALS },
    { mint: WRAPPED_SOL_MINT, symbol: "Solana", decimals: 9 },
  ]);

/**
 * The Payment Sheet's quote for one obligation (debtor only).
 *
 * An **action**, not a query, for one reason: `tokens[]` needs wallet balances
 * and there is no wallet-balance table in the schema. Balances are chain state,
 * so they come from the configured RPC, which a deterministic Convex query
 * cannot do. Everything else is read through
 * {@link getObligationQuoteBaseInternal}, which owns the debtor-only check —
 * so an unauthenticated or non-debtor caller is refused before any balance is
 * fetched.
 *
 * Balances fail closed (D-11, H7): no stored wallet, or an RPC failure, means
 * the sheet stays unavailable. Invented zeros are not balances.
 */
export type ObligationQuote = ObligationQuoteResult;

export const getObligationQuote = action({
  args: { obligationId: v.id("obligations") },
  handler: async (ctx, args): Promise<ObligationQuote> => {
    const base = await ctx.runQuery(internal.settlements.getObligationQuoteBaseInternal, {
      obligationId: args.obligationId,
    });

    const now = Date.now();
    const intent = base.intent;

    const quoteResolving =
      intent !== null &&
      (intent.status === SETTLEMENT_STATUS.CREATED ||
        intent.status === SETTLEMENT_STATUS.QUOTING);

    const quoteRemainingMs =
      intent === null ? 0 : Math.max(0, intent.expiresAt - now);

    // Only a pre-signature quote can expire. Decision 8: user-signed or
    // submitted money is never expired as a quote.
    const quoteExpired =
      intent !== null &&
      quoteRemainingMs === 0 &&
      (intent.status === SETTLEMENT_STATUS.CREATED ||
        intent.status === SETTLEMENT_STATUS.QUOTING ||
        intent.status === SETTLEMENT_STATUS.READY_FOR_SIGNATURE ||
        intent.status === SETTLEMENT_STATUS.EXPIRED);

    let rpcReady = true;
    try {
      createSolanaRpcClient();
    } catch {
      rpcReady = false;
    }

    const closed = classifyBalanceRead({
      payerAddress: base.payerAddress,
      rpcConfigured: rpcReady,
    });
    if (closed) {
      return { available: false, reason: closed };
    }

    const balances = await readQuoteTokenBalances({
      payerAddress: base.payerAddress,
      intentInputMint: intent?.inputMint ?? null,
      requiredAtomic: intent?.maximumInputAtomic ?? null,
      outputMint: base.outputMint,
      obligationAmountAtomic: base.obligationAmountAtomic,
    });
    if (!balances.ok) {
      return { available: false, reason: balances.reason };
    }

    const metadata = await ctx.runQuery(internal.tokens.readCached, {
      mints: balances.tokens.map((token) => token.mint),
    });

    return assembleObligationQuote({
      intentId: intent?._id ?? null,
      status: intent?.status ?? null,
      quoteResolving,
      quoteExpired,
      quoteRemainingMs,
      staleRevision: base.staleRevision,
      quotedOtherAmountThreshold: intent?.quotedOtherAmountThreshold ?? null,
      minimumOutputAtomic: intent?.minimumOutputAtomic ?? base.obligationAmountAtomic,
      obligationAmountAtomic: base.obligationAmountAtomic,
      maximumInputAtomic: intent?.maximumInputAtomic ?? null,
      inputMint: intent?.inputMint ?? null,
      outputMint: intent?.outputMint ?? base.outputMint,
      roundUpAtomic: intent?.roundUpAtomic ?? null,
      rateNumeratorAtomic: base.rateNumeratorAtomic,
      rateDenominatorMinor: base.rateDenominatorMinor,
      displayAmountThbMinor: base.displayAmountThbMinor,
      tabName: base.tabName,
      recipientName: base.recipientName,
      recipientId: base.recipientId,
      walletKind: base.walletKind,
      walletProvider: base.walletProvider,
      preparedTxBase64: intent?.serializedMessage ?? null,
      tokens: balances.tokens.map((token) => ({
        mint: token.mint,
        fallbackName: token.symbol,
        fallbackDecimals: token.decimals,
        balanceAtomic: token.balanceAtomic,
        requiredAtomic: token.requiredAtomic,
        affordable: token.affordable,
      })),
      metadata: metadata.results,
    });
  },
});

/**
 * Reads each settleable token's balance from the chain.
 *
 * Native SOL is read as lamports, because that is what the person actually
 * holds; wrapped SOL is a server-side detail at the router boundary and the UI
 * calls it "Solana" (binding decision 7).
 */
async function readQuoteTokenBalances(input: {
  payerAddress: string | null;
  intentInputMint: string | null;
  requiredAtomic: bigint | null;
  outputMint: string;
  obligationAmountAtomic: bigint;
}): Promise<
  | { ok: true; tokens: QuoteTokenRow[] }
  | { ok: false; reason: "NO_WALLET" | "RPC_FAILED" }
> {
  if (!input.payerAddress) {
    return { ok: false, reason: "NO_WALLET" };
  }

  let rpc: SolanaRpcClient;
  try {
    rpc = createSolanaRpcClient();
  } catch {
    return { ok: false, reason: "RPC_FAILED" };
  }

  const rows: QuoteTokenRow[] = [];
  for (const token of QUOTE_TOKENS) {
    try {
      const balanceAtomic =
        token.mint === WRAPPED_SOL_MINT
          ? await readNativeSolBalance(rpc, input.payerAddress)
          : await readSplBalance(rpc, input.payerAddress, token.mint);
      const requiredAtomic = requiredForMint(token.mint, input);
      rows.push({
        mint: token.mint,
        symbol: token.symbol,
        decimals: token.decimals,
        balanceAtomic,
        requiredAtomic,
        affordable: requiredAtomic === null ? null : balanceAtomic >= requiredAtomic,
      });
    } catch {
      return { ok: false, reason: "RPC_FAILED" };
    }
  }

  return { ok: true, tokens: rows };
}

function requiredForMint(
  mint: string,
  input: {
    intentInputMint: string | null;
    requiredAtomic: bigint | null;
    outputMint: string;
    obligationAmountAtomic: bigint;
  },
): bigint | null {
  // The quoted token has a locked cap — that is the number to compare against.
  if (input.intentInputMint === mint && input.requiredAtomic !== null) {
    return input.requiredAtomic;
  }
  // Paying USDC into a USDC obligation needs no price: it is one-for-one.
  if (mint === input.outputMint) {
    return input.obligationAmountAtomic;
  }
  // Any other token needs a router quote we do not have yet.
  return null;
}

async function readNativeSolBalance(
  rpc: SolanaRpcClient,
  address: string,
): Promise<bigint> {
  const account = await rpc.getAccountInfo(address, "confirmed");
  return account?.lamports ?? 0n;
}

async function readSplBalance(
  rpc: SolanaRpcClient,
  owner: string,
  mint: string,
): Promise<bigint> {
  const ata = deriveRecipientUsdcAta(owner, mint);
  const account = await rpc.getAccountInfo(ata, "confirmed");
  if (!account) {
    return 0n;
  }
  const decoded = decodeTokenAccount(account.dataBase64);
  // A wrong mint or owner at the derived address means the balance is not the
  // payer's to spend. Report zero rather than credit someone else's tokens.
  if (!decoded || decoded.mint !== mint || decoded.owner !== owner) {
    return 0n;
  }
  return decoded.amount;
}
