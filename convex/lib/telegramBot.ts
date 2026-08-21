import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { buildTelegramDeepLink, isTelegramPreviewEnvironment } from "./telegramDeepLink";

export type TelegramBotMessageResult = {
  ok: true;
  messageId: number;
  deepLinkUrl?: string;
};

export type TelegramStatusEvent =
  | "tab_opened"
  | "bill_ready"
  | "payment_confirmed"
  | "bill_completed"
  | "tip_confirmed";

const SANCTIONED_EVENTS = new Set<TelegramStatusEvent>([
  "tab_opened",
  "bill_ready",
  "payment_confirmed",
  "bill_completed",
  "tip_confirmed",
]);

let fixtureMessageCounter = 1000;

function nextFixtureMessageId(): number {
  fixtureMessageCounter += 1;
  return fixtureMessageCounter;
}

/** Fixture stub — posts or skips Telegram messages based on preview guard (Story 2.4 AC5). */
export async function postTelegramStatusMessage(
  _ctx: MutationCtx,
  input: {
    chatId: string;
    tabName: string;
    event: TelegramStatusEvent;
    opaqueToken: string;
    participantCount?: number;
  },
): Promise<TelegramBotMessageResult> {
  if (!SANCTIONED_EVENTS.has(input.event)) {
    throw new Error("UNSUPPORTED_TELEGRAM_EVENT");
  }

  if (isTelegramPreviewEnvironment()) {
    return { ok: true, messageId: nextFixtureMessageId() };
  }

  const deepLinkUrl = buildTelegramDeepLink(input.opaqueToken);
  console.info("[telegram/bot] post status message", {
    chatId: input.chatId,
    event: input.event,
    tabName: input.tabName,
    buttonLabel: "Open tab",
    deepLinkUrl,
    participantCount: input.participantCount ?? 1,
  });

  return {
    ok: true,
    messageId: nextFixtureMessageId(),
    deepLinkUrl,
  };
}

/** Edits an existing status message in place (Story 2.4 AC1). */
export async function editTelegramStatusMessage(
  _ctx: MutationCtx,
  input: {
    chatId: string;
    messageId: number;
    tabName: string;
    event: TelegramStatusEvent;
    opaqueToken: string;
    participantCount?: number;
  },
): Promise<TelegramBotMessageResult> {
  if (isTelegramPreviewEnvironment()) {
    return { ok: true, messageId: input.messageId };
  }

  console.info("[telegram/bot] edit status message", {
    chatId: input.chatId,
    messageId: input.messageId,
    event: input.event,
    tabName: input.tabName,
    participantCount: input.participantCount,
  });

  return { ok: true, messageId: input.messageId };
}

/** Stores or replaces the canonical status message id for a tab. */
export async function upsertTelegramStatusMessageRecord(
  ctx: MutationCtx,
  input: {
    tabId: Id<"tabs">;
    chatId: string;
    messageId: number;
    eventVersion: number;
    now: number;
  },
): Promise<Id<"telegramStatusMessages">> {
  const existing = await ctx.db
    .query("telegramStatusMessages")
    .withIndex("by_tab_id", (q) => q.eq("tabId", input.tabId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      chatId: input.chatId,
      messageId: input.messageId,
      eventVersion: input.eventVersion,
      lastEditedAt: input.now,
    });
    return existing._id;
  }

  return ctx.db.insert("telegramStatusMessages", {
    tabId: input.tabId,
    chatId: input.chatId,
    messageId: input.messageId,
    eventVersion: input.eventVersion,
    lastEditedAt: input.now,
  });
}

/** Publishes tab-opened card and records the status message (Stories 2.3, 2.4). */
export async function publishTabOpenedCard(
  ctx: MutationCtx,
  input: {
    tabId: Id<"tabs">;
    chatId: string;
    tabName: string;
    opaqueToken: string;
    now: number;
  },
): Promise<void> {
  const post = await postTelegramStatusMessage(ctx, {
    chatId: input.chatId,
    tabName: input.tabName,
    event: "tab_opened",
    opaqueToken: input.opaqueToken,
    participantCount: 1,
  });

  await upsertTelegramStatusMessageRecord(ctx, {
    tabId: input.tabId,
    chatId: input.chatId,
    messageId: post.messageId,
    eventVersion: 1,
    now: input.now,
  });
}
