"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { SETTLEMENT_FAILURE, SETTLEMENT_STATUS } from "../lib/settlementState";
import { isSponsorPaused } from "../sponsorPolicy";
import { verifyPartialSignedMessage } from "../lib/solanaFixture";
import { buildValidationContext, verifyTransactionAllowlists } from "./solanaPolicy";
import { isSolanaFixtureMode } from "../../lib/solana";
import { resolveSponsorWalletAddress } from "../../lib/solana/fixture";
import { computeSettlementMemo } from "../../lib/solana/memoHash";
import { USDC_DECIMALS } from "../../lib/solana/constants";
import {
  ClusterConfigError,
  assertClusterRpcAgreement,
} from "../../lib/solana/cluster";
import {
  CONFIRMATION_FAILURE,
  buildConfirmationExpectation,
  parseConfirmationFixture,
  parseFinalizedConfirmation,
} from "./confirmations";
import { SponsorCoSignError, coSignAndBroadcast } from "./privy";
import {
  SolanaRpcError,
  createSolanaRpcClient,
  type SolanaRpcClient,
} from "../../lib/solana/rpc";

type PipelineFailure = { ok: false; failureCode: string };
type SubmittedResult = { intentId: string; status: string };
type ConfirmedResult = {
  intentId: string;
  status: string;
  alreadyConfirmed?: boolean;
};

/** Reconciliation outcome, for logs and for the scheduler's next move. */
type ReconcileOutcome =
  | { resolution: "confirmed" }
  | { resolution: "failed"; failureCode: string }
  | { resolution: "unresolved"; reason: string; reschedule: boolean };

export const RECONCILE_FAILURE = {
  /**
   * The chain has never seen the signature, the blockhash can no longer be
   * used, and two checks on distinct finalized slots both found nothing. That
   * is the AD-11 binding proof that the payment cannot land.
   */
  BROADCAST_LOST: "BROADCAST_LOST",
  /** The transaction finalized with an on-chain error. Nothing moved. */
  TX_FAILED_ON_CHAIN: CONFIRMATION_FAILURE.TX_FAILED,
} as const;

function logSettlementEvent(fields: Record<string, string | number | undefined>): void {
  console.log(JSON.stringify(fields));
}

/**
 * Re-verify, sponsor co-sign, and broadcast (Story 3.5 AC2–AC4, AD-9, AD-17).
 *
 * This is the only code path that reaches the sponsor fee-payer key. Order is
 * deliberate and every step fails closed:
 *
 *   1. kill switch
 *   2. real ed25519 verification of the user's signature over the stored message
 *   3. sponsor budget reservation (rechecks pause, policy version, all six caps)
 *   4. full AD-10 manifest gate over the exact bytes about to be broadcast
 *   5. kill switch again, immediately before the signature request
 *   6. cluster/RPC agreement, then co-sign and exactly one broadcast
 *
 * The failure mapping is the part that protects money. `user_signed -> failed`
 * is permitted by AD-21 only with proof that nothing was broadcast, so it is
 * reached only from a {@link SponsorCoSignError}, which is thrown exclusively
 * from pre-broadcast points. Once `coSignAndBroadcast` has returned, the intent
 * moves to `submitted` or `unknown` and can never be failed by this action.
 */
export const processUserSignedPipeline = internalAction({
  args: {
    intentId: v.id("settlementIntents"),
  },
  handler: async (ctx, args): Promise<PipelineFailure | SubmittedResult> => {
    const intent = await ctx.runQuery(internal.settlements.getIntentInternal, {
      intentId: args.intentId,
    });

    if (!intent || intent.status !== SETTLEMENT_STATUS.USER_SIGNED) {
      return { ok: false as const, failureCode: SETTLEMENT_FAILURE.INVALID_STATUS };
    }

    // 1 — kill switch (NFR-4). Pause blocks new sponsorship; reads keep working.
    if (isSponsorPaused()) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "SPONSOR_PAUSED",
        releaseReservation: true,
      });
      return { ok: false as const, failureCode: "SPONSOR_PAUSED" };
    }

    if (!intent.messageHash || !intent.partialSignedTx) {
      return { ok: false as const, failureCode: SETTLEMENT_FAILURE.MESSAGE_HASH_MISMATCH };
    }

    const wallet = await ctx.runQuery(internal.settlements.getWalletInternal, {
      walletId: intent.walletId,
    });
    if (!wallet) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "PAYER_WALLET_REQUIRED",
        releaseReservation: true,
      });
      return { ok: false as const, failureCode: "PAYER_WALLET_REQUIRED" };
    }

    const sponsorAddress = resolveSponsorWalletAddress();
    const fixtureMode = isSolanaFixtureMode();

    // The cluster/RPC agreement assertion belongs before anything irreversible.
    if (!fixtureMode) {
      try {
        assertClusterRpcAgreement();
      } catch (error) {
        const failureCode =
          error instanceof ClusterConfigError ? error.code : "SOLANA_CLUSTER_UNKNOWN";
        await ctx.runMutation(internal.settlements.markFailedInternal, {
          intentId: args.intentId,
          failureCode,
          releaseReservation: true,
        });
        return { ok: false as const, failureCode };
      }
    }

    // 2 — real signature verification, against the server-held payer key and the
    // exact stored message bytes.
    const verification = verifyPartialSignedMessage({
      partialSignedTxBase64: intent.partialSignedTx,
      expectedMessageHash: intent.messageHash,
      payerAddress: wallet.solanaAddress,
      sponsorAddress,
      expectedSerializedMessageBase64: intent.serializedMessage,
    });
    if (!verification.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: verification.failureCode,
        releaseReservation: true,
      });
      return { ok: false as const, failureCode: verification.failureCode };
    }

    // 3 — sponsor budget. Fails closed on pause, policy drift, or any cap.
    const reservation = await ctx.runMutation(
      internal.settlements.ensureSponsorReservationInternal,
      { intentId: args.intentId },
    );
    if (!reservation.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: reservation.failureCode,
        releaseReservation: false,
      });
      return { ok: false as const, failureCode: reservation.failureCode };
    }

    // 4 — the AD-10 manifest gate over the bytes that will actually be broadcast.
    const validationContext = await buildPreSponsorContext(ctx, {
      intent,
      payerAddress: wallet.solanaAddress,
      sponsorAddress,
      reservationOwnerIntentId:
        "reservationOwnerIntentId" in reservation
          ? reservation.reservationOwnerIntentId
          : args.intentId,
    });

    const validation = verifyTransactionAllowlists(intent.partialSignedTx, validationContext);

    if (!validation.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: validation.code,
        releaseReservation: true,
      });
      return { ok: false as const, failureCode: validation.code };
    }

    // 5 — final kill-switch recheck immediately before the sponsor signature.
    if (isSponsorPaused()) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "SPONSOR_PAUSED",
        releaseReservation: true,
      });
      return { ok: false as const, failureCode: "SPONSOR_PAUSED" };
    }

    // 6 — co-sign and broadcast exactly once.
    let broadcast: Awaited<ReturnType<typeof coSignAndBroadcast>>;
    try {
      broadcast = await coSignAndBroadcast({
        intentId: args.intentId,
        partialSignedTxBase64: intent.partialSignedTx,
        messageHash: intent.messageHash,
        ...(intent.serializedMessage
          ? { serializedMessageBase64: intent.serializedMessage }
          : {}),
        payerAddress: wallet.solanaAddress,
        sponsorAddress,
        ...(intent.lastValidBlockHeight !== undefined
          ? { lastValidBlockHeight: intent.lastValidBlockHeight }
          : {}),
        validationContext,
        // Persist the signature before the send, so an unobservable broadcast
        // still leaves something reconciliation can look up.
        onSignatureDerived: async (evidence) => {
          await ctx.runMutation(internal.settlements.markBroadcastPendingInternal, {
            intentId: args.intentId,
            transactionSignature: evidence.transactionSignature,
            fullySignedTx: evidence.fullySignedTxBase64,
          });
        },
      });
    } catch (error) {
      // Every throw out of coSignAndBroadcast is proof that nothing reached the
      // network: SponsorCoSignError is only raised pre-broadcast, and any other
      // exception happens before the single send call. AD-21's requirement for
      // `user_signed -> failed` — "a proven pre-broadcast rejection with no
      // sponsor signature or broadcast possibility" — is therefore satisfied.
      const failureCode =
        error instanceof SponsorCoSignError
          ? error.code
          : error instanceof Error && "code" in error && typeof error.code === "string"
            ? error.code
            : "SPONSOR_COSIGN_FAILED";

      logSettlementEvent({
        intentId: args.intentId,
        statusTransition: `${SETTLEMENT_STATUS.USER_SIGNED}->${SETTLEMENT_STATUS.FAILED}`,
        failureCode,
        policyVersion: intent.policyVersion,
      });

      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode,
        releaseReservation: true,
      });
      return { ok: false as const, failureCode };
    }

    // Past this point the bytes may be on the wire. Nothing below may fail the
    // intent — an error here leaves the signature recorded and reconciliation
    // picks it up.
    logSettlementEvent({
      intentId: args.intentId,
      transactionSignature: broadcast.signature,
      statusTransition: `${SETTLEMENT_STATUS.USER_SIGNED}->${
        broadcast.broadcast === "sent"
          ? SETTLEMENT_STATUS.SUBMITTED
          : SETTLEMENT_STATUS.UNKNOWN
      }`,
      policyVersion: intent.policyVersion,
    });

    return ctx.runMutation(internal.settlements.markSubmittedInternal, {
      intentId: args.intentId,
      transactionSignature: broadcast.signature,
      fullySignedTx: broadcast.fullySignedTxBase64,
      ambiguous: broadcast.broadcast === "ambiguous",
      ...(broadcast.ambiguityDetail ? { ambiguityDetail: broadcast.ambiguityDetail } : {}),
    });
  },
});

/** Builds the pre-sponsor validation context from server-owned state only. */
async function buildPreSponsorContext(
  ctx: ActionCtx,
  input: {
    intent: Doc<"settlementIntents">;
    payerAddress: string;
    sponsorAddress: string;
    reservationOwnerIntentId: string;
  },
) {
  const { intent, payerAddress, sponsorAddress } = input;

  const tab = intent.tabId
    ? await ctx.runQuery(internal.settlements.getTabInternal, { tabId: intent.tabId })
    : null;

  const routingKind = intent.routingKind ?? "exact_usdc";
  const expectedMemo =
    routingKind === "exact_usdc"
      ? computeSettlementMemo({
          tipId: intent.tipId,
          obligationId: intent.obligationId,
          billSnapshotHash: intent.billSnapshotHash,
          targetOutputAtomic: intent.minimumOutputAtomic.toString(),
          outputMint: intent.outputMint,
          outputDecimals: USDC_DECIMALS,
        })
      : undefined;

  return {
    ...buildValidationContext(intent, payerAddress, sponsorAddress, {
      blockhash: intent.blockhash ?? "",
      lastValidBlockHeight: intent.lastValidBlockHeight ?? 0,
      status: SETTLEMENT_STATUS.USER_SIGNED,
    }),
    routingKind,
    intentId: intent._id as string,
    currentTabRevision: tab?.lockedRevision ?? tab?.revision,
    nowMs: Date.now(),
    expectedMemo,
    reservationActive: true,
    reservationOwnerIntentId: input.reservationOwnerIntentId,
    intent: {
      payerAddress,
      recipientAddress: intent.recipientAddress,
      inputMint: intent.inputMint,
      outputMint: intent.outputMint,
      targetOutputAtomic: intent.minimumOutputAtomic.toString(),
      maxInputAtomic: intent.maximumInputAtomic.toString(),
      minimumOutputAtomic: intent.minimumOutputAtomic.toString(),
      quotedOtherAmountThreshold: intent.quotedOtherAmountThreshold?.toString(),
      messageHash: intent.messageHash,
      status: SETTLEMENT_STATUS.USER_SIGNED,
      lockedRevision: intent.tabRevision,
      expiresAt: intent.expiresAt,
      policyVersion: intent.policyVersion,
    },
  };
}

/**
 * Parses a confirmation and applies ledger movement (Story 3.6, AD-11).
 *
 * On a live deployment this is a *finalized* fetch. It runs straight after a
 * successful broadcast, when the transaction has almost certainly not finalized
 * yet, so "not found" here is the normal case and hands off to reconciliation
 * rather than deciding anything.
 */
export const processConfirmationPipeline = internalAction({
  args: {
    intentId: v.id("settlementIntents"),
    transactionSignature: v.string(),
  },
  handler: async (ctx, args): Promise<PipelineFailure | ConfirmedResult> => {
    const intent = await ctx.runQuery(internal.settlements.getIntentInternal, {
      intentId: args.intentId,
    });

    if (!intent) {
      return { ok: false as const, failureCode: "INTENT_NOT_FOUND" };
    }

    if (isSolanaFixtureMode()) {
      // parseConfirmationFixture is guarded: on a deployment it throws rather
      // than fabricating a finalized-chain observation that would move the
      // ledger. This branch exists only for local dev and tests.
      const parsed = parseConfirmationFixture(
        args.transactionSignature,
        buildConfirmationExpectation(intent),
        "valid",
      );

      if (!parsed.success) {
        await ctx.runMutation(internal.settlements.markFailedInternal, {
          intentId: args.intentId,
          failureCode: parsed.failureCode,
          releaseReservation: false,
        });
        return { ok: false as const, failureCode: parsed.failureCode };
      }

      return ctx.runMutation(internal.settlements.applyConfirmedInternal, {
        intentId: args.intentId,
        transactionSignature: parsed.transactionSignature,
        sponsorDebitLamports: parsed.sponsorDebitLamports,
      });
    }

    const outcome = await reconcileOnce(ctx, args.intentId, 0);
    if (outcome.resolution === "confirmed") {
      return {
        intentId: args.intentId,
        status: SETTLEMENT_STATUS.CONFIRMED,
      };
    }
    if (outcome.resolution === "failed") {
      return { ok: false as const, failureCode: outcome.failureCode };
    }
    return { ok: false as const, failureCode: outcome.reason };
  },
});

/**
 * The AD-11 reconciliation poll for a `submitted` or `unknown` intent.
 *
 * Runs on a backoff for 24 hours. It only ever produces one of three outcomes,
 * and two of them are terminal:
 *
 *  - **confirmed** — a finalized transaction that passes every check.
 *  - **failed** — either the transaction finalized with an on-chain error, or
 *    the binding absence proof: blockhash invalid at `finalized` AND two checks
 *    on distinct finalized slots that find neither a signature status
 *    (`searchTransactionHistory=true`) nor the transaction itself.
 *  - **unresolved** — anything else. Stays `unknown`, keeps the reservation,
 *    keeps the target blocked, and tries again later. A payment that we cannot
 *    see is not a payment that did not happen.
 */
export const reconcileSettlementIntent = internalAction({
  args: {
    intentId: v.id("settlementIntents"),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    return reconcileOnce(ctx, args.intentId, args.attempt);
  },
});

async function reconcileOnce(
  ctx: ActionCtx,
  intentId: Doc<"settlementIntents">["_id"],
  attempt: number,
): Promise<ReconcileOutcome> {
  const intent = await ctx.runQuery(internal.settlements.getIntentInternal, { intentId });
  if (!intent) {
    return { resolution: "unresolved", reason: "INTENT_NOT_FOUND", reschedule: false };
  }

  if (intent.status === SETTLEMENT_STATUS.CONFIRMED) {
    return { resolution: "confirmed" };
  }
  if (
    intent.status === SETTLEMENT_STATUS.FAILED ||
    intent.status === SETTLEMENT_STATUS.EXPIRED ||
    intent.status === SETTLEMENT_STATUS.SUPERSEDED
  ) {
    return { resolution: "unresolved", reason: "INTENT_TERMINAL", reschedule: false };
  }

  const signature = intent.transactionSignature;
  if (!signature) {
    return await unresolved(ctx, intentId, "NO_TRANSACTION_SIGNATURE", attempt);
  }

  const wallet = await ctx.runQuery(internal.settlements.getWalletInternal, {
    walletId: intent.walletId,
  });
  if (!wallet) {
    return await unresolved(ctx, intentId, "PAYER_WALLET_REQUIRED", attempt);
  }

  let rpc: SolanaRpcClient;
  try {
    rpc = createSolanaRpcClient();
  } catch (error) {
    return await unresolved(
      ctx,
      intentId,
      error instanceof ClusterConfigError ? error.code : "RPC_NOT_CONFIGURED",
      attempt,
    );
  }

  const expectation = buildConfirmationExpectation(intent, {
    payerAddress: wallet.solanaAddress,
    sponsorAddress: resolveSponsorWalletAddress(),
  });

  // ---- Is it finalized? ----------------------------------------------------
  let finalized: Awaited<ReturnType<SolanaRpcClient["getFinalizedTransaction"]>>;
  try {
    finalized = await rpc.getFinalizedTransaction(signature);
  } catch (error) {
    return await unresolved(ctx, intentId, rpcReason(error), attempt);
  }

  if (finalized) {
    const parsed = parseFinalizedConfirmation(signature, finalized, expectation);

    if (parsed.success) {
      const result = await ctx.runMutation(internal.settlements.applyConfirmedInternal, {
        intentId,
        transactionSignature: parsed.transactionSignature,
        sponsorDebitLamports: parsed.sponsorDebitLamports,
      });
      logSettlementEvent({
        intentId: intentId as string,
        transactionSignature: signature,
        statusTransition: `${intent.status}->${SETTLEMENT_STATUS.CONFIRMED}`,
        dflowContextSlot: parsed.slot,
      });
      void result;
      return { resolution: "confirmed" };
    }

    // A finalized transaction that reverted moved nothing. That is the observed
    // finalized chain error AD-21 requires before `failed` after broadcast.
    if (parsed.failureCode === CONFIRMATION_FAILURE.TX_FAILED) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId,
        failureCode: CONFIRMATION_FAILURE.TX_FAILED,
        releaseReservation: true,
      });
      logSettlementEvent({
        intentId: intentId as string,
        transactionSignature: signature,
        statusTransition: `${intent.status}->${SETTLEMENT_STATUS.FAILED}`,
        failureCode: CONFIRMATION_FAILURE.TX_FAILED,
      });
      return { resolution: "failed", failureCode: CONFIRMATION_FAILURE.TX_FAILED };
    }

    // The transaction finalized SUCCESSFULLY but does not match what we locked.
    // This is not `failed` — value may well have moved, just not the value we
    // agreed to. Marking it failed would tell the payer nothing happened while
    // their USDC is gone. It stays `unknown`, keeps the target blocked, stops
    // polling, and needs a human.
    logSettlementEvent({
      intentId: intentId as string,
      transactionSignature: signature,
      failureCode: parsed.failureCode,
    });
    return await unresolved(ctx, intentId, parsed.failureCode, attempt, false);
  }

  // ---- Not finalized. Is it anywhere? --------------------------------------
  let status: Awaited<ReturnType<SolanaRpcClient["getSignatureStatus"]>>;
  try {
    status = await rpc.getSignatureStatus(signature, true);
  } catch (error) {
    return await unresolved(ctx, intentId, rpcReason(error), attempt);
  }

  if (status) {
    // Seen, but not finalized yet (or finalized and getTransaction lagged).
    return await unresolved(ctx, intentId, "AWAITING_FINALIZATION", attempt);
  }

  // ---- Absent. Can it still land? ------------------------------------------
  const blockhash = intent.blockhash;
  if (!blockhash) {
    return await unresolved(ctx, intentId, "NO_BLOCKHASH_RECORDED", attempt);
  }

  let stillValid: boolean;
  try {
    stillValid = await rpc.isBlockhashValid(blockhash, "finalized");
  } catch (error) {
    return await unresolved(ctx, intentId, rpcReason(error), attempt);
  }
  if (stillValid) {
    // The transaction can still be included. Nothing may be concluded.
    return await unresolved(ctx, intentId, "BLOCKHASH_STILL_VALID", attempt);
  }

  // The blockhash is dead, so the transaction can never be included from here.
  // AD-11 still requires two absence checks on DISTINCT finalized slots before
  // this becomes definitive — a single lagging node is not a proof.
  let proof: { proven: boolean; reason: string };
  try {
    proof = await proveSignatureAbsence(rpc, signature);
  } catch (error) {
    return await unresolved(ctx, intentId, rpcReason(error), attempt);
  }

  if (!proof.proven) {
    return await unresolved(ctx, intentId, proof.reason, attempt);
  }

  await ctx.runMutation(internal.settlements.markFailedInternal, {
    intentId,
    failureCode: RECONCILE_FAILURE.BROADCAST_LOST,
    releaseReservation: true,
  });
  logSettlementEvent({
    intentId: intentId as string,
    transactionSignature: signature,
    statusTransition: `${intent.status}->${SETTLEMENT_STATUS.FAILED}`,
    failureCode: RECONCILE_FAILURE.BROADCAST_LOST,
  });
  return { resolution: "failed", failureCode: RECONCILE_FAILURE.BROADCAST_LOST };
}

const ABSENCE_SLOT_WAIT_MS = 30_000;
const ABSENCE_POLL_INTERVAL_MS = 2_000;

/**
 * Two absence checks, on two distinct finalized slots.
 *
 * The point of "distinct slots" is that a single RPC node can be behind, or can
 * have a gap in its history. Requiring the finalized slot to have advanced
 * between the checks means the second observation comes from a strictly later
 * view of the ledger. If the slot does not advance inside the window, nothing
 * is proven and the caller stays `unknown`.
 */
async function proveSignatureAbsence(
  rpc: SolanaRpcClient,
  signature: string,
): Promise<{ proven: boolean; reason: string }> {
  const firstSlot = await rpc.getSlot("finalized");
  const first = await rpc.getSignatureStatus(signature, true);
  if (first) {
    return { proven: false, reason: "SIGNATURE_REAPPEARED" };
  }

  const deadline = Date.now() + ABSENCE_SLOT_WAIT_MS;
  let secondSlot = firstSlot;
  while (secondSlot <= firstSlot && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, ABSENCE_POLL_INTERVAL_MS));
    secondSlot = await rpc.getSlot("finalized");
  }

  if (secondSlot <= firstSlot) {
    return { proven: false, reason: "FINALIZED_SLOT_DID_NOT_ADVANCE" };
  }

  const second = await rpc.getSignatureStatus(signature, true);
  if (second) {
    return { proven: false, reason: "SIGNATURE_REAPPEARED" };
  }

  return { proven: true, reason: `absent at finalized slots ${firstSlot} and ${secondSlot}` };
}

function rpcReason(error: unknown): string {
  if (error instanceof SolanaRpcError) {
    return error.code;
  }
  return "RPC_UNAVAILABLE";
}

/**
 * Records `unknown` and, unless told otherwise, queues the next poll.
 *
 * This is the only place an unobservable broadcast lands, and it never touches
 * the sponsor reservation: the reservation must stay held while the money might
 * still move (decision 8).
 */
async function unresolved(
  ctx: ActionCtx,
  intentId: Doc<"settlementIntents">["_id"],
  reason: string,
  attempt: number,
  reschedule = true,
): Promise<ReconcileOutcome> {
  await ctx.runMutation(internal.settlements.markUnknownInternal, {
    intentId,
    reason,
    ...(reschedule ? { scheduleAttempt: attempt } : {}),
  });
  return { resolution: "unresolved", reason, reschedule };
}
