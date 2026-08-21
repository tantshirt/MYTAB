"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { SETTLEMENT_FAILURE, SETTLEMENT_STATUS } from "../lib/settlementState";
import { isSponsorPaused } from "../sponsorPolicy";
import {
  verifyPartialSignedMessage,
  verifyTransactionAllowlistsFixture,
} from "./solanaPolicy";
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

/** Re-verify, sponsor co-sign, and broadcast (Story 3.5 AC2–AC4). */
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

    const verification = verifyPartialSignedMessage(
      intent.partialSignedTx,
      intent.messageHash,
    );
    if (!verification.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: verification.failureCode,
        releaseReservation: true,
      });
      return { ok: false as const, failureCode: verification.failureCode };
    }

    verifyTransactionAllowlistsFixture();

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

/** Parses fixture confirmation and applies ledger movement (Story 3.6). */
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
