/**
 * Telegram webhook authentication for the Convex runtime.
 *
 * The `X-Telegram-Bot-Api-Secret-Token` header is the only thing separating a
 * real Telegram update from an attacker-authored one. A published fixture secret
 * would make that header guessable, so it is never substituted for a missing
 * `TELEGRAM_WEBHOOK_SECRET`: `getTelegramWebhookSecret` throws instead, and the
 * webhook route answers 500 rather than accepting forged updates.
 *
 * FIXTURE_TELEGRAM_WEBHOOK_SECRET is deliberately NOT re-exported from this
 * deployed Convex module. Tests import it from `lib/telegram/webhook`.
 */

import {
  FIXTURE_TELEGRAM_WEBHOOK_SECRET,
  extractBotIdFromToken,
  verifyWebhookSecret,
} from "../../lib/telegram/webhook";
import {
  assertFixturePathAllowed,
  fixturePathAllowed,
} from "../../lib/solana/runtimeGuard";
import { getTelegramBotToken } from "./telegramVerify";

export { verifyWebhookSecret };

/**
 * True only when there is no real webhook secret AND a fixture secret is
 * permitted on this runtime. Never true on a deployment.
 */
export function isTelegramWebhookFixtureMode(): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret) {
    return false;
  }
  return fixturePathAllowed();
}

/**
 * The webhook secret.
 *
 * @throws FixtureModeNotPermittedError when TELEGRAM_WEBHOOK_SECRET is unset and
 *   the runtime is not an explicitly opted-in local/test runtime.
 */
export function getTelegramWebhookSecret(): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret) {
    return secret;
  }
  assertFixturePathAllowed("telegram.webhookSecret");
  return FIXTURE_TELEGRAM_WEBHOOK_SECRET;
}

/** Bot id prefix used for webhook idempotency keys. */
export function getTelegramBotId(): string {
  return extractBotIdFromToken(getTelegramBotToken());
}
