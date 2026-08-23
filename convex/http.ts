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
import {
  authorizeOperatorReconciliation,
  parseBearerSecret,
  readOperatorReconciliationSecret,
} from "./lib/reconciliation";
import {
  buildWalletUlStartParam,
  readUniversalLinkEncryptionPublicKey,
} from "../lib/wallet/universalLinkParams";

const http = httpRouter();

/**
 * CORS for the two routes a browser actually calls.
 *
 * `POST /telegram/bootstrap` carries `Authorization` and a JSON content type,
 * which makes it a preflighted cross-origin request: the Mini App is served
 * from the Vercel origin and this router answers on `*.convex.site`. Without an
 * OPTIONS route the preflight got "No matching routes found" and the browser
 * refused to send the POST at all — the request never left the device, so
 * nothing reached Convex and nothing could be logged. `useTelegramBootstrap`
 * then counted a failure and retried in silence.
 *
 * That is the whole reason production held zero users: the one call that
 * creates a user row was being blocked client-side, invisibly, forever.
 *
 * Deny by default. The single allowed origin is derived from
 * TELEGRAM_MINIAPP_URL — the origin this deployment already believes it serves
 * — and anything else gets no CORS headers, so the browser blocks it. No
 * wildcard: these routes are authenticated, and `*` would let any page on the
 * internet make credentialed calls against them.
 */
function allowedBrowserOrigin(): string | null {
  const raw = process.env.TELEGRAM_MINIAPP_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Echoes the allowed origin, or nothing at all when the caller is not it. */
function corsHeaders(request: Request): Record<string, string> {
  const allowed = allowedBrowserOrigin();
  if (!allowed || request.headers.get("Origin") !== allowed) {
    return {};
  }
  return { "Access-Control-Allow-Origin": allowed, Vary: "Origin" };
}

/** The preflight answer. 403 rather than headers-with-a-shrug for a stranger. */
function preflightResponse(request: Request, methods: string): Response {
  const allowed = allowedBrowserOrigin();
  if (!allowed || request.headers.get("Origin") !== allowed) {
    return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

http.route({
  path: "/telegram/bootstrap",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => preflightResponse(request, "POST")),
});

http.route({
  path: "/reconciliation",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => preflightResponse(request, "GET")),
});

http.route({
  path: "/telegram/bootstrap",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    /*
     * Every branch below announces itself.
     *
     * This route hands back a `Response` rather than throwing, so Convex logs
     * nothing for a rejection — and the client (`useTelegramBootstrap`)
     * increments a failure counter and retries in silence. Between them, the
     * one call that creates a user could fail forever while the only visible
     * symptom was every mutation refusing with TELEGRAM_CONTEXT_REQUIRED and
     * no clue why. That cost two rounds of guessing.
     *
     * Codes only. Never the initData, never the hash, never the subject.
     */
    const cors = corsHeaders(request);
    const reject = (code: string, status: number): Response => {
      console.warn(`[telegram/bootstrap] rejected: ${code} (${status})`);
      return jsonResponse({ error: code }, status, cors);
    };

    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      return reject("UNAUTHORIZED", 401);
    }

    let body: { initData?: unknown };
    try {
      body = await request.json();
    } catch {
      return reject("INVALID_BODY", 400);
    }

    if (typeof body.initData !== "string" || body.initData.trim().length === 0) {
      return reject("INVALID_INIT_DATA", 400);
    }

    const initData = body.initData.trim();
    const verification = verifyTelegramInitData(initData);
    if (!verification.ok) {
      return reject(verification.code, 400);
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
      return reject(result.code, 409);
    }

    console.log("[telegram/bootstrap] bound identity, context valid");
    return jsonResponse({ ok: true, userId: result.userId }, 200, cors);
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

/**
 * Operator list of open reconciliation incidents (D-30).
 *
 * Gated by `OPERATOR_RECONCILIATION_SECRET` in Convex env. Missing, empty, or
 * wrong secret is the same 403 — a stranger learns nothing. This is not a
 * Mini App money surface.
 */
http.route({
  path: "/reconciliation",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const cors = corsHeaders(request);
    const provided = parseBearerSecret(request.headers.get("Authorization"));
    const configured = readOperatorReconciliationSecret();
    if (!authorizeOperatorReconciliation(provided, configured)) {
      // Still 403 and still leaks nothing (D-30) — the CORS header only lets
      // the operator page read the refusal instead of seeing a network error.
      return new Response(null, { status: 403, headers: cors });
    }

    const incidents = await ctx.runQuery(internal.reconciliation.listIncidentsInternal, {
      status: "open",
    });
    return jsonResponse({ incidents }, 200, cors);
  }),
});

/**
 * Unauthenticated Phantom / Solflare / Backpack HTTPS callback (U-10).
 * Records the raw blob on the challenge row, then the Next.js route 302s
 * to t.me with a short start param. Missing/expired/consumed is 403 with
 * no existence leak. No address is accepted.
 */
http.route({
  path: "/wallet/ul-callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const challengeId = url.searchParams.get("c")?.trim() ?? "";
    const data = url.searchParams.get("data") ?? undefined;
    const nonce = url.searchParams.get("nonce") ?? undefined;
    const encryptionPublicKey =
      readUniversalLinkEncryptionPublicKey(url.searchParams) ?? undefined;
    const errorCode =
      url.searchParams.get("errorCode") ?? url.searchParams.get("errorMessage") ?? undefined;

    const recorded = await ctx.runMutation(internal.internal.walletUl.recordCallback, {
      challengeId,
      data,
      nonce,
      encryptionPublicKey,
      errorCode,
    });

    if (!recorded.ok) {
      return jsonResponse({ error: "REFUSED" }, 403);
    }

    let resumeUrl: string | undefined;
    try {
      resumeUrl = buildTelegramDeepLink(buildWalletUlStartParam(challengeId));
    } catch {
      resumeUrl = undefined;
    }

    if (!resumeUrl) {
      return jsonResponse({ recorded: true });
    }
    return jsonResponse({ resumeUrl });
  }),
});

export default http;
