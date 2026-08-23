"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { DFLOW_SOLVER_RESERVED_ATTEMPTS } from "../../lib/dflow/constants";
import {
  DFLOW_SUPPORTED_CLUSTER,
  isDflowRoutingAvailable,
} from "../../lib/dflow/config";
import {
  buildDflowOrderRequestParams,
  type DflowOrderRequestParams,
} from "../../lib/dflow/orderRequest";
import { fetchDflowOrder } from "../../lib/dflow/client";
import {
  guaranteedOutputAtomic,
  parseDflowOrderResponse,
  type DflowOrderResponse,
} from "../../lib/dflow/schema";
import { solveTargetOutputQuote } from "../../lib/dflow/quoteSolver";
import { sha256Hex } from "../../lib/crypto/convexCrypto";
import { SETTLEMENT_STATUS } from "../lib/settlementState";
import { validateBeforeClientExposure } from "../../lib/solana/validateTransactionMessage";
import { decodeTransactionBase64 } from "../../lib/solana/decodeTransaction";
import {
  decodeAddressLookupTable,
  type AddressLookupTableAccount,
} from "../../lib/solana/addressLookupTable";
import { createSolanaRpcClient, SolanaRpcClient } from "../../lib/solana/rpc";
import { resolveSponsorWalletAddress } from "../../lib/solana/fixture";
import { buildValidationContext } from "./solanaPolicy";

export { buildDflowOrderRequestParams };
export type { DflowOrderRequestParams };

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

/** Validates and normalizes a DFlow order response (spec-6-2 AC2). */
export function validateDflowOrderResponse(payload: unknown) {
  return parseDflowOrderResponse(payload);
}

export const DFLOW_ACTION_FAILURE = {
  UNAVAILABLE_ON_CLUSTER: "DFLOW_UNAVAILABLE_ON_CLUSTER",
  LOOKUP_TABLE_FETCH_FAILED: "DFLOW_LOOKUP_TABLE_FETCH_FAILED",
} as const;

/**
 * Reads every address lookup table a routed transaction references.
 *
 * The router's `contextSlot` is the floor: the table must be observed at or
 * after the slot the route was priced at. Lookup table entries are append-only,
 * so a later read can only ever contain MORE — never a different address at an
 * index the router already used.
 */
export async function loadLookupTablesForTransaction(input: {
  rpc: Pick<SolanaRpcClient, "getAccountInfo" | "getSlot">;
  tableAddresses: readonly string[];
}): Promise<
  | { ok: true; tables: AddressLookupTableAccount[] }
  | { ok: false; failureCode: string; detail?: string }
> {
  if (input.tableAddresses.length === 0) {
    return { ok: true, tables: [] };
  }

  let observedSlot: number;
  try {
    observedSlot = await input.rpc.getSlot("confirmed");
  } catch (error) {
    return {
      ok: false,
      failureCode: DFLOW_ACTION_FAILURE.LOOKUP_TABLE_FETCH_FAILED,
      detail: error instanceof Error ? error.message : "getSlot",
    };
  }

  const tables: AddressLookupTableAccount[] = [];
  for (const address of input.tableAddresses) {
    let account;
    try {
      account = await input.rpc.getAccountInfo(address, "confirmed");
    } catch (error) {
      return {
        ok: false,
        failureCode: DFLOW_ACTION_FAILURE.LOOKUP_TABLE_FETCH_FAILED,
        detail: error instanceof Error ? error.message : address,
      };
    }
    if (!account) {
      return {
        ok: false,
        failureCode: DFLOW_ACTION_FAILURE.LOOKUP_TABLE_FETCH_FAILED,
        detail: `${address} not found`,
      };
    }
    const decoded = decodeAddressLookupTable({
      address,
      owner: account.owner,
      dataBase64: account.dataBase64,
      observedSlot,
    });
    if (!decoded.ok) {
      return { ok: false, failureCode: decoded.code, detail: decoded.detail };
    }
    tables.push(decoded.table);
  }

  return { ok: true, tables };
}

type DflowBuildResult =
  | { ok: false; failureCode: string; detail?: string }
  | {
      ok: true;
      status: string;
      messageHash: string;
      /** DFlow's enforced floor — the "receives at least" figure, verbatim. */
      guaranteedOutputAtomic: string;
      solvedInputAtomic: string;
      requestCount: number;
      reservedAttempts: number;
    };

/**
 * DFlow order + bounded solver action (spec-6-2, spec-6-3).
 *
 * Cluster-gated. DFlow's Trading API indexes mainnet-beta liquidity only
 * (verified: a devnet USDC mint returns `route_not_found`, and transactions from
 * the developer host carry mainnet blockhashes). On devnet this fails closed
 * with `DFLOW_UNAVAILABLE_ON_CLUSTER` rather than routing nowhere or quietly
 * substituting a fixture; the direct exact-USDC path is unaffected and remains
 * the devnet settlement route.
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

    if (!intent.groupId) {
      return { ok: false as const, failureCode: "GROUP_REQUIRED" };
    }

    // Cluster gate first: no budget is spent and no order is sent on a cluster
    // DFlow cannot route.
    if (!isDflowRoutingAvailable()) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: DFLOW_ACTION_FAILURE.UNAVAILABLE_ON_CLUSTER,
        releaseReservation: false,
      });
      logSolverEvent({
        intentId: args.intentId,
        requestCount: 0,
        durationMs: Date.now() - startedAt,
        outcome: "cluster_unsupported",
        failureCode: DFLOW_ACTION_FAILURE.UNAVAILABLE_ON_CLUSTER,
      });
      return {
        ok: false as const,
        failureCode: DFLOW_ACTION_FAILURE.UNAVAILABLE_ON_CLUSTER,
        detail: `DFlow serves ${DFLOW_SUPPORTED_CLUSTER} only`,
      };
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

    // The solver searches the INPUT amount; the target is the recipient's locked
    // USDC and the cap is what the payer authorised.
    let lastFailure: string | undefined;
    const solverResult = await solveTargetOutputQuote<DflowOrderResponse>({
      targetOutputAtomic: intent.minimumOutputAtomic,
      maxInputAtomic: intent.maximumInputAtomic,
      initialInputAtomic: intent.maximumInputAtomic,
      requestQuote: async (inputAtomic) => {
        const params = buildDflowOrderRequestParams({
          inputMint: intent.inputMint,
          outputMint: intent.outputMint,
          inputAmountAtomic: inputAtomic,
          payerAddress: wallet.solanaAddress,
          recipientAddress: intent.recipientAddress,
          sponsorAddress,
        });
        const outcome = await fetchDflowOrder(params);
        if (!outcome.ok) {
          lastFailure = outcome.failureCode;
          // `route_not_found` at one size is a routing answer, not a fault: the
          // solver steps and tries again. Anything else — a bad signature, a
          // malformed body, an async order — is fatal and stops the search.
          if (outcome.failureCode === "DFLOW_ORDER_REJECTED") {
            return null;
          }
          throw new Error(outcome.failureCode);
        }
        return {
          inputAtomic,
          guaranteedOutputAtomic: guaranteedOutputAtomic(outcome.order),
          payload: outcome.order,
        };
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
      failureCode: solverResult.ok ? undefined : (lastFailure ?? solverResult.failureCode),
    });

    if (!solverResult.ok) {
      const failureCode =
        solverResult.failureCode === "SOLVER_QUOTE_FAILED" && lastFailure
          ? lastFailure
          : solverResult.failureCode;
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode,
        releaseReservation: false,
      });
      return { ok: false as const, failureCode };
    }

    const order = solverResult.quote.payload;

    // Decode once; the blockhash and the message hash both come from the bytes
    // DFlow actually returned, never from a field alongside them.
    let decoded;
    try {
      decoded = decodeTransactionBase64(order.transaction);
    } catch {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: "MESSAGE_DECODE_FAILED",
        releaseReservation: false,
      });
      return { ok: false as const, failureCode: "MESSAGE_DECODE_FAILED" };
    }

    const messageHash = sha256Hex(decoded.message.serialized);
    const tableAddresses = decoded.message.addressTableLookups.map(
      (lookup) => lookup.accountKey,
    );

    const rpc = createSolanaRpcClient();
    const lookupTables = await loadLookupTablesForTransaction({
      rpc,
      tableAddresses,
    });
    if (!lookupTables.ok) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: lookupTables.failureCode,
        releaseReservation: false,
      });
      return {
        ok: false as const,
        failureCode: lookupTables.failureCode,
        detail: lookupTables.detail,
      };
    }

    const tab = intent.tabId
      ? await ctx.runQuery(internal.settlements.getTabInternal, { tabId: intent.tabId })
      : null;

    const threshold = guaranteedOutputAtomic(order);

    const validation = validateBeforeClientExposure(order.transaction, {
      ...buildValidationContext(intent, wallet.solanaAddress, sponsorAddress, {
        blockhash: decoded.message.recentBlockhash,
        lastValidBlockHeight: order.lastValidBlockHeight ?? 0,
        status: SETTLEMENT_STATUS.QUOTING,
      }),
      routingKind: "dflow_sync",
      intentId: args.intentId,
      currentTabRevision: tab?.lockedRevision ?? tab?.revision,
      resolvedAddressTables: lookupTables.tables,
      declaredAddressTables: order.addressLookupTables,
      dflowContextSlot: order.contextSlot,
      intent: {
        payerAddress: wallet.solanaAddress,
        recipientAddress: intent.recipientAddress,
        inputMint: intent.inputMint,
        outputMint: intent.outputMint,
        targetOutputAtomic: intent.minimumOutputAtomic.toString(),
        maxInputAtomic: intent.maximumInputAtomic.toString(),
        minimumOutputAtomic: intent.minimumOutputAtomic.toString(),
        quotedOtherAmountThreshold: threshold.toString(),
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
      return {
        ok: false as const,
        failureCode: validation.code,
        detail: validation.detail,
      };
    }

    const ready = await ctx.runMutation(internal.settlements.applyDflowQuoteInternal, {
      intentId: args.intentId,
      serializedMessage: order.transaction,
      messageHash,
      blockhash: decoded.message.recentBlockhash,
      lastValidBlockHeight: order.lastValidBlockHeight ?? 0,
      sponsorExposureLamports: BigInt(validation.sponsorExposureLamports),
      quotedOtherAmountThreshold: threshold,
      dflowContextSlot: order.contextSlot,
      // The INPUT the solver settled on, not `outAmount`. Recording the output
      // here would have let the pipeline compare a USDC figure against a
      // wrapped-SOL cap.
      maximumInputAtomic: solverResult.quote.inputAtomic,
    });

    if (!ready.ok) {
      return { ok: false as const, failureCode: ready.failureCode };
    }

    return {
      ok: true as const,
      status: ready.status,
      messageHash,
      guaranteedOutputAtomic: threshold.toString(),
      solvedInputAtomic: solverResult.quote.inputAtomic.toString(),
      requestCount: solverResult.requestCount,
      reservedAttempts: DFLOW_SOLVER_RESERVED_ATTEMPTS,
    };
  },
});

/** Verifies byte preservation after partial signing (spec-6-2 AC4). */
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
