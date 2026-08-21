import {
  FIXTURE_TELEGRAM_WEBHOOK_SECRET,
  extractBotIdFromToken,
  verifyWebhookSecret,
} from "../../lib/telegram/webhook";
import { getTelegramBotToken } from "./telegramVerify";

export { FIXTURE_TELEGRAM_WEBHOOK_SECRET, verifyWebhookSecret };

/** True when Convex has no TELEGRAM_WEBHOOK_SECRET — fixture verifier is active. */
export function isTelegramWebhookFixtureMode(): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return !secret;
}

/** Resolves the webhook secret, falling back to the fixture secret when unset. */
export function getTelegramWebhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || FIXTURE_TELEGRAM_WEBHOOK_SECRET;
}

/** Bot id prefix used for webhook idempotency keys. */
export function getTelegramBotId(): string {
  return extractBotIdFromToken(getTelegramBotToken());
}
