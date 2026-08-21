import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { USDC_MINT } from "../../lib/solana/constants";
import {
  AuthError,
  UNAUTHORIZED,
  getCurrentUser,
  requireGroupMember,
  requireTelegramContext,
} from "./auth";
import { isTargetAlreadySettled } from "./settlementLedger";
import {
  SETTLEMENT_STATUS,
  type SettlementStatus,
  isTerminalSettlementStatus,
} from "./settlementState";
import { getDefaultReceivingWalletForUser } from "./walletSync";
import { SPONSOR_POLICY_VERSION } from "../sponsorPolicy";

export const TIP_FAILURE = {
  RECIPIENT_WALLET_REQUIRED: "RECIPIENT_WALLET_REQUIRED",
  PAYER_WALLET_REQUIRED: "PAYER_WALLET_REQUIRED",
  INVALID_TIP_AMOUNT: "INVALID_TIP_AMOUNT",
  DUPLICATE_NONTERMINAL_INTENT: "DUPLICATE_NONTERMINAL_INTENT",
  RECIPIENT_NOT_IN_GROUP: "RECIPIENT_NOT_IN_GROUP",
  CANNOT_TIP_SELF: "CANNOT_TIP_SELF",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
} as const;

export const TIP_INTENT_TTL_MS = 60_000;

export type CreateTipIntentArgs = {
  groupId: Id<"groups">;
  recipientUserId: Id<"users">;
  amountAtomic: bigint;
  displayAmountThbMinor?: bigint;
  note?: string;
  reaction?: string;
  idempotencyKey: string;
};

export type CreateTipIntentResult = {
  intentId: Id<"settlementIntents">;
  tipId: Id<"tips">;
  status: SettlementStatus;
  created: boolean;
};

async function findIntentByIdempotencyKey(ctx: MutationCtx, idempotencyKey: string) {
  return ctx.db
    .query("settlementIntents")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
}

async function findNonTerminalIntentForTip(ctx: MutationCtx, tipId: Id<"tips">) {
  const intents = await ctx.db
    .query("settlementIntents")
    .withIndex("by_tip_id", (q) => q.eq("tipId", tipId))
    .collect();

  return intents.find(
    (intent) => !isTerminalSettlementStatus(intent.status as SettlementStatus),
  );
}

async function resolveRecipientUserInGroup(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  recipientUserId: Id<"users">,
) {
  const recipientUser = await ctx.db.get(recipientUserId);
  if (!recipientUser) {
    throw new AuthError(TIP_FAILURE.RECIPIENT_NOT_IN_GROUP);
  }

  const membership = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_telegram_user_id", (q) =>
      q.eq("groupId", groupId).eq("telegramUserId", recipientUser.telegramUserId),
    )
    .unique();

  if (!membership || membership.membershipStatus !== "active") {
    throw new AuthError(TIP_FAILURE.RECIPIENT_NOT_IN_GROUP);
  }

  return recipientUser;
}

/**
 * Creates a durable tip settlement intent before any external API call (Story 3.2).
 * Idempotent on idempotencyKey; enforces one nonterminal intent per tip target lock.
 */
export async function createTipIntentCore(
  ctx: MutationCtx,
  args: CreateTipIntentArgs,
): Promise<CreateTipIntentResult> {
  await requireTelegramContext(ctx);
  await requireGroupMember(ctx, args.groupId);

  const payer = await getCurrentUser(ctx);
  if (!payer) {
    throw new AuthError(UNAUTHORIZED);
  }

  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new AuthError(TIP_FAILURE.IDEMPOTENCY_KEY_REQUIRED);
  }

  const existing = await findIntentByIdempotencyKey(ctx, idempotencyKey);
  if (existing) {
    return {
      intentId: existing._id,
      tipId: existing.tipId!,
      status: existing.status as SettlementStatus,
      created: false,
    };
  }

  if (args.recipientUserId === payer._id) {
    throw new AuthError(TIP_FAILURE.CANNOT_TIP_SELF);
  }

  const recipientUser = await resolveRecipientUserInGroup(
    ctx,
    args.groupId,
    args.recipientUserId,
  );

  const payerWallet = await ctx.db
    .query("wallets")
    .withIndex("by_user_and_default", (q) =>
      q.eq("userId", payer._id).eq("isDefaultReceiving", true),
    )
    .unique();
  if (!payerWallet) {
    throw new AuthError(TIP_FAILURE.PAYER_WALLET_REQUIRED);
  }

  const recipientWallet = await getDefaultReceivingWalletForUser(ctx, recipientUser._id);
  if (!recipientWallet) {
    throw new AuthError(TIP_FAILURE.RECIPIENT_WALLET_REQUIRED);
  }

  if (args.amountAtomic <= 0n) {
    throw new AuthError(TIP_FAILURE.INVALID_TIP_AMOUNT);
  }

  const now = Date.now();
  const tipId = await ctx.db.insert("tips", {
    groupId: args.groupId,
    senderUserId: payer._id,
    recipientUserId: args.recipientUserId,
    amountAtomic: args.amountAtomic,
    displayAmountThbMinor: args.displayAmountThbMinor,
    outputMint: USDC_MINT,
    note: args.note?.trim() || undefined,
    reaction: args.reaction?.trim() || undefined,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });

  if (
    await isTargetAlreadySettled(ctx, {
      targetKind: "tip",
      tipId,
    })
  ) {
    throw new AuthError("TARGET_ALREADY_SETTLED");
  }

  const duplicate = await findNonTerminalIntentForTip(ctx, tipId);
  if (duplicate) {
    throw new AuthError(TIP_FAILURE.DUPLICATE_NONTERMINAL_INTENT);
  }

  const intentId = await ctx.db.insert("settlementIntents", {
    userId: payer._id,
    walletId: payerWallet._id,
    groupId: args.groupId,
    targetKind: "tip",
    tipId,
    recipientUserId: args.recipientUserId,
    recipientAddress: recipientWallet.solanaAddress,
    inputMint: USDC_MINT,
    outputMint: USDC_MINT,
    maximumInputAtomic: args.amountAtomic,
    minimumOutputAtomic: args.amountAtomic,
    idempotencyKey,
    status: SETTLEMENT_STATUS.CREATED,
    policyVersion: SPONSOR_POLICY_VERSION,
    expiresAt: now + TIP_INTENT_TTL_MS,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(tipId, {
    settlementIntentId: intentId,
    updatedAt: now,
  });

  return {
    intentId,
    tipId,
    status: SETTLEMENT_STATUS.CREATED,
    created: true,
  };
}

export type RefreshTipIntentArgs = {
  tipId: Id<"tips">;
  idempotencyKey: string;
};

/**
 * Creates a new intent against an existing tip after expiry or failure (Story 3.9 AC4).
 * Reuses the tip record — never duplicates it.
 */
export async function refreshTipIntentCore(
  ctx: MutationCtx,
  args: RefreshTipIntentArgs,
): Promise<CreateTipIntentResult> {
  await requireTelegramContext(ctx);
  const payer = await getCurrentUser(ctx);
  if (!payer) {
    throw new AuthError(UNAUTHORIZED);
  }

  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new AuthError(TIP_FAILURE.IDEMPOTENCY_KEY_REQUIRED);
  }

  const existingByKey = await findIntentByIdempotencyKey(ctx, idempotencyKey);
  if (existingByKey) {
    return {
      intentId: existingByKey._id,
      tipId: existingByKey.tipId!,
      status: existingByKey.status as SettlementStatus,
      created: false,
    };
  }

  const tip = await ctx.db.get(args.tipId);
  if (!tip || tip.senderUserId !== payer._id) {
    throw new AuthError(UNAUTHORIZED);
  }

  if (tip.status === "settled") {
    throw new AuthError("TARGET_ALREADY_SETTLED");
  }

  await requireGroupMember(ctx, tip.groupId);

  const latestIntent = await findNonTerminalIntentForTip(ctx, tip._id);
  if (latestIntent) {
    throw new AuthError(TIP_FAILURE.DUPLICATE_NONTERMINAL_INTENT);
  }

  const priorIntents = await ctx.db
    .query("settlementIntents")
    .withIndex("by_tip_id", (q) => q.eq("tipId", tip._id))
    .collect();

  const refreshable = priorIntents.some((intent) =>
    intent.status === SETTLEMENT_STATUS.EXPIRED || intent.status === SETTLEMENT_STATUS.FAILED,
  );
  if (!refreshable && priorIntents.length > 0) {
    throw new AuthError(TIP_FAILURE.DUPLICATE_NONTERMINAL_INTENT);
  }

  const payerWallet = await ctx.db
    .query("wallets")
    .withIndex("by_user_and_default", (q) =>
      q.eq("userId", payer._id).eq("isDefaultReceiving", true),
    )
    .unique();
  if (!payerWallet) {
    throw new AuthError(TIP_FAILURE.PAYER_WALLET_REQUIRED);
  }

  const recipientWallet = await getDefaultReceivingWalletForUser(ctx, tip.recipientUserId);
  if (!recipientWallet) {
    throw new AuthError(TIP_FAILURE.RECIPIENT_WALLET_REQUIRED);
  }

  const now = Date.now();
  const intentId = await ctx.db.insert("settlementIntents", {
    userId: payer._id,
    walletId: payerWallet._id,
    groupId: tip.groupId,
    targetKind: "tip",
    tipId: tip._id,
    recipientUserId: tip.recipientUserId,
    recipientAddress: recipientWallet.solanaAddress,
    inputMint: USDC_MINT,
    outputMint: USDC_MINT,
    maximumInputAtomic: tip.amountAtomic,
    minimumOutputAtomic: tip.amountAtomic,
    idempotencyKey,
    status: SETTLEMENT_STATUS.CREATED,
    policyVersion: SPONSOR_POLICY_VERSION,
    expiresAt: now + TIP_INTENT_TTL_MS,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.patch(tip._id, {
    settlementIntentId: intentId,
    updatedAt: now,
  });

  return {
    intentId,
    tipId: tip._id,
    status: SETTLEMENT_STATUS.CREATED,
    created: true,
  };
}
