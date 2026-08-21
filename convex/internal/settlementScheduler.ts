import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { sweepExpiredIntents } from "../lib/intentExpiry";
import {
  deliverQueuedTipConfirmationStub,
  queueTipConfirmationMessage,
  type TipConfirmationPayload,
} from "../lib/telegramNotify";

/** Cron handler — expires stale quotes on schedule (Story 3.9 AC1–AC2). */
export const expireStaleIntents = internalMutation({
  args: {},
  handler: async (ctx) => {
    return sweepExpiredIntents(ctx);
  },
});

/** Delivers queued tip confirmation messages in fixture mode (Story 3.10 stub). */
export const deliverTipConfirmationStub = internalMutation({
  args: {
    messageId: v.id("telegramOutboundMessages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      return { posted: false as const };
    }
    return deliverQueuedTipConfirmationStub(ctx, message);
  },
});

/** Internal enqueue for confirmed tips — called from applyConfirmedInternal. */
export const enqueueTipConfirmation = internalMutation({
  args: {
    tipId: v.id("tips"),
    groupId: v.id("groups"),
    senderDisplayName: v.string(),
    recipientDisplayName: v.string(),
    displayAmountThbMinor: v.int64(),
  },
  handler: async (ctx, args) => {
    const payload: TipConfirmationPayload = {
      tipId: args.tipId,
      groupId: args.groupId,
      senderDisplayName: args.senderDisplayName,
      recipientDisplayName: args.recipientDisplayName,
      displayAmountThbMinor: Number(args.displayAmountThbMinor),
    };

    const result = await queueTipConfirmationMessage(ctx, payload);

    if (result.messageId) {
      await ctx.scheduler.runAfter(0, internal.internal.settlementScheduler.deliverTipConfirmationStub, {
        messageId: result.messageId,
      });
    }

    return result;
  },
});
