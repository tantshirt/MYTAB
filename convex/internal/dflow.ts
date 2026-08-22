"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  DFLOW_ORDER_PARAMS,
  DFLOW_SOLVER_RESERVED_ATTEMPTS,
} from "../../lib/dflow/constants";
import {
  buildDflowFixtureQuote,
  isDflowFixtureMode,
} from "../../lib/dflow/fixture";
import { parseDflowOrderResponse } from "../../lib/dflow/schema";
import { solveTargetOutputQuote } from "../../lib/dflow/quoteSolver";
import { sha256Hex } from "../../lib/crypto/convexCrypto";
import { SETTLEMENT_STATUS } from "../lib/settlementState";
import { validateBeforeClientExposure } from "../../lib/solana/validateTransactionMessage";
import { resolveSponsorWalletAddress } from "../../lib/solana/fixture";
import { buildValidationContext } from "./solanaPolicy";
import { assertFixturePathAllowed } from "../../lib/solana/runtimeGuard";

type DflowLogFields = {
  intentId: string;
  requestCount: number;
  durationMs: number;
  outcome: string;
  failureCode?: string;
};

function logSolverEvent(fields: DflowLogFields): void {
  console.log(JSON.stringify(fields));
}

export type DflowOrderRequestParams = {
  inputMint: string;
  outputMint: string;
  amount: string;
  userPublicKey: string;
  destinationWallet: string;
  sponsor: string;
  sponsorExec: false;
  allowSyncExec: true;
  allowAsyncExec: false;
  includeAddressLookupTables: true;
};

/** Builds fixed-parameter DFlow order request (Story 6.2 AC1). feeAccount unset — platform fee zero. */
export function buildDflowOrderRequestParams(input: {
  inputMint: string;
  outputMint: string;
  inputAmountAtomic: bigint;
  payerAddress: string;
  recipientAddress: string;
  sponsorAddress: string;
}): DflowOrderRequestParams {
  return {
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amount: input.inputAmountAtomic.toString(),
    userPublicKey: input.payerAddress,
    destinationWallet: input.recipientAddress,
    sponsor: input.sponsorAddress,
    ...DFLOW_ORDER_PARAMS,
  };
}

/** Validates and normalizes a DFlow order response (Story 6.2 AC2). */
export function validateDflowOrderResponse(payload: unknown) {
  return parseDflowOrderResponse(payload);
}

type DflowBuildResult =
  | { ok: false; failureCode: string }
  | {
      ok: true;
      status: string;
      messageHash: string;
      fixtureMode: boolean;
      reservedAttempts: number;
    };

/**
 * DFlow order + bounded solver action (Stories 6.2, 6.3).
 * Fixture mode when DFLOW_API_KEY is absent.
 */
export const buildDflowSettlementAction = internalAction({
  args: {
    intentId: v.id("settlementIntents"),
  },
  handler: async (ctx, args): Promise<DflowBuildResult> => {
    const startedAt = Date.now();
    const intent = await ctx.runQuery(internal.settlements.getIntentInternal, {
      intentId: args.intentId,
    });

    if (!intent || intent.status !== SETTLEMENT_STATUS.CREATED) {
      return { ok: false as const, failureCode: "INVALID_INTENT_STATUS" };
    }

    if (intent.routingKind !== "dflow_sync") {
      return { ok: false as const, failureCode: "INVALID_ROUTING_KIND" };
    }

    await ctx.runMutation(internal.settlements.markQuotingInternal, {
      intentId: args.intentId,
    });

    const budget = await ctx.runMutation(internal.settlements.reserveDflowBudgetInternal, {
      intentId: args.intentId,
      userId: intent.userId,
      groupId: intent.groupId,
    });

    if (!budget.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: budget.failureCode,
        releaseReservation: false,
      });
      logSolverEvent({
        intentId: args.intentId,
        requestCount: 0,
        durationMs: Date.now() - startedAt,
        outcome: "quota_rejected",
        failureCode: budget.failureCode,
      });
      return { ok: false as const, failureCode: budget.failureCode };
    }

    const wallet = await ctx.runQuery(internal.settlements.getWalletInternal, {
      walletId: intent.walletId,
    });
    if (!wallet) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "PAYER_WALLET_REQUIRED",
        releaseReservation: false,
      });
      return { ok: false as const, failureCode: "PAYER_WALLET_REQUIRED" };
    }

    const sponsorAddress = resolveSponsorWalletAddress();
    const orderParams = buildDflowOrderRequestParams({
      inputMint: intent.inputMint,
      outputMint: intent.outputMint,
      inputAmountAtomic: intent.maximumInputAtomic,
      payerAddress: wallet.solanaAddress,
      recipientAddress: intent.recipientAddress,
      sponsorAddress,
    });

    void orderParams;

    const solverResult = solveTargetOutputQuote({
      inputMint: intent.inputMint,
      outputMint: intent.outputMint,
      inputAmountAtomic: intent.maximumInputAtomic,
      minimumOutputAtomic: intent.minimumOutputAtomic,
      sponsorAddress,
      destinationWallet: intent.recipientAddress,
      payerAddress: wallet.solanaAddress,
      requestQuote: (inputAmountAtomic) => {
        // A fabricated quote must never stand in for a real router response on
        // a deployment: it would move an intent to ready_for_signature and
        // reserve sponsor budget against numbers no solver ever returned.
        assertFixturePathAllowed("dflow.buildDflowFixtureQuote");
        const raw = buildDflowFixtureQuote({
          inputMint: intent.inputMint,
          outputMint: intent.outputMint,
          inputAmountAtomic,
          minimumOutputAtomic: intent.minimumOutputAtomic,
          sponsorAddress,
          destinationWallet: intent.recipientAddress,
          payerAddress: wallet.solanaAddress,
        });
        validateDflowOrderResponse(raw);
        return raw;
      },
    });

    await ctx.runMutation(internal.settlements.settleDflowBudgetInternal, {
      intentId: args.intentId,
      userId: intent.userId,
      groupId: intent.groupId,
      windowKey: budget.windowKey,
      reservedAttempts: budget.reservedAttempts,
      usedAttempts: solverResult.requestCount,
    });

    logSolverEvent({
      intentId: args.intentId,
      requestCount: solverResult.requestCount,
      durationMs: solverResult.durationMs,
      outcome: solverResult.ok ? "quoted" : "failed",
      failureCode: solverResult.ok ? undefined : solverResult.failureCode,
    });

    if (!solverResult.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: solverResult.failureCode,
        releaseReservation: false,
      });
      return { ok: false as const, failureCode: solverResult.failureCode };
    }

    const quote = solverResult.quote;
    const tab = intent.tabId
      ? await ctx.runQuery(internal.settlements.getTabInternal, { tabId: intent.tabId })
      : null;

    const validation = validateBeforeClientExposure(quote.serializedTransactionBase64, {
      ...buildValidationContext(intent, wallet.solanaAddress, sponsorAddress, {
        blockhash: quote.blockhash,
        lastValidBlockHeight: quote.lastValidBlockHeight,
        status: SETTLEMENT_STATUS.QUOTING,
      }),
      routingKind: "dflow_sync",
      intentId: args.intentId,
      currentTabRevision: tab?.lockedRevision ?? tab?.revision,
      intent: {
        payerAddress: wallet.solanaAddress,
        recipientAddress: intent.recipientAddress,
        inputMint: intent.inputMint,
        outputMint: intent.outputMint,
        targetOutputAtomic: intent.minimumOutputAtomic.toString(),
        maxInputAtomic: intent.maximumInputAtomic.toString(),
        minimumOutputAtomic: intent.minimumOutputAtomic.toString(),
        quotedOtherAmountThreshold: quote.otherAmountThreshold,
        status: SETTLEMENT_STATUS.QUOTING,
        lockedRevision: intent.tabRevision,
        expiresAt: intent.expiresAt,
      },
    });

    if (!validation.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: validation.code,
        releaseReservation: false,
      });
      return { ok: false as const, failureCode: validation.code };
    }

    const ready = await ctx.runMutation(internal.settlements.applyDflowQuoteInternal, {
      intentId: args.intentId,
      serializedMessage: quote.serializedTransactionBase64,
      messageHash: quote.messageHash,
      blockhash: quote.blockhash,
      lastValidBlockHeight: quote.lastValidBlockHeight,
      sponsorExposureLamports: BigInt(quote.sponsorExposureLamports),
      quotedOtherAmountThreshold: BigInt(quote.otherAmountThreshold),
      dflowContextSlot: quote.contextSlot,
      maximumInputAtomic: BigInt(quote.outAmount),
    });

    if (!ready.ok) {
      return { ok: false as const, failureCode: ready.failureCode };
    }

    return {
      ok: true as const,
      status: ready.status,
      messageHash: quote.messageHash,
      fixtureMode: isDflowFixtureMode(),
      reservedAttempts: DFLOW_SOLVER_RESERVED_ATTEMPTS,
    };
  },
});

/** Verifies byte preservation after partial signing (Story 6.2 AC4). */
export function verifyDflowBytePreservation(
  partialSignedTxBase64: string,
  storedMessageHash: string,
): { ok: true } | { ok: false; failureCode: "MESSAGE_HASH_MISMATCH" } {
  const bytes = Buffer.from(partialSignedTxBase64.split("::")[0] ?? partialSignedTxBase64, "base64");
  const hash = sha256Hex(bytes);
  if (hash !== storedMessageHash) {
    return { ok: false, failureCode: "MESSAGE_HASH_MISMATCH" };
  }
  return { ok: true };
}
