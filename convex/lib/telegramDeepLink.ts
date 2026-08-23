/**
 * Telegram Mini App deep links.
 *
 * Every invite My Tab mints is one of these URLs. A wrong bot username here does
 * not fail — it produces a link that *looks* right, opens Telegram, and lands on
 * a bot that does not exist. The person who received it has no way to tell that
 * from a working invite, and neither does the organizer who sent it.
 *
 * So there is no fallback. `TELEGRAM_BOT_USERNAME` and `TELEGRAM_MINIAPP_NAME`
 * are required credentials: absent, minting a link throws a named
 * `LIVE_CREDENTIAL_MISSING` error at the point of minting, which surfaces as a
 * failed request rather than a dead link in a group chat.
 */

import {
  RUNTIME_GUARD_FAILURE,
  RuntimeGuardError,
  requireLiveCredential,
} from "../../lib/solana/runtimeGuard";

const DEEP_LINK_SUBSYSTEM = "telegram.deepLink";

/** Telegram usernames: 5-32 chars, letters/digits/underscore. */
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

/** Mini App short names: 3-30 chars, letters/digits/underscore. */
const MINIAPP_NAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

/**
 * The configured bot username, without `@`.
 *
 * @throws RuntimeGuardError `LIVE_CREDENTIAL_MISSING` when unset or malformed.
 */
export function getTelegramBotUsername(): string {
  const configured = requireLiveCredential(
    DEEP_LINK_SUBSYSTEM,
    "TELEGRAM_BOT_USERNAME",
    process.env.TELEGRAM_BOT_USERNAME,
  );
  const username = configured.startsWith("@") ? configured.slice(1) : configured;
  if (!BOT_USERNAME_PATTERN.test(username)) {
    // A malformed value is the same failure as a missing one: it mints links
    // that resolve to nothing.
    throw new RuntimeGuardError(
      RUNTIME_GUARD_FAILURE.LIVE_CREDENTIAL_MISSING,
      DEEP_LINK_SUBSYSTEM,
      "TELEGRAM_BOT_USERNAME is not a valid Telegram username (5-32 of A-Z a-z 0-9 _)",
    );
  }
  return username;
}

/**
 * The configured Mini App short name (the BotFather "app" short name).
 *
 * @throws RuntimeGuardError `LIVE_CREDENTIAL_MISSING` when unset or malformed.
 */
export function getTelegramMiniAppName(): string {
  const configured = requireLiveCredential(
    DEEP_LINK_SUBSYSTEM,
    "TELEGRAM_MINIAPP_NAME",
    process.env.TELEGRAM_MINIAPP_NAME,
  );
  if (!MINIAPP_NAME_PATTERN.test(configured)) {
    throw new RuntimeGuardError(
      RUNTIME_GUARD_FAILURE.LIVE_CREDENTIAL_MISSING,
      DEEP_LINK_SUBSYSTEM,
      "TELEGRAM_MINIAPP_NAME is not a valid Mini App short name (3-30 of A-Z a-z 0-9 _)",
    );
  }
  return configured;
}

/** Builds a Telegram deep link with only an opaque token (FR-N3). */
export function buildTelegramDeepLink(opaqueToken: string): string {
  const bot = getTelegramBotUsername();
  const miniapp = getTelegramMiniAppName();
  return `https://t.me/${bot}/${miniapp}?startapp=${encodeURIComponent(opaqueToken)}`;
}

/** Mini App open with no start parameter — Menu button, Start a tab, What I owe. */
export function buildTelegramMiniAppLink(): string {
  const bot = getTelegramBotUsername();
  const miniapp = getTelegramMiniAppName();
  return `https://t.me/${bot}/${miniapp}`;
}

/** Telegram's add-to-group URL. The person picks the chat. */
export function buildTelegramStartGroupUrl(): string {
  const bot = getTelegramBotUsername();
  return `https://t.me/${bot}?startgroup=true`;
}

/**
 * HTTPS origin of the Mini App, for `web_app` buttons and `setChatMenuButton`.
 * Absent or non-https is null — callers fall back to a `t.me` URL button.
 */
export function getTelegramMiniAppHttpsUrl(): string | null {
  const raw = process.env.TELEGRAM_MINIAPP_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isTelegramPreviewEnvironment(): boolean {
  const deployment = process.env.CONVEX_DEPLOYMENT?.trim() ?? "";
  if (deployment.startsWith("preview:") || deployment.includes("preview")) {
    return true;
  }
  return process.env.MYTAB_PREVIEW === "1";
}
