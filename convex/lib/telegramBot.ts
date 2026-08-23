/**
 * The group card, from the domain's point of view.
 *
 * Domain code says *what happened*; it never says what the group should read.
 * The rendering lives in `lib/telegram/messages.ts` and the delivery lives in
 * `convex/internal/telegramDelivery.ts`. This file is the seam, and its job is
 * to refuse anything that is not one of the five sanctioned events.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  TELEGRAM_POSTING_EVENTS,
  UnsanctionedTelegramEventError,
  isPostingEvent,
  type TelegramStatusEvent,
} from "../../lib/telegram/messages";
import { recordTabStatusEvent } from "./telegramStatusManager";

export { TELEGRAM_POSTING_EVENTS };
export type { TelegramStatusEvent };

/** Every event allowed to reach a group. Exactly five, and no sixth. */
export type TelegramPostingEvent = (typeof TELEGRAM_POSTING_EVENTS)[number];

/**
 * Records a card event and asks for delivery.
 *
 * Scheduling is idempotent by construction: the delivery action claims the tab
 * row, and a claim that is already held is a no-op. So callers may fire this
 * from any path that changed the facts without coordinating with each other.
 */
export async function publishTabStatusEvent(
  ctx: MutationCtx,
  input: {
    tabId: Id<"tabs">;
    event: TelegramStatusEvent;
    now?: number;
    initialToken?: string;
  },
): Promise<{ published: boolean; reason?: string }> {
  if (!isPostingEvent(input.event)) {
    throw new UnsanctionedTelegramEventError(input.event);
  }

  const recorded = await recordTabStatusEvent(ctx, {
    tabId: input.tabId,
    event: input.event,
    now: input.now,
    ...(input.initialToken === undefined ? {} : { initialToken: input.initialToken }),
  });

  if (!recorded.recorded) {
    return { published: false, reason: recorded.reason };
  }

  await ctx.scheduler.runAfter(
    0,
    internal.internal.telegramDelivery.runStatusDelivery,
    { tabId: input.tabId },
  );

  return { published: true };
}

/** Publishes the tab-opened card for a freshly started tab (Stories 2.3, 2.4). */
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
  await publishTabStatusEvent(ctx, {
    tabId: input.tabId,
    event: "tab_opened",
    now: input.now,
    initialToken: input.opaqueToken,
  });
}
