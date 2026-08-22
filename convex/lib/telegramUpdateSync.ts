import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveGroupFromChat } from "./groupSync";
import { normalizeBotCommand } from "./tabCommandSync";

type NormalizedUpdate =
  | {
      kind: "message";
      updateId: number;
      chatId: string;
      chatType: "private" | "group" | "supergroup";
      fromId: string;
      messageId: number;
      command: string | null;
      commandArg: string | null;
      chatTitle?: string;
      fromDisplayName: string;
      fromUsername?: string;
      fromAvatarUrl?: string;
    }
  | {
      kind: "chat_member";
      updateId: number;
      chatId: string;
      userId: string;
      chatTitle?: string;
      displayName: string;
      username?: string;
      avatarUrl?: string;
      role:
        | "creator"
        | "administrator"
        | "member"
        | "restricted"
        | "left"
        | "kicked"
        | "unknown";
      membershipStatus: "active" | "left" | "kicked" | "restricted";
    }
  | {
      kind: "my_chat_member";
      updateId: number;
      chatId: string;
      chatTitle?: string;
      botIsAdmin: boolean;
    }
  | {
      kind: "unsupported";
      updateId: number;
    };

export type ProcessTelegramUpdateResult = {
  ok: true;
  duplicate: boolean;
  outcome: "processed" | "ignored" | "duplicate";
  groupId?: Id<"groups"> | null;
  /** Present when the update carried a supported command that was scheduled. */
  command?: string;
};

/** Deduplicates by bot/update id, then resolves group state for supported updates. */
export async function processTelegramUpdate(
  ctx: MutationCtx,
  botId: string,
  update: NormalizedUpdate,
  now: number = Date.now(),
): Promise<ProcessTelegramUpdateResult> {
  const existing = await ctx.db
    .query("telegramUpdates")
    .withIndex("by_bot_and_update_id", (q) =>
      q.eq("botId", botId).eq("updateId", update.updateId),
    )
    .unique();

  if (existing) {
    return { ok: true, duplicate: true, outcome: "duplicate" };
  }

  const isUnsupported = update.kind === "unsupported";
  const outcome = isUnsupported ? "ignored" : "processed";

  await ctx.db.insert("telegramUpdates", {
    botId,
    updateId: update.updateId,
    processedAt: now,
    outcome,
  });

  if (isUnsupported) {
    return { ok: true, duplicate: false, outcome };
  }

  if (update.kind === "message" && update.chatType === "private") {
    await ctx.scheduler.runAfter(0, internal.internal.telegramCommands.runPrivateReply, {
      chatId: update.chatId,
      fromId: update.fromId,
      command: update.command,
      commandArg: update.commandArg,
    });
    return {
      ok: true,
      duplicate: false,
      outcome,
      command: update.command ?? "dm",
    };
  }

  const groupResult = await resolveGroupFromChat(ctx, update, now);

  if (update.kind === "my_chat_member" && groupResult.groupId) {
    const group = await ctx.db.get(groupResult.groupId);
    if (group && group.botWelcomeSentAt === undefined) {
      await ctx.db.patch(groupResult.groupId, { botWelcomeSentAt: now });
      await ctx.scheduler.runAfter(0, internal.internal.telegramCommands.runGroupWelcome, {
        chatId: update.chatId,
        botIsAdmin: update.botIsAdmin,
      });
    }
    return { ok: true, duplicate: false, outcome, groupId: groupResult.groupId };
  }

  if (update.kind === "message" && groupResult.groupId) {
    const command = normalizeBotCommand(update.command);
    if (command) {
      // Ingress stays an adapter: the command runs in an action so that
      // membership and bot-admin status can be proven against Telegram before
      // anything is written, and so this handler returns immediately
      // (Story 2.1 AC3, binding decision 2).
      await ctx.scheduler.runAfter(0, internal.internal.telegramCommands.runCommand, {
        command,
        groupId: groupResult.groupId,
        chatId: update.chatId,
        fromId: update.fromId,
        ...(update.chatTitle === undefined ? {} : { chatTitle: update.chatTitle }),
      });
      return { ok: true, duplicate: false, outcome, groupId: groupResult.groupId, command };
    }
  }

  return { ok: true, duplicate: false, outcome, groupId: groupResult.groupId };
}
