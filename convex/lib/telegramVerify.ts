import {
  FIXTURE_TELEGRAM_BOT_TOKEN,
  verifyInitData,
  type VerifyInitDataResult,
} from "../../lib/telegram/verify";

export { FIXTURE_TELEGRAM_BOT_TOKEN };

/** True when Convex has no TELEGRAM_BOT_TOKEN — fixture verifier is active. */
export function isTelegramFixtureMode(): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return !token;
}

/** Resolves the bot token, falling back to the fixture token when unset. */
export function getTelegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || FIXTURE_TELEGRAM_BOT_TOKEN;
}

/** Validates raw initData with the configured (or fixture) bot token. */
export function verifyTelegramInitData(
  initData: string,
  options?: { nowMs?: number },
): VerifyInitDataResult {
  return verifyInitData(initData, getTelegramBotToken(), options);
}
