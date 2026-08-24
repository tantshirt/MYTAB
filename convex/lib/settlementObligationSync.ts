import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { TOKEN_PROGRAM_ID, USDC_MINT, WRAPPED_SOL_MINT } from "../../lib/solana/constants";
import { resolveCluster } from "../../lib/solana/cluster";
import { metadataFromRow } from "../../lib/tokens/resolve";
import { assertTransactable } from "../../lib/tokens/policy";
import {
  AuthError,
  UNAUTHORIZED,
  getCurrentUser,
  requireTelegramContext,
} from "./auth";
import { requireTabParticipant } from "./tabAuth";
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
import { releaseSponsorReservation } from "./sponsorReservation";
import { releaseDflowLease } from "./providerBudget";
import { sha256Hex } from "../../lib/crypto/convexCrypto";
import {
  resolveFxSnapshotIdForCurrency,
  usdcAtomicFromSnapshot,
} from "./fxSnapshotSync";
import { obligationDisplayAmountMinor } from "./balanceDerivation";

export const OBLIGATION_FAILURE = {
  OBLIGATION_NOT_FOUND: "OBLIGATION_NOT_FOUND",
  OBLIGATION_NOT_OPEN: "OBLIGATION_NOT_OPEN",
  PAYER_WALLET_REQUIRED: "PAYER_WALLET_REQUIRED",
  RECIPIENT_WALLET_REQUIRED: "RECIPIENT_WALLET_REQUIRED",
  INVALID_INPUT_MINT: "INVALID_INPUT_MINT",
  STALE_TAB_REVISION: "STALE_TAB_REVISION",
  DUPLICATE_NONTERMINAL_INTENT: "DUPLICATE_NONTERMINAL_INTENT",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
} as const;

export type CreateObligationIntentArgs = {
  obligationId: Id<"obligations">;
  inputMint: string;
  idempotencyKey: string;
  /** Quote refresh replaces even a same-mint pre-signature intent. */
  replaceExisting?: boolean;
};

export type CreateObligationIntentResult = {
  intentId: Id<"settlementIntents">;
  obligationId: Id<"obligations">;
  status: SettlementStatus;
  created: boolean;
  routingKind: "exact_usdc" | "dflow_sync";
  staleRevision?: boolean;
};

async function verifiedInputDecimals(ctx: MutationCtx, mint: string, now: number): Promise<number> {
  if (mint === WRAPPED_SOL_MINT) {
    // Native payer debit is not independently proven by confirmation yet.
    throw new Error("NATIVE_INPUT_UNSUPPORTED");
  }
  if (mint === USDC_MINT) {
    return 6;
  }
  const cluster = resolveCluster();
  const row = await ctx.db
    .query("tokenMetadata")
    .withIndex("by_cluster_and_mint", (q) => q.eq("cluster", cluster).eq("mint", mint))
    .unique();
  if (row?.tokenProgramId !== TOKEN_PROGRAM_ID) {
    // Includes Token-2022 and legacy rows with no owning-program proof.
    throw new Error("TOKEN_PROGRAM_UNSUPPORTED");
  }
  return assertTransactable(row ? metadataFromRow(row) : null, { now, cluster });
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

  // Durable replay is intentionally before every mutable dependency. A lost
  // response must still return the committed intent after its quote expires,
  // metadata ages, the obligation settles, or FX advances. Authorization is
  // bound to the stored owner before any intent detail is returned.
  const existing = await findIntentByIdempotencyKey(ctx, idempotencyKey);
  if (existing) {
    const persistedRequestHash = sha256Hex(JSON.stringify({
      userId: existing.userId,
      obligationId: existing.obligationId,
      tabRevision: existing.tabRevision,
      inputMint: existing.inputMint,
      outputMint: existing.outputMint,
      billSnapshotHash: existing.billSnapshotHash ?? null,
      replaceExisting: existing.idempotencyReplaceExisting === true,
    }));
    const sameRequest =
      existing.userId === payer._id &&
      existing.obligationId === args.obligationId &&
      existing.inputMint === args.inputMint &&
      (existing.idempotencyReplaceExisting === true) === (args.replaceExisting === true) &&
      // Rows created before exact request hashing remain replayable for legacy
      // callers. Once a row carries a hash, every frozen server-owned request
      // fact must reproduce it exactly before any detail is returned.
      (existing.idempotencyRequestHash === undefined ||
        existing.idempotencyRequestHash === persistedRequestHash);
    if (!sameRequest) {
      throw new AuthError(OBLIGATION_FAILURE.IDEMPOTENCY_CONFLICT);
    }
    return {
      intentId: existing._id,
      obligationId: args.obligationId,
      status: existing.status as SettlementStatus,
      created: false,
      routingKind: existing.routingKind ?? "exact_usdc",
    };
  }

  const now = Date.now();
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

  await requireTabParticipant(ctx, obligation.tabId);

  const tab = await ctx.db.get(obligation.tabId);
  if (!tab) {
    throw new AuthError(OBLIGATION_FAILURE.OBLIGATION_NOT_FOUND);
  }

  try {
    await verifiedInputDecimals(ctx, args.inputMint, now);
  } catch {
    throw new AuthError(OBLIGATION_FAILURE.INVALID_INPUT_MINT);
  }

  const requestHash = sha256Hex(JSON.stringify({
    userId: payer._id,
    obligationId: obligation._id,
    tabRevision: obligation.tabRevision,
    inputMint: args.inputMint,
    outputMint: obligation.outputMint,
    billSnapshotHash: obligation.billSnapshotHash ?? null,
    replaceExisting: args.replaceExisting === true,
  }));
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
    const replaceable =
      duplicate.status === SETTLEMENT_STATUS.CREATED ||
      duplicate.status === SETTLEMENT_STATUS.QUOTING ||
      duplicate.status === SETTLEMENT_STATUS.READY_FOR_SIGNATURE;
    if (!replaceable) {
      throw new AuthError(OBLIGATION_FAILURE.DUPLICATE_NONTERMINAL_INTENT);
    }
    if (!args.replaceExisting && duplicate.inputMint === args.inputMint) {
      return {
        intentId: duplicate._id,
        obligationId: obligation._id,
        status: duplicate.status as SettlementStatus,
        created: false,
        routingKind: duplicate.routingKind ?? "exact_usdc",
      };
    }
    await releaseSponsorReservation(ctx, duplicate._id, now);
    await releaseDflowLease(ctx, duplicate._id, now);
    await ctx.db.patch(duplicate._id, {
      status: SETTLEMENT_STATUS.SUPERSEDED,
      updatedAt: now,
    });
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

  let paymentFxSnapshotId: Id<"fxSnapshots"> | undefined;
  let referenceAmountAtomic = obligation.referenceAmountAtomic ?? obligation.amountAtomic;
  const referenceMint = obligation.referenceMint ?? USDC_MINT;
  // V2 debt is fiat-canonical. Price each attempt from that exact debt against
  // a snapshot that is fresh now; the lock-time stable reference remains only
  // the legacy compatibility lane and immutable audit evidence.
  if (obligation.settlementPolicyVersion === "fiat-receive-v2") {
    paymentFxSnapshotId = await resolveFxSnapshotIdForCurrency(
      ctx,
      obligation.displayCurrency ?? tab.defaultCurrency ?? "THB",
      now,
    );
    const paymentFx = await ctx.db.get(paymentFxSnapshotId);
    if (!paymentFx) {
      throw new AuthError("FX_SNAPSHOT_UNAVAILABLE");
    }
    referenceAmountAtomic = usdcAtomicFromSnapshot(
      paymentFx,
      obligationDisplayAmountMinor(obligation),
    );
  }
  const minimumOutputAtomic = obligation.outputMint === referenceMint
    ? referenceAmountAtomic
    : 0n;
  const routingKind =
    args.inputMint === USDC_MINT && obligation.outputMint === USDC_MINT
      ? ("exact_usdc" as const)
      : ("dflow_sync" as const);

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
    recipientAddress: tab.recipientAddressAtLock ?? recipientWallet.solanaAddress,
    inputMint: args.inputMint,
    outputMint: obligation.outputMint,
    maximumInputAtomic:
      routingKind === "exact_usdc"
        ? minimumOutputAtomic
        : 0n,
    minimumOutputAtomic,
    pricingReferenceMint: referenceMint,
    pricingReferenceAtomic: referenceAmountAtomic,
    paymentFxSnapshotId,
    billSnapshotHash,
    routingKind,
    idempotencyKey,
    idempotencyRequestHash: requestHash,
    idempotencyReplaceExisting: args.replaceExisting === true,
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
    routingKind,
  };
}

export type RefreshObligationIntentArgs = {
  obligationId: Id<"obligations">;
  inputMint: string;
  idempotencyKey: string;
};

/** Creates a fresh intent against the current locked revision (Story 6.6 AC4). */
export async function refreshObligationIntentCore(
  ctx: MutationCtx,
  args: RefreshObligationIntentArgs,
): Promise<CreateObligationIntentResult> {
  await requireTelegramContext(ctx);
  const payer = await getCurrentUser(ctx);
  if (!payer) throw new AuthError(UNAUTHORIZED);
  const requested = await ctx.db.get(args.obligationId);
  if (!requested || requested.debtorUserId !== payer._id) {
    throw new AuthError(UNAUTHORIZED);
  }

  const tab = await ctx.db.get(requested.tabId);
  if (!tab) throw new AuthError(OBLIGATION_FAILURE.OBLIGATION_NOT_FOUND);
  const currentRevision = tab.lockedRevision ?? tab.revision ?? 1;
  let obligationId = requested._id;
  if (requested.tabRevision !== currentRevision || requested.status !== "open") {
    const current = (
      await ctx.db
        .query("obligations")
        .withIndex("by_tab_id", (q) => q.eq("tabId", requested.tabId))
        .collect()
    ).find(
      (row) =>
        row.debtorUserId === payer._id &&
        row.tabRevision === currentRevision &&
        row.status === "open",
    );
    if (!current) throw new AuthError(OBLIGATION_FAILURE.OBLIGATION_NOT_OPEN);
    obligationId = current._id;
  }

  return createObligationIntentCore(ctx, {
    ...args,
    obligationId,
    replaceExisting: true,
  });
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
