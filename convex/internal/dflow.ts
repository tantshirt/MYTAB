"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
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
import {
  decodeTransactionBase64,
  type DecodedMessage,
} from "../../lib/solana/decodeTransaction";
import {
  decodeAddressLookupTable,
  type AddressLookupTableAccount,
} from "../../lib/solana/addressLookupTable";
import { createSolanaRpcClient, SolanaRpcClient } from "../../lib/solana/rpc";
import { resolveSponsorWalletAddress } from "../../lib/solana/fixture";
import {
  TOKEN_PROGRAM_ID,
  WRAPPED_SOL_MINT,
} from "../../lib/solana/constants";
import {
  decodeTokenAccount,
  TOKEN_ACCOUNT_STATE,
} from "../../lib/solana/tokenAccount";
import { buildValidationContext } from "./solanaPolicy";
import { withDflowBudgetSettlement } from "../lib/providerBudget";

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
  PAYER_BALANCE_UNAVAILABLE: "PAYER_BALANCE_UNAVAILABLE",
  INSUFFICIENT_INPUT_BALANCE: "INSUFFICIENT_INPUT_BALANCE",
  RECEIVE_ASSET_QUOTE_INVALID: "RECEIVE_ASSET_QUOTE_INVALID",
  ORDER_INVALID: "DFLOW_ORDER_INVALID",
  RPC_CONSTRUCTION_FAILED: "RPC_CONSTRUCTION_FAILED",
  INTERNAL_QUOTE_FAILURE: "DFLOW_INTERNAL_QUOTE_FAILURE",
} as const;

const MAX_CONVEX_INT64 = (1n << 63n) - 1n;

/**
 * Independently proves the payer's spend ceiling from confirmed chain state.
 * Wrapped SOL is the router-boundary name for native lamports; every other
 * input is restricted to initialized legacy SPL Token accounts. Token-2022 is
 * therefore refused before the first quote rather than decoded as v1.
 */
export async function readProvenPayerInputBalance(input: {
  rpc: Pick<SolanaRpcClient, "getAccountInfo" | "getTokenAccountsByOwner">;
  payerAddress: string;
  inputMint: string;
}): Promise<bigint> {
  if (input.inputMint === WRAPPED_SOL_MINT) {
    const account = await input.rpc.getAccountInfo(input.payerAddress, "confirmed");
    return account ? bigintMin(account.lamports, MAX_CONVEX_INT64) : 0n;
  }

  const accounts = await input.rpc.getTokenAccountsByOwner(
    input.payerAddress,
    TOKEN_PROGRAM_ID,
    "confirmed",
  );
  let balance = 0n;
  for (const account of accounts) {
    if (account.owner !== TOKEN_PROGRAM_ID) {
      continue;
    }
    const decoded = decodeTokenAccount(account.dataBase64);
    if (
      !decoded ||
      decoded.state !== TOKEN_ACCOUNT_STATE.INITIALIZED ||
      decoded.owner !== input.payerAddress ||
      decoded.mint !== input.inputMint
    ) {
      continue;
    }
    balance = bigintMin(MAX_CONVEX_INT64, balance + decoded.amount);
  }
  return balance;
}

function bigintMin(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

/**
 * Reads every address lookup table a routed transaction references.
 *
 * The router's `contextSlot` is the floor: the table must be observed at or
 * after the slot the route was priced at. Lookup table entries are append-only,
 * so a later read can only ever contain MORE — never a different address at an
 * index the router already used.
 */
export async function loadLookupTablesForTransaction(input: {
  rpc: Pick<SolanaRpcClient, "getAccountInfo">;
  tableAddresses: readonly string[];
  contextSlot: number;
}): Promise<
  | { ok: true; tables: AddressLookupTableAccount[] }
  | { ok: false; failureCode: string; detail?: string }
> {
  if (input.tableAddresses.length === 0) {
    return { ok: true, tables: [] };
  }

  const tables: AddressLookupTableAccount[] = [];
  for (const address of input.tableAddresses) {
    let account;
    try {
      account = await input.rpc.getAccountInfo(address, "confirmed", input.contextSlot);
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
      // Either the response supplies its actual context slot or the request's
      // minContextSlot is the proven floor. Never stamp a table with a slot
      // read by an unrelated earlier RPC call.
      observedSlot: account.contextSlot ?? input.contextSlot,
    });
    if (!decoded.ok) {
      return { ok: false, failureCode: decoded.code, detail: decoded.detail };
    }
    tables.push(decoded.table);
  }

  return { ok: true, tables };
}

/** Expands ALT keys in the exact writable/readonly order used by the runtime. */
export function resolvedLoadedAddressIdentities(
  message: Pick<DecodedMessage, "addressTableLookups">,
  tables: readonly AddressLookupTableAccount[],
): { writable: string[]; readonly: string[] } {
  const byAddress = new Map(tables.map((table) => [table.address, table]));
  const writable: string[] = [];
  const readonly: string[] = [];
  for (const lookup of message.addressTableLookups) {
    const table = byAddress.get(lookup.accountKey);
    if (!table) throw new Error("ADDRESS_TABLE_UNRESOLVED");
    for (const index of lookup.writableIndexes) {
      const address = table.addresses[index];
      if (!address) throw new Error("ADDRESS_TABLE_INDEX_OUT_OF_RANGE");
      writable.push(address);
    }
    for (const index of lookup.readonlyIndexes) {
      const address = table.addresses[index];
      if (!address) throw new Error("ADDRESS_TABLE_INDEX_OUT_OF_RANGE");
      readonly.push(address);
    }
  }
  return { writable, readonly };
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
export type DflowActionDependencies = {
  isRoutingAvailable: typeof isDflowRoutingAvailable;
  createRpc: typeof createSolanaRpcClient;
  fetchOrder: typeof fetchDflowOrder;
  resolveSponsorAddress: typeof resolveSponsorWalletAddress;
  validateTransaction: typeof validateBeforeClientExposure;
};

const DEFAULT_DFLOW_ACTION_DEPENDENCIES: DflowActionDependencies = {
  isRoutingAvailable: isDflowRoutingAvailable,
  createRpc: createSolanaRpcClient,
  fetchOrder: fetchDflowOrder,
  resolveSponsorAddress: resolveSponsorWalletAddress,
  validateTransaction: validateBeforeClientExposure,
};

/**
 * The internal action handler as a testable orchestration seam. Tests inject
 * authenticated provider/RPC stand-ins while exercising the same state-machine
 * and persistence calls used by Convex; production always uses the defaults.
 */
export async function buildDflowSettlementHandler(
  ctx: ActionCtx,
  args: { intentId: Id<"settlementIntents"> },
  dependencies: Partial<DflowActionDependencies> = {},
): Promise<DflowBuildResult> {
    const deps = { ...DEFAULT_DFLOW_ACTION_DEPENDENCIES, ...dependencies };
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
    const groupId = intent.groupId;

    // Cluster gate first: no budget is spent and no order is sent on a cluster
    // DFlow cannot route.
    if (!deps.isRoutingAvailable()) {
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

    let rpc: SolanaRpcClient;
    try {
      rpc = deps.createRpc();
    } catch {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: DFLOW_ACTION_FAILURE.RPC_CONSTRUCTION_FAILED,
        releaseReservation: false,
      });
      return {
        ok: false as const,
        failureCode: DFLOW_ACTION_FAILURE.RPC_CONSTRUCTION_FAILED,
      };
    }
    let provenMaximumInputAtomic: bigint;
    try {
      provenMaximumInputAtomic = await readProvenPayerInputBalance({
        rpc,
        payerAddress: wallet.solanaAddress,
        inputMint: intent.inputMint,
      });
    } catch {
      await ctx.runMutation(internal.settlements.markQuotingInternal, {
        intentId: args.intentId,
      });
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: DFLOW_ACTION_FAILURE.PAYER_BALANCE_UNAVAILABLE,
        releaseReservation: false,
      });
      return {
        ok: false as const,
        failureCode: DFLOW_ACTION_FAILURE.PAYER_BALANCE_UNAVAILABLE,
      };
    }
    if (provenMaximumInputAtomic <= 0n) {
      await ctx.runMutation(internal.settlements.markQuotingInternal, {
        intentId: args.intentId,
      });
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: DFLOW_ACTION_FAILURE.INSUFFICIENT_INPUT_BALANCE,
        releaseReservation: false,
      });
      return {
        ok: false as const,
        failureCode: DFLOW_ACTION_FAILURE.INSUFFICIENT_INPUT_BALANCE,
      };
    }

    await ctx.runMutation(internal.settlements.setDflowMaximumInputInternal, {
      intentId: args.intentId,
      maximumInputAtomic: provenMaximumInputAtomic,
    });
    await ctx.runMutation(internal.settlements.markQuotingInternal, {
      intentId: args.intentId,
    });

    const budget = await ctx.runMutation(internal.settlements.reserveDflowBudgetInternal, {
      intentId: args.intentId,
      userId: intent.userId,
      groupId,
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

    let usedAttempts = 0;
    return withDflowBudgetSettlement(async () => {
    try {

    const sponsorAddress = deps.resolveSponsorAddress();

    let pricingRequestCount = 0;
    let targetOutputAtomic = intent.minimumOutputAtomic;
    let pricingGuaranteedOutputAtomic: bigint | undefined;
    let pricingEvidenceHash: string | undefined;
    if (
      intent.pricingReferenceMint &&
      intent.pricingReferenceAtomic &&
      intent.outputMint !== intent.pricingReferenceMint
    ) {
      pricingRequestCount = 1;
      const pricingLeaseOwned = await ctx.runMutation(
        internal.settlements.recordDflowAttemptInternal,
        { intentId: args.intentId },
      );
      if (!pricingLeaseOwned) throw new Error("PROVIDER_LEASE_LOST");
      usedAttempts += 1;
      const pricingOutcome = await deps.fetchOrder(buildDflowOrderRequestParams({
        inputMint: intent.pricingReferenceMint,
        outputMint: intent.outputMint,
        inputAmountAtomic: intent.pricingReferenceAtomic,
        payerAddress: wallet.solanaAddress,
        recipientAddress: intent.recipientAddress,
        sponsorAddress,
      }));
      if (!pricingOutcome.ok) {
        await ctx.runMutation(internal.settlements.markFailedInternal, {
          intentId: args.intentId,
          failureCode: "RECEIVE_ASSET_QUOTE_UNAVAILABLE",
          releaseReservation: false,
        });
        return { ok: false as const, failureCode: "RECEIVE_ASSET_QUOTE_UNAVAILABLE" };
      }
      targetOutputAtomic = guaranteedOutputAtomic(pricingOutcome.order);
      if (targetOutputAtomic <= 0n) {
        await ctx.runMutation(internal.settlements.markFailedInternal, {
          intentId: args.intentId,
          failureCode: DFLOW_ACTION_FAILURE.RECEIVE_ASSET_QUOTE_INVALID,
          releaseReservation: false,
        });
        return {
          ok: false as const,
          failureCode: DFLOW_ACTION_FAILURE.RECEIVE_ASSET_QUOTE_INVALID,
        };
      }
      pricingGuaranteedOutputAtomic = targetOutputAtomic;
      pricingEvidenceHash = sha256Hex(new TextEncoder().encode([
        intent.pricingReferenceMint,
        intent.pricingReferenceAtomic.toString(),
        intent.outputMint,
        targetOutputAtomic.toString(),
        String(pricingOutcome.order.contextSlot),
      ].join(":")));
    }

    // The solver searches the payer's INPUT amount against the freshly priced,
    // frozen receive mint. The stable-reference quote above is evidence, not a
    // client amount and not an assumed peg.
    let lastFailure: string | undefined;
    const solverResult = await solveTargetOutputQuote<DflowOrderResponse>({
      targetOutputAtomic,
      maxInputAtomic: provenMaximumInputAtomic,
      initialInputAtomic: provenMaximumInputAtomic,
      requestQuote: async (inputAtomic) => {
        const leaseOwned = await ctx.runMutation(
          internal.settlements.recordDflowAttemptInternal,
          { intentId: args.intentId },
        );
        if (!leaseOwned) throw new Error("PROVIDER_LEASE_LOST");
        usedAttempts += 1;
        const params = buildDflowOrderRequestParams({
          inputMint: intent.inputMint,
          outputMint: intent.outputMint,
          inputAmountAtomic: inputAtomic,
          payerAddress: wallet.solanaAddress,
          recipientAddress: intent.recipientAddress,
          sponsorAddress,
        });
        const outcome = await deps.fetchOrder(params);
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

    logSolverEvent({
      intentId: args.intentId,
      requestCount: solverResult.requestCount + pricingRequestCount,
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

    const lookupTables = await loadLookupTablesForTransaction({
      rpc,
      tableAddresses,
      contextSlot: order.contextSlot,
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
    const resolvedAltAddresses = resolvedLoadedAddressIdentities(
      decoded.message,
      lookupTables.tables,
    );

    const tab = intent.tabId
      ? await ctx.runQuery(internal.settlements.getTabInternal, { tabId: intent.tabId })
      : null;

    const threshold = guaranteedOutputAtomic(order);

    const lastValidBlockHeight = order.lastValidBlockHeight;
    if (lastValidBlockHeight === undefined || lastValidBlockHeight <= 0) {
      await ctx.runMutation(internal.settlements.markFailedInternal, {
        intentId: args.intentId,
        failureCode: DFLOW_ACTION_FAILURE.ORDER_INVALID,
        releaseReservation: false,
      });
      return { ok: false as const, failureCode: DFLOW_ACTION_FAILURE.ORDER_INVALID };
    }

    const validation = deps.validateTransaction(order.transaction, {
      ...buildValidationContext(intent, wallet.solanaAddress, sponsorAddress, {
        blockhash: decoded.message.recentBlockhash,
        lastValidBlockHeight,
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
        targetOutputAtomic: targetOutputAtomic.toString(),
        maxInputAtomic: provenMaximumInputAtomic.toString(),
        minimumOutputAtomic: targetOutputAtomic.toString(),
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
      lastValidBlockHeight,
      sponsorExposureLamports: BigInt(validation.sponsorExposureLamports),
      quotedOtherAmountThreshold: threshold,
      dflowContextSlot: order.contextSlot,
      // The INPUT the solver settled on, not `outAmount`. Recording the output
      // here would have let the pipeline compare a USDC figure against a
      // wrapped-SOL cap.
      maximumInputAtomic: solverResult.quote.inputAtomic,
      minimumOutputAtomic: targetOutputAtomic,
      resolvedAltWritableAddresses: resolvedAltAddresses.writable,
      resolvedAltReadonlyAddresses: resolvedAltAddresses.readonly,
      ...(pricingGuaranteedOutputAtomic === undefined ? {} : {
        pricingGuaranteedOutputAtomic,
        pricingProvider: "dflow:stable-reference",
        pricingQuotedAt: Date.now(),
        pricingEvidenceHash,
      }),
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
      requestCount: solverResult.requestCount + pricingRequestCount,
      reservedAttempts: DFLOW_SOLVER_RESERVED_ATTEMPTS,
    };
    } catch (error) {
      const latest = await ctx.runQuery(internal.settlements.getIntentInternal, {
        intentId: args.intentId,
      });
      if (latest?.status === SETTLEMENT_STATUS.QUOTING) {
        await ctx.runMutation(internal.settlements.markFailedInternal, {
          intentId: args.intentId,
          failureCode: DFLOW_ACTION_FAILURE.INTERNAL_QUOTE_FAILURE,
          releaseReservation: false,
        });
      }
      logSolverEvent({
        intentId: args.intentId,
        requestCount: usedAttempts,
        durationMs: Date.now() - startedAt,
        outcome: "internal_failure",
        failureCode: DFLOW_ACTION_FAILURE.INTERNAL_QUOTE_FAILURE,
      });
      return {
        ok: false as const,
        failureCode: DFLOW_ACTION_FAILURE.INTERNAL_QUOTE_FAILURE,
        detail: error instanceof Error ? error.message : undefined,
      };
    }}, async () => {
      const settlement = {
        intentId: args.intentId,
        userId: intent.userId,
        groupId,
        windowKey: budget.windowKey,
        reservedAttempts: budget.reservedAttempts,
        usedAttempts,
      };
      try {
        await ctx.runMutation(internal.settlements.settleDflowBudgetInternal, settlement);
      } catch {
        await ctx.scheduler.runAfter(
          1_000,
          internal.internal.dflow.retryDflowBudgetSettlement,
          { ...settlement, attempt: 1 },
        );
      }
    });
}

/** Durable, idempotent provider-accounting recovery after transient Convex failure. */
export const retryDflowBudgetSettlement = internalAction({
  args: {
    intentId: v.id("settlementIntents"),
    userId: v.id("users"),
    groupId: v.id("groups"),
    windowKey: v.string(),
    reservedAttempts: v.number(),
    usedAttempts: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.settlements.settleDflowBudgetInternal, {
        intentId: args.intentId,
        userId: args.userId,
        groupId: args.groupId,
        windowKey: args.windowKey,
        reservedAttempts: args.reservedAttempts,
        usedAttempts: args.usedAttempts,
      });
      return { ok: true as const };
    } catch {
      await ctx.scheduler.runAfter(
        Math.min(60_000, 1_000 * 2 ** Math.min(args.attempt, 10)),
        internal.internal.dflow.retryDflowBudgetSettlement,
        { ...args, attempt: args.attempt + 1 },
      );
      return { ok: false as const, retrying: true as const };
    }
  },
});

export const buildDflowSettlementAction = internalAction({
  args: {
    intentId: v.id("settlementIntents"),
  },
  handler: (ctx, args) => buildDflowSettlementHandler(ctx, args),
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
