/**
 * The share moment — INVITE-FLOW §5, sibling of `completionShare.ts`.
 *
 * Same shape, same failure semantics: mint a prepared inline message, hand the
 * id to `WebApp.shareMessage`. The bot posts nothing. The Open tab button is a
 * `url` button carrying the one live `tab_session` token (D-24: same token as
 * the QR, no second admission path).
 */

import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { AuthError, UNAUTHORIZED, getCurrentUser } from "./lib/auth";
import { requireBillOrganizer } from "./lib/tabAuth";
import { countParticipants, listLiveTabSessions, mintTabInviteToken } from "./lib/sessionTokenOps";
import { seatsRemaining, tabOrigin } from "./lib/tabOrigin";
import { buildTelegramDeepLink } from "./lib/telegramDeepLink";
import { getTelegramBotToken, isTelegramFixtureMode } from "./lib/telegramVerify";
import { OPEN_TAB_BUTTON_LABEL, renderTabInvite } from "../lib/telegram/messages";
import {
  clampInlineResultId,
  savePreparedInlineMessage,
  singleButtonKeyboard,
  type InlineQueryResultArticle,
} from "../lib/telegram/api";
import { RuntimeGuardError } from "../lib/solana/runtimeGuard";
import type { Doc } from "./_generated/dataModel";

export const SHARE_FACTS_UNAVAILABLE = "SHARE_FACTS_UNAVAILABLE";

export type TabInvitePayload = {
  telegramUserId: string;
  tabId: string;
  tabName: string;
  title: string;
  description: string;
  messageText: string;
  resultId: string;
  token: string;
  deepLinkUrl: string;
  tokenId: string;
  expiresAt: number;
  seatsRemaining: number | null;
  peopleCount: number;
};

async function buildInvitePayload(
  ctx: Parameters<typeof listLiveTabSessions>[0],
  tab: Doc<"tabs">,
  user: Doc<"users">,
  minted: { token: string; expiresAt: number },
): Promise<TabInvitePayload> {
  const live = await listLiveTabSessions(ctx, tab._id, Date.now());
  const people = await countParticipants(ctx, tab._id);
  const copy = renderTabInvite({ tabName: tab.name, organizerName: user.displayName });

  let deepLinkUrl: string;
  try {
    deepLinkUrl = buildTelegramDeepLink(minted.token);
  } catch (error) {
    if (error instanceof RuntimeGuardError) {
      throw new AuthError(SHARE_FACTS_UNAVAILABLE);
    }
    throw error;
  }

  return {
    telegramUserId: user.telegramUserId,
    tabId: tab._id,
    tabName: tab.name,
    ...copy,
    resultId: clampInlineResultId(`invite:${tab._id}`),
    token: minted.token,
    deepLinkUrl,
    tokenId: live[0]?._id ?? "",
    expiresAt: minted.expiresAt,
    seatsRemaining: seatsRemaining(tab, people),
    peopleCount: people,
  };
}

/** Reuse-or-mint the one token, organizer only. Used by the sheet and the share action. */
export const ensureInvite = mutation({
  args: { tabId: v.id("tabs") },
  handler: async (ctx, args): Promise<TabInvitePayload> => {
    const { tab, user } = await requireBillOrganizer(ctx, args.tabId);
    const minted = await mintTabInviteToken(ctx, { tabId: args.tabId, user });
    if (!minted.ok) {
      throw new AuthError(minted.code);
    }
    return buildInvitePayload(ctx, tab, user, minted);
  },
});

export const mintInvitePayload = internalMutation({
  args: { tabId: v.id("tabs") },
  handler: async (ctx, args): Promise<TabInvitePayload> => {
    const { tab, user } = await requireBillOrganizer(ctx, args.tabId);
    const minted = await mintTabInviteToken(ctx, { tabId: args.tabId, user });
    if (!minted.ok) {
      throw new AuthError(minted.code);
    }
    return buildInvitePayload(ctx, tab, user, minted);
  },
});

export type PrepareTabInviteResult =
  | {
      ok: true;
      preparedMessageId: string;
      expiresAt: number;
      deepLinkUrl: string;
      tokenId: string;
      seatsRemaining: number | null;
    }
  | { ok: false; reason: "UNAVAILABLE" };

export const prepareTabInvite = action({
  args: { tabId: v.id("tabs") },
  handler: async (ctx, args): Promise<PrepareTabInviteResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      throw new AuthError(UNAUTHORIZED);
    }

    const facts: TabInvitePayload = await ctx.runMutation(internal.tabInvite.mintInvitePayload, {
      tabId: args.tabId,
    });

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
      reply_markup: singleButtonKeyboard(OPEN_TAB_BUTTON_LABEL, facts.deepLinkUrl),
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
      expiresAt: response.result.expiration_date * 1_000,
      deepLinkUrl: facts.deepLinkUrl,
      tokenId: facts.tokenId,
      seatsRemaining: facts.seatsRemaining,
    };
  },
});

export type LiveInviteRow = {
  tabId: string;
  tokenId: string;
  tabName: string;
  expiresAt: number;
  seatsRemaining: number | null;
  origin: "chat" | "personal";
};

/**
 * U-9 — live links under You. Organizer's own tabs only; enumerated from
 * `tabs.organizerTelegramUserId`, never from a client-supplied list.
 */
export const listOrganizerLiveInvites = query({
  args: {},
  handler: async (ctx): Promise<LiveInviteRow[]> => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    const tabs = await ctx.db
      .query("tabs")
      .withIndex("by_organizer", (q) => q.eq("organizerTelegramUserId", user.telegramUserId))
      .collect();

    const now = Date.now();
    const rows: LiveInviteRow[] = [];

    for (const tab of tabs) {
      if (tab.status === "closed" || tab.status === "settled") {
        continue;
      }
      const live = await listLiveTabSessions(ctx, tab._id, now);
      const token = live[0];
      if (!token) {
        continue;
      }
      const people = await countParticipants(ctx, tab._id);
      rows.push({
        tabId: tab._id,
        tokenId: token._id,
        tabName: tab.name,
        expiresAt: token.expiresAt,
        seatsRemaining: seatsRemaining(tab, people),
        origin: tabOrigin(tab),
      });
    }

    return rows.sort((a, b) => b.expiresAt - a.expiresAt);
  },
});
