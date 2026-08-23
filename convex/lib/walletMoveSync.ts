import { USDC_MINT } from "../../lib/solana/constants";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { AuthError, UNAUTHORIZED, getCurrentUser, requireTelegramContext } from "./auth";
import { computeIntentExpiresAt } from "./intentQuoteTtl";
import { SETTLEMENT_STATUS, isTerminalSettlementStatus } from "./settlementState";
import { SPONSOR_POLICY_VERSION } from "../sponsorPolicy";
import {
  findPreviousReceivingWallet,
  getDefaultReceivingWalletForUser,
  listUserWallets,
} from "./walletSync";
import { NAMED_WALLET_LABELS, type NamedWalletProvider } from "../../lib/wallet/providers";

export const WALLET_MOVE_FAILURE = {
  NO_PREVIOUS_WALLET: "NO_PREVIOUS_WALLET",
  NO_DEFAULT_WALLET: "NO_DEFAULT_WALLET",
  SAME_WALLET: "SAME_WALLET",
  AMOUNT_REQUIRED: "AMOUNT_REQUIRED",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  DUPLICATE_NONTERMINAL_INTENT: "DUPLICATE_NONTERMINAL_INTENT",
} as const;

export type WalletMoveOfferBase = {
  sourceWalletId: Id<"wallets">;
  sourceKind: "embedded" | "external";
  sourceProvider: string | null;
  sourceAddress: string;
  destinationWalletId: Id<"wallets">;
  destinationKind: "embedded" | "external";
  destinationProvider: string | null;
  destinationLabel: string;
};

export async function readWalletMoveOfferBase(
  ctx: QueryCtx | MutationCtx,
): Promise<WalletMoveOfferBase | null> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    return null;
  }

  const wallets = await listUserWallets(ctx, user._id);
  const destination = wallets.find((row) => row.isDefaultReceiving) ?? null;
  const source = findPreviousReceivingWallet(wallets);
  if (!destination || !source) {
    return null;
  }
  if (source._id === destination._id || source.solanaAddress === destination.solanaAddress) {
    return null;
  }

  return {
    sourceWalletId: source._id,
    sourceKind: source.kind,
    sourceProvider: source.provider ?? null,
    sourceAddress: source.solanaAddress,
    destinationWalletId: destination._id,
    destinationKind: destination.kind,
    destinationProvider: destination.provider ?? null,
    destinationLabel: destinationLabel(destination),
  };
}

function destinationLabel(wallet: Doc<"wallets">): string {
  if (wallet.kind === "embedded") {
    return "your My Tab wallet";
  }
  if (wallet.provider && wallet.provider !== "standard") {
    return NAMED_WALLET_LABELS[wallet.provider as NamedWalletProvider];
  }
  return "this wallet";
}

export async function createWalletMoveIntentCore(
  ctx: MutationCtx,
  args: {
    idempotencyKey: string;
    amountAtomic: bigint;
  },
): Promise<{ intentId: Id<"settlementIntents">; created: boolean }> {
  await requireTelegramContext(ctx);
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new AuthError(WALLET_MOVE_FAILURE.IDEMPOTENCY_KEY_REQUIRED);
  }
  if (args.amountAtomic <= 0n) {
    throw new AuthError(WALLET_MOVE_FAILURE.AMOUNT_REQUIRED);
  }

  const existing = await ctx.db
    .query("settlementIntents")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
  if (existing) {
    return { intentId: existing._id, created: false };
  }

  const destination = await getDefaultReceivingWalletForUser(ctx, user._id);
  const wallets = await listUserWallets(ctx, user._id);
  const source = findPreviousReceivingWallet(wallets);
  if (!source) {
    throw new AuthError(WALLET_MOVE_FAILURE.NO_PREVIOUS_WALLET);
  }
  if (!destination) {
    throw new AuthError(WALLET_MOVE_FAILURE.NO_DEFAULT_WALLET);
  }
  if (source._id === destination._id) {
    throw new AuthError(WALLET_MOVE_FAILURE.SAME_WALLET);
  }

  const openMoves = wallets.length
    ? await ctx.db
        .query("settlementIntents")
        .withIndex("by_user_id", (q) => q.eq("userId", user._id))
        .collect()
    : [];
  const duplicate = openMoves.find(
    (intent) =>
      intent.targetKind === "wallet_move" &&
      !isTerminalSettlementStatus(intent.status) &&
      intent.sourceWalletId === source._id,
  );
  if (duplicate) {
    throw new AuthError(WALLET_MOVE_FAILURE.DUPLICATE_NONTERMINAL_INTENT);
  }

  const now = Date.now();
  const intentId = await ctx.db.insert("settlementIntents", {
    userId: user._id,
    walletId: source._id,
    sourceWalletId: source._id,
    targetKind: "wallet_move",
    recipientUserId: user._id,
    recipientAddress: destination.solanaAddress,
    inputMint: USDC_MINT,
    outputMint: USDC_MINT,
    maximumInputAtomic: args.amountAtomic,
    minimumOutputAtomic: args.amountAtomic,
    routingKind: "exact_usdc",
    idempotencyKey,
    status: SETTLEMENT_STATUS.CREATED,
    policyVersion: SPONSOR_POLICY_VERSION,
    expiresAt: computeIntentExpiresAt(now),
    createdAt: now,
    updatedAt: now,
  });

  return { intentId, created: true };
}
