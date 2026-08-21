/** Fixture bot username when TELEGRAM_BOT_USERNAME is absent. */
export const FIXTURE_TELEGRAM_BOT_USERNAME = "mytab_fixture_bot";

/** Fixture Mini App short name for deep links. */
export const FIXTURE_TELEGRAM_MINIAPP_NAME = "app";

export function getTelegramBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME?.trim() || FIXTURE_TELEGRAM_BOT_USERNAME;
}

export function getTelegramMiniAppName(): string {
  return process.env.TELEGRAM_MINIAPP_NAME?.trim() || FIXTURE_TELEGRAM_MINIAPP_NAME;
}

/** Builds a Telegram deep link with only an opaque token (FR-N3). */
export function buildTelegramDeepLink(opaqueToken: string): string {
  const bot = getTelegramBotUsername();
  const miniapp = getTelegramMiniAppName();
  return `https://t.me/${bot}/${miniapp}?startapp=${encodeURIComponent(opaqueToken)}`;
}

export function isTelegramPreviewEnvironment(): boolean {
  const deployment = process.env.CONVEX_DEPLOYMENT?.trim() ?? "";
  if (deployment.startsWith("preview:") || deployment.includes("preview")) {
    return true;
  }
  return process.env.MYTAB_PREVIEW === "1";
}
