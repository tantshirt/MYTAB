import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./lib/auth";
import { NOT_TAB_PARTICIPANT } from "./lib/tabAuth";
import {
  DEFAULT_BILL_CURRENCY,
  billIdForObligation,
  confirmedOffsetMinorByObligation,
  obligationDisplayAmountMinor,
  offsetAtomicForObligation,
} from "./lib/balanceDerivation";
import { isTerminalSettlementStatus, type SettlementStatus } from "./lib/settlementState";
import { getDefaultReceivingWalletForUser } from "./lib/walletSync";

type ObligationsCtx = GenericQueryCtx<DataModel>;

export const OBLIGATION_NOT_FOUND = "OBLIGATION_NOT_FOUND";

const obligationStatusValidator = v.union(
  v.literal("open"),
  v.literal("settled"),
  v.literal("superseded"),
);

/**
 * Who may read one obligation.
 *
 * The debtor and the creditor are the two parties to it. Every other tab
 * participant is admitted too, because Bill Review is read-only for everyone on
 * the tab — "Everyone can inspect everyone's share" (EXPERIENCE). Mere group
 * membership is **not** enough: an individual debt is not a group fact (NFR-7),
 * and admitting the whole group would let any member enumerate obligations on
 * tabs they never joined.
 */
async function requireObligationReader(
  ctx: ObligationsCtx,
  obligationId: Id<"obligations">,
): Promise<{ obligation: Doc<"obligations">; user: Doc<"users">; tab: Doc<"tabs"> }> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new AuthError(UNAUTHORIZED);
  }

  const obligation = await ctx.db.get(obligationId);
  if (!obligation) {
    throw new AuthError(OBLIGATION_NOT_FOUND);
  }

  const tab = await ctx.db.get(obligation.tabId);
  if (!tab) {
    throw new AuthError(OBLIGATION_NOT_FOUND);
  }

  const isParty =
    obligation.debtorUserId === user._id || obligation.creditorUserId === user._id;

  if (!isParty) {
    const participant = await ctx.db
      .query("tabParticipants")
      .withIndex("by_tab_and_user", (q) =>
        q.eq("tabId", obligation.tabId).eq("userId", user._id),
      )
      .unique();

    if (!participant) {
      throw new AuthError(NOT_TAB_PARTICIPANT);
    }
  }

  return { obligation, user, tab };
}

/** Confirmed offsets recorded against one obligation, by index. */
async function offsetMinorFor(
  ctx: ObligationsCtx,
  obligation: Doc<"obligations">,
): Promise<bigint> {
  const events = await ctx.db
    .query("obligationLedgerEvents")
    .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
    .collect();

  return confirmedOffsetMinorByObligation(events).get(obligation._id) ?? 0n;
}

async function pendingCashProposalFor(
  ctx: ObligationsCtx,
  obligation: Doc<"obligations">,
): Promise<Doc<"obligationLedgerEvents"> | null> {
  const events = await ctx.db
    .query("obligationLedgerEvents")
    .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
    .collect();
  const displayAmountMinor = obligationDisplayAmountMinor(obligation);
  const displayCurrency = obligation.displayCurrency ?? "THB";
  return events.find(
    (event) =>
      event.eventKind === "cash_proposed" &&
      !event.confirmed &&
      event.amountMinor === displayAmountMinor &&
      (event.displayCurrency ?? "THB") === displayCurrency,
  ) ?? null;
}

async function latestReminderFor(
  ctx: ObligationsCtx,
  obligation: Doc<"obligations">,
): Promise<Doc<"paymentReminders"> | null> {
  const rows = await ctx.db
    .query("paymentReminders")
    .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
    .collect();
  return rows.length === 0
    ? null
    : rows.reduce((latest, row) => row.createdAt > latest.createdAt ? row : latest);
}

function projectObligation(
  obligation: Doc<"obligations">,
  tab: Doc<"tabs">,
  offsetMinor: bigint,
) {
  const displayAmountMinor = obligationDisplayAmountMinor(obligation);
  const remainingMinor = displayAmountMinor - offsetMinor;
  const remainingAtomic =
    obligation.amountAtomic - offsetAtomicForObligation(obligation, offsetMinor);
  const currentRevision = tab.lockedRevision ?? tab.revision ?? 0;

  return {
    _id: obligation._id,
    groupId: obligation.groupId,
    tabId: obligation.tabId,
    tabName: tab.name,
    tabStatus: tab.status,
    tabRevision: obligation.tabRevision,
    billId: billIdForObligation(obligation),
    currency: obligation.displayCurrency ?? tab.defaultCurrency ?? DEFAULT_BILL_CURRENCY,
    debtorUserId: obligation.debtorUserId,
    creditorUserId: obligation.creditorUserId,
    /** The locked bill-currency amount. Never summed with another currency. */
    displayAmountMinor: Number(displayAmountMinor),
    /** The locked USDC target. The canonical unit for anything that nets. */
    amountAtomic: obligation.amountAtomic,
    outputMint: obligation.outputMint,
    remainingMinor: Number(remainingMinor > 0n ? remainingMinor : 0n),
    remainingAtomic: remainingAtomic > 0n ? remainingAtomic : 0n,
    status: obligation.status,
    /** Confirmed money only — a submitted transaction leaves this false. */
    settled:
      obligation.status === "settled" ||
      offsetMinor >= displayAmountMinor,
    settledAt: obligation.settledAt ?? null,
    settlementIntentId: obligation.settlementIntentId ?? null,
    billSnapshotHash: obligation.billSnapshotHash,
    /** The bill moved under this obligation — the sheet must refresh (§ superseded). */
    staleRevision: obligation.tabRevision !== currentRevision,
    createdAt: obligation.createdAt,
    updatedAt: obligation.updatedAt,
  };
}

/**
 * One obligation, for the Payment Sheet (`?settle=<obligationId>`).
 *
 * Returns the amount in both units, the recipient and their wallet readiness,
 * the tab it belongs to, and the current settlement state. It deliberately does
 * **not** quote a swap: the quote lives on the intent and belongs to
 * `settlements` (see the report — `settlements.getObligationQuote`).
 */
export const get = query({
  args: {
    obligationId: v.id("obligations"),
  },
  handler: async (ctx, args) => {
    const { obligation, user, tab } = await requireObligationReader(
      ctx,
      args.obligationId,
    );

    const offsetMinor = await offsetMinorFor(ctx, obligation);
    const creditor = await ctx.db.get(obligation.creditorUserId);
    const debtor = await ctx.db.get(obligation.debtorUserId);
    const creditorWallet = await getDefaultReceivingWalletForUser(
      ctx,
      obligation.creditorUserId,
    );

    const intent = obligation.settlementIntentId
      ? await ctx.db.get(obligation.settlementIntentId)
      : null;

    return {
      ...projectObligation(obligation, tab, offsetMinor),
      viewerUserId: user._id,
      viewerIsDebtor: obligation.debtorUserId === user._id,
      viewerIsCreditor: obligation.creditorUserId === user._id,
      debtorDisplayName: debtor?.displayName ?? "Someone",
      creditorDisplayName: creditor?.displayName ?? "Someone",
      /** Payment is impossible without somewhere to send it — say so, don't hide it. */
      creditorWalletReady: creditorWallet !== null,
      intent:
        intent === null
          ? null
          : {
              _id: intent._id,
              status: intent.status,
              inputMint: intent.inputMint,
              outputMint: intent.outputMint,
              minimumOutputAtomic: intent.minimumOutputAtomic,
              maximumInputAtomic: intent.maximumInputAtomic,
              roundUpAtomic: intent.roundUpAtomic ?? null,
              expiresAt: intent.expiresAt,
              failureCode: intent.failureCode ?? null,
              transactionSignature: intent.transactionSignature ?? null,
              terminal: isTerminalSettlementStatus(intent.status as SettlementStatus),
            },
    };
  },
});

/**
 * The viewer's own obligations — what *they* owe (Tabs home, Activity).
 *
 * Reads through `by_debtor_user_id`, so the row set is the viewer's by
 * construction; group scope only narrows it further. Nothing another person
 * owes is reachable here.
 */
export const listForViewer = query({
  args: {
    groupId: v.optional(v.id("groups")),
    status: v.optional(obligationStatusValidator),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    const obligations = await ctx.db
      .query("obligations")
      .withIndex("by_debtor_user_id", (q) => q.eq("debtorUserId", user._id))
      .collect();

    const rows = [];
    for (const obligation of obligations) {
      if (args.groupId && obligation.groupId !== args.groupId) {
        continue;
      }
      if (args.status !== undefined && obligation.status !== args.status) {
        continue;
      }

      const tab = await ctx.db.get(obligation.tabId);
      if (!tab) {
        continue;
      }

      const offsetMinor = await offsetMinorFor(ctx, obligation);
      const creditor = await ctx.db.get(obligation.creditorUserId);
      const pendingCash = await pendingCashProposalFor(ctx, obligation);

      rows.push({
        ...projectObligation(obligation, tab, offsetMinor),
        creditorDisplayName: creditor?.displayName ?? "Someone",
        pendingCashProposalId: pendingCash?._id ?? null,
        pendingCashProposerUserId: pendingCash?.actorUserId ?? null,
        canAcknowledgeCash: Boolean(pendingCash && pendingCash.actorUserId !== user._id),
      });
    }

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** The reciprocal private view: obligations where the viewer is the creditor. */
export const listOwedToViewer = query({
  args: { status: v.optional(obligationStatusValidator) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const obligations = await ctx.db
      .query("obligations")
      .withIndex("by_creditor_user_id", (q) => q.eq("creditorUserId", user._id))
      .collect();
    const rows = [];
    for (const obligation of obligations) {
      if (args.status && obligation.status !== args.status) continue;
      const tab = await ctx.db.get(obligation.tabId);
      if (!tab) continue;
      const offsetMinor = await offsetMinorFor(ctx, obligation);
      const debtor = await ctx.db.get(obligation.debtorUserId);
      const pendingCash = await pendingCashProposalFor(ctx, obligation);
      const reminder = await latestReminderFor(ctx, obligation);
      rows.push({
        ...projectObligation(obligation, tab, offsetMinor),
        debtorDisplayName: debtor?.displayName ?? "Someone",
        pendingCashProposalId: pendingCash?._id ?? null,
        pendingCashProposerUserId: pendingCash?.actorUserId ?? null,
        canAcknowledgeCash: Boolean(pendingCash && pendingCash.actorUserId !== user._id),
        reminderStatus: reminder?.status ?? null,
      });
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Creditor-only, rate-limited request for one private reminder. */
export const requestPaymentReminder = mutation({
  args: { obligationId: v.id("obligations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new AuthError(UNAUTHORIZED);
    const obligation = await ctx.db.get(args.obligationId);
    if (!obligation) throw new AuthError(OBLIGATION_NOT_FOUND);
    if (obligation.creditorUserId !== user._id) throw new AuthError("REMINDER_NOT_AUTHORIZED");
    if (obligation.status !== "open") throw new AuthError("REMINDER_NOT_OPEN");
    const now = Date.now();
    const prior = await ctx.db
      .query("paymentReminders")
      .withIndex("by_obligation_id", (q) => q.eq("obligationId", obligation._id))
      .collect();
    if (prior.some(
      (row) => row.status !== "failed" && now - (row.updatedAt ?? row.createdAt) < 24 * 60 * 60_000,
    )) {
      throw new AuthError("REMINDER_RATE_LIMITED");
    }
    const senderRows = await ctx.db
      .query("paymentReminders")
      .withIndex("by_sender_and_created", (q) => q.eq("senderUserId", user._id))
      .collect();
    if (senderRows.filter(
      (row) => row.status !== "failed" && now - (row.updatedAt ?? row.createdAt) < 60 * 60_000,
    ).length >= 10) {
      throw new AuthError("REMINDER_RATE_LIMITED");
    }
    const reminderId = await ctx.db.insert("paymentReminders", {
      obligationId: obligation._id,
      tabId: obligation.tabId,
      senderUserId: user._id,
      recipientUserId: obligation.debtorUserId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.internal.telegramCommands.deliverPaymentReminder, {
      reminderId,
    });
    return { reminderId, queued: true as const };
  },
});

/**
 * Every obligation on one tab, plus the viewer's own.
 *
 * This is what the Claim Board hands to the Payment Sheet: it turns a tab id —
 * the only key the deep link carries — into the viewer's `obligationId`.
 * Restricted to tab participants; the settled fraction it reports is the same
 * confirmed-money-only count the tab card shows.
 */
export const forTab = query({
  args: {
    tabId: v.id("tabs"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new AuthError(UNAUTHORIZED);
    }

    const tab = await ctx.db.get(args.tabId);
    if (!tab) {
      return null;
    }

    const participant = await ctx.db
      .query("tabParticipants")
      .withIndex("by_tab_and_user", (q) => q.eq("tabId", args.tabId).eq("userId", user._id))
      .unique();

    if (!participant) {
      throw new AuthError(NOT_TAB_PARTICIPANT);
    }

    const obligations = await ctx.db
      .query("obligations")
      .withIndex("by_tab_id", (q) => q.eq("tabId", args.tabId))
      .collect();

    const active = obligations.filter((o) => o.status !== "superseded");
    const projected = [];

    for (const obligation of active) {
      const offsetMinor = await offsetMinorFor(ctx, obligation);
      projected.push(projectObligation(obligation, tab, offsetMinor));
    }

    const viewerObligation =
      projected.find((row) => row.debtorUserId === user._id) ?? null;

    return {
      tabId: tab._id,
      groupId: tab.groupId,
      viewerUserId: user._id,
      viewerObligationId: viewerObligation?._id ?? null,
      viewerObligation,
      obligations: projected,
      totalCount: projected.length,
      settledCount: projected.filter((row) => row.settled).length,
      complete:
        projected.every((row) => row.settled) &&
        (projected.length > 0 || tab.status === "settled"),
    };
  },
});
