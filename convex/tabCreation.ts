import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { getTelegramBotId } from "./lib/telegramWebhook";

/**
 * The group Mini App door. Network proof cannot run in a mutation, so this
 * action refreshes stale member/admin evidence before the transactional write.
 */
export const createChatTab = action({
  args: {
    groupId: v.id("groups"),
    name: v.string(),
    merchantName: v.optional(v.string()),
    displayCurrency: v.string(),
    payerUserId: v.id("users"),
    receiveMint: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<{
    tabId: string;
    token: string;
    duplicate: boolean;
  }> => {
    const replay = await ctx.runMutation(internal.tabs.replayChatTabCreationInternal, args);
    if (replay) return replay;
    const context = await ctx.runQuery(internal.tabs.chatTabCreationContext, {
      groupId: args.groupId,
      payerUserId: args.payerUserId,
    });
    for (const proof of context.proofs) {
      if (proof.needsRefresh) {
        await ctx.runAction(internal.internal.telegramDelivery.refreshMembership, {
          groupId: args.groupId,
          chatId: context.chatId,
          telegramUserId: proof.telegramUserId,
          botId: getTelegramBotId(),
        });
      }
    }
    return ctx.runMutation(internal.tabs.createChatTabInternal, args);
  },
});
