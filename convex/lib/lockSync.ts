import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { buildObligationSnapshots } from "../../lib/domain/obligations";
import { verifyLockInvariant } from "../../lib/domain/allocation";
import { fiatMinorFromInteger, type FiatMinor } from "../../lib/domain/money";
import { computeBillSnapshotForObligation } from "./billSnapshot";
import { USDC_MINT } from "../../lib/solana/constants";
import {
  computeTabBreakdowns,
  countUnassignedItems,
  loadItemClaimRows,
  persistComputedAllocations,
} from "./allocationSync";
import {
  fxFieldsFromSnapshot,
  fxRationalFromSnapshot,
  requireLockableFxSnapshot,
} from "./fxSnapshotSync";
import { getDefaultReceivingWalletForUser } from "./walletSync";
import { SETTLEMENT_STATUS } from "./settlementState";
import { AuthError } from "./auth";
import { publishTabStatusEvent } from "./telegramBot";
import { resolveVerifiedReceiveAsset } from "./receiveAsset";
import { releaseSponsorReservation } from "./sponsorReservation";
import { releaseDflowLease } from "./providerBudget";

export const LOCK_FAILURE = {
  UNASSIGNED_ITEMS: "UNASSIGNED_ITEMS",
  INVARIANT_FAILED: "INVARIANT_FAILED",
  RECIPIENT_WALLET_REQUIRED: "RECIPIENT_WALLET_REQUIRED",
  TAB_NOT_OPEN: "TAB_NOT_OPEN",
  RECEIVE_ASSET_STALE: "RECEIVE_ASSET_STALE",
} as const;

export const REOPEN_FAILURE = {
  CONFIRMED_SETTLEMENT_EXISTS: "CONFIRMED_SETTLEMENT_EXISTS",
  IN_FLIGHT_INTENT: "IN_FLIGHT_INTENT",
  TAB_NOT_LOCKED: "TAB_NOT_LOCKED",
} as const;

function toFiatMinor(value: number | bigint | undefined): FiatMinor {
  return fiatMinorFromInteger(Number(value ?? 0));
}

/** Locks the bill in one transaction (Story 5.9). */
export async function lockBillCore(
  ctx: MutationCtx,
  args: {
    tabId: Id<"tabs">;
    organizerUserId: Id<"users">;
    clientRevision: number;
    now: number;
  },
): Promise<{ snapshotId: Id<"billLockSnapshots">; revision: number; obligationIds: Id<"obligations">[] }> {
  const tab = await ctx.db.get(args.tabId);
  if (!tab) {
    throw new AuthError(LOCK_FAILURE.TAB_NOT_OPEN);
  }
  if (tab.status !== "open" && tab.status !== "draft") {
    throw new AuthError(LOCK_FAILURE.TAB_NOT_OPEN);
  }

  const revision = tab.revision ?? 1;
  if (revision !== args.clientRevision) {
    throw new AuthError("STALE_REVISION");
  }

  const items = await ctx.db
    .query("items")
    .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
    .collect();
  const adjustments = await ctx.db
    .query("adjustments")
    .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
    .collect();

  const itemRows = await loadItemClaimRows(ctx, args.tabId, items);
  const unassignedCount = countUnassignedItems(itemRows);
  if (unassignedCount > 0) {
    throw new AuthError(LOCK_FAILURE.UNASSIGNED_ITEMS);
  }

  const totals = await persistComputedAllocations(ctx, {
    tabId: args.tabId,
    revision,
    itemRows,
    adjustments,
    now: args.now,
  });

  const { breakdowns, itemSharesTotalMinor } = computeTabBreakdowns(itemRows, adjustments);
  const invariant = verifyLockInvariant({
    itemSharesTotalMinor,
    taxMinor: totals.taxMinor,
    serviceMinor: totals.serviceMinor,
    tipMinor: totals.groupTipMinor,
    discountMinor: totals.discountMinor,
    billTotalMinor: totals.billTotalMinor,
  });

  if (!invariant.valid) {
    throw new AuthError(LOCK_FAILURE.INVARIANT_FAILED);
  }

  const recipientUserId = tab.recipientUserId;
  if (!recipientUserId) {
    throw new AuthError(LOCK_FAILURE.RECIPIENT_WALLET_REQUIRED);
  }

  const recipientWallet = await getDefaultReceivingWalletForUser(ctx, recipientUserId);
  if (!recipientWallet) {
    throw new AuthError(LOCK_FAILURE.RECIPIENT_WALLET_REQUIRED);
  }

  // Locking is where the rate stops being advisory: these amounts are what the
  // recipient is paid. Fail closed rather than lock against a fixture rate.
  const fxSnapshot = await requireLockableFxSnapshot(ctx, tab.fxSnapshotId, args.now);
  const displayCurrency = tab.defaultCurrency ?? "THB";
  const displayCurrencyMinorDigits = tab.defaultCurrencyMinorDigits ?? 2;
  const receiveMint = tab.receiveMint ?? USDC_MINT;
  let receive;
  try {
    receive = await resolveVerifiedReceiveAsset(ctx, receiveMint, args.now);
  } catch {
    throw new AuthError(LOCK_FAILURE.RECEIVE_ASSET_STALE);
  }
  if (
    (tab.receiveDecimals !== undefined && tab.receiveDecimals !== receive.decimals) ||
    (tab.receiveTokenProgramId !== undefined &&
      tab.receiveTokenProgramId !== receive.tokenProgramId)
  ) {
    throw new AuthError(LOCK_FAILURE.RECEIVE_ASSET_STALE);
  }
  const receiveDecimals = receive.decimals;
  const receiveTokenProgramId = receive.tokenProgramId;
  if (fxSnapshot.baseCurrency !== displayCurrency || fxSnapshot.quoteMint !== USDC_MINT) {
    throw new AuthError("FX_SNAPSHOT_NOT_FOR_CURRENCY");
  }
  const fx = fxFieldsFromSnapshot(fxSnapshot);
  const obligations = buildObligationSnapshots(
    breakdowns,
    fxRationalFromSnapshot(fxSnapshot),
  );
  const payload = {
    revision,
    totals,
    breakdowns,
    recipientUserId,
    recipientAsset: tab.recipientAsset ?? "USDC",
    displayCurrency,
    displayCurrencyMinorDigits,
    receiveMint,
    receiveDecimals,
    receiveTokenProgramId,
    recipientAddress: recipientWallet.solanaAddress,
    settlementPolicyVersion: "fiat-receive-v2",
    fx,
  };

  const snapshotId = await ctx.db.insert("billLockSnapshots", {
    tabId: args.tabId,
    revision,
    payloadJson: JSON.stringify(payload),
    billTotalMinor: BigInt(totals.billTotalMinor),
    recipientUserId,
    recipientAsset: tab.recipientAsset ?? "USDC",
    displayCurrency,
    displayCurrencyMinorDigits,
    receiveMint,
    receiveDecimals,
    receiveTokenProgramId,
    recipientAddress: recipientWallet.solanaAddress,
    settlementPolicyVersion: "fiat-receive-v2",
    fxNumeratorAtomic: fx.fxNumeratorAtomic,
    fxDenominatorMinor: fx.fxDenominatorMinor,
    fxProvider: fx.fxProvider,
    fxPolicyVersion: fx.fxPolicyVersion,
    createdAt: args.now,
  });

  const obligationIds: Id<"obligations">[] = [];
  for (const obligation of obligations) {
    // The recipient's own allocation is already paid: reimbursement only
    // exists between distinct parties. Keeping it in the immutable snapshot
    // preserves the full bill allocation while excluding a self-debt that no
    // settlement path could or should pay.
    if (obligation.participantId === recipientUserId) {
      continue;
    }
    const billSnapshotHash = computeBillSnapshotForObligation({
      tabId: args.tabId,
      lockedRevision: revision,
      obligationAmountAtomic: obligation.settlementAmountAtomic,
      outputMint: receiveMint,
    });

    const obligationId = await ctx.db.insert("obligations", {
      groupId: tab.groupId,
      tabId: args.tabId,
      tabRevision: revision,
      debtorUserId: obligation.participantId as Id<"users">,
      creditorUserId: recipientUserId,
      displayAmountThbMinor: BigInt(obligation.displayAmountThbMinor),
      displayAmountMinor: BigInt(obligation.displayAmountThbMinor),
      displayCurrency,
      displayCurrencyMinorDigits,
      billSnapshotHash,
      amountAtomic: obligation.settlementAmountAtomic,
      referenceMint: USDC_MINT,
      referenceAmountAtomic: obligation.settlementAmountAtomic,
      referenceDecimals: 6,
      outputMint: receiveMint,
      outputDecimals: receiveDecimals,
      outputTokenProgramId: receiveTokenProgramId,
      settlementPolicyVersion: "fiat-receive-v2",
      status: "open",
      createdAt: args.now,
      updatedAt: args.now,
    });
    obligationIds.push(obligationId);
  }

  const alreadySettled = obligationIds.length === 0;
  await ctx.db.patch(args.tabId, {
    status: alreadySettled ? "settled" : "locked",
    lockedRevision: revision,
    lockSnapshotId: snapshotId,
    lockedAt: args.now,
    billTotalMinor: BigInt(totals.billTotalMinor),
    recipientAddressAtLock: recipientWallet.solanaAddress,
    updatedAt: args.now,
  });

  // A recipient-only allocation is already paid. It completes at lock instead
  // of creating an impossible self-debt or leaving a zero-obligation tab stuck.
  await publishTabStatusEvent(ctx, {
    tabId: args.tabId,
    event: alreadySettled ? "bill_completed" : "bill_ready",
    now: args.now,
  });

  return { snapshotId, revision, obligationIds };
}

const BLOCKING_INTENT_STATUSES = new Set<string>([
  SETTLEMENT_STATUS.USER_SIGNED,
  SETTLEMENT_STATUS.SUBMITTED,
  SETTLEMENT_STATUS.UNKNOWN,
  SETTLEMENT_STATUS.CONFIRMED,
]);

const SUPERSEDABLE_INTENT_STATUSES = new Set<string>([
  SETTLEMENT_STATUS.CREATED,
  SETTLEMENT_STATUS.QUOTING,
  SETTLEMENT_STATUS.READY_FOR_SIGNATURE,
]);

/** Reopens a locked bill (Story 5.10). */
export async function reopenBillCore(
  ctx: MutationCtx,
  args: {
    tabId: Id<"tabs">;
    organizerUserId: Id<"users">;
    now: number;
  },
): Promise<{ revision: number }> {
  const tab = await ctx.db.get(args.tabId);
  if (!tab || tab.status !== "locked") {
    throw new AuthError(REOPEN_FAILURE.TAB_NOT_LOCKED);
  }

  const lockedRevision = tab.lockedRevision ?? tab.revision ?? 1;

  const obligations = await ctx.db
    .query("obligations")
    .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
    .collect();

  for (const obligation of obligations) {
    if (obligation.status === "settled") {
      throw new AuthError(REOPEN_FAILURE.CONFIRMED_SETTLEMENT_EXISTS);
    }
  }

  const intents = await ctx.db
    .query("settlementIntents")
    .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
    .collect();

  const tabIntents = intents.filter(
    (intent) => intent.tabId === args.tabId && intent.tabRevision === lockedRevision,
  );

  for (const intent of tabIntents) {
    if ((BLOCKING_INTENT_STATUSES as Set<string>).has(intent.status)) {
      throw new AuthError(REOPEN_FAILURE.IN_FLIGHT_INTENT);
    }
  }

  for (const intent of tabIntents) {
    if (SUPERSEDABLE_INTENT_STATUSES.has(intent.status)) {
      await releaseSponsorReservation(ctx, intent._id, args.now);
      await releaseDflowLease(ctx, intent._id, args.now);
      await ctx.db.patch(intent._id, {
        status: SETTLEMENT_STATUS.SUPERSEDED,
        updatedAt: args.now,
      });
    }
  }

  for (const obligation of obligations) {
    if (obligation.status === "open") {
      await ctx.db.insert("obligationEvents", {
        obligationId: obligation._id,
        tabId: args.tabId,
        tabRevision: lockedRevision,
        eventKind: "superseded",
        actorUserId: args.organizerUserId,
        createdAt: args.now,
      });
      await ctx.db.patch(obligation._id, {
        status: "superseded",
        supersededAt: args.now,
        updatedAt: args.now,
      });
    }
  }

  const nextRev = (tab.revision ?? 1) + 1;
  await ctx.db.patch(args.tabId, {
    status: "open",
    revision: nextRev,
    lockedRevision: undefined,
    lockSnapshotId: undefined,
    lockedAt: undefined,
    updatedAt: args.now,
  });

  return { revision: nextRev };
}

/** Reads persisted snapshot for bill review. */
export async function readLockSnapshot(
  ctx: MutationCtx,
  tab: Doc<"tabs">,
): Promise<Record<string, unknown> | null> {
  if (!tab.lockSnapshotId) {
    return null;
  }
  const snapshot = await ctx.db.get(tab.lockSnapshotId);
  if (!snapshot) {
    return null;
  }
  return JSON.parse(snapshot.payloadJson) as Record<string, unknown>;
}

export function personalSubtotalForUser(
  breakdowns: Array<{ participantId: string; totalMinor: FiatMinor }>,
  userId: string,
): FiatMinor {
  const row = breakdowns.find((candidate) => candidate.participantId === userId);
  return row?.totalMinor ?? fiatMinorFromInteger(0);
}

export { toFiatMinor };
