/**
 * Bot commands: `/tab`, `/splitbill`, `/tip`, `/balance`.
 *
 * The webhook mutation does not run commands. It records the update and
 * schedules this action, for two reasons that are really one reason:
 *
 * - the ingress must return before slow work (Story 2.1 AC3), and
 * - membership and bot-admin status must be **proven** before a privileged
 *   action when the cached check is older than five minutes (binding decision
 *   2) — and proving them means calling `getChatMember`, which a mutation
 *   cannot do.
 *
 * So the action refreshes what has gone stale, then calls one mutation that
 * re-checks the now-fresh cache inside the same transaction that writes.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { sendMessage } from "../../lib/telegram/api";
import {
  BOT_COMMANDS,
  TabCommandError,
  repairMessageForFailure,
  routeBotCommand,
  type BotCommand,
} from "../lib/tabCommandSync";
import { readMembershipSnapshot } from "../lib/telegramMembership";
import { getTelegramBotToken, isTelegramFixtureMode } from "../lib/telegramVerify";
import { getTelegramBotId } from "../lib/telegramWebhook";

const botCommandValidator = v.union(
  ...(BOT_COMMANDS.map((command) => v.literal(command)) as [
    ReturnType<typeof v.literal<BotCommand>>,
    ...ReturnType<typeof v.literal<BotCommand>>[],
  ]),
);

/** Reports which cached trust facts have aged out. */
export const membershipFreshness = internalQuery({
  args: { groupId: v.id("groups"), telegramUserId: v.string() },
  handler: async (ctx, args) => {
    const snapshot = await readMembershipSnapshot(ctx, {
      groupId: args.groupId,
      telegramUserId: args.telegramUserId,
      now: Date.now(),
    });

    if (!snapshot) {
      return { known: false as const };
    }

    return {
      known: true as const,
      chatId: snapshot.chatId,
      needsRefresh: !snapshot.memberFresh || !snapshot.botAdminFresh,
    };
  },
});

/** Runs one command transactionally against the freshly proven cache. */
export const executeCommand = internalMutation({
  args: {
    command: botCommandValidator,
    groupId: v.id("groups"),
    chatId: v.string(),
    fromId: v.string(),
    chatTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const result = await routeBotCommand(ctx, {
        command: args.command,
        groupId: args.groupId,
        chatId: args.chatId,
        fromId: args.fromId,
        chatTitle: args.chatTitle,
      });
      return { ok: true as const, handled: result.handled };
    } catch (error) {
      if (error instanceof TabCommandError) {
        return {
          ok: false as const,
          code: error.code,
          replyText: repairMessageForFailure(error.code),
        };
      }
      throw error;
    }
  },
});

export type RunCommandOutcome =
  | { handled: true }
  | { handled: false; code: string };

/**
 * The command entry point.
 *
 * Idempotent by inheritance: the webhook already deduplicates by
 * `(botId, updateId)`, so this action runs at most once per Telegram update,
 * and everything it calls is idempotent again on its own key.
 */
export const runCommand = internalAction({
  args: {
    command: botCommandValidator,
    groupId: v.id("groups"),
    chatId: v.string(),
    fromId: v.string(),
    chatTitle: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RunCommandOutcome> => {
    const freshness = await ctx.runQuery(
      internal.internal.telegramCommands.membershipFreshness,
      { groupId: args.groupId, telegramUserId: args.fromId },
    );

    if (freshness.known && freshness.needsRefresh) {
      await ctx.runAction(internal.internal.telegramDelivery.refreshMembership, {
        groupId: args.groupId,
        chatId: args.chatId,
        telegramUserId: args.fromId,
        botId: getTelegramBotId(),
      });
    }

    const result = await ctx.runMutation(
      internal.internal.telegramCommands.executeCommand,
      {
        command: args.command,
        groupId: args.groupId,
        chatId: args.chatId,
        fromId: args.fromId,
        ...(args.chatTitle === undefined ? {} : { chatTitle: args.chatTitle }),
      },
    );

    if (result.ok) {
      return { handled: true as const };
    }

    // A repair reply, not a sixth event: it answers the person who typed and
    // is never sent unprompted.
    if (result.replyText && !isTelegramFixtureMode()) {
      await sendMessage(getTelegramBotToken(), {
        chatId: args.chatId,
        text: result.replyText,
        disableNotification: true,
      });
    }

    return { handled: false as const, code: result.code };
  },
});
