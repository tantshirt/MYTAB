"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  buildExactUsdcTransfer,
  isSolanaFixtureMode,
} from "../../lib/solana";
import { resolveSponsorWalletAddress } from "../../lib/solana/fixture";
import { SETTLEMENT_STATUS } from "../lib/settlementState";
import { validateBeforeClientExposure } from "../../lib/solana/validateTransactionMessage";
import { buildValidationContext } from "./solanaPolicy";

type BuildLogFields = {
  intentId: string;
  userId: string;
  statusTransition?: string;
  durationMs?: number;
  failureCode?: string;
};

type BuildActionResult =
  | { ok: false; failureCode: string }
  | { ok: true; status: string; messageHash: string };

function logBuildEvent(fields: BuildLogFields): void {
  console.log(JSON.stringify(fields));
}

/**
 * Builds an exact USDC transfer with the sponsor as fee payer (Story 3.3).
 * Fixture mode when SOLANA_RPC_URL is absent — no live RPC required.
 */
export const buildExactUsdcTransferAction = internalAction({
  args: {
    intentId: v.id("settlementIntents"),
    recipientAtaExists: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<BuildActionResult> => {
    const startedAt = Date.now();
    const intent = await ctx.runQuery(internal.settlements.getIntentInternal, {
      intentId: args.intentId,
    });

    if (!intent || intent.status !== SETTLEMENT_STATUS.CREATED) {
      return { ok: false, failureCode: "INVALID_INTENT_STATUS" };
    }

    await ctx.runMutation(internal.settlements.markQuotingInternal, {
      intentId: args.intentId,
    });

    const wallet = await ctx.runQuery(internal.settlements.getWalletInternal, {
      walletId: intent.walletId,
    });

    if (!wallet) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "PAYER_WALLET_REQUIRED",
        releaseReservation: false,
      });
      return { ok: false, failureCode: "PAYER_WALLET_REQUIRED" };
    }

    const sponsorAddress = resolveSponsorWalletAddress();
    const recipientAtaExists = args.recipientAtaExists ?? isSolanaFixtureMode();

    const built = buildExactUsdcTransfer({
      payerAddress: wallet.solanaAddress,
      recipientAddress: intent.recipientAddress,
      sponsorAddress,
      amountAtomic: intent.minimumOutputAtomic,
      tipId: intent.tipId ?? args.intentId,
      recipientAtaExists,
    });

    if (built.ataCreates > 1) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "ATA_LIMIT_EXCEEDED",
        releaseReservation: false,
      });
      logBuildEvent({
        intentId: args.intentId,
        userId: intent.userId,
        statusTransition: `${SETTLEMENT_STATUS.QUOTING}->${SETTLEMENT_STATUS.FAILED}`,
        durationMs: Date.now() - startedAt,
        failureCode: "ATA_LIMIT_EXCEEDED",
      });
      return { ok: false, failureCode: "ATA_LIMIT_EXCEEDED" };
    }

    const validation = validateBeforeClientExposure(built.serializedBase64, {
      ...buildValidationContext(intent, wallet.solanaAddress, sponsorAddress, {
        blockhash: built.blockhash,
        lastValidBlockHeight: built.lastValidBlockHeight,
        status: SETTLEMENT_STATUS.QUOTING,
      }),
      intentId: args.intentId,
    });

    if (!validation.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: validation.code,
        releaseReservation: false,
      });
      logBuildEvent({
        intentId: args.intentId,
        userId: intent.userId,
        statusTransition: `${SETTLEMENT_STATUS.QUOTING}->${SETTLEMENT_STATUS.FAILED}`,
        durationMs: Date.now() - startedAt,
        failureCode: validation.code,
      });
      return { ok: false, failureCode: validation.code };
    }

    const ready = await ctx.runMutation(internal.settlements.applyQuotedTransactionInternal, {
      intentId: args.intentId,
      serializedMessage: built.serializedBase64,
      messageHash: built.messageHash,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
      sponsorExposureLamports: BigInt(built.sponsorExposureLamports),
    });

    if (!ready.ok) {
      return { ok: false, failureCode: ready.failureCode };
    }

    logBuildEvent({
      intentId: args.intentId,
      userId: intent.userId,
      statusTransition: `${SETTLEMENT_STATUS.QUOTING}->${SETTLEMENT_STATUS.READY_FOR_SIGNATURE}`,
      durationMs: Date.now() - startedAt,
    });

    return {
      ok: true,
      status: ready.status,
      messageHash: built.messageHash,
    };
  },
});
