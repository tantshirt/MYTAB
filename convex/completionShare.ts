/**
 * "Share to group", and why it is not a sixth event.
 *
 * EXPERIENCE, *The Telegram Surface*: exactly five events ever post to a group
 * from the bot — tab opened, bill ready to settle, payment confirmed, bill
 * completed, tip confirmed. A sixth is forbidden, and "bill completed" has
 * already posted itself by the time the completion card is on screen.
 *
 * So this file posts nothing. It mints a *prepared inline message* (Bot API
 * 8.0 `savePreparedInlineMessage`) and hands its id back to the Mini App, which
 * passes it to `WebApp.shareMessage`. Telegram then opens its OWN share sheet
 * and the *person* picks the chat. The bot is never the author, never chooses a
 * destination, and never sends anything — which is what keeps the five-event
 * rule intact while still letting someone show off a finished tab.
 *
 * Two things are therefore load-bearing here:
 *
 *   1. **Authorization.** Minting a prepared message is minting a small piece of
 *      the product's voice. The caller must be a participant on that tab
 *      (`requireTabParticipant`) AND the bill must actually be complete
 *      (`computeBillCompletion`, the same arithmetic the completion card
 *      subscribes to). Neither check is skippable, and a stranger holding a tab
 *      id gets nothing.
 *   2. **NFR-7.** The words are `renderCompletionShare`, which is the group's
 *      own `bill_completed` card verbatim: tab name, total, people, share
 *      count. No individual amounts, no names of who paid what, no addresses,
 *      no links.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { computeBillCompletion } from "./balances";
import { AuthError } from "./lib/auth";
import { requireTabParticipant } from "./lib/tabAuth";
import { deriveTabStatusFacts } from "./lib/telegramStatusManager";
import { getTelegramBotToken, isTelegramFixtureMode } from "./lib/telegramVerify";
import { renderCompletionShare } from "../lib/telegram/messages";
import {
  clampInlineResultId,
  savePreparedInlineMessage,
  type InlineQueryResultArticle,
} from "../lib/telegram/api";

/** The bill is not finished, so there is no completion to share. */
export const BILL_NOT_COMPLETE = "BILL_NOT_COMPLETE";
/** The tab exists but its facts could not be derived — treated as not shareable. */
export const SHARE_FACTS_UNAVAILABLE = "SHARE_FACTS_UNAVAILABLE";

export type CompletionShareFacts = {
  /** The one person Telegram will let send this message. */
  telegramUserId: string;
  title: string;
  description: string;
  messageText: string;
  /** Stable per bill — a tab at one locked revision. */
  resultId: string;
};

/**
 * Everything the action needs, gathered under the caller's own identity.
 *
 * Internal because nothing in the client should be able to read it directly;
 * the action reaches it through `ctx.runQuery`, which carries the caller's auth
 * with it, so the two `require*` calls below are the real gate either way.
 */
export const completionShareFacts = internalQuery({
  args: { tabId: v.id("tabs") },
  handler: async (ctx, args): Promise<CompletionShareFacts> => {
    // Gate 1 — a participant on THIS tab, proven from `tabParticipants`, never
    // from anything the client claimed.
    const { tab, user } = await requireTabParticipant(ctx, args.tabId);

    // Gate 2 — the bill is actually finished. Same arithmetic as the card.
    const completion = await computeBillCompletion(ctx, tab);
    if (!completion.complete) {
      throw new AuthError(BILL_NOT_COMPLETE);
    }

    const facts = await deriveTabStatusFacts(ctx, args.tabId, "bill_completed");
    if (!facts) {
      throw new AuthError(SHARE_FACTS_UNAVAILABLE);
    }

    const copy = renderCompletionShare(facts);

    return {
      telegramUserId: user.telegramUserId,
      ...copy,
      // Bot API caps an inline result id at 64 bytes. Keyed on the bill rather
      // than on the moment, so two taps on the same completion describe the
      // same result.
      resultId: clampInlineResultId(`allsquare:${tab._id}:${completion.revision}`),
    };
  },
});

export type PrepareCompletionShareResult =
  | { ok: true; preparedMessageId: string; expiresAt: number }
  /**
   * Sharing is not possible right now — no bot token configured, or Telegram
   * refused. Never an authorization answer: those throw.
   */
  | { ok: false; reason: "UNAVAILABLE" };

/**
 * Mints the prepared message the share sheet will offer.
 *
 * The four `allow_*` flags are the whole reach of what is minted:
 *
 * | flag                  |       | why                                        |
 * |-----------------------|-------|--------------------------------------------|
 * | `allow_group_chats`   | true  | the button says "Share to group"            |
 * | `allow_user_chats`    | true  | telling one friend is the same social act   |
 * | `allow_bot_chats`     | false | no bot is an audience for a finished tab    |
 * | `allow_channel_chats` | false | a tab is a conversation, not a broadcast    |
 */
export const prepareCompletionShare = action({
  args: { tabId: v.id("tabs") },
  handler: async (ctx, args): Promise<PrepareCompletionShareResult> => {
    const facts: CompletionShareFacts = await ctx.runQuery(
      internal.completionShare.completionShareFacts,
      { tabId: args.tabId },
    );

    // No real bot token means no real share sheet. Reported as unavailable so
    // the client simply never offers the button — not as a failure a person
    // has to read.
    if (isTelegramFixtureMode()) {
      return { ok: false, reason: "UNAVAILABLE" };
    }

    const result: InlineQueryResultArticle = {
      type: "article",
      id: facts.resultId,
      title: facts.title,
      description: facts.description,
      input_message_content: {
        message_text: facts.messageText,
        link_preview_options: { is_disabled: true },
      },
    };

    const response = await savePreparedInlineMessage(getTelegramBotToken(), {
      userId: facts.telegramUserId,
      result,
      allowUserChats: true,
      allowBotChats: false,
      allowGroupChats: true,
      allowChannelChats: false,
    });

    if (!response.ok) {
      return { ok: false, reason: "UNAVAILABLE" };
    }

    return {
      ok: true,
      preparedMessageId: response.result.id,
      // Bot API reports Unix seconds; the client only ever compares it, so it
      // is carried up in milliseconds like every other instant in this app.
      expiresAt: response.result.expiration_date * 1_000,
    };
  },
});
