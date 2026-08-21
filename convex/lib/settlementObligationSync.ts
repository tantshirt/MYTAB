import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { USDC_MINT, WRAPPED_SOL_MINT } from "../../lib/solana/constants";
import { DFLOW_INPUT_MINTS } from "../../lib/dflow/constants";
import {
  AuthError,
  UNAUTHORIZED,
  getCurrentUser,
  requireGroupMember,
  requireTelegramContext,
} from "./auth";
import { computeBillSnapshotForObligation } from "./billSnapshot";
import { computeIntentExpiresAt } from "./intentQuoteTtl";
import { isTargetAlreadySettled } from "./settlementLedger";
import {
  SETTLEMENT_STATUS,
  SETTLEMENT_FAILURE,
  type SettlementStatus,
  isTerminalSettlementStatus,
} from "./settlementState";
import { getDefaultReceivingWalletForUser } from "./walletSync";
import { SPONSOR_POLICY_VERSION } from "../sponsorPolicy";

export const OBLIGATION_FAILURE = {
  OBLIGATION_NOT_FOUND: "OBLIGATION_NOT_FOUND",
  OBLIGATION_NOT_OPEN: "OBLIGATION_NOT_OPEN",
  PAYER_WALLET_REQUIRED: "PAYER_WALLET_REQUIRED",
  RECIPIENT_WALLET_REQUIRED: "RECIPIENT_WALLET_REQUIRED",
  INVALID_INPUT_MINT: "INVALID_INPUT_MINT",
  STALE_TAB_REVISION: "STALE_TAB_REVISION",
  DUPLICATE_NONTERMINAL_INTENT: "DUPLICATE_NONTERMINAL_INTENT",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  INVALID_ROUND_UP: "INVALID_ROUND_UP",
} as const;

export type CreateObligationIntentArgs = {
  obligationId: Id<"obligations">;
  inputMint: string;
  idempotencyKey: string;
  roundUpAtomic?: bigint;
};

export type CreateObligationIntentResult = {
  intentId: Id<"settlementIntents">;
  obligationId: Id<"obligations">;
  status: SettlementStatus;
  created: boolean;
  staleRevision?: boolean;
};

function isAllowedInputMint(mint: string): boolean {
  return (DFLOW_INPUT_MINTS as readonly string[]).includes(mint);
}

async function findIntentByIdempotencyKey(ctx: MutationCtx, idempotencyKey: string) {
  return ctx.db
    .query("settlementIntents")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
}

async function findNonTerminalIntentForObligation(
  ctx: MutationCtx,
  obligationId: Id<"obligations">,
) {
  const intents = await ctx.db
    .query("settlementIntents")
    .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligationId))
    .collect();

  return intents.find(
    (intent) => !isTerminalSettlementStatus(intent.status as SettlementStatus),
  );
}

/**
 * Creates a durable obligation settlement intent (Story 6.1).
 * Reuses the Story 3.2 pattern — idempotent on idempotencyKey.
 */
export async function createObligationIntentCore(
  ctx: MutationCtx,
  args: CreateObligationIntentArgs,
): Promise<CreateObligationIntentResult> {
  await requireTelegramContext(ctx);
  const payer = await getCurrentUser(ctx);
  if (!payer) {
    throw new AuthError(UNAUTHORIZED);
  }

  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new AuthError(OBLIGATION_FAILURE.IDEMPOTENCY_KEY_REQUIRED);
  }

  if (!isAllowedInputMint(args.inputMint)) {
    throw new AuthError(OBLIGATION_FAILURE.INVALID_INPUT_MINT);
  }

  const existing = await findIntentByIdempotencyKey(ctx, idempotencyKey);
  if (existing) {
    return {
      intentId: existing._id,
      obligationId: existing.obligationId!,
      status: existing.status as SettlementStatus,
      created: false,
    };
  }

  const obligation = await ctx.db.get(args.obligationId);
  if (!obligation) {
    throw new AuthError(OBLIGATION_FAILURE.OBLIGATION_NOT_FOUND);
  }

  if (obligation.status !== "open") {
    throw new AuthError(OBLIGATION_FAILURE.OBLIGATION_NOT_OPEN);
  }

  if (obligation.debtorUserId !== payer._id) {
    throw new AuthError(UNAUTHORIZED);
  }

  await requireGroupMember(ctx, obligation.groupId);

  const tab = await ctx.db.get(obligation.tabId);
  if (!tab) {
    throw new AuthError(OBLIGATION_FAILURE.OBLIGATION_NOT_FOUND);
  }

  const currentRevision = tab.lockedRevision ?? tab.revision ?? 1;
  if (obligation.tabRevision !== currentRevision) {
    throw new AuthError(OBLIGATION_FAILURE.STALE_TAB_REVISION);
  }

  if (
    await isTargetAlreadySettled(ctx, {
      targetKind: "obligation",
      obligationId: obligation._id,
    })
  ) {
    throw new AuthError(SETTLEMENT_FAILURE.TARGET_ALREADY_SETTLED);
  }

  const duplicate = await findNonTerminalIntentForObligation(ctx, obligation._id);
  if (duplicate) {
    throw new AuthError(OBLIGATION_FAILURE.DUPLICATE_NONTERMINAL_INTENT);
  }

  const roundUpAtomic = args.roundUpAtomic ?? 0n;
  if (roundUpAtomic < 0n) {
    throw new AuthError(OBLIGATION_FAILURE.INVALID_ROUND_UP);
  }

  const payerWallet = await ctx.db
    .query("wallets")
    .withIndex("by_user_and_default", (q) =>
      q.eq("userId", payer._id).eq("isDefaultReceiving", true),
    )
    .unique();
  if (!payerWallet) {
    throw new AuthError(OBLIGATION_FAILURE.PAYER_WALLET_REQUIRED);
  }

  const recipientUserId = obligation.creditorUserId;
  const recipientWallet = await getDefaultReceivingWalletForUser(ctx, recipientUserId);
  if (!recipientWallet) {
    throw new AuthError(OBLIGATION_FAILURE.RECIPIENT_WALLET_REQUIRED);
  }

  const minimumOutputAtomic = obligation.amountAtomic + roundUpAtomic;
  const routingKind =
    args.inputMint === USDC_MINT ? ("exact_usdc" as const) : ("dflow_sync" as const);

  const now = Date.now();
  const billSnapshotHash =
    obligation.billSnapshotHash ??
    computeBillSnapshotForObligation({
      tabId: obligation.tabId,
      lockedRevision: obligation.tabRevision,
      obligationAmountAtomic: obligation.amountAtomic,
      outputMint: obligation.outputMint,
    });

  const intentId = await ctx.db.insert("settlementIntents", {
    userId: payer._id,
    walletId: payerWallet._id,
    groupId: obligation.groupId,
    tabId: obligation.tabId,
    tabRevision: obligation.tabRevision,
    targetKind: "obligation",
    obligationId: obligation._id,
    recipientUserId,
    recipientAddress: recipientWallet.solanaAddress,
    inputMint: args.inputMint,
    outputMint: USDC_MINT,
    maximumInputAtomic:
      routingKind === "exact_usdc" ? minimumOutputAtomic : minimumOutputAtomic * 4n,
    minimumOutputAtomic,
    roundUpAtomic: roundUpAtomic > 0n ? roundUpAtomic : undefined,
    billSnapshotHash,
    routingKind,
    idempotencyKey,
    status: SETTLEMENT_STATUS.CREATED,
    policyVersion: SPONSOR_POLICY_VERSION,
    expiresAt: computeIntentExpiresAt(now),
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(obligation._id, {
    settlementIntentId: intentId,
    updatedAt: now,
  });

  return {
    intentId,
    obligationId: obligation._id,
    status: SETTLEMENT_STATUS.CREATED,
    created: true,
  };
}

export type RefreshObligationIntentArgs = {
  obligationId: Id<"obligations">;
  inputMint: string;
  idempotencyKey: string;
  roundUpAtomic?: bigint;
};

/** Creates a fresh intent against the current locked revision (Story 6.6 AC4). */
export async function refreshObligationIntentCore(
  ctx: MutationCtx,
  args: RefreshObligationIntentArgs,
): Promise<CreateObligationIntentResult> {
  return createObligationIntentCore(ctx, args);
}

/** Returns true when an intent's locked revision no longer matches the tab. */
export async function isIntentRevisionStale(
  ctx: MutationCtx,
  intent: { tabId?: Id<"tabs">; tabRevision?: number },
): Promise<boolean> {
  if (!intent.tabId || intent.tabRevision === undefined) {
    return false;
  }
  const tab = await ctx.db.get(intent.tabId);
  if (!tab) {
    return true;
  }
  const currentRevision = tab.lockedRevision ?? tab.revision ?? 1;
  return intent.tabRevision !== currentRevision;
}

/** Normalizes native SOL UI selection to wrapped SOL at the router boundary. */
export function normalizeInputMint(inputMint: string): string {
  if (inputMint === "SOL" || inputMint === "native-sol") {
    return WRAPPED_SOL_MINT;
  }
  return inputMint;
}
