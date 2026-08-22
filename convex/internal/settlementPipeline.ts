"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { SETTLEMENT_FAILURE, SETTLEMENT_STATUS } from "../lib/settlementState";
import { isSponsorPaused } from "../sponsorPolicy";
import { verifyPartialSignedMessage } from "../lib/solanaFixture";
import { buildValidationContext, verifyTransactionAllowlists } from "./solanaPolicy";
import { resolveSponsorWalletAddress } from "../../lib/solana/fixture";
import { computeSettlementMemo } from "../../lib/solana/memoHash";
import { USDC_DECIMALS } from "../../lib/solana/constants";
import {
  buildConfirmationExpectation,
  parseConfirmationFixture,
} from "./confirmations";
import { coSignAndBroadcast } from "./privy";

type PipelineFailure = { ok: false; failureCode: string };
type SubmittedResult = { intentId: string; status: string };
type ConfirmedResult = {
  intentId: string;
  status: string;
  alreadyConfirmed?: boolean;
};

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

    const validation = verifyTransactionAllowlists(intent.partialSignedTx, {
      ...buildValidationContext(intent, wallet.solanaAddress, sponsorAddress, {
        blockhash: intent.blockhash ?? "",
        lastValidBlockHeight: intent.lastValidBlockHeight ?? 0,
        status: SETTLEMENT_STATUS.USER_SIGNED,
      }),
      routingKind,
      intentId: args.intentId,
      currentTabRevision: tab?.lockedRevision ?? tab?.revision,
      nowMs: Date.now(),
      expectedMemo,
      reservationActive: true,
      reservationOwnerIntentId:
        "reservationOwnerIntentId" in reservation
          ? reservation.reservationOwnerIntentId
          : args.intentId,
      intent: {
        payerAddress: wallet.solanaAddress,
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
    });

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

    const broadcast = await coSignAndBroadcast({
      intentId: args.intentId,
      partialSignedTxBase64: intent.partialSignedTx,
    });

    return ctx.runMutation(internal.settlements.markSubmittedInternal, {
      intentId: args.intentId,
      transactionSignature: broadcast.signature,
      fullySignedTx: broadcast.fullySignedTxBase64,
      ambiguous: false,
    });
  },
});

/** Parses a confirmation and applies ledger movement (Story 3.6). */
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

    // parseConfirmationFixture is guarded: on a deployment it throws rather than
    // fabricating a finalized-chain observation that would move the ledger.
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
  },
});
