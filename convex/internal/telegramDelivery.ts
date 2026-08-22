/**
 * Where My Tab actually talks to Telegram.
 *
 * Everything above this file records intent in a transaction; this file is the
 * only place that turns intent into a message. It runs as Convex actions
 * because mutations cannot reach the network, and it writes nothing directly —
 * every state change goes back through a fenced mutation.
 *
 * The invariant the whole design exists to protect: **a retry never posts
 * twice.** See `convex/lib/telegramStatusManager.ts` for the argument.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import {
  deleteMessage,
  editMessageCaption,
  editMessageText,
  getChatMember,
  sendMessage,
  sendPhoto,
  singleButtonKeyboard,
} from "../../lib/telegram/api";
import { clipTelegramPhotoCaption } from "../../lib/telegram/caption";
import {
  deliverOutboundMessage,
  deliverTabStatus,
  type OutboundDeliveryOutcome,
  type StatusDeliveryOutcome,
  type TelegramPort,
} from "../lib/telegramDeliveryCore";
import { OPEN_TAB_BUTTON_LABEL } from "../../lib/telegram/messages";
import {
  claimStatusDelivery,
  commitStatusDelivery,
  failStatusDelivery,
  reserveStatusReplacement,
} from "../lib/telegramStatusManager";
import {
  claimOutboundMessage,
  commitOutboundPosted,
  failOutboundMessage,
} from "../lib/telegramOutbox";
import { applyBotAdminResult, applyChatMemberResult } from "../lib/telegramMembership";
import { getTelegramBotToken, isTelegramFixtureMode } from "../lib/telegramVerify";

/**
 * Synthetic message ids for the no-token path.
 *
 * Fixture mode is not a fallback for a misconfigured deployment: it exists so
 * the app runs offline in tests and local development. A deployment with a bot
 * token never reaches it.
 */
let fixtureMessageCounter = 100_000;
function nextFixtureMessageId(): number {
  fixtureMessageCounter += 1;
  return fixtureMessageCounter;
}

// ---------------------------------------------------------------------------
// Fenced mutations — the only writes in the delivery path.
// ---------------------------------------------------------------------------

export const claimStatus = internalMutation({
  args: { tabId: v.id("tabs") },
  handler: async (ctx, args) => claimStatusDelivery(ctx, args.tabId),
});

export const reserveReplacement = internalMutation({
  args: { tabId: v.id("tabs"), claimId: v.string() },
  handler: async (ctx, args) =>
    reserveStatusReplacement(ctx, { tabId: args.tabId, claimId: args.claimId }),
});

export const commitStatus = internalMutation({
  args: {
    tabId: v.id("tabs"),
    claimId: v.string(),
    messageId: v.number(),
    deliveredVersion: v.number(),
  },
  handler: async (ctx, args) =>
    commitStatusDelivery(ctx, {
      tabId: args.tabId,
      claimId: args.claimId,
      messageId: args.messageId,
      deliveredVersion: args.deliveredVersion,
    }),
});

export const failStatus = internalMutation({
  args: {
    tabId: v.id("tabs"),
    claimId: v.string(),
    description: v.string(),
    retryDelayMs: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) =>
    failStatusDelivery(ctx, {
      tabId: args.tabId,
      claimId: args.claimId,
      description: args.description,
      retryDelayMs: args.retryDelayMs,
    }),
});

export const claimOutbound = internalMutation({
  args: { messageId: v.id("telegramOutboundMessages") },
  handler: async (ctx, args) => claimOutboundMessage(ctx, args.messageId),
});

export const commitOutbound = internalMutation({
  args: {
    messageId: v.id("telegramOutboundMessages"),
    claimId: v.string(),
    telegramMessageId: v.number(),
  },
  handler: async (ctx, args) =>
    commitOutboundPosted(ctx, {
      messageId: args.messageId,
      claimId: args.claimId,
      telegramMessageId: args.telegramMessageId,
    }),
});

export const failOutbound = internalMutation({
  args: {
    messageId: v.id("telegramOutboundMessages"),
    claimId: v.string(),
    description: v.string(),
    retryDelayMs: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) =>
    failOutboundMessage(ctx, {
      messageId: args.messageId,
      claimId: args.claimId,
      description: args.description,
      retryDelayMs: args.retryDelayMs,
    }),
});

export const recordChatMember = internalMutation({
  args: {
    groupId: v.id("groups"),
    telegramUserId: v.string(),
    status: v.string(),
    isMember: v.optional(v.boolean()),
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    applyChatMemberResult(ctx, {
      groupId: args.groupId,
      telegramUserId: args.telegramUserId,
      status: args.status,
      isMember: args.isMember,
      displayName: args.displayName,
      username: args.username,
      now: Date.now(),
    }),
});

export const recordBotAdmin = internalMutation({
  args: { groupId: v.id("groups"), botIsAdmin: v.boolean() },
  handler: async (ctx, args) => {
    await applyBotAdminResult(ctx, {
      groupId: args.groupId,
      botIsAdmin: args.botIsAdmin,
      now: Date.now(),
    });
    return { ok: true as const };
  },
});

// ---------------------------------------------------------------------------
// Actions — the network half.
//
// These are wiring only. The decision loop lives in
// `convex/lib/telegramDeliveryCore.ts` so it can be driven by a test with a
// stub Telegram instead of being re-implemented by one.
// ---------------------------------------------------------------------------

function telegramPort(botToken: string, buttonLabel: string): TelegramPort {
  return {
    send: (input) => {
      const markup = input.buttonUrl
        ? { replyMarkup: singleButtonKeyboard(buttonLabel, input.buttonUrl) }
        : {};
      if (input.photoFileId) {
        return sendPhoto(botToken, {
          chatId: input.chatId,
          photoFileId: input.photoFileId,
          caption: clipTelegramPhotoCaption(input.text),
          ...markup,
        });
      }
      return sendMessage(botToken, {
        chatId: input.chatId,
        text: input.text,
        ...markup,
      });
    },
    edit: (input) => {
      const markup = input.buttonUrl
        ? { replyMarkup: singleButtonKeyboard(buttonLabel, input.buttonUrl) }
        : {};
      if (input.photoFileId) {
        return editMessageCaption(botToken, {
          chatId: input.chatId,
          messageId: input.messageId,
          caption: clipTelegramPhotoCaption(input.text),
          ...markup,
        });
      }
      return editMessageText(botToken, {
        chatId: input.chatId,
        messageId: input.messageId,
        text: input.text,
        ...markup,
      });
    },
    remove: (input) => deleteMessage(botToken, input),
    fixtureMessageId: nextFixtureMessageId,
  };
}

/**
 * Brings a tab's group card up to date: post it if it has never been posted,
 * edit it otherwise, and recover exactly once if Telegram says it is gone.
 */
export const runStatusDelivery = internalAction({
  args: { tabId: v.id("tabs") },
  handler: async (ctx, args): Promise<StatusDeliveryOutcome> =>
    deliverTabStatus({
      fixture: isTelegramFixtureMode(),
      port: telegramPort(getTelegramBotToken(), OPEN_TAB_BUTTON_LABEL),
      claim: () =>
        ctx.runMutation(internal.internal.telegramDelivery.claimStatus, {
          tabId: args.tabId,
        }),
      reserveReplacement: (claimId) =>
        ctx.runMutation(internal.internal.telegramDelivery.reserveReplacement, {
          tabId: args.tabId,
          claimId,
        }),
      commit: (input) =>
        ctx.runMutation(internal.internal.telegramDelivery.commitStatus, {
          tabId: args.tabId,
          ...input,
        }),
      fail: (input) =>
        ctx.runMutation(internal.internal.telegramDelivery.failStatus, {
          tabId: args.tabId,
          ...input,
        }),
      reschedule: async (delayMs) => {
        await ctx.scheduler.runAfter(
          delayMs,
          internal.internal.telegramDelivery.runStatusDelivery,
          { tabId: args.tabId },
        );
      },
    }),
});

/** Posts one queued one-shot message — today, only the tip confirmation. */
export const runOutboundDelivery = internalAction({
  args: { messageId: v.id("telegramOutboundMessages") },
  handler: async (ctx, args): Promise<OutboundDeliveryOutcome> =>
    deliverOutboundMessage({
      fixture: isTelegramFixtureMode(),
      port: telegramPort(getTelegramBotToken(), OPEN_TAB_BUTTON_LABEL),
      claim: () =>
        ctx.runMutation(internal.internal.telegramDelivery.claimOutbound, {
          messageId: args.messageId,
        }),
      commit: (input) =>
        ctx.runMutation(internal.internal.telegramDelivery.commitOutbound, {
          messageId: args.messageId,
          ...input,
        }),
      fail: (input) =>
        ctx.runMutation(internal.internal.telegramDelivery.failOutbound, {
          messageId: args.messageId,
          ...input,
        }),
      reschedule: async (delayMs) => {
        await ctx.scheduler.runAfter(
          delayMs,
          internal.internal.telegramDelivery.runOutboundDelivery,
          { messageId: args.messageId },
        );
      },
    }),
});

export type RefreshMembershipOutcome =
  | { refreshed: false; reason: string }
  | { refreshed: true; memberOk: boolean; botOk: boolean };

/**
 * Proves membership and bot-administrator status against Telegram.
 *
 * Called before a privileged action whenever the cached check is older than
 * five minutes (binding decision 2).
 */
export const refreshMembership = internalAction({
  args: {
    groupId: v.id("groups"),
    chatId: v.string(),
    telegramUserId: v.string(),
    botId: v.string(),
  },
  handler: async (ctx, args): Promise<RefreshMembershipOutcome> => {
    if (isTelegramFixtureMode()) {
      return { refreshed: false as const, reason: "FIXTURE_MODE" };
    }

    const botToken = getTelegramBotToken();

    const memberResult = await getChatMember(botToken, {
      chatId: args.chatId,
      userId: args.telegramUserId,
    });
    if (memberResult.ok) {
      await ctx.runMutation(internal.internal.telegramDelivery.recordChatMember, {
        groupId: args.groupId,
        telegramUserId: args.telegramUserId,
        status: memberResult.result.status,
        ...(memberResult.result.is_member === undefined
          ? {}
          : { isMember: memberResult.result.is_member }),
      });
    }

    const botResult = await getChatMember(botToken, {
      chatId: args.chatId,
      userId: args.botId,
    });
    if (botResult.ok) {
      await ctx.runMutation(internal.internal.telegramDelivery.recordBotAdmin, {
        groupId: args.groupId,
        botIsAdmin:
          botResult.result.status === "administrator" || botResult.result.status === "creator",
      });
    } else if (botResult.kind === "not_permitted") {
      // Being told we have no rights is itself a proven answer.
      await ctx.runMutation(internal.internal.telegramDelivery.recordBotAdmin, {
        groupId: args.groupId,
        botIsAdmin: false,
      });
    }

    return {
      refreshed: true as const,
      memberOk: memberResult.ok,
      botOk: botResult.ok,
    };
  },
});
