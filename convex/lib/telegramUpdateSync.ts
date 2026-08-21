import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { resolveGroupFromChat } from "./groupSync";
import { normalizeBotCommand, routeBotCommand, TabCommandError } from "./tabCommandSync";

type NormalizedUpdate =
  | {
      kind: "message";
      updateId: number;
      chatId: string;
      fromId: string;
      messageId: number;
      command: string | null;
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

  const groupResult = await resolveGroupFromChat(ctx, update, now);

  if (update.kind === "message" && groupResult.groupId) {
    const command = normalizeBotCommand(update.command);
    if (command) {
      try {
        await routeBotCommand(ctx, {
          command,
          groupId: groupResult.groupId,
          chatId: update.chatId,
          fromId: update.fromId,
          chatTitle: update.chatTitle,
          now,
        });
      } catch (error) {
        if (error instanceof TabCommandError) {
          console.info("[telegram/processUpdate] command rejected", {
            command,
            code: error.code,
            chatId: update.chatId,
            fromId: update.fromId,
          });
        } else {
          throw error;
        }
      }
    }
  }

  return { ok: true, duplicate: false, outcome, groupId: groupResult.groupId };
}
