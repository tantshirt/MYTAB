import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { renderTabStatusCard } from "../../lib/telegram/messages";
import { deriveTabStatusFacts } from "./telegramStatusManager";
import { publishTabStatusEvent } from "./telegramBot";

export type PaymentProgressPayload = {
  tabId: Id<"tabs">;
  groupId: Id<"groups">;
  settledCount: number;
  totalCount: number;
  billCompleted: boolean;
};

/**
 * Group-fact progress line — counts only (Story 6.8 AC3).
 *
 * The payment-confirmed message says a payment landed. It never says who paid,
 * how much, from where, or with what (NFR-7). That is why this function takes
 * two counts and nothing else: there is no parameter here that could leak.
 */
export function formatPaymentProgressMessage(payload: PaymentProgressPayload): string {
  if (payload.billCompleted) {
    return `All ${payload.totalCount} shares settled.`;
  }
  return `${payload.settledCount} of ${payload.totalCount} shares settled`;
}

/**
 * Moves the tab's one status card forward after a confirmed payment
 * (Story 6.8 AC1, AC4).
 *
 * Never posts: the card already exists and is edited in place. When the last
 * share clears, the same card becomes the bill-completed card — completion is
 * derived here from the counts the settlement path computed, never claimed by
 * a caller.
 */
export async function queuePaymentProgressUpdate(
  ctx: MutationCtx,
  payload: PaymentProgressPayload,
): Promise<{ updated: boolean; messageText: string }> {
  const messageText = formatPaymentProgressMessage(payload);
  const event = payload.billCompleted ? "bill_completed" : "payment_confirmed";

  const published = await publishTabStatusEvent(ctx, {
    tabId: payload.tabId,
    event,
  });

  return { updated: published.published, messageText };
}

/** The exact text the group will read for a tab, right now. Used by tests. */
export async function previewTabStatusCard(
  ctx: MutationCtx,
  tabId: Id<"tabs">,
  event: "tab_opened" | "bill_ready" | "payment_confirmed" | "bill_completed",
): Promise<string | null> {
  const facts = await deriveTabStatusFacts(ctx, tabId, event);
  return facts ? renderTabStatusCard(facts) : null;
}

/** Counts confirmed obligations for a tab — submitted-but-unconfirmed excluded (Story 6.7 AC3). */
export async function countTabSettlementProgress(
  ctx: MutationCtx,
  tabId: Id<"tabs">,
): Promise<{ settledCount: number; totalCount: number; billCompleted: boolean }> {
  const obligations = await ctx.db
    .query("obligations")
    .withIndex("by_tab_id", (q) => q.eq("tabId", tabId))
    .collect();

  const active = obligations.filter((row) => row.status !== "superseded");
  const settledCount = active.filter((row) => row.status === "settled").length;
  const totalCount = active.length;
  const billCompleted = totalCount > 0 && settledCount === totalCount;

  return { settledCount, totalCount, billCompleted };
}

/** Records an activity event for a confirmed obligation settlement. */
export async function emitObligationSettlementActivity(
  ctx: MutationCtx,
  args: {
    groupId: Id<"groups">;
    tabId: Id<"tabs">;
    obligationId: Id<"obligations">;
    intentId: Id<"settlementIntents">;
    transactionSignature: string;
    now: number;
  },
): Promise<void> {
  await ctx.db.insert("activityEvents", {
    groupId: args.groupId,
    tabId: args.tabId,
    type: "obligation_settled",
    payload: {
      obligationId: args.obligationId,
      intentId: args.intentId,
      transactionSignature: args.transactionSignature,
    },
    createdAt: args.now,
  });
}
