import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type PaymentProgressPayload = {
  tabId: Id<"tabs">;
  groupId: Id<"groups">;
  settledCount: number;
  totalCount: number;
  billCompleted: boolean;
};

/** Group-fact status message — no individual amounts or payer identity (Story 6.8 AC3). */
export function formatPaymentProgressMessage(payload: PaymentProgressPayload): string {
  if (payload.billCompleted) {
    return "This bill is all settled. Nice work, everyone.";
  }
  return `${payload.settledCount} of ${payload.totalCount} shares settled`;
}

/**
 * Updates the tab status message with settlement progress (Story 6.8 AC1).
 * Edits the existing message rather than posting a new one.
 */
export async function queuePaymentProgressUpdate(
  ctx: MutationCtx,
  payload: PaymentProgressPayload,
): Promise<{ updated: boolean; messageText: string }> {
  const statusMessage = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", payload.tabId))
    .unique();

  const messageText = formatPaymentProgressMessage(payload);
  const now = Date.now();

  if (!statusMessage) {
    return { updated: false, messageText };
  }

  await ctx.db.patch(statusMessage._id, {
    settledObligationCount: payload.settledCount,
    totalObligationCount: payload.totalCount,
    eventVersion: statusMessage.eventVersion + 1,
    lastEditedAt: now,
  });

  return { updated: true, messageText };
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
