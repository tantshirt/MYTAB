/**
 * Bot commands: `/tab`, `/splitbill`, `/balance`.
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
import {
  sendMessage,
  sendPhoto,
  setChatMenuButton,
  setMyCommands,
  type InlineKeyboardMarkup,
} from "../../lib/telegram/api";
import { houseWelcomeUrl } from "../../lib/telegram/tabCard";
import {
  GROUP_BOT_COMMANDS,
  PRIVATE_BOT_COMMANDS,
  menuButtonForMiniApp,
} from "../../lib/telegram/botSurface";
import {
  GROUP_WELCOME_ADMIN,
  GROUP_WELCOME_MEMBER,
  planPrivateReply,
  type PrivateButtonKind,
} from "../../lib/telegram/privateMessages";
import { resolvePrivateButton } from "../../lib/telegram/privateButtons";
import {
  BOT_COMMANDS,
  TabCommandError,
  repairMessageForFailure,
  routeBotCommand,
  type BotCommand,
} from "../lib/tabCommandSync";
import {
  buildTelegramDeepLink,
  buildTelegramMiniAppLink,
  buildTelegramStartGroupUrl,
  getTelegramMiniAppHttpsUrl,
} from "../lib/telegramDeepLink";
import { readMembershipSnapshot } from "../lib/telegramMembership";
import { getTelegramBotToken, isTelegramFixtureMode } from "../lib/telegramVerify";
import { getTelegramBotId } from "../lib/telegramWebhook";
import { hashSessionToken } from "../lib/sessionTokenSync";
import type { Id } from "../_generated/dataModel";

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

export const lookupStartTokenCard = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const presented = args.token.trim();
    if (presented.length === 0) {
      return null;
    }
    const record = await ctx.db
      .query("sessionTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", hashSessionToken(presented)))
      .unique();
    if (!record || record.tokenType !== "tab_session" || record.subjectKind !== "tab") {
      return null;
    }
    if (record.status !== "active" || record.expiresAt <= Date.now()) {
      return null;
    }
    const tab = await ctx.db.get(record.subjectId as Id<"tabs">);
    if (!tab) {
      return null;
    }
    const member = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_telegram_user_id", (q) =>
        q.eq("groupId", tab.groupId).eq("telegramUserId", tab.organizerTelegramUserId),
      )
      .unique();
    return {
      tabName: tab.name,
      organizerDisplayName: member?.displayName ?? "Someone",
    };
  },
});

export const consumePrivateFallback = internalMutation({
  args: { telegramUserId: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("telegramDmRateLimits")
      .withIndex("by_telegram_user_id", (q) => q.eq("telegramUserId", args.telegramUserId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastFallbackAt: args.now });
      return { lastFallbackAt: existing.lastFallbackAt };
    }
    await ctx.db.insert("telegramDmRateLimits", {
      telegramUserId: args.telegramUserId,
      lastFallbackAt: args.now,
    });
    return { lastFallbackAt: null as number | null };
  },
});

function privateKeyboard(buttons: PrivateButtonKind[], openTabToken?: string): InlineKeyboardMarkup {
  const httpsUrl = getTelegramMiniAppHttpsUrl();
  const miniAppLink = buildTelegramMiniAppLink();
  const startGroupUrl = buildTelegramStartGroupUrl();

  return {
    inline_keyboard: buttons.map((kind) => [
      resolvePrivateButton(kind, {
        httpsOrigin: httpsUrl,
        miniAppLink,
        startGroupUrl,
        openTabToken,
        buildDeepLink: buildTelegramDeepLink,
      }),
    ]),
  };
}

/**
 * Answers a private-chat update. Not a sanctioned group event — it replies
 * to the person who typed and then goes quiet (INVITE-FLOW §3.1).
 */
export const runPrivateReply = internalAction({
  args: {
    chatId: v.string(),
    fromId: v.string(),
    command: v.union(v.string(), v.null()),
    commandArg: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args): Promise<{ handled: boolean }> => {
    const now = Date.now();
    let lastFallbackAt: number | null = null;
    if (args.command === null || (args.command !== "start" && args.command !== "tab" && args.command !== "splitbill" && args.command !== "balance" && args.command !== "help")) {
      const consumed = await ctx.runMutation(internal.internal.telegramCommands.consumePrivateFallback, {
        telegramUserId: args.fromId,
        now,
      });
      lastFallbackAt = consumed.lastFallbackAt;
    }

    const startTokenCard =
      args.command === "start" && args.commandArg
        ? await ctx.runQuery(internal.internal.telegramCommands.lookupStartTokenCard, {
            token: args.commandArg,
          })
        : null;

    const plan = planPrivateReply({
      command: args.command,
      commandArg: args.commandArg,
      now,
      lastFallbackAt,
      startTokenCard,
    });

    if (plan.kind === "silent") {
      return { handled: false };
    }

    if (isTelegramFixtureMode()) {
      return { handled: true };
    }

    const openTabToken = args.command === "start" && args.commandArg && startTokenCard
      ? args.commandArg
      : undefined;

    const replyMarkup = privateKeyboard(plan.buttons, openTabToken);

    /*
     * The welcome leads with the house still, and only the welcome does.
     *
     * `plan.photo` is set for a bare `/start` — the one reply that is somebody
     * meeting this product for the first time. Every other private reply stays
     * text, because command replies are task-focused and do not need a hero.
     *
     * Sent by URL, not by a stored `file_id`: this fires once per person, so
     * the reuse machinery D-31 built for the tab card would be a schema row
     * earning nothing. With no HTTPS origin there is no URL, and the reply
     * falls back to the same words as plain text rather than not arriving.
     */
    const photoUrl = plan.photo ? houseWelcomeUrl(getTelegramMiniAppHttpsUrl()) : undefined;

    if (photoUrl) {
      const sent = await sendPhoto(getTelegramBotToken(), {
        chatId: args.chatId,
        photo: photoUrl,
        caption: plan.text,
        replyMarkup,
        disableNotification: true,
      });
      if (sent.ok) {
        return { handled: true };
      }
      // Telegram refused the photo — a bad URL, a fetch it could not complete.
      // The words still have to arrive, so fall through to the text send.
    }

    await sendMessage(getTelegramBotToken(), {
      chatId: args.chatId,
      text: plan.text,
      replyMarkup,
      disableNotification: true,
    });

    return { handled: true };
  },
});

/** One-shot welcome when the bot is added to a group (INVITE-FLOW §3.5). */
export const runGroupWelcome = internalAction({
  args: {
    chatId: v.string(),
    botIsAdmin: v.boolean(),
  },
  handler: async (_ctx, args): Promise<{ handled: boolean }> => {
    if (isTelegramFixtureMode()) {
      return { handled: true };
    }
    await sendMessage(getTelegramBotToken(), {
      chatId: args.chatId,
      text: args.botIsAdmin ? GROUP_WELCOME_ADMIN : GROUP_WELCOME_MEMBER,
      disableNotification: true,
    });
    return { handled: true };
  },
});

/**
 * Registers scoped command menus and the Menu button.
 * Called from `scripts/setup-telegram.mjs` at deploy, and from here so a
 * Convex-held token can re-register without the shell seeing it.
 */
export const registerBotSurface = internalAction({
  args: {},
  handler: async (): Promise<{
    ok: boolean;
    skipped?: boolean;
    privateCommands?: boolean;
    groupCommands?: boolean;
    menuButton?: boolean;
  }> => {
    if (isTelegramFixtureMode()) {
      return { ok: true, skipped: true };
    }
    const token = getTelegramBotToken();
    const privateResult = await setMyCommands(token, {
      commands: PRIVATE_BOT_COMMANDS,
      scope: { type: "all_private_chats" },
    });
    const groupResult = await setMyCommands(token, {
      commands: GROUP_BOT_COMMANDS,
      scope: { type: "all_group_chats" },
    });
    const httpsUrl = getTelegramMiniAppHttpsUrl();
    let menuOk = false;
    if (httpsUrl) {
      const menuResult = await setChatMenuButton(token, {
        menuButton: menuButtonForMiniApp(httpsUrl),
      });
      menuOk = menuResult.ok;
    }
    return {
      ok: privateResult.ok && groupResult.ok && (httpsUrl ? menuOk : true),
      privateCommands: privateResult.ok,
      groupCommands: groupResult.ok,
      menuButton: menuOk,
    };
  },
});

export const paymentReminderForDelivery = internalQuery({
  args: { reminderId: v.id("paymentReminders") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reminderId);
    if (!row) return null;
    if (row.status === "sent" || row.status === "unknown") return { alreadySent: true as const };
    if (row.status !== "queued") return null;
    const obligation = await ctx.db.get(row.obligationId);
    if (!obligation || obligation.status !== "open") {
      return { closed: true as const };
    }
    const debtor = await ctx.db.get(row.recipientUserId);
    const creditor = await ctx.db.get(row.senderUserId);
    const tab = await ctx.db.get(row.tabId);
    if (!debtor || !tab) return null;
    return {
      telegramUserId: debtor.telegramUserId,
      creditorName: creditor?.displayName ?? "Someone",
      tabName: tab.name,
    };
  },
});

const REMINDER_CLAIM_TTL_MS = 60_000;

/** Atomically owns delivery and re-checks every dependency at the send boundary. */
export const claimPaymentReminderDelivery = internalMutation({
  args: {
    reminderId: v.id("paymentReminders"),
    claimId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reminderId);
    if (!row) return null;
    if (row.status === "sent") return { alreadySent: true as const };
    const now = Date.now();
    if (
      row.status === "claimed" &&
      row.claimExpiresAt !== undefined &&
      row.claimExpiresAt > now
    ) {
      return { inFlight: true as const };
    }
    if (row.status !== "queued" && row.status !== "claimed") return null;

    const [obligation, debtor, creditor, tab] = await Promise.all([
      ctx.db.get(row.obligationId),
      ctx.db.get(row.recipientUserId),
      ctx.db.get(row.senderUserId),
      ctx.db.get(row.tabId),
    ]);
    if (!obligation || obligation.status !== "open" || !debtor || !creditor || !tab) {
      await ctx.db.patch(row._id, {
        status: "failed",
        claimId: undefined,
        claimExpiresAt: undefined,
        updatedAt: now,
      });
      return { closed: true as const };
    }

    await ctx.db.patch(row._id, {
      status: "claimed",
      claimId: args.claimId,
      claimExpiresAt: now + REMINDER_CLAIM_TTL_MS,
      updatedAt: now,
    });
    // A worker can disappear after owning the row but before recording the
    // Telegram result. The durable wake-up runs after the ownership fence has
    // expired and either takes over or observes the completed row as a no-op.
    await ctx.scheduler.runAfter(
      REMINDER_CLAIM_TTL_MS + 1,
      internal.internal.telegramCommands.deliverPaymentReminder,
      { reminderId: row._id },
    );
    return {
      telegramUserId: debtor.telegramUserId,
      creditorName: creditor.displayName,
      tabName: tab.name,
    };
  },
});

export const markPaymentReminderDelivery = internalMutation({
  args: {
    reminderId: v.id("paymentReminders"),
    claimId: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("unknown")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reminderId);
    // Delivery workers are replayable. A late failure must never regress a
    // reminder that an earlier attempt already recorded as sent.
    if (row?.status === "claimed" && row.claimId === args.claimId) {
      await ctx.db.patch(row._id, {
        status: args.status,
        claimId: undefined,
        claimExpiresAt: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});

/** Keeps a Telegram-accepted reminder in a no-resend state until persistence recovers. */
export const recoverAcceptedPaymentReminder = internalAction({
  args: {
    reminderId: v.id("paymentReminders"),
    claimId: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.internal.telegramCommands.markPaymentReminderDelivery, {
        reminderId: args.reminderId,
        claimId: args.claimId,
        status: "unknown",
      });
      return { ok: true as const };
    } catch {
      await ctx.scheduler.runAfter(
        Math.min(60_000, 1_000 * 2 ** Math.min(args.attempt, 10)),
        internal.internal.telegramCommands.recoverAcceptedPaymentReminder,
        { ...args, attempt: args.attempt + 1 },
      );
      return { ok: false as const, retrying: true as const };
    }
  },
});

/** Private debt reminder; it never writes or sends to the tab's group chat. */
export const deliverPaymentReminder = internalAction({
  args: { reminderId: v.id("paymentReminders") },
  handler: async (ctx, args) => {
    const claimId = crypto.randomUUID();
    const row = await ctx.runMutation(
      internal.internal.telegramCommands.claimPaymentReminderDelivery,
      { ...args, claimId },
    );
    if (!row) {
      return { ok: false as const };
    }
    if ("alreadySent" in row) return { ok: true as const, replayed: true as const };
    if ("inFlight" in row) return { ok: true as const, replayed: true as const };
    if ("closed" in row) {
      return { ok: false as const };
    }
    if (isTelegramFixtureMode()) {
      await ctx.runMutation(internal.internal.telegramCommands.markPaymentReminderDelivery, {
        reminderId: args.reminderId,
        claimId,
        status: "sent",
      });
      return { ok: true as const };
    }
    let telegramAccepted = false;
    try {
      const result = await sendMessage(getTelegramBotToken(), {
        chatId: row.telegramUserId,
        text: `${row.creditorName} sent a private reminder about ${row.tabName}. Open My Tab to review what you owe.`,
      });
      const status = result.ok
        ? "sent" as const
        : result.kind === "transient" && result.ambiguous === true
          ? "unknown" as const
          : "failed" as const;
      telegramAccepted = result.ok;
      try {
        await ctx.runMutation(internal.internal.telegramCommands.markPaymentReminderDelivery, {
          reminderId: args.reminderId,
          claimId,
          status,
        });
      } catch (error) {
        if (!telegramAccepted) throw error;
        // Telegram accepted the message. Never convert an accounting outage
        // into `failed` (which would permit a duplicate send after cooldown).
        try {
          await ctx.runMutation(internal.internal.telegramCommands.markPaymentReminderDelivery, {
            reminderId: args.reminderId,
            claimId,
            status: "unknown",
          });
        } catch {
          await ctx.scheduler.runAfter(
            0,
            internal.internal.telegramCommands.recoverAcceptedPaymentReminder,
            { reminderId: args.reminderId, claimId, attempt: 1 },
          );
        }
      }
      return { ok: result.ok };
    } catch {
      if (telegramAccepted) {
        return { ok: true as const, persistencePending: true as const };
      }
      await ctx.runMutation(internal.internal.telegramCommands.markPaymentReminderDelivery, {
        reminderId: args.reminderId,
        claimId,
        status: "failed",
      });
      return { ok: false as const };
    }
  },
});
