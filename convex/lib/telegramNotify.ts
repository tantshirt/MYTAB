import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { formatFiatMinorThb } from "../../lib/domain/format";
import type { FiatMinor } from "../../lib/domain/money";

export type TipConfirmationPayload = {
  tipId: Id<"tips">;
  groupId: Id<"groups">;
  senderDisplayName: string;
  recipientDisplayName: string;
  displayAmountThbMinor: number;
};

/** Builds the warm group tip message — no addresses or links (Story 3.10 AC2–AC3). */
export function formatTipConfirmationMessage(payload: TipConfirmationPayload): string {
  const amount = formatFiatMinorThb(payload.displayAmountThbMinor as FiatMinor);
  return `${payload.senderDisplayName} tipped ${payload.recipientDisplayName} ${amount}`;
}

/**
 * Queues a tip confirmation for Telegram after on-chain confirmation (Story 3.10 AC1).
 * Idempotent on tipId — exactly one outbound row per tip (AC4).
 */
export async function queueTipConfirmationMessage(
  ctx: MutationCtx,
  payload: TipConfirmationPayload,
): Promise<{ queued: boolean; messageId?: Id<"telegramOutboundMessages"> }> {
  const existing = await ctx.db
    .query("telegramOutboundMessages")
    .withIndex("by_tip_id", (q) => q.eq("tipId", payload.tipId))
    .unique();

  if (existing) {
    return { queued: false, messageId: existing._id };
  }

  const messageText = formatTipConfirmationMessage(payload);
  const now = Date.now();

  const messageId = await ctx.db.insert("telegramOutboundMessages", {
    tipId: payload.tipId,
    groupId: payload.groupId,
    kind: "tip_confirmation",
    messageText,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  });

  return { queued: true, messageId };
}

/** Fixture stub — marks queued messages as posted without calling Telegram API. */
export async function deliverQueuedTipConfirmationStub(
  ctx: MutationCtx,
  message: Doc<"telegramOutboundMessages">,
): Promise<{ posted: boolean }> {
  if (message.status === "posted") {
    return { posted: false };
  }

  const now = Date.now();
  await ctx.db.patch(message._id, {
    status: "posted",
    postedAt: now,
    updatedAt: now,
  });

  return { posted: true };
}
