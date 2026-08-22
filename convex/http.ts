import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  buildDisplayName,
  hashInitData,
  resolveChatIds,
  TELEGRAM_CONTEXT_TTL_MS,
} from "../lib/telegram/verify";
import { verifyTelegramInitData } from "./lib/telegramVerify";
import {
  getTelegramBotId,
  getTelegramWebhookSecret,
  verifyWebhookSecret,
} from "./lib/telegramWebhook";
import { normalizeTelegramUpdate } from "../lib/telegram/webhook";
import { buildTelegramDeepLink } from "./lib/telegramDeepLink";

const http = httpRouter();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

http.route({
  path: "/telegram/bootstrap",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    let body: { initData?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "INVALID_BODY" }, 400);
    }

    if (typeof body.initData !== "string" || body.initData.trim().length === 0) {
      return jsonResponse({ error: "INVALID_INIT_DATA" }, 400);
    }

    const initData = body.initData.trim();
    const verification = verifyTelegramInitData(initData);
    if (!verification.ok) {
      return jsonResponse({ error: verification.code }, 400);
    }

    const { parsed } = verification;
    const { chatId, groupId } = resolveChatIds(parsed.chat);
    const initDataHash = hashInitData(initData);
    const expiresAt = Date.now() + TELEGRAM_CONTEXT_TTL_MS;

    const result = await ctx.runMutation(internal.internal.telegram.bindTelegramIdentity, {
      privyDid: identity.subject,
      telegramUserId: String(parsed.user.id),
      displayName: buildDisplayName(parsed.user),
      username: parsed.user.username,
      avatarUrl: parsed.user.photo_url,
      chatId,
      groupId,
      initDataHash,
      expiresAt,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.code }, 409);
    }

    return jsonResponse({ ok: true, userId: result.userId });
  }),
});

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!verifyWebhookSecret(secretHeader, getTelegramWebhookSecret())) {
      return new Response(null, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }

    const normalized = normalizeTelegramUpdate(body);
    if (!normalized.ok) {
      return new Response(null, { status: 400 });
    }

    await ctx.runMutation(internal.internal.telegram.processUpdate, {
      botId: getTelegramBotId(),
      update: normalized.update,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/**
 * Mints one invite link for a tab — §9.11 B1.
 *
 * What this used to be: any caller holding any Privy session could name any tab
 * id, and `mintDeepLinkToken` would check only that the tab existed and that the
 * `groupId` **the caller also supplied** matched it. Two request arguments
 * agreeing with each other is not an authorization check. It minted a raw
 * `tab_session` for a tab the caller had nothing to do with, and that token
 * opens the tab.
 *
 * What it is now, per §1.4 — "the number of people who can enlarge a tab is
 * exactly one, and it is the person who is owed the money":
 *
 * - the caller is the Privy DID on the verified JWT, never a request field;
 * - the tab, its organizer, and its group are read off stored rows;
 * - the caller must **be** that organizer;
 * - membership is proven live before minting, refreshing `getChatMember` when
 *   the cached check is older than five minutes (binding decision 2);
 * - the `groupId` field in the body is ignored entirely. There is nothing for
 *   the client to say here.
 *
 * Only the hash reaches the database (binding decision 4). The raw token is
 * returned to the organizer and never stored.
 */
http.route({
  path: "/telegram/deep-link",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }
    const privyDid = identity.subject;

    let body: { tabId?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "INVALID_BODY" }, 400);
    }

    if (typeof body.tabId !== "string" || body.tabId.trim().length === 0) {
      return jsonResponse({ error: "INVALID_ARGS" }, 400);
    }
    const tabId = body.tabId.trim();

    const plan = await ctx.runQuery(internal.sessionTokens.inviteMintPlan, {
      tabId,
      privyDid,
    });

    if (plan.kind === "refresh") {
      await ctx.runAction(internal.internal.telegramDelivery.refreshMembership, {
        groupId: plan.groupId,
        chatId: plan.chatId,
        telegramUserId: plan.telegramUserId,
        botId: getTelegramBotId(),
      });
    }

    const result = await ctx.runMutation(internal.sessionTokens.mintInvite, {
      tabId,
      privyDid,
    });

    if (!result.ok) {
      // Refusals are 403, not 404: a caller who is not the organizer learns
      // nothing about whether the tab exists.
      return jsonResponse({ error: result.code }, 403);
    }

    return jsonResponse({
      ok: true,
      token: result.token,
      deepLinkUrl: buildTelegramDeepLink(result.token),
      expiresAt: result.expiresAt,
    });
  }),
});

export default http;
