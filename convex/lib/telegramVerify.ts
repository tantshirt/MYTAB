/**
 * Telegram initData verification for the Convex runtime.
 *
 * The bot token IS the verification key: `verifyInitData` accepts any payload
 * whose HMAC matches under the token it is handed. Handing it a fixture token
 * that is published in this repository would let anyone forge initData for any
 * Telegram user id — so the fixture token is never substituted for a missing
 * secret. `getTelegramBotToken` throws unless fixtures are explicitly permitted
 * on a non-deployed runtime.
 *
 * FIXTURE_TELEGRAM_BOT_TOKEN is deliberately NOT re-exported from this deployed
 * Convex module. Tests import it from `lib/telegram/verify`.
 */

import {
  FIXTURE_TELEGRAM_BOT_TOKEN,
  verifyInitData,
  type VerifyInitDataResult,
} from "../../lib/telegram/verify";
import {
  assertFixturePathAllowed,
  fixturePathAllowed,
} from "../../lib/solana/runtimeGuard";

/**
 * True only when there is no real bot token AND a fixture bot token is
 * permitted on this runtime.
 *
 * Call sites branch on this to skip outbound Telegram calls. It must never be
 * true on a deployment: a deployment with no token has to fail loudly, not
 * quietly behave as if Telegram had answered.
 */
export function isTelegramFixtureMode(): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (token) {
    return false;
  }
  return fixturePathAllowed();
}

/**
 * The bot token.
 *
 * @throws FixtureModeNotPermittedError when TELEGRAM_BOT_TOKEN is unset and the
 *   runtime is not an explicitly opted-in local/test runtime.
 */
export function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (token) {
    return token;
  }
  assertFixturePathAllowed("telegram.botToken");
  return FIXTURE_TELEGRAM_BOT_TOKEN;
}

/** Validates raw initData with the configured bot token. */
export function verifyTelegramInitData(
  initData: string,
  options?: { nowMs?: number },
): VerifyInitDataResult {
  return verifyInitData(initData, getTelegramBotToken(), options);
}
