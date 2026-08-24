import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { AuthError, UNAUTHORIZED, requireGroupMember, getCurrentUser } from "./lib/auth";
import { requireTabParticipant } from "./lib/tabAuth";
import { appendActivityEvent, ACTIVITY_EVENT_TYPE } from "./lib/activitySync";
import {
  billIdForObligation,
  confirmedOffsetMinorByObligation,
  obligationDisplayAmountMinor,
} from "./lib/balanceDerivation";
import { resolveViewerScope } from "./lib/viewerScope";
import {
  currencyMinorDigits,
  formatCurrencyMinorBigInt,
} from "../lib/domain/currency";
import { isTerminalSettlementStatus, type SettlementStatus } from "./lib/settlementState";
import {
  countTabSettlementProgress,
  queuePaymentProgressUpdate,
} from "./lib/paymentConfirmationNotify";

export const OFFSET_FAILURE = {
  OBLIGATION_NOT_FOUND: "OBLIGATION_NOT_FOUND",
  OBLIGATION_NOT_OPEN: "OBLIGATION_NOT_OPEN",
  NOT_OBLIGATION_PARTY: "NOT_OBLIGATION_PARTY",
  WAIVER_NOT_AUTHORIZED: "WAIVER_NOT_AUTHORIZED",
  SETTLEMENT_IN_FLIGHT: "SETTLEMENT_IN_FLIGHT",
  INVALID_CASH_PROPOSAL: "INVALID_CASH_PROPOSAL",
  CASH_ALREADY_ACKNOWLEDGED: "CASH_ALREADY_ACKNOWLEDGED",
  CASH_SELF_ACKNOWLEDGE: "CASH_SELF_ACKNOWLEDGE",
} as const;

type ActivityMutationCtx = GenericMutationCtx<DataModel>;

type ObligationDisplayMoney = Pick<
  Doc<"obligations">,
  "displayAmountMinor" | "displayAmountThbMinor" | "displayCurrency"
>;

/** D-33 dual-read: v2 is generic ISO fiat; an absent v2 lane is legacy THB. */
export function obligationDisplayMoney(
  obligation: ObligationDisplayMoney,
): { amountMinor: bigint; currency: string; minorDigits: number } {
  const currency = obligation.displayCurrency ?? "THB";
  return {
    amountMinor: obligationDisplayAmountMinor(obligation),
    currency,
    minorDigits: currencyMinorDigits(currency),
  };
}

async function completeOffsetObligation(
  ctx: ActivityMutationCtx,
  obligation: Doc<"obligations">,
  now: number,
): Promise<void> {
  await ctx.db.patch(obligation._id, {
    status: "settled",
    settledAt: now,
    updatedAt: now,
  });
  const progress = await countTabSettlementProgress(ctx, obligation.tabId);
  await queuePaymentProgressUpdate(ctx, {
    tabId: obligation.tabId,
    groupId: obligation.groupId,
    settledCount: progress.settledCount,
    totalCount: progress.totalCount,
    billCompleted: progress.billCompleted,
  });
  if (progress.billCompleted) {
    const tab = await ctx.db.get(obligation.tabId);
    if (tab?.status === "locked") {
      await ctx.db.patch(obligation.tabId, { status: "settled", updatedAt: now });
    }
  }
}

/**
 * Loads an obligation for an off-chain offset and proves the caller is party to it.
 *
 * Every field an offset needs — group, tab, bill, both parties, the amount —
 * comes off this row. None of it is accepted from the client: a member who
 * could name their own `creditorUserId` next to somebody else's `obligationId`
 * could waive a debt they have no claim on, and a client-supplied `amountMinor`
 * could zero an obligation that was never paid.
 */
async function requireOffsettableObligation(
  ctx: ActivityMutationCtx,
  obligationId: Id<"obligations">,
): Promise<{ obligation: Doc<"obligations">; user: Doc<"users"> }> {
  const { obligation, user } = await requireObligationParty(ctx, obligationId);

  if (obligation.status !== "open") {
    throw new AuthError(OFFSET_FAILURE.OBLIGATION_NOT_OPEN);
  }

  const existing = await ctx.db
    .query("obligationLedgerEvents")
    .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
    .collect();

  const { amountMinor: obligationAmountMinor } = obligationDisplayMoney(obligation);
  const alreadyOffset =
    (confirmedOffsetMinorByObligation(existing).get(obligation._id) ?? 0n) >=
    obligationAmountMinor;
  if (alreadyOffset) {
    throw new AuthError(OFFSET_FAILURE.OBLIGATION_NOT_OPEN);
  }

  // "Waiver and cash are ... unavailable while an on-chain payment is in
  // flight" (EXPERIENCE). Two offsets for one debt is money invented.
  if (obligation.settlementIntentId) {
    const intent = await ctx.db.get(obligation.settlementIntentId);
    if (intent && !isTerminalSettlementStatus(intent.status as SettlementStatus)) {
      throw new AuthError(OFFSET_FAILURE.SETTLEMENT_IN_FLIGHT);
    }
  }

  return { obligation, user };
}

/** Authentication/party proof shared by first execution and replay checks. */
async function requireObligationParty(
  ctx: ActivityMutationCtx,
  obligationId: Id<"obligations">,
): Promise<{ obligation: Doc<"obligations">; user: Doc<"users"> }> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const obligation = await ctx.db.get(obligationId);
  if (!obligation) {
    throw new AuthError(OFFSET_FAILURE.OBLIGATION_NOT_FOUND);
  }

  // Obligations only exist after lock. The frozen participant roster, not a
  // mutable Telegram membership check, is the post-lock authority (D-07).
  await requireTabParticipant(ctx, obligation.tabId);

  if (
    obligation.debtorUserId !== user._id &&
    obligation.creditorUserId !== user._id
  ) {
    throw new AuthError(OFFSET_FAILURE.NOT_OBLIGATION_PARTY);
  }

  return { obligation, user };
}

/** Lists activity events for a group, reverse chronological (Story 7.3 AC4). */
export const listForGroup = query({
  args: {
    groupId: v.id("groups"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireGroupMember(ctx, args.groupId);
    const limit = args.limit ?? 50;

    const events = await ctx.db
      .query("activityEvents")
      .withIndex("by_group_id", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(limit);

    return events.map((event) => ({
      _id: event._id,
      type: event.type,
      payload: event.payload,
      tabId: event.tabId,
      createdAt: event.createdAt,
    }));
  },
});

/**
 * The viewer's feed across every group they belong to (Story 7.3 AC4).
 *
 * Group enumeration is the viewer's own active `groupMembers` rows, so this can
 * never widen past what `listForGroup` would allow one group at a time. Each
 * group is read newest-first through `by_group_and_created`, then merged — no
 * table scan, and no group's events are read without membership.
 */
export const listForViewer = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveViewerScope(ctx);
    if (!scope) {
      return [];
    }

    const limit = args.limit ?? 50;
    const merged: Array<{
      _id: Id<"activityEvents">;
      groupId: Id<"groups">;
      groupName: string;
      type: string;
      payload: unknown;
      tabId: Id<"tabs"> | undefined;
      createdAt: number;
    }> = [];

    for (const groupId of scope.groupIds) {
      const group = await ctx.db.get(groupId);
      const events = await ctx.db
        .query("activityEvents")
        .withIndex("by_group_and_created", (q) => q.eq("groupId", groupId))
        .order("desc")
        .take(limit);

      for (const event of events) {
        merged.push({
          _id: event._id,
          groupId,
          groupName: group?.displayName ?? "Group",
          type: event.type,
          payload: event.payload,
          tabId: event.tabId,
          createdAt: event.createdAt,
        });
      }
    }

    for (const tabId of scope.personalTabIds) {
      const tab = await ctx.db.get(tabId);
      if (!tab) continue;
      const events = await ctx.db
        .query("activityEvents")
        .withIndex("by_tab_and_created", (q) => q.eq("tabId", tabId))
        .order("desc")
        .take(limit);
      for (const event of events) {
        merged.push({
          _id: event._id,
          groupId: event.groupId,
          groupName: tab.name,
          type: event.type,
          payload: event.payload,
          tabId: event.tabId,
          createdAt: event.createdAt,
        });
      }
    }

    return merged.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  },
});

// `seedFixtureEvents` is gone. It was a deployed PUBLIC mutation that any group
// member could call to write four hardcoded events — including a "Tim paid Maya
// 42.10 USDC" payment carrying an invented transaction signature — into a real
// group's activity feed. It had no callers.

/**
 * Proposes a manual cash settlement — the balance does not move yet (Story 7.3 AC7).
 *
 * Either party may propose. The amount is the obligation's own locked
 * bill-currency amount; a proposal for "some other number" is not a thing the
 * ledger can represent.
 */
export const proposeCashSettlement = mutation({
  args: {
    obligationId: v.id("obligations"),
  },
  handler: async (ctx, args) => {
    const { obligation, user } = await requireOffsettableObligation(
      ctx,
      args.obligationId,
    );

    const open = await ctx.db
      .query("obligationLedgerEvents")
      .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
      .collect();

    const displayMoney = obligationDisplayMoney(obligation);

    const pending = open.find(
      (event) =>
        event.eventKind === "cash_proposed" &&
        !event.confirmed &&
        event.amountMinor === displayMoney.amountMinor &&
        (event.displayCurrency ?? "THB") === displayMoney.currency,
    );
    if (pending) {
      return { proposalId: pending._id, created: false as const };
    }

    const proposalId = await ctx.db.insert("obligationLedgerEvents", {
      groupId: obligation.groupId,
      tabId: obligation.tabId,
      obligationId: obligation._id,
      billId: billIdForObligation(obligation),
      debtorUserId: obligation.debtorUserId,
      creditorUserId: obligation.creditorUserId,
      amountMinor: displayMoney.amountMinor,
      displayCurrency: displayMoney.currency,
      displayCurrencyMinorDigits: displayMoney.minorDigits,
      eventKind: "cash_proposed",
      confirmed: false,
      actorUserId: user._id,
      createdAt: Date.now(),
    });

    await appendActivityEvent(ctx, {
      groupId: obligation.groupId,
      tabId: obligation.tabId,
      actorUserId: user._id,
      type: ACTIVITY_EVENT_TYPE.CASH_PROPOSED,
      payload: {
        summary: "Cash settlement proposed",
        amountMinor: displayMoney.amountMinor.toString(),
        currency: displayMoney.currency,
        amountLabel: `${formatCurrencyMinorBigInt(
          displayMoney.amountMinor,
          displayMoney.currency,
        )} pending acknowledgement`,
        tabId: obligation.tabId,
        billId: billIdForObligation(obligation),
      },
    });

    return { proposalId, created: true as const };
  },
});

/**
 * Acknowledges a cash settlement — the immutable offset (Story 7.3 AC7).
 *
 * "Cash is pending until payer and recipient acknowledge the same amount"
 * (EXPERIENCE), so the acknowledgement must come from the *other* party. One
 * person cannot both propose and confirm their own cash payment.
 */
export const acknowledgeCashSettlement = mutation({
  args: {
    proposalId: v.id("obligationLedgerEvents"),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.eventKind !== "cash_proposed") {
      throw new AuthError(OFFSET_FAILURE.INVALID_CASH_PROPOSAL);
    }

    const { obligation, user } = await requireObligationParty(
      ctx,
      proposal.obligationId as Id<"obligations">,
    );

    if (proposal.actorUserId === user._id) {
      throw new AuthError(OFFSET_FAILURE.CASH_SELF_ACKNOWLEDGE);
    }

    const existing = await ctx.db
      .query("obligationLedgerEvents")
      .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
      .collect();

    const priorAcknowledgement = existing.find(
      (event) =>
        event.eventKind === "cash_offset" && event.linkedProposalId === args.proposalId,
    );
    if (priorAcknowledgement) {
      return {
        ok: true as const,
        replayed: true as const,
        acknowledgementId: priorAcknowledgement._id,
      };
    }

    await requireOffsettableObligation(ctx, obligation._id);

    const displayMoney = obligationDisplayMoney(obligation);
    // A stale or forged proposal cannot clear a differently-denominated debt.
    // Legacy proposals have no currency metadata and therefore mean THB.
    if (
      proposal.amountMinor !== displayMoney.amountMinor ||
      (proposal.displayCurrency ?? "THB") !== displayMoney.currency
    ) {
      throw new AuthError(OFFSET_FAILURE.INVALID_CASH_PROPOSAL);
    }

    const now = Date.now();
    const acknowledgementId = await ctx.db.insert("obligationLedgerEvents", {
      groupId: obligation.groupId,
      tabId: obligation.tabId,
      obligationId: obligation._id,
      billId: billIdForObligation(obligation),
      debtorUserId: obligation.debtorUserId,
      creditorUserId: obligation.creditorUserId,
      amountMinor: proposal.amountMinor,
      displayCurrency: displayMoney.currency,
      displayCurrencyMinorDigits: displayMoney.minorDigits,
      eventKind: "cash_offset",
      confirmed: true,
      actorUserId: user._id,
      linkedProposalId: args.proposalId,
      createdAt: now,
    });

    await appendActivityEvent(ctx, {
      groupId: obligation.groupId,
      tabId: obligation.tabId,
      actorUserId: user._id,
      type: ACTIVITY_EVENT_TYPE.CASH_ACKNOWLEDGED,
      payload: {
        summary: "Cash settlement acknowledged",
        amountMinor: displayMoney.amountMinor.toString(),
        currency: displayMoney.currency,
        amountLabel: formatCurrencyMinorBigInt(
          displayMoney.amountMinor,
          displayMoney.currency,
        ),
        tabId: obligation.tabId,
        billId: billIdForObligation(obligation),
      },
    });

    await completeOffsetObligation(ctx, obligation, now);

    return { ok: true as const, replayed: false as const, acknowledgementId };
  },
});

/**
 * Recipient-authorized waiver (Story 7.3 AC6).
 *
 * Only the obligation's own creditor can waive it, checked against the stored
 * row rather than a client-supplied `creditorUserId`.
 */
export const waiveObligation = mutation({
  args: {
    obligationId: v.id("obligations"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { obligation, user } = await requireObligationParty(
      ctx,
      args.obligationId,
    );

    if (obligation.creditorUserId !== user._id) {
      throw new AuthError(OFFSET_FAILURE.WAIVER_NOT_AUTHORIZED);
    }

    const priorWaiver = (
      await ctx.db
        .query("obligationLedgerEvents")
        .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
        .collect()
    ).find((event) => event.eventKind === "waiver_offset" && event.confirmed);
    if (priorWaiver) {
      return { ok: true as const, replayed: true as const, waiverId: priorWaiver._id };
    }

    await requireOffsettableObligation(ctx, obligation._id);

    const displayMoney = obligationDisplayMoney(obligation);

    const now = Date.now();
    const waiverId = await ctx.db.insert("obligationLedgerEvents", {
      groupId: obligation.groupId,
      tabId: obligation.tabId,
      obligationId: obligation._id,
      billId: billIdForObligation(obligation),
      debtorUserId: obligation.debtorUserId,
      creditorUserId: obligation.creditorUserId,
      amountMinor: displayMoney.amountMinor,
      displayCurrency: displayMoney.currency,
      displayCurrencyMinorDigits: displayMoney.minorDigits,
      eventKind: "waiver_offset",
      confirmed: true,
      actorUserId: user._id,
      reason: args.reason,
      createdAt: now,
    });

    await appendActivityEvent(ctx, {
      groupId: obligation.groupId,
      tabId: obligation.tabId,
      actorUserId: user._id,
      type: ACTIVITY_EVENT_TYPE.WAIVER,
      payload: {
        summary: "Obligation waived",
        amountMinor: displayMoney.amountMinor.toString(),
        currency: displayMoney.currency,
        amountLabel: `${formatCurrencyMinorBigInt(
          displayMoney.amountMinor,
          displayMoney.currency,
        )} waived`,
        tabId: obligation.tabId,
        billId: billIdForObligation(obligation),
        detail: args.reason,
      },
    });

    await completeOffsetObligation(ctx, obligation, now);

    return { ok: true as const, replayed: false as const, waiverId };
  },
});
