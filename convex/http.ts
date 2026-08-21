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
import { mintSessionToken } from "./lib/sessionTokenOps";

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
 * Fixture stub for deep-link token generation (Story 1.9).
 * Creates a tab_session token for an existing tab when authenticated.
 */
http.route({
  path: "/telegram/deep-link",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    let body: { tabId?: unknown; groupId?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "INVALID_BODY" }, 400);
    }

    if (typeof body.tabId !== "string" || typeof body.groupId !== "string") {
      return jsonResponse({ error: "INVALID_ARGS" }, 400);
    }

    const result = await ctx.runMutation(internal.internal.sessionTokens.mintDeepLinkToken, {
      tabId: body.tabId,
      groupId: body.groupId,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.code }, 400);
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
