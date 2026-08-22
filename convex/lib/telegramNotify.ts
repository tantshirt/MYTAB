import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { renderTipConfirmation } from "../../lib/telegram/messages";
import { enqueueOutboundMessage, tipConfirmationDedupeKey } from "./telegramOutbox";

export type TipConfirmationPayload = {
  tipId: Id<"tips">;
  groupId: Id<"groups">;
  senderDisplayName: string;
  recipientDisplayName: string;
  displayAmountThbMinor: number;
};

/**
 * The warm one. Names both people and the amount — the deliberate exception to
 * NFR-7, because that is the social act the tip was for (Story 3.10 AC2–AC3).
 */
export function formatTipConfirmationMessage(payload: TipConfirmationPayload): string {
  return renderTipConfirmation({
    senderDisplayName: payload.senderDisplayName,
    recipientDisplayName: payload.recipientDisplayName,
    displayAmountThbMinor: payload.displayAmountThbMinor,
  });
}

/**
 * Schedules delivery when a scheduler is present.
 *
 * Delivery is always safe to schedule more than once — the claim lease makes a
 * second worker a no-op — so callers do not have to reason about whether
 * someone upstream already asked.
 */
async function scheduleOutboundDelivery(
  ctx: MutationCtx,
  messageId: Id<"telegramOutboundMessages">,
  delayMs = 0,
): Promise<void> {
  await ctx.scheduler.runAfter(
    delayMs,
    internal.internal.telegramDelivery.runOutboundDelivery,
    { messageId },
  );
}

/**
 * Queues a tip confirmation after on-chain confirmation (Story 3.10 AC1).
 *
 * Idempotent on the tip: exactly one row per tip, and therefore exactly one
 * message in the group no matter how many times the settlement path retries
 * (AC4).
 */
export async function queueTipConfirmationMessage(
  ctx: MutationCtx,
  payload: TipConfirmationPayload,
): Promise<{ queued: boolean; messageId?: Id<"telegramOutboundMessages"> }> {
  const messageText = formatTipConfirmationMessage(payload);

  const result = await enqueueOutboundMessage(ctx, {
    dedupeKey: tipConfirmationDedupeKey(payload.tipId),
    kind: "tip_confirmation",
    groupId: payload.groupId,
    tipId: payload.tipId,
    messageText,
  });

  await scheduleOutboundDelivery(ctx, result.messageId);

  return { queued: result.queued, messageId: result.messageId };
}

/**
 * Hands a queued message to the real delivery action.
 *
 * Kept under its original name because the settlement scheduler calls it and
 * that module is owned elsewhere. It no longer marks anything posted — posting
 * requires the network, which a mutation does not have.
 *
 * @deprecated Call {@link queueTipConfirmationMessage}, which schedules
 * delivery itself.
 */
export async function deliverQueuedTipConfirmationStub(
  ctx: MutationCtx,
  message: Doc<"telegramOutboundMessages">,
): Promise<{ posted: boolean }> {
  if (message.status === "posted") {
    return { posted: false };
  }

  await scheduleOutboundDelivery(ctx, message._id);
  return { posted: false };
}
